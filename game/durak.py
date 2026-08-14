import random
from typing import Dict, List, Optional

RANKS_24 = ["9", "10", "J", "Q", "K", "A"]
RANKS_36 = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"]
RANKS_52 = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
RANKS = RANKS_52
RANK_VAL = {r: i for i, r in enumerate(RANKS)}
SUITS = ["S", "C", "H", "D"]
SUIT_SYM = {"S": "\u2660", "C": "\u2663", "H": "\u2665", "D": "\u2666"}
SUIT_RED = {"H", "D"}

MODE_CLASSIC = "podkidnoi"
MODE_TRANSFER = "perevodnoi"
MODES = (MODE_CLASSIC, MODE_TRANSFER)


class Card:
    __slots__ = ("rank", "suit")

    def __init__(self, code: str):
        code = code.upper()
        for r in RANKS:
            if code.startswith(r) and code[len(r):] in SUITS:
                self.rank = r
                self.suit = code[len(r):]
                return
        raise ValueError(f"bad card: {code}")

    def code(self) -> str:
        return self.rank + self.suit

    def beats(self, other: "Card", trump_suit: str) -> bool:
        if self.suit == other.suit:
            return RANK_VAL[self.rank] > RANK_VAL[other.rank]
        return self.suit == trump_suit

    def key(self) -> int:
        return RANK_VAL[self.rank] * 4 + SUITS.index(self.suit)

    def is_red(self) -> bool:
        return self.suit in SUIT_RED

    def __eq__(self, other):
        return isinstance(other, Card) and other.rank == self.rank and other.suit == self.suit

    def __hash__(self):
        return hash((self.rank, self.suit))

    def __repr__(self):
        return f"Card({self.code()})"


def build_deck(ranks: Optional[List[str]] = None) -> List[Card]:
    ranks = ranks or RANKS
    cards = [Card(r + s) for r in ranks for s in SUITS]
    random.shuffle(cards)
    return cards


class DurakError(Exception):
    pass


class DurakGame:
    def __init__(
        self,
        player_ids: List[str],
        first_attacker: Optional[str] = None,
        mode: str = MODE_CLASSIC,
        throw_all: bool = False,
        deck_size: int = 36,
        shulers: bool = False,
    ):
        if len(player_ids) < 2:
            raise DurakError("Нужно минимум 2 игрока")
        if mode not in MODES:
            raise DurakError(f"Неизвестный режим: {mode}")
        if deck_size not in (24, 36, 52):
            raise DurakError(f"Недопустимая колода: {deck_size}")
        self.order: List[str] = list(player_ids)
        self.n = len(self.order)
        self.mode = mode
        self.throw_all = bool(throw_all)
        self.shulers = bool(shulers)
        self.deck_size = deck_size
        self.ranks = {24: RANKS_24, 36: RANKS_36, 52: RANKS_52}[deck_size]
        self.hands: Dict[str, List[Card]] = {p: [] for p in self.order}
        self.deck: List[Card] = build_deck(self.ranks)
        self.trump_card: Optional[Card] = self.deck.pop()
        self.trump = self.trump_card.suit
        self.discard: List[Card] = []
        self.attacker_idx = self.order.index(first_attacker) if first_attacker else random.randrange(self.n)
        self.table: List[List[Optional[Card]]] = []
        self.beats_illegal: List[bool] = []
        self.pending = 0
        self.turn = "attack"
        self.ended: List[str] = []
        self.transferred: set = set()
        self.finished = False
        self.winner: Optional[str] = None
        self.round = 0
        self.last_event = None
        self._deal()

    def attacker(self) -> str:
        return self.order[self.attacker_idx]

    def defender(self) -> str:
        i = (self.attacker_idx + 1) % self.n
        for _ in range(self.n):
            pid = self.order[i]
            if pid not in self.ended and pid != self.attacker() and pid not in self.transferred:
                return pid
            i = (i + 1) % self.n
        return self.attacker()

    def actor(self) -> str:
        return self.attacker() if self.turn == "attack" else self.defender()

    def _next_defender_candidate(self, pid: str) -> Optional[str]:
        i = self.order.index(pid)
        for step in range(1, self.n):
            cand = self.order[(i + step) % self.n]
            if cand in self.ended or cand in self.transferred or cand == self.attacker():
                continue
            return cand
        return None

    def _can_throw_in(self, pid: str) -> bool:
        if pid in self.ended or pid in self.transferred:
            return False
        if not self.table:
            return pid == self.attacker()
        if pid == self.defender():
            return False
        if not self.throw_all:
            return pid == self.attacker()
        return True

    def _cards_left(self) -> int:
        return len(self.deck) + (1 if self.trump_card else 0)

    def _draw_one(self, pid: str) -> Optional[Card]:
        if self.deck:
            return self.deck.pop()
        if self.trump_card:
            c = self.trump_card
            self.trump_card = None
            return c
        return None

    def _deal(self) -> None:
        for _ in range(6):
            for pid in self.order:
                if self._cards_left() > 0:
                    c = self._draw_one(pid)
                    if c:
                        self.hands[pid].append(c)

    def _card_from_hand(self, pid: str, code: str) -> Card:
        c = Card(code)
        if c not in self.hands[pid]:
            raise DurakError("Такой карты нет на руках")
        return c

    def _pair_for(self, attack_code: str):
        for pair in self.table:
            if pair[0] and pair[0].code() == attack_code.upper() and pair[1] is None:
                return pair
        raise DurakError("Такой карты нет на столе")

    def _pair_index(self, attack_code: str) -> int:
        code = attack_code.upper()
        for i, pair in enumerate(self.table):
            if pair[0] and pair[0].code() == code:
                return i
        raise DurakError("Такой карты нет на столе")

    def attack(self, pid: str, card_code: str) -> None:
        if self.finished:
            raise DurakError("Игра окончена")
        if not self._can_throw_in(pid):
            raise DurakError("Сейчас ходит соперник")
        card = self._card_from_hand(pid, card_code)
        defender = self.defender()
        max_attacks = min(6, len(self.hands[defender]))
        if len(self.table) >= max_attacks:
            raise DurakError("Больше подкидывать нельзя")
        if self.table:
            ranks = {a.rank for a, d in self.table if a}
            for a, d in self.table:
                if d:
                    ranks.add(d.rank)
            if card.rank not in ranks and not self.shulers:
                raise DurakError("Подкидывать можно только карты уже лежащих достоинств")
        self.hands[pid].remove(card)
        self.table.append([card, None])
        self.beats_illegal.append(False)
        self.pending += 1
        self.turn = "defend"
        self.last_event = ("attack", card.code())

    def transfer(self, pid: str, card_code: str) -> None:
        if self.finished:
            raise DurakError("Игра окончена")
        if self.mode != MODE_TRANSFER:
            raise DurakError("Перевод недоступен в этом режиме")
        if self.turn != "defend":
            raise DurakError("Сейчас не ваша очередь")
        if pid != self.defender():
            raise DurakError("Сейчас не ваша очередь")
        if not self.table:
            raise DurakError("Нет карт для перевода")
        for _, defend in self.table:
            if defend is not None:
                raise DurakError("Переводить можно только неотбитые карты")
        rank = self.table[0][0].rank
        if any(a.rank != rank for a, _ in self.table):
            raise DurakError("Переводить можно только карты одного достоинства")
        card = self._card_from_hand(pid, card_code)
        if card.rank != rank:
            raise DurakError("Переводить можно только картой того же достоинства")
        nxt = self._next_defender_candidate(pid)
        if nxt is None:
            raise DurakError("Перевести больше некому — отбейте или берите")
        self.hands[pid].remove(card)
        self.table.append([card, None])
        self.beats_illegal.append(False)
        self.pending += 1
        self.transferred.add(pid)
        self.last_event = ("transfer", card.code())

    def beat(self, pid: str, attack_code: str, defend_code: str) -> None:
        if self.finished:
            raise DurakError("Игра окончена")
        if self.turn != "defend":
            raise DurakError("Сейчас не ваша очередь бить")
        if pid != self.defender():
            raise DurakError("Сейчас не ваша очередь бить")
        defend = self._card_from_hand(pid, defend_code)
        pair_idx = self._pair_index(attack_code)
        pair = self.table[pair_idx]
        attack = pair[0]
        illegal = not defend.beats(attack, self.trump)
        if illegal and not self.shulers:
            raise DurakError(f"{defend.code()} не бьёт {attack.code()}")
        self.hands[pid].remove(defend)
        pair[1] = defend
        self.beats_illegal[pair_idx] = illegal
        self.pending -= 1
        if self.pending == 0:
            self.turn = "attack"
        self.last_event = ("beat", attack.code(), defend.code(), illegal)

    def catch(self, pid: str, attack_code: str, defend_code: str) -> None:
        if self.finished:
            raise DurakError("Игра окончена")
        if not self.shulers:
            raise DurakError("Режим без шулеров")
        if self.turn != "attack":
            raise DurakError("Уличить можно только после того, как все карты побиты")
        if pid != self.attacker():
            raise DurakError("Ловить шулера может только атакующий")
        pair_idx = self._pair_index(attack_code)
        pair = self.table[pair_idx]
        defend = pair[1]
        if defend is None or defend.code() != defend_code.upper():
            raise DurakError("Такой карты нет на столе")
        if not self.beats_illegal[pair_idx]:
            raise DurakError("Эта карта побита честно")
        defender = self.defender()
        self.hands[defender].append(defend)
        pair[1] = None
        self.beats_illegal[pair_idx] = False
        self.pending += 1
        self.turn = "defend"
        self.last_event = ("catch", attack_code, defend_code)

    def take(self, pid: str) -> None:
        if self.finished:
            raise DurakError("Игра окончена")
        if self.turn != "defend":
            raise DurakError("Сейчас не ваша очередь")
        if pid != self.defender():
            raise DurakError("Сейчас не ваша очередь")
        if not self.table:
            raise DurakError("Нет карт для взятия")
        count = 0
        for pair in self.table:
            for c in pair:
                if c:
                    self.hands[pid].append(c)
                    count += 1
        self.table = []
        self.beats_illegal = []
        self.pending = 0
        self._finish_round(self.attacker())
        self.last_event = ("take", count)

    def done(self, pid: str) -> None:
        if self.finished:
            raise DurakError("Игра окончена")
        if self.turn != "attack":
            raise DurakError("Сейчас не ваш ход")
        if pid != self.attacker():
            raise DurakError("Сейчас ходит соперник")
        if not self.table:
            raise DurakError("Нужно сначала пойти")
        if self.pending > 0:
            raise DurakError("Сначала должны быть побиты все карты")
        defender = self.defender()
        if self.n == 2:
            next_attacker = defender
        else:
            next_attacker = self.order[(self.order.index(defender) + 1) % self.n]
        self._finish_round(next_attacker)
        self.last_event = ("done",)

    def _finish_round(self, next_attacker: str) -> None:
        for pair in self.table:
            for c in pair:
                if c:
                    self.discard.append(c)
        self.table = []
        self.beats_illegal = []
        self.pending = 0
        self.transferred = set()
        self.attacker_idx = self.order.index(next_attacker)
        self.round += 1
        self._draw_after_round()
        if not self.finished:
            self.turn = "attack"

    def _draw_after_round(self) -> None:
        rotated = self.order[self.attacker_idx:] + self.order[:self.attacker_idx]
        for pid in rotated:
            while len(self.hands[pid]) < 6 and self._cards_left() > 0:
                c = self._draw_one(pid)
                if c:
                    self.hands[pid].append(c)
        for pid in list(self.order):
            if pid in self.ended:
                continue
            if not self.hands[pid] and self._cards_left() == 0:
                self.ended.append(pid)
        remaining = [p for p in self.order if p not in self.ended]
        if len(remaining) <= 1:
            self.finished = True
            self.winner = remaining[0] if remaining else None
            self.turn = "idle"

    def sort_hands(self) -> None:
        for pid in self.order:
            self.hands[pid].sort(key=lambda c: c.key())

    def public_state(self, viewer_id: str) -> dict:
        opponent = next((p for p in self.order if p != viewer_id), None)
        can_transfer = (
            self.mode == MODE_TRANSFER
            and self.turn == "defend"
            and self.defender() == viewer_id
            and len(self.table) > 0
            and all(d is None for _, d in self.table)
            and len({a.rank for a, _ in self.table}) == 1
            and self._next_defender_candidate(viewer_id) is not None
            and any(c.rank == self.table[0][0].rank for c in self.hands.get(viewer_id, []))
        )
        can_throw = not self.finished and self._can_throw_in(viewer_id)
        can_catch = (
            self.shulers
            and not self.finished
            and self.turn == "attack"
            and viewer_id == self.attacker()
            and any(self.beats_illegal)
        )
        cheats = [
            d.code()
            for (a, d), illegal in zip(self.table, self.beats_illegal)
            if illegal and d is not None
        ]
        return {
            "deck": self._cards_left(),
            "trump": self.trump_card.code() if self.trump_card else None,
            "trump_suit": self.trump,
            "trump_sym": SUIT_SYM[self.trump],
            "my_cards": [c.code() for c in sorted(self.hands.get(viewer_id, []), key=lambda c: c.key())],
            "cards_by_player": {p: len(self.hands[p]) for p in self.order},
            "table": [[a.code(), d.code() if d else None] for a, d in self.table],
            "turn": self.turn,
            "actor": self.actor(),
            "attacker": self.attacker(),
            "defender": self.defender(),
            "active_id": self.defender() if self.turn == "defend" else self.attacker(),
            "i_am_attacker": self.attacker() == viewer_id,
            "can_attack": self.turn == "attack" and self._can_throw_in(viewer_id),
            "can_defend": self.turn == "defend" and self.defender() == viewer_id,
            "can_transfer": can_transfer,
            "can_throw": can_throw,
            "can_catch": can_catch,
            "cheats": cheats,
            "mode": self.mode,
            "shulers": self.shulers,
            "throw_all": self.throw_all,
            "deck_size": self.deck_size,
            "order": list(self.order),
            "transferred": list(self.transferred),
            "ended": self.ended,
            "finished": self.finished,
            "winner": self.winner,
            "round": self.round,
            "discard": len(self.discard),
            "last_event": self.last_event,
            "opponent": opponent,
            "opponent_cards": len(self.hands[opponent]) if opponent else 0,
            "defender_cards": len(self.hands[self.defender()]),
        }
