from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).with_name(".env"))


class Settings:
    google_cloud_project: str = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    google_cloud_location: str = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
    gemini_live_model: str = os.environ.get(
        "GEMINI_LIVE_MODEL", "gemini-live-2.5-flash-native-audio"
    )
    allowed_origins: str = os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    )


settings = Settings()
