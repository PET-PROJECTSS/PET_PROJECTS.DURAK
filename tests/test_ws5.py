import asyncio
import time
import unittest

import aiohttp
from aiohttp import WSMsgType

from app.rooms import manager
from app.server import build_app


def _guest(pid):
    return {"guest_pid": pid, "guest_name": pid, "init_data": ""}


async def _wait_for(ws, pred, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        msg = await ws.receive(timeout=timeout)
        if msg.type != WSMsgType.TEXT:
            return None
        data = msg.json()
        if pred(data):
            return data
    raise AssertionError("timeout waiting for ws message")


async def _drain(ws, n=5):
    for _ in range(n):
        msg = await ws.receive(timeout=1)
        if msg.type != WSMsgType.TEXT:
            return


class ReadyResetJoinTest(unittest.TestCase):
    def test_join_clears_ready(self):
        async def inner():
            app = build_app()
            runner = aiohttp.web.AppRunner(app)
            await runner.setup()
            site = aiohttp.web.TCPSite(runner, "127.0.0.1", 0)
            await site.start()
            port = site._server.sockets[0].getsockname()[1]
            base = f"http://127.0.0.1:{port}"
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(base + "/api/rooms", json=_guest("guest_aaaaaa")) as resp:
                        host = await resp.json()
                    room_id = host["room_id"]
                    ws_host = await session.ws_connect(base + f"/ws?token={host['token']}", max_msg_size=8192)
                    await _wait_for(ws_host, lambda m: m["type"] == "waiting")
                    await ws_host.send_json({"type": "ready"})
                    await _wait_for(ws_host, lambda m: m["type"] == "waiting" and host["pid"] in m["ready"])
                    self.assertIn(host["pid"], manager.get(room_id).ready)

                    async with session.post(base + f"/api/rooms/{room_id}/join", json=_guest("guest_bbbbbb")) as resp:
                        guest = await resp.json()
                    ws_guest = await session.ws_connect(base + f"/ws?token={guest['token']}", max_msg_size=8192)
                    await _wait_for(ws_guest, lambda m: m["type"] == "waiting")
                    await _wait_for(ws_host, lambda m: m["type"] == "waiting" and m["ready"] == [])
                    self.assertEqual(manager.get(room_id).ready, set())

                    await ws_host.send_json({"type": "ready"})
                    await ws_guest.send_json({"type": "ready"})
                    await _wait_for(ws_host, lambda m: m["type"] == "state")
                    self.assertEqual(manager.get(room_id).status, "playing")
                    await ws_host.close()
                    await ws_guest.close()
            finally:
                await runner.cleanup()

        manager.rooms.clear()
        asyncio.run(inner())
        manager.rooms.clear()


class ReadyResetLeaveTest(unittest.TestCase):
    def test_leave_clears_ready(self):
        async def inner():
            app = build_app()
            runner = aiohttp.web.AppRunner(app)
            await runner.setup()
            site = aiohttp.web.TCPSite(runner, "127.0.0.1", 0)
            await site.start()
            port = site._server.sockets[0].getsockname()[1]
            base = f"http://127.0.0.1:{port}"
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(base + "/api/rooms", json=_guest("guest_cccccc")) as resp:
                        host = await resp.json()
                    room_id = host["room_id"]
                    ws_host = await session.ws_connect(base + f"/ws?token={host['token']}", max_msg_size=8192)
                    await _wait_for(ws_host, lambda m: m["type"] == "waiting")
                    async with session.post(base + f"/api/rooms/{room_id}/join", json=_guest("guest_dddddd")) as resp:
                        guest = await resp.json()
                    ws_guest = await session.ws_connect(base + f"/ws?token={guest['token']}", max_msg_size=8192)
                    await _wait_for(ws_guest, lambda m: m["type"] == "waiting")

                    await ws_host.send_json({"type": "ready"})
                    await _wait_for(ws_host, lambda m: m["type"] == "waiting" and host["pid"] in m["ready"])
                    self.assertEqual(manager.get(room_id).ready, {host["pid"]})

                    await ws_host.close()
                    await _wait_for(ws_guest, lambda m: m["type"] == "waiting" and m["ready"] == [])
                    room = manager.get(room_id)
                    self.assertIsNotNone(room)
                    self.assertEqual(room.ready, set())
                    self.assertEqual(list(room.players.keys()), [guest["pid"]])
                    await ws_guest.close()
            finally:
                await runner.cleanup()

        manager.rooms.clear()
        asyncio.run(inner())
        manager.rooms.clear()


if __name__ == "__main__":
    unittest.main()
