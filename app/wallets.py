import sqlite3
from pathlib import Path
from typing import Optional

import config


class WalletStore:
    START_BALANCE = 10000

    def __init__(self, path: Optional[str] = None):
        self.path = path or config.WALLET_DB or str(Path(config.BASE_DIR) / "wallets.db")
        self._init_db()

    def _connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        conn = self._connect()
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS wallets ("
                " pid TEXT PRIMARY KEY,"
                " balance INTEGER NOT NULL DEFAULT 0)"
            )
            conn.commit()
        finally:
            conn.close()

    def balance_of(self, pid: str) -> int:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT balance FROM wallets WHERE pid=?", (pid,)
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            self._set(pid, self.START_BALANCE)
            return self.START_BALANCE
        return row["balance"]

    def _set(self, pid: str, balance: int) -> None:
        conn = self._connect()
        try:
            conn.execute(
                "INSERT INTO wallets(pid, balance) VALUES(?, ?)"
                " ON CONFLICT(pid) DO UPDATE SET balance=excluded.balance",
                (pid, balance),
            )
            conn.commit()
        finally:
            conn.close()

    def transfer(self, loser: str, winner: str, stake: int) -> None:
        if stake <= 0 or loser == winner:
            return
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            lb = conn.execute(
                "SELECT balance FROM wallets WHERE pid=?", (loser,)
            ).fetchone()
            wb = conn.execute(
                "SELECT balance FROM wallets WHERE pid=?", (winner,)
            ).fetchone()
            l_bal = lb["balance"] if lb else self.START_BALANCE
            w_bal = wb["balance"] if wb else self.START_BALANCE
            l_bal = max(0, l_bal - stake)
            w_bal = w_bal + stake
            conn.execute(
                "INSERT INTO wallets(pid, balance) VALUES(?, ?)"
                " ON CONFLICT(pid) DO UPDATE SET balance=excluded.balance",
                (loser, l_bal),
            )
            conn.execute(
                "INSERT INTO wallets(pid, balance) VALUES(?, ?)"
                " ON CONFLICT(pid) DO UPDATE SET balance=excluded.balance",
                (winner, w_bal),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
