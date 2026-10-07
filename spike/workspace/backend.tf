# State via OpenTofu's `http` backend against the Kladen state service, which
# persists versions to OCI Object Storage with API-key auth and enforces locking.
# (OpenTofu has no native Oracle backend, and the S3-compat route needs customer
# secret keys — capped at 2/user. Platform-owned state service is the design.)
# Connection values injected by the runner at init time.
terraform {
  backend "http" {}
}
