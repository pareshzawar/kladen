#!/usr/bin/env python3
"""Kladen API — clients, configuration profiles, stacks, runs (v1 dev server).

Single-file stdlib service on :8400: SQLite/ATP persistence, one worker thread
executing runs through runner.py (serialized — the state lock would serialize a
stack anyway), JSON API consumed by the frontend through the Vite dev proxy.

Auth: email/password login issues a bearer token (in-memory session); every
route declares a minimum role. junior = design + plan; senior = + approve /
apply / destroy + credentials; admin = + user management. Demo accounts are
seeded (see DEMO_USERS) so each role is testable.

Configuration profiles are scoped two ways and resolved per run:

    stack pin -> client profile matching the stack's env -> any client
    profile -> org-level default (client_id NULL)

Org-level = the Kladen customer (the MSP workspace); client-level = that
client's own OCI tenancy credentials. Profiles come in two modes:

    manual : credentials in the DB; the private key is a path on disk
             (never the key itself), mounted read-only into the runner.
    vault  : credentials live in an OCI Vault secret; the DB holds only the
             secret OCID. At run time the backend fetches the bundle, writes
             the PEM to a private temp file, and the run proceeds identically.

Both paths always work — vault mode needs a vault to exist first, which you
bootstrap with a manual profile (see deploy/). On first boot the DB is seeded
with the demo org/clients/stacks, and ~/.oci/config DEFAULT (when present)
becomes the org default profile.

Run lifecycle: validate/plan -> queued -> running -> succeeded|failed.
apply/destroy start as awaiting_approval; POST approve queues them,
POST reject ends them. Artifacts live in backend/data/runs/<id>/ and, when
KLADEN_ARTIFACTS_BUCKET is set, are mirrored to Object Storage.
"""
from __future__ import annotations

import configparser
import datetime
import decimal
import hashlib
import hmac
import json
import os
import queue
import re
import secrets
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import db as dbmod
import runner

PORT = 8400
ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
DATA = ROOT / "data"
RUNS_DIR = DATA / "runs"
DB_PATH = dbmod.DB_PATH
STATE_BASE = "http://host.docker.internal:8300/state"

SCHEMA = """
CREATE TABLE orgs(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE users(
  id TEXT PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  client_id INTEGER REFERENCES clients(id),  -- tenant scope: NULL = whole workspace (MSP staff / super-admin); set = one customer only
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL);
CREATE TABLE clients(id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id), name TEXT NOT NULL);
CREATE TABLE profiles(
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  client_id INTEGER REFERENCES clients(id),
  name TEXT NOT NULL,
  env TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',   -- manual | oci-config | vault
  region TEXT,
  tenancy_ocid TEXT,                        -- manual-mode credential fields
  user_ocid TEXT,
  fingerprint TEXT,
  key_path TEXT,
  compartment_ocid TEXT NOT NULL DEFAULT '',
  vault_id TEXT,                            -- vault-mode pointers
  secret_ocid TEXT);
CREATE TABLE stacks(
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  env TEXT NOT NULL,
  profile_id INTEGER REFERENCES profiles(id),
  workspace TEXT);
CREATE TABLE runs(
  id INTEGER PRIMARY KEY,
  stack_id INTEGER NOT NULL REFERENCES stacks(id),
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  requested_by TEXT NOT NULL DEFAULT 'sofia',
  approved_by TEXT,
  detail TEXT NOT NULL DEFAULT '',
  summary_json TEXT NOT NULL DEFAULT '{}',
  artifacts_prefix TEXT);
"""

MODES = ("validate", "plan", "apply", "destroy", "drift")
APPROVAL_MODES = ("apply", "destroy")  # drift is read-only, no approval

# ---- roles & auth --------------------------------------------------------
# Roles are capabilities, not a single ladder (management is a business view,
# not "more/less" than junior). Routes declare which roles they allow.
#   junior     : design + validate/plan
#   senior     : + approve/apply/destroy + credentials
#   management : business views only (dashboard, reports) + read-only builder;
#                no plan, no deploy, no credentials
#   admin      : everything + user management
ROLES = ("junior", "senior", "management", "admin")
ANY_ROLE = frozenset(ROLES)                              # any signed-in user
DESIGN_ROLES = frozenset({"junior", "senior", "admin"})  # design, plan, register
DEPLOY_ROLES = frozenset({"senior", "admin"})            # apply/destroy, approve, credentials
ADMIN_ROLES = frozenset({"admin"})                       # user management

# Demo accounts seeded so every role is testable out of the box. Change or
# remove these before any real exposure. The last field is the customer scope:
# None = workspace-wide (MSP staff / super-admin); a client NAME = scoped to that
# customer only, so isolation is testable (admin@acme.io sees only Acme Retail).
DEMO_USERS = [
    ("u-sofia", "Sofia Marek", "admin@meridian.io", "admin", "admin123", None),
    ("u-priya", "Priya Nair", "senior@meridian.io", "senior", "senior123", None),
    ("u-rahul", "Rahul Iyer", "junior@meridian.io", "junior", "junior123", None),
    ("u-morgan", "Morgan Diaz", "manager@meridian.io", "management", "manager123", None),
    ("u-dana", "Dana Okoye", "admin@acme.io", "admin", "acme123", "Acme Retail"),
]

# In-memory sessions: bearer token -> user dict. Cleared on restart (re-login);
# fine for a single-process dev server. A real deployment uses a sessions table.
SESSIONS: dict[str, dict] = {}
_sessions_lock = threading.Lock()


def hash_pw(pw: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex()
    return f"pbkdf2$200000${salt}${h}"


def verify_pw(pw: str, stored: str) -> bool:
    try:
        _algo, iters, salt, expected = stored.split("$")
        got = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), int(iters)).hex()
        return hmac.compare_digest(got, expected)
    except (ValueError, AttributeError):
        return False


def public_user(row) -> dict:
    """A user dict safe to return over the API (no password hash). Carries the
    tenant scope (`client_id`, None for workspace-wide users) so the session and
    the frontend both know what this user is allowed to see."""
    d = {k: row[k] for k in ("id", "name", "email", "role")}
    try:
        d["client_id"] = row["client_id"]
    except (KeyError, IndexError):
        d["client_id"] = None  # very old rows read before the column existed
    return d

# Generated workspaces live here, one directory per stack. The runner mounts
# the directory into the OpenTofu container.
WORKSPACES = DATA / "workspaces"

# Only plain .tf filenames are accepted from the client — no paths, no traversal.
SAFE_TF_NAME = re.compile(r"[A-Za-z0-9_.-]+\.tf")

# The runner injects the http-backend connection at init; the workspace only has
# to declare that it uses one. Written by the platform, never by codegen, so a
# generated workspace can't accidentally point state somewhere else.
BACKEND_TF = """\
# State is held by the Kladen state service over OpenTofu's http backend.
# Address, lock and unlock URLs are injected by the runner at init time.
terraform {
  backend "http" {}
}
"""


def db() -> "dbmod.Conn":
    return dbmod.connect()


def now() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds")


def migrate(conn) -> None:
    """Additive migration for SQLite dev DBs created before dual-mode profiles."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(profiles)").fetchall()}
    for col in ("vault_id", "secret_ocid"):
        if col not in cols:
            conn.execute(f"ALTER TABLE profiles ADD COLUMN {col} TEXT")
    run_cols = {r[1] for r in conn.execute("PRAGMA table_info(runs)").fetchall()}
    if "artifacts_prefix" not in run_cols:
        conn.execute("ALTER TABLE runs ADD COLUMN artifacts_prefix TEXT")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users("
        "id TEXT PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id),"
        "client_id INTEGER REFERENCES clients(id), name TEXT NOT NULL,"
        "email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, password_hash TEXT NOT NULL)")
    # Per-customer isolation: add the tenant scope to users tables made before it.
    user_cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "client_id" not in user_cols:
        conn.execute("ALTER TABLE users ADD COLUMN client_id INTEGER")
    conn.commit()


def ensure_users(conn, org_id: int) -> None:
    """Insert any demo users that are missing (idempotent, both engines).

    Resolves each demo user's customer scope by client NAME → client_id, so the
    scoped demo admin (admin@acme.io) lands on whatever id Acme Retail got.
    """
    for uid, name, email, role, pw, client_name in DEMO_USERS:
        if conn.execute("SELECT id FROM users WHERE id=?", (uid,)).fetchone():
            continue
        client_id = None
        if client_name:
            row = conn.execute("SELECT id FROM clients WHERE name=?", (client_name,)).fetchone()
            client_id = row["id"] if row else None
        conn.execute(
            "INSERT INTO users(id,org_id,client_id,name,email,role,password_hash) VALUES(?,?,?,?,?,?,?)",
            (uid, org_id, client_id, name, email, role, hash_pw(pw)))
    conn.commit()


def seed() -> None:
    DATA.mkdir(exist_ok=True)
    RUNS_DIR.mkdir(exist_ok=True)
    conn = db()
    fresh = True
    if dbmod.DIALECT == "sqlite":
        if conn.execute("SELECT name FROM sqlite_master WHERE name='orgs'").fetchone():
            migrate(conn)
            fresh = False
        else:
            conn.executescript(SCHEMA)
    else:
        # Oracle: tables pre-created by deploy/sql/schema_atp.sql. Seed the demo
        # data only when the store is still empty.
        fresh = (conn.execute("SELECT COUNT(*) AS c FROM orgs").fetchone()["c"] or 0) == 0

    if not fresh:
        # Existing store: still make sure the demo login accounts exist, then done.
        org_id = conn.execute("SELECT id FROM orgs ORDER BY id LIMIT 1").fetchone()["id"]
        ensure_users(conn, org_id)
        conn.close()
        return

    org = conn.execute("INSERT INTO orgs(name) VALUES('Meridian MSP')").lastrowid
    demo = {
        "Acme Retail": [
            ("ecommerce-core", "prod", str(REPO / "spike" / "workspace")),
            ("data-platform", "prod", None),
            ("edge-network", "staging", None),
        ],
        "Northwind Bank": [("core-banking", "prod", None), ("dr-site", "dr", None)],
        "Zephyr SaaS": [("platform-prod", "prod", None), ("analytics", "dev", None)],
    }
    for cname, stacks in demo.items():
        cid = conn.execute("INSERT INTO clients(org_id,name) VALUES(?,?)", (org, cname)).lastrowid
        for sname, env, ws in stacks:
            conn.execute("INSERT INTO stacks(client_id,name,env,workspace) VALUES(?,?,?,?)", (cid, sname, env, ws))
    # ~/.oci/config DEFAULT becomes the org-level default profile when present.
    oci_cfg = Path.home() / ".oci" / "config"
    if oci_cfg.exists():
        cp = configparser.ConfigParser()
        cp.read(oci_cfg)
        s = cp.defaults()
        if all(k in s for k in ("tenancy", "user", "fingerprint", "region", "key_file")):
            conn.execute(
                "INSERT INTO profiles(org_id,client_id,name,env,region,tenancy_ocid,user_ocid,fingerprint,key_path,source)"
                " VALUES(?,NULL,'default (imported)','',?,?,?,?,?,'oci-config')",
                (org, s["region"], s["tenancy"], s["user"], s["fingerprint"],
                 str(Path(s["key_file"]).expanduser())))
    ensure_users(conn, org)
    conn.commit()
    conn.close()


def resolve_profile(conn, stack):
    if stack["profile_id"]:
        p = conn.execute("SELECT * FROM profiles WHERE id=?", (stack["profile_id"],)).fetchone()
        if p:
            return p
    for q, args in (
        ("SELECT * FROM profiles WHERE client_id=? AND env=? ORDER BY id LIMIT 1", (stack["client_id"], stack["env"])),
        ("SELECT * FROM profiles WHERE client_id=? ORDER BY id LIMIT 1", (stack["client_id"],)),
        ("SELECT * FROM profiles WHERE client_id IS NULL ORDER BY id LIMIT 1", ()),
    ):
        p = conn.execute(q, args).fetchone()
        if p:
            return p
    return None


def materialize_profile(row) -> tuple[dict, "callable"]:
    """Turn a resolved profile row into the runner's profile dict.

    Manual profiles pass through with their on-disk key_path. Vault profiles
    are fetched from OCI Vault, and the private key is written to a 0600 temp
    file used only for this run; the returned cleanup removes it.
    """
    if row is None:
        return {}, lambda: None
    if row["source"] == "vault":
        import vault as vaultmod  # lazy: only vault profiles need the OCI SDK
        bundle = vaultmod.get_secret(row["secret_ocid"])
        tmp = tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False)
        tmp.write(bundle["private_key_pem"])
        tmp.close()
        os.chmod(tmp.name, 0o600)
        profile = {
            "tenancy_ocid": bundle.get("tenancy_ocid", ""),
            "user_ocid": bundle.get("user_ocid", ""),
            "fingerprint": bundle.get("fingerprint", ""),
            "region": bundle.get("region", ""),
            "compartment_ocid": bundle.get("compartment_ocid", ""),
            "key_path": tmp.name,
        }
        return profile, lambda: Path(tmp.name).unlink(missing_ok=True)
    return dict(row), lambda: None


RUN_QUEUE: "queue.Queue[int]" = queue.Queue()


def worker() -> None:
    while True:
        run_id = RUN_QUEUE.get()
        conn = db()
        run = conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        if not run or run["status"] != "queued":
            conn.close()
            continue
        stack = conn.execute("SELECT * FROM stacks WHERE id=?", (run["stack_id"],)).fetchone()
        profile_row = resolve_profile(conn, stack)
        conn.execute("UPDATE runs SET status='running', started_at=? WHERE id=?", (now(), run_id))
        conn.commit()
        try:
            if not stack["workspace"]:
                raise RuntimeError("stack has no workspace configured yet (codegen from the design lands later)")
            if run["mode"] != "validate" and profile_row is None:
                raise RuntimeError("no configuration profile resolves for this stack — add one under Profiles")
            # Vault-mode profiles are fetched and the key written to a temp file
            # here; cleanup wipes it whether the run succeeds or fails.
            profile, cleanup = materialize_profile(profile_row)
            try:
                result = runner.execute(run["mode"], Path(stack["workspace"]), profile,
                                        RUNS_DIR / str(run_id), f"{STATE_BASE}/stack-{stack['id']}")
            finally:
                cleanup()
            # "ok" (validate/plan/apply), "clean"/"drift" (a drift check) are all
            # successful outcomes; only *_failed statuses are real failures.
            ok = result.get("status") in ("ok", "clean", "drift")
            prefix = upload_artifacts(run_id)
            conn.execute("UPDATE runs SET status=?, finished_at=?, detail=?, summary_json=?, artifacts_prefix=? WHERE id=?",
                         ("succeeded" if ok else "failed", now(), result.get("status", ""),
                          json.dumps(result.get("summary", {})), prefix, run_id))
        except Exception as exc:  # surfaced to the UI via run.detail
            conn.execute("UPDATE runs SET status='failed', finished_at=?, detail=? WHERE id=?",
                         (now(), str(exc), run_id))
        conn.commit()
        conn.close()


# Continuous drift monitoring (Phase 3). Opt-in: set KLADEN_DRIFT_INTERVAL to a
# number of seconds to run periodic drift checks; 0/unset = manual "Check now"
# only. Off by default so the spike doesn't repeatedly hit the tenancy + Docker.
DRIFT_INTERVAL_S = int(os.environ.get("KLADEN_DRIFT_INTERVAL", "0"))


def drift_scheduler() -> None:
    """Background loop that periodically enqueues a drift check for every stack
    that can actually run one — has a workspace and a resolvable profile —
    skipping any that already have a drift run in flight (so slow runs never pile
    up). Attributed to 'scheduler'. Results flow into the same runs/posture view
    as manual checks, so nothing downstream needs to know it was scheduled."""
    if DRIFT_INTERVAL_S <= 0:
        return
    print(f"drift scheduler on · every {DRIFT_INTERVAL_S}s")
    while True:
        time.sleep(DRIFT_INTERVAL_S)
        try:
            conn = db()
            stacks = conn.execute(
                "SELECT * FROM stacks WHERE workspace IS NOT NULL AND workspace != ''").fetchall()
            for st in stacks:
                if resolve_profile(conn, st) is None:
                    continue
                busy = conn.execute(
                    "SELECT 1 FROM runs WHERE stack_id=? AND mode='drift' AND status IN ('queued','running')"
                    " LIMIT 1", (st["id"],)).fetchone()
                if busy:
                    continue
                rid = conn.execute(
                    "INSERT INTO runs(stack_id,mode,status,created_at,requested_by) VALUES(?,?,?,?,?)",
                    (st["id"], "drift", "queued", now(), "scheduler")).lastrowid
                conn.commit()
                RUN_QUEUE.put(rid)
            conn.close()
        except Exception as exc:  # noqa: BLE001 - a scheduler hiccup must not kill the loop
            print(f"drift scheduler error: {exc}")


def upload_artifacts(run_id: int) -> str | None:
    """Mirror a run's local artifacts to Object Storage when configured.

    Best-effort: a storage failure must not fail the run, so it's logged to
    stderr and the run keeps its local artifacts. Returns the os:// prefix.
    """
    try:
        import objectstore  # lazy: only used when a bucket is configured
        return objectstore.upload_run_dir(run_id, RUNS_DIR / str(run_id))
    except Exception as exc:  # noqa: BLE001 - storage is non-fatal
        print(f"artifact upload for run {run_id} failed: {exc}")
        return None


def _jsonable(value):
    """Fallback encoder for values a DB driver returns that JSON can't take.

    Depending on column types, Oracle hands back datetime (TIMESTAMP), Decimal
    (NUMBER with scale) and LOB objects (CLOB). Rather than 500 on a schema
    variation, coerce them to sensible JSON.
    """
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    read = getattr(value, "read", None)  # oracledb LOB
    if callable(read):
        return read()
    return str(value)


def run_dict(row) -> dict:
    d = dict(row)
    d["summary"] = json.loads(d.pop("summary_json") or "{}")
    return d


class Api(BaseHTTPRequestHandler):
    def _json(self, code: int, payload) -> None:
        body = json.dumps(payload, default=_jsonable).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n) or b"{}")

    def _token(self) -> str | None:
        auth = self.headers.get("Authorization", "")
        return auth[7:].strip() if auth.startswith("Bearer ") else None

    def _route(self, method: str) -> None:
        path = self.path.split("?")[0]
        token = self._token()
        with _sessions_lock:
            self.user = SESSIONS.get(token) if token else None
        conn = db()
        try:
            for pattern, handler, allowed in ROUTES.get(method, []):
                m = re.fullmatch(pattern, path)
                if not m:
                    continue
                if allowed is not None:  # None == public (login, health)
                    if self.user is None:
                        self._json(401, {"error": "authentication required"})
                        return
                    if self.user["role"] not in allowed:
                        self._json(403, {"error": f"your role ({self.user['role']}) is not permitted here"})
                        return
                # Numeric ids stay ints (run/stack/profile); string ids (users) pass through.
                args = [int(g) if g.isdigit() else g for g in m.groups()]
                handler(self, conn, *args)
                return
            self._json(404, {"error": f"no route {method} {path}"})
        except Exception as exc:
            self._json(500, {"error": str(exc)})
        finally:
            conn.close()

    def do_GET(self) -> None: self._route("GET")
    def do_POST(self) -> None: self._route("POST")
    def do_PUT(self) -> None: self._route("PUT")
    def do_DELETE(self) -> None: self._route("DELETE")

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.command} {self.path} -> {args[1] if len(args) > 1 else ''}")

    # ---- auth handlers ----

    def login(self, conn) -> None:
        b = self._body()
        email = str(b.get("email", "")).strip().lower()
        row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if not row or not verify_pw(str(b.get("password", "")), row["password_hash"]):
            self._json(401, {"error": "invalid email or password"})
            return
        user = public_user(row)
        token = secrets.token_urlsafe(32)
        with _sessions_lock:
            SESSIONS[token] = user
        self._json(200, {"token": token, "user": user})

    def logout(self, conn) -> None:
        token = self._token()
        with _sessions_lock:
            SESSIONS.pop(token, None)
        self._json(200, {"ok": True})

    def me(self, conn) -> None:
        # Include the scoped client's name so the codegen service (which
        # introspects this endpoint to authenticate) can filter the design world
        # by tenant without a second lookup.
        user = dict(self.user)
        if user.get("client_id") is not None:
            row = conn.execute("SELECT name FROM clients WHERE id=?", (user["client_id"],)).fetchone()
            user["client_name"] = row["name"] if row else None
        self._json(200, {"user": user})

    def list_users(self, conn) -> None:
        # A customer-admin manages only their own client's users; a super-admin
        # (workspace scope) sees everyone.
        scope = self._scope()
        rows = (conn.execute("SELECT * FROM users WHERE client_id=? ORDER BY name", (scope,))
                if scope is not None else conn.execute("SELECT * FROM users ORDER BY name"))
        self._json(200, {"users": [public_user(r) for r in rows]})

    def create_user(self, conn) -> None:
        b = self._body()
        name = str(b.get("name", "")).strip()
        email = str(b.get("email", "")).strip().lower()
        role = str(b.get("role", "")).strip()
        password = str(b.get("password", ""))
        if not (name and email and role in ROLES and len(password) >= 6):
            self._json(400, {"error": "name, email, a valid role and a 6+ char password are required"})
            return
        if conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone():
            self._json(409, {"error": "a user with that email already exists"})
            return
        # Tenant scope of the new user: a customer-admin can only create users in
        # their OWN client; a super-admin may place a user in any client (by
        # client_id) or leave them workspace-wide (client_id omitted/null).
        scope = self._scope()
        if scope is not None:
            client_id = scope
        else:
            client_id = b.get("client_id")
            if client_id is not None and not conn.execute(
                    "SELECT id FROM clients WHERE id=?", (client_id,)).fetchone():
                self._json(400, {"error": "unknown client_id"})
                return
        org = conn.execute("SELECT id FROM orgs ORDER BY id LIMIT 1").fetchone()["id"]
        uid = f"u-{secrets.token_hex(6)}"
        conn.execute("INSERT INTO users(id,org_id,client_id,name,email,role,password_hash) VALUES(?,?,?,?,?,?,?)",
                     (uid, org, client_id, name, email, role, hash_pw(password)))
        conn.commit()
        self._json(201, public_user(conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()))

    def update_user(self, conn, uid: str) -> None:
        b = self._body()
        row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not row:
            self._json(404, {"error": "user not found"})
            return
        # A customer-admin can only manage users inside their own client.
        if not self._in_scope(row["client_id"]):
            self._deny_scope()
            return
        role = b.get("role")
        if role in ROLES and role != row["role"]:
            # Lockout guard: never demote the last workspace (super-)admin.
            if row["role"] == "admin" and role != "admin" and row["client_id"] is None and self._superadmin_count(conn) <= 1:
                self._json(409, {"error": "cannot demote the last super-admin"})
                return
            conn.execute("UPDATE users SET role=? WHERE id=?", (role, uid))
        if b.get("password"):
            conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_pw(str(b["password"])), uid))
        conn.commit()
        self._json(200, public_user(conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()))

    def delete_user(self, conn, uid: str) -> None:
        row = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not row:
            self._json(404, {"error": "user not found"})
            return
        if not self._in_scope(row["client_id"]):
            self._deny_scope()
            return
        if row["role"] == "admin" and row["client_id"] is None and self._superadmin_count(conn) <= 1:
            self._json(409, {"error": "cannot remove the last super-admin"})
            return
        conn.execute("DELETE FROM users WHERE id=?", (uid,))
        conn.commit()
        self._json(200, {"ok": True})

    @staticmethod
    def _admin_count(conn) -> int:
        return conn.execute("SELECT COUNT(*) AS c FROM users WHERE role='admin'").fetchone()["c"]

    @staticmethod
    def _superadmin_count(conn) -> int:
        """Workspace-wide admins (client_id NULL) — the accounts that can manage
        the whole platform. The lockout guard protects the LAST of these; losing
        a customer-scoped admin is recoverable (a super-admin can restore it)."""
        return conn.execute(
            "SELECT COUNT(*) AS c FROM users WHERE role='admin' AND client_id IS NULL").fetchone()["c"]

    # ---- tenant scope (per-customer isolation) ----
    # A user's client_id limits what they may see and touch: None = workspace-wide
    # (MSP staff / super-admin), set = one customer only. Route role-gates run
    # first (in _route); these run INSIDE handlers against the specific
    # client/stack/run/profile, so a scoped user can't reach across customers.

    def _scope(self):
        """This user's customer scope: a client_id, or None for workspace-wide."""
        return (self.user or {}).get("client_id")

    def _in_scope(self, client_id) -> bool:
        """May this user act on `client_id`? Workspace users may act on any."""
        s = self._scope()
        return s is None or s == client_id

    def _deny_scope(self) -> None:
        self._json(403, {"error": "outside your customer scope"})

    def _stack_client(self, conn, sid):
        r = conn.execute("SELECT client_id FROM stacks WHERE id=?", (sid,)).fetchone()
        return r["client_id"] if r else None

    def _run_client(self, conn, rid):
        r = conn.execute(
            "SELECT stacks.client_id AS cid FROM runs JOIN stacks ON stacks.id=runs.stack_id"
            " WHERE runs.id=?", (rid,)).fetchone()
        return r["cid"] if r else None

    def _profile_client(self, conn, pid):
        r = conn.execute("SELECT client_id FROM profiles WHERE id=?", (pid,)).fetchone()
        return r["client_id"] if r else None

    # ---- handlers ----

    def bootstrap(self, conn) -> None:
        # Everything here is scoped to the caller: a workspace user (scope None)
        # sees all clients; a customer-scoped user sees only their own client,
        # its stacks/profiles/runs/users, and none of the workspace-level data.
        org = dict(conn.execute("SELECT * FROM orgs ORDER BY id LIMIT 1").fetchone())
        scope = self._scope()

        # Workspace-default profiles are MSP-level creds — hidden from customers.
        org_profiles = [] if scope is not None else [dict(r) for r in conn.execute(
            "SELECT * FROM profiles WHERE client_id IS NULL ORDER BY id")]

        client_rows = (conn.execute("SELECT * FROM clients WHERE id=? ORDER BY id", (scope,)).fetchall()
                       if scope is not None
                       else conn.execute("SELECT * FROM clients ORDER BY id").fetchall())
        clients = []
        for c in client_rows:
            clients.append({
                **dict(c),
                "profiles": [dict(r) for r in conn.execute(
                    "SELECT * FROM profiles WHERE client_id=? ORDER BY id", (c["id"],))],
                "stacks": [dict(r) for r in conn.execute(
                    "SELECT * FROM stacks WHERE client_id=? ORDER BY id", (c["id"],))],
            })

        run_sql = (
            "SELECT runs.*, stacks.name AS stack_name, stacks.env AS env, clients.name AS client_name"
            " FROM runs JOIN stacks ON stacks.id=runs.stack_id JOIN clients ON clients.id=stacks.client_id")
        if scope is not None:
            runs = [run_dict(r) for r in conn.execute(
                run_sql + " WHERE stacks.client_id=? ORDER BY runs.id DESC LIMIT 30", (scope,))]
            users = [public_user(r) for r in conn.execute(
                "SELECT * FROM users WHERE client_id=? ORDER BY name", (scope,))]
        else:
            runs = [run_dict(r) for r in conn.execute(run_sql + " ORDER BY runs.id DESC LIMIT 30")]
            users = [public_user(r) for r in conn.execute("SELECT * FROM users ORDER BY name")]

        self._json(200, {"org": org, "profiles": org_profiles, "clients": clients, "runs": runs,
                         "store": dbmod.DIALECT, "users": users, "me": self.user,
                         "drift_interval_s": DRIFT_INTERVAL_S})

    def health(self, conn) -> None:
        # A successful count proves the metadata store is reachable — for ATP
        # that means the wallet, credentials, and schema are all good.
        n = conn.execute("SELECT COUNT(*) AS c FROM orgs").fetchone()["c"]
        self._json(200, {"ok": True, "store": dbmod.DIALECT, "orgs": n})

    def create_client(self, conn) -> None:
        # Clients ARE the tenants — only a workspace (super-admin) user makes one.
        if self._scope() is not None:
            self._deny_scope()
            return
        b = self._body()
        org = conn.execute("SELECT id FROM orgs ORDER BY id LIMIT 1").fetchone()["id"]
        cid = conn.execute("INSERT INTO clients(org_id,name) VALUES(?,?)", (org, b["name"])).lastrowid
        conn.commit()
        self._json(201, dict(conn.execute("SELECT * FROM clients WHERE id=?", (cid,)).fetchone()))

    def create_profile(self, conn) -> None:
        b = self._body()
        # A customer user may only add profiles to their own client — never a
        # workspace-default (client_id NULL) nor another customer's.
        scope = self._scope()
        if scope is not None and b.get("client_id") != scope:
            self._deny_scope()
            return
        org = conn.execute("SELECT id FROM orgs ORDER BY id LIMIT 1").fetchone()["id"]
        source = b.get("source", "manual")

        # Vault mode: the DB stores only pointers; credentials stay in OCI Vault.
        if source == "vault":
            missing = [k for k in ("name", "secret_ocid") if not b.get(k)]
            if missing:
                self._json(400, {"error": f"missing fields: {', '.join(missing)}"})
                return
            pid = conn.execute(
                "INSERT INTO profiles(org_id,client_id,name,env,source,region,tenancy_ocid,user_ocid,"
                "fingerprint,key_path,compartment_ocid,vault_id,secret_ocid)"
                " VALUES(?,?,?,?,'vault',?,'','','','',?,?,?)",
                (org, b.get("client_id"), b["name"], b.get("env", ""), b.get("region", ""),
                 b.get("compartment_ocid", ""), b.get("vault_id", ""), b["secret_ocid"])).lastrowid
            conn.commit()
            self._json(201, dict(conn.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone()))
            return

        # Manual mode: credentials in the DB, private key a path on disk.
        required = ("name", "region", "tenancy_ocid", "user_ocid", "fingerprint", "key_path")
        missing = [k for k in required if not b.get(k)]
        if missing:
            self._json(400, {"error": f"missing fields: {', '.join(missing)}"})
            return

        # Optional bridge: push these manual credentials into Vault and store a
        # vault-mode profile instead (point 5 — the migration path). Needs a
        # vault + master key; taken from the body or KLADEN_VAULT_* env.
        if b.get("store_in_vault"):
            try:
                secret_ocid = self._push_to_vault(b)
            except Exception as exc:  # noqa: BLE001 - surfaced to the caller
                self._json(400, {"error": f"could not store secret in Vault: {exc}"})
                return
            pid = conn.execute(
                "INSERT INTO profiles(org_id,client_id,name,env,source,region,tenancy_ocid,user_ocid,"
                "fingerprint,key_path,compartment_ocid,vault_id,secret_ocid)"
                " VALUES(?,?,?,?,'vault',?,'','','','',?,?,?)",
                (org, b.get("client_id"), b["name"], b.get("env", ""), b["region"],
                 b.get("compartment_ocid", ""),
                 b.get("vault_id") or os.environ.get("KLADEN_VAULT_ID", ""), secret_ocid)).lastrowid
            conn.commit()
            self._json(201, dict(conn.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone()))
            return

        pid = conn.execute(
            "INSERT INTO profiles(org_id,client_id,name,env,source,region,tenancy_ocid,user_ocid,fingerprint,key_path,compartment_ocid)"
            " VALUES(?,?,?,?,'manual',?,?,?,?,?,?)",
            (org, b.get("client_id"), b["name"], b.get("env", ""), b["region"], b["tenancy_ocid"],
             b["user_ocid"], b["fingerprint"], b["key_path"], b.get("compartment_ocid", ""))).lastrowid
        conn.commit()
        self._json(201, dict(conn.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone()))

    @staticmethod
    def _push_to_vault(b: dict) -> str:
        """Read the manual key, build a credential bundle, create a Vault secret."""
        import vault as vaultmod
        vault_id = b.get("vault_id") or os.environ.get("KLADEN_VAULT_ID")
        key_id = b.get("key_id") or os.environ.get("KLADEN_VAULT_KEY_ID")
        compartment = b.get("compartment_ocid") or os.environ.get("KLADEN_COMPARTMENT_ID")
        if not (vault_id and key_id and compartment):
            raise RuntimeError("set vault_id, key_id and compartment (body or KLADEN_VAULT_* env)")
        bundle = {
            "tenancy_ocid": b["tenancy_ocid"],
            "user_ocid": b["user_ocid"],
            "fingerprint": b["fingerprint"],
            "region": b["region"],
            "compartment_ocid": b.get("compartment_ocid", ""),
            "private_key_pem": Path(b["key_path"]).expanduser().read_text(),
        }
        return vaultmod.put_secret(vault_id, key_id, compartment, f"kladen-{b['name']}", bundle)

    def update_profile(self, conn, pid: int) -> None:
        if not self._in_scope(self._profile_client(conn, pid)):
            self._deny_scope()
            return
        b = self._body()
        # Editable fields for both profile kinds: manual (tenancy/user/fp/key) and
        # vault (secret_ocid/vault_id). `source` itself is not switchable here —
        # changing how a profile authenticates is a delete-and-recreate, not an edit.
        fields = ("name", "env", "region", "tenancy_ocid", "user_ocid", "fingerprint",
                  "key_path", "compartment_ocid", "secret_ocid", "vault_id")
        sets = {k: b[k] for k in fields if k in b}
        if sets:
            conn.execute(f"UPDATE profiles SET {', '.join(f'{k}=?' for k in sets)} WHERE id=?",
                         (*sets.values(), pid))
            conn.commit()
        row = conn.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone()
        self._json(200 if row else 404, dict(row) if row else {"error": "not found"})

    def delete_profile(self, conn, pid: int) -> None:
        if not self._in_scope(self._profile_client(conn, pid)):
            self._deny_scope()
            return
        conn.execute("UPDATE stacks SET profile_id=NULL WHERE profile_id=?", (pid,))
        conn.execute("DELETE FROM profiles WHERE id=?", (pid,))
        conn.commit()
        self._json(200, {"ok": True})

    def update_stack(self, conn, sid: int) -> None:
        if not self._in_scope(self._stack_client(conn, sid)):
            self._deny_scope()
            return
        b = self._body()
        if "profile_id" in b:
            conn.execute("UPDATE stacks SET profile_id=? WHERE id=?", (b["profile_id"], sid))
            conn.commit()
        row = conn.execute("SELECT * FROM stacks WHERE id=?", (sid,)).fetchone()
        self._json(200 if row else 404, dict(row) if row else {"error": "not found"})

    def register_workspace(self, conn) -> None:
        """Write generated HCL to a workspace and register it against a stack.

        This is the seam between the drawboard and real runs: the client sends
        the files codegen produced, we materialize them on disk, create the
        client/stack rows if they don't exist yet, and point stacks.workspace at
        the directory — after which validate/plan/apply work on that stack.

        Codegen is the source of truth: existing .tf files are replaced, so a
        resource removed on the board disappears from the workspace too.
        """
        b = self._body()
        client_name = str(b.get("client") or "").strip()
        stack_name = str(b.get("stack") or "").strip()
        env = str(b.get("env") or "").strip() or "dev"
        files = b.get("files") or []
        if not client_name or not stack_name:
            self._json(400, {"error": "client and stack are required"})
            return
        if not isinstance(files, list) or not files:
            self._json(400, {"error": "files must be a non-empty list"})
            return
        for f in files:
            name = str(f.get("name", ""))
            if not SAFE_TF_NAME.fullmatch(name):
                self._json(400, {"error": f"unsafe or non-.tf filename: {name!r}"})
                return

        org = conn.execute("SELECT id FROM orgs ORDER BY id LIMIT 1").fetchone()["id"]
        client = conn.execute("SELECT * FROM clients WHERE name=?", (client_name,)).fetchone()
        # Customer users can only register into their OWN client, and never mint
        # a new client (that's a workspace/super-admin action).
        if self._scope() is not None and not (client and client["id"] == self._scope()):
            self._deny_scope()
            return
        cid = client["id"] if client else conn.execute(
            "INSERT INTO clients(org_id,name) VALUES(?,?)", (org, client_name)).lastrowid
        stack = conn.execute(
            "SELECT * FROM stacks WHERE client_id=? AND name=?", (cid, stack_name)).fetchone()
        sid = stack["id"] if stack else conn.execute(
            "INSERT INTO stacks(client_id,name,env) VALUES(?,?,?)", (cid, stack_name, env)).lastrowid

        ws = WORKSPACES / f"stack-{sid}"
        ws.mkdir(parents=True, exist_ok=True)
        for stale in ws.glob("*.tf"):  # keep .terraform/ so providers stay cached
            stale.unlink()
        for f in files:
            (ws / str(f["name"])).write_text(str(f.get("content", "")))
        (ws / "backend.tf").write_text(BACKEND_TF)

        conn.execute("UPDATE stacks SET workspace=?, env=? WHERE id=?", (str(ws), env, sid))
        conn.commit()
        row = conn.execute("SELECT * FROM stacks WHERE id=?", (sid,)).fetchone()
        self._json(200, {**dict(row), "files": len(files) + 1})

    def create_run(self, conn, sid: int) -> None:
        b = self._body()
        mode = b.get("mode")
        if mode not in MODES:
            self._json(400, {"error": f"mode must be one of {MODES}"})
            return
        # Junior can design and plan; apply/destroy need senior or admin.
        if mode in APPROVAL_MODES and self.user["role"] not in DEPLOY_ROLES:
            self._json(403, {"error": f"{mode} requires the senior or admin role"})
            return
        stack = conn.execute("SELECT client_id FROM stacks WHERE id=?", (sid,)).fetchone()
        if not stack:
            self._json(404, {"error": "stack not found"})
            return
        if not self._in_scope(stack["client_id"]):
            self._deny_scope()
            return
        status = "awaiting_approval" if mode in APPROVAL_MODES else "queued"
        rid = conn.execute("INSERT INTO runs(stack_id,mode,status,created_at,requested_by) VALUES(?,?,?,?,?)",
                           (sid, mode, status, now(), self.user["name"])).lastrowid
        conn.commit()
        if status == "queued":
            RUN_QUEUE.put(rid)
        self.get_run(conn, rid, code=201)

    def get_run(self, conn, rid: int, code: int = 200) -> None:
        row = conn.execute(
            "SELECT runs.*, stacks.name AS stack_name, stacks.env AS env,"
            " stacks.client_id AS client_id, clients.name AS client_name"
            " FROM runs JOIN stacks ON stacks.id=runs.stack_id JOIN clients ON clients.id=stacks.client_id"
            " WHERE runs.id=?", (rid,)).fetchone()
        if not row:
            self._json(404, {"error": "run not found"})
            return
        if not self._in_scope(row["client_id"]):
            self._deny_scope()
            return
        self._json(code, run_dict(row))

    def run_logs(self, conn, rid: int) -> None:
        if not self._in_scope(self._run_client(conn, rid)):
            self._deny_scope()
            return
        d = RUNS_DIR / str(rid)
        logs = {}
        for key, fname in (("init", "init.log"), ("validate", "validate.log"),
                           ("plan", "plan.txt"), ("apply", "apply.log")):
            f = d / fname
            if f.exists():
                logs[key] = f.read_text()
        rf = d / "result.json"
        if rf.exists():
            logs["result"] = json.loads(rf.read_text())
        self._json(200, logs)

    def run_estimate(self, conn, rid: int) -> None:
        """Estimate monthly cost from this run's plan.json (STATUS #2).

        Reads the persisted plan.json and prices it via the public OCI price
        list. Any signed-in role may see cost (management especially). Errors
        (no plan yet, price API unreachable) come back as JSON, not a crash.
        """
        if not self._in_scope(self._run_client(conn, rid)):
            self._deny_scope()
            return
        pf = RUNS_DIR / str(rid) / "plan.json"
        if not pf.exists():
            self._json(404, {"error": "no plan.json for this run yet — run a plan first"})
            return
        import pricing  # lazy: only when someone asks for an estimate
        try:
            self._json(200, pricing.estimate(json.loads(pf.read_text())))
        except Exception as exc:  # noqa: BLE001 - surfaced to the UI
            self._json(502, {"error": f"price estimate failed: {exc}"})

    def run_cis(self, conn, rid: int) -> None:
        """CIS-aligned posture for this run's plan.json (Phase 2 — Secure).

        Scans the planned resources against CIS-benchmark-aligned controls and
        returns pass/fail per control plus findings (shared shape). Read-only
        posture, any signed-in role, tenant-scoped like the rest of the run API.
        """
        if not self._in_scope(self._run_client(conn, rid)):
            self._deny_scope()
            return
        pf = RUNS_DIR / str(rid) / "plan.json"
        if not pf.exists():
            self._json(404, {"error": "no plan.json for this run yet — run a plan first"})
            return
        import cis  # lazy: only when someone asks for CIS posture
        try:
            self._json(200, cis.evaluate(json.loads(pf.read_text())))
        except Exception as exc:  # noqa: BLE001 - surfaced to the UI
            self._json(502, {"error": f"CIS scan failed: {exc}"})

    def security_findings(self, conn) -> None:
        """Cloud Guard posture for the workspace (Phase 2 — Secure).

        Resolves the workspace-default profile -> OCI creds and lists Cloud
        Guard's open problems, mapped into the generic findings shape. Read-only
        posture, so any signed-in role may view it (management especially). The
        response always carries a `status` (ok|not_enabled|no_credentials|
        sdk_unavailable|error) so the UI can be honest — Cloud Guard is off by
        default in a tenancy and that must not read as a clean bill of health.
        """
        row = self._posture_profile_row(conn)
        if not row:
            self._json(200, {"status": "no_credentials", "findings": [], "region": "", "synced_at": ""})
            return
        import cloudguard  # lazy: only this feature needs the OCI SDK
        profile, cleanup = materialize_profile(row)
        try:
            self._json(200, cloudguard.fetch(profile))
        except Exception as exc:  # noqa: BLE001 - never 500 the dashboard over posture
            self._json(200, {"status": "error", "detail": str(exc)[:200], "findings": [], "region": "", "synced_at": ""})
        finally:
            cleanup()

    def _posture_profile_row(self, conn):
        """The profile whose tenancy we ask about for posture: a customer user's
        own client profile; a workspace user prefers any client profile, else the
        workspace default. Shared by Cloud Guard + the unified findings view."""
        scope = self._scope()
        if scope is not None:
            return conn.execute("SELECT * FROM profiles WHERE client_id=? ORDER BY id LIMIT 1", (scope,)).fetchone()
        return (conn.execute("SELECT * FROM profiles WHERE client_id IS NOT NULL ORDER BY id LIMIT 1").fetchone()
                or conn.execute("SELECT * FROM profiles WHERE client_id IS NULL ORDER BY id LIMIT 1").fetchone())

    def all_findings(self, conn) -> None:
        """Unified security posture (Phase 2/3): Cloud Guard + CIS + drift for the
        caller's scope, all in ONE findings shape (findings.py). Reads persisted
        artifacts — each scoped stack's latest plan.json (CIS) and latest drift
        result.json (drift) — plus one Cloud Guard call. Read-only, any role.
        """
        import findings as fmod
        out: list[dict] = []
        by_source = {"cloud_guard": 0, "cis": 0, "drift": 0}

        scope = self._scope()
        stack_sql = ("SELECT s.id, s.name, c.name AS client_name FROM stacks s"
                     " JOIN clients c ON c.id=s.client_id")
        stacks = (conn.execute(stack_sql + " WHERE s.client_id=?", (scope,)).fetchall()
                  if scope is not None else conn.execute(stack_sql).fetchall())

        import cis as cismod
        for st in stacks:
            label = {"stack": st["name"], "client": st["client_name"]}
            # CIS findings from this stack's latest successful plan/apply.
            pr = conn.execute(
                "SELECT id FROM runs WHERE stack_id=? AND mode IN ('plan','apply') AND status='succeeded'"
                " ORDER BY id DESC LIMIT 1", (st["id"],)).fetchone()
            if pr and (RUNS_DIR / str(pr["id"]) / "plan.json").exists():
                try:
                    rep = cismod.evaluate(json.loads((RUNS_DIR / str(pr["id"]) / "plan.json").read_text()))
                    for f in rep["findings"]:
                        out.append({**f, **label})
                        by_source["cis"] += 1
                except Exception:  # noqa: BLE001 - one bad plan mustn't sink the view
                    pass
            # Drift findings from this stack's latest successful drift check.
            dr = conn.execute(
                "SELECT id FROM runs WHERE stack_id=? AND mode='drift' AND status='succeeded'"
                " ORDER BY id DESC LIMIT 1", (st["id"],)).fetchone()
            if dr and (RUNS_DIR / str(dr["id"]) / "result.json").exists():
                try:
                    for d in json.loads((RUNS_DIR / str(dr["id"]) / "result.json").read_text()).get("drift", []):
                        acts = ", ".join(d.get("actions", [])) or "changed"
                        f = fmod.finding(source="drift", severity="medium",
                                         title="Resource drifted from declared state",
                                         detail=f"{acts} out of band", resource_ref=d.get("address", ""),
                                         source_of_record=f"run-{dr['id']}")
                        out.append({**f, **label})
                        by_source["drift"] += 1
                except Exception:  # noqa: BLE001
                    pass

        # Cloud Guard (tenancy-level), best-effort — its status is reported so the
        # UI stays honest when it's off (not a clean bill of health).
        cg_status = "no_credentials"
        row = self._posture_profile_row(conn)
        if row:
            import cloudguard
            profile, cleanup = materialize_profile(row)
            try:
                cg = cloudguard.fetch(profile)
                cg_status = cg.get("status", "error")
                for f in cg.get("findings", []):
                    out.append(f)
                    by_source["cloud_guard"] += 1
            except Exception:  # noqa: BLE001
                cg_status = "error"
            finally:
                cleanup()

        out.sort(key=fmod.sort_key)
        self._json(200, {"findings": out, "cloud_guard_status": cg_status,
                         "summary": {"total": len(out), "by_source": by_source,
                                     "by_severity": fmod.severity_counts(out)}})

    def approve_run(self, conn, rid: int) -> None:
        row = conn.execute("SELECT * FROM runs WHERE id=?", (rid,)).fetchone()
        if not row:
            self._json(404, {"error": "run not found"})
            return
        if not self._in_scope(self._run_client(conn, rid)):
            self._deny_scope()
            return
        if row["status"] != "awaiting_approval":
            self._json(409, {"error": f"run is {row['status']}, not awaiting_approval"})
            return
        conn.execute("UPDATE runs SET status='queued', approved_by=? WHERE id=?", (self.user["name"], rid))
        conn.commit()
        RUN_QUEUE.put(rid)
        self.get_run(conn, rid)

    def reject_run(self, conn, rid: int) -> None:
        row = conn.execute("SELECT * FROM runs WHERE id=?", (rid,)).fetchone()
        if not row:
            self._json(404, {"error": "run not found"})
            return
        if not self._in_scope(self._run_client(conn, rid)):
            self._deny_scope()
            return
        if row["status"] != "awaiting_approval":
            self._json(409, {"error": f"run is {row['status']}, not awaiting_approval"})
            return
        conn.execute("UPDATE runs SET status='rejected', finished_at=? WHERE id=?", (now(), rid))
        conn.commit()
        self.get_run(conn, rid)


# Each route declares the set of roles allowed to call it. None == public.
ROUTES = {
    "GET": [
        (r"/api/health", Api.health, None),
        (r"/api/me", Api.me, ANY_ROLE),
        (r"/api/users", Api.list_users, ADMIN_ROLES),
        (r"/api/bootstrap", Api.bootstrap, ANY_ROLE),
        (r"/api/runs/(\d+)", Api.get_run, ANY_ROLE),
        (r"/api/runs/(\d+)/logs", Api.run_logs, ANY_ROLE),
        (r"/api/runs/(\d+)/estimate", Api.run_estimate, ANY_ROLE),
        (r"/api/runs/(\d+)/cis", Api.run_cis, ANY_ROLE),
        (r"/api/security/findings", Api.security_findings, ANY_ROLE),
        (r"/api/findings", Api.all_findings, ANY_ROLE),
    ],
    "POST": [
        (r"/api/login", Api.login, None),
        (r"/api/logout", Api.logout, ANY_ROLE),
        (r"/api/users", Api.create_user, ADMIN_ROLES),
        (r"/api/clients", Api.create_client, DEPLOY_ROLES),
        (r"/api/profiles", Api.create_profile, DEPLOY_ROLES),
        (r"/api/stacks/register", Api.register_workspace, DESIGN_ROLES),
        (r"/api/stacks/(\d+)/runs", Api.create_run, DESIGN_ROLES),   # apply/destroy gated inside
        (r"/api/runs/(\d+)/approve", Api.approve_run, DEPLOY_ROLES),
        (r"/api/runs/(\d+)/reject", Api.reject_run, DEPLOY_ROLES),
    ],
    "PUT": [
        (r"/api/users/([\w-]+)", Api.update_user, ADMIN_ROLES),
        (r"/api/profiles/(\d+)", Api.update_profile, DEPLOY_ROLES),
        (r"/api/stacks/(\d+)", Api.update_stack, DEPLOY_ROLES),
    ],
    "DELETE": [
        (r"/api/users/([\w-]+)", Api.delete_user, ADMIN_ROLES),
        (r"/api/profiles/(\d+)", Api.delete_profile, DEPLOY_ROLES),
    ],
}


if __name__ == "__main__":
    seed()
    threading.Thread(target=worker, daemon=True).start()
    threading.Thread(target=drift_scheduler, daemon=True).start()
    store = f"ATP ({os.environ.get('KLADEN_ATP_DSN', '?')})" if dbmod.DIALECT == "oracle" else f"SQLite ({DB_PATH})"
    print(f"kladen api on :{PORT} · metadata store: {store}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Api).serve_forever()
