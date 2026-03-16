from __future__ import annotations

import asyncio
import base64
import json
import uuid
from typing import Any

from google import genai
from google.genai import types

from audio import pcm_to_base64
from config import settings
from models import (
    audio_delta_message,
    audio_done_message,
    error_message,
    log_message,
    session_ended_message,
    session_started_message,
    status_message,
    text_delta_message,
    text_done_message,
)


async def run_gemini_session(websocket: Any, config: dict[str, Any]) -> None:
    if not settings.google_cloud_project:
        raise RuntimeError("Missing GOOGLE_CLOUD_PROJECT for Vertex AI.")

    client = genai.Client(
        vertexai=True,
        project=settings.google_cloud_project,
        location=settings.google_cloud_location,
    )
    session_id = f"live-{uuid.uuid4().hex[:8]}"
    system_instruction = config.get("system_instruction", "")

    async def send(payload: dict[str, Any]) -> None:
        await websocket.send_text(json.dumps(payload))

    live_config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=(
            types.Content(parts=[types.Part(text=system_instruction)])
            if system_instruction
            else None
        ),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        input_audio_transcription=types.AudioTranscriptionConfig(),
    )

    await send(status_message("connecting"))

    try:
        async with client.aio.live.connect(
            model=settings.gemini_live_model,
            config=live_config,
        ) as session:
            await send(session_started_message(session_id))
            await send(status_message("live"))
            await send(log_message("session.started", {"session_id": session_id}))

            input_queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

            async def receive_from_client() -> None:
                while True:
                    try:
                        raw = await websocket.receive_text()
                        await input_queue.put(json.loads(raw))
                    except Exception:
                        await input_queue.put(None)
                        break

            async def send_to_gemini() -> None:
                while True:
                    message = await input_queue.get()
                    if message is None:
                        break

                    message_type = message.get("type")
                    if message_type == "session.end":
                        await input_queue.put(None)
                        break

                    if message_type == "input.text":
                        await session.send_realtime_input(text=message.get("text", ""))
                    elif message_type == "input.audio":
                        pcm_data = base64.b64decode(message["audio"])
                        await session.send_realtime_input(
                            audio=types.Blob(data=pcm_data, mime_type="audio/pcm;rate=16000")
                        )
                    elif message_type == "input.image":
                        image_data = base64.b64decode(message["image"])
                        mime_type = message.get("mime_type", "image/jpeg")
                        await session.send_client_content(
                            turns=types.Content(
                                role="user",
                                parts=[
                                    types.Part(
                                        inline_data=types.Blob(
                                            data=image_data,
                                            mime_type=mime_type,
                                        )
                                    ),
                                    types.Part(
                                        text=message.get(
                                            "text",
                                            "Continue the current conversation naturally. Do not reintroduce yourself or restart the flow. Carefully inspect this uploaded tax document before responding. If it is a W-2, prioritize exact extraction of the key visible values and do not guess any unclear field.",
                                        )
                                    ),
                                ],
                            ),
                            turn_complete=True,
                        )
                    elif message_type == "input.video":
                        frame_data = base64.b64decode(message["video"])
                        mime_type = message.get("mime_type", "image/jpeg")
                        await session.send_realtime_input(
                            video=types.Blob(data=frame_data, mime_type=mime_type)
                        )
                    elif message_type == "input.interrupt":
                        await session.send_client_content(turns=[], turn_complete=True)

                    if message_type:
                        await send(log_message(message_type))

            async def receive_from_gemini() -> None:
                current_text = ""
                while True:
                    try:
                        async for response in session.receive():
                            if getattr(response, "setup_complete", None):
                                await send(log_message("gemini.setup_complete"))
                                continue

                            server_content = getattr(response, "server_content", None)
                            if server_content is not None:
                                await send(log_message("gemini.server_content"))

                                model_turn = getattr(server_content, "model_turn", None)
                                if model_turn is not None:
                                    for part in (getattr(model_turn, "parts", None) or []):
                                        inline_data = getattr(part, "inline_data", None)
                                        if inline_data is not None:
                                            data = getattr(inline_data, "data", None)
                                            if data:
                                                await send(audio_delta_message(pcm_to_base64(data)))

                                        text = getattr(part, "text", None)
                                        if text:
                                            current_text += text
                                            await send(text_delta_message(text))

                                input_tx = getattr(server_content, "input_transcription", None)
                                if input_tx is not None and getattr(input_tx, "text", None):
                                    await send(
                                        {
                                            "type": "input.transcription",
                                            "text": input_tx.text,
                                            "finished": bool(
                                                getattr(input_tx, "finished", False)
                                            ),
                                        }
                                    )

                                output_tx = getattr(server_content, "output_transcription", None)
                                if output_tx is not None and getattr(output_tx, "text", None):
                                    await send(text_delta_message(output_tx.text))
                                    current_text += output_tx.text

                                if getattr(server_content, "interrupted", False):
                                    await send(log_message("gemini.interrupted"))

                                if getattr(server_content, "turn_complete", False):
                                    if current_text:
                                        await send(text_done_message(current_text))
                                        current_text = ""
                                    await send(audio_done_message())
                    except Exception as exc:
                        await send(log_message("recv.error", {"error": str(exc)}))
                        break

            client_task = asyncio.create_task(receive_from_client())
            send_task = asyncio.create_task(send_to_gemini())
            recv_task = asyncio.create_task(receive_from_gemini())
            await asyncio.gather(client_task, send_task, recv_task, return_exceptions=True)

    except Exception as exc:
        await send(error_message(str(exc), "GEMINI_ERROR"))
        await send(status_message("error"))
    finally:
        await send(session_ended_message())
        await send(status_message("ended"))
        await send(log_message("session.ended"))
