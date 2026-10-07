# Instance-principal access for the runner VM: a dynamic group that matches the
# VM, and policies letting it read Vault secrets, read/write the buckets, and
# use the Autonomous DB — all WITHOUT any API keys on the VM. The backend uses
# InstancePrincipalsSecurityTokenSigner when it runs there (see backend/ociauth.py).
#
# These are tenancy-level identity resources and need an admin identity to
# apply. If your tenancy uses identity domains, they land in the default domain.

resource "oci_identity_dynamic_group" "runners" {
  compartment_id = var.tenancy_ocid
  name           = "${var.label}-runners"
  description    = "Kladen runner VMs (instance principals)"
  matching_rule  = "ALL {instance.compartment.id = '${var.compartment_ocid}'}"
}

resource "oci_identity_policy" "runner_access" {
  compartment_id = var.compartment_ocid
  name           = "${var.label}-runner-access"
  description    = "Kladen runner: vault secrets, object storage, autonomous db"

  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.runners.name} to read secret-family in compartment id ${var.compartment_ocid}",
    "Allow dynamic-group ${oci_identity_dynamic_group.runners.name} to manage objects in compartment id ${var.compartment_ocid} where target.bucket.name = '${var.artifacts_bucket_name}'",
    "Allow dynamic-group ${oci_identity_dynamic_group.runners.name} to manage objects in compartment id ${var.compartment_ocid} where target.bucket.name = '${var.state_bucket_name}'",
    "Allow dynamic-group ${oci_identity_dynamic_group.runners.name} to read buckets in compartment id ${var.compartment_ocid}",
    "Allow dynamic-group ${oci_identity_dynamic_group.runners.name} to use autonomous-database-family in compartment id ${var.compartment_ocid}",
  ]
}
