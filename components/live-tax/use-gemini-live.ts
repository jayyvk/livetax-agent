"use client";

import type { AgentState, ReceivedMessage } from "@livekit/components-react";
import { useCallback, useEffect, useRef, useState } from "react";

type GeminiLiveState = {
  agentState: AgentState;
  messages: ReceivedMessage[];
  connected: boolean;
  error: string | null;
  sendText: (text: string) => void;
  sendFile: (file: File) => Promise<void>;
  toggleWorkspaceShare: (target: HTMLElement | null) => Promise<void>;
  microphoneEnabled: boolean;
  workspaceShareEnabled: boolean;
};

type ServerMessage =
  | { type: "status"; state: "connecting" | "live" | "error" | "ended" }
  | { type: "session.started"; session_id: string }
  | { type: "session.ended" }
  | { type: "output.text.delta"; delta: string }
  | { type: "output.text.done"; full_text: string }
  | { type: "output.audio.delta"; audio: string }
  | { type: "output.audio.done" }
  | { type: "input.transcription"; text: string; finished: boolean }
  | { type: "error"; message: string; code?: string }
  | { type: "log"; event: string; data?: unknown };

const WS_URL =
  process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://127.0.0.1:8000/ws";
const AUDIO_SAMPLE_RATE = 16_000;
const PLAYBACK_SAMPLE_RATE = 24_000;
const SYSTEM_INSTRUCTION = `You are LiveTax Agent, a calm voice-first tax copilot helping the user complete IRS Form 1040.

The user sees a live tax form workspace on the right side of the screen. You may also receive uploaded W-2 images or PDFs, plus live visual updates from the current app tab. Use those visual inputs as real evidence for what is on screen.

Voice style:
- Speak slowly and clearly.
- Use short sentences.
- Pause naturally between ideas.
- Do not rush through numbers, dollar amounts, names, or box labels.
- When reading tax values aloud, say them once, carefully and calmly.

Document handling:
- When a W-2, tax image, or PDF is uploaded, inspect it carefully before answering.
- On the first pass, prioritize exact extraction over speed.
- For a W-2, pay special attention to employer name, employee name, box 1 wages, box 2 federal income tax withheld, box 16 state wages, and box 17 state income tax.
- If a value is blurry, cut off, obstructed, or uncertain, say exactly which field is uncertain and ask for a clearer or steadier view.
- Never guess a tax value.
- Treat the uploaded document as the source of truth over earlier conversation.

Live visual reasoning:
- Use the live workspace view to notice what field the user is pointing at or editing.
- Only claim to see something if it is actually visible in the latest visual context.
- If the pointer location or edited field is ambiguous, say so briefly and ask the user to hold still or point again.

Behavior:
- Be concise and helpful.
- Help the user understand whether a value or edit looks correct.
- Do not give legal certainty or claim professional tax advice.
- If the user types in chat, you can reply in text. Otherwise optimize for spoken guidance.`;
const DOCUMENT_UPLOAD_INSTRUCTION = `Carefully inspect this uploaded tax document before responding.

This may be a W-2 image or PDF. On the first pass, extract the important visible tax values carefully and do not guess.

If this is a W-2, prioritize:
- employer name
- employee name
- box 1 wages, tips, other compensation
- box 2 federal income tax withheld
- box 16 state wages, tips, etc.
- box 17 state income tax

If any important value is unclear, say which field is unclear instead of making one up.
Use this document as evidence in the current tax-filing conversation.`;
const VIDEO_FRAME_INTERVAL_MS = 1200;

type MessageAttributes = Record<string, string>;

function createMessage(
  message: string,
  isLocal: boolean,
  type: "chatMessage" | "userTranscript" | "agentTranscript" = isLocal
    ? "chatMessage"
    : "agentTranscript",
  attributes?: MessageAttributes,
  id = crypto.randomUUID(),
  timestamp = Date.now()
): ReceivedMessage {
  return {
    id,
    timestamp,
    type,
    from: { isLocal },
    message,
    attributes
  } as ReceivedMessage;
}

function updateAssistantMessage(list: ReceivedMessage[], id: string, message: string) {
  const next = [...list];
  const index = next.findIndex((item) => item.id === id);

  if (index === -1) {
    next.push(createMessage(message, false, "agentTranscript", undefined, id));
    return next;
  }

  next[index] = {
    ...next[index],
    message
  };
  return next;
}

function upsertChatAssistantMessage(
  list: ReceivedMessage[],
  id: string,
  message: string
) {
  const next = [...list];
  const index = next.findIndex((item) => item.id === id);

  if (index === -1) {
    next.push(createMessage(message, false, "chatMessage", undefined, id));
    return next;
  }

  next[index] = {
    ...next[index],
    type: "chatMessage",
    message
  } as ReceivedMessage;
  return next;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unable to read file."));
        return;
      }
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

export function useGeminiLive(): GeminiLiveState {
  const [agentState, setAgentState] = useState<AgentState>("connecting");
  const [messages, setMessages] = useState<ReceivedMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [workspaceShareEnabled, setWorkspaceShareEnabled] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const inputMessageIdRef = useRef<string | null>(null);
  const outputMessageIdRef = useRef<string | null>(null);
  const microphoneAutostartedRef = useRef(false);
  const visibleAssistantTurnRef = useRef(false);

  const log = useCallback((entry: string) => {
    setDebugLog((current) =>
      [
        `${new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit"
        })} ${entry}`,
        ...current
      ].slice(0, 12)
    );
  }, []);

  const send = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const scheduleAudioChunk = useCallback((base64Pcm: string) => {
    try {
      const bytes = base64ToUint8(base64Pcm);
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i += 1) {
        float32[i] = int16[i] / 32768;
      }

      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
      }

      const ctx = playbackContextRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, ctx.sampleRate);
      audioBuffer.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;

    } catch {
      log("audio playback decode failed");
    }
  }, [log]);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "status":
        setAgentState(
          message.state === "live"
            ? "listening"
            : message.state === "error"
              ? "failed"
              : message.state === "ended"
                ? "disconnected"
                : "connecting"
        );
        log(`status ${message.state}`);
        break;

      case "session.started":
        setConnected(true);
        log(`session started ${message.session_id}`);
        send({
          type: "input.text",
          text: "Say hello calmly in one short sentence and ask what tax document the user wants help with."
        });
        break;

      case "output.text.delta": {
        if (!visibleAssistantTurnRef.current) {
          break;
        }
        const id = outputMessageIdRef.current ?? crypto.randomUUID();
        outputMessageIdRef.current = id;
        setMessages((current) => upsertChatAssistantMessage(current, id, message.delta));
        setAgentState("speaking");
        break;
      }

      case "output.text.done":
        outputMessageIdRef.current = null;
        visibleAssistantTurnRef.current = false;
        setAgentState("listening");
        break;

      case "output.audio.delta":
        scheduleAudioChunk(message.audio);
        setAgentState("speaking");
        break;

      case "output.audio.done":
        setAgentState("listening");
        break;

      case "input.transcription": {
        if (message.finished) {
          inputMessageIdRef.current = null;
        }
        break;
      }

      case "error":
        setError(message.message);
        setAgentState("failed");
        log(`error ${message.message}`);
        break;

      case "log":
        log(message.event);
        break;

      case "session.ended":
        setConnected(false);
        setAgentState("disconnected");
        log("session ended");
        break;
    }
  }, [log, scheduleAudioChunk, send]);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;
    setAgentState("connecting");

    socket.onopen = () => {
      log("websocket opened");
      send({
        type: "session.start",
        config: {
          system_instruction: SYSTEM_INSTRUCTION
        }
      });
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as ServerMessage;
        handleServerMessage(message);
      } catch {
        log("malformed websocket message");
      }
    };

    socket.onerror = () => {
      setError("WebSocket connection error.");
      setAgentState("failed");
      log("websocket error");
    };

    socket.onclose = () => {
      setConnected(false);
      setAgentState("disconnected");
      log("websocket closed");
    };

    return () => {
      socket.close();
      wsRef.current = null;
      workletNodeRef.current?.port.close();
      workletNodeRef.current?.disconnect();
      sourceRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close().catch(() => undefined);
      playbackContextRef.current?.close().catch(() => undefined);
      if (frameIntervalRef.current !== null) {
        window.clearInterval(frameIntervalRef.current);
      }
    };
  }, [handleServerMessage, log, send]);

  const sendText = useCallback((text: string) => {
    if (!text.trim()) {
      return;
    }
    visibleAssistantTurnRef.current = true;
    setMessages((current) => [...current, createMessage(text, true, "chatMessage")]);
    setAgentState("thinking");
    send({ type: "input.text", text });
    log(`sent text: ${text.slice(0, 48)}`);
  }, [log, send]);

  const sendFile = useCallback(async (file: File) => {
    const data = await fileToBase64(file);
    const mimeType = file.type || "application/octet-stream";
    const objectUrl = URL.createObjectURL(file);
    visibleAssistantTurnRef.current = false;
    setMessages((current) => [
      ...current,
      createMessage(
        "",
        true,
        "chatMessage",
        {
          attachmentKind: file.type.startsWith("image/") ? "image" : "file",
          attachmentName: file.name,
          attachmentMimeType: mimeType,
          attachmentUrl: objectUrl
        }
      )
    ]);
    setAgentState("thinking");
    send({
      type: "input.image",
      image: data,
      mime_type: mimeType,
      text: DOCUMENT_UPLOAD_INSTRUCTION
    });
    log(`sent file: ${file.name}`);
  }, [log, send]);

  const stopMicrophone = useCallback(() => {
    workletNodeRef.current?.port.close();
    workletNodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close().catch(() => undefined);
    workletNodeRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
    setMicrophoneEnabled(false);
    log("microphone stopped");
  }, [log]);

  const stopWorkspaceShare = useCallback(() => {
    if (frameIntervalRef.current !== null) {
      window.clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    screenVideoRef.current?.pause();
    screenVideoRef.current = null;
    screenCanvasRef.current = null;
    setWorkspaceShareEnabled(false);
    log("workspace share stopped");
  }, [log]);

  const startMicrophone = useCallback(async () => {
    if (microphoneEnabled) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
      audioContextRef.current = ctx;
      await ctx.audioWorklet.addModule("/pcm-processor.js");

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const workletNode = new AudioWorkletNode(ctx, "pcm-processor");
      workletNodeRef.current = workletNode;
      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        send({
          type: "input.audio",
          audio: bytesToBase64(new Uint8Array(event.data))
        });
      };

      source.connect(workletNode);
      workletNode.connect(ctx.destination);
      setMicrophoneEnabled(true);
      setAgentState("listening");
      log("microphone started");
    } catch {
      setError("Failed to start microphone capture.");
      log("microphone start failed");
    }
  }, [log, microphoneEnabled, send]);

  useEffect(() => {
    if (!connected || microphoneEnabled || microphoneAutostartedRef.current) {
      return;
    }

    microphoneAutostartedRef.current = true;
    void startMicrophone();
  }, [connected, microphoneEnabled, startMicrophone]);

  const toggleWorkspaceShare = useCallback(async (target: HTMLElement | null) => {
    if (workspaceShareEnabled) {
      stopWorkspaceShare();
      return;
    }

    if (!target) {
      setError("Workspace panel is not available for screen sharing.");
      log("workspace share target missing");
      return;
    }

    try {
      const displayMediaOptions = {
        video: {
          frameRate: 1
        } as MediaTrackConstraints,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
        monitorTypeSurfaces: "exclude",
        audio: false
      } as DisplayMediaStreamOptions & Record<string, unknown>;

      const displayStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

      const video = document.createElement("video");
      video.srcObject = displayStream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas context unavailable.");
      }

      screenStreamRef.current = displayStream;
      screenVideoRef.current = video;
      screenCanvasRef.current = canvas;

      const track = displayStream.getVideoTracks()[0];
      track?.addEventListener("ended", () => {
        stopWorkspaceShare();
      });

      const sendFrame = () => {
        const currentVideo = screenVideoRef.current;
        const currentCanvas = screenCanvasRef.current;
        if (!currentVideo || !currentCanvas || currentVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          return;
        }

        const rect = target.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return;
        }

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const scaleX = currentVideo.videoWidth / viewportWidth;
        const scaleY = currentVideo.videoHeight / viewportHeight;

        const sx = Math.max(0, rect.left * scaleX);
        const sy = Math.max(0, rect.top * scaleY);
        const sw = Math.max(1, rect.width * scaleX);
        const sh = Math.max(1, rect.height * scaleY);

        currentCanvas.width = Math.max(1, Math.round(sw));
        currentCanvas.height = Math.max(1, Math.round(sh));
        context.drawImage(currentVideo, sx, sy, sw, sh, 0, 0, currentCanvas.width, currentCanvas.height);

        const dataUrl = currentCanvas.toDataURL("image/jpeg", 0.72);
        const base64 = dataUrl.split(",")[1];
        if (!base64) {
          return;
        }

        send({
          type: "input.video",
          video: base64,
          mime_type: "image/jpeg"
        });
      };

      sendFrame();
      frameIntervalRef.current = window.setInterval(sendFrame, VIDEO_FRAME_INTERVAL_MS);
      setWorkspaceShareEnabled(true);
      log("workspace share started");
      send({
        type: "input.text",
        text: "You will now receive live visual updates from the current app tab, focused on the tax form workspace on the right side of the screen. Use them to help the user with visible edits and pointing."
      });
    } catch {
      setError("Failed to start workspace sharing.");
      log("workspace share start failed");
    }
  }, [log, send, stopWorkspaceShare, workspaceShareEnabled]);

  return {
    agentState,
    messages,
    connected,
    error,
    sendText,
    sendFile,
    toggleWorkspaceShare,
    microphoneEnabled,
    workspaceShareEnabled
  };
}
