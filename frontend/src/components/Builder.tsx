// Builder screen: the tab bar plus the Design tab (drawboard) defined below.
// The drawboard is three columns — service catalog (click to add), the canvas
// with draggable resource nodes, and the config panel for the selected node.
// Drawboard state lives in the shared store; code generation happens in
// CodeTab -> backend/app.py. The header's run actions (Validate / Plan /
// Destroy) go to the platform API (backend/api.py) for the matching stack,
// which executes real tofu runs through the containerized runner.

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { catalogGroups, resourceTypes, typeByKey, type ResourceInstance } from "../model";
import { useStore } from "../store";
import type { Tab } from "../App";
import {
  approveRun, authHeaders, canDeploy, canWork, generate, getRun, registerWorkspace, rejectRun, startRun, relTime,
  type ApiRun, type ApiStack, type Role, type RunMode,
} from "../api";
import CodeTab from "./CodeTab";
import PlanTab from "./PlanTab";
import DiagramTab from "./DiagramTab";
import ParamReference from "./ParamReference";

const TABS: { key: Tab; label: string }[] = [
  { key: "design", label: "Design" },
  { key: "opentofu", label: "OpenTofu" },
  { key: "plan", label: "Plan" },
  { key: "diagram", label: "Diagram" },
];

// Node card size on the canvas — edge endpoints are computed from these.
const NODE_W = 200;
const NODE_H = 88;

export default function Builder({
  tab, onTab, role, apiStack, runs, onChanged,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  role: Role;
  apiStack: ApiStack | null; // platform-API stack matching the drawboard stack, if any
  runs: ApiRun[];
  onChanged: () => void;
}) {
  const { client, stack, getType } = useStore();

  // Latest run for the matched stack; live-updated by polling while active.
  const [run, setRun] = useState<ApiRun | null>(null);
  // A launch failure (codegen down, registration rejected) shown in the header
  // so problems surface in the UI, not just the console.
  const [launchError, setLaunchError] = useState<string | null>(null);
  useEffect(() => {
    setRun(apiStack ? (runs.find((r) => r.stack_id === apiStack.id) ?? null) : null);
    // Keyed on the stack only: user actions replace `run` directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiStack?.id]);

  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const t = setInterval(async () => {
      const fresh = await getRun(run.id);
      if (fresh) {
        setRun(fresh);
        if (fresh.status !== "queued" && fresh.status !== "running") onChanged();
      }
    }, 1500);
    return () => clearInterval(t);
  }, [run, onChanged]);

  if (!stack) {
    return (
      <div className="flex flex-1 items-center justify-center text-[#7A8CA1]">
        This client has no stacks yet — add one with “+ new stack” in the sidebar.
      </div>
    );
  }

  // Project the current design (the JSON model, single source of truth) into
  // HCL and write it to the stack's workspace, one-way. Runs before every
  // launch so a run always reflects what's on the board — this is what makes
  // Plan a single click even for a design the platform hasn't seen yet.
  // Returns the (possibly newly created) stack id, or null on failure.
  const projectAndRegister = async (): Promise<number | null> => {
    const gen = await generate({
      client: client.name,
      stack: stack.name,
      env: stack.env,
      resources: stack.resources.map((r) => ({
        type: r.typeKey,
        config: r.config,
        rtype: getType(r.typeKey).rtype,
      })),
    });
    if (!gen) {
      setLaunchError("Code generation failed — is the codegen service running?");
      return null;
    }
    const reg = await registerWorkspace({
      client: client.name,
      stack: stack.name,
      env: stack.env,
      files: gen.files,
    });
    if (!reg) {
      setLaunchError("Could not register the workspace — check the platform API and your role.");
      return null;
    }
    return reg.id;
  };

  const launch = async (mode: RunMode) => {
    setLaunchError(null);
    if (mode === "destroy" && !window.confirm(`Plan a DESTROY of ${stack.name} (${stack.env})? Applying it will still require approval.`)) return;
    const stackId = await projectAndRegister();
    if (stackId === null) return; // error already surfaced
    const r = await startRun(stackId, mode);
    if (r) {
      setRun(r);
      onChanged();
      if (mode !== "validate") onTab("plan");
    } else {
      setLaunchError(`Could not start the ${mode} run — check the platform API and your role.`);
    }
  };

  const busy = run?.status === "queued" || run?.status === "running";
  const mayWork = canWork(role); // design, validate, plan, sync (not management)
  const mayDeploy = canDeploy(role); // apply/destroy (senior/admin)
  const canRun = !busy && mayWork;
  const runTitle = mayWork ? undefined : "Read-only: your role can view the design but not run it.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[46px] shrink-0 items-stretch gap-0.5 border-b border-[#E3EAF2] bg-white px-5">
        {TABS.map((tb) => (
          <button
            type="button"
            key={tb.key}
            onClick={() => onTab(tb.key)}
            aria-current={tab === tb.key ? "true" : undefined}
            className={`focus-ring -mb-px flex cursor-pointer items-center border-b-2 px-3.5 font-medium hover:text-[#0F1B2D] ${
              tab === tb.key ? "border-[#0FA79E] text-[#0F1B2D]" : "border-transparent text-[#7A8CA1]"
            }`}
          >
            {tb.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2.5">
          <div className="text-[11.5px] text-[#7A8CA1]" role="status">
            {launchError ? (
              <span className="font-medium text-[#B4514D]">{launchError}</span>
            ) : run ? (
              <>
                Run <span className="font-mono text-[#41536A]">#{run.id}</span> · {run.mode} ·{" "}
                <span
                  className="font-medium"
                  style={{
                    color:
                      run.status === "succeeded" ? "#0B7D76"
                      : run.status === "failed" ? "#B4514D"
                      : "#9A6B1F",
                  }}
                >
                  {busy ? `${run.status}…` : run.status.replace("_", " ")}
                </span>{" "}
                · {relTime(run.created_at)}
              </>
            ) : (
              <>
                {stack.resources.length} resource{stack.resources.length === 1 ? "" : "s"} on the board
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => launch("validate")}
            disabled={!canRun}
            title={runTitle}
            className="focus-ring cursor-pointer rounded-md border border-[#E3EAF2] px-3 py-1.5 font-medium text-[#41536A] hover:border-[#0FA79E] hover:text-[#0B7D76] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Validate
          </button>
          <button
            type="button"
            onClick={() => launch("plan")}
            disabled={!canRun}
            title={runTitle}
            className="focus-ring cursor-pointer rounded-md border border-[#E3EAF2] px-3 py-1.5 font-medium text-[#0B7D76] hover:border-[#0FA79E] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Plan
          </button>
          <button
            type="button"
            onClick={() => onTab("opentofu")}
            className="focus-ring cursor-pointer rounded-md bg-[#E0912F] px-3.5 py-[7px] font-semibold text-white shadow-[0_1px_2px_rgba(15,27,45,0.15)] hover:bg-[#CE8324]"
          >
            Generate OpenTofu
          </button>
          <button
            type="button"
            onClick={() => launch("destroy")}
            disabled={!canRun || !mayDeploy}
            title={mayDeploy ? runTitle : "Deploy actions (apply/destroy) require the senior or admin role."}
            className="focus-ring cursor-pointer rounded-md border border-[#F2DBDB] px-3 py-1.5 font-medium text-[#B4514D] hover:bg-[#FBF1F0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Destroy…
          </button>
        </div>
      </div>

      {tab === "design" && <DesignTab readOnly={!mayWork} />}
      {tab === "opentofu" && <CodeTab onRegistered={onChanged} canSync={mayWork} />}
      {tab === "plan" && (
        <PlanTab
          run={run}
          role={role}
          stackName={stack.name}
          onRequestApply={() => launch("apply")}
          onApprove={async () => {
            if (run) {
              const r = await approveRun(run.id);
              if (r) setRun(r);
            }
          }}
          onReject={async () => {
            if (run) {
              const r = await rejectRun(run.id);
              if (r) {
                setRun(r);
                onChanged();
              }
            }
          }}
        />
      )}
      {tab === "diagram" && <DiagramTab />}
    </div>
  );
}

function DesignTab({ readOnly }: { readOnly: boolean }) {
  const { world, stack, dispatch } = useStore();
  // Builder (the parent) already bailed out when there's no stack, so `!` is safe.
  const resources = stack!.resources;
  const selected = resources.find((r) => r.id === world.selNode) ?? null;

  // Edge-drawing state. `link` is set while the user is dragging from a node's
  // connect handle: `from` is the source resource, `x`/`y` track the cursor in
  // board coordinates so we can draw a live "ghost" arrow to it. Null = idle.
  const boardRef = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState<{ from: string; x: number; y: number } | null>(null);

  // Cursor position in board space (0..1100 x 0..600), independent of scroll —
  // node x/y are stored in this same space, so a plain rect subtraction lines up.
  const toBoard = (e: PointerEvent<HTMLDivElement>) => {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Begin dragging a new connection out of `fromId`'s handle. stopPropagation
  // keeps the node from starting a move-drag; capturing the pointer on the board
  // means move/up keep firing even as the cursor passes over other nodes.
  const startLink = (fromId: string, e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const p = toBoard(e);
    setLink({ from: fromId, x: p.x, y: p.y });
    try {
      boardRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // some synthetic pointer events have no active pointer to capture
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* Service catalog */}
      <div className="w-[232px] shrink-0 overflow-y-auto border-r border-[#E3EAF2] bg-white p-3.5">
        <div className="mb-0.5 font-display text-[13px] font-semibold text-[#0F1B2D]">Service catalog</div>
        {readOnly ? (
          <div className="mb-3 rounded-md bg-[#FAF0E0] px-2 py-1.5 text-[10.5px] leading-snug text-[#9A6B1F]">
            Read-only — your role can view the design but not edit it.
          </div>
        ) : (
          <div className="mb-3 text-[11px] text-[#7A8CA1]">Click a service to add it to the board</div>
        )}
        {!readOnly && <ImportEnvironment />}
        {/* Catalog = built-ins the admin hasn't disabled + admin-created custom
            types, grouped. Both kinds behave identically on the board. */}
        {(() => {
          const available = [
            ...resourceTypes.filter((rt) => !world.disabledTypes.includes(rt.key)),
            ...world.customTypes,
          ];
          const groups = [...catalogGroups.filter((g) => available.some((rt) => rt.group === g))];
          for (const rt of available) if (!groups.includes(rt.group)) groups.push(rt.group);
          return groups.map((grp) => (
          <div key={grp} className="mb-3.5">
            <div className="mb-1.5 text-[10px] font-semibold tracking-[1px] text-[#93A3B6]">{grp}</div>
            <div className="flex flex-col gap-1">
              {available
                .filter((rt) => rt.group === grp)
                .map((rt) => {
                  const used = resources.some((r) => r.typeKey === rt.key);
                  return (
                    <button
                      key={rt.key}
                      disabled={readOnly}
                      onClick={() => dispatch({ type: "addResource", typeKey: rt.key })}
                      className="group flex items-center gap-2 rounded-md border border-[#E9EFF5] bg-[#FCFDFE] px-[9px] py-[7px] text-left not-disabled:cursor-pointer hover:border-[#0FA79E] hover:shadow-[0_1px_3px_rgba(15,27,45,0.06)] disabled:opacity-60 disabled:hover:border-[#E9EFF5] disabled:hover:shadow-none"
                    >
                      <div className="text-[10px] tracking-[1px] text-[#C6D2DF] group-hover:hidden">⠿</div>
                      <div className={`hidden text-[11px] font-semibold text-[#0FA79E] ${readOnly ? "" : "group-hover:block"}`}>+</div>
                      <div className="text-[12px] font-medium text-[#2C3D52]">{rt.name}</div>
                      {used && <div className="ml-auto text-[11px] font-semibold text-[#0FA79E]">✓</div>}
                    </button>
                  );
                })}
            </div>
          </div>
          ));
        })()}
      </div>

      {/* Drawboard */}
      <div className="relative flex-1 overflow-auto bg-[#F5F8FB]">
        <div
          ref={boardRef}
          className="relative h-[600px] w-[1100px]"
          style={{ backgroundImage: "radial-gradient(#D8E2EC 1px, transparent 1px)", backgroundSize: "22px 22px" }}
          onPointerDown={(e) => {
            // Clicking empty board space (not a node) clears the selection.
            if (e.target === e.currentTarget) dispatch({ type: "selectNode", nodeId: null });
          }}
          onPointerMove={(e) => {
            // While dragging a connection, follow the cursor with the ghost arrow.
            if (link) setLink({ ...link, ...toBoard(e) });
          }}
          onPointerUp={(e) => {
            // Drop: if the cursor is over a different node, create the edge.
            if (!link) return;
            const p = toBoard(e);
            const target = resources.find(
              (r) => r.id !== link.from && p.x >= r.x && p.x <= r.x + NODE_W && p.y >= r.y && p.y <= r.y + NODE_H,
            );
            if (target) dispatch({ type: "addEdge", from: link.from, to: target.id });
            try {
              boardRef.current?.releasePointerCapture(e.pointerId);
            } catch {
              // capture may already be released; ignore
            }
            setLink(null);
          }}
        >
          {resources.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[#93A3B6]">
              Empty drawboard — click a service in the catalog to add your first resource.
            </div>
          )}
          <svg width="1100" height="600" className="pointer-events-none absolute inset-0">
            <defs>
              <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill="#9DB0C4" />
              </marker>
            </defs>
            {/* Arrows between nodes: a cubic bezier from A's right edge to
                B's left edge, recomputed from live positions so they follow
                dragged nodes. Drag a node's connect handle to add one; click an
                arrow to remove it (edit mode only). */}
            {stack!.edges.map(([from, to]) => {
              const A = resources.find((r) => r.id === from);
              const B = resources.find((r) => r.id === to);
              if (!A || !B) return null;
              const x1 = A.x + NODE_W, y1 = A.y + NODE_H / 2, x2 = B.x - 4, y2 = B.y + NODE_H / 2;
              const d = `M ${x1} ${y1} C ${x1 + 44} ${y1}, ${x2 - 44} ${y2}, ${x2} ${y2}`;
              return (
                <g key={`${from}-${to}`}>
                  <path d={d} fill="none" stroke="#9DB0C4" strokeWidth="1.5" markerEnd="url(#arr)" />
                  {/* Invisible fat overlay = a forgiving click target for delete.
                      pointerEvents:"stroke" re-enables hits the parent <svg> turned
                      off, but only along the line itself. */}
                  {!readOnly && (
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="14"
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onClick={() => dispatch({ type: "removeEdge", from, to })}
                    >
                      <title>Click to remove this connection</title>
                    </path>
                  )}
                </g>
              );
            })}
            {/* Ghost arrow shown while dragging a new connection out of a node. */}
            {link && (() => {
              const A = resources.find((r) => r.id === link.from);
              if (!A) return null;
              const x1 = A.x + NODE_W, y1 = A.y + NODE_H / 2;
              const d = `M ${x1} ${y1} C ${x1 + 44} ${y1}, ${link.x - 44} ${link.y}, ${link.x} ${link.y}`;
              return <path d={d} fill="none" stroke="#0FA79E" strokeWidth="1.5" strokeDasharray="5 3" markerEnd="url(#arr)" />;
            })()}
          </svg>
          {resources.map((nd) => (
            <CanvasNode
              key={nd.id}
              nd={nd}
              selected={world.selNode === nd.id}
              readOnly={readOnly}
              onLinkStart={startLink}
            />
          ))}
        </div>
      </div>

      {/* Config panel — only occupies space while a node is selected, and is
          closable, so the canvas gets full width when you're not configuring. */}
      {selected && (
        <div className="w-[296px] shrink-0 overflow-y-auto border-l border-[#E3EAF2] bg-white p-4">
          <ConfigPanel
            res={selected}
            readOnly={readOnly}
            onClose={() => dispatch({ type: "selectNode", nodeId: null })}
          />
        </div>
      )}
    </div>
  );
}

// "Import existing environment": adopt infrastructure that was built outside
// Kladen. Pick a .tfstate file — the Python backend (/api/import-state in
// backend/app.py) parses it and maps every recognizable OCI resource onto
// the drawboard model. From then on the imported stack is managed exactly
// like a hand-drawn one (config edits, codegen, plan...). Resources land on
// the CURRENT stack, so create/select an empty stack first for a clean adopt.
function ImportEnvironment() {
  const { dispatch } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      const state = JSON.parse(await file.text());
      const r = await fetch("/api/import-state", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ state }),
      });
      if (!r.ok) throw new Error(`import service returned ${r.status}`);
      const d: {
        resources: { type: string; config: Record<string, string | boolean> }[];
        absorbed: Record<string, number>;
        unsupported: Record<string, number>;
      } = await r.json();

      // Only types the drawboard knows can become nodes.
      const known = d.resources.filter((x) => typeByKey[x.type]);
      dispatch({ type: "importResources", resources: known.map((x) => ({ typeKey: x.type, config: x.config })) });

      const absorbedN = Object.values(d.absorbed).reduce((a, b) => a + b, 0);
      const unsupN = Object.values(d.unsupported).reduce((a, b) => a + b, 0);
      setStatus({
        ok: true,
        text:
          `Imported ${known.length} resource${known.length === 1 ? "" : "s"}` +
          (absorbedN ? ` · ${absorbedN} base-network item${absorbedN === 1 ? "" : "s"} absorbed` : "") +
          (unsupN ? ` · ${unsupN} unsupported: ${Object.keys(d.unsupported).join(", ")}` : ""),
      });
    } catch (err) {
      setStatus({ ok: false, text: `Import failed: ${err instanceof Error ? err.message : "invalid state file"}` });
    }
  };

  return (
    <div className="mb-3.5 border-b border-[#EFF3F8] pb-3.5">
      <input ref={fileRef} type="file" accept=".tfstate,.json,application/json" className="hidden" onChange={onFile} />
      <button
        onClick={() => fileRef.current?.click()}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[#B4C4D6] bg-[#F8FAFC] px-2 py-2 text-[12px] font-medium text-[#41536A] hover:border-[#0FA79E] hover:text-[#0B7D76]"
      >
        <span className="text-[13px]">⇪</span> Import existing environment
      </button>
      <div className="mt-1.5 text-[10px] leading-snug text-[#93A3B6]">
        Adopt infra built elsewhere: pick its .tfstate file and manage it from here on.
      </div>
      {status && (
        <div className={`mt-1.5 text-[10.5px] leading-snug ${status.ok ? "text-[#0B7D76]" : "text-[#B4514D]"}`}>
          {status.text}
        </div>
      )}
    </div>
  );
}

// One draggable resource card on the canvas. Drag works with raw pointer
// events: on pointer-down remember the offset between the cursor and the
// node's corner, then every pointer-move re-derives the node position from
// the cursor. Positions are clamped to the 1100x600 board.
function CanvasNode({
  nd, selected, readOnly, onLinkStart,
}: {
  nd: ResourceInstance;
  selected: boolean;
  readOnly: boolean;
  onLinkStart: (fromId: string, e: PointerEvent<HTMLDivElement>) => void; // start drawing an edge from this node
}) {
  const { getType, dispatch } = useStore();
  const rt = getType(nd.typeKey);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  // Card subtitle: the most name-like config value this type has.
  const label = String(nd.config.name ?? nd.config.prefix ?? nd.config.buckets ?? rt.name);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    dispatch({ type: "selectNode", nodeId: nd.id });
    if (readOnly) return; // read-only: select to inspect, but don't move
    drag.current = { dx: e.clientX - nd.x, dy: e.clientY - nd.y };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events may carry no active pointer — selection still works
    }
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const x = Math.max(0, Math.min(1100 - NODE_W, e.clientX - drag.current.dx));
    const y = Math.max(0, Math.min(600 - NODE_H, e.clientY - drag.current.dy));
    dispatch({ type: "moveResource", resId: nd.id, x, y });
  };
  const up = () => (drag.current = null);

  return (
    <div
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      className={`absolute w-[200px] touch-none rounded-lg border-[1.5px] bg-white px-3 py-2.5 select-none ${
        readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{
        left: nd.x,
        top: nd.y,
        borderColor: selected ? "#0FA79E" : "#E3EAF2",
        boxShadow: selected ? "0 3px 12px rgba(15,167,158,0.2)" : "0 1px 3px rgba(15,27,45,0.05)",
      }}
    >
      <div className="flex items-center gap-[9px]">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-[#E6F5F4] font-mono text-[11px] font-medium text-[#0B7D76]">
          {rt.glyph}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold text-[#0F1B2D]">{rt.name}</div>
          <div className="truncate font-mono text-[9.5px] text-[#7A8CA1]">{rt.rtype}</div>
        </div>
      </div>
      <div className="mt-2 truncate border-t border-[#EFF3F8] pt-1.5 text-[10.5px] text-[#5F7490]">{label}</div>
      {/* Connect handle: drag from this dot on the right edge to another node to
          draw an arrow. Hidden in read-only mode. Its own pointer-down starts the
          link (and stops the node from move-dragging) via onLinkStart. */}
      {!readOnly && (
        <div
          onPointerDown={(e) => onLinkStart(nd.id, e)}
          title="Drag to connect to another resource"
          className="absolute top-1/2 right-[-7px] h-3.5 w-3.5 -translate-y-1/2 cursor-crosshair touch-none rounded-full border-2 border-white bg-[#0FA79E] shadow-[0_1px_2px_rgba(15,27,45,0.25)] hover:scale-125"
        />
      )}
    </div>
  );
}

// Right-hand panel: renders one input per field in the selected resource's
// schema (see resourceTypes in model.ts) — text, dropdown, or toggle. Every
// change dispatches updateConfig, which is what codegen later reads. Below
// the editable fields sits the provider-docs parameter reference for the
// resource's rtype (required args, descriptions, examples).
function ConfigPanel({ res, readOnly, onClose }: { res: ResourceInstance; readOnly: boolean; onClose: () => void }) {
  const { getType, dispatch } = useStore();
  const rt = getType(res.typeKey);

  return (
    <>
      <div className="mb-0.5 flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[#E6F5F4] font-mono text-[11px] text-[#0B7D76]">
          {rt.glyph}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-[14px] font-semibold text-[#0F1B2D]">{rt.name}</div>
          <div className="truncate font-mono text-[10px] text-[#7A8CA1]">{rt.rtype}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close panel"
          aria-label="Close configuration panel"
          className="focus-ring ml-auto flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[15px] text-[#93A3B6] hover:bg-[#F0F4F9] hover:text-[#41536A]"
        >
          ×
        </button>
      </div>
      <div className="mt-3.5 mb-2.5 text-[10px] font-semibold tracking-[1px] text-[#93A3B6]">CONFIGURATION</div>
      <div className="flex flex-col gap-2.5">
        {rt.fields.map((f) => (
          <div key={f.key}>
            <div className="mb-1 text-[11px] font-medium text-[#5F7490]">{f.label}</div>
            {f.kind === "toggle" ? (
              <button
                disabled={readOnly}
                onClick={() => dispatch({ type: "updateConfig", resId: res.id, key: f.key, value: !res.config[f.key] })}
                className="flex items-center gap-2 not-disabled:cursor-pointer disabled:opacity-60"
              >
                <div
                  className="relative h-[18px] w-8 shrink-0 rounded-[9px] transition-colors"
                  style={{ background: res.config[f.key] ? "#0FA79E" : "#C6D2DF" }}
                >
                  <div
                    className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(15,27,45,0.25)] transition-all"
                    style={{ left: res.config[f.key] ? 16 : 2 }}
                  />
                </div>
                <div className="text-[12px] text-[#2C3D52]">{res.config[f.key] ? "Enabled" : "Disabled"}</div>
              </button>
            ) : f.kind === "select" ? (
              <select
                value={String(res.config[f.key])}
                disabled={readOnly}
                onChange={(e) => dispatch({ type: "updateConfig", resId: res.id, key: f.key, value: e.target.value })}
                className="w-full rounded-md border border-[#E3EAF2] bg-[#FCFDFE] px-2.5 py-[7px] font-mono text-[12px] text-[#1E2B3C] outline-none not-disabled:cursor-pointer focus:border-[#0FA79E] disabled:opacity-60"
              >
                {f.options!.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                value={String(res.config[f.key])}
                disabled={readOnly}
                onChange={(e) => dispatch({ type: "updateConfig", resId: res.id, key: f.key, value: e.target.value })}
                className="w-full rounded-md border border-[#E3EAF2] bg-[#FCFDFE] px-2.5 py-[7px] font-mono text-[12px] text-[#1E2B3C] outline-none focus:border-[#0FA79E] disabled:opacity-60"
              />
            )}
          </div>
        ))}
      </div>
      <ParamReference rtype={rt.rtype} />
      {!readOnly && (
        <div className="mt-[18px] flex gap-2 border-t border-[#EFF3F8] pt-3">
          <button
            type="button"
            onClick={() => dispatch({ type: "duplicateResource", resId: res.id })}
            className="focus-ring flex-1 cursor-pointer rounded-md border border-[#E3EAF2] py-[7px] text-center font-medium text-[#41536A] hover:border-[#0FA79E] hover:text-[#0B7D76]"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "removeResource", resId: res.id })}
            className="focus-ring flex-1 cursor-pointer rounded-md border border-[#F2DBDB] py-[7px] text-center font-medium text-[#B4514D] hover:bg-[#FBF1F0]"
          >
            Remove
          </button>
        </div>
      )}
    </>
  );
}
