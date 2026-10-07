# Kladen spike — containerized OpenTofu runner + state service

Proves the core platform loop end-to-end against a real OCI tenancy:

```
workspace HCL ─► runner (run.py) ─► tofu init/plan/apply in isolated container
                                        │
                        http backend    ▼
                 state service (server.py) ─► OCI Object Storage mirror
                 (locking enforced here)      (kladen-tofu-state bucket)
```

**Proven on 2026-07-16** (profile DEFAULT, ap-hyderabad-1): plan → apply (4 network
resources) → destroy, with state versions persisted through the service to Object
Storage and locking exercised (concurrent LOCK → 423).

## Pieces

- `workspace/` — hand-written HCL standing in for what codegen will emit.
  Credentials/compartment arrive as `TF_VAR_*`; backend config injected at init.
- `runner/run.py` — one run = fresh container (`ghcr.io/opentofu/opentofu:1.12`),
  key mounted read-only, plan parsed from `tofu show -json` into `runs/<id>/result.json`
  (the artifact a GUI renders). Modes: `plan` (default) / `apply` / `destroy`.
- `state_server/server.py` — minimal `http`-backend state service; persists to
  Object Storage via API-key auth. Seed of the real state service.

## Usage

```sh
python3 state_server/server.py &          # state service on :8300
python3 runner/run.py [plan|apply|destroy] [--profile DEFAULT] [--compartment ocid…]
```

## Findings that shape the platform

1. **OpenTofu has no native `oci` state backend.** Terraform 1.12 added one, but
   it's BSL — unusable. The S3-compat route needs customer secret keys (hard cap:
   2 per user; secret shown once) — unworkable across MSP customers. Decision:
   **platform-owned state service + `http` backend.** This is also what
   TFC/env0/Spacelift do, and it gives state versioning, locking, audit, and
   encryption control in one place.
2. The `http` backend appends `?ID=<lock-id>` to state writes — the state key
   must be derived from the path only (bug found and fixed here).
3. Locking semantics are simple to implement (LOCK/UNLOCK verbs, 423 + holder
   JSON on conflict) and OpenTofu handles them correctly.
4. Plan/apply/destroy exit codes: `-detailed-exitcode` → 0 no changes, 1 error,
   2 changes; apply of a saved `tfplan` executes exactly the reviewed plan —
   the contract the approval workflow builds on.

## Spike shortcuts (not the real design)

Local Docker instead of OKE jobs; no auth on the state service (real: per-run
token); in-memory locks (real: Postgres); host `~/.oci` key instead of OCI Vault
injection; single hardcoded stack path.
