# Decisions (ADR log)

Append-only. Newest at the bottom. Each entry is a decision that would be expensive to
reverse or surprising to a new contributor (human or Claude). This file carries rationale
across sessions — neither Claude Code nor the Claude Project persists memory, so if it
isn't written here, it's lost. When a build session forks from a stated constraint,
record it here rather than letting it drift silently.

Format: ID · date · status · context · decision · consequences · revisit-when.

---

## ADR-0001 · OpenTofu, never Terraform
- **Date:** 2026-07 · **Status:** accepted (locked)
- **Context:** Terraform's BSL 1.1 forbids embedding it in a hosted product.
- **Decision:** Generate and run OpenTofu only (`ghcr.io/opentofu/opentofu` image,
  `oracle/oci` provider). Same HCL, same provider.
- **Consequences:** Cannot use any Terraform-only feature — see ADR-0002. Provider is
  MPL-2.0; we embed no third-party modules, so no module-license exposure (see ADR-0004).
- **Revisit-when:** never, unless licensing law changes.

## ADR-0002 · Platform-owned state service + `http` backend
- **Date:** 2026-07-16 · **Status:** accepted
- **Context:** OpenTofu has no native `oci` state backend. Terraform 1.12 added one, but
  it's BSL — unusable (ADR-0001). The S3-compat route needs customer secret keys (2/user
  cap, shown once) — unworkable across MSP customers.
- **Decision:** Platform-owned state service fronting OCI Object Storage, consumed via
  OpenTofu's `http` backend. Locking (LOCK/UNLOCK, 423 on conflict) and versioning
  enforced in the service. Same model as TFC/env0/Spacelift.
- **Consequences:** State versioning, locking, audit, and encryption control live in one
  place we own. The `http` backend appends `?ID=<lock-id>` on writes — state key must be
  derived from path only (bug found + fixed in spike).
- **Revisit-when:** never for the backend choice; harden the service before any paying
  customer (see ADR-0006).

## ADR-0003 · Metadata store is Autonomous DB (ATP), not Postgres
- **Date:** 2026-07 · **Status:** accepted
- **Context:** Original stack note said Postgres. OCI-native + Always-Free ATP removes an
  external dependency and keeps the platform inside one cloud.
- **Decision:** Platform metadata lives in ATP (`deploy/atp.tf`, `deploy/sql/`).
- **Consequences:** Supersedes the "FastAPI + Postgres" line in early planning.
- **Revisit-when:** if ATP Always-Free limits or SQL surface become a constraint.

## ADR-0004 · Codegen emits raw resource blocks (templates), not curated modules
- **Date:** 2026-07-21 · **Status:** accepted (was a silent drift; ratified on review)
- **Context:** Original brief: "generator only wires variables into curated modules;
  modules carry guardrails." The code instead uses per-resource-type Jinja2 templates in
  `backend/app.py` emitting raw HCL. This drift was unnoticed until a plan-vs-build review.
- **Decision:** Keep templates-emit-raw-HCL for now (Option A). It works, it's built, it
  avoids module licensing, and reverting mid-flow isn't worth it.
- **Consequences:** Guardrails live in ~20 individual templates, not in versioned/tested
  modules — consistency across types is a manual discipline. No module registry.
- **Revisit-when:** before the first paying customer, OR when guardrail consistency across
  service types starts causing bugs. If flipped to curated modules, that's a new ADR.

## ADR-0005 · tfstate importer is a one-time state→model exception
- **Date:** 2026-07 · **Status:** accepted
- **Context:** Non-negotiable: codegen is one-way (model → HCL), no bidirectional sync.
  The "import existing environment" feature maps a `.tfstate` into a drawboard stack —
  that is state → model, the reverse direction.
- **Decision:** Allowed as a **one-time import**, not live bidirectional sync. Base network
  plumbing absorbed; node pools/WAF/lifecycle merged onto parents; unsupported types
  reported (`STATE_MAPPERS` in `app.py`).
- **Consequences:** Must not evolve into continuous GUI↔code round-tripping. After import,
  the model is the source of truth as usual.
- **Revisit-when:** if anyone proposes live re-sync from state — that breaks the
  non-negotiable and needs its own decision.

## ADR-0006 · Known spike shortcuts — NOT the real design
- **Date:** 2026-07 · **Status:** accepted (tracking, not permanent)
- **Context:** The proven loop uses shortcuts to move fast.
- **Decision:** Explicitly tracked so none are hardened silently: local Docker instead of
  OKE jobs; no auth on the state service (real: per-run token); in-memory locks (real:
  ATP-backed); host `~/.oci` key instead of OCI Vault injection; single hardcoded stack
  path.
- **Consequences:** Fine for demos. The unauthenticated state service + in-memory locks
  MUST NOT touch a paying customer's tenancy as-is.
- **Revisit-when:** before onboarding any real customer; each shortcut becomes its own
  hardening task + ADR.

## ADR-0007 · Thesis is provision → secure → monitor, not "visual IaC"
- **Date:** 2026-07-21 · **Status:** accepted
- **Context:** "Visual IaC" is a mechanism, and a weak pitch — few OCI buyers reach out for
  it. The real, underserved pain is managing + securing + monitoring OCI infra for teams
  that can't staff a dedicated cloud-security function.
- **Decision:** Position Kladen as one product across three phases — Provision (the visual
  IaC wedge, ships first), Secure (CIS from the tool, guardrails, surface Cloud Guard),
  Monitor (drift, posture, expiry/rotation hygiene). Visual IaC is the way in; the
  security + monitoring layer is the retained value. See `docs/ROADMAP.md`.
- **Consequences:** Build stays loop-first because every secure/monitor feature reads the
  provisioning loop's output (plan, state, resources). Marketing sells the platform vision;
  shipped vs roadmap must be labelled honestly (security claims especially).
- **Revisit-when:** if buyer conversations show a different feature is the real wedge.

## ADR-0008 · RADAR is the Phase-3 expiry/rotation-hygiene module, not a separate product
- **Date:** 2026-07-21 · **Status:** accepted (supersedes the earlier "separate track" read)
- **Context:** RADAR was first framed as a Fusion-Apps GRC product (different stack/buyer,
  employer-IP concern). Clarified: it's cross-source expiry + rotation monitoring —
  password policy/expiry, API-key rotation, certificate expiry — plus surfacing OCI's
  native alerts on the dashboard.
- **Decision:** RADAR is the "monitor" leg of the one product, shipped as a later Phase-3
  release. Not a separate company. It needs no new architecture: an expiry is a finding
  (findings-model seam), reading OCI alerts is read-plane (read-plane seam).
- **Consequences:** Can be named on the roadmap and sold as "coming." Feasible via OCI
  Events / Monitoring / Certificates / Vault (verify exact signals when built). Legal check
  applies only if a specific monitored source is employer-domain.
- **Revisit-when:** when Phase 3 starts, or if a monitored source raises a moonlighting/IP
  question.

## ADR-0009 · One canvas engine (React Flow); no OKIT / draw.io as editable boards
- **Date:** 2026-07-21 · **Status:** accepted
- **Context:** Proposed toggling between OKIT, draw.io, and React Flow so users get a
  familiar canvas; the stated trigger was "React Flow can't do arrows." That premise is
  wrong — edge editing (add/modify/delete) is native to React Flow; the board just wasn't
  wired for it.
- **Decision:** Fix edge editing on the existing React Flow board. Do NOT add OKIT or
  draw.io as second/third *editable* engines.
- **Consequences:** OKIT/draw.io each carry their own model as source of record; making
  them editable would require parsing their formats back into our JSON — bidirectional
  sync, which violates the one-way model→projection invariant (non-negotiable #3). One
  engine, made to work. "Do users want a familiar canvas?" is a survey question, not a build.
- **Revisit-when:** if buyer research shows a specific canvas is a real adoption blocker —
  and even then, read-only import, never bidirectional.

## ADR-0010 · The loop is wired via workspace registration + the platform API, not app.py→runner
- **Date:** 2026-07-22 · **Status:** accepted
- **Context:** CLAUDE.md/STATUS sketched the loop as `GUI → /api/generate → runner.execute("plan") → PlanTab`, implying the codegen service (`app.py`) calls the runner. The build instead grew a second backend — the **platform API** (`backend/api.py`, :8400) — that owns runs, approvals, auth (4 real roles), profiles, and the ATP metadata store. `app.py` (:8000) stayed codegen-only. Joining the loop meant deciding where the run is triggered.
- **Decision:** Runs go through the platform API, not `app.py`. The wired path is: Builder → `POST /api/generate` (app.py, model→HCL) → `POST /api/stacks/register` (api.py writes the HCL to a real workspace + adds the platform-owned `backend.tf`) → `POST /api/stacks/{id}/runs` (api.py worker calls `runner.execute`) → PlanTab polls `GET /api/runs/{id}` + `/logs`. A single Plan/Validate/Destroy click now does generate→register→run in `Builder.tsx`, re-projecting the model each time (one-way, model stays source of truth). Codegen (`app.py`) never runs tofu.
- **Consequences:** Non-negotiables intact — OpenTofu-only, model→HCL one-way, secrets not inlined. But codegen and orchestration are two services: `/api/generate|import-state|world` → :8000; `/api/{bootstrap,clients,profiles,stacks,runs,login,users,...}` → :8400. The Vite proxy and the nginx config (`deploy/INSTALL_VM.md`) must keep routing both, and any doc that says "app.py calls the runner" is wrong — it's api.py. Registration also created the client/stack rows and `stacks.workspace` seam that later remote-run/ATP work builds on.
- **Revisit-when:** if the two backends are unified (a stated later milestone), the trigger path moves but the model→HCL→register→run contract shouldn't.
- **Also recorded here** (small corrections made while wiring, per CLAUDE.md "fix whichever is wrong and record it"): (1) the four planning docs were renamed from `docs/kladen-*.md` to their canonical paths — `CLAUDE.md` (repo root, so Claude Code auto-loads it) + `docs/STATUS.md|DECISIONS.md|ROADMAP.md` — which is what every cross-reference already used. (2) The canvas is a hand-rolled pointer-events board, not React Flow; ADR-0009's "edge editing is native to the library" premise is false for this codebase (its conclusion — one engine, no OKIT — still stands).
# ADR-0011 — Reality is read into the model via the OCI SDK, never by parsing HCL

**Status:** Accepted
**Date:** 2026-07-24
**Supersedes:** none
**Related:** ADR-0004 (template-based HCL emission), ADR-0005 (tfstate importer carve-out)

## Context

Brownfield adoption and drift resolution both require a path from live infrastructure
back into the JSON resource model. Two mechanisms are available:

1. OCI Resource Discovery (provider export) emits HCL + state, which would then have to
   be parsed back into the model.
2. Direct OCI SDK calls read live resource attributes as structured API responses, which
   map into the model directly.

Option 1 reintroduces HCL parsing. The one-way codegen invariant (model → HCL, never the
reverse) is the load-bearing architectural constraint of the product; ADR-0005 carved out
the tfstate importer as a single scoped exception and explicitly declined to make it a
pattern. Widening that carve-out to cover discovery would effectively repeal the invariant.

Option 2 is not a violation. The invariant governs the HCL boundary, not the direction of
data flow generally. Reading the OCI API is a different source entirely.

## Decision

All reality-to-model paths are implemented against the OCI SDK. Discovery, brownfield
import, and drift acceptance read resource attributes from the OCI API and map them into
the JSON resource model directly.

Generated or exported HCL is never parsed to construct or update the model. The tfstate
importer (ADR-0005) remains the sole exception and is not extended.

## Consequences

- Discovery coverage is bounded by the curated module catalog: only resource types with a
  corresponding module and SDK mapping can be represented in the model. Everything else
  remains visible but unmodelled (see ADR-0014, Observed state).
- Each supported resource type needs an explicit SDK-response-to-model mapper. This is real
  per-type work and is the main cost of this decision.
- The one-way invariant survives intact, so codegen, diffing, and rendering keep a single
  well-defined direction.
- OCI Resource Discovery may still be used as a reference implementation or for manual
  operator workflows, but its output never feeds the model programmatically.

---

# ADR-0012 — Drift resolution is expressed as a model mutation, never a targeted apply

**Status:** Accepted
**Date:** 2026-07-24
**Related:** ADR-0011, ADR-0013

## Context

Users need granular control over detected drift: accept some resources' out-of-band
changes into the model, revert others to the declared configuration, in the same review.

The obvious implementation is `tofu apply -target=...` per resource. OpenTofu (and
Terraform before it) treats `-target` as a break-glass tool: it prunes the dependency
graph, so the resulting plan can be incomplete or incorrect in ways that are not visible
in its output. Building a routine, user-facing workflow on top of it is a correctness risk.

Because the JSON resource model is the single source of truth, a cleaner formulation
exists.

## Decision

Drift resolution is performed by mutating the model, then running one ordinary full plan.

- **Accept drift on resource A:** re-read A from the OCI SDK (ADR-0011), update the model
  to match live reality, regenerate HCL. A subsequent full plan is a no-op for A.
- **Revert resource B:** leave the model unchanged. The same full plan proposes restoring
  B to the declared configuration.
- **Mixed selections** are resolved by a single full plan after all accepted resources have
  been written into the model.

`-target` is not used in any user-facing workflow. Its use anywhere in the platform requires
a new ADR.

## Consequences

- The dependency graph is always complete; plans are always trustworthy.
- Accept and revert are cheap and reversible up until apply, because until then only the
  model has changed.
- Every accept must carry an **accept reason** field. MSP operators need to report to their
  clients why a console change was blessed rather than reverted.
- A batch preview showing the resulting plan is required before commit. Selections are cheap
  to change; applies are not.
- Auto-remediation is out of scope for v1. Silently reverting a customer's emergency console
  fix is an account-losing failure mode.

---

# ADR-0013 — Dual log capture: raw verbatim plus structured `-json` stream

**Status:** Accepted
**Date:** 2026-07-24

## Context

Runner output serves two consumers with incompatible needs. Operators want the complete,
unaltered log for forensics and trust. Dashboards and reports want structured change events.

Deriving the second from the first means parsing OpenTofu's human-readable output, which is
presentation rather than a stable contract and changes between releases. Such breakage is
silent: dashboard rows simply stop appearing.

## Decision

Every run captures both streams:

- **Raw stdout**, byte-for-byte, immutable, downloadable in full.
- **`plan -json` / `apply -json`**, the documented machine-readable event stream, which is
  the sole source for dashboards, reports, and drift review UI.

The human-readable output is never parsed to produce structured data.

The same discipline applies to OCI Audit: retain raw events, project a parsed view for
dashboards.

## Consequences

- Negligible runtime cost — one command emits both; no second apply, no extra tenancy calls.
- Dashboards survive runner upgrades.

### Log sensitivity requirements (binding)

Raw logs are the most dangerous artifact in the product.

- `TF_LOG=DEBUG` dumps full HTTP request bodies including OCI auth headers. It is never
  enabled on customer runs. Support use requires explicit per-run customer consent with a
  hard expiry.
- Provider errors routinely echo request payloads containing secrets; OpenTofu's `sensitive`
  marking covers only values it knows about. Redaction is applied on top, not relied upon
  from the tool.
- Log storage is isolated per customer — bucket, KMS key, and prefix — not per org.
- Downloads use short-lived pre-authenticated URLs scoped to the requesting user. Never a
  public PAR.
- Log access is its own RBAC level, distinct from stack read. Viewing unredacted output is a
  separate permission and generates its own audit entry.
- Redaction defaults to **on**.
- Default retention: 90 days for raw (configurable); parsed events retained longer as they
  are small and already scrubbed.

---

# ADR-0014 — Two-stage brownfield adoption with a clean-plan gate

**Status:** Accepted
**Date:** 2026-07-24
**Related:** ADR-0011

## Context

MSP customers inherit OCI tenancies provisioned through the console, CLI, and SDK. Adopting
those resources makes the platform responsible for infrastructure it did not create. If
generated HCL does not match the live resource exactly, the next apply proposes destructive
changes against production the platform has just taken over.

Drift detection alone does not cover this: resources created outside a stack are absent from
state and therefore invisible to `plan`. Detection covers modification and deletion; OCI
Audit covers creation. Both are required.

## Decision

Discovered resources occupy one of two states:

- **Observed** — discovered via SDK, present in the model, visible on canvas, no state entry,
  read-only. The platform does not manage the resource.
- **Managed** — full lifecycle management.

Promotion from Observed to Managed is permitted only when a plan against the resource returns
zero changes. A non-clean plan blocks promotion and surfaces the delta for the user to
resolve. This is a correctness gate, not a caution, and is the one place in the brownfield
flow where an action is blocked rather than warned.

Resources without a corresponding curated module remain Observed indefinitely. This is
acceptable: visibility alone is valuable to an MSP inheriting an unmapped tenancy.

Credentials for discovery are a customer-created IAM user with an API key. Instance principal
is unusable for hosted SaaS — it authenticates only workloads running inside the customer's
own tenancy. Discovery begins with `inspect`/`read` verbs only; manage verbs are granted
per-compartment on explicit adoption.

## Consequences

- Discovery may become the wedge rather than greenfield provisioning, pending Phase 0
  interview findings.
- The following Phase 0 interview question is added verbatim:

  > "Roughly what share of your OCI estate was provisioned outside of Terraform or OpenTofu —
  > through the console, CLI, or SDK? And when you inherit a new client tenancy, what's your
  > first move?"

### Canvas state encoding (binding)

State is never encoded in colour alone — MSP operations staff include colourblind users and
this is safety-critical UI. Each state carries a colour plus a second signal:

| State            | Colour           | Second signal                 |
| ---------------- | ---------------- | ----------------------------- |
| Managed          | teal `#0FA79E`   | solid border                  |
| Observed         | amber            | dashed border + eye icon      |
| Drifted          | orange / red     | pulsing border + warning icon |
| Destroy-pending  | red              | hatched fill                  |

Warnings do not block actions. Destroying a brownfield resource requires a confirmation
dialog that names the resource and requires typing it back — hard, not impossible. The sole
blocking rule is the Observed-to-Managed clean-plan gate above.

---

## ADR-0015 · Tenant scope is `users.client_id`, orthogonal to the capability role; enforced per-handler
- **Date:** 2026-07-25 · **Status:** accepted
- **Context:** Per-customer isolation (the Phase-2 gate) needed a tenancy model. The
  existing model is one MSP org (Meridian) managing many **clients** (Acme, Northwind…),
  with 4 capability roles (junior/senior/management/admin). The tenant unit is the client.
- **Decision:** Add a nullable `users.client_id` = tenant scope, **orthogonal** to the role.
  `NULL` = workspace-wide (MSP staff / super-admin): sees & acts across all clients, creates
  clients, assigns other users' scope. Set = customer-scoped: sees only that client. So
  "super-admin" = role admin + client_id NULL; "customer-admin" = role admin + client_id set.
  Enforcement lives **inside each handler** in `api.py` (after the route's role gate), checking
  the specific client/stack/run/profile against `self._scope()` — bootstrap, runs
  (+logs/estimate/approve/reject), profiles, stacks, users, Cloud Guard findings. The
  lockout guard protects the last *workspace* admin, not merely the last admin.
- **Consequences:** Two enforcement planes, **both now scoped**. The **platform API**
  (`api.py`, :8400 — runs, credentials, users, cost, security) enforces scope per-handler.
  The **codegen service** (`app.py`, :8000 — the drawboard *design world* via `/api/world`,
  plus `/api/generate` and `/api/import-state`) shares no session state, so it authenticates
  by **introspecting the bearer token against the platform API's `/api/me`** (single auth
  source; fails closed if `/api/me` is unreachable). The design world is tenant-scoped there:
  GET returns only the caller's client(s); POST is merged so a scoped save can't read or
  clobber other clients or workspace config; `generate` is 403 outside the caller's client.
  `/api/me` gained `client_name` for that filter. The frontend's world/generate/import-state
  fetches now send the token (`authHeaders()`). ATP `users` gains `client_id` with no inline
  FK (Oracle forbids forward refs; `clients` is defined later) — the app enforces scope, not the DB.
- **Update 2026-07-25:** the "codegen auth gap" noted below is now **closed** (introspection
  above). This also resolves the ADR-0006 spike shortcut "no auth on the codegen service".
- **Revisit-when:** when codegen gets real auth (then design-world scoping moves to the API,
  and the frontend filter becomes belt-and-suspenders); or if a customer ever needs
  cross-client visibility (a new scope tier, its own ADR).

---

## ADR-0016 · Go public as open source (AGPL-3.0), open-core later; buyer-validation gate retired
- **Date:** 2026-10-07 · **Status:** accepted
- **Context:** The loop, price estimator, Secure leg (findings, CIS, Cloud Guard, RBAC
  isolation) and first Monitor features (drift, posture report) are built. Until now the
  build was held as a private de-risking spike gated on buyer validation. The founder has
  chosen to publish it instead: as an open-source project and a public portfolio piece,
  with some features possibly becoming a paid tier later.
- **Decision:** Publish the repo under **AGPL-3.0-only**. AGPL over Apache/MIT because
  Kladen is a hosted-style web platform: anyone running a modified copy as a service must
  share their changes, which keeps a future paid/hosted tier defensible. The
  buyer-validation gate (CLAUDE.md "phase discipline", ROADMAP/STATUS gate reminders) is
  **retired** — it no longer decides what gets built. Personal business notes move out of
  the public docs. New non-negotiable: nothing tenancy-specific is ever committed.
- **Consequences:**
  - Priorities shift from "prove to a buyer" to "runnable and safe for a stranger":
    honest README, `SECURITY.md` listing every spike shortcut, `CONTRIBUTING.md`.
  - Open-core is undecided. **Before merging the first outside contribution**, decide on a
    CLA (or similar). Without one, contributors' code stays AGPL-only and can't be moved
    into a proprietary paid tier. That is a legal call (lawyer), not an engineering one.
  - The ADR-0006 spike shortcuts are now public. They stay shortcuts, but they are
    documented in `SECURITY.md` and must not be presented as production-ready.
  - The public repo starts from a **single squashed commit** of this tree; the earlier
    history (private notes included) stays in a private archive repo. A scan of that
    history on 2026-10-07 found no keys, wallets, state or real OCIDs.
  - Supersedes ADR-0007's revisit trigger ("if buyer conversations show…"). The thesis
    itself (provision → secure → monitor) stands.
- **Revisit-when:** a paid tier is defined (record the free/paid boundary as its own ADR);
  or the CLA/trademark decisions are made (record them here too).
