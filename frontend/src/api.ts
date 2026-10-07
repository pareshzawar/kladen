// Thin client for the Kladen API (backend/api.py), reached through the Vite
// dev proxy. Every call resolves to null on network/HTTP failure so the UI can
// fall back to the design-mock data and keep working with the API offline.

export interface ApiProfile {
  id: number;
  org_id: number;
  client_id: number | null; // null = org-level (customer/workspace) default
  name: string;
  env: string;
  source: string; // manual | oci-config | vault
  region: string;
  // manual-mode credential fields (empty when source === "vault")
  tenancy_ocid: string;
  user_ocid: string;
  fingerprint: string;
  key_path: string;
  compartment_ocid: string;
  // vault-mode pointers (empty when source !== "vault")
  vault_id?: string;
  secret_ocid?: string;
}

export interface ApiStack {
  id: number;
  client_id: number;
  name: string;
  env: string;
  profile_id: number | null; // pin; null = resolve client env -> client -> org
  workspace: string | null;
}

export interface ApiClient {
  id: number;
  org_id: number;
  name: string;
  profiles: ApiProfile[];
  stacks: ApiStack[];
}

export type RunMode = "validate" | "plan" | "apply" | "destroy" | "drift";
export type RunStatus = "queued" | "running" | "awaiting_approval" | "succeeded" | "failed" | "rejected";

export interface ApiRun {
  id: number;
  stack_id: number;
  mode: RunMode;
  status: RunStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  requested_by: string;
  approved_by: string | null;
  detail: string;
  summary: { create?: number; update?: number; delete?: number; drifted?: number };
  stack_name?: string;
  env?: string;
  client_name?: string;
}

export type Role = "junior" | "senior" | "management" | "admin";

// UI capability helpers, mirroring the backend's route rules. The backend is
// the real enforcer; these just decide what to show/enable.
export const canWork = (r: Role) => r === "junior" || r === "senior" || r === "admin"; // design, plan, sync
export const canDeploy = (r: Role) => r === "senior" || r === "admin"; // apply, destroy, approve
export const ALL_ROLES: Role[] = ["junior", "senior", "management", "admin"];

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  client_id: number | null; // tenant scope: null = workspace-wide (super-admin/staff), else scoped to that customer
}

export interface Bootstrap {
  org: { id: number; name: string };
  store?: string; // "oracle" (ATP) | "sqlite" (local)
  profiles: ApiProfile[]; // org-level
  clients: ApiClient[];
  runs: ApiRun[];
  users: AuthUser[];
  me: AuthUser | null;
  drift_interval_s?: number; // 0/undefined = manual drift checks only; else the auto-check cadence
}

export interface RunLogs {
  init?: string;
  validate?: string;
  plan?: string;
  apply?: string;
  result?: unknown;
}

// --- session token -------------------------------------------------------
const TOKEN_KEY = "kladen.token";
let onAuthLost: (() => void) | null = null;
export const setAuthLostHandler = (fn: () => void) => {
  onAuthLost = fn;
};
export const getToken = () => localStorage.getItem(TOKEN_KEY);
// Auth header for the raw fetches that don't go through req() — the codegen
// service (/api/world, /api/generate, /api/import-state) now requires a token too.
export const authHeaders = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

async function req<T>(path: string, method = "GET", body?: unknown): Promise<T | null> {
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const r = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) {
      setToken(null);
      onAuthLost?.();
      return null;
    }
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

// --- auth ----------------------------------------------------------------
export async function login(email: string, password: string): Promise<AuthUser | null> {
  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { token: string; user: AuthUser };
    setToken(d.token);
    return d.user;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await req("/api/logout", "POST", {});
  setToken(null);
}

export const getMe = async (): Promise<AuthUser | null> => {
  if (!getToken()) return null;
  const d = await req<{ user: AuthUser | null }>("/api/me");
  return d?.user ?? null;
};

export const createUser = (u: { name: string; email: string; role: Role; password: string; client_id?: number | null }) =>
  req<AuthUser>("/api/users", "POST", u);
export const updateUser = (id: string, patch: { role?: Role; password?: string }) =>
  req<AuthUser>(`/api/users/${id}`, "PUT", patch);
export const deleteUser = (id: string) => req<{ ok: boolean }>(`/api/users/${id}`, "DELETE");

export const getBootstrap = () => req<Bootstrap>("/api/bootstrap");
export const startRun = (stackId: number, mode: RunMode) => req<ApiRun>(`/api/stacks/${stackId}/runs`, "POST", { mode });
export const getRun = (id: number) => req<ApiRun>(`/api/runs/${id}`);
export const getRunLogs = (id: number) => req<RunLogs>(`/api/runs/${id}/logs`);
export const approveRun = (id: number) => req<ApiRun>(`/api/runs/${id}/approve`, "POST", {});
export const rejectRun = (id: number) => req<ApiRun>(`/api/runs/${id}/reject`, "POST", {});
export const createProfile = (p: Record<string, unknown>) => req<ApiProfile>("/api/profiles", "POST", p);
export const updateProfile = (id: number, patch: Record<string, unknown>) =>
  req<ApiProfile>(`/api/profiles/${id}`, "PUT", patch);
export const deleteProfile = (id: number) => req<{ ok: boolean }>(`/api/profiles/${id}`, "DELETE");
export const pinStackProfile = (stackId: number, profileId: number | null) =>
  req<ApiStack>(`/api/stacks/${stackId}`, "PUT", { profile_id: profileId });

// One generated OpenTofu file (name + full text). Same shape codegen returns.
export interface GenFile {
  name: string;
  content: string;
}

/** Project the current design (the JSON model) into OpenTofu HCL via the
 *  codegen service. One-way only: model -> HCL, never the reverse. */
export const generate = (payload: {
  client: string;
  stack: string;
  env: string;
  resources: { type: string; config: Record<string, unknown>; rtype: string }[];
}) => req<{ files: GenFile[] }>("/api/generate", "POST", payload);

/** Write generated HCL to a real workspace and register it against the stack,
 *  creating the client/stack rows if this design isn't known to the platform
 *  yet. After this the stack can be validated, planned and applied. */
export const registerWorkspace = (payload: {
  client: string;
  stack: string;
  env: string;
  files: GenFile[];
}) => req<ApiStack & { files: number }>("/api/stacks/register", "POST", payload);

// Estimated monthly cost of a run's plan (STATUS #2). Fixed-shape resources are
// priced; networking is free; usage-based ones are listed, not guessed.
export interface CostEstimate {
  currency: string;
  total_monthly: number;
  lines: { resource: string; service: string; detail: string; monthly: number }[];
  free: string[];
  usage_based: { resource: string; service: string; why: string }[];
  note: string;
}
export const getRunEstimate = (id: number) => req<CostEstimate>(`/api/runs/${id}/estimate`);

// CIS-aligned posture on a run's plan.json (Phase 2 — Secure). Each control is
// pass/fail/unknown/not_applicable against the planned resources; failures also
// come back as findings in the shared shape (backend/cis.py, source="cis").
export type CisStatus = "pass" | "fail" | "unknown" | "not_applicable";
export interface CisControl {
  id: string;
  ref: string; // CIS section it aligns to
  title: string;
  severity: string;
  status: CisStatus;
  results: { resource: string; status: CisStatus; detail?: string }[];
}
export interface CisReport {
  controls: CisControl[];
  findings: SecurityFinding[];
  summary: { pass: number; fail: number; unknown: number; not_applicable: number; resources: number };
  note: string;
}
export const getRunCis = (id: number) => req<CisReport>(`/api/runs/${id}/cis`);

// Security posture (Phase 2 — Secure). One finding per detected problem, in the
// backend's generic findings shape (findings.py). `source` is the detector
// (cloud_guard now; cis/drift later); `source_of_record` is the upstream id.
export interface SecurityFinding {
  source: string;
  severity: string; // critical | high | medium | low | minor | info
  title: string;
  detail: string;
  resource_ref: string;
  resource_type: string;
  region: string;
  source_of_record: string;
  first_seen: string;
  last_seen: string;
}
// status is honest about Cloud Guard's real state — never faked as "clean".
export type FindingsStatus = "ok" | "not_enabled" | "no_credentials" | "sdk_unavailable" | "error";
export interface SecurityFindings {
  status: FindingsStatus;
  findings: SecurityFinding[];
  region: string;
  synced_at: string;
  detail?: string;
}
export const getSecurityFindings = () => req<SecurityFindings>("/api/security/findings");

// Unified posture (Phase 2/3): CIS + drift + Cloud Guard findings for the
// caller's scope, all in the shared shape, with each finding tagged by source
// and (for CIS/drift) the stack it came from.
export interface UnifiedFinding extends SecurityFinding {
  stack?: string;
  client?: string;
}
export interface UnifiedFindings {
  findings: UnifiedFinding[];
  cloud_guard_status: FindingsStatus | "skipped";
  summary: { total: number; by_source: Record<string, number>; by_severity: Record<string, number> };
}
export const getAllFindings = () => req<UnifiedFindings>("/api/findings");

export const relTime = (iso: string | null): string => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
