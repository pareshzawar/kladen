# Kladen platform provisioning — the OCI services the app itself needs to run
# remotely and store remotely: Autonomous DB (metadata), Object Storage (run
# artifacts + state), Vault (client secrets), and a free-tier VM (runner host).
#
# This is the ONE stack you apply by hand, with your own OCI identity, before
# Kladen manages anything. Everything here is inside the Always Free tier when
# the defaults in variables.tf are used.
terraform {
  required_version = ">= 1.8"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}

provider "oci" {
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
  region           = var.region
}
