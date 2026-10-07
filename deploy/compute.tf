# The runner VM. cloud-init installs Docker (for the OpenTofu runner container),
# OpenTofu, and Python + the OCI/oracledb SDKs so backend/api.py can run here
# using instance principals. App code is deployed separately (git pull / rsync)
# — see deploy/README.md.

# Latest Oracle Linux 8 image for the chosen shape (arch is inferred from shape).
data "oci_core_images" "ol8" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Oracle Linux"
  operating_system_version = "8"
  shape                    = var.vm_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_instance" "runner" {
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "${var.label}-runner"
  shape               = var.vm_shape

  # shape_config is honored only by Flex shapes; harmless on fixed shapes.
  shape_config {
    ocpus         = var.vm_ocpus
    memory_in_gbs = var.vm_memory_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
    display_name     = "${var.label}-runner-vnic"
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ol8.images[0].id
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data           = base64encode(file("${path.module}/cloud-init/runner.yaml"))
  }

  freeform_tags = {
    "app"        = "kladen"
    "managed-by" = "kladen-deploy"
  }
}
