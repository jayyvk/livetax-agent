"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { AgentAudioVisualizerAura } from "@/components/agents-ui/agent-audio-visualizer-aura";
import { AgentChatTranscript } from "@/components/agents-ui/agent-chat-transcript";
import { useGeminiLive } from "@/components/live-tax/use-gemini-live";
import { cn } from "@/lib/utils";

export function LiveTaxWorkspace({ wsUrl }: { wsUrl: string }) {
  const [composerValue, setComposerValue] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const {
    agentState,
    connected,
    error,
    messages,
    sendText,
    sendFile,
    microphoneEnabled,
    toggleWorkspaceShare,
    workspaceShareEnabled
  } = useGeminiLive(wsUrl);

  const handleSend = (event: FormEvent) => {
    event.preventDefault();
    const text = composerValue.trim();
    if (!text) {
      return;
    }
    setComposerValue("");
    sendText(text);
  };

  return (
    <main className="grid h-screen grid-cols-[minmax(360px,0.84fr)_minmax(560px,1.16fr)] gap-4 overflow-hidden p-4 max-[1100px]:grid-cols-1 max-[1100px]:grid-rows-[minmax(360px,0.92fr)_minmax(0,1.08fr)]">
      <section className="flex min-h-0 flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] uppercase tracking-[0.28em] text-black/58">
            LiveTax Agent
          </span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.28em] text-black/38">
              <span
                className={cn(
                  "size-1 rounded-full",
                  error ? "bg-red-400" : connected ? "bg-emerald-400" : "bg-sky-400"
                )}
              />
              {error ? "offline" : microphoneEnabled ? "live" : connected ? "ready" : "connecting"}
            </span>
            <button
              type="button"
              onClick={() => void toggleWorkspaceShare(workspaceRef.current)}
              className={cn(
                "inline-flex items-center rounded-sm border border-black/7 px-1 py-px text-[8px] uppercase tracking-[0.16em] transition-colors",
                workspaceShareEnabled
                  ? "bg-sky-50/80 text-sky-700"
                  : "bg-white/35 text-black/34 hover:text-black/52"
              )}
              aria-label={workspaceShareEnabled ? "Stop sharing current tab" : "Share current tab"}
            >
              {workspaceShareEnabled ? "tab shared" : "share tab"}
            </button>
          </div>
        </div>
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 pt-1">
          <AgentAudioVisualizerAura
            size="lg"
            color="#1FD5F9"
            colorShift={0.3}
            state={agentState}
            themeMode="light"
            className="aspect-square h-auto w-full max-w-[280px]"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <AgentChatTranscript
            agentState={agentState}
            messages={messages}
            className="livetax-transcript h-full pr-1"
          />
        </div>

        <form className="shrink-0" onSubmit={handleSend}>
          <div
            className={cn(
              "grid min-h-[118px] rounded-[22px] border bg-white/75 transition-colors",
              dragActive ? "border-sky-400/50 bg-sky-50/80" : "border-black/10"
            )}
            onDragOver={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files[0];
              if (file) {
                void sendFile(file);
              }
            }}
          >
            <textarea
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              rows={3}
              placeholder="Ask anything"
              className="min-h-[76px] w-full resize-none border-0 bg-transparent px-4 pt-3 text-[14px] leading-6 text-black outline-none placeholder:text-black/40"
            />

            <div className="flex items-center justify-between gap-3 px-3 pb-3">
              <div className="px-1 text-[10px] uppercase tracking-[0.18em] text-black/34">
                {dragActive ? "drop to attach" : "type or drop"}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex size-8 items-center justify-center rounded-full bg-black/5 text-[16px] text-black/56 transition-colors hover:text-black/78"
                  aria-label="Attach file"
                >
                  +
                </button>
                <button
                  type="submit"
                  disabled={!composerValue.trim()}
                  className="inline-flex size-8 items-center justify-center rounded-full bg-black text-[12px] text-white disabled:cursor-default disabled:opacity-30"
                  aria-label="Send message"
                >
                  ↑
                </button>
              </div>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void sendFile(file);
              }
              event.target.value = "";
            }}
          />
        </form>
      </section>

      <section className="min-h-0 overflow-hidden">
        <div ref={workspaceRef} className="h-full overflow-hidden">
          <iframe
            src="/f1040.pdf#toolbar=0&navpanes=0&scrollbar=1&view=FitH"
            title="IRS Form 1040 PDF"
            className="h-full w-full border-0 bg-white"
          />
        </div>
      </section>
    </main>
  );
}
