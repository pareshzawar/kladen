#!/usr/bin/env python3
"""Generate src/catalog.ts from the OpenTofu registry docs for the OCI provider.

Downloads each service's doc page from api.opentofu.org (cached in .cache/),
extracts the Argument Reference (required/optional flags + descriptions), and
emits a typed catalog module. Friendly names, summaries, curated optional
picks, and example values are authored in the tables below.

Usage: python3 scripts/gen_catalog.py   (from frontend/; writes src/catalog.ts)
"""
import json, os, re, sys, urllib.request

PROVIDER_VERSION = "v8.23.0"
API = f"https://api.opentofu.org/registry/docs/providers/opentofu/oci/{PROVIDER_VERSION}/resources"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", PROVIDER_VERSION)


def fetch_doc(slug):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, slug + ".md")
    if not os.path.exists(path):
        print(f"fetching {slug}…", file=sys.stderr)
        urllib.request.urlretrieve(f"{API}/{slug}.md", path)
    return open(path).read()


def parse_doc(md):
    """Extract top-level args (required flag, first-sentence desc, example value)."""
    ex_vals = {}
    m = re.search(r"## Example Usage.*?```(?:hcl)?\n(.*?)```", md, re.S)
    if m:
        depth = 0
        for line in m.group(1).splitlines():
            if depth == 1:
                mm = re.match(r"\s*([a-z0-9_]+)\s*=\s*(.+?)\s*$", line)
                if mm and mm.group(1) not in ex_vals:
                    ex_vals[mm.group(1)] = mm.group(2)
            depth += line.count("{") - line.count("}")
    m = re.search(r"## Argument Reference\n(.*?)\n## ", md, re.S)
    args = []
    for line in (m.group(1).splitlines() if m else []):
        mm = re.match(r"\* `([a-z0-9_]+)` - \((Required|Optional)\)\s*(.*)", line)
        if mm:
            name, req, desc = mm.groups()
            desc = re.sub(r"\(Updatable\)\s*", "", desc)
            desc = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", desc)
            desc = desc.split(". ")[0].rstrip(".") + "."
            args.append({"name": name, "required": req == "Required", "desc": desc.strip(), "example": ex_vals.get(name)})
    nreq = sum(1 for a in args if a["required"])
    return {"args": args, "n_required": nreq, "n_optional": len(args) - nreq}

# slug: (group, friendly name, glyph, summary, [curated optional picks], used-on-canvas)
SERVICES = {
    # NETWORKING
    "core_vcn": ("NETWORKING", "VCN", "VC", "Virtual Cloud Network — the private network boundary of a stack.", ["cidr_blocks", "dns_label", "is_ipv6enabled"], True),
    "core_subnet": ("NETWORKING", "Subnet", "SN", "IP range inside a VCN; public or private placement for resources.", ["cidr_block", "prohibit_public_ip_on_vnic", "route_table_id", "dns_label"], False),
    "core_internet_gateway": ("NETWORKING", "Internet Gateway", "IG", "Gives public subnets a route to and from the internet.", ["enabled", "route_table_id"], False),
    "core_nat_gateway": ("NETWORKING", "NAT Gateway", "NG", "Outbound-only internet access for private subnets.", ["block_traffic", "public_ip_id"], False),
    "core_service_gateway": ("NETWORKING", "Service Gateway", "SG", "Private path to OCI services (Object Storage etc.) without public IPs.", ["route_table_id", "display_name"], False),
    "core_drg": ("NETWORKING", "DRG", "DR", "Dynamic Routing Gateway for VPN, FastConnect and VCN peering.", ["display_name"], False),
    "core_route_table": ("NETWORKING", "Route Table", "RT", "Routing rules that steer subnet traffic to gateways.", ["route_rules", "display_name"], False),
    "core_security_list": ("NETWORKING", "Security List", "SL", "Subnet-level stateful ingress/egress firewall rules.", ["ingress_security_rules", "egress_security_rules", "display_name"], False),
    "core_network_security_group": ("NETWORKING", "Network Security Group", "NS", "Resource-level virtual firewall; attach to VNICs, LBs and DBs.", ["display_name"], False),
    "load_balancer_load_balancer": ("NETWORKING", "Load Balancer", "LB", "Layer-7 HTTP(S) load balancer with flexible bandwidth shapes.", ["shape_details", "is_private", "network_security_group_ids"], True),
    "network_load_balancer_network_load_balancer": ("NETWORKING", "Network Load Balancer", "NL", "Layer-4 TCP/UDP load balancer with low latency passthrough.", ["is_private", "is_preserve_source_destination"], False),
    "apigateway_gateway": ("NETWORKING", "API Gateway", "GW", "Managed API front door: routing, auth, rate limits, CORS.", ["display_name", "network_security_group_ids"], True),
    "network_firewall_network_firewall": ("NETWORKING", "Network Firewall", "FW", "Palo Alto-powered inspection firewall inside the VCN.", ["display_name", "ipv4address"], False),
    "dns_zone": ("NETWORKING", "DNS Zone", "DN", "Public or private DNS zone managed by OCI DNS.", ["scope", "view_id"], False),
    # COMPUTE
    "core_instance": ("COMPUTE", "Compute Instance", "CI", "Bare metal or VM instance; shape, image and VNIC are set here.", ["shape", "shape_config", "source_details", "create_vnic_details"], True),
    "core_instance_pool": ("COMPUTE", "Instance Pool", "IP", "Managed group of identical instances from an instance configuration.", ["display_name", "load_balancers"], False),
    "containerengine_cluster": ("COMPUTE", "OKE Cluster", "K8", "Managed Kubernetes control plane (Container Engine for Kubernetes).", ["type", "endpoint_config", "options"], True),
    "containerengine_node_pool": ("COMPUTE", "OKE Node Pool", "NP", "Worker node pool for an OKE cluster; shape and size per pool.", ["kubernetes_version", "node_config_details", "node_shape_config"], False),
    "functions_application": ("COMPUTE", "Functions Application", "FA", "Grouping and network context for serverless functions.", ["shape", "config", "network_security_group_ids"], False),
    "functions_function": ("COMPUTE", "Function", "FN", "Single serverless function deployed from a container image.", ["image", "timeout_in_seconds", "provisioned_concurrency_config"], False),
    # DATABASE
    "database_autonomous_database": ("DATABASE", "Autonomous DB", "DB", "Self-tuning Oracle database; OLTP, DW or JSON workloads.", ["db_name", "db_workload", "compute_count", "data_storage_size_in_tbs", "is_auto_scaling_enabled", "subnet_id"], True),
    "database_db_system": ("DATABASE", "Base DB System", "DS", "Traditional Oracle DB on dedicated VM/BM you size and patch.", ["license_model", "node_count", "data_storage_size_in_gb"], False),
    "mysql_mysql_db_system": ("DATABASE", "MySQL HeatWave", "MY", "Managed MySQL with optional HeatWave analytics acceleration.", ["admin_username", "admin_password", "data_storage_size_in_gb", "is_highly_available"], False),
    "psql_db_system": ("DATABASE", "PostgreSQL", "PG", "OCI Database with PostgreSQL — managed Postgres db system.", ["instance_count", "credentials"], False),
    "nosql_table": ("DATABASE", "NoSQL Table", "NQ", "Serverless NoSQL table with provisioned or on-demand throughput.", ["table_limits", "is_auto_reclaimable"], False),
    "redis_redis_cluster": ("DATABASE", "OCI Cache (Redis)", "RC", "Managed Redis-compatible in-memory cache cluster.", ["cluster_mode", "shard_count"], False),
    # STORAGE
    "objectstorage_bucket": ("STORAGE", "Object Storage", "OS", "Bucket for objects; visibility, versioning and lifecycle rules.", ["access_type", "versioning", "storage_tier", "kms_key_id"], True),
    "core_volume": ("STORAGE", "Block Volume", "BV", "Attachable block storage volume; size and performance (VPUs).", ["availability_domain", "size_in_gbs", "vpus_per_gb", "kms_key_id"], False),
    "file_storage_file_system": ("STORAGE", "File Storage", "FS", "Elastic NFS file system.", ["display_name", "kms_key_id"], False),
    "file_storage_mount_target": ("STORAGE", "Mount Target", "MT", "NFS endpoint in a subnet that exports file systems.", ["display_name", "hostname_label"], False),
    # SECURITY
    "kms_vault": ("SECURITY", "Vault", "VT", "KMS vault holding encryption keys and secrets.", [], False),
    "kms_key": ("SECURITY", "KMS Key", "KY", "Customer-managed encryption key (AES/RSA/ECDSA) in a vault.", ["protection_mode"], False),
    "vault_secret": ("SECURITY", "Secret", "SC", "Versioned secret (passwords, tokens) stored in a vault.", ["secret_content", "description"], False),
    "bastion_bastion": ("SECURITY", "Bastion", "BA", "Managed SSH jump host for reaching private resources.", ["client_cidr_block_allow_list", "max_session_ttl_in_seconds"], False),
    "waf_web_app_firewall": ("SECURITY", "WAF", "WF", "Web Application Firewall attached to a load balancer.", ["display_name"], False),
    "certificates_management_certificate": ("SECURITY", "Certificate", "CT", "TLS certificate issued or imported via Certificates service.", ["description"], False),
    # IDENTITY
    "identity_compartment": ("IDENTITY", "Compartment", "CP", "Isolation and policy boundary that contains resources.", ["enable_delete"], False),
    "identity_group": ("IDENTITY", "Group", "GR", "IAM group of users for policy grants.", [], False),
    "identity_dynamic_group": ("IDENTITY", "Dynamic Group", "DG", "Rule-matched group of resources (instances, functions) for policies.", [], False),
    "identity_policy": ("IDENTITY", "IAM Policy", "PL", "Policy statements granting groups access in a compartment.", ["version_date"], False),
    # OBSERVABILITY
    "logging_log_group": ("OBSERVABILITY", "Log Group", "LG", "Container that organizes service and custom logs.", ["description"], False),
    "logging_log": ("OBSERVABILITY", "Log", "LO", "Service or custom log routed into a log group.", ["is_enabled", "retention_duration", "configuration"], False),
    "monitoring_alarm": ("OBSERVABILITY", "Alarm", "AL", "Metric alarm (MQL query) that notifies a topic when it fires.", ["resolution", "pending_duration"], False),
    "ons_notification_topic": ("OBSERVABILITY", "Notification Topic", "NT", "Pub/sub topic delivering alerts to email, Slack, PagerDuty, functions.", ["description"], False),
    "events_rule": ("OBSERVABILITY", "Event Rule", "ER", "Reacts to OCI events (create/update/delete) and triggers actions.", ["description"], False),
    "streaming_stream": ("OBSERVABILITY", "Stream", "ST", "Kafka-compatible partitioned message stream.", ["stream_pool_id", "retention_in_hours"], False),
}

# Deprecated duplicate args to hide (docs list both; keep the canonical one).
DROP = {"load_balancer_load_balancer": {"name"}}

# Example values by (slug, arg) — most specific wins.
EX_RES = {
    ("database_autonomous_database", "display_name"): '"adb-acme-prod"',
    ("load_balancer_load_balancer", "display_name"): '"lb-acme-web"',
    ("network_load_balancer_network_load_balancer", "display_name"): '"nlb-acme-edge"',
    ("functions_application", "display_name"): '"fn-app-acme"',
    ("functions_function", "display_name"): '"checkout-handler"',
    ("redis_redis_cluster", "display_name"): '"cache-acme-prod"',
    ("kms_vault", "display_name"): '"vault-acme-prod"',
    ("kms_key", "display_name"): '"key-acme-data"',
    ("waf_web_app_firewall", "display_name"): '"waf-acme-web"',
    ("monitoring_alarm", "display_name"): '"high-cpu-app-tier"',
    ("logging_log_group", "display_name"): '"lg-acme-prod"',
    ("logging_log", "display_name"): '"lb-access-logs"',
    ("psql_db_system", "display_name"): '"pg-acme-prod"',
    ("events_rule", "display_name"): '"on-bucket-create"',
    ("containerengine_cluster", "name"): '"oke-acme-prod"',
    ("containerengine_node_pool", "name"): '"np-general"',
    ("objectstorage_bucket", "name"): '"acme-prod-assets"',
    ("dns_zone", "name"): '"acme.example.com"',
    ("nosql_table", "name"): '"users"',
    ("streaming_stream", "name"): '"orders-events"',
    ("identity_compartment", "name"): '"acme-prod"',
    ("identity_group", "name"): '"AppDevs"',
    ("identity_dynamic_group", "name"): '"prod-instances"',
    ("identity_policy", "name"): '"appdevs-manage-compute"',
    ("ons_notification_topic", "name"): '"ops-alerts"',
    ("certificates_management_certificate", "name"): '"cert-acme-web"',
    ("objectstorage_bucket", "namespace"): '"axk2fbydxdkn"',
    ("monitoring_alarm", "namespace"): '"oci_computeagent"',
    ("redis_redis_cluster", "node_count"): "3",
    ("database_db_system", "node_count"): "1",
    ("core_subnet", "cidr_block"): '"10.0.1.0/24"',
    ("core_vcn", "cidr_blocks"): '["10.0.0.0/16"]',
    ("database_db_system", "shape"): '"VM.Standard.E5.Flex"',
    ("psql_db_system", "shape"): '"PostgreSQL.VM.Standard.E5.Flex"',
    ("core_instance", "shape"): '"VM.Standard.E5.Flex"',
    ("load_balancer_load_balancer", "shape"): '"flexible"',
    ("functions_application", "shape"): '"GENERIC_X86"',
    ("identity_compartment", "compartment_id"): "var.parent_compartment_ocid",
    ("logging_log", "configuration"): '{ source { service = "objectstorage", category = "write" } }',
}

# Example values by arg name (fallback).
EX_ARG = {
    "compartment_id": "var.compartment_ocid",
    "metric_compartment_id": "var.compartment_ocid",
    "vcn_id": "oci_core_vcn.main.id",
    "subnet_id": "oci_core_subnet.private_app.id",
    "target_subnet_id": "oci_core_subnet.private_app.id",
    "subnet_ids": "[oci_core_subnet.public.id]",
    "availability_domain": '"Uhwc:EU-FRANKFURT-1-AD-1"',
    "display_name": '"acme-prod"',
    "name": '"acme-prod"',
    "description": '"Managed by Kladen"',
    "dns_label": '"acmeprod"',
    "is_ipv6enabled": "false",
    "route_table_id": "oci_core_route_table.private.id",
    "enabled": "true",
    "block_traffic": "false",
    "public_ip_id": "oci_core_public_ip.nat.id",
    "services": "[{ service_id = data.oci_core_services.all.services[0].id }]",
    "route_rules": '{ destination = "0.0.0.0/0", network_entity_id = oci_core_internet_gateway.igw.id }',
    "ingress_security_rules": '{ protocol = "6", source = "10.0.0.0/16", tcp_options { min = 443, max = 443 } }',
    "egress_security_rules": '{ protocol = "all", destination = "0.0.0.0/0" }',
    "shape_details": "{ minimum_bandwidth_in_mbps = 10, maximum_bandwidth_in_mbps = 100 }",
    "is_private": "true",
    "network_security_group_ids": "[oci_core_network_security_group.web.id]",
    "is_preserve_source_destination": "false",
    "endpoint_type": '"PUBLIC"',
    "ipv4address": '"10.0.3.10"',
    "network_firewall_policy_id": "oci_network_firewall_network_firewall_policy.main.id",
    "zone_type": '"PRIMARY"',
    "scope": '"PRIVATE"',
    "view_id": "oci_dns_view.internal.id",
    "shape_config": "{ ocpus = 2, memory_in_gbs = 16 }",
    "source_details": '{ source_type = "image", source_id = var.image_ocid }',
    "create_vnic_details": "{ subnet_id = oci_core_subnet.private_app.id }",
    "instance_configuration_id": "oci_core_instance_configuration.app.id",
    "placement_configurations": '{ availability_domain = "…AD-1", primary_subnet_id = oci_core_subnet.private_app.id }',
    "size": "2",
    "load_balancers": '{ load_balancer_id = oci_load_balancer_load_balancer.web.id, backend_set_name = "app", port = 8080 }',
    "kubernetes_version": '"v1.31.1"',
    "type": '"ENHANCED_CLUSTER"',
    "endpoint_config": "{ is_public_ip_enabled = false, subnet_id = oci_core_subnet.private_app.id }",
    "options": "{ service_lb_subnet_ids = [oci_core_subnet.public.id] }",
    "cluster_id": "oci_containerengine_cluster.oke.id",
    "node_shape": '"VM.Standard.E5.Flex"',
    "node_config_details": "{ size = 3, placement_configs { availability_domain = …, subnet_id = … } }",
    "node_shape_config": "{ ocpus = 2, memory_in_gbs = 16 }",
    "application_id": "oci_functions_application.app.id",
    "memory_in_mbs": "256",
    "image": '"fra.ocir.io/acme/checkout:1.4.2"',
    "timeout_in_seconds": "30",
    "provisioned_concurrency_config": '{ strategy = "CONSTANT", count = 10 }',
    "config": '{ "LOG_LEVEL" = "info" }',
    "db_name": '"acmeprod"',
    "db_workload": '"OLTP"',
    "compute_count": "4",
    "data_storage_size_in_tbs": "1",
    "is_auto_scaling_enabled": "true",
    "db_home": '{ database { db_name = "acmeprod" } }',
    "hostname": '"db-host"',
    "ssh_public_keys": "[var.ssh_public_key]",
    "database_edition": '"ENTERPRISE_EDITION"',
    "shape_name": '"MySQL.VM.Standard.E4.1.8GB"',
    "admin_username": '"admin"',
    "admin_password": "var.mysql_admin_password",
    "data_storage_size_in_gb": "100",
    "is_highly_available": "true",
    "db_version": '"16"',
    "network_details": "{ subnet_id = oci_core_subnet.private_db.id }",
    "storage_details": '{ system_type = "OCI_OPTIMIZED_STORAGE", is_regionally_durable = true }',
    "instance_count": "1",
    "credentials": '{ username = "admin", password_details { password_type = "PLAIN_TEXT" } }',
    "ddl_statement": '"CREATE TABLE users(id INTEGER, name STRING, PRIMARY KEY(id))"',
    "table_limits": "{ max_read_units = 50, max_write_units = 50, max_storage_in_gbs = 25 }",
    "is_auto_reclaimable": "false",
    "node_memory_in_gbs": "16",
    "software_version": '"REDIS_7_0"',
    "cluster_mode": '"SHARDED"',
    "shard_count": "3",
    "access_type": '"NoPublicAccess"',
    "versioning": '"Enabled"',
    "storage_tier": '"Standard"',
    "kms_key_id": "oci_kms_key.main.id",
    "size_in_gbs": "100",
    "vpus_per_gb": "10",
    "hostname_label": '"nfs01"',
    "vault_type": '"DEFAULT"',
    "key_shape": '{ algorithm = "AES", length = 32 }',
    "management_endpoint": "oci_kms_vault.main.management_endpoint",
    "protection_mode": '"HSM"',
    "secret_name": '"db-admin-password"',
    "vault_id": "oci_kms_vault.main.id",
    "key_id": "oci_kms_key.main.id",
    "secret_content": '{ content_type = "BASE64", content = var.secret_b64 }',
    "bastion_type": '"STANDARD"',
    "client_cidr_block_allow_list": '["203.0.113.0/24"]',
    "max_session_ttl_in_seconds": "10800",
    "backend_type": '"LOAD_BALANCER"',
    "load_balancer_id": "oci_load_balancer_load_balancer.web.id",
    "web_app_firewall_policy_id": "oci_waf_web_app_firewall_policy.main.id",
    "certificate_config": '{ config_type = "ISSUED_BY_INTERNAL_CA", certificate_profile_type = "TLS_SERVER_OR_CLIENT" }',
    "enable_delete": "true",
    "matching_rule": "\"ALL {instance.compartment.id = 'ocid1.compartment.oc1..aa…'}\"",
    "statements": '["Allow group AppDevs to manage instances in compartment acme-prod"]',
    "version_date": '"2026-01-01"',
    "log_group_id": "oci_logging_log_group.main.id",
    "log_type": '"SERVICE"',
    "is_enabled": "true",
    "retention_duration": "30",
    "destinations": "[oci_ons_notification_topic.ops.id]",
    "query": '"CpuUtilization[1m].mean() > 80"',
    "severity": '"CRITICAL"',
    "resolution": '"1m"',
    "pending_duration": '"PT5M"',
    "actions": '{ actions { action_type = "ONS", topic_id = oci_ons_notification_topic.ops.id, is_enabled = true } }',
    "condition": 'jsonencode({ eventType = "com.oraclecloud.objectstorage.createbucket" })',
    "partitions": "3",
    "stream_pool_id": "oci_streaming_stream_pool.main.id",
    "retention_in_hours": "24",
    "cidr_block": '"10.0.0.0/24"',
    "cidr_blocks": '["10.0.0.0/16"]',
    "prohibit_public_ip_on_vnic": "true",
}


def example_for(slug, arg, docs_ex):
    if (slug, arg["name"]) in EX_RES:
        return EX_RES[(slug, arg["name"])]
    if arg["name"] in EX_ARG:
        return EX_ARG[arg["name"]]
    if docs_ex:
        return docs_ex
    n = arg["name"]
    if n.endswith("_ids"):
        return f"[var.{n[:-1]}]"
    if n.endswith("_id"):
        return f"var.{n}"
    if n.startswith("is_"):
        return "true"
    return '"…"'


def clip(s, n=200):
    s = s.rstrip(".").rstrip(":,;") + "."
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


groups = {}
missing_desc = []
for slug, (group, name, glyph, summary, opt_picks, used) in SERVICES.items():
    parsed = parse_doc(fetch_doc(slug))
    by_name = {a["name"]: a for a in parsed["args"]}
    drop = DROP.get(slug, set())
    req = [a for a in parsed["args"] if a["required"] and a["name"] not in drop]
    opts = [by_name[p] for p in opt_picks if p in by_name]
    for p in opt_picks:
        if p not in by_name:
            print(f"!! {slug}: optional pick '{p}' not found in docs")
    params = []
    for a in req + opts:
        if not a["desc"]:
            missing_desc.append((slug, a["name"]))
        params.append({
            "name": a["name"],
            "required": a["required"],
            "desc": clip(a["desc"]),
            "example": example_for(slug, a, a.get("example")),
        })
    n_opt_more = parsed["n_optional"] - len(opts)
    groups.setdefault(group, []).append({
        "key": slug, "name": name, "glyph": glyph, "rtype": "oci_" + slug,
        "summary": summary, "params": params, "nOptionalMore": n_opt_more,
        **({"used": True} if used else {}),
    })

order = ["NETWORKING", "COMPUTE", "DATABASE", "STORAGE", "SECURITY", "IDENTITY", "OBSERVABILITY"]
out = [{"name": g, "items": groups[g]} for g in order]

ts = f"""// GENERATED from OpenTofu registry docs — provider opentofu/oci {PROVIDER_VERSION}.
// Source: https://search.opentofu.org/provider/opentofu/oci/latest (984 resources total;
// this catalog is the curated buildable subset — regenerate with frontend/scripts/gen_catalog.py).
// Required flags and descriptions come from the provider's Argument Reference.

export const PROVIDER_VERSION = {json.dumps(PROVIDER_VERSION)};

export interface CatalogParam {{
  name: string; // HCL argument name
  required: boolean;
  desc: string; // what the provider is asking for
  example: string; // example value, HCL syntax
}}

export interface CatalogService {{
  key: string;
  name: string;
  glyph: string;
  rtype: string;
  summary: string;
  params: CatalogParam[]; // all required args first, then notable optional ones
  nOptionalMore: number; // further optional args documented in the provider
  used?: boolean;
}}

export const catalogGroups: {{ name: string; items: CatalogService[] }}[] = {json.dumps(out, indent=2)};

export const serviceByKey: Record<string, CatalogService> = Object.fromEntries(
  catalogGroups.flatMap((g) => g.items.map((s) => [s.key, s])),
);
"""
dest = os.environ.get("DEST", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "catalog.ts"))
open(dest, "w").write(ts)
print(f"wrote {dest}: {sum(len(g['items']) for g in out)} services in {len(out)} groups")
if missing_desc:
    print("missing descriptions:", missing_desc)
