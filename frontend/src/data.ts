// Sample/demo data for the screens that are still mockups (Dashboard, Drift,
// Plan tab), ported 1:1 from the Kladen.dc.html design. This is the seam
// where the real API lands later: everything below becomes fetches.
// NOTE: the interactive drawboard does NOT use this file — its live model
// lives in model.ts (types + seed) and store.tsx (state).

export type Screen = "dashboard" | "builder" | "drift" | "profiles" | "admin";
export type Tab = "design" | "opentofu" | "plan" | "diagram";

export const navItems: { key: Screen; label: string; badge?: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "builder", label: "Builder" },
  { key: "drift", label: "Drift & Reports", badge: "2" },
  { key: "profiles", label: "Profiles" },
];

export interface Stack {
  name: string;
  env: string;
  sel?: boolean;
}
export interface Client {
  key: string;
  name: string;
  envs: string;
  drift: boolean;
  stacks: Stack[];
}

export const clients: Client[] = [
  {
    key: "acme", name: "Acme Retail", envs: "2 envs", drift: true,
    stacks: [
      { name: "ecommerce-core", env: "prod", sel: true },
      { name: "data-platform", env: "prod" },
      { name: "edge-network", env: "staging" },
    ],
  },
  {
    key: "northwind", name: "Northwind Bank", envs: "2 envs", drift: false,
    stacks: [
      { name: "core-banking", env: "prod" },
      { name: "dr-site", env: "dr" },
    ],
  },
  {
    key: "zephyr", name: "Zephyr SaaS", envs: "3 envs", drift: true,
    stacks: [
      { name: "platform-prod", env: "prod" },
      { name: "analytics", env: "dev" },
    ],
  },
];

export interface NodeDef {
  id: string;
  x: number;
  y: number;
  name: string;
  type: string;
  detail: string;
  glyph: string;
  svc: string; // key into catalog serviceByKey
}

export const nodeDefs: NodeDef[] = [
  { id: "apigw", x: 34, y: 262, name: "API Gateway", type: "oci_apigateway_gateway", detail: "REST · public · 12 routes", glyph: "GW", svc: "apigateway_gateway" },
  { id: "lb", x: 310, y: 262, name: "Load Balancer", type: "oci_load_balancer", detail: "flexible · 10–100 Mbps · 2 listeners", glyph: "LB", svc: "load_balancer_load_balancer" },
  { id: "oke", x: 570, y: 122, name: "OKE Cluster", type: "oci_containerengine_cluster", detail: "v1.31.1 · 3 node pools · enhanced", glyph: "K8", svc: "containerengine_cluster" },
  { id: "compute", x: 570, y: 396, name: "Compute ×2", type: "oci_core_instance", detail: "VM.Standard.E5.Flex · 2 OCPU", glyph: "CI", svc: "core_instance" },
  { id: "adb", x: 838, y: 122, name: "Autonomous DB", type: "oci_database_autonomous_database", detail: "OLTP · 4 ECPU · 1 TB · auto-scaling", glyph: "DB", svc: "database_autonomous_database" },
  { id: "os", x: 838, y: 396, name: "Object Storage", type: "oci_objectstorage_bucket ×3", detail: "private · versioned · lifecycle 90d", glyph: "OS", svc: "objectstorage_bucket" },
];

export const NODE_W = 200;
export const NODE_H = 88;
export const CANVAS_W = 1100;
export const CANVAS_H = 600;

export type Link = [string, string];
export const initialLinks: Link[] = [
  ["apigw", "lb"], ["lb", "oke"], ["lb", "compute"],
  ["oke", "adb"], ["compute", "os"], ["oke", "os"],
];

export const edgePath = (nodes: NodeDef[], [a, b]: Link): string | null => {
  const A = nodes.find((n) => n.id === a);
  const B = nodes.find((n) => n.id === b);
  if (!A || !B) return null;
  const x1 = A.x + NODE_W, y1 = A.y + NODE_H / 2, x2 = B.x - 4, y2 = B.y + NODE_H / 2;
  return `M ${x1} ${y1} C ${x1 + 44} ${y1}, ${x2 - 44} ${y2}, ${x2} ${y2}`;
};

export type ConfigField =
  | { kind: "field"; label: string; value: string; select?: boolean }
  | { kind: "toggle"; label: string; on: boolean };

export interface NodeConfig {
  title: string;
  rtype: string;
  glyph: string;
  tags: string[];
  fields: ConfigField[];
}

const F = (label: string, value: string, select = false): ConfigField => ({ kind: "field", label, value, select });
const T = (label: string, on: boolean): ConfigField => ({ kind: "toggle", label, on });
export const baseTags = ["client=acme-retail", "env=production", "managed-by=kladen"];

export const configs: Record<string, NodeConfig> = {
  apigw: { title: "API Gateway", rtype: "oci_apigateway_gateway", glyph: "GW", tags: baseTags, fields: [F("Display name", "apigw-acme-prod"), F("Endpoint type", "Public", true), F("Routes", "12 configured"), T("Request logging", true), T("mTLS to backends", true)] },
  lb: { title: "Load Balancer", rtype: "oci_load_balancer", glyph: "LB", tags: baseTags, fields: [F("Display name", "lb-acme-web"), F("Shape", "Flexible", true), F("Bandwidth (Mbps)", "10 – 100"), F("Listeners", "HTTPS :443, HTTP :80 → redirect"), T("WAF policy attached", true)] },
  oke: { title: "OKE Cluster", rtype: "oci_containerengine_cluster", glyph: "K8", tags: baseTags, fields: [F("Cluster name", "oke-acme-prod"), F("Kubernetes version", "v1.31.1", true), F("Node pools", "3 · VM.Standard.E5.Flex"), F("Nodes per pool", "3"), T("Enhanced cluster", true), T("Public API endpoint", false)] },
  compute: { title: "Compute", rtype: "oci_core_instance", glyph: "CI", tags: baseTags, fields: [F("Name prefix", "app-"), F("Shape", "VM.Standard.E5.Flex", true), F("OCPUs / Memory", "2 OCPU · 16 GB"), F("Count", "2"), T("In-transit encryption", true)] },
  adb: { title: "Autonomous DB", rtype: "oci_database_autonomous_database", glyph: "DB", tags: baseTags, fields: [F("Display name", "adb-acme-prod"), F("Workload type", "OLTP", true), F("Compute (ECPU)", "4"), F("Storage (TB)", "1"), F("License", "License Included", true), T("Auto scaling", true), T("mTLS required", true)] },
  os: { title: "Object Storage", rtype: "oci_objectstorage_bucket", glyph: "OS", tags: baseTags, fields: [F("Buckets", "assets, backups, logs"), F("Visibility", "Private (enforced)", true), F("Lifecycle policy", "Archive after 90 days"), T("Versioning", true), T("Customer-managed keys", true)] },
};

export const files = [
  { name: "main.tf", lines: 58 },
  { name: "network.tf", lines: 96 },
  { name: "compute.tf", lines: 64 },
  { name: "kubernetes.tf", lines: 72 },
  { name: "database.tf", lines: 41, active: true },
  { name: "storage.tf", lines: 44 },
  { name: "variables.tf", lines: 37 },
];

// HCL token colors for the generated-code view.
export const CODE_COLORS = {
  CMT: "#54687F", KW: "#5EC9C0", STR: "#A3C98F", ATTR: "#C9D6E3", NUM: "#D9A05B", REF: "#8FB7DC",
} as const;

export interface CodeSeg {
  t: string;
  c: string;
}
const { CMT, KW, STR, ATTR, NUM, REF } = CODE_COLORS;
const L = (...segs: [string, string][]): CodeSeg[] => segs.map(([t, c]) => ({ t, c }));

export const codeLines: CodeSeg[][] = [
  L(["# Generated by Kladen v1.4.2 — stack: ecommerce-core (production)", CMT]),
  L(["# Source of truth is the Kladen design. Manual edits are overwritten.", CMT]),
  L([" ", ATTR]),
  L(["resource ", KW], ['"oci_database_autonomous_database" "adb_acme_prod"', STR], [" {", ATTR]),
  L(["  compartment_id              = ", ATTR], ["var.compartment_ocid", REF]),
  L(["  display_name                = ", ATTR], ['"adb-acme-prod"', STR]),
  L(["  db_name                     = ", ATTR], ['"acmeprod"', STR]),
  L(["  db_workload                 = ", ATTR], ['"OLTP"', STR]),
  L(["  compute_model               = ", ATTR], ['"ECPU"', STR]),
  L(["  compute_count               = ", ATTR], ["4", NUM]),
  L(["  data_storage_size_in_tbs    = ", ATTR], ["1", NUM]),
  L(["  is_auto_scaling_enabled     = ", ATTR], ["true", NUM]),
  L(["  is_mtls_connection_required = ", ATTR], ["true", NUM]),
  L(["  license_model               = ", ATTR], ['"LICENSE_INCLUDED"', STR]),
  L(["  subnet_id                   = ", ATTR], ["oci_core_subnet.private_db.id", REF]),
  L(["  nsg_ids                     = [", ATTR], ["oci_core_network_security_group.db.id", REF], ["]", ATTR]),
  L([" ", ATTR]),
  L(["  freeform_tags = {", ATTR]),
  L(['    "client"     ', STR], ["= ", ATTR], ['"acme-retail"', STR]),
  L(['    "env"        ', STR], ["= ", ATTR], ['"production"', STR]),
  L(['    "managed-by" ', STR], ["= ", ATTR], ['"kladen"', STR]),
  L(["  }", ATTR]),
  L(["}", ATTR]),
  L([" ", ATTR]),
  L(["output ", KW], ['"adb_connection_urls"', STR], [" {", ATTR]),
  L(["  value     = ", ATTR], ["oci_database_autonomous_database.adb_acme_prod.connection_urls", REF]),
  L(["  sensitive = ", ATTR], ["true", NUM]),
  L(["}", ATTR]),
];

const ADD = "#4CC38A", CHG = "#D9A05B";
export const planLines = [
  { sign: "+", color: ADD, res: "oci_core_vcn.main", note: "10.0.0.0/16" },
  { sign: "+", color: ADD, res: "oci_core_subnet.public", note: "10.0.0.0/24" },
  { sign: "+", color: ADD, res: "oci_core_subnet.private_app", note: "10.0.1.0/24" },
  { sign: "+", color: ADD, res: "oci_core_subnet.private_db", note: "10.0.2.0/24" },
  { sign: "+", color: ADD, res: "oci_load_balancer.web", note: "flexible 10–100 Mbps" },
  { sign: "+", color: ADD, res: "oci_apigateway_gateway.public_api", note: "12 routes" },
  { sign: "+", color: ADD, res: "oci_containerengine_cluster.oke", note: "v1.31.1" },
  { sign: "+", color: ADD, res: "oci_containerengine_node_pool.default", note: "×3 pools" },
  { sign: "+", color: ADD, res: "oci_database_autonomous_database.adb_acme_prod", note: "OLTP · 4 ECPU" },
  { sign: "+", color: ADD, res: "oci_objectstorage_bucket.assets", note: "private · versioned" },
  { sign: "+", color: ADD, res: "oci_objectstorage_bucket.backups", note: "private · versioned" },
  { sign: "+", color: ADD, res: "oci_objectstorage_bucket.logs", note: "private · lifecycle 90d" },
  { sign: "~", color: CHG, res: "oci_core_security_list.web", note: "freeform_tags" },
  { sign: "~", color: CHG, res: "oci_core_instance.app_01", note: "shape_config.ocpus 2 → 4" },
];

export const guardrails = [
  { name: "No public Object Storage buckets", detail: "3 buckets checked · all private" },
  { name: "No 0.0.0.0/0 egress rules", detail: "6 security lists · 2 NSGs checked" },
  { name: "Required tags enforced", detail: "client, env, managed-by on 24 resources" },
  { name: "Cost delta within budget", detail: "+$182/mo estimated · limit $500/mo" },
];

export interface ApprovalStep {
  name: string;
  detail: string;
  done?: boolean;
  pending?: boolean;
  last?: boolean;
}
export const approvalSteps: ApprovalStep[] = [
  { name: "Plan generated", detail: "Today 14:02 · by Sofia Marek", done: true },
  { name: "Guardrails passed", detail: "4/4 policies · 0 warnings", done: true },
  { name: "Approval pending", detail: "Awaiting Priya Nair (env owner)", pending: true },
  { name: "Apply to production", detail: "Runs automatically after approval", last: true },
];

export const stats = [
  { label: "Clients", value: "3", sub: "active", color: "#0F1B2D" },
  { label: "Stacks", value: "7", sub: "across 7 envs", color: "#0F1B2D" },
  { label: "Managed resources", value: "214", sub: "+21 this week", color: "#0F1B2D" },
  { label: "Drift alerts", value: "2", sub: "2 clients", color: "#B4514D" },
  { label: "Guardrail pass rate", value: "98%", sub: "last 30 days", color: "#0B7D76" },
];

const OK = { stColor: "#0B7D76", stBg: "#E6F5F4" };
const WARN = { stColor: "#9A6B1F", stBg: "#FAF0E0" };
export const dashClients = [
  { name: "Acme Retail", mono: "AR", status: "drift", ...WARN, stacksN: "3", res: "96", envsN: "2", drift: "1 resource", driftColor: "#9A6B1F", gr: "4/4 passing", grColor: "#0B7D76", last: "plan · 14 min ago" },
  { name: "Northwind Bank", mono: "NB", status: "healthy", ...OK, stacksN: "2", res: "71", envsN: "2", drift: "none", driftColor: "#0B7D76", gr: "6/6 passing", grColor: "#0B7D76", last: "apply · 2 h ago" },
  { name: "Zephyr SaaS", mono: "ZS", status: "drift", ...WARN, stacksN: "2", res: "47", envsN: "3", drift: "1 resource", driftColor: "#9A6B1F", gr: "3/4 · 1 warning", grColor: "#9A6B1F", last: "plan · 5 h ago" },
];

const stAppr = { stColor: "#9A6B1F", stBg: "#FAF0E0" };
const stDone = { stColor: "#0B7D76", stBg: "#E6F5F4" };
const stDrift = { stColor: "#B4514D", stBg: "#FBF1F0" };
export const runs = [
  { id: "#248", target: "Acme Retail / ecommerce-core", type: "plan", changes: "+12 ~2", status: "awaiting approval", when: "14 min ago", by: "S. Marek", ...stAppr },
  { id: "#247", target: "Northwind Bank / core-banking", type: "apply", changes: "~3", status: "applied", when: "2 h ago", by: "auto", ...stDone },
  { id: "#246", target: "Zephyr SaaS / platform-prod", type: "plan", changes: "+4", status: "approved", when: "5 h ago", by: "R. Chen", ...stDone },
  { id: "#245", target: "Acme Retail / data-platform", type: "apply", changes: "+9", status: "applied", when: "yesterday", by: "S. Marek", ...stDone },
  { id: "#244", target: "Zephyr SaaS / analytics", type: "plan", changes: "~1", status: "drift detected", when: "yesterday", by: "scheduler", ...stDrift },
  { id: "#243", target: "Northwind Bank / dr-site", type: "apply", changes: "+18", status: "applied", when: "2 days ago", by: "P. Nair", ...stDone },
];

export const drifts = [
  {
    sev: "HIGH", sevColor: "#B4514D", sevBg: "#FBF1F0",
    res: "oci_core_security_list.web · Acme Retail / ecommerce-core", when: "38 min ago",
    desc: "Ingress rule added outside Kladen — SSH open to the internet.",
    diff: '+ ingress { source = "0.0.0.0/0", tcp 22 }  (added via OCI console)',
  },
  {
    sev: "MEDIUM", sevColor: "#9A6B1F", sevBg: "#FAF0E0",
    res: "oci_core_instance.app_01 · Zephyr SaaS / platform-prod", when: "3 h ago",
    desc: "Instance shape changed manually; state no longer matches design.",
    diff: "~ shape_config.ocpus: 2 → 4 · memory_in_gbs: 16 → 32",
  },
];

export const costs = [
  { name: "Northwind Bank", amount: "$6,840", pct: 100, delta: "▲ 2.1% vs last month · 71 resources" },
  { name: "Acme Retail", amount: "$4,120", pct: 60, delta: "▲ 4.6% vs last month · 96 resources" },
  { name: "Zephyr SaaS", amount: "$1,975", pct: 29, delta: "▼ 1.2% vs last month · 47 resources" },
];

export const resSummary = [
  { type: "oci_core_instance", n: "38" },
  { type: "oci_core_subnet", n: "21" },
  { type: "oci_objectstorage_bucket", n: "17" },
  { type: "oci_containerengine_node_pool", n: "12" },
  { type: "oci_database_autonomous_database", n: "6" },
  { type: "oci_load_balancer", n: "5" },
];
