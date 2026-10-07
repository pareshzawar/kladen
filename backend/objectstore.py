#!/usr/bin/env python3
"""Object Storage for run artifacts (logs, plan.json, result.json, reports).

Blobs go here; the DB keeps only the object prefix. Gated by env so the app
runs locally with just the filesystem when Object Storage isn't configured:

    KLADEN_ARTIFACTS_BUCKET   bucket name (unset -> upload is skipped)
    KLADEN_OS_NAMESPACE       Object Storage namespace (auto-detected if unset)

upload_run_dir() mirrors a run directory to runs/<id>/... and returns the
os:// prefix, or None when Object Storage isn't configured.
"""
from __future__ import annotations

import os
from pathlib import Path

from ociauth import client


def configured() -> bool:
    return bool(os.environ.get("KLADEN_ARTIFACTS_BUCKET"))


def _namespace(os_client) -> str:
    ns = os.environ.get("KLADEN_OS_NAMESPACE")
    return ns or os_client.get_namespace().data


def upload_run_dir(run_id: int, run_dir: Path) -> str | None:
    """Upload every file in run_dir to runs/<run_id>/<name>. Returns os:// prefix."""
    if not configured():
        return None
    import oci  # lazy

    bucket = os.environ["KLADEN_ARTIFACTS_BUCKET"]
    os_client = client(oci.object_storage.ObjectStorageClient)
    namespace = _namespace(os_client)
    for f in sorted(run_dir.iterdir()):
        if not f.is_file():
            continue
        os_client.put_object(namespace, bucket, f"runs/{run_id}/{f.name}", f.read_bytes())
    return f"os://{bucket}/runs/{run_id}/"
