# Kladen

**Provision, secure, and monitor Oracle Cloud (OCI) infrastructure — visually.**

Design infrastructure on a canvas → Kladen keeps it as a JSON model → generates
[OpenTofu](https://opentofu.org) → runs plan/apply in an isolated container with an
approval step. On top of that loop: a monthly price estimate, CIS-aligned checks, OCI
Cloud Guard findings, and drift detection, all in one posture view.

Built for teams running OCI without a dedicated cloud-security function.

> **Status: early, working prototype.** The core loop runs against a real OCI tenancy,
> but several parts are still spike-grade (see [Honest status](#honest-status) and
> [`SECURITY.md`](SECURITY.md)). Don't point it at a production tenancy or expose it on
> a network yet.

## What works today

- **Visual builder** — drag OCI resources onto a React Flow canvas, configure them, draw
  dependency arrows. ~20 resource types.
- **Model → OpenTofu** — one-way codegen from the JSON model via per-type templates.
- **Plan / apply / destroy** — each run is a fresh, pinned OpenTofu container; apply and
  destroy require approval and execute exactly the reviewed plan.
- **Price estimate** — reads `plan.json` and prices it against the public OCI price list,
  grouped per service. An estimate, not a quote; usage-metered services are flagged
  rather than guessed.
- **Security posture** — CIS-benchmark-aligned checks on each plan, OCI Cloud Guard
  problems (when Cloud Guard is enabled in your tenancy), and drift findings, merged into
  one severity-sorted list. Advisory, not a certified audit.
- **Drift detection** — on demand or on a schedule, via a refresh-only plan.
- **Multi-client RBAC** — one workspace managing many client tenancies; four roles
  (junior / senior / management / admin) plus per-client isolation.
- **Posture report** — a printable summary of cost, findings, and drift.
- **Import** — turn an existing `.tfstate` into a managed canvas stack (one-time).

## Run it locally

Prerequisites: Python 3, Node 20.19+, Docker, and an OCI API key in `~/.oci/config` (plan,
apply, and everything that reads a plan need a real tenancy).

Four processes, from the repo root:

```sh
# 0. Python deps (first time only)
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt

# 1. State service on :8300 (OpenTofu http backend). Local disk only:
KLADEN_STATE_OS=0 python3 spike/state_server/server.py

# 2. Platform API on :8400 (users, runs, pricing, security). Must use the venv:
backend/.venv/bin/python backend/api.py

# 3. Codegen service on :8000 (model → HCL):
backend/.venv/bin/uvicorn app:app --app-dir backend --port 8000

# 4. Frontend on :5173:
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. On first boot the API seeds **demo accounts** (shown on the
login screen, e.g. `admin@meridian.io` / `admin123`) and uses your `~/.oci/config`
`DEFAULT` profile as the workspace default. These demo credentials are public, which is
one reason not to expose this on a network.

Useful environment variables: `KLADEN_DRIFT_INTERVAL` (seconds between scheduled drift
checks; unset = manual only), `KLADEN_STEP_TIMEOUT` (per-step OpenTofu timeout). Hosting
the platform on OCI (Autonomous DB, Object Storage, Vault, runner VM) lives in
[`deploy/`](deploy/README.md).

## How it fits together

```
React canvas ──POST /api/generate──► codegen (app.py) ──HCL──► platform API (api.py)
     ▲                                                            │ queue run
     │ plan, cost, findings                                       ▼
     └──────────────────────────────── runner.py: docker run opentofu plan/apply
                                                   │ state (http backend)
                                                   ▼
                                       state service ──► local disk / OCI Object Storage
```

| You want to…                             | Edit                                          |
| ---------------------------------------- | --------------------------------------------- |
| Add/change a resource type or its fields | `frontend/src/model.ts` **and** its template in `backend/app.py` (identical keys) |
| Change generated HCL                     | `backend/app.py` (Jinja2 templates)            |
| Change runs / approvals / RBAC           | `backend/api.py`, `backend/runner.py`          |
| Pricing, CIS, Cloud Guard, findings      | `backend/{pricing,cis,cloudguard,findings}.py` |
| Canvas behaviour                         | `frontend/src/components/Builder.tsx`, state in `frontend/src/store.tsx` |

Design decisions and their reasons are in [`docs/DECISIONS.md`](docs/DECISIONS.md);
the phased plan is in [`docs/ROADMAP.md`](docs/ROADMAP.md); the live build tracker is
[`docs/STATUS.md`](docs/STATUS.md).

## Honest status

- **Verified** against a live OCI tenancy: generate → plan, price estimate, CIS checks,
  drift check, Cloud Guard (in its "not enabled" state).
- **Built but not yet verified end to end:** hosted mode (`deploy/`): Autonomous DB
  metadata store, runner VM, Vault-held client credentials.
- **Spike shortcuts still in place:** no auth on the state service, in-memory locks and
  sessions, seeded demo accounts, local Docker runner. Listed in [`SECURITY.md`](SECURITY.md).

## Why OpenTofu, not Terraform

Terraform's BSL 1.1 license forbids using it in a hosted product like this. Kladen uses
OpenTofu and the `oracle/oci` provider, and its own state service rather than a
vendor-specific backend.

## Contributing

Issues and PRs welcome — read [`CONTRIBUTING.md`](CONTRIBUTING.md) first.

## License

[GNU AGPL-3.0](LICENSE). If you run a modified Kladen as a service for others, you must
make your modified source available to its users.
