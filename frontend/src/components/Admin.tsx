// Admin screen (admins only — the sidebar hides it for other roles):
//  - Users: the real login accounts (platform API). Add teammates with a
//    password, change roles, remove them. The backend refuses to demote or
//    delete the last admin, and enforces admin-only on every call.
//  - Catalog: hide built-in services, or create custom catalog entries with
//    their own config fields (drawboard world state).
//  - Platform: live database status, and what's deliberately deferred (OAuth).

import { useEffect, useState } from "react";
import { catalogGroups, resourceTypes, uid, type FieldSchema, type ResourceType } from "../model";
import { useStore } from "../store";
import {
  ALL_ROLES, authHeaders, createUser, deleteUser, updateUser, type Bootstrap, type Role,
} from "../api";

const card = "rounded-[10px] border border-[#E3EAF2] bg-white p-4";
const cardTitle = "mb-1 font-display text-[13.5px] font-semibold text-[#0F1B2D]";
const inputCls =
  "rounded-md border border-[#E3EAF2] bg-[#FCFDFE] px-2.5 py-[7px] text-[12px] text-[#1E2B3C] outline-none focus:border-[#0FA79E]";
const btnCls =
  "cursor-pointer rounded-md border border-[#E3EAF2] px-3 py-1.5 text-[11.5px] font-medium text-[#41536A] hover:border-[#0FA79E] hover:text-[#0B7D76]";

export default function Admin({ boot, onChanged }: { boot: Bootstrap | null; onChanged: () => void }) {
  return (
    <div className="flex-1 overflow-auto px-6 py-5">
      <div className="font-display text-[17px] font-semibold text-[#0F1B2D]">Admin</div>
      <div className="mt-0.5 mb-4 text-[12px] text-[#7A8CA1]">Workspace management · Meridian MSP</div>
      <div className="grid grid-cols-2 items-start gap-4">
        <div className="flex flex-col gap-4">
          <Users boot={boot} onChanged={onChanged} />
          <Platform />
        </div>
        <Catalog />
      </div>
    </div>
  );
}

const ROLE_HELP: Record<Role, string> = {
  junior: "design + validate/plan",
  senior: "+ approve, apply, destroy, credentials",
  management: "business views + read-only builder",
  admin: "+ user management",
};

function Users({ boot, onChanged }: { boot: Bootstrap | null; onChanged: () => void }) {
  const users = boot?.users ?? [];
  const admins = users.filter((u) => u.role === "admin").length;
  // Whether *this* admin is workspace-wide (super-admin) or scoped to one client.
  // A scoped admin's new users are auto-scoped by the backend, so no picker.
  const scoped = boot?.me?.client_id != null;
  const clientName = (cid: number | null) =>
    cid == null ? "Workspace" : boot?.clients.find((c) => c.id === cid)?.name ?? `client #${cid}`;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("junior");
  const [password, setPassword] = useState("");
  const [newClient, setNewClient] = useState<number | "">(""); // "" = workspace-wide
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError("Name, email and a 6+ character password are required.");
      return;
    }
    const created = await createUser({
      name: name.trim(), email: email.trim(), role, password,
      // Super-admin chooses the scope; a scoped admin's users follow their own client.
      ...(scoped ? {} : { client_id: newClient === "" ? null : newClient }),
    });
    if (created) {
      setName("");
      setEmail("");
      setPassword("");
      setRole("junior");
      setNewClient("");
      onChanged();
    } else {
      setError("Could not add — that email may already exist.");
    }
  };

  return (
    <div className={card}>
      <div className={cardTitle}>Users</div>
      <div className="mb-3 text-[11px] text-[#7A8CA1]">Real login accounts · role is enforced by the backend on every request</div>
      <div className="flex flex-col">
        {users.map((u) => {
          const lastAdmin = u.role === "admin" && admins === 1;
          return (
            <div key={u.id} className="flex items-center gap-2.5 border-t border-[#EFF3F8] py-2 first:border-t-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0F1B2D] text-[10px] font-semibold text-[#9FD8D3]">
                {u.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-medium text-[#1E2B3C]">{u.name}</div>
                <div className="truncate text-[10.5px] text-[#93A3B6]">{u.email}</div>
              </div>
              {/* Tenant scope: workspace-wide vs a single customer. */}
              <span
                className={`ml-auto shrink-0 rounded-[9px] px-[7px] py-px text-[10px] font-semibold ${
                  u.client_id == null ? "bg-[#0F1B2D] text-[#9FD8D3]" : "bg-[#E6F5F4] text-[#0B7D76]"
                }`}
              >
                {clientName(u.client_id)}
              </span>
              <select
                value={u.role}
                disabled={lastAdmin}
                title={lastAdmin ? "The last admin cannot be demoted" : undefined}
                onChange={async (e) => {
                  await updateUser(u.id, { role: e.target.value as Role });
                  onChanged();
                }}
                className={`${inputCls} capitalize ${lastAdmin ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                {ALL_ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={lastAdmin}
                title={lastAdmin ? "The last admin cannot be removed" : "Remove user"}
                onClick={async () => {
                  await deleteUser(u.id);
                  onChanged();
                }}
                className={`rounded-md border px-2 py-1.5 text-[11px] font-medium ${
                  lastAdmin
                    ? "cursor-not-allowed border-[#EFF3F8] text-[#C6D2DF]"
                    : "cursor-pointer border-[#F2DBDB] text-[#B4514D] hover:bg-[#FBF1F0]"
                }`}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
      {error && <div className="mt-2 text-[11px] text-[#B4514D]">{error}</div>}
      <div className="mt-2 flex flex-wrap gap-2 border-t border-[#EFF3F8] pt-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={`w-[30%] ${inputCls}`} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" className={`flex-1 ${inputCls}`} />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          className={`w-[30%] ${inputCls}`}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={`cursor-pointer capitalize ${inputCls}`}>
          {ALL_ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        {/* Super-admins choose the tenant scope; scoped admins can't (auto-scoped). */}
        {!scoped && (
          <select
            value={newClient}
            onChange={(e) => setNewClient(e.target.value === "" ? "" : Number(e.target.value))}
            className={`cursor-pointer ${inputCls}`}
            title="Which customer this user is limited to"
          >
            <option value="">Workspace-wide</option>
            {boot?.clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <button type="button" onClick={add} className={btnCls}>
          Add
        </button>
      </div>
      <div className="mt-1.5 text-[10.5px] text-[#93A3B6] capitalize">
        {role}: {ROLE_HELP[role]}
        {!scoped && <span className="normal-case"> · scope: {newClient === "" ? "workspace-wide (all clients)" : clientName(Number(newClient))}</span>}
      </div>
    </div>
  );
}

// Local draft shape for the custom-type editor (options as a comma string).
interface FieldDraft {
  label: string;
  kind: FieldSchema["kind"];
  def: string;
  options: string;
}

function Catalog() {
  const { world, dispatch } = useStore();
  const [editKey, setEditKey] = useState<string | null>(null); // key being edited, null = creating
  const [name, setName] = useState("");
  const [rtype, setRtype] = useState("");
  const [group, setGroup] = useState("CUSTOM");
  const [fields, setFields] = useState<FieldDraft[]>([{ label: "Display name", kind: "text", def: "", options: "" }]);

  const startEdit = (rt: ResourceType) => {
    setEditKey(rt.key);
    setName(rt.name);
    setRtype(rt.rtype);
    setGroup(rt.group);
    setFields(
      rt.fields.map((f) => ({
        label: f.label,
        kind: f.kind,
        def: String(f.def),
        options: f.options?.join(", ") ?? "",
      })),
    );
  };

  const clearForm = () => {
    setEditKey(null);
    setName("");
    setRtype("");
    setGroup("CUSTOM");
    setFields([{ label: "Display name", kind: "text", def: "", options: "" }]);
  };

  const save = () => {
    if (!name.trim() || !rtype.trim()) return;
    const rt: ResourceType = {
      key: editKey ?? `custom_${uid()}`,
      name: name.trim(),
      glyph: name.trim().slice(0, 2).toUpperCase(),
      rtype: rtype.trim(),
      group: group.trim().toUpperCase() || "CUSTOM",
      fields: fields
        .filter((f) => f.label.trim())
        .map((f, i) => ({
          // stable-ish key derived from the label; "name"/"prefix" keys get
          // special display treatment on canvas nodes
          key: f.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || `field_${i}`,
          label: f.label.trim(),
          kind: f.kind,
          options: f.kind === "select" ? f.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
          def: f.kind === "toggle" ? f.def === "true" : f.def,
        })),
    };
    dispatch({ type: "saveCustomType", rt });
    clearForm();
  };

  return (
    <div className={card}>
      <div className={cardTitle}>Service catalog</div>
      <div className="mb-3 text-[11px] text-[#7A8CA1]">
        Hide built-in services or add custom ones. Custom types generate HCL via the backend's generic
        template — add a dedicated template in backend/app.py for full attribute support.
      </div>

      <div className="mb-2 text-[10px] font-semibold tracking-[1px] text-[#93A3B6]">BUILT-IN · {resourceTypes.length}</div>
      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1">
        {resourceTypes.map((rt) => {
          const off = world.disabledTypes.includes(rt.key);
          return (
            <button
              key={rt.key}
              onClick={() => dispatch({ type: "toggleBuiltinType", key: rt.key })}
              title={off ? "Hidden from the catalog — click to enable" : "Click to hide from the catalog"}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[#F8FAFC]"
            >
              <div className={`h-[7px] w-[7px] rounded-full ${off ? "bg-[#C6D2DF]" : "bg-[#0FA79E]"}`} />
              <span className={`text-[12px] ${off ? "text-[#93A3B6] line-through" : "text-[#2C3D52]"}`}>{rt.name}</span>
              <span className="ml-auto text-[9.5px] text-[#B5C2D2]">{rt.group.toLowerCase()}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-2 text-[10px] font-semibold tracking-[1px] text-[#93A3B6]">CUSTOM · {world.customTypes.length}</div>
      {world.customTypes.length > 0 && (
        <div className="mb-3 flex flex-col gap-1">
          {world.customTypes.map((rt) => (
            <div key={rt.key} className="flex items-center gap-2 rounded-md border border-[#E9EFF5] px-2 py-1.5">
              <span className="text-[12px] font-medium text-[#2C3D52]">{rt.name}</span>
              <span className="font-mono text-[10px] text-[#7A8CA1]">{rt.rtype}</span>
              <span className="ml-auto text-[9.5px] text-[#B5C2D2]">{rt.group.toLowerCase()}</span>
              <button onClick={() => startEdit(rt)} className="cursor-pointer text-[11px] font-medium text-[#0B7D76] hover:underline">
                Edit
              </button>
              <button
                onClick={() => dispatch({ type: "removeCustomType", key: rt.key })}
                className="cursor-pointer text-[11px] font-medium text-[#B4514D] hover:underline"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit form */}
      <div className="rounded-md border border-dashed border-[#B4C4D6] p-3">
        <div className="mb-2 text-[11px] font-semibold text-[#41536A]">{editKey ? "Edit custom service" : "Add custom service"}</div>
        <div className="mb-2 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Service name (e.g. Streaming)" className={`flex-1 ${inputCls}`} />
          <input value={rtype} onChange={(e) => setRtype(e.target.value)} placeholder="oci_streaming_stream" className={`flex-1 font-mono ${inputCls}`} />
          <select value={group} onChange={(e) => setGroup(e.target.value)} className={`cursor-pointer ${inputCls}`}>
            {[...catalogGroups, "CUSTOM"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="mb-1 text-[10px] font-semibold tracking-[1px] text-[#93A3B6]">CONFIG FIELDS</div>
        {fields.map((f, i) => (
          <div key={i} className="mb-1.5 flex gap-1.5">
            <input
              value={f.label}
              onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              placeholder="Field label"
              className={`flex-1 ${inputCls}`}
            />
            <select
              value={f.kind}
              onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, kind: e.target.value as FieldDraft["kind"] } : x)))}
              className={`cursor-pointer ${inputCls}`}
            >
              <option value="text">text</option>
              <option value="select">select</option>
              <option value="toggle">toggle</option>
            </select>
            {f.kind === "select" && (
              <input
                value={f.options}
                onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, options: e.target.value } : x)))}
                placeholder="options, comma, separated"
                className={`flex-1 ${inputCls}`}
              />
            )}
            {f.kind === "toggle" ? (
              <select
                value={f.def}
                onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, def: e.target.value } : x)))}
                className={`cursor-pointer ${inputCls}`}
              >
                <option value="true">on</option>
                <option value="false">off</option>
              </select>
            ) : (
              <input
                value={f.def}
                onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, def: e.target.value } : x)))}
                placeholder="default"
                className={`w-[90px] ${inputCls}`}
              />
            )}
            <button
              onClick={() => setFields(fields.filter((_, j) => j !== i))}
              title="Remove field"
              className="cursor-pointer px-1 text-[13px] text-[#B4514D]"
            >
              ×
            </button>
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <button onClick={() => setFields([...fields, { label: "", kind: "text", def: "", options: "" }])} className={btnCls}>
            + field
          </button>
          <div className="ml-auto flex gap-2">
            {editKey && (
              <button onClick={clearForm} className={btnCls}>
                Cancel
              </button>
            )}
            <button
              onClick={save}
              className="cursor-pointer rounded-md bg-[#0FA79E] px-3.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[#0C8C85]"
            >
              {editKey ? "Save changes" : "Add to catalog"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Platform() {
  const [status, setStatus] = useState<{ connected: boolean; engine?: string; path?: string; updated_at?: string | null }>({ connected: false });

  // One-shot status fetch when the Admin screen mounts.
  useEffect(() => {
    fetch("/api/world/status", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d))
      .catch(() => {});
  }, []);

  return (
    <div className={card}>
      <div className={cardTitle}>Platform</div>
      <div className="flex flex-col gap-2.5 text-[12px]">
        <div className="flex items-start gap-2">
          <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${status?.connected ? "bg-[#0FA79E]" : "bg-[#C6D2DF]"}`} />
          <div>
            <div className="font-medium text-[#1E2B3C]">
              Database {status?.connected ? "connected" : "not reachable"}
            </div>
            <div className="text-[11px] text-[#7A8CA1]">
              {status?.connected ? (
                <>
                  {status.engine} · <span className="font-mono">{status.path}</span>
                  {status.updated_at ? ` · last saved ${new Date(status.updated_at).toLocaleTimeString()}` : " · nothing saved yet"}
                  <br />
                  The workspace auto-saves here on every change; localStorage is the offline fallback. Postgres
                  replaces SQLite when the backend is deployed.
                </>
              ) : (
                "Start the backend (uvicorn, see README) to persist the workspace to the database."
              )}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 border-t border-[#EFF3F8] pt-2.5">
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#E0912F]" />
          <div>
            <div className="font-medium text-[#1E2B3C]">Sign-in / OAuth — deferred (Phase 2)</div>
            <div className="text-[11px] text-[#7A8CA1]">
              Real per-user login (Google/GitHub OAuth) needs a deployed backend with a public redirect URL, a
              registered OAuth app, and server-side sessions — building it against localhost would be throwaway.
              Until then the top-bar "Acting as" switcher stands in, and roles gate the UI only.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
