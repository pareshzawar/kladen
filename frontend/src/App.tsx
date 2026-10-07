// App shell: gates on a real login, then renders the sidebar, the top bar
// (breadcrumb + signed-in identity), and the active screen. The drawboard world
// (clients, stacks, resources) lives in store.tsx; the platform API supplies
// runs, approvals, profiles and the authenticated session. The signed-in user's
// role drives what's visible and permitted here; the backend enforces it too.

import { useCallback, useEffect, useMemo, useState } from "react";
import { StoreProvider, useStore } from "./store";
import {
  ALL_ROLES, canDeploy, getBootstrap, getMe, logout, setAuthLostHandler,
  type AuthUser, type Bootstrap, type Role,
} from "./api";
import type { Screen, Tab } from "./data";
import Sidebar from "./components/Sidebar";
import Builder from "./components/Builder";
import Dashboard from "./components/Dashboard";
import Drift from "./components/Drift";
import Admin from "./components/Admin";
import Profiles from "./components/Profiles";
import Login from "./components/Login";

export type { Screen, Tab } from "./data";

export default function App() {
  const [session, setSession] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setAuthLostHandler(() => setSession(null));
    void getMe().then((u) => {
      setSession(u);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return <div className="flex h-screen items-center justify-center bg-[#0F1B2D] text-[13px] text-[#7A8CA1]">Loading…</div>;
  }
  if (!session) return <Login onLogin={setSession} />;

  return (
    <StoreProvider>
      <Shell session={session} onSignOut={() => setSession(null)} />
    </StoreProvider>
  );
}

function Shell({ session, onSignOut }: { session: AuthUser; onSignOut: () => void }) {
  const [screen, setScreen] = useState<Screen>("builder");
  const [tab, setTab] = useState<Tab>("design");
  const { client, stack, world, dispatch } = useStore();

  // Admins can preview any role's UI without logging out ("view as"). This only
  // changes what the UI shows; the backend still enforces the real admin role,
  // and since admin can do everything, a preview never triggers a 403.
  const [viewAs, setViewAs] = useState<Role>(session.role);
  const isAdmin = session.role === "admin";
  const role = isAdmin ? viewAs : session.role;
  const previewing = isAdmin && viewAs !== "admin";

  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const reload = useCallback(async () => setBoot(await getBootstrap()), []);
  useEffect(() => {
    void reload();
  }, [reload]);

  // Per-customer isolation on the drawboard: a customer-scoped user (client_id
  // set) may only see their own client. The platform API already scopes runs/
  // profiles/users; the design world comes from the (unauthenticated) codegen
  // service, so we filter it here by the client names the scoped bootstrap
  // returned. null = workspace-wide user (super-admin/staff) → see everything.
  const allowedClients: string[] | null = useMemo(
    () => (session.client_id != null ? (boot?.clients.map((c) => c.name) ?? []) : null),
    [session.client_id, boot],
  );

  // If a scoped user's currently-selected client is out of scope, jump them to
  // their own client so the header/canvas never show another customer's design.
  useEffect(() => {
    if (!allowedClients) return;
    if (allowedClients.includes(client.name)) return;
    const target = world.clients.find((c) => allowedClients.includes(c.name));
    if (target?.stacks[0]) dispatch({ type: "selectStack", clientId: target.id, stackId: target.stacks[0].id });
  }, [allowedClients, client.name, world.clients, dispatch]);

  // The drawboard world and the platform API both know clients/stacks; until
  // codegen registers workspaces through the API, they are joined by name.
  const apiStack =
    boot?.clients.find((c) => c.name === client.name)?.stacks.find((s) => s.name === stack?.name) ?? null;

  // Screen access by role: Profiles = senior/admin (credentials); Admin =
  // admin. Everything else (dashboard, builder, drift) is open to all roles,
  // with the Builder itself read-only for management. Bounce to the dashboard
  // if the current screen isn't allowed (e.g. after switching the previewed role).
  const canSee = (s: Screen): boolean =>
    s === "profiles" ? canDeploy(role) : s === "admin" ? role === "admin" : true;
  const effectiveScreen = canSee(screen) ? screen : "dashboard";

  const signOut = async () => {
    await logout();
    onSignOut();
  };

  return (
    <div className="flex h-screen min-w-[1280px] overflow-hidden bg-[#F5F8FB] font-sans text-[13px] text-[#1E2B3C]">
      <Sidebar screen={effectiveScreen} onScreen={setScreen} role={role} userName={session.name} allowedClients={allowedClients} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[#E3EAF2] bg-white px-5">
          <div className="flex items-center gap-2 font-medium text-[#41536A]">
            <span>{client.name}</span>
            <span className="text-[#B5C2D2]">/</span>
            <span className="font-mono text-[12px] text-[#1E2B3C]">{stack?.name ?? "no stack"}</span>
            {stack && (
              <span
                className={`ml-1 rounded-[10px] px-[9px] py-[3px] text-[10.5px] font-semibold ${
                  stack.env === "production" ? "bg-[#E6F5F4] text-[#0B7D76]" : "bg-[#F0F4F9] text-[#5F7490]"
                }`}
              >
                {stack.env}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {boot ? (
              <div
                className="flex items-center gap-1.5 rounded-md bg-[#E6F5F4] px-2.5 py-[5px] text-[11.5px] font-medium text-[#0B7D76]"
                title={boot.store === "oracle" ? "Metadata store: Autonomous DB" : "Metadata store: local SQLite"}
              >
                <div className="h-1.5 w-1.5 rounded-full bg-[#0FA79E]" />
                API · {boot.store === "oracle" ? "ATP" : "SQLite"}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-md bg-[#F0F4F9] px-2.5 py-[5px] text-[11.5px] font-medium text-[#7A8CA1]">
                <div className="h-1.5 w-1.5 rounded-full bg-[#B5C2D2]" />
                Platform API offline
              </div>
            )}
            {/* Admin demo tool: preview another role's UI. */}
            {isAdmin && (
              <label
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                  previewing ? "border-[#E0912F] bg-[#FAF0E0] text-[#9A6B1F]" : "border-[#E3EAF2] bg-[#F8FAFC] text-[#7A8CA1]"
                }`}
                title="Preview the UI as another role (admin only). The backend still enforces your real admin role."
              >
                View as
                <select
                  value={viewAs}
                  onChange={(e) => setViewAs(e.target.value as Role)}
                  className="focus-ring cursor-pointer rounded border border-[#E3EAF2] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[#41536A] capitalize"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {/* Signed-in identity. The role shown is the effective (previewed)
                role; the backend always enforces the real one. */}
            <div className="flex items-center gap-2 rounded-md border border-[#E3EAF2] bg-[#F8FAFC] py-1 pr-1 pl-2.5">
              <span className="text-[11.5px] font-medium text-[#41536A]">{session.name}</span>
              <span className="rounded-[5px] bg-[#E6F5F4] px-[7px] py-px text-[10px] font-semibold text-[#0B7D76] capitalize">
                {role}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="focus-ring cursor-pointer rounded-[5px] border border-[#E3EAF2] bg-white px-2 py-0.5 text-[11px] font-medium text-[#7A8CA1] hover:border-[#B4514D] hover:text-[#B4514D]"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>

        {effectiveScreen === "builder" && (
          <Builder tab={tab} onTab={setTab} role={role} apiStack={apiStack} runs={boot?.runs ?? []} onChanged={reload} />
        )}
        {effectiveScreen === "dashboard" && <Dashboard boot={boot} />}
        {effectiveScreen === "drift" && <Drift boot={boot} role={role} onChanged={reload} />}
        {effectiveScreen === "profiles" && <Profiles boot={boot} onChanged={reload} />}
        {effectiveScreen === "admin" && <Admin boot={boot} onChanged={reload} />}
      </div>
    </div>
  );
}
