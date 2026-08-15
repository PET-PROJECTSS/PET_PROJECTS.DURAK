import asyncio
import logging
import re
import uuid
from pathlib import Path

from aiohttp import web

import config
from app.auth import validate_init_data
from app.rooms import manager
from app.ws import ws_handler

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

logger = logging.getLogger("server")

GUEST_PID_RE = re.compile(r"^guest_[a-z0-9]{6,32}$")


def _full_name(u: dict) -> str:
    parts = [str(u.get("first_name") or ""), str(u.get("last_name") or "")]
    name = " ".join(p for p in parts if p).strip()
    return name or "Игрок"


def _resolve_player(payload: dict):
    payload = payload or {}
    init_data = payload.get("init_data") or ""
    if init_data:
        res = validate_init_data(init_data, config.BOT_TOKEN)
        if res and res.get("user"):
            u = res["user"]
            pid = f"tg{u.get('id')}"
            return {
                "id": pid,
                "name": _full_name(u)[:40],
                "username": str(u.get("username") or "") or None,
                "photo": str(u.get("photo_url") or ""),
                "source": "telegram",
                "balance": manager.balance_of(pid),
            }
    guest_name = (payload.get("guest_name") or "").strip()
    if config.GUEST_ALLOWED:
        pid = (payload.get("guest_pid") or "").strip()
        if not GUEST_PID_RE.match(pid):
            pid = f"guest_{uuid.uuid4().hex[:8]}"
        return {
            "id": pid,
            "name": guest_name[:32] or "Гость",
            "photo": "",
            "source": "guest",
            "balance": manager.balance_of(pid),
        }
    return None


async def index_handler(request):
    return web.FileResponse(WEB_DIR / "index.html")


async def me_handler(request):
    init_data = request.query.get("init_data", "")
    if init_data:
        try:
            res = validate_init_data(init_data, config.BOT_TOKEN)
        except Exception as exc:
            logger.warning("init_data validation error: %s", exc)
            res = None
        if res and res.get("user"):
            u = res["user"]
            pid = f"tg{u.get('id')}"
            return web.json_response({
                "ok": True,
                "source": "telegram",
                "id": pid,
                "name": _full_name(u),
                "username": str(u.get("username") or "") or None,
                "photo": str(u.get("photo_url") or ""),
                "balance": manager.balance_of(pid),
            })
        else:
            logger.info("me: init_data present but invalid (source guest)")
    guest_pid = request.query.get("guest_pid", "")
    if config.GUEST_ALLOWED and GUEST_PID_RE.match(guest_pid):
        return web.json_response({
            "ok": True,
            "source": "guest",
            "id": guest_pid,
            "balance": manager.balance_of(guest_pid),
        })
    return web.json_response({"ok": True, "source": "guest"})


async def rooms_handler(request):
    rooms = [r.summary() for r in manager.list() if r.status != "playing"]
    rooms.sort(key=lambda r: r["created"])
    return web.json_response({"ok": True, "rooms": rooms})


async def create_room_handler(request):
    data = await request.json()
    player = _resolve_player(data)
    if not player:
        return web.json_response({"ok": False, "error": "Не удалось определить пользователя"}, status=401)
    name = (data.get("name") or "").strip()[:40] or f"Комната {uuid.uuid4().hex[:4].upper()}"
    private = bool(data.get("private"))
    password = (data.get("password") or "").strip()[:20] or None
    try:
        max_players = int(data.get("max_players") or 2)
    except (TypeError, ValueError):
        max_players = 2
    if max_players < 2 or max_players > 6:
        max_players = 2
    mode = data.get("mode") or "podkidnoi"
    if mode not in ("podkidnoi", "perevodnoi"):
        mode = "podkidnoi"
    try:
        deck_size = int(data.get("deck_size") or 36)
    except (TypeError, ValueError):
        deck_size = 36
    if deck_size not in (24, 36, 52):
        deck_size = 36
    try:
        stake = int(data.get("stake") or data.get("settings", {}).get("stake") or 0)
    except (TypeError, ValueError):
        stake = 0
    settings_raw = data.get("settings") or {}
    shulers = bool(data.get("shulers")) or bool(settings_raw.get("s_shulerami"))
    settings = {
        "max_players": max_players,
        "mode": mode,
        "throw_all": bool(data.get("throw_all")),
        "shulers": shulers,
        "deck_size": deck_size,
        "stake": max(0, stake),
    }
    room = manager.create(player, name, private, password, settings)
    return web.json_response({
        "ok": True,
        "room_id": room.id,
        "pid": player["id"],
        "token": list(room.tokens.keys())[-1],
        "room": room.summary(),
        "player": player,
        "balance": player["balance"],
    })


async def join_room_handler(request):
    room_id = request.match_info["room_id"]
    room = manager.get(room_id)
    if not room:
        return web.json_response({"ok": False, "error": "Комната не найдена"}, status=404)
    data = await request.json()
    player = _resolve_player(data)
    if not player:
        return web.json_response({"ok": False, "error": "Не удалось определить пользователя"}, status=401)
    if room.status == "playing":
        if player["id"] not in room.players:
            return web.json_response({"ok": False, "error": "Игра уже идёт"}, status=409)
    if room.private and (data.get("password") or "") != room.password:
        return web.json_response({"ok": False, "error": "Неверный пароль"}, status=403)
    try:
        token = manager.add_player(room, player)
    except ValueError as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=409)
    return web.json_response({
        "ok": True,
        "room_id": room.id,
        "pid": player["id"],
        "token": token,
        "room": room.summary(),
        "player": player,
        "balance": player["balance"],
    })


@web.middleware
async def no_cache_middleware(request, handler):
    resp = await handler(request)
    if request.path in ("/", "/index.html"):
        resp.headers["Cache-Control"] = "no-store"
    else:
        resp.headers["Cache-Control"] = "no-cache"
    return resp


def _index_build() -> int:
    try:
        html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
        versions = [int(v) for v in re.findall(r"[?&]v=(\d+)", html) if v.isdigit()]
        return max(versions) if versions else 0
    except OSError:
        return 0


def web_app_url() -> str:
    b = _index_build()
    sep = "&" if "?" in config.APP_URL else "?"
    return f"{config.APP_URL}{sep}b={b}"


async def build_handler(request):
    return web.json_response({"build": _index_build()})


def build_app() -> web.Application:
    app = web.Application(middlewares=[no_cache_middleware])
    app.router.add_get("/", index_handler)
    app.router.add_get("/api/build", build_handler)
    app.router.add_static("/css", WEB_DIR / "css")
    app.router.add_static("/js", WEB_DIR / "js")
    app.router.add_static("/assets", WEB_DIR / "assets")
    app.router.add_get("/api/me", me_handler)
    app.router.add_get("/api/rooms", rooms_handler)
    app.router.add_post("/api/rooms", create_room_handler)
    app.router.add_post("/api/rooms/{room_id}/join", join_room_handler)
    app.router.add_get("/ws", ws_handler)
    return app


async def run_server():
    app = build_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, config.APP_HOST, config.APP_PORT)
    await site.start()
    logger.info("App running at %s", config.APP_URL)
    try:
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        await runner.cleanup()
        raise
