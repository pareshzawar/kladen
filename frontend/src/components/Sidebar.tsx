// Left navigation: screen switcher, the client -> stack tree, and the
// "+" affordances for creating clients and stacks. Which client sections
// are expanded is purely visual, so it stays in local component state;
// the clients/stacks themselves live in the shared store.

import { useState, type KeyboardEvent } from "react";
import { navItems, type Screen } from "../data";
import { useStore } from "../store";
import { canDeploy, type Role } from "../api";

// Tiny inline text input used for "add client" / "add stack":
// Enter submits, Escape or clicking elsewhere cancels.
function AddInput({ placeholder, onSubmit, onCancel }: { placeholder: string; onSubmit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState("");
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && v.trim()) onSubmit(v.trim());
    if (e.key === "Escape") onCancel();
  };
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={key}
      onBlur={onCancel}
      placeholder={placeholder}
      className="mx-2 my-1 rounded-md border border-[#2A3D5C] bg-[#152238] px-2 py-1.5 text-[12px] text-[#E7EDF5] outline-none placeholder:text-[#5A6D85] focus:border-[#0FA79E]"
    />
  );
}

export default function Sidebar({
  screen, onScreen, role, userName, allowedClients,
}: {
  screen: Screen;
  onScreen: (s: Screen) => void;
  role: Role;
  userName: string;
  allowedClients: string[] | null; // customer-scoped users see only these client names; null = all
}) {
  const { world, dispatch } = useStore();
  // Per-customer isolation: hide clients outside a scoped user's tenant so no
  // other customer's name/design is visible. Workspace users (null) see all.
  const clients = allowedClients
    ? world.clients.filter((c) => allowedClients.includes(c.name))
    : world.clients;
  const scoped = allowedClients != null;
  const [open, setOpen] = useState<Record<string, boolean>>({ acme: true });
  const [addingClient, setAddingClient] = useState(false);
  const [addingStackFor, setAddingStackFor] = useState<string | null>(null);

  return (
    <div className="flex w-[250px] shrink-0 flex-col bg-[#0F1B2D] text-[#AFBDD0]">
      <div className="flex items-center gap-2.5 px-[18px] pt-[18px] pb-3.5">
        <div className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[#0FA79E] font-display text-[13px] font-semibold text-[#08201E]">
          K
        </div>
        <div className="font-display text-[17px] font-semibold tracking-[0.2px] text-white">Kladen</div>
        <div className="ml-auto font-mono text-[10px] text-[#4E6178]">v1.4</div>
      </div>

      <div className="flex flex-col gap-0.5 px-2.5 pt-1 pb-3">
        {/* Profiles (credentials) is senior/admin only; Admin is admin only. */}
        {[
          ...navItems.filter((nv) => nv.key !== "profiles" || canDeploy(role)),
          ...(role === "admin" ? [{ key: "admin" as const, label: "Admin", badge: undefined }] : []),
        ].map((nv) => {
          const active = screen === nv.key;
          return (
            <button
              type="button"
              key={nv.key}
              onClick={() => onScreen(nv.key)}
              aria-current={active ? "page" : undefined}
              className={`focus-ring flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left font-medium hover:bg-[#1A2A42] ${
                active ? "bg-[#1C2C45] text-white" : "text-[#AFBDD0]"
              }`}
            >
              <span className={`h-3.5 w-[3px] rounded-sm ${active ? "bg-[#0FA79E]" : "bg-transparent"}`} />
              <span>{nv.label}</span>
              {nv.badge && (
                <span className="ml-auto rounded-[9px] bg-[rgba(224,145,47,0.18)] px-[7px] py-0.5 text-[10px] font-semibold text-[#E8A857]">
                  {nv.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center px-[18px] py-1.5">
        <span className="text-[10px] font-semibold tracking-[1.2px] text-[#5A6D85]">
          {scoped ? "YOUR CLIENT" : "CLIENTS"}
        </span>
        {/* Only workspace (super-admin/staff) users can create new clients. */}
        {!scoped && (
          <button
            type="button"
            onClick={() => setAddingClient(true)}
            title="Add client"
            className="focus-ring ml-auto cursor-pointer rounded px-1.5 text-[13px] leading-none text-[#5A6D85] hover:bg-[#1A2A42] hover:text-[#8FDBD5]"
          >
            +
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-2.5">
        {addingClient && (
          <AddInput
            placeholder="New client name…"
            onSubmit={(name) => {
              dispatch({ type: "addClient", name });
              setAddingClient(false);
            }}
            onCancel={() => setAddingClient(false)}
          />
        )}
        {clients.map((cl) => (
          <div key={cl.id} className="mb-0.5">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [cl.id]: !o[cl.id] }))}
              aria-expanded={!!open[cl.id]}
              className="focus-ring flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-[7px] text-left font-medium text-[#D5DEEA] hover:bg-[#1A2A42]"
            >
              <span aria-hidden="true" className="w-2.5 text-[9px] text-[#5A6D85]">
                {open[cl.id] ? "▾" : "▸"}
              </span>
              <span>{cl.name}</span>
              <span className="ml-auto text-[10px] text-[#5A6D85]">
                {cl.stacks.length} stack{cl.stacks.length === 1 ? "" : "s"}
              </span>
            </button>
            {open[cl.id] && (
              <div className="flex flex-col gap-px pt-0.5 pb-1">
                {cl.stacks.map((st) => {
                  const sel = world.selClient === cl.id && world.selStack === st.id;
                  return (
                    <button
                      type="button"
                      key={st.id}
                      onClick={() => {
                        dispatch({ type: "selectStack", clientId: cl.id, stackId: st.id });
                        onScreen("builder");
                      }}
                      aria-current={sel ? "true" : undefined}
                      className={`focus-ring ml-[18px] flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[#1A2A42] ${
                        sel ? "bg-[rgba(15,167,158,0.14)] text-[#8FDBD5]" : "text-[#8FA3BA]"
                      }`}
                    >
                      <span className={`h-[7px] w-[7px] rounded-sm border-[1.5px] ${sel ? "border-[#0FA79E]" : "border-[#4E6178]"}`} />
                      <span className="font-mono text-[11.5px]">{st.name}</span>
                      <span className="ml-auto text-[9.5px] text-[#5A6D85]">{st.env}</span>
                    </button>
                  );
                })}
                {addingStackFor === cl.id ? (
                  <div className="ml-[18px]">
                    <AddInput
                      placeholder="stack-name (Enter)"
                      onSubmit={(name) => {
                        dispatch({ type: "addStack", clientId: cl.id, name, env: "dev" });
                        setAddingStackFor(null);
                        onScreen("builder");
                      }}
                      onCancel={() => setAddingStackFor(null)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingStackFor(cl.id)}
                    className="focus-ring ml-[18px] flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-[#5A6D85] hover:bg-[#1A2A42] hover:text-[#8FDBD5]"
                  >
                    + new stack
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer shows the signed-in user (sign out from the top bar). */}
      <div className="flex items-center gap-2.5 border-t border-[#1C2C45] px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#20405C] text-[11px] font-semibold text-[#9FD8D3]">
          {userName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-[12px] font-medium text-[#E7EDF5]">{userName}</div>
          <div className="text-[10.5px] text-[#5A6D85] capitalize">Meridian MSP · {role}</div>
        </div>
      </div>
    </div>
  );
}
