import json
import logging

from aiohttp import web

from app.rooms import manager
from game.durak import DurakError, DurakGame

logger = logging.getLogger("ws")


def _opponent(room, pid):
    for other in room.players:
        if other != pid:
            return room.players[other]
    return None


def _start_game(room):
    room.status = "playing"
    room.game = DurakGame(
        list(room.players.keys()),
        mode=room.mode,
        throw_all=room.throw_all,
        deck_size=room.deck_size,
    )
    room.ready.clear()


def _state_for(room, pid):
    if room.game:
        state = room.game.public_state(pid)
        state["room_id"] = room.id
        state["room_name"] = room.name
        state["status"] = room.status
        state["you"] = room.players[pid]
        state["opponent"] = _opponent(room, pid)
        state["players"] = [
            {"id": p, "name": room.players[p]["name"], "photo": room.players[p].get("photo", "")}
            for p in room.players
        ]
        return {"type": "state", "state": state}
    return {
        "type": "waiting",
        "room": room.summary(),
        "you": room.players[pid],
        "ready": list(room.ready),
        "players": [
            {"id": p, "name": room.players[p]["name"], "photo": room.players[p].get("photo", "")}
            for p in room.players
        ],
    }


async def broadcast(room, exclude=None):
    for pid, conn in list(room.conns.items()):
        if conn is None or conn is exclude:
            continue
        try:
            await conn.send_json(_state_for(room, pid))
        except Exception:
            pass


async def broadcast_emoji(room, pid, emoji):
    if not isinstance(emoji, str) or not (1 <= len(emoji) <= 16):
        return
    msg = {"type": "emoji", "from": pid, "emoji": emoji}
    for cpid, conn in list(room.conns.items()):
        if conn is None:
            continue
        try:
            await conn.send_json(msg)
        except Exception:
            pass


async def _handle_action(room, pid, data):
    act = data.get("type")
    if act == "ready":
        if room.status != "waiting":
            return
        room.ready.add(pid)
        if len(room.players) >= 2 and len(room.ready) >= len(room.players):
            _start_game(room)
        return
    game = room.game
    if not game:
        return
    if act == "attack":
        game.attack(pid, data.get("card"))
    elif act == "beat":
        game.beat(pid, data.get("attack"), data.get("defend"))
    elif act == "take":
        game.take(pid)
    elif act == "transfer":
        game.transfer(pid, data.get("card"))
    elif act == "done":
        game.done(pid)
    elif act == "restart":
        if game.finished:
            room.game = DurakGame(
                list(room.players.keys()),
                mode=room.mode,
                throw_all=room.throw_all,
                deck_size=room.deck_size,
            )


async def ws_handler(request):
    token = request.query.get("token", "")
    room, pid = manager.consume_token(token)
    if room is None or pid is None:
        return web.Response(status=401, text="invalid token")

    ws = web.WebSocketResponse(max_msg_size=8192)
    await ws.prepare(request)

    if pid in room.conns and room.conns[pid] is not None:
        try:
            await room.conns[pid].close()
        except Exception:
            pass
    room.conns[pid] = ws

    try:
        await ws.send_json(_state_for(room, pid))
        await broadcast(room)

        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    if data.get("type") == "emoji":
                        await broadcast_emoji(room, pid, data.get("emoji"))
                        continue
                    await _handle_action(room, pid, data)
                    await broadcast(room)
                except DurakError as exc:
                    await ws.send_json({"type": "error", "text": str(exc)})
                except Exception:
                    logger.exception("action error")
                    await ws.send_json({"type": "error", "text": "Ошибка сервера"})
            elif msg.type == web.WSMsgType.ERROR:
                break
    finally:
        if room.conns.get(pid) is ws:
            room.conns.pop(pid, None)
        room.ready.discard(pid)
        room.players.pop(pid, None)
        if not room.players:
            manager.remove(room.id)
        elif room.status == "playing":
            manager.remove(room.id)
            for conn in list(room.conns.values()):
                try:
                    await conn.close()
                except Exception:
                    pass
        else:
            try:
                await broadcast(room)
            except Exception:
                pass
    return ws
