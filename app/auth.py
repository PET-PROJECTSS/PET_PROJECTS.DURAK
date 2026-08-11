import hashlib
import hmac
import json
import time
from typing import Optional
from urllib.parse import parse_qsl


def validate_init_data(init_data: str, bot_token: str) -> Optional[dict]:
    if not init_data:
        return None
    params = {}
    for key, value in parse_qsl(init_data, keep_blank_values=True):
        params[key] = value
    received_hash = params.pop("hash", None)
    if not received_hash:
        return None
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, received_hash):
        return None
    if "auth_date" in params:
        try:
            if abs(int(params["auth_date"]) - int(time.time())) > 86400 * 2:
                return None
        except ValueError:
            return None
    user = {}
    if "user" in params:
        try:
            user = json.loads(params["user"])
        except json.JSONDecodeError:
            user = {}
    return {"user": user, "auth_date": params.get("auth_date")}
