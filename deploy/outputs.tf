output "runner_public_ip" {
  value       = oci_core_instance.runner.public_ip
  description = "SSH here: ssh opc@<ip>. Reach the app over a tunnel: ssh -L 8400:localhost:8400 opc@<ip>."
}

output "adb_id" {
  value       = oci_database_autonomous_database.kladen.id
  description = "Autonomous DB OCID (use with the OCI console/CLI to download the wallet)."
}

output "adb_connection_strings" {
  value       = oci_database_autonomous_database.kladen.connection_strings
  sensitive   = true
  description = "TNS aliases (e.g. kladendb_high) for the backend's connection string."
}

output "vault_id" {
  value       = oci_kms_vault.main.id
  description = "Vault OCID — set as KLADEN_VAULT_ID for the backend."
}

output "vault_management_endpoint" {
  value       = oci_kms_vault.main.management_endpoint
  description = "Vault management endpoint."
}

output "master_key_id" {
  value       = oci_kms_key.master.id
  description = "Master encryption key OCID — set as KLADEN_VAULT_KEY_ID for secret creation."
}

output "namespace" {
  value       = data.oci_objectstorage_namespace.ns.namespace
  description = "Object Storage namespace — set as KLADEN_OS_NAMESPACE."
}

output "artifacts_bucket" {
  value       = oci_objectstorage_bucket.artifacts.name
  description = "Artifacts bucket — set as KLADEN_ARTIFACTS_BUCKET."
}

output "state_bucket" {
  value       = oci_objectstorage_bucket.state.name
  description = "State bucket — set as KLADEN_STATE_BUCKET."
}

output "compartment_ocid" {
  value       = var.compartment_ocid
  description = "Compartment the platform lives in — set as KLADEN_COMPARTMENT_ID."
}
