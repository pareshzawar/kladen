#!/usr/bin/env python3
"""CIS-aligned checks on a run's plan.json — Phase 2 "Secure", form (a).

Reads the persisted plan.json (same seam as the price estimator) and evaluates
the *planned* resources against a set of CIS-benchmark-aligned controls, then
reports pass / fail / not-applicable per control and emits a finding for each
failure in the shared findings shape (findings.py, source="cis"). So a Cloud
Guard problem and a CIS failure look identical to the dashboard and to any
later correlation.

Deliberately scoped, like the estimator: only controls that map to the config
the loop's templates actually generate (compute, Autonomous DB, Object Storage).
This is advisory design-time posture — it tells you whether the HCL Kladen is
about to apply is hardened — NOT a certified CIS audit of a live tenancy (that's
the Cloud Guard / runtime-scan leg). Honest about scope beats fake-complete.

No credentials or network needed — it reads plan.json only.
"""
from __future__ import annotations

import findings


def _first(block):
    """A tofu block attribute is a list of one dict in plan.json; unwrap it."""
    if isinstance(block, list):
        return block[0] if block else {}
    return block or {}


def _bucket_public(a: dict) -> str:
    # Default (attribute absent) is NoPublicAccess, which is safe.
    v = a.get("access_type")
    if v in (None, ""):
        return "pass"
    return "pass" if v == "NoPublicAccess" else "fail"


def _bucket_versioning(a: dict) -> str:
    v = a.get("versioning")
    if v in (None, ""):
        return "unknown"
    return "pass" if v == "Enabled" else "fail"


def _instance_public_ip(a: dict) -> str:
    v = _first(a.get("create_vnic_details")).get("assign_public_ip")
    if v is None:
        return "unknown"
    # OCI represents this as the string 'true'/'false' (or a bool).
    return "fail" if str(v).lower() in ("true", "1") else "pass"


def _instance_transit_enc(a: dict) -> str:
    v = a.get("is_pv_encryption_in_transit_enabled")
    if v is None:
        return "unknown"
    return "pass" if v is True else "fail"


def _instance_cmk(a: dict) -> str:
    # A customer-managed key on the boot volume vs the default Oracle-managed key.
    return "pass" if _first(a.get("source_details")).get("kms_key_id") else "fail"


def _adb_mtls(a: dict) -> str:
    v = a.get("is_mtls_connection_required")
    if v is None:
        return "unknown"
    return "pass" if v is True else "fail"


# Each control: a CIS-aligned rule bound to one resource type. `test(after)`
# returns "pass" | "fail" | "unknown"; `detail` explains a failure. `ref` is the
# CIS section it aligns to (approximate — we cite the area, not claim certification).
CHECKS = [
    {"id": "cis-oci-4.1", "ref": "CIS OCI 4.1", "type": "oci_objectstorage_bucket", "severity": "high",
     "title": "Object Storage bucket is not publicly accessible",
     "test": _bucket_public, "detail": lambda a: f"access_type = {a.get('access_type')!r} exposes the bucket publicly"},
    {"id": "cis-oci-4.3", "ref": "CIS OCI 4.3", "type": "oci_objectstorage_bucket", "severity": "low",
     "title": "Object Storage bucket has versioning enabled",
     "test": _bucket_versioning, "detail": lambda a: f"versioning = {a.get('versioning')!r} (recommend Enabled)"},
    {"id": "cis-oci-2.2", "ref": "CIS OCI 2.x", "type": "oci_core_instance", "severity": "high",
     "title": "Compute instance is not assigned a public IP",
     "test": _instance_public_ip, "detail": lambda a: "create_vnic_details.assign_public_ip is true"},
    {"id": "cis-oci-4.2", "ref": "CIS OCI 4.2", "type": "oci_core_instance", "severity": "medium",
     "title": "Compute in-transit (paravirtualized) encryption is enabled",
     "test": _instance_transit_enc, "detail": lambda a: "is_pv_encryption_in_transit_enabled is not true"},
    {"id": "cis-oci-4.4", "ref": "CIS OCI 4.x", "type": "oci_core_instance", "severity": "low",
     "title": "Boot volume uses a customer-managed key (CMK)",
     "test": _instance_cmk, "detail": lambda a: "boot volume uses an Oracle-managed key; CIS recommends a customer-managed key (CMK)"},
    {"id": "cis-oci-6.1", "ref": "CIS OCI 6.x", "type": "oci_database_autonomous_database", "severity": "medium",
     "title": "Autonomous DB requires mutual TLS (mTLS)",
     "test": _adb_mtls, "detail": lambda a: "is_mtls_connection_required is not true"},
]


def evaluate(plan_json: dict) -> dict:
    """Return {controls, findings, summary, note} for a plan's create actions.

    - controls: one entry per CIS control with an aggregate status and per-resource results.
    - findings: one generic finding per failing resource (shared shape, source="cis").
    - summary: pass/fail/unknown/not_applicable counts + resources scanned.
    """
    creates = [rc for rc in plan_json.get("resource_changes", [])
               if "create" in rc.get("change", {}).get("actions", [])]
    controls = []
    found: list[dict] = []

    for chk in CHECKS:
        results = []
        for rc in creates:
            if rc["type"] != chk["type"]:
                continue
            after = rc["change"].get("after") or {}
            verdict = chk["test"](after)
            row = {"resource": rc["address"], "status": verdict}
            if verdict == "fail":
                row["detail"] = chk["detail"](after)
                found.append(findings.finding(
                    source="cis", severity=chk["severity"], title=chk["title"],
                    detail=chk["detail"](after), resource_ref=rc["address"],
                    resource_type=rc["type"], source_of_record=chk["id"]))
            results.append(row)

        # Aggregate: a control fails if any applicable resource fails; passes if
        # all applicable pass; not_applicable if nothing of this type is planned.
        if not results:
            status = "not_applicable"
        elif any(r["status"] == "fail" for r in results):
            status = "fail"
        elif all(r["status"] == "pass" for r in results):
            status = "pass"
        else:
            status = "unknown"
        controls.append({"id": chk["id"], "ref": chk["ref"], "title": chk["title"],
                         "severity": chk["severity"], "status": status, "results": results})

    summary = {
        "pass": sum(c["status"] == "pass" for c in controls),
        "fail": sum(c["status"] == "fail" for c in controls),
        "unknown": sum(c["status"] == "unknown" for c in controls),
        "not_applicable": sum(c["status"] == "not_applicable" for c in controls),
        "resources": len(creates),
    }
    return {
        "controls": controls,
        "findings": sorted(found, key=findings.sort_key),
        "summary": summary,
        "note": ("CIS-aligned checks on the planned resources (a subset scoped to the loop's "
                 "services). Design-time posture, advisory — not a certified CIS audit."),
    }
