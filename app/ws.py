import asyncio
import json
import logging
import time

from aiohttp import web

import config
from app.rooms import manager
from game.durak import DurakError, DurakGame

logger = logging.getLogger("ws")

DISCONNECT_GRACE = max(5, getattr(config, "DISCONNECT_GRACE", 20))


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
        shulers=room.shulers,
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
        state["opponent_gone"] = any(
            p != pid and room.conns.get(p) is None and p in room.disconnected
            for p in room.players
        )
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


async def _queue_writer(ws, queue):
    try:
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=10)
            except asyncio.TimeoutError:
                try:
                    await ws.send_json({"type": "ping"})
                except Exception:
                    try:
                        await ws.close()
                    except Exception:
                        pass
                    return
                continue
            try:
                await ws.send_json(msg)
            except Exception:
                try:
                    await ws.close()
                except Exception:
                    pass
                return
    except asyncio.CancelledError:
        pass


async def broadcast(room, exclude=None):
    for pid, conn in list(room.conns.items()):
        if conn is None or conn is exclude:
            continue
        queue = room.queues.get(pid)
        if queue is not None:
            queue.put_nowait(_state_for(room, pid))


async def broadcast_emoji(room, pid, emoji):
    if not isinstance(emoji, str) or not (1 <= len(emoji) <= 16):
        return
    msg = {"type": "emoji", "from": pid, "emoji": emoji}
    for cpid, conn in list(room.conns.items()):
        if conn is None:
            continue
        queue = room.queues.get(cpid)
        if queue is not None:
            queue.put_nowait(msg)


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
    elif act == "catch":
        game.catch(pid, data.get("attack"), data.get("defend"))
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
                shulers=room.shulers,
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


async def _forfeit_room(room):
    """Close remaining connections and remove the room (game is over)."""
    for cpid, conn in list(room.conns.items()):
        if conn is None:
            continue
        try:
            await conn.send_json(_state_for(room, cpid))
        except Exception:
            pass
    await asyncio.sleep(2)
    for conn in list(room.conns.values()):
        if conn is None:
            continue
        try:
            await conn.close()
        except Exception:
            pass
    manager.remove(room.id)


async def _delayed_forfeit(room, pid):
    """Give the player a grace period to reconnect before declaring a forfeit."""
    try:
        await asyncio.sleep(DISCONNECT_GRACE)
    except asyncio.CancelledError:
        return
    if room.conns.get(pid) is not None:
        return
    if pid not in room.players:
        return
    room.players.pop(pid, None)
    room.conns.pop(pid, None)
    room.disconnected.pop(pid, None)
    if not room.players:
        manager.remove(room.id)
        return
    game = room.game
    if game and not game.finished:
        remaining = list(room.players.keys())
        if remaining:
            game.finished = True
            game.winner = remaining[0]
            game.turn = "idle"
            room._stake_settled = False
            for rp in remaining:
                manager.transfer(pid, rp, room.stake)
            room._stake_settled = True
    await _forfeit_room(room)


async def turn_timeout_loop():
    """Periodically enforce the per-turn deadline in playing rooms."""
    while True:
        try:
            await asyncio.sleep(1.0)
            for room in manager.list():
                game = room.game
                if not game or room.status != "playing" or game.finished:
                    continue
                if game.auto_turn():
                    _settle(room)
                    await broadcast(room)
                elif game.turn_until is not None and time.monotonic() >= game.turn_until:
                    game._touch_turn()
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("turn timeout loop error")


async def ws_handler(request):
    token = request.query.get("token", "")
    room, pid = manager.consume_token(token)
    if room is None or pid is None:
        return web.Response(status=401, text="invalid token")

    ws = web.WebSocketResponse(max_msg_size=8192, heartbeat=20)
    await ws.prepare(request)

    old = room.conns.get(pid)
    room.conns[pid] = ws
    room.disconnected.pop(pid, None)

    queue = asyncio.Queue()
    room.queues[pid] = queue
    writer = asyncio.get_running_loop().create_task(_queue_writer(ws, queue))
    room.writers[pid] = writer

    if old is not None and old is not ws:
        try:
            await asyncio.wait_for(old.close(), timeout=1)
        except Exception:
            pass

    try:
        queue.put_nowait(_state_for(room, pid))
        await broadcast(room)

        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    if data.get("type") == "emoji":
                        await broadcast_emoji(room, pid, data.get("emoji"))
                        continue
                    if data.get("type") in ("ping", "pong"):
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
        if room.writers.get(pid) is writer:
            room.writers.pop(pid, None)
        if room.queues.get(pid) is queue:
            room.queues.pop(pid, None)
        if writer is not None:
            writer.cancel()
        if room.conns.get(pid) is not ws:
            return
        room.conns[pid] = None
        room.ready.discard(pid)
        if room.status != "playing":
            room.players.pop(pid, None)
            room.conns.pop(pid, None)
            if not room.players:
                manager.remove(room.id)
            else:
                room.ready.clear()
                try:
                    await broadcast(room)
                except Exception:
                    pass
        else:
            game = room.game
            if game and not game.finished:
                room.disconnected[pid] = time.monotonic()
                try:
                    asyncio.get_running_loop().create_task(_delayed_forfeit(room, pid))
                except Exception:
                    pass
                try:
                    await broadcast(room)
                except Exception:
                    pass
            elif game and game.finished:
                if not any(c is not None for c in room.conns.values()):
                    manager.remove(room.id)
    return ws
