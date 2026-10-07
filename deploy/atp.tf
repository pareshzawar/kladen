# Autonomous Transaction Processing — the Kladen metadata store (orgs, clients,
# stacks, runs, profiles-as-pointers, users, approvals). Always Free shape:
# is_free_tier = true pins 1 OCPU / 1 TB / auto-scaling off.
#
# After apply, load deploy/sql/schema_atp.sql as ADMIN, and download the wallet
# (see deploy/README.md) for the backend to connect with python-oracledb.

resource "oci_database_autonomous_database" "kladen" {
  compartment_id           = var.compartment_ocid
  db_name                  = var.adb_db_name
  display_name             = "${var.label}-metadata"
  admin_password           = var.adb_admin_password
  db_workload              = "OLTP"
  is_free_tier             = true
  cpu_core_count           = 1
  data_storage_size_in_tbs = 1
  is_auto_scaling_enabled  = false

  # Free-tier ATP is reachable over the public internet with mTLS (wallet).
  # No private endpoint on free tier.
  freeform_tags = {
    "app"        = "kladen"
    "managed-by" = "kladen-deploy"
  }
}
