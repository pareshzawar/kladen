"""Kladen codegen service — THIS FILE GENERATES ALL OF THE OPENTOFU CODE.

What happens, end to end:

  1. The React GUI (frontend) keeps the stack you draw as a JSON model:
     a list of resources like {"type": "adb", "config": {"name": "...", ...}}.
  2. When you open the OpenTofu tab, the frontend POSTs that JSON to
     /api/generate (defined at the bottom of this file).
  3. generate() looks up one Jinja2 template per resource type in the
     TEMPLATES dict below, fills in the config values, and groups the
     rendered blocks into files (network.tf, database.tf, ...).
  4. The frontend only *displays* what comes back — no HCL is ever written
     in TypeScript. If generated code looks wrong, fix the template here.

Design rule (from the architecture): generation is ONE-WAY, model -> HCL.
The GUI's JSON model is the source of truth; hand-edits to generated code
are overwritten. Resource `type` keys must match the frontend registry in
frontend/src/model.ts — adding a new service means adding it in BOTH places.

This file also hosts the reverse door for onboarding: /api/import-state
parses an existing OpenTofu/Terraform state file (tfstate v4 JSON) and maps
its resources back into the GUI model, so an environment built elsewhere
can be adopted and managed from the drawboard. See import_state() below.
"""

import datetime
import json
import os
import re
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from jinja2 import Environment
from pydantic import BaseModel

app = FastAPI(title="kladen-codegen")
env = Environment(trim_blocks=True, lstrip_blocks=True, keep_trailing_newline=True)

# ---------------------------------------------------------------------------
# Auth: this codegen service shares no session state with the platform API
# (backend/api.py owns login + sessions). Rather than duplicate that, every
# protected endpoint introspects the caller's bearer token against the platform
# API's /api/me — the single source of auth truth. Returns the user (role +
# tenant scope) so the design world can be filtered per customer, closing the
# gap where /api/world could be read/written anonymously (ADR-0015).
# ---------------------------------------------------------------------------

PLATFORM_API = os.environ.get("KLADEN_PLATFORM_API", "http://localhost:8400")


def require_user(authorization: str | None = Header(default=None)) -> dict:
    """Validate the bearer token via the platform API; return the user dict
    ({id,name,email,role,client_id,client_name}) or raise 401. Fails CLOSED:
    if the auth service can't be reached we deny rather than allow."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="authentication required")
    req = urllib.request.Request(f"{PLATFORM_API}/api/me", headers={"Authorization": authorization})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            user = json.load(resp).get("user")
    except urllib.error.HTTPError as exc:
        raise HTTPException(status_code=401, detail="invalid or expired session") from exc
    except Exception as exc:  # noqa: BLE001 - platform API down → fail closed
        raise HTTPException(status_code=503, detail="auth service unavailable") from exc
    if not user:
        raise HTTPException(status_code=401, detail="invalid or expired session")
    return user


def scope_names(user: dict) -> set[str] | None:
    """Client names this user may see/write in the design world. None = all
    (workspace / super-admin); a set = only that customer's client."""
    if user.get("client_id") is None:
        return None
    name = user.get("client_name")
    return {name} if name else set()

# ---------------------------------------------------------------------------
# Workspace persistence: the frontend saves its whole world (clients, stacks,
# resources, users, catalog edits) here so it survives browsers and machines.
# SQLite keeps the demo dependency-free; the deployed platform swaps this for
# Postgres behind the same two endpoints.
# ---------------------------------------------------------------------------

DB_PATH = Path(__file__).resolve().parent / "kladen.db"


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)")
    return conn


class WorldRequest(BaseModel):
    world: dict


def _load_world() -> dict | None:
    with db() as conn:
        row = conn.execute("SELECT value FROM kv WHERE key = 'world'").fetchone()
    return json.loads(row[0]) if row else None


@app.get("/api/world")
def get_world(user: dict = Depends(require_user)) -> dict:
    """The frontend calls this on startup; a stored world wins over localStorage.
    A customer-scoped user only ever receives their own client's slice."""
    world = _load_world()
    names = scope_names(user)
    if world and names is not None:
        world = {**world, "clients": [c for c in world.get("clients", []) if c.get("name") in names]}
    return {"world": world}


@app.post("/api/world")
def save_world(req: WorldRequest, user: dict = Depends(require_user)) -> dict:
    """Debounced auto-save target — the frontend posts the world on every change.

    Workspace users replace the whole world. A customer-scoped user's save is
    MERGED: only their own client's entry is updated; every other client and all
    workspace-level config (catalog, users) are preserved from the stored copy,
    so a scoped user can never read or clobber another customer's design.
    """
    now = datetime.datetime.now(datetime.UTC).isoformat()
    names = scope_names(user)
    if names is None:
        to_save = req.world
    else:
        stored = _load_world() or {}
        stored_clients = stored.get("clients", [])
        mine = [c for c in req.world.get("clients", []) if c.get("name") in names]
        merged = [c for c in stored_clients if c.get("name") not in names] + mine
        to_save = {**stored, "clients": merged}
    with db() as conn:
        conn.execute(
            "INSERT INTO kv (key, value, updated_at) VALUES ('world', ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            (json.dumps(to_save), now),
        )
    return {"saved": True, "updated_at": now}


@app.get("/api/world/status")
def world_status(user: dict = Depends(require_user)) -> dict:
    """Shown on the Admin screen's Platform card."""
    with db() as conn:
        row = conn.execute("SELECT updated_at FROM kv WHERE key = 'world'").fetchone()
    return {"connected": True, "engine": "sqlite", "path": str(DB_PATH), "updated_at": row[0] if row else None}


class Resource(BaseModel):
    type: str
    config: dict[str, str | bool]
    # OCI resource type for admin-created catalog entries (no dedicated
    # template) — rendered through GENERIC_TEMPLATE below.
    rtype: str | None = None


class GenerateRequest(BaseModel):
    client: str
    stack: str
    env: str
    resources: list[Resource]


def hcl_label(name: str) -> str:
    """A safe HCL block label from a display name."""
    label = re.sub(r"[^a-z0-9_]", "_", str(name).strip().lower())
    return label.strip("_") or "main"


# Which generated .tf file each resource type's block lands in.
# (main.tf, network base, and variables.tf are always emitted — see generate().)
FILE_OF_TYPE = {
    "vcn": "network.tf", "lb": "network.tf", "apigw": "network.tf", "drg": "network.tf", "fw": "network.tf",
    "compute": "compute.tf", "pool": "compute.tf", "fn": "compute.tf",
    "oke": "kubernetes.tf",
    "adb": "database.tf", "basedb": "database.tf", "mysql": "database.tf",
    "os": "storage.tf", "bv": "storage.tf", "fss": "storage.tf",
    "vault": "security.tf", "bastion": "security.tf", "waf": "security.tf",
}

# One Jinja2 template per resource type — THE definitions of the OpenTofu
# Kladen writes. Inside a template: `c` is the resource's config dict from
# the GUI ({{ c.name }} is whatever was typed in the "Display name" field),
# `label` is a sanitized HCL block name, and {% if %}/{% for %} are Jinja2
# logic (e.g. only emit the WAF block when the toggle was on).
# `var.*` references are OpenTofu inputs declared in VARIABLES_TF below;
# `local.tags` comes from MAIN_TF. Subnets referenced here (public,
# private_app, private_db) are always created by NETWORK_BASE.
TEMPLATES = {
    "vcn": """
resource "oci_core_vcn" "{{ label }}" {
  compartment_id = var.compartment_ocid
  display_name   = "{{ c.name }}"
  cidr_blocks    = ["{{ c.cidr }}"]
  dns_label      = "{{ dns }}"
  freeform_tags  = local.tags
}
""",
    "lb": """
resource "oci_load_balancer_load_balancer" "{{ label }}" {
  compartment_id = var.compartment_ocid
  display_name   = "{{ c.name }}"
  shape          = "flexible"
  subnet_ids     = [oci_core_subnet.public.id]

  shape_details {
    minimum_bandwidth_in_mbps = {{ c.min_mbps }}
    maximum_bandwidth_in_mbps = {{ c.max_mbps }}
  }

  freeform_tags = local.tags
}
{% if c.waf %}

resource "oci_waf_web_app_firewall" "{{ label }}_waf" {
  compartment_id             = var.compartment_ocid
  backend_type               = "LOAD_BALANCER"
  load_balancer_id           = oci_load_balancer_load_balancer.{{ label }}.id
  web_app_firewall_policy_id = var.waf_policy_ocid
  freeform_tags              = local.tags
}
{% endif %}
""",
    "apigw": """
resource "oci_apigateway_gateway" "{{ label }}" {
  compartment_id = var.compartment_ocid
  display_name   = "{{ c.name }}"
  endpoint_type  = "{{ c.endpoint | upper }}"
  subnet_id      = oci_core_subnet.public.id
  freeform_tags  = local.tags
}
""",
    "drg": """
resource "oci_core_drg" "{{ label }}" {
  compartment_id = var.compartment_ocid
  display_name   = "{{ c.name }}"
  freeform_tags  = local.tags
}
""",
    "fw": """
resource "oci_network_firewall_network_firewall" "{{ label }}" {
  compartment_id             = var.compartment_ocid
  display_name               = "{{ c.name }}"
  subnet_id                  = oci_core_subnet.private_app.id
  network_firewall_policy_id = var.firewall_policy_ocid
  freeform_tags              = local.tags
}
""",
    "compute": """
resource "oci_core_instance" "{{ label }}" {
  count               = {{ c.count }}
  compartment_id      = var.compartment_ocid
  availability_domain = var.availability_domain
  display_name        = "{{ c.prefix }}${format("%02d", count.index + 1)}"
  shape               = "{{ c.shape }}"

  shape_config {
    ocpus         = {{ c.ocpus }}
    memory_in_gbs = {{ c.memory_gb }}
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.private_app.id
    assign_public_ip = false
  }

  source_details {
    source_type = "image"
    source_id   = var.instance_image_ocid
  }
{% if c.encrypt %}

  is_pv_encryption_in_transit_enabled = true
{% endif %}

  freeform_tags = local.tags
}
""",
    "pool": """
resource "oci_core_instance_pool" "{{ label }}" {
  compartment_id            = var.compartment_ocid
  display_name              = "{{ c.name }}"
  size                      = {{ c.size }}
  instance_configuration_id = var.instance_configuration_ocid
  freeform_tags             = local.tags

  placement_configurations {
    availability_domain = var.availability_domain
    primary_subnet_id   = oci_core_subnet.private_app.id
  }
}
""",
    "fn": """
resource "oci_functions_application" "{{ label }}" {
  compartment_id = var.compartment_ocid
  display_name   = "{{ c.name }}"
  subnet_ids     = [oci_core_subnet.private_app.id]
  freeform_tags  = local.tags
}
""",
    "oke": """
resource "oci_containerengine_cluster" "{{ label }}" {
  compartment_id     = var.compartment_ocid
  name               = "{{ c.name }}"
  kubernetes_version = "{{ c.version }}"
  vcn_id             = oci_core_vcn.main.id
  type               = "{{ "ENHANCED_CLUSTER" if c.enhanced else "BASIC_CLUSTER" }}"

  endpoint_config {
    subnet_id            = oci_core_subnet.{{ "public" if c.public_endpoint else "private_app" }}.id
    is_public_ip_enabled = {{ "true" if c.public_endpoint else "false" }}
  }

  freeform_tags = local.tags
}

resource "oci_containerengine_node_pool" "{{ label }}_pool" {
  count              = {{ c.pools }}
  cluster_id         = oci_containerengine_cluster.{{ label }}.id
  compartment_id     = var.compartment_ocid
  name               = "{{ c.name }}-pool-${count.index + 1}"
  kubernetes_version = "{{ c.version }}"
  node_shape         = "VM.Standard.E5.Flex"

  node_config_details {
    size = {{ c.nodes_per_pool }}

    placement_configs {
      availability_domain = var.availability_domain
      subnet_id           = oci_core_subnet.private_app.id
    }
  }

  freeform_tags = local.tags
}
""",
    "adb": """
resource "oci_database_autonomous_database" "{{ label }}" {
  compartment_id              = var.compartment_ocid
  display_name                = "{{ c.name }}"
  db_name                     = "{{ dbname }}"
  db_workload                 = "{{ c.workload }}"
  compute_model               = "ECPU"
  compute_count               = {{ c.ecpu }}
  data_storage_size_in_tbs    = {{ c.storage_tb }}
  is_auto_scaling_enabled     = {{ "true" if c.auto_scaling else "false" }}
  is_mtls_connection_required = {{ "true" if c.mtls else "false" }}
  license_model               = "{{ "LICENSE_INCLUDED" if "Included" in c.license else "BRING_YOUR_OWN_LICENSE" }}"
  subnet_id                   = oci_core_subnet.private_db.id
  freeform_tags               = local.tags
}

output "{{ label }}_connection_urls" {
  value     = oci_database_autonomous_database.{{ label }}.connection_urls
  sensitive = true
}
""",
    "basedb": """
resource "oci_database_db_system" "{{ label }}" {
  compartment_id      = var.compartment_ocid
  display_name        = "{{ c.name }}"
  availability_domain = var.availability_domain
  shape               = "{{ c.shape }}"
  subnet_id           = oci_core_subnet.private_db.id
  ssh_public_keys     = [var.ssh_public_key]
  hostname            = "{{ dbname }}"
  database_edition    = "ENTERPRISE_EDITION"

  db_home {
    database {
      admin_password = var.db_admin_password
      db_name        = "{{ dbname }}"
    }
  }

  freeform_tags = local.tags
}
""",
    "mysql": """
resource "oci_mysql_mysql_db_system" "{{ label }}" {
  compartment_id      = var.compartment_ocid
  display_name        = "{{ c.name }}"
  availability_domain = var.availability_domain
  shape_name          = "{{ c.shape }}"
  subnet_id           = oci_core_subnet.private_db.id
  admin_username      = "admin"
  admin_password      = var.db_admin_password
  freeform_tags       = local.tags
}
""",
    "os": """
{% for bucket in buckets %}
resource "oci_objectstorage_bucket" "{{ bucket | replace('-', '_') }}" {
  compartment_id = var.compartment_ocid
  namespace      = var.object_storage_namespace
  name           = "{{ bucket }}"
  access_type    = "{{ "NoPublicAccess" if "Private" in c.visibility else "ObjectRead" }}"
  versioning     = "{{ "Enabled" if c.versioning else "Disabled" }}"
{% if c.cmk %}
  kms_key_id     = var.kms_key_ocid
{% endif %}
  freeform_tags  = local.tags
}

resource "oci_objectstorage_object_lifecycle_policy" "{{ bucket | replace('-', '_') }}_lifecycle" {
  namespace = var.object_storage_namespace
  bucket    = oci_objectstorage_bucket.{{ bucket | replace('-', '_') }}.name

  rules {
    name        = "archive-after-{{ c.lifecycle_days }}d"
    action      = "ARCHIVE"
    is_enabled  = true
    time_amount = {{ c.lifecycle_days }}
    time_unit   = "DAYS"
  }
}

{% endfor %}
""",
    "bv": """
resource "oci_core_volume" "{{ label }}" {
  compartment_id      = var.compartment_ocid
  display_name        = "{{ c.name }}"
  availability_domain = var.availability_domain
  size_in_gbs         = {{ c.size_gb }}
  freeform_tags       = local.tags
}
""",
    "fss": """
resource "oci_file_storage_file_system" "{{ label }}" {
  compartment_id      = var.compartment_ocid
  display_name        = "{{ c.name }}"
  availability_domain = var.availability_domain
  freeform_tags       = local.tags
}
""",
    "vault": """
resource "oci_kms_vault" "{{ label }}" {
  compartment_id = var.compartment_ocid
  display_name   = "{{ c.name }}"
  vault_type     = "DEFAULT"
  freeform_tags  = local.tags
}
""",
    "bastion": """
resource "oci_bastion_bastion" "{{ label }}" {
  compartment_id   = var.compartment_ocid
  name             = "{{ dns }}"
  bastion_type     = "STANDARD"
  target_subnet_id = oci_core_subnet.private_app.id
  freeform_tags    = local.tags
}
""",
    "waf": """
resource "oci_waf_web_app_firewall_policy" "{{ label }}" {
  compartment_id = var.compartment_ocid
  display_name   = "{{ c.name }}"
  freeform_tags  = local.tags
}
""",
}

# Fallback for admin-created custom catalog types: emits a minimal valid
# block with the type's OCI resource name and carries the other config
# values as comments, so nothing typed in the GUI silently disappears.
# Add a dedicated entry to TEMPLATES for full attribute support.
GENERIC_TEMPLATE = """
# Custom catalog type — add a dedicated template in backend/app.py to map
# all fields to real attributes.
resource "{{ rtype }}" "{{ label }}" {
  compartment_id = var.compartment_ocid
{% if c.name or c.display_name %}
  display_name   = "{{ c.name or c.display_name }}"
{% endif %}
  freeform_tags  = local.tags
{% for k, v in extras %}
  # {{ k }} = {{ v }}
{% endfor %}
}
"""

MAIN_TF = """\
# Generated by Kladen — stack: {{ stack }} ({{ env }}), client: {{ client }}
# Source of truth is the Kladen design. Manual edits are overwritten.

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

locals {
  tags = {
    "client"     = "{{ client_slug }}"
    "env"        = "{{ env }}"
    "managed-by" = "kladen"
  }
}
"""

NETWORK_BASE = """\
# Base network for stack {{ stack }} — generated by Kladen.

resource "oci_core_vcn" "main" {
  compartment_id = var.compartment_ocid
  display_name   = "vcn-{{ stack }}"
  cidr_blocks    = ["10.0.0.0/16"]
  dns_label      = "{{ dns }}"
  freeform_tags  = local.tags
}

resource "oci_core_internet_gateway" "main" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "igw-{{ stack }}"
  freeform_tags  = local.tags
}

resource "oci_core_subnet" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "public"
  cidr_block     = "10.0.0.0/24"
  dns_label      = "public"
  freeform_tags  = local.tags
}

resource "oci_core_subnet" "private_app" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.main.id
  display_name               = "private-app"
  cidr_block                 = "10.0.1.0/24"
  dns_label                  = "app"
  prohibit_public_ip_on_vnic = true
  freeform_tags              = local.tags
}

resource "oci_core_subnet" "private_db" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.main.id
  display_name               = "private-db"
  cidr_block                 = "10.0.2.0/24"
  dns_label                  = "db"
  prohibit_public_ip_on_vnic = true
  freeform_tags              = local.tags
}
"""

VARIABLES_TF = """\
# Standard Kladen stack inputs. Values are injected per run by the platform.

# These six are injected per run by the platform from the stack's
# configuration profile, so they have no defaults.
variable "tenancy_ocid" { type = string }
variable "user_ocid" { type = string }
variable "fingerprint" { type = string }
variable "private_key_path" { type = string }
variable "region" { type = string }
variable "compartment_ocid" { type = string }

# Everything below is a stack input the platform does not collect yet. They
# default to empty so a run never blocks on an interactive prompt; a resource
# that genuinely needs one fails with a clear provider error instead.
variable "availability_domain" {
  type    = string
  default = ""
}
{% if "compute" in used %}
variable "instance_image_ocid" {
  type    = string
  default = ""
}
{% endif %}
{% if "pool" in used %}
variable "instance_configuration_ocid" {
  type    = string
  default = ""
}
{% endif %}
{% if "os" in used %}
variable "object_storage_namespace" {
  type    = string
  default = ""
}
variable "kms_key_ocid" {
  type    = string
  default = ""
}
{% endif %}
{% if "basedb" in used or "mysql" in used %}
variable "db_admin_password" {
  type      = string
  sensitive = true
  default   = ""
}
{% endif %}
{% if "basedb" in used %}
variable "ssh_public_key" {
  type    = string
  default = ""
}
{% endif %}
{% if "lb" in used %}
variable "waf_policy_ocid" {
  type    = string
  default = ""
}
{% endif %}
{% if "fw" in used %}
variable "firewall_policy_ocid" {
  type    = string
  default = ""
}
{% endif %}
"""


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# State import: adopt an environment that was built outside Kladen.
#
# A tfstate (v4) file looks like:
#   { "version": 4, "serial": N, "resources": [
#       { "mode": "managed", "type": "oci_core_instance", "name": "app",
#         "instances": [ { "attributes": {...} }, ... ] } ] }
#
# Each mapper below turns one state resource's attributes into the config
# dict the GUI expects — the SAME keys as frontend/src/model.ts, so an
# imported node is indistinguishable from a hand-placed one.
# ---------------------------------------------------------------------------

# Base-network plumbing is absorbed, not shown as board nodes: on the
# drawboard the VCN is the container, and codegen always re-emits the base
# network (NETWORK_BASE above), so importing these as nodes would duplicate.
ABSORBED_TYPES = {
    "oci_core_vcn", "oci_core_subnet", "oci_core_internet_gateway",
    "oci_core_nat_gateway", "oci_core_service_gateway", "oci_core_route_table",
    "oci_core_security_list", "oci_core_network_security_group",
    "oci_core_network_security_group_security_rule", "oci_core_dhcp_options",
    "oci_objectstorage_object_lifecycle_policy",  # merged into the os node
    "oci_containerengine_node_pool",              # merged into the oke node
    "oci_waf_web_app_firewall",                   # merged into the lb node
}


def _num(v: object, default: str) -> str:
    """State stores numbers as 3 or 3.0 — normalize to the GUI's text fields."""
    try:
        return str(int(float(str(v))))
    except (TypeError, ValueError):
        return default


def _map_compute(attrs: dict, instances: list[dict]) -> dict:
    shape_cfg = (attrs.get("shape_config") or [{}])[0]
    prefix = re.sub(r"\d+$", "", str(attrs.get("display_name", "app-")))
    return {
        "prefix": prefix or "app-",
        "shape": attrs.get("shape", "VM.Standard.E5.Flex"),
        "ocpus": _num(shape_cfg.get("ocpus"), "2"),
        "memory_gb": _num(shape_cfg.get("memory_in_gbs"), "16"),
        # one state block holds one instance per `count` index
        "count": str(len(instances)),
        "encrypt": bool(attrs.get("is_pv_encryption_in_transit_enabled", False)),
    }


def _map_adb(attrs: dict, _: list[dict]) -> dict:
    return {
        "name": attrs.get("display_name", "adb-imported"),
        "workload": attrs.get("db_workload", "OLTP"),
        "ecpu": _num(attrs.get("compute_count"), "4"),
        "storage_tb": _num(attrs.get("data_storage_size_in_tbs"), "1"),
        "license": "License Included" if attrs.get("license_model") == "LICENSE_INCLUDED" else "BYOL",
        "auto_scaling": bool(attrs.get("is_auto_scaling_enabled", False)),
        "mtls": bool(attrs.get("is_mtls_connection_required", True)),
    }


def _map_lb(attrs: dict, _: list[dict]) -> dict:
    details = (attrs.get("shape_details") or [{}])[0]
    return {
        "name": attrs.get("display_name", "lb-imported"),
        "shape": "Flexible" if "flex" in str(attrs.get("shape", "")).lower() else "Fixed 100Mbps",
        "min_mbps": _num(details.get("minimum_bandwidth_in_mbps"), "10"),
        "max_mbps": _num(details.get("maximum_bandwidth_in_mbps"), "100"),
        "waf": False,  # enriched later if the state has a WAF attached to this LB
    }


def _map_oke(attrs: dict, _: list[dict]) -> dict:
    endpoint = (attrs.get("endpoint_config") or [{}])[0]
    return {
        "name": attrs.get("name", "oke-imported"),
        "version": attrs.get("kubernetes_version", "v1.31.1"),
        "pools": "1",              # enriched from node_pool resources below
        "nodes_per_pool": "3",
        "enhanced": attrs.get("type") == "ENHANCED_CLUSTER",
        "public_endpoint": bool(endpoint.get("is_public_ip_enabled", False)),
    }


# type in the state file -> (GUI type key, mapper). Mappers not listed here
# fall back to _map_named, which just carries the display name across.
STATE_MAPPERS: dict[str, tuple[str, object]] = {
    "oci_core_instance": ("compute", _map_compute),
    "oci_database_autonomous_database": ("adb", _map_adb),
    "oci_load_balancer_load_balancer": ("lb", _map_lb),
    "oci_load_balancer": ("lb", _map_lb),
    "oci_containerengine_cluster": ("oke", _map_oke),
}

NAMED_TYPES = {
    "oci_apigateway_gateway": "apigw",
    "oci_core_drg": "drg",
    "oci_network_firewall_network_firewall": "fw",
    "oci_core_instance_pool": "pool",
    "oci_functions_application": "fn",
    "oci_database_db_system": "basedb",
    "oci_mysql_mysql_db_system": "mysql",
    "oci_core_volume": "bv",
    "oci_file_storage_file_system": "fss",
    "oci_kms_vault": "vault",
    "oci_bastion_bastion": "bastion",
    "oci_waf_web_app_firewall_policy": "waf",
}


class ImportRequest(BaseModel):
    state: dict  # the parsed tfstate JSON, sent as-is by the frontend


@app.post("/api/import-state")
def import_state(req: ImportRequest, user: dict = Depends(require_user)) -> dict:
    """Map a tfstate's resources into GUI model resources.

    Returns {resources, absorbed, unsupported, meta}: `resources` go onto the
    drawboard; `absorbed` counts base-network plumbing we intentionally fold
    away; `unsupported` lists types Kladen has no catalog entry for yet.
    """
    managed = [r for r in req.state.get("resources", []) if r.get("mode") == "managed"]

    resources: list[dict] = []
    absorbed: dict[str, int] = {}
    unsupported: dict[str, int] = {}
    buckets: list[str] = []
    bucket_attrs: dict = {}
    lifecycle_days: str | None = None
    node_pools: list[dict] = []
    has_lb_waf = False

    for res in managed:
        rtype = str(res.get("type", ""))
        instances = res.get("instances") or []
        attrs = (instances[0].get("attributes") or {}) if instances else {}

        if rtype == "oci_objectstorage_bucket":
            # All buckets merge into ONE Object Storage node, like the catalog.
            buckets.extend(str(i.get("attributes", {}).get("name", "bucket")) for i in instances)
            bucket_attrs = attrs
        elif rtype == "oci_objectstorage_object_lifecycle_policy":
            rules = (attrs.get("rules") or [{}])
            lifecycle_days = _num(rules[0].get("time_amount"), "90")
            absorbed[rtype] = absorbed.get(rtype, 0) + len(instances)
        elif rtype == "oci_containerengine_node_pool":
            node_pools.extend(i.get("attributes", {}) for i in instances)
            absorbed[rtype] = absorbed.get(rtype, 0) + len(instances)
        elif rtype == "oci_waf_web_app_firewall":
            has_lb_waf = True
            absorbed[rtype] = absorbed.get(rtype, 0) + len(instances)
        elif rtype in ABSORBED_TYPES:
            absorbed[rtype] = absorbed.get(rtype, 0) + len(instances)
        elif rtype in STATE_MAPPERS:
            key, mapper = STATE_MAPPERS[rtype]
            resources.append({"type": key, "config": mapper(attrs, instances)})
        elif rtype in NAMED_TYPES:
            name = attrs.get("display_name") or attrs.get("name") or res.get("name", "imported")
            resources.append({"type": NAMED_TYPES[rtype], "config": {"name": str(name)}})
        else:
            unsupported[rtype] = unsupported.get(rtype, 0) + len(instances)

    if buckets:
        resources.append({
            "type": "os",
            "config": {
                "buckets": ", ".join(buckets),
                "visibility": "Private (enforced)" if bucket_attrs.get("access_type") == "NoPublicAccess" else "Public",
                "lifecycle_days": lifecycle_days or "90",
                "versioning": bucket_attrs.get("versioning") == "Enabled",
                "cmk": bool(bucket_attrs.get("kms_key_id")),
            },
        })

    # Enrich merged children back onto their parents.
    for r in resources:
        if r["type"] == "oke" and node_pools:
            r["config"]["pools"] = str(len(node_pools))
            sizes = (node_pools[0].get("node_config_details") or [{}])
            r["config"]["nodes_per_pool"] = _num(sizes[0].get("size"), "3")
        if r["type"] == "lb" and has_lb_waf:
            r["config"]["waf"] = True

    return {
        "resources": resources,
        "absorbed": absorbed,
        "unsupported": unsupported,
        "meta": {
            "terraform_version": req.state.get("terraform_version", "?"),
            "serial": req.state.get("serial", 0),
            "managed_blocks": len(managed),
        },
    }


@app.post("/api/generate")
def generate(req: GenerateRequest, user: dict = Depends(require_user)) -> dict:
    """The endpoint the GUI calls: stack model JSON in, OpenTofu files out."""
    # Customer-scoped users can only generate HCL for their own client.
    names = scope_names(user)
    if names is not None and req.client not in names:
        raise HTTPException(status_code=403, detail="outside your customer scope")
    # OCI dns_label allows only lowercase alphanumerics, max 15 chars
    dns = re.sub(r"[^a-z0-9]", "", req.stack.lower())[:15] or "stack"
    base_ctx = {
        "client": req.client,
        "client_slug": hcl_label(req.client).replace("_", "-"),
        "stack": req.stack,
        "env": req.env,
        "dns": dns,
    }

    header = env.from_string(
        "# Generated by Kladen — stack: {{ stack }} ({{ env }}), client: {{ client }}\n"
        "# Source of truth is the Kladen design. Manual edits are overwritten.\n\n"
    ).render(**base_ctx)

    # Render each resource on the board through its template and group the
    # blocks by target file, keeping board order within a file.
    bodies: dict[str, list[str]] = {}
    seen_labels: set[str] = set()
    for res in req.resources:
        is_custom = res.type not in TEMPLATES and bool(res.rtype)
        if res.type not in TEMPLATES and not is_custom:
            continue
        c = res.config
        # HCL block labels must be unique per file — derive one from the
        # resource's name and de-dupe (two "app-" computes -> app_, app__2).
        raw = str(c.get("name") or c.get("prefix") or c.get("buckets") or res.type)
        label = hcl_label(raw)
        while label in seen_labels:
            label += "_2"
        seen_labels.add(label)

        ctx = {
            **base_ctx,
            "c": c,
            "label": label,
            "dbname": re.sub(r"[^a-z0-9]", "", raw.lower())[:14] or "db",
            "buckets": [b.strip() for b in str(c.get("buckets", "")).split(",") if b.strip()],
        }
        if is_custom:
            # config keys the generic template doesn't render become comments
            ctx["rtype"] = res.rtype
            ctx["extras"] = [(k, v) for k, v in c.items() if k not in ("name", "display_name")]
            block = env.from_string(GENERIC_TEMPLATE).render(**ctx).strip() + "\n"
            bodies.setdefault("custom.tf", []).append(block)
        else:
            block = env.from_string(TEMPLATES[res.type]).render(**ctx).strip() + "\n"
            bodies.setdefault(FILE_OF_TYPE[res.type], []).append(block)

    # Assemble the final file list. main.tf + the base network + variables.tf
    # are always present; the other files appear only when something uses them.
    # variables.tf declares extra inputs only for the types actually used.
    used = {r.type for r in req.resources}
    files = [
        {"name": "main.tf", "content": env.from_string(MAIN_TF).render(**base_ctx)},
        {
            "name": "network.tf",
            "content": header
            + env.from_string(NETWORK_BASE).render(**base_ctx)
            + ("\n" + "\n".join(bodies["network.tf"]) if "network.tf" in bodies else ""),
        },
    ]
    for fname in ["compute.tf", "kubernetes.tf", "database.tf", "storage.tf", "security.tf", "custom.tf"]:
        if fname in bodies:
            files.append({"name": fname, "content": header + "\n".join(bodies[fname])})
    files.append({"name": "variables.tf", "content": env.from_string(VARIABLES_TF).render(used=used)})

    return {"files": files}
