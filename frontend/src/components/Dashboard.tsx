// Dashboard screen: MSP-level overview (stat tiles, client cards, run list).
// Mostly demo data from data.ts, but two sections are REAL when the API is up:
// the recent-runs table (boot.runs) and the estimated monthly cost panel
// (summed live from each stack's latest priced plan). The demo stat tiles and
// client cards become real once the backend tracks resources/drift/guardrails.

import { useEffect, useState } from "react";
import { dashClients, runs } from "../data";
import {
  getAllFindings, getRunEstimate, relTime,
  type ApiRun, type Bootstrap, type UnifiedFindings,
} from "../api";

// Format a number as a 2-decimal USD amount (no currency symbol).
const usd = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Column widths for the runs table (header and rows must match).
const RUN_COLS = "64px 1.6fr 70px 110px 130px 100px 90px";

const RUN_STATUS_STYLE: Record<string, { stColor: string; stBg: string }> = {
  succeeded: { stColor: "#0B7D76", stBg: "#E6F5F4" },
  failed: { stColor: "#B4514D", stBg: "#FBF1F0" },
  rejected: { stColor: "#B4514D", stBg: "#FBF1F0" },
  awaiting_approval: { stColor: "#9A6B1F", stBg: "#FAF0E0" },
  queued: { stColor: "#5F7490", stBg: "#F0F4F9" },
  running: { stColor: "#9A6B1F", stBg: "#FAF0E0" },
};

const liveRow = (r: ApiRun) => ({
  id: `#${r.id}`,
  target: `${r.client_name} / ${r.stack_name}`,
  type: r.mode,
  changes:
    r.status === "succeeded" || r.status === "failed"
      ? `+${r.summary.create ?? 0} ~${r.summary.update ?? 0} -${r.summary.delete ?? 0}`
      : "—",
  status: r.status.replace("_", " "),
  when: relTime(r.created_at),
  by: r.approved_by ?? r.requested_by,
  ...(RUN_STATUS_STYLE[r.status] ?? RUN_STATUS_STYLE.queued),
});

// One priced stack on the cost panel: its latest plan and that plan's estimate.
type CostRow = { stackId: number; label: string; runId: number; monthly: number };

export default function Dashboard({ boot }: { boot: Bootstrap | null }) {
  const rows = boot?.runs.length ? boot.runs.map(liveRow) : runs;

  // Real estimated monthly cost, summed across stacks. For each stack we price
  // its latest *succeeded, non-validate* run (only those have a plan.json), then
  // total them. null = still loading / API offline; [] = up but nothing priced.
  const [cost, setCost] = useState<{ rows: CostRow[]; total: number } | null>(null);
  useEffect(() => {
    if (!boot) {
      setCost(null);
      return;
    }
    let cancelled = false;
    (async () => {
      // Keep only the newest priced run per stack (plan/apply — not validate or
      // drift, whose refresh-only plans carry no createable resources to price).
      const latest = new Map<number, ApiRun>();
      for (const r of boot.runs) {
        if (r.status !== "succeeded" || r.mode === "validate" || r.mode === "drift") continue;
        const cur = latest.get(r.stack_id);
        if (!cur || r.id > cur.id) latest.set(r.stack_id, r);
      }
      const out: CostRow[] = [];
      for (const r of latest.values()) {
        const e = await getRunEstimate(r.id);
        if (e) {
          out.push({ stackId: r.stack_id, label: `${r.client_name} / ${r.stack_name}`, runId: r.id, monthly: e.total_monthly });
        }
      }
      out.sort((a, b) => b.monthly - a.monthly); // priciest stack first
      if (!cancelled) setCost({ rows: out, total: out.reduce((s, r) => s + r.monthly, 0) });
    })();
    return () => {
      cancelled = true;
    };
  }, [boot]);

  // Unified security posture (Phase 2/3): CIS + drift + Cloud Guard in one view.
  // null = loading / offline; otherwise a merged, severity-sorted findings set.
  const [sec, setSec] = useState<UnifiedFindings | null>(null);
  useEffect(() => {
    if (!boot) {
      setSec(null);
      return;
    }
    let cancelled = false;
    getAllFindings().then((r) => {
      if (!cancelled) setSec(r);
    });
    return () => {
      cancelled = true;
    };
  }, [boot]);

  // Real headline tiles from the platform data (replacing the old demo stats).
  const tiles = ((): { label: string; value: string; sub: string; color: string }[] => {
    if (!boot) return [];
    const stackCount = boot.clients.reduce((n, c) => n + c.stacks.length, 0);
    // Latest drift check per stack → how many checked / drifted.
    const latestDrift = new Map<number, ApiRun>();
    for (const r of boot.runs) {
      if (r.status !== "succeeded" || r.mode !== "drift") continue;
      const c = latestDrift.get(r.stack_id);
      if (!c || r.id > c.id) latestDrift.set(r.stack_id, r);
    }
    const drifted = [...latestDrift.values()].filter((r) => r.detail === "drift").length;
    const findings = sec?.summary.total ?? null;
    return [
      { label: "Clients", value: String(boot.clients.length), sub: "active", color: "#0F1B2D" },
      { label: "Stacks", value: String(stackCount), sub: "managed", color: "#0F1B2D" },
      { label: "Open findings", value: findings == null ? "…" : String(findings), sub: "CIS · drift · Cloud Guard", color: findings ? "#B4514D" : "#0B7D76" },
      { label: "Drift", value: String(drifted), sub: `${latestDrift.size} checked`, color: drifted ? "#B4514D" : "#0B7D76" },
      { label: "Est. monthly", value: cost ? `$${usd(cost.total)}` : "…", sub: "priced plans", color: "#0B7D76" },
    ];
  })();

  return (
    <div className="flex-1 overflow-auto px-6 py-5">
      <div className="font-display text-[17px] font-semibold text-[#0F1B2D]">Overview</div>
      <div className="mt-0.5 mb-4 text-[12px] text-[#7A8CA1]">All clients · Meridian MSP workspace</div>

      {boot && <CostOverview cost={cost} />}
      {boot && <SecurityPanel sec={sec} />}

      <div className="mb-[18px] grid grid-cols-5 gap-3">
        {tiles.map((s) => (
          <div key={s.label} className="rounded-[10px] border border-[#E3EAF2] bg-white px-4 py-3.5">
            <div className="text-[11px] font-medium text-[#7A8CA1]">{s.label}</div>
            <div className="mt-[5px] flex items-baseline gap-[7px]">
              <div className="font-display text-[22px] font-semibold" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="text-[10.5px] text-[#93A3B6]">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-1.5 text-[10px] font-semibold tracking-[1px] text-[#93A3B6]">CLIENT SUMMARY CARDS — DEMO DATA</div>
      <div className="mb-[18px] grid grid-cols-3 gap-3.5">
        {dashClients.map((dc) => (
          <button
            type="button"
            key={dc.name}
            className="focus-ring cursor-pointer rounded-[10px] border border-[#E3EAF2] bg-white p-4 text-left hover:shadow-[0_3px_12px_rgba(15,27,45,0.08)]"
          >
            <span className="flex items-center gap-[9px]">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-[#0F1B2D] text-[11px] font-semibold text-[#9FD8D3]">
                {dc.mono}
              </span>
              <span className="font-display text-[13.5px] font-semibold text-[#0F1B2D]">{dc.name}</span>
              <span
                className="ml-auto rounded-[10px] px-[9px] py-[3px] text-[10.5px] font-semibold"
                style={{ color: dc.stColor, background: dc.stBg }}
              >
                {dc.status}
              </span>
            </span>
            <span className="my-[13px] flex gap-3.5 text-[11.5px] text-[#5F7490]">
              <span>
                <span className="font-semibold text-[#1E2B3C]">{dc.stacksN}</span> stacks
              </span>
              <span>
                <span className="font-semibold text-[#1E2B3C]">{dc.res}</span> resources
              </span>
              <span>
                <span className="font-semibold text-[#1E2B3C]">{dc.envsN}</span> envs
              </span>
            </span>
            <span className="flex flex-col gap-1.5 border-t border-[#EFF3F8] pt-2.5">
              <span className="flex justify-between text-[11.5px]">
                <span className="text-[#7A8CA1]">Drift</span>
                <span className="font-medium" style={{ color: dc.driftColor }}>
                  {dc.drift}
                </span>
              </span>
              <span className="flex justify-between text-[11.5px]">
                <span className="text-[#7A8CA1]">Guardrails</span>
                <span className="font-medium" style={{ color: dc.grColor }}>
                  {dc.gr}
                </span>
              </span>
              <span className="flex justify-between text-[11.5px]">
                <span className="text-[#7A8CA1]">Last run</span>
                <span className="text-[#41536A]">{dc.last}</span>
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
        <div className="mb-2.5 font-display text-[13.5px] font-semibold text-[#0F1B2D]">Recent runs</div>
        <div
          className="grid gap-2 px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.8px] text-[#93A3B6]"
          style={{ gridTemplateColumns: RUN_COLS }}
        >
          <div>RUN</div>
          <div>CLIENT / STACK</div>
          <div>TYPE</div>
          <div>CHANGES</div>
          <div>STATUS</div>
          <div>WHEN</div>
          <div>BY</div>
        </div>
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid items-center gap-2 border-t border-[#EFF3F8] px-2.5 py-[9px] text-[12px] hover:bg-[#F8FAFC]"
            style={{ gridTemplateColumns: RUN_COLS }}
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
            <div className="text-[#7A8CA1]">{r.by}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Severity → chip colours for security findings (colour + label, so it also
// reads without colour — see ADR-0014's colourblind note).
const SEV: Record<string, { c: string; bg: string }> = {
  critical: { c: "#B4514D", bg: "#FBF1F0" },
  high: { c: "#B4514D", bg: "#FBF1F0" },
  medium: { c: "#9A6B1F", bg: "#FAF0E0" },
  low: { c: "#5F7490", bg: "#F0F4F9" },
  minor: { c: "#5F7490", bg: "#F0F4F9" },
  info: { c: "#5F7490", bg: "#F0F4F9" },
};

// Honest copy for the non-ok Cloud Guard states — never dressed up as "clean".
const STATUS_MSG: Record<string, string> = {
  not_enabled:
    "Cloud Guard isn't enabled in this tenancy. Enable it in the OCI console (Cloud Guard → Enable) with a target on the root compartment — findings appear here on the next sync.",
  no_credentials: "No configuration profile resolves — add one under Profiles so Kladen can read Cloud Guard.",
  sdk_unavailable: "The OCI SDK isn't available on the API host — run the platform API in the backend virtualenv (it has the oci package).",
  error: "Couldn't read Cloud Guard.",
};

// Badge per finding source (CIS / drift / Cloud Guard) so the unified list
// makes each finding's origin obvious.
const SOURCE: Record<string, { label: string; c: string; bg: string }> = {
  cloud_guard: { label: "Cloud Guard", c: "#0B7D76", bg: "#E6F5F4" },
  cis: { label: "CIS", c: "#41536A", bg: "#EDF1F6" },
  drift: { label: "Drift", c: "#9A6B1F", bg: "#FAF0E0" },
};

/** Unified security posture (Phase 2/3): CIS + drift + Cloud Guard findings in
 *  one severity-sorted list, each tagged by source and the stack it came from.
 *  Cloud Guard's status is still shown honestly (off by default) even when CIS
 *  or drift already have findings — a clean list must mean genuinely clean. */
function SecurityPanel({ sec }: { sec: UnifiedFindings | null }) {
  const cgOff = sec && sec.cloud_guard_status !== "ok" && sec.cloud_guard_status !== "skipped";
  const breakdown = sec
    ? (["cis", "drift", "cloud_guard"] as const)
        .filter((s) => sec.summary.by_source[s])
        .map((s) => `${sec.summary.by_source[s]} ${SOURCE[s].label}`)
        .join(" · ")
    : "";
  return (
    <div className="mb-[18px] rounded-[10px] border border-[#E3EAF2] bg-white p-4">
      <div className="flex items-baseline gap-2">
        <div className="font-display text-[13.5px] font-semibold text-[#0F1B2D]">Security posture</div>
        <div className="text-[11px] text-[#7A8CA1]">CIS · drift · Cloud Guard · read-only</div>
        {sec && (
          <div className="ml-auto font-display text-[15px] font-semibold text-[#0F1B2D]">
            {sec.summary.total} finding{sec.summary.total === 1 ? "" : "s"}
          </div>
        )}
      </div>
      {breakdown && <div className="mt-0.5 text-[10.5px] text-[#93A3B6]">{breakdown}</div>}

      {!sec && <div className="mt-2 text-[11.5px] text-[#93A3B6]">…</div>}

      {sec && sec.summary.total === 0 && (
        <div className="mt-2 text-[11.5px] text-[#0B7D76]">No open findings across CIS, drift, and Cloud Guard.</div>
      )}

      {sec && sec.findings.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {sec.findings.slice(0, 8).map((f, i) => {
            const sv = SEV[f.severity] ?? SEV.info;
            const src = SOURCE[f.source] ?? { label: f.source, c: "#5F7490", bg: "#F0F4F9" };
            return (
              <div key={`${f.source_of_record}-${i}`} className="flex items-center gap-2 border-t border-[#EFF3F8] pt-1.5 text-[12px] first:border-t-0 first:pt-0">
                <span className="shrink-0 rounded-[9px] px-[7px] py-px text-[10px] font-semibold uppercase" style={{ color: sv.c, background: sv.bg }}>
                  {f.severity}
                </span>
                <span className="shrink-0 rounded-[9px] px-[7px] py-px text-[10px] font-semibold" style={{ color: src.c, background: src.bg }}>
                  {src.label}
                </span>
                <span className="min-w-0 truncate font-medium text-[#1E2B3C]" title={f.title}>{f.title}</span>
                <span className="shrink-0 truncate text-[10.5px] text-[#93A3B6]">
                  {f.stack ? `${f.stack} · ` : ""}{f.resource_ref.split(".").slice(-2).join(".")}
                </span>
              </div>
            );
          })}
          {sec.findings.length > 8 && (
            <div className="pt-1 text-[10.5px] text-[#93A3B6]">+{sec.findings.length - 8} more</div>
          )}
        </div>
      )}

      {cgOff && (
        <div className="mt-2 rounded-md bg-[#FAF0E0] px-3 py-2 text-[11px] leading-[1.5] text-[#9A6B1F]">
          {STATUS_MSG[sec!.cloud_guard_status] ?? "Cloud Guard unavailable."}
        </div>
      )}
    </div>
  );
}

/** Real estimated monthly cost across the workspace, summed from each stack's
 *  latest priced plan (STATUS #2, extended to the overview). Live figures — the
 *  only real numbers among the demo stat tiles — so it's labelled as an estimate. */
function CostOverview({ cost }: { cost: { rows: CostRow[]; total: number } | null }) {
  return (
    <div className="mb-[18px] rounded-[10px] border border-[#E3EAF2] bg-white p-4">
      <div className="flex items-baseline gap-2">
        <div className="font-display text-[13.5px] font-semibold text-[#0F1B2D]">Estimated monthly cost</div>
        <div className="text-[11px] text-[#7A8CA1]">
          {cost ? `${cost.rows.length} priced stack${cost.rows.length === 1 ? "" : "s"} · ` : ""}
          latest plan each · pay-as-you-go · not a quote
        </div>
        <div className="ml-auto font-display text-[20px] font-semibold text-[#0B7D76]">
          {cost ? `$${usd(cost.total)}` : "…"}
        </div>
      </div>

      {cost && cost.rows.length === 0 && (
        <div className="mt-2 text-[11.5px] text-[#93A3B6]">
          No priced plans yet — run a plan on a stack to see its estimated cost here.
        </div>
      )}

      {cost && cost.rows.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {cost.rows.map((r) => (
            <div key={r.stackId} className="flex items-center gap-2 border-t border-[#EFF3F8] pt-1.5 text-[12px] first:border-t-0 first:pt-0">
              <span className="font-medium text-[#1E2B3C]">{r.label}</span>
              <span className="font-mono text-[10.5px] text-[#93A3B6]">run #{r.runId}</span>
              <span className="ml-auto font-mono text-[#1E2B3C]">${usd(r.monthly)}/mo</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
