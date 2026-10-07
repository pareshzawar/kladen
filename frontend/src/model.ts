// The resource model: single source of truth for what can go on the drawboard.
//
// Each ResourceType below declares the config fields the GUI shows for it
// (text / select / toggle). The Python codegen service (backend/app.py) has
// a matching Jinja2 template for the same `key`, which is what turns the
// config into OpenTofu. So: ADDING A NEW SERVICE = add a ResourceType here
// AND a template in backend/app.py, with identical `key` and field names.
//
// Field helpers used below: t() = text input, s() = dropdown, b() = toggle.

export interface FieldSchema {
  key: string;
  label: string;
  kind: "text" | "select" | "toggle";
  options?: string[];
  def: string | boolean;
}

export interface ResourceType {
  key: string;
  name: string;
  glyph: string;
  rtype: string;
  group: string;
  fields: FieldSchema[];
}

const t = (key: string, label: string, def: string): FieldSchema => ({ key, label, kind: "text", def });
const s = (key: string, label: string, options: string[], def: string): FieldSchema => ({ key, label, kind: "select", options, def });
const b = (key: string, label: string, def: boolean): FieldSchema => ({ key, label, kind: "toggle", def });

export const resourceTypes: ResourceType[] = [
  // NETWORKING
  { key: "vcn", name: "VCN", glyph: "VC", rtype: "oci_core_vcn", group: "NETWORKING", fields: [t("name", "Display name", "vcn-main"), t("cidr", "CIDR block", "10.0.0.0/16")] },
  { key: "lb", name: "Load Balancer", glyph: "LB", rtype: "oci_load_balancer", group: "NETWORKING", fields: [t("name", "Display name", "lb-web"), s("shape", "Shape", ["Flexible", "Fixed 100Mbps"], "Flexible"), t("min_mbps", "Min bandwidth (Mbps)", "10"), t("max_mbps", "Max bandwidth (Mbps)", "100"), b("waf", "WAF policy attached", true)] },
  { key: "apigw", name: "API Gateway", glyph: "GW", rtype: "oci_apigateway_gateway", group: "NETWORKING", fields: [t("name", "Display name", "apigw-main"), s("endpoint", "Endpoint type", ["Public", "Private"], "Public"), b("logging", "Request logging", true)] },
  { key: "drg", name: "DRG", glyph: "DR", rtype: "oci_core_drg", group: "NETWORKING", fields: [t("name", "Display name", "drg-main")] },
  { key: "fw", name: "Network Firewall", glyph: "FW", rtype: "oci_network_firewall_network_firewall", group: "NETWORKING", fields: [t("name", "Display name", "fw-main")] },
  // COMPUTE
  { key: "compute", name: "Compute Instance", glyph: "CI", rtype: "oci_core_instance", group: "COMPUTE", fields: [t("prefix", "Name prefix", "app-"), s("shape", "Shape", ["VM.Standard.E5.Flex", "VM.Standard.E4.Flex", "VM.Standard3.Flex"], "VM.Standard.E5.Flex"), t("ocpus", "OCPUs", "2"), t("memory_gb", "Memory (GB)", "16"), t("count", "Count", "2"), b("encrypt", "In-transit encryption", true)] },
  { key: "pool", name: "Instance Pool", glyph: "IP", rtype: "oci_core_instance_pool", group: "COMPUTE", fields: [t("name", "Display name", "pool-app"), t("size", "Size", "3")] },
  { key: "oke", name: "OKE Cluster", glyph: "K8", rtype: "oci_containerengine_cluster", group: "COMPUTE", fields: [t("name", "Cluster name", "oke-main"), s("version", "Kubernetes version", ["v1.31.1", "v1.30.1", "v1.29.10"], "v1.31.1"), t("pools", "Node pools", "3"), t("nodes_per_pool", "Nodes per pool", "3"), b("enhanced", "Enhanced cluster", true), b("public_endpoint", "Public API endpoint", false)] },
  { key: "fn", name: "Functions", glyph: "FN", rtype: "oci_functions_application", group: "COMPUTE", fields: [t("name", "Application name", "fn-app")] },
  // DATABASE
  { key: "adb", name: "Autonomous DB", glyph: "DB", rtype: "oci_database_autonomous_database", group: "DATABASE", fields: [t("name", "Display name", "adb-main"), s("workload", "Workload type", ["OLTP", "DW", "AJD"], "OLTP"), t("ecpu", "Compute (ECPU)", "4"), t("storage_tb", "Storage (TB)", "1"), s("license", "License", ["License Included", "BYOL"], "License Included"), b("auto_scaling", "Auto scaling", true), b("mtls", "mTLS required", true)] },
  { key: "basedb", name: "Base DB System", glyph: "BD", rtype: "oci_database_db_system", group: "DATABASE", fields: [t("name", "Display name", "db-main"), t("shape", "Shape", "VM.Standard.E5.Flex")] },
  { key: "mysql", name: "MySQL HeatWave", glyph: "MY", rtype: "oci_mysql_mysql_db_system", group: "DATABASE", fields: [t("name", "Display name", "mysql-main"), t("shape", "Shape", "MySQL.32")] },
  // STORAGE
  { key: "os", name: "Object Storage", glyph: "OS", rtype: "oci_objectstorage_bucket", group: "STORAGE", fields: [t("buckets", "Buckets (comma-separated)", "assets, backups, logs"), s("visibility", "Visibility", ["Private (enforced)", "Public"], "Private (enforced)"), t("lifecycle_days", "Archive after (days)", "90"), b("versioning", "Versioning", true), b("cmk", "Customer-managed keys", true)] },
  { key: "bv", name: "Block Volume", glyph: "BV", rtype: "oci_core_volume", group: "STORAGE", fields: [t("name", "Display name", "vol-data"), t("size_gb", "Size (GB)", "256")] },
  { key: "fss", name: "File Storage", glyph: "FS", rtype: "oci_file_storage_file_system", group: "STORAGE", fields: [t("name", "Display name", "fss-shared")] },
  // SECURITY
  { key: "vault", name: "Vault", glyph: "VA", rtype: "oci_kms_vault", group: "SECURITY", fields: [t("name", "Display name", "vault-main")] },
  { key: "bastion", name: "Bastion", glyph: "BA", rtype: "oci_bastion_bastion", group: "SECURITY", fields: [t("name", "Display name", "bastion-main")] },
  { key: "waf", name: "WAF", glyph: "WF", rtype: "oci_waf_web_app_firewall", group: "SECURITY", fields: [t("name", "Display name", "waf-main")] },
];

export const typeByKey = Object.fromEntries(resourceTypes.map((r) => [r.key, r])) as Record<string, ResourceType>;
export const catalogGroups = ["NETWORKING", "COMPUTE", "DATABASE", "STORAGE", "SECURITY"];

export type ConfigValue = string | boolean;

// One resource placed on a drawboard: which type it is, where it sits on
// the canvas (x/y in board pixels), and its current config values.
export interface ResourceInstance {
  id: string;
  typeKey: string;
  x: number;
  y: number;
  config: Record<string, ConfigValue>;
}

export interface StackModel {
  id: string;
  name: string;
  env: string;
  resources: ResourceInstance[];
  // edges as [fromResourceId, toResourceId]; drawn by dragging a node's connect
  // handle on the board (see addEdge/removeEdge in store.tsx)
  edges: [string, string][];
}

export interface ClientModel {
  id: string;
  name: string;
  stacks: StackModel[];
}

// Roles: junior designs + plans, senior also approves + applies, admin also
// manages users and the catalog (Admin screen). Real authentication (OAuth)
// replaces this acting-user demo in Phase 2.
export type Role = "junior" | "senior" | "admin";

export interface UserModel {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface WorldState {
  clients: ClientModel[];
  selClient: string;
  selStack: string;
  selNode: string | null;
  users: UserModel[];
  actingUser: string; // which user you're acting as (demo stand-in for login)
  customTypes: ResourceType[]; // admin-created catalog entries
  disabledTypes: string[]; // built-in catalog keys hidden by the admin
}

// Default config for a new node: every field starts at its declared default.
// Looks in the built-in registry first, then the admin's custom types.
export const defaultConfig = (typeKey: string, customTypes: ResourceType[] = []): Record<string, ConfigValue> => {
  const rt = typeByKey[typeKey] ?? customTypes.find((t) => t.key === typeKey);
  return Object.fromEntries((rt?.fields ?? []).map((f) => [f.key, f.def]));
};

export const uid = (): string => Math.random().toString(36).slice(2, 10);

// ---- seeded demo world (the Acme ecommerce-core stack from the design) ----

const seeded = (typeKey: string, id: string, x: number, y: number, over: Record<string, ConfigValue>): ResourceInstance => ({
  id, typeKey, x, y, config: { ...defaultConfig(typeKey), ...over },
});

const ecommerceCore: StackModel = {
  id: "ecommerce-core",
  name: "ecommerce-core",
  env: "production",
  resources: [
    seeded("apigw", "apigw", 34, 262, { name: "apigw-acme-prod" }),
    seeded("lb", "lb", 310, 262, { name: "lb-acme-web" }),
    seeded("oke", "oke", 570, 122, { name: "oke-acme-prod" }),
    seeded("compute", "compute", 570, 396, {}),
    seeded("adb", "adb", 838, 122, { name: "adb-acme-prod" }),
    seeded("os", "os", 838, 396, {}),
  ],
  edges: [
    ["apigw", "lb"], ["lb", "oke"], ["lb", "compute"],
    ["oke", "adb"], ["compute", "os"], ["oke", "os"],
  ],
};

const emptyStack = (name: string, env: string): StackModel => ({ id: name, name, env, resources: [], edges: [] });

export const initialWorld: WorldState = {
  clients: [
    { id: "acme", name: "Acme Retail", stacks: [ecommerceCore, emptyStack("data-platform", "production"), emptyStack("edge-network", "staging")] },
    { id: "northwind", name: "Northwind Bank", stacks: [emptyStack("core-banking", "production"), emptyStack("dr-site", "dr")] },
    { id: "zephyr", name: "Zephyr SaaS", stacks: [emptyStack("platform-prod", "production"), emptyStack("analytics", "dev")] },
  ],
  selClient: "acme",
  selStack: "ecommerce-core",
  selNode: "adb",
  users: [
    { id: "sofia", name: "Sofia Marek", email: "sofia@meridian-msp.example", role: "admin" },
    { id: "priya", name: "Priya Nair", email: "priya@meridian-msp.example", role: "senior" },
    { id: "rahul", name: "Rahul Iyer", email: "rahul@meridian-msp.example", role: "junior" },
  ],
  actingUser: "sofia",
  customTypes: [],
  disabledTypes: [],
};

// Saved worlds from older app versions may miss newer fields — merge them
// with defaults so an upgrade never crashes on stale localStorage/DB data.
export function normalizeWorld(w: Partial<WorldState> | null | undefined): WorldState {
  const users = w?.users?.length ? w.users : initialWorld.users;
  return {
    clients: w?.clients?.length ? w.clients : initialWorld.clients,
    selClient: w?.selClient ?? initialWorld.selClient,
    selStack: w?.selStack ?? initialWorld.selStack,
    selNode: w?.selNode ?? null,
    users,
    actingUser: users.some((u) => u.id === w?.actingUser) ? w!.actingUser! : users[0].id,
    customTypes: Array.isArray(w?.customTypes) ? w.customTypes : [],
    disabledTypes: Array.isArray(w?.disabledTypes) ? w.disabledTypes : [],
  };
}
