#!/usr/bin/env python3
"""OCI Vault secret access for client OCI credentials.

A vault-mode profile stores one secret whose plaintext is a JSON credential
bundle:

    {
      "tenancy_ocid": "...",
      "user_ocid": "...",
      "fingerprint": "...",
      "region": "...",
      "compartment_ocid": "...",
      "private_key_pem": "-----BEGIN PRIVATE KEY-----\\n..."
    }

get_secret() pulls and decodes it at run time; the backend materializes the PEM
to a private temp file and hands the runner a normal profile dict, so the rest
of the run path is identical to manual mode. put_secret() creates such a secret
from a manual profile — the bridge that lets you move a bootstrap profile into
the vault (point 5: both paths work).

Secrets are read via the Secrets service and written via the Vault service.
"""
from __future__ import annotations

import base64
import json

from ociauth import client


def get_secret(secret_ocid: str) -> dict:
    """Fetch and decode a credential bundle from Vault by secret OCID."""
    import oci  # lazy

    secrets = client(oci.secrets.SecretsClient)
    bundle = secrets.get_secret_bundle(secret_ocid).data
    content = bundle.secret_bundle_content.content  # base64
    raw = base64.b64decode(content).decode("utf-8")
    data = json.loads(raw)
    if "private_key_pem" not in data:
        raise ValueError("vault secret is missing 'private_key_pem'")
    return data


def put_secret(vault_id: str, key_id: str, compartment_id: str, name: str, bundle: dict) -> str:
    """Create a new Vault secret from a credential bundle; return its OCID."""
    import oci  # lazy

    vaults = client(oci.vault.VaultsClient)
    payload = base64.b64encode(json.dumps(bundle).encode("utf-8")).decode("ascii")
    details = oci.vault.models.CreateSecretDetails(
        compartment_id=compartment_id,
        secret_name=name,
        vault_id=vault_id,
        key_id=key_id,
        secret_content=oci.vault.models.Base64SecretContentDetails(
            content_type="BASE64", content=payload
        ),
    )
    return vaults.create_secret(details).data.id
