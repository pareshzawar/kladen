#!/usr/bin/env python3
"""Kladen spike runner: execute `tofu plan` in an isolated container against a real OCI tenancy.

Flow (mirrors the eventual platform runner):
  1. Load OCI credentials for one profile (stand-in for per-customer OCI Vault injection).
  2. Run `tofu init` and `tofu plan` in a pinned OpenTofu container, workspace mounted,
     credentials passed as env vars + a read-only key mount. Nothing is installed on the host.
  3. Parse the machine-readable plan and emit a structured result JSON — the artifact the
     platform GUI would render.

Plan-only by design. No apply.
"""

import argparse
import configparser
import datetime
import json
import subprocess
import sys
import uuid
from pathlib import Path

IMAGE = "ghcr.io/opentofu/opentofu:1.12"
KEY_MOUNT = "/run/secrets/oci_api_key.pem"
# Kladen state service (spike/state_server), reachable from the container via
# Docker Desktop's host alias. It mirrors state to the kladen-tofu-state bucket.
STATE_URL = "http://host.docker.internal:8300/state/spike"


def load_profile(profile: str) -> dict:
    cfg = configparser.ConfigParser()
    cfg.read(Path.home() / ".oci" / "config")
    if profile not in cfg:
        sys.exit(f"profile [{profile}] not found in ~/.oci/config")
    section = cfg[profile]
    return {
        "tenancy_ocid": section["tenancy"],
        "user_ocid": section["user"],
        "fingerprint": section["fingerprint"],
        "region": section["region"],
        "key_file": str(Path(section["key_file"]).expanduser()),
    }


def docker_tofu(args: list[str], workspace: Path, creds: dict, compartment: str) -> subprocess.CompletedProcess:
    env_vars = {
        "TF_VAR_tenancy_ocid": creds["tenancy_ocid"],
        "TF_VAR_user_ocid": creds["user_ocid"],
        "TF_VAR_fingerprint": creds["fingerprint"],
        "TF_VAR_region": creds["region"],
        "TF_VAR_private_key_path": KEY_MOUNT,
        "TF_VAR_compartment_ocid": compartment,
        "TF_IN_AUTOMATION": "1",
    }
    cmd = ["docker", "run", "--rm", "--network", "bridge",
           "-v", f"{workspace}:/workspace",
           "-v", f"{creds['key_file']}:{KEY_MOUNT}:ro",
           "-w", "/workspace"]
    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]
    cmd += [IMAGE] + args
    return subprocess.run(cmd, capture_output=True, text=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", nargs="?", default="plan", choices=["plan", "apply", "destroy"])
    ap.add_argument("--profile", default="DEFAULT")
    ap.add_argument("--workspace", default=str(Path(__file__).resolve().parent.parent / "workspace"))
    ap.add_argument("--compartment", default=None, help="target compartment OCID (default: tenancy root)")
    args = ap.parse_args()

    workspace = Path(args.workspace).resolve()
    creds = load_profile(args.profile)
    compartment = args.compartment or creds["tenancy_ocid"]

    run_id = f"{datetime.datetime.now(datetime.UTC):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}"
    run_dir = Path(__file__).resolve().parent / "runs" / run_id
    run_dir.mkdir(parents=True)
    print(f"run {run_id}")
    print(f"  image     {IMAGE}")
    print(f"  workspace {workspace}")
    print(f"  region    {creds['region']}")

    result: dict = {"run_id": run_id, "image": IMAGE, "region": creds["region"], "steps": {}}

    backend_cfg = {
        "address": STATE_URL,
        "lock_address": STATE_URL,
        "unlock_address": STATE_URL,
    }
    init_args = ["init", "-no-color", "-input=false", "-reconfigure"]
    for k, v in backend_cfg.items():
        init_args += ["-backend-config", f"{k}={v}"]
    init = docker_tofu(init_args, workspace, creds, compartment)
    (run_dir / "init.log").write_text(init.stdout + init.stderr)
    result["steps"]["init"] = {"exit_code": init.returncode}
    print(f"  init      exit={init.returncode}")
    if init.returncode != 0:
        result["status"] = "init_failed"
        (run_dir / "result.json").write_text(json.dumps(result, indent=2))
        print(init.stderr, file=sys.stderr)
        sys.exit(1)

    plan_args = ["plan", "-no-color", "-input=false", "-detailed-exitcode", "-out=tfplan"]
    if args.mode == "destroy":
        plan_args.insert(1, "-destroy")
    plan = docker_tofu(plan_args, workspace, creds, compartment)
    (run_dir / "plan.txt").write_text(plan.stdout + plan.stderr)
    result["steps"]["plan"] = {"exit_code": plan.returncode}
    print(f"  plan      exit={plan.returncode} (0=no changes, 2=changes)")
    if plan.returncode == 1:
        result["status"] = "plan_failed"
        (run_dir / "result.json").write_text(json.dumps(result, indent=2))
        print(plan.stderr, file=sys.stderr)
        sys.exit(1)

    show = docker_tofu(["show", "-json", "tfplan"], workspace, creds, compartment)
    plan_json = json.loads(show.stdout)
    (run_dir / "plan.json").write_text(json.dumps(plan_json, indent=2))

    changes = {"create": [], "update": [], "delete": []}
    for rc in plan_json.get("resource_changes", []):
        actions = rc["change"]["actions"]
        if "create" in actions:
            changes["create"].append(rc["address"])
        if "update" in actions:
            changes["update"].append(rc["address"])
        if "delete" in actions:
            changes["delete"].append(rc["address"])

    result["changes"] = changes
    result["summary"] = {k: len(v) for k, v in changes.items()}
    print(f"  summary   +{len(changes['create'])} ~{len(changes['update'])} -{len(changes['delete'])}")
    for sign, key in (("+", "create"), ("~", "update"), ("-", "delete")):
        for addr in changes[key]:
            print(f"    {sign} {addr}")

    if args.mode in ("apply", "destroy") and plan.returncode == 2:
        # The saved plan is applied exactly as reviewed — same contract the
        # platform's approval flow will use (approve plan N, apply plan N).
        apply = docker_tofu(["apply", "-no-color", "-input=false", "tfplan"],
                            workspace, creds, compartment)
        (run_dir / "apply.log").write_text(apply.stdout + apply.stderr)
        result["steps"]["apply"] = {"exit_code": apply.returncode}
        print(f"  apply     exit={apply.returncode}")
        if apply.returncode != 0:
            result["status"] = "apply_failed"
            (run_dir / "result.json").write_text(json.dumps(result, indent=2))
            print(apply.stderr, file=sys.stderr)
            sys.exit(1)

    result["status"] = "ok"
    (run_dir / "result.json").write_text(json.dumps(result, indent=2))
    print(f"  artifacts {run_dir}")


if __name__ == "__main__":
    main()
