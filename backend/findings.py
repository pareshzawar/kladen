#!/usr/bin/env python3
"""The generic security-finding model — Phase 2 "Secure" seam #1.

Every posture source maps into ONE shape so the UI, storage, and future
correlation don't care where a finding came from: Cloud Guard today; CIS checks
and drift later all populate this same dict. Keeping a single shape is the cheap
insurance called out in ROADMAP §Seams — a new source is a new mapper, not a new
schema.

Read-plane discipline (ROADMAP seam #5 / ADR-0011): a finding records where it
came from (`source`, `source_of_record`) and when we last saw it — we surface
external detections, we never write back to the source and never invent one.
"""
from __future__ import annotations

# Lower = more urgent. Used to sort findings and to pick a headline severity.
SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "minor": 4, "info": 5}


def finding(
    *,
    source: str,              # cloud_guard | cis | drift — which detector produced it
    severity: str,            # critical|high|medium|low|minor|info (normalized, lower-case)
    title: str,               # short human label
    detail: str = "",         # longer description
    resource_ref: str = "",   # OCID (or model address) the finding is about
    resource_type: str = "",  # e.g. oci_core_instance / "Instance"
    region: str = "",
    source_of_record: str = "",  # the UPSTREAM id (e.g. Cloud Guard problem OCID) — never ours
    first_seen: str = "",
    last_seen: str = "",
) -> dict:
    """Build one finding dict in the shared shape. All sources go through here."""
    return {
        "source": source,
        "severity": (severity or "info").lower(),
        "title": title,
        "detail": detail,
        "resource_ref": resource_ref,
        "resource_type": resource_type,
        "region": region,
        "source_of_record": source_of_record,
        "first_seen": first_seen,
        "last_seen": last_seen,
    }


def sort_key(f: dict) -> int:
    """Sort helper: most-urgent severity first, unknown severities last."""
    return SEVERITY_ORDER.get(f.get("severity", "info"), 99)


def severity_counts(items: list[dict]) -> dict:
    """Tally findings by severity for a compact summary (e.g. '2 high · 5 medium')."""
    counts: dict[str, int] = {}
    for f in items:
        s = f.get("severity", "info")
        counts[s] = counts.get(s, 0) + 1
    return counts
