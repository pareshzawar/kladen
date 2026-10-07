resource "oci_core_vcn" "main" {
  compartment_id = var.compartment_ocid
  display_name   = "kladen-spike-vcn"
  cidr_blocks    = ["10.0.0.0/16"]
  dns_label      = "kladenspike"
}

resource "oci_core_internet_gateway" "main" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "kladen-spike-igw"
  enabled        = true
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "kladen-spike-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

resource "oci_core_subnet" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "kladen-spike-public-subnet"
  cidr_block     = "10.0.1.0/24"
  dns_label      = "public"
  route_table_id = oci_core_route_table.public.id
}
