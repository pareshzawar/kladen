#!/usr/bin/env python3
"""OCI auth for the backend — one factory, two modes.

Locally (dev) the backend authenticates with your ~/.oci/config; on the runner
VM it uses instance principals (no keys on disk). Selected by env:

    KLADEN_OCI_AUTH = config | instance_principal   (default: config)
    KLADEN_OCI_PROFILE = DEFAULT                     (config mode only)

Every OCI client (Vault, Object Storage) is built from (config, signer). The
`oci` SDK is imported lazily so the app still runs where it isn't installed —
callers that need OCI get a clear error instead of an import crash at startup.
"""
from __future__ import annotations

import functools
import os


class OciUnavailable(RuntimeError):
    """Raised when an OCI operation is requested but the SDK/auth isn't set up."""


@functools.lru_cache(maxsize=1)
def config_and_signer() -> tuple[dict, object | None]:
    try:
        import oci  # noqa: PLC0415  (lazy on purpose)
    except ImportError as exc:  # pragma: no cover - env-dependent
        raise OciUnavailable(
            "the 'oci' SDK is not installed — run `pip install oci` (it's in "
            "backend/requirements.txt) to use Vault or Object Storage"
        ) from exc

    mode = os.environ.get("KLADEN_OCI_AUTH", "config")
    if mode == "instance_principal":
        signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
        # Region comes from the signer; config carries only the tenancy.
        return {"region": signer.region, "tenancy": signer.tenancy_id}, signer

    profile = os.environ.get("KLADEN_OCI_PROFILE", "DEFAULT")
    config = oci.config.from_file(profile_name=profile)
    oci.config.validate_config(config)
    return config, None


def client(client_cls):
    """Build an OCI service client of the given class with the active auth."""
    config, signer = config_and_signer()
    return client_cls(config, signer=signer) if signer else client_cls(config)
