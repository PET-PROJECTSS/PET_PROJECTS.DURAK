import time
import uuid
from typing import Dict, Optional

from app.wallets import WalletStore


class Room:
    def __init__(self, room_id: str, name: str, private: bool, password: Optional[str], host: dict, settings: Optional[dict] = None):
        settings = settings or {}
        self.id = room_id
        self.name = name
        self.private = private
        self.password = password
        self.host = host["id"]
        self.max = int(settings.get("max_players") or 2)
        self.mode = settings.get("mode", "podkidnoi")
        self.throw_all = bool(settings.get("throw_all", False))
        self.shulers = bool(settings.get("shulers", False))
        self.deck_size = int(settings.get("deck_size") or 36)
        self.stake = int(settings.get("stake") or 0)
        self.created = time.time()
        self.players: Dict[str, dict] = {host["id"]: host}
        self.tokens: Dict[str, str] = {}
        self.conns: Dict[str, object] = {}
        self.disconnected: Dict[str, float] = {}
        self.ready = set()
        self.status = "waiting"
        self.game = None
        self.queues: Dict[str, object] = {}
        self.writers: Dict[str, object] = {}

    def summary(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "private": self.private,
            "host": self.players[self.host]["name"] if self.host in self.players else "?",
            "players": len(self.players),
            "max": self.max,
            "mode": self.mode,
            "throw_all": self.throw_all,
            "deck_size": self.deck_size,
            "status": self.status,
            "stake": self.stake,
            "created": self.created,
        }


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.wallets = WalletStore()
        self._balance_cache: Dict[str, int] = {}

    START_BALANCE = WalletStore.START_BALANCE

    def balance_of(self, pid: str) -> int:
        cached = self._balance_cache.get(pid)
        if cached is None:
            cached = self.wallets.balance_of(pid)
            self._balance_cache[pid] = cached
        return cached

    def transfer(self, loser: str, winner: str, stake: int) -> None:
        self.wallets.transfer(loser, winner, stake)
        self._balance_cache.pop(loser, None)
        self._balance_cache.pop(winner, None)

    def _room_id(self) -> str:
        while True:
            rid = uuid.uuid4().hex[:8].upper()
            if rid not in self.rooms:
                return rid

    def create(self, host: dict, name: str, private: bool, password: Optional[str], settings: Optional[dict] = None) -> Room:
        room = Room(self._room_id(), name, private, password, host, settings)
        room.tokens[uuid.uuid4().hex] = host["id"]
        self.rooms[room.id] = room
        return room

    def get(self, room_id: str) -> Optional[Room]:
        return self.rooms.get((room_id or "").upper())

    def list(self) -> list:
        return list(self.rooms.values())

    def add_player(self, room: Room, player: dict) -> str:
        if len(room.players) >= room.max and player["id"] not in room.players:
            raise ValueError("Комната заполнена")
        if room.status == "waiting":
            room.ready.clear()
        room.players[player["id"]] = player
        token = uuid.uuid4().hex
        room.tokens[token] = player["id"]
        return token

    def consume_token(self, token: str):
        for room in self.rooms.values():
            if token in room.tokens:
                pid = room.tokens.pop(token)
                return room, pid
        return None, None

    def remove(self, room_id: str) -> None:
        self.rooms.pop(room_id, None)


manager = RoomManager()
