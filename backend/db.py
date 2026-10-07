#!/usr/bin/env python3
"""Metadata store adapter — SQLite (default) or Oracle ATP (KLADEN_DB=atp).

The rest of the backend writes SQLite-flavoured SQL with `?` placeholders and
reads rows by column name, exactly as before. This module makes that same code
run on Oracle by wrapping the connection:

  - `?`         -> `:1, :2, ...`  (Oracle bind style)
  - `LIMIT n`   -> `FETCH FIRST n ROWS ONLY`
  - the runs column `mode` (reserved in Oracle) is `run_mode` in the DDL; it is
    renamed on the way in (INSERT) and back to `mode` on the way out (rows)
  - INSERTs get a `RETURNING id INTO ...` so `.lastrowid` keeps working

Timestamps and summary_json are VARCHAR2 in the Oracle schema, so the ISO
strings / JSON text the app already produces bind and read with no special
handling. With KLADEN_DB unset the app is plain SQLite — zero OCI/Oracle deps.
"""
from __future__ import annotations

import os
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "kladen.db"

DIALECT = "oracle" if os.environ.get("KLADEN_DB", "").lower() == "atp" else "sqlite"


def _to_oracle_sql(sql: str) -> str:
    sql = re.sub(r"\bLIMIT\s+(\d+)", r"FETCH FIRST \1 ROWS ONLY", sql, flags=re.IGNORECASE)
    sql = re.sub(r"\bmode\b", "run_mode", sql)  # only ever the runs column
    n = 0

    def bind(_: re.Match) -> str:
        nonlocal n
        n += 1
        return f":{n}"

    return re.sub(r"\?", bind, sql)


class Cur:
    """Cursor facade: dict-ish rows, run_mode->mode rename, sqlite passthrough."""

    def __init__(self, raw, dialect: str):
        self.raw = raw
        self.dialect = dialect
        self.lastrowid = None

    def _row(self, r):
        if r is None:
            return None
        if self.dialect == "sqlite":
            return r  # sqlite3.Row supports r["col"] and dict(r)
        d = {c[0].lower(): v for c, v in zip(self.raw.description, r)}
        if "run_mode" in d:
            d["mode"] = d.pop("run_mode")
        return d

    def fetchone(self):
        return self._row(self.raw.fetchone())

    def fetchall(self):
        return [self._row(r) for r in self.raw.fetchall()]

    def __iter__(self):
        return iter(self.fetchall())


class Conn:
    """Connection facade with SQL translation and INSERT ... RETURNING id."""

    def __init__(self, raw, dialect: str):
        self.raw = raw
        self.dialect = dialect

    def execute(self, sql: str, params: tuple = ()):  # noqa: D401
        if self.dialect == "sqlite":
            cur = self.raw.execute(sql, params)
            w = Cur(cur, "sqlite")
            w.lastrowid = cur.lastrowid
            return w

        import oracledb  # lazy

        osql = _to_oracle_sql(sql)
        cur = self.raw.cursor()
        if sql.lstrip()[:11].upper() == "INSERT INTO":
            # RETURNING id INTO a NUMBER var only works for the auto-increment
            # tables. When the caller supplies the id itself (e.g. users.id is a
            # string), that column is in the INSERT list — skip RETURNING then,
            # or Oracle raises ORA-01722 trying to coerce a text id to a number.
            m = re.match(r"\s*INSERT\s+INTO\s+\w+\s*\(([^)]*)\)", sql, re.IGNORECASE)
            cols = [c.strip().lower() for c in m.group(1).split(",")] if m else []
            if "id" not in cols:
                out = cur.var(oracledb.NUMBER)
                cur.execute(f"{osql} RETURNING id INTO :{len(params) + 1}", [*params, out])
                w = Cur(cur, "oracle")
                got = out.getvalue()
                w.lastrowid = int(got[0]) if got else None
                return w
        cur.execute(osql, params)
        return Cur(cur, "oracle")

    def executescript(self, script: str) -> None:
        # Table creation is SQLite-only; on Oracle the schema is pre-created
        # (deploy/sql/schema_atp.sql).
        if self.dialect == "sqlite":
            self.raw.executescript(script)

    def commit(self) -> None:
        self.raw.commit()

    def close(self) -> None:
        self.raw.close()


def connect() -> Conn:
    if DIALECT == "oracle":
        import atp  # lazy: only when KLADEN_DB=atp
        import oracledb
        # Fetch CLOBs as plain strings so summary_json round-trips whether the
        # column is VARCHAR2 (current schema) or CLOB (older deployments).
        oracledb.defaults.fetch_lobs = False
        return Conn(atp.connect(), "oracle")
    raw = sqlite3.connect(DB_PATH)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA foreign_keys=ON")
    return Conn(raw, "sqlite")
