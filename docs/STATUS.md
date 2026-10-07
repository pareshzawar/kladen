# STATUS — Kladen build tracker

**Every session (this Project + every Claude Code chat) reads this + `CLAUDE.md` +
`docs/DECISIONS.md` + `docs/ROADMAP.md` FIRST, and updates the relevant rows here when work
finishes.** This file is the shared memory across chats — git shares the code, this shares
the state.
Last reviewed: 2026-10-07 (going public as open source under AGPL-3.0, ADR-0016; buyer-validation gate retired. Phase 1 + 2 done, Phase 3 started).

Legend: ✅ done+working · 🔌 built, not wired/verified · 🔨 next ·
🕗 later (post-validation / v2) · ⛔ not now (with reason).

---

## Core loop
| Item | State | Note |
|---|---|---|
| Containerized runner (validate/plan/apply/destroy) | ✅ | proven 2026-07-16 ap-hyderabad-1 |
| State service + http backend (locking, versioning) | ✅ | spike form; harden before customers |
| Codegen model→HCL (Jinja templates, raw resources) | ✅ | Option A ratified (ADR-0004) |
| **GUI → /api/generate → runner plan → PlanTab** | ✅ | **WIRED 2026-07-22 (ADR-0010).** One Plan click projects model→HCL, registers a workspace, runs `tofu plan`; PlanTab renders real output + summary + logs + failure detail. Verified against a live tenancy ("8 to add"). Runs via the platform API (`api.py`), not `app.py`→runner. Codegen/register/start failures + a per-step timeout surface in the UI |

## Phase 1 — after the loop (the wedge, demoable + sellable)
| Item | State | Note |
|---|---|---|
| **Price estimator on `plan.json`** | ✅ | **BUILT 2026-07-22.** `backend/pricing.py` reads a run's plan.json, prices fixed-shape resources via the public no-auth OCI price list (compute E5 OCPU/mem, ATP ECPU/storage, block volume — part numbers pinned in `PART`), flags networking as free and metered services (object storage, API gateway, functions, OKE) as usage-based rather than guessing. `GET /api/runs/{id}/estimate` (any role); rendered as a cost card in PlanTab. Verified: ecommerce-core loop → ~$2,496/mo. Scoped to loop services (ROADMAP P1). Not a quote. **2026-07-25: per-service dropdown** — each estimate line now carries a `service` (mapped in `pricing.py`); PlanTab's cost card groups them into expandable dropdowns per service (Compute, Autonomous DB, Load balancer, …) with a subtotal each, expanding to the individual resources. Verified on Run #3 → $2,496.53 across 3 groups. **2026-07-25: overview rollup** — the Dashboard now shows a real "Estimated monthly cost" panel (`CostOverview` in `Dashboard.tsx`) that sums each stack's latest priced plan live via `getRunEstimate`; sits above the still-demo stat tiles/client cards. Verified: workspace total $2,496.53 across 2 priced stacks |
| Fix edge editing (arrows) on the canvas | ✅ | **BUILT 2026-07-25.** Drag a node's teal connect handle → drop on another node to draw an arrow; click an arrow to delete it. `addEdge`/`removeEdge` in `store.tsx` (self-loop + duplicate-direction guarded); interaction is in `Builder.tsx`'s `DesignTab` (board-level pointer capture + ghost arrow) and `CanvasNode` (the handle). One engine, no OKIT/draw.io (ADR-0009). Read-only roles see arrows but get no handle/delete. Verified in-browser on `ecommerce-core`: create + delete + read-only guard, no console errors |

## Phase 2 — Secure (started)
| Item | State | Note |
|---|---|---|
| **Findings model (seam #1)** | ✅ | **BUILT 2026-07-25.** `backend/findings.py` — the one shape every posture source maps into `{source, severity, title, detail, resource_ref, resource_type, region, source_of_record, first_seen, last_seen}`. Read-plane discipline (ADR-0011): carries where it came from + when synced, never writes back. **Now populated by all three sources** — Cloud Guard, CIS, and drift |
| **Unified posture view** | ✅ | **BUILT 2026-07-25.** `GET /api/findings` aggregates Cloud Guard (tenancy) + CIS (each scoped stack's latest plan.json) + drift (each scoped stack's latest drift result) into one severity-sorted list, tenant-scoped, with a per-source + per-severity summary and an honest `cloud_guard_status`. Dashboard `SecurityPanel` became a unified "Security posture" panel (severity + source badge + originating stack per finding; Cloud Guard's off-state still shown honestly). Verified: super-admin & Acme both see the 2 CIS boot-volume findings from ecommerce-core; drift-run exclusion keeps the cost panel on the latest *plan* ($2,496.53). Proxy: `/api/findings` → :8400 |
| **Cloud Guard surfacing** | ✅ built · ⏳ needs tenancy enablement | **BUILT 2026-07-25.** `backend/cloudguard.py` reads OCI Cloud Guard problems via the SDK and maps them into the findings shape (orchestrate, don't detect). `GET /api/security/findings` (any role) resolves a profile → creds → lists problems. Dashboard `SecurityPanel` renders findings sorted by severity (colour **+ label**, ADR-0014 colourblind rule). **Honest states, never faked**: `ok / not_enabled / no_credentials / sdk_unavailable / error`. Verified live against a test tenancy → **`not_enabled`** (Cloud Guard is OFF in us-ashburn-1; user must enable it in the OCI console for real findings); findings-list branch verified with a stubbed response. ⚠️ **The platform API must run under `backend/.venv` (has `oci`)** — system `python3` returns `sdk_unavailable`. Vite proxy now routes `/api/security` → :8400 |

## Dashboard
| Item | State | Note |
|---|---|---|
| Real headline tiles (clients, stacks, open findings, drift checked, est. monthly cost) | ✅ | 2026-07-25, replaced demo stats in `Dashboard.tsx` |

## Remote run + store (points 1–7 — mostly built, needs applying)
| Item | State | Note |
|---|---|---|
| ATP metadata adapter (`db.py`, `KLADEN_DB=atp`) | 🔌 | set env + load `schema_atp.sql` + wallet |
| Platform infra stack (`deploy/`: atp,bucket,vault,vm,net,iam) | 🔌 | apply once with your identity |
| VM runner host (`compute.tf`, instance-principal auth) | 🔌 | apply + point runner at it |
| Vault client-cred store (`vault.tf`, `vault.py`) | 🔌 | apply vault.tf; "store in vault" on create |
| Dual credential paths (manual/oci-config/vault) | ✅ | `materialize_profile`, `put_secret` bridge |
| Verify full remote loop (GUI→VM runner→ATP+bucket) | 🔨 | the acceptance test for all of the above |

## Storage placement (decided — build schema/templates to match)
- **ATP:** metadata only — clients, stacks, profiles (pointers, NOT secrets), runs,
  run summaries, audit. Small, relational, queried by the dashboard.
- **Object Storage:** blobs — `plan.json`, run logs, reports, **state files** (via the
  state service). Pointer/URL stored in ATP.
- **Vault:** secrets only — client OCI credential bundles, private keys. Never in ATP,
  never in a bucket, never in tofu state.
- Rule of thumb: *if it's a secret → Vault; if it's big/opaque → bucket; if you query or
  join it → ATP.*

## Profiles
| Item | State | Note |
|---|---|---|
| Create profile (manual + vault) | ✅ | `AddProfile` |
| **Edit profile** | ✅ | **BUILT 2026-07-25.** The backend `PUT /api/profiles/{id}` route already existed (extended to also update vault fields); the gap was the UI. Added `updateProfile` in `api.ts` and an Edit button + inline form in `Profiles.tsx` — `AddProfile` refactored into a shared `ProfileForm` for both create and edit (source fixed on edit; switching manual↔vault stays delete-and-recreate). Verified in-browser: edited the workspace-default profile, PUT persisted server-side |
| Delete / assign to stack | ✅ | `ProfileList`, `StackPin` |

## Multi-tenancy / RBAC (Phase 2 gate — DONE for the platform plane)
| Item | State | Note |
|---|---|---|
| Customer-admin account (manage own envs/users, see only own) | ✅ | **BUILT 2026-07-25.** `users.client_id` = tenant scope (NULL = workspace-wide, set = one customer), orthogonal to the 4 capability roles. A customer-admin (role=admin + client_id) manages only their own client's users and data. Seeded demo: `admin@acme.io` / `acme123` (scoped to Acme Retail) |
| Super-admin (all clients, catalogue, app config) | ✅ | **BUILT 2026-07-25.** Workspace users (client_id NULL) see/act across all clients; only they create clients and assign a user's client scope. Lockout guard now protects the last *workspace* admin (`_superadmin_count`) |
| Per-customer environment isolation | ✅ **both planes** | **BUILT 2026-07-25.** Enforced in `api.py` on every read & write: bootstrap, runs (+logs/estimate/approve/reject/cis), profiles (create/update/delete), stacks (register/pin), users (list/create/update/delete), Cloud Guard findings — cross-tenant → 403. **Codegen plane closed too (2026-07-25):** `app.py` now authenticates every endpoint (`/api/world` get/post/status, `/api/generate`, `/api/import-state`) by introspecting the bearer token against the platform API's `/api/me` (single auth source; fails closed if it's unreachable). The design world is tenant-scoped — GET returns only the caller's client(s); POST is MERGED so a scoped save can't read or clobber other clients or workspace config; `generate` is 403 outside the caller's client. Verified via curl (no-token 401; super-admin sees 4 clients, Acme sees only Acme; a malicious Acme save preserved the other 3 clients + rejected an injected customType; cross-client generate 403) and in-browser (authed world load, no console errors). `/api/me` now returns `client_name` for the codegen filter |

## Later (v2 — roadmap, not current focus)
| Item | State | Reason |
|---|---|---|
| **Posture report (Monitor)** | ✅ | **BUILT 2026-07-25.** `PostureReport.tsx` — a real, printable Infrastructure Posture Report replacing the demo "Export" button on the Drift page. Aggregates, client-side from data the app already exposes, the estimated monthly cost (per stack + total), the unified findings (CIS + drift + Cloud Guard, by severity/source), and per-stack drift status — with print-to-PDF and an honest footer (estimate/advisory/not certified). Tenant-scoped (a customer sees only their own). Verified: super-admin report → $2,496.53, 2 CIS findings, ecommerce-core in sync, Cloud Guard not-enabled note |
| Drift detection | ✅ | **BUILT 2026-07-25 (Phase 3 — Monitor).** New `drift` run mode in `runner.py`: `tofu plan -refresh-only -detailed-exitcode`, verdict keyed off **`resource_drift`** (not the exit code — exit 2 also fires on output-only changes, which aren't real drift). Non-approval, tenant-scoped run via the existing worker (`clean`/`drift` are successful outcomes). Real per-stack "Drift checks" panel on the Drift page ("Check now" → live refresh-only plan → in-sync / drift·N / failed). Resolution is a model edit + re-plan, never `-target` (ADR-0011). Verified end-to-end against the live tenancy: ecommerce-core → **in sync** (0 drifted); cross-tenant 403; drift-parse unit-tested. **Scheduled checks (2026-07-25):** opt-in `drift_scheduler` thread (env `KLADEN_DRIFT_INTERVAL` seconds; 0/unset = manual only) periodically enqueues a drift run for every stack with a workspace + resolvable profile, skipping any already in flight, attributed to `scheduler`; results feed the same posture view. Bootstrap exposes `drift_interval_s`; Drift header shows "Auto: every N" vs "Manual checks". Verified with a 45s interval → auto run #15 succeeded/clean |
| Diagram export | 🕗 | v2; fix own export, don't embed OKIT (⛔ below) |
| tfstate import (make it actually work) | 🕗 | ADR-0005 exception; not on loop path |
| Catalog ordering / admin-prioritised field order | 🕗 | small, nice, not blocking |
| Recipes / favourites on dashboard | 🕗 | good UX; after the loop runs |
| Key rotation (client API keys) | 🕗 | before first paying customer, not now |
| **CIS checks on plan.json** | ✅ | **BUILT 2026-07-25.** `backend/cis.py` scans a run's plan.json against CIS-benchmark-aligned controls scoped to the loop's services (bucket public-access + versioning, instance public-IP + in-transit encryption + boot-volume CMK, ADB mTLS), reporting pass/fail per control and emitting failures as findings in the shared shape (source="cis"). `GET /api/runs/{id}/cis` (any role, tenant-scoped); `CisCard` in PlanTab shows the report (failures first, colour + ✓/✕ glyph). Advisory design-time posture, NOT a certified audit. Verified on Run #3 → 5 pass / 1 fail (boot-volume CMK), scope 403 across tenants |
| Expiry & rotation hygiene — "RADAR" (Monitor leg) | 🕗 | P3; cert/key/password expiry + surface OCI native alerts. No new seams (ADR-0008). NOT a separate product |

## Not now (explicitly declined)
| Item | Reason |
|---|---|
| ⛔ Embed OKIT in builder | You already have a working React Flow builder; embedding a separate JS app is a large detour. Fix your own export in v2. |
| ⛔ Scrape Oracle website for budget | No clean mapping; fragile. Price List API later if ever. |

## Open-source launch (ADR-0016)
| Item | State | Note |
|---|---|---|
| License (AGPL-3.0-only) | ✅ | `LICENSE` at root; SPDX id in `frontend/package.json` |
| Public docs: README rewrite, `SECURITY.md`, `CONTRIBUTING.md` | ✅ | 2026-10-07. README status was stale (said loop not wired) — now honest |
| Secret/identifier scan of tree + full git history | ✅ | 2026-10-07: no keys, wallets, state, tfvars or real OCIDs; one tenancy suffix in STATUS scrubbed |
| Personal/business notes out of public docs | ✅ | Moved to a private notes file kept outside the repo |
| Demo accounts seeded unconditionally with known passwords | 🔨 | Gate seeding behind an env flag (e.g. `KLADEN_SEED_DEMO=1`) before telling anyone to expose it on a network |
| Clean-clone run test (README → working loop on a fresh machine) | 🔨 | The real "is it open-source ready" test |
| CLA / contribution-licensing decision | ⏳ human | Needed before merging the first outside PR if a paid tier is planned (lawyer) |
| Trademark search on "Kladen" (classes 9/42) | ⏳ human | Do before announcing publicly, not after |
| Fresh public repo from one squashed commit | 🔨 | Old repo renamed to a private archive; new `kladen` repo gets a single clean commit, created private, flipped public by the founder |

Build order from here: launch items above → verify the remote loop → roadmap
(`docs/ROADMAP.md`). Earlier order, all done: loop → price estimator → canvas edges →
profiles → RBAC → Secure → Monitor (started).

## Design notes carried forward
- Drift detection: mechanism confirmed — `tofu plan -refresh-only -detailed-exitcode`
  (exit 0 = clean, 2 = drift, 1 = error), scheduled per stack. Phase 2.
- OCI Audit correlation: **v1 dependency** — OCID-to-stack mapping must be persisted from
  day one or Audit correlation is impossible to add later.
- Apply provenance: every apply pins `{model_version_id, hcl_bundle_hash, state_serial}`.
- Resource drawer: build as a route-addressable component (`/stack/:id/resource/:rid`) from
  the start. Per-item popout windows deferred; the route makes the later `window.open`
  trivial.
