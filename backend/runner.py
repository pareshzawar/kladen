#!/usr/bin/env python3
"""Containerized OpenTofu runner — library form of spike/runner/run.py.

One call = one run: a pinned OpenTofu container per step, workspace mounted,
credentials injected as env vars plus a read-only key mount; nothing installed
on the host. Artifacts land in the run directory: init.log, validate.log or
plan.txt + plan.json, apply.log, and result.json (the structured artifact the
GUI renders).

Modes: validate | plan | apply | destroy | drift. validate needs no credentials
or state backend (init -backend=false). apply/destroy plan first, then apply the
saved tfplan exactly as reviewed — the same contract the approval flow uses.
drift is a read-only refresh-only plan (state vs live infra), never applied.
"""
from __future__ import annotations

import os
import json
import subprocess
from pathlib import Path

IMAGE = "ghcr.io/opentofu/opentofu:1.12"
KEY_MOUNT = "/run/secrets/oci_api_key.pem"
# Max wall-clock per tofu step. A hung docker/plan otherwise leaves a run
# "running" forever; on timeout we raise so the worker marks the run failed and
# the reason shows in the UI. Override with KLADEN_STEP_TIMEOUT (seconds).
STEP_TIMEOUT_S = int(os.environ.get("KLADEN_STEP_TIMEOUT", "900"))


def _docker_tofu(args: list[str], workspace: Path, profile: dict, mount_key: bool) -> subprocess.CompletedProcess:
    env_vars = {
        "TF_VAR_tenancy_ocid": profile.get("tenancy_ocid", ""),
        "TF_VAR_user_ocid": profile.get("user_ocid", ""),
        "TF_VAR_fingerprint": profile.get("fingerprint", ""),
        "TF_VAR_region": profile.get("region", ""),
        "TF_VAR_private_key_path": KEY_MOUNT,
        "TF_VAR_compartment_ocid": profile.get("compartment_ocid") or profile.get("tenancy_ocid", ""),
        "TF_IN_AUTOMATION": "1",
    }
    # host-gateway makes host.docker.internal resolve to the host on Linux too
    # (it's automatic only on Docker Desktop) — that's how the container reaches
    # the state service on :8300.
    cmd = ["docker", "run", "--rm", "--network", "bridge",
           "--add-host", "host.docker.internal:host-gateway",
           "-v", f"{workspace}:/workspace", "-w", "/workspace"]
    if mount_key and profile.get("key_path"):
        cmd += ["-v", f"{profile['key_path']}:{KEY_MOUNT}:ro"]
    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]
    cmd += [IMAGE] + args
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=STEP_TIMEOUT_S)
    except subprocess.TimeoutExpired as exc:
        # Bubble a clean message up to the worker, which records it as the run's
        # failure detail (shown in PlanTab). NOTE (spike): the orphaned `docker
        # run --rm` container isn't reaped here; the real design runs each step
        # as a bounded OKE job that the platform can cancel.
        raise RuntimeError(f"tofu {args[0]} timed out after {STEP_TIMEOUT_S}s") from exc


def execute(mode: str, workspace: Path, profile: dict, run_dir: Path, state_url: str) -> dict:
    run_dir.mkdir(parents=True, exist_ok=True)
    result: dict = {"mode": mode, "image": IMAGE, "region": profile.get("region"), "steps": {}}

    def step(name: str, log_name: str, proc: subprocess.CompletedProcess) -> subprocess.CompletedProcess:
        (run_dir / log_name).write_text(proc.stdout + proc.stderr)
        result["steps"][name] = {"exit_code": proc.returncode}
        return proc

    def finish(status: str) -> dict:
        result["status"] = status
        (run_dir / "result.json").write_text(json.dumps(result, indent=2))
        return result

    if mode == "validate":
        init = step("init", "init.log",
                    _docker_tofu(["init", "-no-color", "-input=false", "-backend=false"], workspace, profile, False))
        if init.returncode != 0:
            return finish("init_failed")
        val = step("validate", "validate.log",
                   _docker_tofu(["validate", "-no-color"], workspace, profile, False))
        return finish("ok" if val.returncode == 0 else "validate_failed")

    init_args = ["init", "-no-color", "-input=false", "-reconfigure"]
    for k in ("address", "lock_address", "unlock_address"):
        init_args += ["-backend-config", f"{k}={state_url}"]
    init = step("init", "init.log", _docker_tofu(init_args, workspace, profile, True))
    if init.returncode != 0:
        return finish("init_failed")

    if mode == "drift":
        # Monitoring (Phase 3): a refresh-only plan compares live infrastructure
        # to the recorded state WITHOUT proposing config changes. -detailed-exitcode
        # gives 0 = in sync, 2 = drift found, 1 = error (ADR-0012). We never apply
        # here — detected drift is resolved by editing the model (ADR-0011), never
        # a targeted apply.
        drift_args = ["plan", "-no-color", "-input=false", "-refresh-only", "-detailed-exitcode", "-out=tfplan"]
        pl = step("plan", "plan.txt", _docker_tofu(drift_args, workspace, profile, True))
        if pl.returncode == 1:
            return finish("plan_failed")
        drifted: list[dict] = []
        show = _docker_tofu(["show", "-json", "tfplan"], workspace, profile, True)
        try:
            plan_json = json.loads(show.stdout)
            (run_dir / "plan.json").write_text(json.dumps(plan_json, indent=2))
            # In a refresh-only plan, out-of-band changes to managed resources
            # appear under resource_drift. We key off THIS, not the exit code:
            # -detailed-exitcode returns 2 for any difference including
            # output-only changes, which aren't real infrastructure drift.
            for rd in plan_json.get("resource_drift", []):
                drifted.append({"address": rd["address"],
                                "actions": rd.get("change", {}).get("actions", [])})
        except json.JSONDecodeError:
            pass
        result["drift"] = drifted
        result["summary"] = {"drifted": len(drifted)}
        # A stack is drifted only if real resources changed out of band.
        return finish("drift" if drifted else "clean")

    plan_args = ["plan", "-no-color", "-input=false", "-detailed-exitcode", "-out=tfplan"]
    if mode == "destroy":
        plan_args.insert(1, "-destroy")
    plan = step("plan", "plan.txt", _docker_tofu(plan_args, workspace, profile, True))
    if plan.returncode == 1:
        return finish("plan_failed")

    show = _docker_tofu(["show", "-json", "tfplan"], workspace, profile, True)
    changes: dict[str, list[str]] = {"create": [], "update": [], "delete": []}
    try:
        plan_json = json.loads(show.stdout)
        (run_dir / "plan.json").write_text(json.dumps(plan_json, indent=2))
        for rc in plan_json.get("resource_changes", []):
            for action in ("create", "update", "delete"):
                if action in rc["change"]["actions"]:
                    changes[action].append(rc["address"])
    except json.JSONDecodeError:
        pass
    result["changes"] = changes
    result["summary"] = {k: len(v) for k, v in changes.items()}

    if mode in ("apply", "destroy") and plan.returncode == 2:
        apply = step("apply", "apply.log",
                     _docker_tofu(["apply", "-no-color", "-input=false", "tfplan"], workspace, profile, True))
        if apply.returncode != 0:
            return finish("apply_failed")
    return finish("ok")
