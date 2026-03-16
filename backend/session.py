from __future__ import annotations

import json
from typing import Any

from gemini_client import run_gemini_session


async def handle_websocket(websocket: Any) -> None:
    try:
        raw = await websocket.receive_text()
        first_message = json.loads(raw)
    except Exception:
        return

    if first_message.get("type") != "session.start":
        await websocket.send_text(
            json.dumps({"type": "error", "message": "Expected session.start as first message"})
        )
        return

    await run_gemini_session(websocket, first_message.get("config", {}))
