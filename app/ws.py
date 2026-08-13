import asyncio
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
        state["balance"] = manager.balance_of(pid)
        state["stake"] = room.stake
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
        "balance": manager.balance_of(pid),
        "stake": room.stake,
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
            room._stake_settled = False
            room.game = DurakGame(
                list(room.players.keys()),
                mode=room.mode,
                throw_all=room.throw_all,
                deck_size=room.deck_size,
            )
    _settle(room)


def _settle(room):
    game = room.game
    if getattr(room, "_stake_settled", False):
        return
    if not game or not game.finished or not game.winner:
        return
    for pid in list(room.players):
        if pid != game.winner:
            manager.transfer(pid, game.winner, room.stake)
    room._stake_settled = True


async def ws_handler(request):
    token = request.query.get("token", "")
    room, pid = manager.consume_token(token)
    if room is None or pid is None:
        return web.Response(status=401, text="invalid token")

    ws = web.WebSocketResponse(max_msg_size=8192)
    await ws.prepare(request)

    old = room.conns.get(pid)
    room.conns[pid] = ws
    if old is not None and old is not ws:
        try:
            await old.close()
        except Exception:
            pass

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
                game = room.game
                if game and not game.finished:
                    remaining = list(room.players.keys())
                    if remaining:
                        winner = remaining[0]
                        game.finished = True
                        game.winner = winner
                        game.turn = "idle"
                        room._stake_settled = False
                        for rp in remaining:
                            manager.transfer(pid, rp, room.stake)
                        room._stake_settled = True
                for cpid, conn in list(room.conns.items()):
                    try:
                        await conn.send_json(_state_for(room, cpid))
                    except Exception:
                        pass
                await asyncio.sleep(2)
                for conn in list(room.conns.values()):
                    try:
                        await conn.close()
                    except Exception:
                        pass
                manager.remove(room.id)
            else:
                try:
                    await broadcast(room)
                except Exception:
                    pass
    return ws
