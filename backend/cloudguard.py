#!/usr/bin/env python3
"""Surface OCI Cloud Guard findings — Phase 2 "Secure", the first source that
populates the generic findings model (see findings.py).

We ORCHESTRATE, we don't detect (ROADMAP): Cloud Guard is an OCI-native service
that already scans the tenancy; we read its open Problems via the SDK and map
them into our shape. Read-plane only (ADR-0011): never write back.

Cloud Guard is OFF by default in a tenancy and needs a one-time console setup
(enable + a target on the root compartment). So "not enabled" is a normal,
first-class result here — reported honestly, never faked into zero-findings that
look like a clean bill of health.
"""
from __future__ import annotations

import datetime

import findings

# Cloud Guard risk levels -> our normalized severities.
RISK_TO_SEVERITY = {
    "CRITICAL": "critical",
    "HIGH": "high",
    "MEDIUM": "medium",
    "LOW": "low",
    "MINOR": "minor",
}


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def fetch(profile: dict, limit: int = 50) -> dict:
    """Read open Cloud Guard problems for a profile's tenancy.

    `profile` is a materialized profile dict (tenancy_ocid/user_ocid/fingerprint/
    key_path/region — see api.materialize_profile). Returns:

        {status, findings, region, synced_at[, detail]}

    where status is exactly one of, and callers render each honestly:
        ok              — reachable; `findings` holds the mapped problems
        not_enabled     — Cloud Guard isn't enabled/authorized in this tenancy
        no_credentials  — no usable profile to authenticate with
        sdk_unavailable — the oci SDK isn't importable in this process
        error           — anything else (detail carries a short reason)
    """
    synced_at = _now_iso()
    profile = profile or {}
    region = profile.get("region", "")
    tenancy = profile.get("tenancy_ocid")
    key_path = profile.get("key_path")

    if not tenancy or not key_path:
        return {"status": "no_credentials", "findings": [], "region": region, "synced_at": synced_at}

    try:
        import oci  # lazy: only this feature needs the SDK (matches vault.py)
    except Exception:
        return {"status": "sdk_unavailable", "findings": [], "region": region, "synced_at": synced_at}

    cfg = {
        "user": profile.get("user_ocid", ""),
        "tenancy": tenancy,
        "fingerprint": profile.get("fingerprint", ""),
        "key_file": key_path,
        "region": region,
    }

    try:
        client = oci.cloud_guard.CloudGuardClient(cfg)
        # Whole-tenancy view: root compartment + subtree.
        resp = client.list_problems(
            compartment_id=tenancy,
            compartment_id_in_subtree=True,
            limit=limit,
        )
        items = resp.data.items
    except oci.exceptions.ServiceError as e:
        # 404 NotAuthorizedOrNotFound is what Cloud Guard returns when it isn't
        # enabled (or the IAM user can't read it) — treat as "not enabled", not
        # a crash, so the UI can prompt the one-time enablement.
        if e.status == 404:
            return {"status": "not_enabled", "findings": [], "region": region, "synced_at": synced_at}
        return {"status": "error", "detail": f"{e.status} {e.code}", "findings": [], "region": region, "synced_at": synced_at}
    except Exception as e:  # noqa: BLE001 — surface any auth/network issue as a status, don't 500
        return {"status": "error", "detail": str(e)[:200], "findings": [], "region": region, "synced_at": synced_at}

    out = [_to_finding(p, region) for p in items]
    out.sort(key=findings.sort_key)
    return {"status": "ok", "findings": out, "region": region, "synced_at": synced_at}


def _to_finding(p, fallback_region: str) -> dict:
    """Map one Cloud Guard ProblemSummary into the generic findings shape.

    Defensive with getattr — the SDK model has many optional fields and we only
    depend on a few. `labels` names the detector rule that fired.
    """
    labels = getattr(p, "labels", None) or []
    resource_type = getattr(p, "resource_type", "") or ""
    resource_name = getattr(p, "resource_name", "") or ""
    title = ", ".join(labels) if labels else (resource_type or "Cloud Guard problem")
    detail_bits = [b for b in (resource_type, resource_name) if b]
    return findings.finding(
        source="cloud_guard",
        severity=RISK_TO_SEVERITY.get((getattr(p, "risk_level", "") or "").upper(), "info"),
        title=title,
        detail=" · ".join(detail_bits),
        resource_ref=getattr(p, "resource_id", "") or "",
        resource_type=resource_type,
        region=getattr(p, "region", "") or fallback_region,
        source_of_record=getattr(p, "id", "") or "",
        first_seen=str(getattr(p, "time_first_detected", "") or ""),
        last_seen=str(getattr(p, "time_last_detected", "") or ""),
    )
