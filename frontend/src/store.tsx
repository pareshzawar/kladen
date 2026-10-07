// App-wide state: the client/stack/resource world, users, catalog edits,
// and current selection.
//
// How it works, if you're new to this pattern:
// - There is ONE state object (WorldState, defined in model.ts).
// - The only way to change it is to dispatch an Action; the reducer() below
//   is a big switch that returns a NEW state for each action type. That means
//   every mutation in the app is findable in this one file.
// - Components call useStore() to read state and dispatch changes.
//
// Persistence: every change is written to localStorage immediately (offline
// fallback) and to the backend's SQLite database (POST /api/world) after a
// short debounce. On startup we load localStorage synchronously, then ask
// the backend for its copy and adopt it if present — so the database is the
// source of truth whenever the backend is running.

import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { authHeaders } from "./api";
import {
  defaultConfig, initialWorld, normalizeWorld, typeByKey, uid,
  type ClientModel, type ConfigValue, type ResourceInstance, type ResourceType, type Role,
  type StackModel, type UserModel, type WorldState,
} from "./model";

const STORAGE_KEY = "kladen.world.v1";

type Action =
  | { type: "selectStack"; clientId: string; stackId: string }
  | { type: "selectNode"; nodeId: string | null }
  | { type: "addClient"; name: string }
  | { type: "addStack"; clientId: string; name: string; env: string }
  | { type: "addResource"; typeKey: string }
  | { type: "importResources"; resources: { typeKey: string; config: Record<string, ConfigValue> }[] }
  | { type: "updateConfig"; resId: string; key: string; value: ConfigValue }
  | { type: "moveResource"; resId: string; x: number; y: number }
  | { type: "removeResource"; resId: string }
  | { type: "duplicateResource"; resId: string }
  | { type: "addEdge"; from: string; to: string }
  | { type: "removeEdge"; from: string; to: string }
  | { type: "setActingUser"; userId: string }
  | { type: "addUser"; name: string; email: string; role: Role }
  | { type: "setUserRole"; userId: string; role: Role }
  | { type: "removeUser"; userId: string }
  | { type: "saveCustomType"; rt: ResourceType }
  | { type: "removeCustomType"; key: string }
  | { type: "toggleBuiltinType"; key: string }
  | { type: "hydrate"; world: WorldState }
  | { type: "resetWorld" };

const mapStack = (st: WorldState, fn: (s: StackModel) => StackModel): WorldState => ({
  ...st,
  clients: st.clients.map((c) =>
    c.id !== st.selClient ? c : { ...c, stacks: c.stacks.map((s) => (s.id === st.selStack ? fn(s) : s)) },
  ),
});

// Cascade new nodes across the free area of the 1100x600 board.
const nextPosition = (resources: ResourceInstance[]): { x: number; y: number } => {
  const i = resources.length;
  return { x: 34 + (i % 4) * 268, y: 96 + Math.floor(i / 4) * 150 };
};

// The last admin can never be demoted or removed — someone must hold the keys.
const otherAdminExists = (st: WorldState, userId: string): boolean =>
  st.users.some((u) => u.id !== userId && u.role === "admin");

function reducer(st: WorldState, a: Action): WorldState {
  switch (a.type) {
    case "selectStack":
      return { ...st, selClient: a.clientId, selStack: a.stackId, selNode: null };
    case "selectNode":
      return { ...st, selNode: a.nodeId };
    case "addClient": {
      const client: ClientModel = { id: uid(), name: a.name, stacks: [] };
      return { ...st, clients: [...st.clients, client], selClient: client.id };
    }
    case "addStack": {
      const stack: StackModel = { id: uid(), name: a.name, env: a.env, resources: [], edges: [] };
      return {
        ...st,
        clients: st.clients.map((c) => (c.id === a.clientId ? { ...c, stacks: [...c.stacks, stack] } : c)),
        selClient: a.clientId,
        selStack: stack.id,
        selNode: null,
      };
    }
    case "addResource": {
      const id = uid();
      const next = mapStack(st, (s) => ({
        ...s,
        resources: [...s.resources, { id, typeKey: a.typeKey, ...nextPosition(s.resources), config: defaultConfig(a.typeKey, st.customTypes) }],
      }));
      return { ...next, selNode: id };
    }
    case "importResources": {
      // Bulk add from a parsed tfstate (see backend /api/import-state).
      return mapStack(st, (s) => {
        const added: ResourceInstance[] = [];
        for (const r of a.resources) {
          added.push({
            id: uid(),
            typeKey: r.typeKey,
            ...nextPosition([...s.resources, ...added]),
            config: { ...defaultConfig(r.typeKey, st.customTypes), ...r.config },
          });
        }
        return { ...s, resources: [...s.resources, ...added] };
      });
    }
    case "updateConfig":
      return mapStack(st, (s) => ({
        ...s,
        resources: s.resources.map((r) => (r.id === a.resId ? { ...r, config: { ...r.config, [a.key]: a.value } } : r)),
      }));
    case "moveResource":
      return mapStack(st, (s) => ({
        ...s,
        resources: s.resources.map((r) => (r.id === a.resId ? { ...r, x: a.x, y: a.y } : r)),
      }));
    case "removeResource": {
      const next = mapStack(st, (s) => ({
        ...s,
        resources: s.resources.filter((r) => r.id !== a.resId),
        edges: s.edges.filter(([f, t]) => f !== a.resId && t !== a.resId),
      }));
      return { ...next, selNode: next.selNode === a.resId ? null : next.selNode };
    }
    case "duplicateResource": {
      const id = uid();
      const next = mapStack(st, (s) => {
        const src = s.resources.find((r) => r.id === a.resId);
        if (!src) return s;
        return {
          ...s,
          resources: [...s.resources, { ...src, id, x: Math.min(src.x + 40, 880), y: Math.min(src.y + 40, 500), config: { ...src.config } }],
        };
      });
      return { ...next, selNode: id };
    }
    case "addEdge": {
      // Draw a directed arrow between two distinct resources. Reject self-loops
      // and a duplicate of an arrow that already runs the same direction; the
      // reverse direction (B->A when A->B exists) is a different arrow, allowed.
      if (a.from === a.to) return st;
      return mapStack(st, (s) =>
        s.edges.some(([f, t]) => f === a.from && t === a.to)
          ? s
          : { ...s, edges: [...s.edges, [a.from, a.to]] },
      );
    }
    case "removeEdge":
      // Drop exactly the clicked arrow (this direction only).
      return mapStack(st, (s) => ({
        ...s,
        edges: s.edges.filter(([f, t]) => !(f === a.from && t === a.to)),
      }));
    case "setActingUser":
      return st.users.some((u) => u.id === a.userId) ? { ...st, actingUser: a.userId } : st;
    case "addUser":
      return { ...st, users: [...st.users, { id: uid(), name: a.name, email: a.email, role: a.role }] };
    case "setUserRole": {
      const target = st.users.find((u) => u.id === a.userId);
      if (!target) return st;
      if (target.role === "admin" && a.role !== "admin" && !otherAdminExists(st, a.userId)) return st;
      return { ...st, users: st.users.map((u) => (u.id === a.userId ? { ...u, role: a.role } : u)) };
    }
    case "removeUser": {
      const target = st.users.find((u) => u.id === a.userId);
      if (!target) return st;
      if (target.role === "admin" && !otherAdminExists(st, a.userId)) return st;
      const users = st.users.filter((u) => u.id !== a.userId);
      return {
        ...st,
        users,
        // if you delete the user you're acting as, fall back to an admin
        actingUser: st.actingUser === a.userId ? (users.find((u) => u.role === "admin") ?? users[0]).id : st.actingUser,
      };
    }
    case "saveCustomType": {
      // upsert by key: editing an existing custom type replaces it
      const exists = st.customTypes.some((t) => t.key === a.rt.key);
      return {
        ...st,
        customTypes: exists ? st.customTypes.map((t) => (t.key === a.rt.key ? a.rt : t)) : [...st.customTypes, a.rt],
      };
    }
    case "removeCustomType":
      return { ...st, customTypes: st.customTypes.filter((t) => t.key !== a.key) };
    case "toggleBuiltinType":
      return {
        ...st,
        disabledTypes: st.disabledTypes.includes(a.key)
          ? st.disabledTypes.filter((k) => k !== a.key)
          : [...st.disabledTypes, a.key],
      };
    case "hydrate":
      return a.world;
    case "resetWorld":
      return initialWorld;
  }
}

function loadInitial(): WorldState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeWorld(JSON.parse(raw));
  } catch {
    // corrupt state — fall through to the seed
  }
  return initialWorld;
}

export interface Store {
  world: WorldState;
  client: ClientModel;
  stack: StackModel | undefined; // a brand-new client has no stacks yet
  user: UserModel; // the acting user; user.role drives all permission checks
  getType: (key: string) => ResourceType; // built-in or admin-created catalog entry
  dispatch: (a: Action) => void;
}

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [world, dispatch] = useReducer(reducer, undefined, loadInitial);

  // On startup, adopt the backend's copy of the world if it has one —
  // the SQLite database is the source of truth when the backend is up.
  useEffect(() => {
    fetch("/api/world", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.world) dispatch({ type: "hydrate", world: normalizeWorld(d.world) });
      })
      .catch(() => {
        // backend not running — localStorage copy stays authoritative
      });
  }, []);

  // Persist every change: localStorage right away, backend after a debounce
  // so fast interactions (dragging a node) don't spam the API.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(world));
    const t = setTimeout(() => {
      fetch("/api/world", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ world }),
      }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [world]);

  const store = useMemo<Store>(() => {
    const client = world.clients.find((c) => c.id === world.selClient) ?? world.clients[0];
    const stack = client.stacks.find((s) => s.id === world.selStack) ?? client.stacks[0];
    const user = world.users.find((u) => u.id === world.actingUser) ?? world.users[0];
    const getType = (key: string): ResourceType =>
      typeByKey[key] ??
      world.customTypes.find((t) => t.key === key) ??
      // a node whose custom type was deleted still renders instead of crashing
      ({ key, name: key, glyph: "??", rtype: "unknown", group: "CUSTOM", fields: [] } as ResourceType);
    return { world, client, stack, user, getType, dispatch };
  }, [world]);

  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
