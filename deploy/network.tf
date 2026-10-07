# Minimal VCN for the runner VM: one public subnet reachable over SSH, with
# egress open so the VM can pull containers, talk to OCI APIs, and reach the
# internet. The app's own ports (8000/8400) stay closed to the world — reach
# them over an SSH tunnel, or add a narrow ingress rule if you must.

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

resource "oci_core_vcn" "main" {
  compartment_id = var.compartment_ocid
  display_name   = "${var.label}-vcn"
  cidr_blocks    = ["10.10.0.0/16"]
  dns_label      = "kladen"
}

resource "oci_core_internet_gateway" "main" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.label}-igw"
  enabled        = true
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.label}-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

resource "oci_core_security_list" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${var.label}-public-sl"

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }

  ingress_security_rules {
    protocol = "6" # TCP
    source   = var.ssh_ingress_cidr
    tcp_options {
      min = 22
      max = 22
    }
  }

  # Optional HTTP access to the app. Closed unless http_ingress_cidr is set —
  # see the warning on that variable (the API has no auth yet).
  dynamic "ingress_security_rules" {
    for_each = var.http_ingress_cidr == "" ? [] : [var.http_ingress_cidr]
    content {
      protocol = "6" # TCP
      source   = ingress_security_rules.value
      tcp_options {
        min = 80
        max = 80
      }
    }
  }
}

resource "oci_core_subnet" "public" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.main.id
  display_name               = "${var.label}-public-subnet"
  cidr_block                 = "10.10.1.0/24"
  dns_label                  = "public"
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.public.id]
  prohibit_public_ip_on_vnic = false
}
