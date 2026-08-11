import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _as_bool(value: Optional[str], default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


BOT_TOKEN: str = os.getenv("BOT_TOKEN", "")

USE_PROXY: bool = _as_bool(os.getenv("USE_PROXY"), False)
HTTP_PROXY: str = os.getenv("HTTP_PROXY", "")

APP_HOST: str = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT: int = int(os.getenv("APP_PORT", "8080"))
APP_URL: str = os.getenv("APP_URL", "http://127.0.0.1:8080")

GUEST_ALLOWED: bool = _as_bool(os.getenv("GUEST_ALLOWED"), True)
