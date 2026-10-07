# KMS Vault + master key — the secret store for client OCI credentials.
#
# The vault and its master encryption key are created here. Individual client
# secrets are NOT created in Terraform: Kladen writes them at runtime through
# the Vault API when you choose "Store in Vault" while creating a profile, so
# credentials never pass through this state file. Each secret's plaintext is a
# JSON blob: {tenancy_ocid,user_ocid,fingerprint,region,compartment_ocid,
# private_key_pem}. See backend/vault.py and deploy/README.md.
#
# DEFAULT (multi-tenant) vaults are free of the per-hour key cost that a
# virtual-private vault carries; the AES master key below is the only billable
# KMS item and is within normal free usage for light use.

resource "oci_kms_vault" "main" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.label}-vault"
  vault_type     = "DEFAULT"

  freeform_tags = {
    "app"        = "kladen"
    "managed-by" = "kladen-deploy"
  }
}

resource "oci_kms_key" "master" {
  compartment_id      = var.compartment_ocid
  display_name        = "${var.label}-master-key"
  management_endpoint = oci_kms_vault.main.management_endpoint

  key_shape {
    algorithm = "AES"
    length    = 32
  }

  freeform_tags = {
    "app"        = "kladen"
    "managed-by" = "kladen-deploy"
  }
}
