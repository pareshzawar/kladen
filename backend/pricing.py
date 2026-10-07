#!/usr/bin/env python3
"""Estimate monthly cost from a tofu plan.json using OCI's public price list.

Reads the free, no-auth OCI Price List API, maps each planned *create* resource
to billable part numbers, and sums a monthly estimate. Scoped to the core-loop
services (STATUS #2). Design choice, on purpose: only fixed-shape resources
(compute, Autonomous DB, block volume) are priced; networking is free; and
genuinely usage-based services (object storage, API gateway, functions) are
LISTED but NOT guessed. An honest "these cost, these are usage-based" beats a
fake-precise total. It's an estimate at pay-as-you-go rates, never a quote.

Reads plan.json only (seam #2: plan.json is persisted per run). No creds needed.
"""
from __future__ import annotations

import json
import time
import urllib.request

# Public, no-auth OCI price list (same source the Cost Estimator uses).
PRICE_URL = "https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/?currencyCode=USD"
HOURS_PER_MONTH = 730  # OCI's convention for turning an hourly rate into monthly

# Part numbers pinned from the catalog (standard OCI, pay-as-you-go, USD).
# If OCI renames/repriced a part, the rate falls back to 0 and the line shows $0
# rather than crashing — verify these when the estimate looks off.
PART = {
    "compute_ocpu": "B97384",  # Compute - Standard - E5 - OCPU / hour
    "compute_mem": "B97385",   # Compute - Standard - E5 - Memory GB / hour
    "adb_ecpu": "B95702",      # Autonomous Transaction Processing - ECPU / hour
    "adb_storage": "B95706",   # ATP storage - GB / month
    "block_gb": "B91961",      # Block Volume storage - GB / month
}

# Network primitives OCI does not charge for.
FREE_TYPES = {
    "oci_core_vcn", "oci_core_subnet", "oci_core_internet_gateway",
    "oci_core_nat_gateway", "oci_core_service_gateway", "oci_core_route_table",
    "oci_core_security_list", "oci_core_drg", "oci_core_network_security_group",
    "oci_core_default_route_table", "oci_core_default_security_list",
}

# Usage-based / metered services we deliberately don't invent a number for.
USAGE_TYPES = {
    "oci_objectstorage_bucket": "per GB stored + requests (usage-based)",
    "oci_apigateway_gateway": "per million API calls (usage-based)",
    "oci_functions_function": "per invocation + GB-seconds (usage-based)",
    "oci_functions_application": "grouping only, no direct charge",
    "oci_containerengine_cluster": "basic control plane free; enhanced billed per hour",
    "oci_containerengine_node_pool": "billed as the compute instances it runs",
}

# Human-friendly service name per resource type, so the UI can group the cost
# lines by service ("Compute", "Autonomous DB", …). Falls back to the raw type.
SERVICE = {
    "oci_core_instance": "Compute",
    "oci_database_autonomous_database": "Autonomous DB",
    "oci_core_volume": "Block storage",
    "oci_load_balancer_load_balancer": "Load balancer",
    "oci_objectstorage_bucket": "Object storage",
    "oci_apigateway_gateway": "API gateway",
    "oci_functions_function": "Functions",
    "oci_functions_application": "Functions",
    "oci_containerengine_cluster": "OKE",
    "oci_containerengine_node_pool": "OKE",
}

_cache: dict = {"at": 0.0, "prices": {}}


def _prices() -> dict:
    """PAYG USD price per part number, cached for an hour (prices change rarely)."""
    if _cache["prices"] and time.time() - _cache["at"] < 3600:
        return _cache["prices"]
    with urllib.request.urlopen(PRICE_URL, timeout=20) as resp:
        items = json.load(resp)["items"]
    prices: dict[str, float] = {}
    for item in items:
        for loc in item.get("currencyCodeLocalizations", []):
            if loc.get("currencyCode") != "USD":
                continue
            for p in loc.get("prices", []):
                if p.get("model") == "PAY_AS_YOU_GO":
                    prices[item["partNumber"]] = p.get("value", 0.0)
    _cache.update(at=time.time(), prices=prices)
    return prices


def _rate(prices: dict, key: str) -> float:
    return float(prices.get(PART[key], 0.0))


def _first(block):
    """A tofu block attribute is a list of one dict in plan.json; unwrap it."""
    if isinstance(block, list):
        return block[0] if block else {}
    return block or {}


def estimate(plan_json: dict) -> dict:
    """Return {total_monthly, lines[], free[], usage_based[], note}."""
    prices = _prices()
    lines: list[dict] = []
    free: list[str] = []
    usage: list[dict] = []
    total = 0.0

    for rc in plan_json.get("resource_changes", []):
        if "create" not in rc.get("change", {}).get("actions", []):
            continue
        t = rc["type"]
        addr = rc["address"]
        after = rc["change"].get("after") or {}

        svc = SERVICE.get(t, t)  # friendly service name for the per-service UI grouping
        if t in FREE_TYPES:
            free.append(addr)
        elif t in USAGE_TYPES:
            usage.append({"resource": addr, "service": svc, "why": USAGE_TYPES[t]})
        elif t == "oci_core_instance":
            sc = _first(after.get("shape_config"))
            ocpu = float(sc.get("ocpus") or 0)
            mem = float(sc.get("memory_in_gbs") or 0)
            monthly = (ocpu * _rate(prices, "compute_ocpu") + mem * _rate(prices, "compute_mem")) * HOURS_PER_MONTH
            lines.append({"resource": addr, "service": svc, "detail": f"{ocpu:g} OCPU + {mem:g} GB (E5)", "monthly": round(monthly, 2)})
            total += monthly
        elif t == "oci_database_autonomous_database":
            ecpu = float(after.get("compute_count") or 0)
            tb = float(after.get("data_storage_size_in_tbs") or 0)
            monthly = ecpu * _rate(prices, "adb_ecpu") * HOURS_PER_MONTH + tb * 1024 * _rate(prices, "adb_storage")
            lines.append({"resource": addr, "service": svc, "detail": f"{ecpu:g} ECPU + {tb:g} TB", "monthly": round(monthly, 2)})
            total += monthly
        elif t == "oci_core_volume":
            gb = float(after.get("size_in_gbs") or 0)
            monthly = gb * _rate(prices, "block_gb")
            lines.append({"resource": addr, "service": svc, "detail": f"{gb:g} GB block volume", "monthly": round(monthly, 2)})
            total += monthly
        elif t == "oci_load_balancer_load_balancer":
            # Flexible LB: base + bandwidth. The catalog lists these at $0 PAYG,
            # so we surface it as $0 with an honest note rather than inventing one.
            lines.append({"resource": addr, "service": svc, "detail": "flexible LB (bandwidth billed on usage)", "monthly": 0.0})
        else:
            usage.append({"resource": addr, "service": svc, "why": "not modelled in the estimator yet"})

    return {
        "currency": "USD",
        "total_monthly": round(total, 2),
        "lines": lines,
        "free": free,
        "usage_based": usage,
        "note": (
            "Estimate for fixed-shape resources at pay-as-you-go rates (730 h/mo). "
            "Networking is free; usage-based services are listed but not priced. Not a quote."
        ),
    }
