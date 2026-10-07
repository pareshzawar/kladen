# Object Storage — two private, versioned buckets:
#   artifacts : run logs, plan.json/result.json, generated HCL, reports
#   state     : OpenTofu state versions mirrored by the state service
# Blobs live here; the DB keeps only object names + small summaries.

data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.compartment_ocid
}

resource "oci_objectstorage_bucket" "artifacts" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = var.artifacts_bucket_name
  access_type    = "NoPublicAccess"
  versioning     = "Enabled"
  storage_tier   = "Standard"

  freeform_tags = {
    "app"        = "kladen"
    "managed-by" = "kladen-deploy"
  }
}

resource "oci_objectstorage_bucket" "state" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = var.state_bucket_name
  access_type    = "NoPublicAccess"
  versioning     = "Enabled"
  storage_tier   = "Standard"

  freeform_tags = {
    "app"        = "kladen"
    "managed-by" = "kladen-deploy"
  }
}
