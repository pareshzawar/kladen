# CLAUDE.md — Kladen

Read fully before writing code. Hard constraints, not suggestions. This file describes
the repo as it actually is; if code and this file disagree, fix whichever is wrong on
purpose and record it in `docs/DECISIONS.md`.

## What this is
Open-source (AGPL-3.0), OCI-first platform to **provision, secure, and monitor** Oracle
Cloud infrastructure for teams that can't staff a dedicated security function. Visual IaC
is the way in; the security + monitoring layer is the retained value. GUI → JSON resource
model → generated **OpenTofu** → plan/apply with approvals. Built independently, with no
third-party employer IP or assets. Open-core later: some features may become a paid tier
(ADR-0016) — the boundary is not decided yet. Phasing + per-feature feasibility:
`docs/ROADMAP.md`.

## Non-negotiables (never violate)
1. **OpenTofu, never Terraform.** `ghcr.io/opentofu/opentofu` image, `oracle/oci`
   provider. BSL 1.1 forbids Terraform in a hosted product. This also rules out
   Terraform 1.12's native `oci` state backend — hence our own state service (below).
2. **The JSON model is the single source of truth.** `frontend/src/model.ts` (the
   ResourceType registry) + per-type Jinja2 templates in `backend/app.py`. HCL is a
   projection of the model.
3. **Codegen is one-way: model → HCL.** No live GUI↔code sync. The tfstate importer is
   a deliberate one-time exception (state→model), not bidirectional sync — keep it that
   way.
4. **Secrets are never inlined** in model or generated HCL. OCI Vault / injected env only.
5. **Public repo: nothing tenancy-specific is ever committed.** No real OCIDs, tenancy
   names, namespaces, keys, wallets, tfvars or state. Use `ocid1.…oc1..xxxx` placeholders.
   When docs record a verification run, describe it without identifiers.

## How the two halves connect (the contract)
Frontend POSTs `{client, stack, env, resources:[{type, config}]}` to `/api/generate`.
`type` keys MUST match between `frontend/src/model.ts` and `TEMPLATES` in
`backend/app.py`. **Adding a service = a ResourceType in model.ts AND a matching Jinja2
template in app.py, identical `key`/field names.** If generated HCL looks wrong, fix the
template in `app.py`.

## Architecture as built
- **Frontend:** React 19 + TS + Vite + Tailwind v4. Drawboard = `components/Builder.tsx`;
  state in `store.tsx` (all mutations in the reducer).
- **Codegen service:** `backend/app.py` (FastAPI, :8000), model JSON → OpenTofu HCL via
  Jinja2. Authenticates by introspecting the bearer token against the platform API.
- **Platform API:** `backend/api.py` (:8400) — users/RBAC, clients, profiles, stacks, runs,
  price estimate, CIS, Cloud Guard, unified findings, drift scheduler. Must run under
  `backend/.venv` (needs the `oci` SDK).
- **Runner:** `backend/runner.py` — one run = one pinned OpenTofu container, workspace
  mounted, creds as `TF_VAR_*` + read-only key mount. Modes:
  validate|plan|apply|destroy|drift. apply/destroy plan first, then apply the saved
  `tfplan` exactly as reviewed.
- **State:** platform-owned state service + OpenTofu `http` backend (NOT a native
  backend — none exists for OCI that we can legally use). Locking + versioning enforced
  there; persisted to OCI Object Storage. Still in spike form: `spike/state_server/` (:8300).
- **Platform infra:** `deploy/` — the one stack you apply by hand with your own identity
  before Kladen runs: Autonomous DB (metadata), Object Storage (artifacts+state), Vault
  (client secrets), free-tier VM (runner host). Metadata store is **ATP, not Postgres.**
- **Codegen approach:** raw resource blocks from per-type templates, not curated modules
  (ADR-0004, ratified). Guardrails live in templates.

## Current priority
The loop, price estimator, Secure leg and first Monitor features are built (see
`docs/STATUS.md`). The project is now going public as open source (ADR-0016). In order:
1. **Make it runnable by a stranger.** A clean clone + README must reach a working loop.
   Anything that only works on the maintainer's machine is a bug.
2. **Make it safe to run.** The spike shortcuts (ADR-0006) and seeded demo accounts must
   be clearly labelled, and hardened before anyone is told to deploy it on a network.
3. **Verify the full remote loop** (GUI → VM runner → ATP + bucket) — STATUS 🔨.
Then the roadmap continues (`docs/ROADMAP.md`). Don't grow the ~20-type resource
catalog on spec; depth and polish beat breadth for an open-source first impression.

Canvas: one engine (React Flow). Do NOT add OKIT/draw.io as second/third engines (breaks
one-way projection; ADR-0009).

## Guardrails for you, the agent
- Flag over-engineering, scope creep, premature optimization directly.
- Prefer boring, inspectable code. Correctness over cleverness.
- **Always comment the code.** Readers include the maintainer and outside
  contributors, not all of them full-time developers. Every function gets a short docstring/comment saying what it does
  and why; comment any non-obvious line, data shape, or control flow. Favour clear names
  over clever one-liners. Comments explain intent, not just restate the code.
- Don't add abstraction for services/flows not yet built.
- Spike shortcuts that are NOT the real design (do not harden them silently, and do not
  hide them — they're listed in `SECURITY.md`): local Docker instead of OKE jobs; no auth
  on the state service; in-memory locks; in-memory sessions; seeded demo accounts; host
  `~/.oci` key instead of Vault injection.
- If a task implies breaking a non-negotiable above, stop and say so.
- Legal/business calls (license changes, CLA, trademark, employment terms, entity/tax)
  are human decisions, not yours — flag them, don't decide them.

## Docs (read before working; update STATUS when you finish)
- `docs/DECISIONS.md` — append-only ADR log. Carries rationale across sessions;
  neither Claude Code nor the Project persists memory. Highest-value doc.
- `docs/ROADMAP.md` — thesis, phases (provision→secure→monitor), per-feature feasibility +
  the architectural seams to keep cheap.
- `docs/STATUS.md` — live build tracker: what's built / wired / next. **Update it when you
  finish work** — it's the shared memory across chats.
- `README.md` — run instructions + honest status (keep the honesty).
- `SECURITY.md` / `CONTRIBUTING.md` — public-facing; keep them true as code changes.
