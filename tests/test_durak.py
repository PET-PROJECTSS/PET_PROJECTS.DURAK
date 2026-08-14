import random
import unittest

from game.durak import RANKS_24, RANKS_36, RANKS_52, Card, DurakError, DurakGame


class CardTests(unittest.TestCase):
    def test_code_roundtrip(self):
        self.assertEqual(Card("10H").code(), "10H")
        self.assertEqual(Card("6C").rank, "6")
        self.assertEqual(Card("AS").suit, "S")

    def test_beats_same_suit(self):
        self.assertTrue(Card("10S").beats(Card("9S"), "H"))
        self.assertFalse(Card("9S").beats(Card("10S"), "H"))

    def test_trump_beats_any(self):
        self.assertTrue(Card("6H").beats(Card("AS"), "H"))

    def test_trump_beats_trump_by_rank(self):
        self.assertTrue(Card("JH").beats(Card("7H"), "H"))
        self.assertFalse(Card("7H").beats(Card("JH"), "H"))


class GameTests(unittest.TestCase):
    def test_deal_counts(self):
        random.seed(42)
        g = DurakGame(["a", "b"])
        self.assertEqual(len(g.hands["a"]), 6)
        self.assertEqual(len(g.hands["b"]), 6)
        self.assertEqual(len(g.deck), 23)
        self.assertIsNotNone(g.trump_card)

    def test_take_flow(self):
        random.seed(42)
        g = DurakGame(["a", "b"])
        atk = g.attacker()
        card = g.hands[atk][0].code()
        before = len(g.hands[atk])
        g.attack(atk, card)
        defender = g.defender()
        g.take(defender)
        self.assertEqual(g.table, [])
        self.assertEqual(g.attacker(), atk)
        self.assertGreaterEqual(len(g.hands[defender]), before)
        self.assertEqual(g.turn, "attack")

    def test_take_attacker_continues(self):
        g = DurakGame(["a", "b"], first_attacker="a")
        g.hands["a"] = [Card("7S"), Card("9D")]
        g.hands["b"] = [Card("8C")]
        g.attack("a", "7S")
        g.take("b")
        self.assertEqual(g.attacker(), "a")

    def test_after_beat_two_players_defender_attacks(self):
        g = DurakGame(["a", "b"], first_attacker="a")
        g.hands["a"] = [Card("7S"), Card("9D")]
        g.hands["b"] = [Card("8S")]
        g.attack("a", "7S")
        g.beat("b", "7S", "8S")
        self.assertEqual(g.turn, "attack")
        g.done("a")
        self.assertEqual(g.attacker(), "b")

    def test_throw_second_card_before_beat(self):
        g = DurakGame(["a", "b"], first_attacker="a")
        g.hands["a"] = [Card("7S"), Card("7H"), Card("9D")]
        g.hands["b"] = [Card("6C"), Card("8C")]
        g.attack("a", "7S")
        self.assertEqual(g.turn, "defend")
        self.assertTrue(g.public_state("a")["can_throw"])
        g.attack("a", "7H")
        self.assertEqual(len(g.table), 2)
        self.assertEqual(g.pending, 2)
        self.assertEqual(g.turn, "defend")

    def test_defender_cannot_throw_while_defending(self):
        g = DurakGame(["a", "b"], first_attacker="a")
        g.hands["a"] = [Card("7S"), Card("9D")]
        g.hands["b"] = [Card("7C"), Card("8C")]
        g.attack("a", "7S")
        with self.assertRaises(DurakError):
            g.attack("b", "7C")

    def test_wrong_turn_raises(self):
        random.seed(7)
        g = DurakGame(["a", "b"])
        other = g.defender()
        with self.assertRaises(DurakError):
            g.attack(other, g.hands[other][0].code())

    def test_done_before_attack_raises(self):
        random.seed(7)
        g = DurakGame(["a", "b"])
        with self.assertRaises(DurakError):
            g.done(g.attacker())

    def test_take_passes_all_table_cards(self):
        random.seed(3)
        g = DurakGame(["a", "b"])
        atk = g.attacker()
        first = g.hands[atk][0]
        g.attack(atk, first.code())
        defender = g.defender()
        hand_before = len(g.hands[defender])
        g.take(defender)
        self.assertEqual(len(g.hands[defender]), hand_before + 1)

    def test_endgame_take_out(self):
        g = DurakGame(["a", "b"], first_attacker="a")
        g.deck = []
        g.trump_card = None
        g.hands["a"] = [Card("9D")]
        g.hands["b"] = [Card("6H")]
        g.attack("a", "9D")
        g.take("b")
        self.assertTrue(g.finished)
        self.assertEqual(g.ended, ["a"])
        self.assertEqual(g.winner, "b")

    def test_endgame_beat_out(self):
        g = DurakGame(["a", "b"], first_attacker="a")
        g.deck = []
        g.trump_card = None
        g.hands["a"] = [Card("7H"), Card("6H")]
        g.hands["b"] = [Card("8H")]
        g.attack("a", "6H")
        g.beat("b", "6H", "8H")
        self.assertEqual(g.pending, 0)
        self.assertEqual(g.turn, "attack")
        g.done("a")
        self.assertTrue(g.finished)
        self.assertEqual(g.ended, ["b"])
        self.assertEqual(g.winner, "a")

    def test_draw_up_to_six(self):
        g = DurakGame(["a", "b"], first_attacker="a")
        g.hands["a"] = [Card("6H")]
        g.hands["b"] = [Card("6S")]
        g.deck = [Card("7C"), Card("8C"), Card("9C"), Card("10C"), Card("JC"), Card("QC"), Card("KC"), Card("AC"), Card("6D"), Card("7D")]
        g._draw_after_round()
        self.assertEqual(len(g.hands["a"]), 6)
        self.assertEqual(len(g.hands["b"]), 6)

    def test_three_players_deal(self):
        random.seed(42)
        g = DurakGame(["a", "b", "c"])
        self.assertEqual(len(g.hands["a"]), 6)
        self.assertEqual(len(g.hands["b"]), 6)
        self.assertEqual(len(g.hands["c"]), 6)

    def test_deck_24(self):
        random.seed(42)
        g = DurakGame(["a", "b"], deck_size=24)
        self.assertEqual(len(g.deck), 11)
        self.assertEqual(len(g.hands["a"]), 6)
        self.assertEqual(len(g.hands["b"]), 6)

    def test_deck_52(self):
        random.seed(42)
        g = DurakGame(["a", "b"], deck_size=52)
        self.assertEqual(len(g.deck), 39)
        self.assertEqual(len(g.hands["a"]), 6)
        self.assertEqual(len(g.hands["b"]), 6)

    def test_52_cards_unique_full_ranks(self):
        g = DurakGame(["a", "b"], deck_size=52)
        all_cards = g.hands["a"] + g.hands["b"] + g.deck + [g.trump_card]
        self.assertEqual(len(all_cards), 52)
        self.assertEqual(len({c.code() for c in all_cards}), 52)
        ranks = sorted({c.rank for c in all_cards})
        self.assertEqual(ranks, ["10", "2", "3", "4", "5", "6", "7", "8", "9", "A", "J", "K", "Q"])

    def test_deck_36_has_no_low_ranks(self):
        for seed in range(1, 30):
            random.seed(seed)
            g = DurakGame(["a", "b"], deck_size=36)
            all_cards = g.hands["a"] + g.hands["b"] + g.deck + [g.trump_card]
            self.assertEqual(len(all_cards), 36)
            self.assertEqual(len({c.code() for c in all_cards}), 36)
            for c in all_cards:
                self.assertIn(c.rank, RANKS_36, f"rank {c.rank} is not allowed in 36-card deck")

    def test_deck_24_has_no_low_ranks(self):
        for seed in range(1, 30):
            random.seed(seed)
            g = DurakGame(["a", "b"], deck_size=24)
            all_cards = g.hands["a"] + g.hands["b"] + g.deck + [g.trump_card]
            self.assertEqual(len(all_cards), 24)
            self.assertEqual(len({c.code() for c in all_cards}), 24)
            for c in all_cards:
                self.assertIn(c.rank, RANKS_24, f"rank {c.rank} is not allowed in 24-card deck")

    def test_52_deck_covers_all_ranks(self):
        for seed in range(1, 30):
            random.seed(seed)
            g = DurakGame(["a", "b"], deck_size=52)
            all_cards = g.hands["a"] + g.hands["b"] + g.deck + [g.trump_card]
            self.assertEqual(len(all_cards), 52)
            self.assertEqual(len({c.code() for c in all_cards}), 52)
            self.assertEqual(set(c.rank for c in all_cards), set(RANKS_52))

    def test_no_duplicate_cards_between_players(self):
        for seed in range(1, 50):
            for deck in (24, 36, 52):
                random.seed(seed)
                g = DurakGame(["a", "b"], deck_size=deck)
                self.assertEqual(len({c.code() for c in g.hands["a"] + g.hands["b"]}),
                                 len(g.hands["a"]) + len(g.hands["b"]),
                                 f"duplicate card dealt in {deck}-card deck (seed {seed})")


    def test_low_ranks_parse_and_beat(self):
        self.assertEqual(Card("2C").rank, "2")
        self.assertEqual(Card("5H").suit, "H")
        self.assertTrue(Card("5C").beats(Card("2C"), "D"))
        self.assertFalse(Card("2C").beats(Card("3C"), "D"))
        self.assertTrue(Card("AC").beats(Card("5C"), "D"))
        self.assertTrue(Card("2H").beats(Card("AC"), "H"))

    def test_transfer_moves_defender(self):
        g = DurakGame(["a", "b", "c"], first_attacker="a", mode="perevodnoi")
        g.hands["a"] = [Card("9D")]
        g.hands["b"] = [Card("9C")]
        g.hands["c"] = [Card("8C")]
        g.attack("a", "9D")
        self.assertEqual(g.defender(), "b")
        g.transfer("b", "9C")
        self.assertEqual(g.defender(), "c")
        self.assertIn("b", g.transferred)
        self.assertEqual(len(g.table), 2)
        self.assertEqual(g.pending, 2)
        self.assertEqual(g.turn, "defend")

    def test_transfer_requires_same_rank(self):
        g = DurakGame(["a", "b", "c"], first_attacker="a", mode="perevodnoi")
        g.hands["a"] = [Card("9D")]
        g.hands["b"] = [Card("8C")]
        g.hands["c"] = [Card("8H")]
        g.attack("a", "9D")
        with self.assertRaises(DurakError):
            g.transfer("b", "8C")

    def test_transfer_only_unbeaten_first_card(self):
        g = DurakGame(["a", "b", "c"], first_attacker="a", mode="perevodnoi")
        g.hands["a"] = [Card("9D"), Card("9H")]
        g.hands["b"] = [Card("9C"), Card("10D"), Card("6S")]
        g.hands["c"] = [Card("7S")]
        g.attack("a", "9D")
        g.beat("b", "9D", "10D")
        g.attack("a", "9H")
        with self.assertRaises(DurakError):
            g.transfer("b", "9C")

    def test_transfer_no_recipient_raises(self):
        g = DurakGame(["a", "b", "c"], first_attacker="a", mode="perevodnoi")
        g.hands["a"] = [Card("9D")]
        g.hands["b"] = [Card("9C")]
        g.hands["c"] = [Card("9H")]
        g.attack("a", "9D")
        g.transfer("b", "9C")
        with self.assertRaises(DurakError):
            g.transfer("c", "9H")

    def test_take_after_transfer(self):
        g = DurakGame(["a", "b", "c"], first_attacker="a", mode="perevodnoi")
        g.hands["a"] = [Card("9D")]
        g.hands["b"] = [Card("9C")]
        g.hands["c"] = [Card("8C")]
        g.attack("a", "9D")
        g.transfer("b", "9C")
        g.take("c")
        self.assertEqual(g.attacker(), "a")
        self.assertEqual(g.transferred, set())
        self.assertEqual(g.table, [])
        for code in ("8C", "9D", "9C"):
            self.assertIn(Card(code), g.hands["c"])

    def test_transfer_full_beat_round(self):
        g = DurakGame(["a", "b", "c"], first_attacker="a", mode="perevodnoi")
        g.hands["a"] = [Card("9D")]
        g.hands["b"] = [Card("9C")]
        g.hands["c"] = [Card("10D"), Card("QC")]
        g.attack("a", "9D")
        g.transfer("b", "9C")
        g.beat("c", "9D", "10D")
        g.beat("c", "9C", "QC")
        self.assertEqual(g.pending, 0)
        self.assertEqual(g.turn, "attack")
        g.done("a")
        self.assertEqual(g.attacker(), "a")
        self.assertFalse(g.finished)

    def test_throw_all_allows_anyone_to_add(self):
        g = DurakGame(["a", "b", "c"], first_attacker="a", throw_all=True)
        g.hands["a"] = [Card("9D")]
        g.hands["b"] = [Card("10D"), Card("6S"), Card("6H")]
        g.hands["c"] = [Card("9C")]
        g.attack("a", "9D")
        g.beat("b", "9D", "10D")
        self.assertEqual(g.turn, "attack")
        g.attack("c", "9C")
        self.assertEqual(g.turn, "defend")
        self.assertEqual(g.defender(), "b")

    def test_throw_all_only_attacker_when_off(self):
        g = DurakGame(["a", "b", "c"], first_attacker="a", throw_all=False)
        g.hands["a"] = [Card("9D")]
        g.hands["b"] = [Card("10D"), Card("6S"), Card("6H")]
        g.hands["c"] = [Card("9C")]
        g.attack("a", "9D")
        g.beat("b", "9D", "10D")
        with self.assertRaises(DurakError):
            g.attack("c", "9C")

    def test_can_transfer_flag(self):
        g = DurakGame(["a", "b", "c"], first_attacker="a", mode="perevodnoi")
        g.hands["a"] = [Card("9D")]
        g.hands["b"] = [Card("9C")]
        g.hands["c"] = [Card("8C")]
        g.attack("a", "9D")
        st = g.public_state("b")
        self.assertTrue(st["can_transfer"])
        st_c = g.public_state("c")
        self.assertFalse(st_c["can_transfer"])

    def test_transfer_multiple_unbeaten_cards(self):
        g = DurakGame(["a", "b", "c", "d"], first_attacker="a", mode="perevodnoi")
        g.hands["a"] = [Card("10D")]
        g.hands["b"] = [Card("10C"), Card("10S")]
        g.hands["c"] = [Card("10H")]
        g.hands["d"] = [Card("7S"), Card("8S")]
        g.attack("a", "10D")
        g.transfer("b", "10C")
        self.assertEqual(g.defender(), "c")
        self.assertEqual(len(g.table), 2)
        self.assertTrue(g.public_state("c")["can_transfer"])
        g.transfer("c", "10H")
        self.assertEqual(g.defender(), "d")
        self.assertEqual(len(g.table), 3)
        self.assertEqual(g.pending, 3)

    def test_transfer_all_beaten_cards_cannot_transfer(self):
        g = DurakGame(["a", "b", "c"], first_attacker="a", mode="perevodnoi")
        g.trump = "D"
        g.hands["a"] = [Card("9D")]
        g.hands["b"] = [Card("9C"), Card("10D")]
        g.hands["c"] = [Card("10D"), Card("QD"), Card("9H")]
        g.attack("a", "9D")
        g.transfer("b", "9C")
        g.beat("c", "9D", "10D")
        g.beat("c", "9C", "QD")
        with self.assertRaises(DurakError):
            g.transfer("c", "9H")

    def test_shulers_allows_illegal_beat(self):
        g = DurakGame(["a", "b"], first_attacker="a", shulers=True)
        g.trump = "C"
        g.hands["a"] = [Card("9C")]
        g.hands["b"] = [Card("10H")]
        g.attack("a", "9C")
        g.beat("b", "9C", "10H")
        self.assertEqual(g.pending, 0)
        self.assertEqual(g.turn, "attack")

    def test_no_shulers_rejects_illegal_beat(self):
        g = DurakGame(["a", "b"], first_attacker="a", shulers=False)
        g.trump = "C"
        g.hands["a"] = [Card("9C")]
        g.hands["b"] = [Card("10H")]
        g.attack("a", "9C")
        with self.assertRaises(DurakError):
            g.beat("b", "9C", "10H")

    def test_catch_returns_card_to_defender(self):
        g = DurakGame(["a", "b"], first_attacker="a", shulers=True)
        g.trump = "C"
        g.hands["a"] = [Card("9C")]
        g.hands["b"] = [Card("10H"), Card("8H")]
        g.attack("a", "9C")
        g.beat("b", "9C", "10H")
        self.assertEqual(g.pending, 0)
        st = g.public_state("a")
        self.assertTrue(st["can_catch"])
        self.assertEqual(st["cheats"], ["10H"])
        g.catch("a", "9C", "10H")
        self.assertIn(Card("10H"), g.hands["b"])
        self.assertEqual(g.table, [[Card("9C"), None]])
        self.assertEqual(g.pending, 1)
        self.assertEqual(g.turn, "defend")
        st2 = g.public_state("a")
        self.assertFalse(st2["can_catch"])

    def test_catch_honest_beat_raises(self):
        g = DurakGame(["a", "b"], first_attacker="a", shulers=True)
        g.trump = "D"
        g.hands["a"] = [Card("9C")]
        g.hands["b"] = [Card("10C")]
        g.attack("a", "9C")
        g.beat("b", "9C", "10C")
        with self.assertRaises(DurakError):
            g.catch("a", "9C", "10C")

    def test_shulers_done_accepts_cheat(self):
        g = DurakGame(["a", "b"], first_attacker="a", shulers=True)
        g.trump = "C"
        g.hands["a"] = [Card("9C"), Card("7D")]
        g.hands["b"] = [Card("10H"), Card("6S")]
        g.attack("a", "9C")
        g.beat("b", "9C", "10H")
        g.done("a")
        self.assertEqual(g.attacker(), "b")
        self.assertEqual(g.turn, "attack")


if __name__ == "__main__":
    unittest.main()
