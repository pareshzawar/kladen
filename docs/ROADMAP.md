# Kladen — Roadmap & Feature Feasibility

Companion to `STATUS.md` (what's built) and `DECISIONS.md` (why). This is the phased
vision + a feasibility verdict per feature. Kladen is open source (AGPL-3.0, ADR-0016);
this doubles as the public roadmap, so **label shipped vs roadmap honestly** (see note at end).

## Thesis
Provision, secure, and monitor Oracle Cloud infrastructure for teams that can't staff a
dedicated cloud-security function. Visual IaC is the wedge; the security + monitoring
layer is the value that retains. Everything downstream reads the provisioning layer's
output (plan, state, resources) — so one wired loop feeds the whole platform.

## Phases
- **Phase 1 — Provision (the wedge).** Visual IaC loop, price estimation, editable canvas.
  The demoable core. Shipped.
- **Phase 2 — Secure.** CIS checks run from the tool; guardrails; surface OCI Cloud Guard
  findings. Needs Phase 1 (reads plan/config/resources) + real per-customer isolation.
- **Phase 3 — Monitor.** Drift, posture dashboard, read-plane observability over the
  customer's managed estate.
- **Later in Phase 3 — Expiry & rotation hygiene (working name RADAR).** Monitor password
  policy/expiry, API-key rotation, and certificate expiry across sources, and surface OCI's
  native alerts on the dashboard. On-thesis — the "monitor" leg. Packaged as ONE product,
  shipped as a later release. Not a separate project.

## Feasibility + sequencing (the answer to "can we, and when?")

| Feature | Feasible? | Phase / step | Cheap seam to build NOW so it's not expensive later |
|---|---|---|---|
| Visual IaC loop (provision) | Yes — **built** | P1 | — it's the foundation |
| Price estimator | **Yes** — public no-auth OCI price API, flat global pricing, reads `plan.json` | P1, right after loop | Keep capturing `plan.json` per run (already planned) |
| Editable canvas / arrows | **Yes** — native to React Flow | P1, now | Fix edge editing on the board you have; do NOT add 2nd/3rd engines |
| CIS "run from the tool" | Yes, two forms | P1–P2 | (a) generation-time: templates emit CIS-aligned config (template discipline, cheap). (b) runtime scan of a stack vs CIS checks → report |
| Cloud Guard | Yes — it's an OCI-native service with an API; you **surface/orchestrate** its findings, don't reimplement detection | P2–P3 | A generic **finding** model attached to resources, so CG + CIS findings share one shape |
| Drift detection | Yes — diff state vs live | P3 (needs state service — you have it) | Keep persisting per-stack state (already planned) |
| Multi-tenant RBAC (customer-admin / super-admin / env isolation) | Yes | P2 (needed before real customers + before showing per-customer security data) | Model org→customer→env→stack + role-scoped reads now; enforce later. Don't hardcode single-tenant assumptions |
| Read-plane observability (OCI estate) | Yes | P3 | Adopt the read-plane convention: projected rows carry `source_of_record` + `last_synced`, never write back |
| Expiry & rotation hygiene (working name RADAR): password expiry, API-key rotation, cert expiry, surface OCI native alerts | Yes | P3, later release (the "monitor" leg) | **No new seams** — an expiry is a finding (seam #1); reading OCI alerts is read-plane (seam #5). Reads OCI Events / Monitoring / Certificates / Vault (verify exact signals when built). |

## Seams to build now (cheap insurance for the whole vision)
These are the early, near-free decisions that keep every later feature possible. Make them
now; they don't add scope, they avoid dead-ends.
1. **Generic findings model.** A finding = {resource_ref, source (CIS|CloudGuard|drift),
   severity, detail, first_seen, last_seen}. CIS, Cloud Guard, and drift all populate it.
2. **Always persist plan.json + state per run.** Price, drift, and audit all read them.
3. **Per-module schema namespacing** in ATP (like `RD_*`). A secure/monitor/RADAR module
   adds tables without touching provisioning tables.
4. **Tenancy + role model from the start** (org→customer→env→stack, role-scoped reads).
   Build the shape now; enforce RBAC in P2. Never assume single-tenant.
5. **Read-plane discipline** for anything that mirrors external state: `source_of_record`
   + `last_synced` on projected rows, never write back to the source.

## Build order
Done: wire the loop → price estimator on `plan.json` → editable canvas edges → profile
edit → tenancy/RBAC → Secure (findings, CIS, Cloud Guard) → Monitor started (drift,
posture report). Each security/monitor feature plugs into the loop's output.
Next: open-source launch hygiene (runnable from a clean clone, demo-seed gating, spike
shortcuts documented) → verify the remote loop → remaining Phase 3 (RADAR, Audit-triggered
drift).

## Open source and open core
The core platform is AGPL-3.0. Some features may later become a paid tier; **which ones is
undecided** and will get its own ADR. Until then, assume everything in this repo stays
open, and don't describe any feature as "premium" in public docs.

## Marketing honesty note
Public roadmaps are normal and fine, and "provision, secure, monitor" is a stronger pitch
than "visual IaC." One hard rule:
**never claim a security/compliance capability as shipped when it's roadmap.** Security
folks verify, and one over-claim on CIS/Cloud Guard burns credibility you can't rebuild.
Label clearly: *available now* vs *on the roadmap*. That honesty is itself a selling point
to the security-minded teams this is built for.

- Drift architecture (Phase 2): OCI Audit as cheap trigger, `-refresh-only` plan as expensive
  truth. Poll Audit for mutations on managed OCIDs, then refresh only affected stacks. Cheaper
  than blanket nightly refresh and a genuine differentiator over generic TACOS tooling.
- Recovery posture (v1): OpenTofu has no undo primitive. State rollback restores the state
  file, not the infrastructure. Real recovery is `prevent_destroy` on stateful resources in
  curated modules, mandatory approval on any plan containing a destroy, and backup policy
  baked into every stateful module by default. Position as "hard to delete", never "we can
  undo it".
- Naming: `prov0` evaluated and rejected — digit is a dictation failure, collides with v0.dev,
  and names only the provisioning leg of a provision/secure/monitor product. `Kladen` retained
  pending a trademark search in classes 9/42 — now due before the public announcement.
