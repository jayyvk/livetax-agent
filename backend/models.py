from __future__ import annotations

from typing import Any


def status_message(state: str) -> dict[str, Any]:
    return {"type": "status", "state": state}


def log_message(event: str, data: Any | None = None) -> dict[str, Any]:
    return {"type": "log", "event": event, "data": data}


def session_started_message(session_id: str) -> dict[str, Any]:
    return {"type": "session.started", "session_id": session_id}


def session_ended_message() -> dict[str, Any]:
    return {"type": "session.ended"}


def text_delta_message(delta: str) -> dict[str, Any]:
    return {"type": "output.text.delta", "delta": delta}


def text_done_message(full_text: str) -> dict[str, Any]:
    return {"type": "output.text.done", "full_text": full_text}


def audio_delta_message(audio: str) -> dict[str, Any]:
    return {"type": "output.audio.delta", "audio": audio}


def audio_done_message() -> dict[str, Any]:
    return {"type": "output.audio.done"}


def error_message(message: str, code: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"type": "error", "message": message}
    if code:
      payload["code"] = code
    return payload
