#!/usr/bin/env python3
"""Autonomous DB connectivity via python-oracledb (thin mode — no Instant Client).

Free-tier ATP is mTLS-only, so connection uses the wallet you download from the
console/CLI. Configure via env:

    KLADEN_ATP_USER        db user (e.g. ADMIN, or a dedicated KLADEN user)
    KLADEN_ATP_PASSWORD    that user's password
    KLADEN_ATP_DSN         TNS alias from the wallet, e.g. kladendb_high
    KLADEN_ATP_WALLET_DIR  path to the unzipped wallet directory
    KLADEN_ATP_WALLET_PASSWORD   wallet password (set when you downloaded it)

Smoke test once ATP + wallet exist:

    KLADEN_ATP_USER=ADMIN KLADEN_ATP_PASSWORD=... KLADEN_ATP_DSN=kladendb_high \\
    KLADEN_ATP_WALLET_DIR=./deploy/wallet KLADEN_ATP_WALLET_PASSWORD=... \\
    python3 backend/atp.py healthcheck
"""
from __future__ import annotations

import os
import sys


def _env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f"{name} is not set (see backend/atp.py docstring)")
    return v


def connect():
    """Open a thin-mode oracledb connection.

    ATP is mTLS, so set KLADEN_ATP_WALLET_DIR (+ wallet password) and the wallet
    params are used. Without a wallet dir it's a plain connection — handy for a
    local Oracle (e.g. gvenzl/oracle-free) with dsn=localhost:1521/FREEPDB1.
    """
    import oracledb  # lazy so the app runs without it

    kw = dict(
        user=_env("KLADEN_ATP_USER"),
        password=_env("KLADEN_ATP_PASSWORD"),
        dsn=_env("KLADEN_ATP_DSN"),
    )
    wallet = os.environ.get("KLADEN_ATP_WALLET_DIR")
    if wallet:
        kw.update(
            config_dir=wallet,
            wallet_location=wallet,
            wallet_password=os.environ.get("KLADEN_ATP_WALLET_PASSWORD"),
        )
    return oracledb.connect(**kw)


def healthcheck() -> str:
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 'ok' FROM dual")
        (val,) = cur.fetchone()
        cur.execute("SELECT COUNT(*) FROM user_tables WHERE table_name IN "
                    "('ORGS','CLIENTS','PROFILES','STACKS','RUNS','USERS')")
        (tables,) = cur.fetchone()
    return f"connected: SELECT returned {val!r}; kladen tables present: {tables}/6"


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "healthcheck":
        try:
            print(healthcheck())
        except Exception as exc:  # noqa: BLE001 - CLI surface
            print(f"healthcheck failed: {exc}", file=sys.stderr)
            sys.exit(1)
    else:
        print(__doc__)
