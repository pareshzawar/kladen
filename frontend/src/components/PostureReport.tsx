// A real, printable Infrastructure Posture Report (Phase 3 — Monitor). Pulls
// together everything Kladen already measures — estimated cost (Provision),
// CIS + Cloud Guard findings (Secure), and drift status (Monitor) — into one
// document an MSP can print to PDF and hand a client. Built entirely from data
// the app already exposes; no new backend. Honest about scope in the footer.

import { useEffect, useState } from "react";
import { getAllFindings, getRunEstimate, type ApiRun, type Bootstrap, type UnifiedFinding } from "../api";

const usd = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type StackLine = { client: string; stack: string; env: string; monthly: number | null; drift: "clean" | "drift" | "unknown"; drifted: number };
type FindingsData = { list: UnifiedFinding[]; bySeverity: Record<string, number>; bySource: Record<string, number>; total: number; cgStatus: string };

const SRC_LABEL: Record<string, string> = { cloud_guard: "Cloud Guard", cis: "CIS", drift: "Drift" };

export default function PostureReport({ boot, onClose }: { boot: Bootstrap; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [findings, setFindings] = useState<FindingsData | null>(null);
  const [stacks, setStacks] = useState<StackLine[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uf = await getAllFindings();
      // Latest successful plan/apply and drift run per stack, from bootstrap.
      const latestPlan = new Map<number, ApiRun>();
      const latestDrift = new Map<number, ApiRun>();
      for (const r of boot.runs) {
        if (r.status !== "succeeded") continue;
        if (r.mode === "plan" || r.mode === "apply") {
          const c = latestPlan.get(r.stack_id);
          if (!c || r.id > c.id) latestPlan.set(r.stack_id, r);
        } else if (r.mode === "drift") {
          const c = latestDrift.get(r.stack_id);
          if (!c || r.id > c.id) latestDrift.set(r.stack_id, r);
        }
      }
      const lines: StackLine[] = [];
      let sum = 0;
      for (const c of boot.clients) {
        for (const s of c.stacks) {
          const pr = latestPlan.get(s.id);
          let monthly: number | null = null;
          if (pr) {
            const e = await getRunEstimate(pr.id);
            if (e) {
              monthly = e.total_monthly;
              sum += e.total_monthly;
            }
          }
          const dr = latestDrift.get(s.id);
          lines.push({
            client: c.name, stack: s.name, env: s.env, monthly,
            drift: dr ? (dr.detail === "drift" ? "drift" : "clean") : "unknown",
            drifted: dr?.summary.drifted ?? 0,
          });
        }
      }
      if (cancelled) return;
      setFindings(uf ? { list: uf.findings, bySeverity: uf.summary.by_severity, bySource: uf.summary.by_source, total: uf.summary.total, cgStatus: uf.cloud_guard_status } : null);
      setStacks(lines);
      setTotal(sum);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [boot]);

  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const scopeLabel = boot.me?.client_id != null ? boot.clients[0]?.name ?? "Customer" : "All clients";

  return (
    <div className="posture-report fixed inset-0 z-[100] overflow-auto bg-white">
      {/* Print only the report, not the app chrome behind it. */}
      <style>{`@media print {
        body * { visibility: hidden; }
        .posture-report, .posture-report * { visibility: visible; }
        .posture-report { position: absolute; inset: 0; overflow: visible; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="mx-auto max-w-[820px] px-10 py-8 text-[13px] text-[#1E2B3C]">
        <div className="no-print mb-6 flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="cursor-pointer rounded-md bg-[#0FA79E] px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0C8C85]"
          >
            Print / Save as PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-[#E3EAF2] px-4 py-1.5 text-[12px] font-medium text-[#41536A] hover:border-[#0FA79E]"
          >
            Close
          </button>
        </div>

        {loading ? (
          <div className="text-[12px] text-[#7A8CA1]">Compiling report…</div>
        ) : (
          <>
            <div className="flex items-baseline justify-between border-b border-[#E3EAF2] pb-3">
              <div>
                <div className="font-display text-[22px] font-semibold text-[#0F1B2D]">Infrastructure Posture Report</div>
                <div className="mt-0.5 text-[12px] text-[#7A8CA1]">{boot.org.name} · {scopeLabel}</div>
              </div>
              <div className="text-[11px] text-[#7A8CA1]">{today}</div>
            </div>

            {/* Cost */}
            <Section title="Estimated monthly cost">
              <div className="mb-2 font-display text-[20px] font-semibold text-[#0B7D76]">${usd(total)}<span className="ml-1 text-[11px] font-normal text-[#93A3B6]">/mo · pay-as-you-go · not a quote</span></div>
              <Table head={["Client / stack", "Env", "Est. monthly"]}
                rows={stacks.map((s) => [`${s.client} / ${s.stack}`, s.env, s.monthly == null ? "— (no plan)" : `$${usd(s.monthly)}`])} />
            </Section>

            {/* Security */}
            <Section title="Security posture">
              <div className="mb-1.5 text-[12px]">
                <span className="font-semibold">{findings?.total ?? 0}</span> open finding{(findings?.total ?? 0) === 1 ? "" : "s"}
                {findings && findings.total > 0 && (
                  <span className="text-[#7A8CA1]">
                    {"  ·  "}
                    {(["critical", "high", "medium", "low"] as const).filter((s) => findings.bySeverity[s]).map((s) => `${findings.bySeverity[s]} ${s}`).join(" · ")}
                    {"  ·  "}
                    {(["cis", "drift", "cloud_guard"] as const).filter((s) => findings.bySource[s]).map((s) => `${findings.bySource[s]} ${SRC_LABEL[s]}`).join(" · ")}
                  </span>
                )}
              </div>
              {findings && findings.list.length > 0 && (
                <Table head={["Severity", "Source", "Finding", "Resource"]}
                  rows={findings.list.slice(0, 12).map((f) => [
                    f.severity.toUpperCase(), SRC_LABEL[f.source] ?? f.source, f.title,
                    `${f.stack ? f.stack + " · " : ""}${f.resource_ref.split(".").slice(-2).join(".")}`,
                  ])} />
              )}
              {findings && findings.cgStatus !== "ok" && (
                <div className="mt-2 text-[11px] text-[#9A6B1F]">
                  Cloud Guard: {findings.cgStatus.replace(/_/g, " ")} — runtime findings are not included until it is enabled in the tenancy.
                </div>
              )}
            </Section>

            {/* Drift */}
            <Section title="Configuration drift">
              <Table head={["Client / stack", "Status"]}
                rows={stacks.map((s) => [
                  `${s.client} / ${s.stack}`,
                  s.drift === "clean" ? "In sync" : s.drift === "drift" ? `Drifted · ${s.drifted} resource${s.drifted === 1 ? "" : "s"}` : "Not checked",
                ])} />
            </Section>

            <div className="mt-8 border-t border-[#E3EAF2] pt-3 text-[10px] leading-[1.6] text-[#93A3B6]">
              Cost is an estimate at pay-as-you-go rates, not a quote. CIS checks are advisory and design-time — not a certified CIS
              audit. Drift reflects the most recent refresh-only plan per stack. Generated by Kladen for {boot.org.name}.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="mb-2 font-display text-[14px] font-semibold text-[#0F1B2D]">{title}</div>
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="w-full border-collapse text-[11.5px]">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} className="border-b border-[#E3EAF2] py-1.5 pr-3 text-left text-[10px] font-semibold tracking-[0.5px] text-[#93A3B6] uppercase">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) => (
              <td key={j} className="border-b border-[#F0F4F9] py-1.5 pr-3 align-top text-[#41536A]">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
