# ---- Authentication (your bootstrap OCI identity) ------------------------
variable "tenancy_ocid" { type = string }
variable "user_ocid" { type = string }
variable "fingerprint" { type = string }
variable "private_key_path" { type = string }
variable "region" { type = string }

# Compartment to build the Kladen platform in. Default to tenancy root by
# passing the tenancy OCID; a dedicated compartment is cleaner in production.
variable "compartment_ocid" {
  type        = string
  description = "Compartment for the Kladen platform resources."
}

# ---- Naming / tagging ----------------------------------------------------
variable "label" {
  type        = string
  default     = "kladen"
  description = "Name prefix for all created resources."
}

# ---- Autonomous DB (metadata store) --------------------------------------
variable "adb_admin_password" {
  type        = string
  sensitive   = true
  description = "ADMIN password for ATP (12-30 chars, 1 upper, 1 lower, 1 digit, no double-quote, not 'admin')."
}

variable "adb_db_name" {
  type        = string
  default     = "kladendb"
  description = "ATP database name (letters/numbers, <=14 chars, letter first)."
}

# ---- Compute (runner VM) -------------------------------------------------
variable "vm_shape" {
  type        = string
  default     = "VM.Standard.A1.Flex"
  description = "Free tier: VM.Standard.A1.Flex (Ampere, 4 OCPU/24GB free) or VM.Standard.E2.1.Micro (AMD, always-free micro)."
}

variable "vm_ocpus" {
  type        = number
  default     = 1
  description = "OCPUs for a Flex shape (ignored for E2.1.Micro). Stay within the free 4-OCPU Ampere budget."
}

variable "vm_memory_gbs" {
  type        = number
  default     = 6
  description = "Memory for a Flex shape (ignored for E2.1.Micro). Free Ampere budget is 24 GB total."
}

variable "ssh_public_key" {
  type        = string
  description = "SSH public key for the 'opc' user on the runner VM."
}

variable "ssh_ingress_cidr" {
  type        = string
  default     = "0.0.0.0/0"
  description = "CIDR allowed to SSH the VM. Narrow this to your IP in production."
}

variable "http_ingress_cidr" {
  type        = string
  default     = ""
  description = <<-EOT
    CIDR allowed to reach the app over HTTP :80. Empty (default) keeps port 80
    closed — reach the UI over an SSH tunnel. Set it to "<your-ip>/32" to open
    the app for testing. The API has no authentication yet, so anyone who can
    reach :80 can drive real infrastructure runs: do not use 0.0.0.0/0.
  EOT
}

# ---- Object Storage ------------------------------------------------------
variable "artifacts_bucket_name" {
  type        = string
  default     = "kladen-artifacts"
  description = "Bucket for run logs, plans, reports."
}

variable "state_bucket_name" {
  type        = string
  default     = "kladen-tofu-state"
  description = "Bucket the state service mirrors OpenTofu state into."
}
