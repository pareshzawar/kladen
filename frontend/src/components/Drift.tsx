// Drift & reporting screen. The "Drift checks" panel at the top is REAL
// (Phase 3 — Monitor): it runs `tofu plan -refresh-only` per stack and reports
// live infra vs recorded state. The sections below (alert cards, run history,
// cost bars, resource summary) are still demo data from data.ts.

import { useMemo, useState } from "react";
import { costs, drifts, resSummary, runs } from "../data";
import { canWork, getRun, startRun, type ApiStack, type Bootstrap, type Role } from "../api";
import PostureReport from "./PostureReport";

// Column widths for the run-history table (header and rows must match).
const HIST_COLS = "64px 1.5fr 70px 110px 130px 100px";

// Per-stack drift-check state, keyed by stack id.
type CheckState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "clean"; runId: number }
  | { state: "drift"; drifted: number; runId: number }
  | { state: "error"; runId?: number };

export default function Drift({ boot, role, onChanged }: { boot: Bootstrap | null; role: Role; onChanged: () => void }) {
  const [showReport, setShowReport] = useState(false);
  return (
    <div className="flex-1 overflow-auto px-6 py-5">
      {showReport && boot && <PostureReport boot={boot} onClose={() => setShowReport(false)} />}
      <div className="flex items-center gap-2.5">
        <div className="font-display text-[17px] font-semibold text-[#0F1B2D]">Drift &amp; reporting</div>
        <div className="text-[11px] text-[#7A8CA1]">Refresh-only plan compares live infra to recorded state</div>
        <button
          type="button"
          disabled={!boot}
          onClick={() => setShowReport(true)}
          className="focus-ring ml-auto cursor-pointer rounded-md border border-[#E3EAF2] bg-white px-3 py-1.5 font-medium text-[#41536A] hover:border-[#0FA79E] hover:text-[#0B7D76] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export posture report
        </button>
      </div>

      <DriftChecks boot={boot} role={role} onChanged={onChanged} />

      <div className="mt-5 mb-1.5 text-[10px] font-semibold tracking-[1px] text-[#93A3B6]">
        SAMPLE ALERTS, RUN HISTORY & COST — DEMO DATA
      </div>
      <div className="mt-1 grid grid-cols-[1.5fr_1fr] gap-3.5">
        <div className="flex flex-col gap-3">
          {drifts.map((d) => (
            <div
              key={d.res}
              className="rounded-[10px] border border-[#E3EAF2] bg-white px-4 py-[15px]"
              style={{ borderLeft: `3px solid ${d.sevColor}` }}
            >
              <div className="flex items-center gap-[9px]">
                <div
                  className="rounded-[5px] px-2 py-[3px] text-[10px] font-semibold tracking-[0.5px]"
                  style={{ color: d.sevColor, background: d.sevBg }}
                >
                  {d.sev}
                </div>
                <div className="font-mono text-[12px] font-medium text-[#0F1B2D]">{d.res}</div>
                <div className="ml-auto text-[11px] text-[#93A3B6]">{d.when}</div>
              </div>
              <div className="mt-[9px] mb-[3px] text-[12px] text-[#41536A]">{d.desc}</div>
              <div className="font-mono text-[11px] text-[#7A8CA1]">{d.diff}</div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="focus-ring cursor-pointer rounded-md bg-[#0FA79E] px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[#0C8C85]"
                >
                  Reconcile (plan)
                </button>
                <button
                  type="button"
                  className="focus-ring cursor-pointer rounded-md border border-[#E3EAF2] px-3 py-1.5 text-[11.5px] font-medium text-[#41536A] hover:border-[#0FA79E] hover:text-[#0B7D76]"
                >
                  Accept as baseline
                </button>
                <button
                  type="button"
                  className="focus-ring cursor-pointer rounded-md border border-[#E3EAF2] px-3 py-1.5 text-[11.5px] font-medium text-[#41536A] hover:border-[#0FA79E] hover:text-[#0B7D76]"
                >
                  View diff
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
            <div className="mb-2.5 font-display text-[13.5px] font-semibold text-[#0F1B2D]">Run history · last 30 days</div>
            <div
              className="grid gap-2 px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.8px] text-[#93A3B6]"
              style={{ gridTemplateColumns: HIST_COLS }}
            >
              <div>RUN</div>
              <div>CLIENT / STACK</div>
              <div>TYPE</div>
              <div>CHANGES</div>
              <div>STATUS</div>
              <div>WHEN</div>
            </div>
            {runs.map((r) => (
              <div
                key={r.id}
                className="grid items-center gap-2 border-t border-[#EFF3F8] px-2.5 py-[9px] text-[12px]"
                style={{ gridTemplateColumns: HIST_COLS }}
              >
                <div className="font-mono text-[#41536A]">{r.id}</div>
                <div className="font-medium text-[#1E2B3C]">{r.target}</div>
                <div className="font-mono text-[11px] text-[#5F7490]">{r.type}</div>
                <div className="font-mono text-[11px] text-[#5F7490]">{r.changes}</div>
                <div>
                  <span
                    className="rounded-[10px] px-[9px] py-[3px] text-[10.5px] font-semibold"
                    style={{ color: r.stColor, background: r.stBg }}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="text-[#7A8CA1]">{r.when}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
            <div className="font-display text-[13.5px] font-semibold text-[#0F1B2D]">Estimated monthly cost</div>
            <div className="mt-0.5 mb-3.5 text-[11px] text-[#7A8CA1]">From OCI rate card · all managed resources</div>
            <div className="flex flex-col gap-3">
              {costs.map((c) => (
                <div key={c.name}>
                  <div className="mb-[5px] flex justify-between text-[12px]">
                    <span className="font-medium text-[#1E2B3C]">{c.name}</span>
                    <span className="font-mono text-[#41536A]">{c.amount}</span>
                  </div>
                  <div className="h-[7px] rounded bg-[#EFF3F8]">
                    <div className="h-[7px] rounded bg-[#0FA79E]" style={{ width: `${c.pct}%` }} />
                  </div>
                  <div className="mt-[3px] text-[10.5px] text-[#93A3B6]">{c.delta}</div>
                </div>
              ))}
            </div>
            <div className="mt-3.5 flex justify-between border-t border-[#EFF3F8] pt-2.5 text-[12.5px]">
              <span className="text-[#7A8CA1]">Total</span>
              <span className="font-mono font-medium text-[#0F1B2D]">$12,935 / mo</span>
            </div>
          </div>

          <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
            <div className="mb-2.5 font-display text-[13.5px] font-semibold text-[#0F1B2D]">Resource summary</div>
            <div className="flex flex-col gap-2">
              {resSummary.map((rs) => (
                <div key={rs.type} className="flex justify-between border-b border-[#F4F7FA] pb-[7px] text-[12px]">
                  <span className="font-mono text-[11.5px] text-[#41536A]">{rs.type}</span>
                  <span className="font-semibold text-[#0F1B2D]">{rs.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Human-friendly cadence label for the auto-drift interval (seconds).
const fmtInterval = (s: number) => (s % 3600 === 0 ? `${s / 3600} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${s}s`);

// Chip styling per drift-check outcome (colour + word, so it reads without colour).
const CHIP: Record<string, { c: string; bg: string }> = {
  clean: { c: "#0B7D76", bg: "#E6F5F4" },
  drift: { c: "#B4514D", bg: "#FBF1F0" },
  error: { c: "#9A6B1F", bg: "#FAF0E0" },
  running: { c: "#5F7490", bg: "#F0F4F9" },
};

/** Real per-stack drift checks (Phase 3 — Monitor). "Check now" starts a
 *  `tofu plan -refresh-only` run and polls it: clean = live matches state,
 *  drift = N resources changed out of band, error = the check couldn't run
 *  (e.g. the stack was never applied, so there's no state to compare). */
function DriftChecks({ boot, role, onChanged }: { boot: Bootstrap | null; role: Role; onChanged: () => void }) {
  const [checks, setChecks] = useState<Record<number, CheckState>>({});
  const mayCheck = canWork(role); // junior/senior/admin can trigger; management views only

  // Tenant-scoped stacks come straight from bootstrap (client → stacks).
  const rows = useMemo(
    () =>
      (boot?.clients ?? []).flatMap((c) =>
        c.stacks.map((s: ApiStack) => ({ stack: s, client: c.name })),
      ),
    [boot],
  );

  const check = async (stackId: number) => {
    setChecks((c) => ({ ...c, [stackId]: { state: "running" } }));
    const run = await startRun(stackId, "drift");
    if (!run) {
      setChecks((c) => ({ ...c, [stackId]: { state: "error" } }));
      return;
    }
    // Poll until the run reaches a terminal state (or we give up).
    let r = run;
    for (let i = 0; i < 80 && (r.status === "queued" || r.status === "running"); i++) {
      await new Promise((res) => setTimeout(res, 1500));
      const nx = await getRun(run.id);
      if (nx) r = nx;
    }
    if (r.status === "succeeded") {
      // The runner reports "drift" or "clean" in detail; summary.drifted counts.
      setChecks((c) => ({
        ...c,
        [stackId]:
          r.detail === "drift"
            ? { state: "drift", drifted: r.summary.drifted ?? 0, runId: r.id }
            : { state: "clean", runId: r.id },
      }));
    } else {
      setChecks((c) => ({ ...c, [stackId]: { state: "error", runId: r.id } }));
    }
    onChanged(); // refresh the run list elsewhere
  };

  if (!boot) {
    return (
      <div className="mt-4 rounded-[10px] border border-[#E3EAF2] bg-white p-4 text-[12px] text-[#7A8CA1]">
        The API is offline — drift checks are unavailable. Start the platform API and reload.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-[10px] border border-[#E3EAF2] bg-white p-4">
      <div className="mb-1 flex items-baseline gap-2">
        <div className="font-display text-[13.5px] font-semibold text-[#0F1B2D]">Drift checks</div>
        <div className="text-[11px] text-[#7A8CA1]">refresh-only plan · live infra vs recorded state · read-only</div>
        <div className="ml-auto text-[10.5px] font-medium text-[#7A8CA1]">
          {boot.drift_interval_s
            ? `Auto: every ${fmtInterval(boot.drift_interval_s)}`
            : "Manual checks"}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="mt-2 text-[11.5px] text-[#93A3B6]">No stacks yet.</div>
      ) : (
        <div className="mt-2 flex flex-col">
          {rows.map(({ stack, client }) => {
            const st = checks[stack.id] ?? { state: "idle" };
            const chipKey = st.state === "idle" ? null : st.state;
            return (
              <div key={stack.id} className="flex items-center gap-2.5 border-t border-[#EFF3F8] py-2 first:border-t-0">
                <span className="font-mono text-[12px] text-[#1E2B3C]">{client} / {stack.name}</span>
                <span className="text-[10px] text-[#93A3B6]">{stack.env}</span>
                <div className="ml-auto flex items-center gap-2.5">
                  {chipKey && (
                    <span
                      className="rounded-[9px] px-[7px] py-px text-[10.5px] font-semibold"
                      style={{ color: CHIP[chipKey].c, background: CHIP[chipKey].bg }}
                    >
                      {st.state === "running" && "checking…"}
                      {st.state === "clean" && "in sync"}
                      {st.state === "drift" && `drift · ${st.drifted} resource${st.drifted === 1 ? "" : "s"}`}
                      {st.state === "error" && "check failed"}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!mayCheck || st.state === "running"}
                    onClick={() => check(stack.id)}
                    className="focus-ring cursor-pointer rounded-md border border-[#E3EAF2] px-2.5 py-1 text-[11px] font-medium text-[#41536A] not-disabled:hover:border-[#0FA79E] not-disabled:hover:text-[#0B7D76] disabled:cursor-not-allowed disabled:opacity-50"
                    title={mayCheck ? "Run a refresh-only drift check" : "Your role can view drift but not trigger checks"}
                  >
                    {st.state === "running" ? "Checking…" : "Check now"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2.5 text-[10px] leading-snug text-[#B5C2D2]">
        A check needs the stack to have been applied (it compares against recorded state). Detected drift is
        resolved by editing the design and re-planning — never a targeted apply (ADR-0011).
      </div>
    </div>
  );
}
