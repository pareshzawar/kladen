// Plan tab: real runs from the platform API (backend/api.py) — plan output,
// logs, and the approval workflow. When the API is offline it falls back to
// the design mock. The role gate is real: Approve/Reject/apply are senior or
// admin only, and the backend enforces the same.

import { useEffect, useState } from "react";
import { approvalSteps, guardrails, planLines } from "../data";
import {
  canDeploy, getRunEstimate, getRunCis, getRunLogs, relTime,
  type ApiRun, type CisReport, type CostEstimate, type Role, type RunLogs,
} from "../api";

export default function PlanTab({
  run, role, stackName, onRequestApply, onApprove, onReject,
}: {
  run: ApiRun | null; // null = API offline -> render the design mock
  role: Role;
  stackName: string | null;
  onRequestApply: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const canApprove = canDeploy(role); // senior or admin
  const [logs, setLogs] = useState<RunLogs | null>(null);
  // Cost estimate for the run's plan.json (STATUS #2). null while unknown;
  // "unavailable" when the price API/estimate failed so it surfaces in the UI.
  const [est, setEst] = useState<CostEstimate | "unavailable" | null>(null);
  // CIS-aligned posture on the plan (Phase 2 — Secure). Same lifecycle as cost.
  const [cis, setCis] = useState<CisReport | "unavailable" | null>(null);
  const active = run && (run.status === "queued" || run.status === "running");
  useEffect(() => {
    setLogs(null);
    setEst(null);
    setCis(null);
    if (!run || run.status === "queued" || run.status === "awaiting_approval") return;
    let stale = false;
    const load = async () => {
      const l = await getRunLogs(run.id);
      if (!stale) setLogs(l);
      // A plan.json only exists after a SUCCESSFUL plan/apply/destroy — never for
      // validate, and not for failed runs. Cost + CIS apply to createable
      // resources, so skip drift too (its refresh-only plan has none).
      if (run.status === "succeeded" && run.mode !== "validate" && run.mode !== "drift") {
        const e = await getRunEstimate(run.id);
        if (!stale) setEst(e ?? "unavailable");
        const c = await getRunCis(run.id);
        if (!stale) setCis(c ?? "unavailable");
      }
    };
    void load();
    return () => {
      stale = true;
    };
  }, [run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run) return <MockPlan canApprove={canApprove} />;

  const sum = { create: run.summary.create ?? 0, update: run.summary.update ?? 0, delete: run.summary.delete ?? 0 };
  const output =
    [logs?.plan, logs?.apply].filter(Boolean).join("\n") || logs?.validate || logs?.init || "";

  const steps = [
    {
      name: `${run.mode === "destroy" ? "Destroy plan" : "Plan"} generated`,
      detail: `Run #${run.id} · ${relTime(run.created_at)} · by ${run.requested_by}`,
      done: !active,
      pending: !!active,
    },
    { name: "Guardrail checks", detail: "4/4 policies · demo data", done: true, pending: false },
    {
      name: run.approved_by ? `Approved by ${run.approved_by}` : run.status === "rejected" ? "Rejected" : "Approval",
      detail:
        run.mode === "apply" || run.mode === "destroy"
          ? run.status === "awaiting_approval"
            ? "Awaiting approval below"
            : run.approved_by
              ? "Policy: prod-changes"
              : run.status === "rejected"
                ? "Run was rejected"
                : "—"
          : "Request apply to start the approval flow",
      done: !!run.approved_by,
      pending: run.status === "awaiting_approval",
    },
    {
      name: run.mode === "destroy" ? "Destroy" : "Apply",
      detail:
        (run.mode === "apply" || run.mode === "destroy") && run.status === "succeeded"
          ? `Finished ${relTime(run.finished_at)}`
          : "Runs after approval",
      done: (run.mode === "apply" || run.mode === "destroy") && run.status === "succeeded",
      pending: false,
      last: true,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-auto px-5 py-4">
      <div className="flex min-w-0 flex-[1.4] flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="font-display text-[15px] font-semibold text-[#0F1B2D]">
            Run #{run.id} · {run.mode}
          </div>
          <div className="text-[11px] text-[#7A8CA1]">
            {stackName ?? run.stack_name} · {run.env} · tofu 1.12 · {relTime(run.created_at)}
          </div>
          <div className="ml-auto flex gap-2">
            <span className="rounded-md bg-[#E6F5F4] px-2.5 py-1 text-[11.5px] font-semibold text-[#0B7D76]">
              {sum.create} to add
            </span>
            <span className="rounded-md bg-[#FAF0E0] px-2.5 py-1 text-[11.5px] font-semibold text-[#9A6B1F]">
              {sum.update} to change
            </span>
            <span className="rounded-md bg-[#F0F4F9] px-2.5 py-1 text-[11.5px] font-semibold text-[#5F7490]">
              {sum.delete} to destroy
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-auto rounded-[10px] bg-[#0B1523] px-[18px] py-4 font-mono text-[12px] leading-[1.8]">
          {active ? (
            <div className="text-[#8FA3BA]">
              Running tofu {run.mode} in container… <span className="animate-pulse">▌</span>
            </div>
          ) : run.status === "awaiting_approval" ? (
            <div className="text-[#D9A05B]">
              Run #{run.id} ({run.mode}) is awaiting approval — nothing has executed yet.
              Approve or reject in the panel on the right.
            </div>
          ) : output ? (
            <pre className="whitespace-pre-wrap text-[#C9D6E3]">{output}</pre>
          ) : (
            <div className="text-[#8FA3BA]">No output captured.</div>
          )}
          {run.status === "failed" && run.detail && (
            <div className="mt-3 border-t border-[#1C2C45] pt-2 text-[#E08A85]">failed: {run.detail}</div>
          )}
        </div>
      </div>

      <div className="flex w-[340px] shrink-0 flex-col gap-3.5">
        <CostCard est={est} />
        <CisCard cis={cis} />
        <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
          <div className="mb-2.5 font-display text-[13.5px] font-semibold text-[#0F1B2D]">Guardrail checks</div>
          <div className="mb-2 rounded-md bg-[#F0F4F9] px-2.5 py-1.5 text-[10.5px] text-[#7A8CA1]">
            Demo data — policy engine lands in a later phase.
          </div>
          <div className="flex flex-col gap-[9px]">
            {guardrails.map((g) => (
              <div key={g.name} className="flex items-start gap-[9px]">
                <div className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#E6F5F4] text-[9.5px] font-semibold text-[#0B7D76]">
                  ✓
                </div>
                <div>
                  <div className="text-[12.5px] font-medium text-[#1E2B3C]">{g.name}</div>
                  <div className="text-[11px] text-[#7A8CA1]">{g.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
          <div className="mb-3 font-display text-[13.5px] font-semibold text-[#0F1B2D]">Approval workflow</div>
          <div className="flex flex-col">
            {steps.map((sp) => (
              <WorkflowStep key={sp.name} {...sp} />
            ))}
          </div>
          <div className="mt-0.5 flex gap-2">
            {run.status === "awaiting_approval" ? (
              <>
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={!canApprove}
                  title={canApprove ? undefined : "Requires the senior-dev or admin role"}
                  className={`focus-ring flex-1 rounded-md py-2 text-center font-semibold text-white ${
                    canApprove ? "cursor-pointer bg-[#0FA79E] hover:bg-[#0C8C85]" : "cursor-not-allowed bg-[#C6D2DF]"
                  }`}
                >
                  Approve &amp; {run.mode}
                </button>
                <button
                  type="button"
                  onClick={onReject}
                  disabled={!canApprove}
                  title={canApprove ? undefined : "Requires the senior-dev or admin role"}
                  className={`focus-ring flex-1 rounded-md border border-[#E3EAF2] py-2 text-center font-medium ${
                    canApprove
                      ? "cursor-pointer text-[#41536A] hover:border-[#B4514D] hover:text-[#B4514D]"
                      : "cursor-not-allowed text-[#B5C2D2]"
                  }`}
                >
                  Reject
                </button>
              </>
            ) : run.mode === "plan" && run.status === "succeeded" ? (
              <button
                type="button"
                onClick={onRequestApply}
                className="focus-ring flex-1 cursor-pointer rounded-md bg-[#0FA79E] py-2 text-center font-semibold text-white hover:bg-[#0C8C85]"
              >
                Request apply (needs approval)
              </button>
            ) : (
              <div className="flex-1 rounded-md border border-[#EFF3F8] py-2 text-center text-[11.5px] text-[#93A3B6]">
                {active ? "Waiting for the run to finish…" : "No pending approval"}
              </div>
            )}
          </div>
          <div className="mt-2.5 text-center text-[10.5px] text-[#93A3B6]">
            {canApprove
              ? "Requires 1 approval · policy: prod-changes"
              : "Your role can design and plan — approval needs a senior dev"}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowStep({
  name, detail, done, pending, last,
}: {
  name: string;
  detail: string;
  done: boolean;
  pending: boolean;
  last?: boolean;
}) {
  const dotBg = done ? "#0FA79E" : pending ? "#FAF0E0" : "#FFFFFF";
  const dotBr = done ? "#0FA79E" : pending ? "#E0912F" : "#DCE6F0";
  const dotC = done ? "#FFFFFF" : pending ? "#E0912F" : "#93A3B6";
  return (
    <div className="flex gap-[11px]">
      <div className="flex flex-col items-center">
        <div
          className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] text-[9px] font-semibold"
          style={{ background: dotBg, borderColor: dotBr, color: dotC }}
        >
          {done ? "✓" : pending ? "●" : ""}
        </div>
        {!last && <div className="min-h-4 w-[1.5px] flex-1 bg-[#E3EAF2]" />}
      </div>
      <div className="pb-3.5">
        <div className="text-[12.5px] font-medium" style={{ color: done || pending ? "#0F1B2D" : "#93A3B6" }}>
          {name}
        </div>
        <div className="text-[11px] text-[#7A8CA1]">{detail}</div>
      </div>
    </div>
  );
}

// Roll priced cost lines up into per-service groups (one dropdown each),
// preserving first-seen order and summing a subtotal per service.
type CostLine = CostEstimate["lines"][number];
function groupByService(lines: CostLine[]): { service: string; total: number; items: CostLine[] }[] {
  const groups: { service: string; total: number; items: CostLine[] }[] = [];
  for (const l of lines) {
    let g = groups.find((x) => x.service === l.service);
    if (!g) {
      g = { service: l.service, total: 0, items: [] };
      groups.push(g);
    }
    g.total += l.monthly;
    g.items.push(l);
  }
  return groups;
}

// CIS control status → chip colour + glyph (colour + a second signal, per the
// ADR-0014 colourblind rule: ✓ pass, ✕ fail, ? unknown).
const CIS_STATUS: Record<string, { c: string; bg: string; glyph: string }> = {
  pass: { c: "#0B7D76", bg: "#E6F5F4", glyph: "✓" },
  fail: { c: "#B4514D", bg: "#FBF1F0", glyph: "✕" },
  unknown: { c: "#9A6B1F", bg: "#FAF0E0", glyph: "?" },
  not_applicable: { c: "#7A8CA1", bg: "#F0F4F9", glyph: "–" },
};

/** CIS-aligned posture on the plan (Phase 2 — Secure). Shows pass/fail per
 *  control against the planned resources; failures carry a severity + reason.
 *  Advisory design-time posture, not a certified audit. */
function CisCard({ cis }: { cis: CisReport | "unavailable" | null }) {
  if (cis === null) return null;
  if (cis === "unavailable") {
    return (
      <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
        <div className="mb-1 font-display text-[13.5px] font-semibold text-[#0F1B2D]">CIS checks</div>
        <div className="text-[11.5px] text-[#B4514D]">Unavailable — the CIS scan couldn't run for this plan.</div>
      </div>
    );
  }
  const { summary } = cis;
  // Show failures first, then the rest (pass/unknown/not-applicable) for evidence.
  const ordered = [...cis.controls].sort((a, b) => Number(b.status === "fail") - Number(a.status === "fail"));
  return (
    <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
      <div className="flex items-baseline gap-2">
        <div className="font-display text-[13.5px] font-semibold text-[#0F1B2D]">CIS checks</div>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold">
          <span className="text-[#0B7D76]">{summary.pass} pass</span>
          <span className="text-[#B5C2D2]">·</span>
          <span className={summary.fail > 0 ? "text-[#B4514D]" : "text-[#93A3B6]"}>{summary.fail} fail</span>
        </div>
      </div>
      <div className="mb-2.5 text-[10.5px] text-[#93A3B6]">
        {summary.resources} planned resources · CIS-aligned · advisory
      </div>

      <div className="flex flex-col gap-1.5">
        {ordered.map((c) => {
          const s = CIS_STATUS[c.status] ?? CIS_STATUS.unknown;
          const fails = c.results.filter((r) => r.status === "fail");
          return (
            <div key={c.id} className="text-[11.5px]">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{ color: s.c, background: s.bg }}
                  title={c.status}
                >
                  {s.glyph}
                </span>
                <span className="min-w-0 truncate text-[#1E2B3C]" title={c.title}>{c.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-[#93A3B6]">{c.ref}</span>
              </div>
              {fails.map((r) => (
                <div key={r.resource} className="mt-0.5 ml-6 truncate text-[10px] text-[#B4514D]" title={`${r.resource} — ${r.detail ?? ""}`}>
                  {r.resource.split(".").slice(-2).join(".")} — {r.detail}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] leading-snug text-[#B5C2D2]">{cis.note}</div>
    </div>
  );
}

/** Estimated monthly cost of the plan (STATUS #2). Prices the fixed-shape
 *  resources; lists networking (free) and usage-based services honestly rather
 *  than inventing a number. Renders nothing until an estimate is known. */
function CostCard({ est }: { est: CostEstimate | "unavailable" | null }) {
  if (est === null) return null;
  if (est === "unavailable") {
    return (
      <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
        <div className="mb-1 font-display text-[13.5px] font-semibold text-[#0F1B2D]">Estimated monthly cost</div>
        <div className="text-[11.5px] text-[#B4514D]">Unavailable — the OCI price list couldn't be reached.</div>
      </div>
    );
  }
  return (
    <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
      <div className="flex items-baseline gap-2">
        <div className="font-display text-[13.5px] font-semibold text-[#0F1B2D]">Estimated monthly cost</div>
        <div className="ml-auto font-display text-[18px] font-semibold text-[#0B7D76]">
          ${est.total_monthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div className="mb-2.5 text-[10.5px] text-[#93A3B6]">{est.currency} · pay-as-you-go · not a quote</div>

      {est.lines.length > 0 && (
        // Per-service breakdown: priced lines grouped by service, each an
        // expandable dropdown showing that service's subtotal, and its
        // individual resources when opened.
        <div className="flex flex-col gap-1.5">
          {groupByService(est.lines).map((g) => (
            <details key={g.service} className="group rounded-md border border-[#EFF3F8] bg-[#FCFDFE]">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-[11.5px]">
                <span className="text-[9px] text-[#B5C2D2] transition-transform group-open:rotate-90">▶</span>
                <span className="font-semibold text-[#1E2B3C]">{g.service}</span>
                <span className="text-[10px] text-[#93A3B6]">
                  {g.items.length} resource{g.items.length === 1 ? "" : "s"}
                </span>
                <span className="ml-auto shrink-0 font-mono font-semibold text-[#0B7D76]">
                  ${g.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </summary>
              <div className="flex flex-col gap-1 border-t border-[#EFF3F8] px-2.5 py-1.5">
                {g.items.map((l) => (
                  <div key={l.resource} className="flex items-center gap-2 text-[11px]">
                    <span className="min-w-0 truncate font-mono text-[10.5px] text-[#41536A]" title={l.resource}>
                      {l.resource.split(".").slice(-2).join(".")}
                    </span>
                    <span className="truncate text-[10px] text-[#93A3B6]">{l.detail}</span>
                    <span className="ml-auto shrink-0 font-mono text-[#1E2B3C]">
                      ${l.monthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {(est.free.length > 0 || est.usage_based.length > 0) && (
        <div className="mt-2.5 border-t border-[#EFF3F8] pt-2 text-[10.5px] leading-[1.6] text-[#7A8CA1]">
          {est.free.length > 0 && <div>{est.free.length} networking resource{est.free.length === 1 ? "" : "s"} · free</div>}
          {est.usage_based.map((u) => (
            <div key={u.resource}>
              <span className="font-mono text-[#93A3B6]">{u.resource.split(".").slice(-2).join(".")}</span> — {u.why}
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 text-[10px] leading-snug text-[#B5C2D2]">{est.note}</div>
    </div>
  );
}

/** The original design mock, shown when the platform API is offline. */
function MockPlan({ canApprove }: { canApprove: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-auto px-5 py-4">
      <div className="flex min-w-0 flex-[1.4] flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="font-display text-[15px] font-semibold text-[#0F1B2D]">Plan #248</div>
          <div className="text-[11px] text-[#7A8CA1]">ecommerce-core · production · tofu 1.9.1 · 38s</div>
          <div className="ml-auto flex gap-2">
            <div className="rounded-md bg-[#E6F5F4] px-2.5 py-1 text-[11.5px] font-semibold text-[#0B7D76]">12 to add</div>
            <div className="rounded-md bg-[#FAF0E0] px-2.5 py-1 text-[11.5px] font-semibold text-[#9A6B1F]">2 to change</div>
            <div className="rounded-md bg-[#F0F4F9] px-2.5 py-1 text-[11.5px] font-semibold text-[#5F7490]">0 to destroy</div>
          </div>
        </div>
        <div className="flex-1 overflow-auto rounded-[10px] bg-[#0B1523] px-[18px] py-4 font-mono text-[12px] leading-[1.8]">
          <div className="text-[#8FA3BA]">OpenTofu will perform the following actions:</div>
          <div className="h-2" />
          {planLines.map((pl) => (
            <div key={pl.res} className="flex gap-2.5">
              <span className="w-3" style={{ color: pl.color }}>
                {pl.sign}
              </span>
              <span className="text-[#C9D6E3]">{pl.res}</span>
              <span className="text-[#5A6D85]">{pl.note}</span>
            </div>
          ))}
          <div className="h-2.5" />
          <div className="font-medium text-[#E7EDF5]">
            Plan: <span className="text-[#4CC38A]">12 to add</span>, <span className="text-[#D9A05B]">2 to change</span>,{" "}
            <span className="text-[#8FA3BA]">0 to destroy</span>.
          </div>
        </div>
      </div>

      <div className="flex w-[340px] shrink-0 flex-col gap-3.5">
        <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
          <div className="mb-2.5 font-display text-[13.5px] font-semibold text-[#0F1B2D]">Guardrail checks</div>
          <div className="flex flex-col gap-[9px]">
            {guardrails.map((g) => (
              <div key={g.name} className="flex items-start gap-[9px]">
                <div className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#E6F5F4] text-[9.5px] font-semibold text-[#0B7D76]">
                  ✓
                </div>
                <div>
                  <div className="text-[12.5px] font-medium text-[#1E2B3C]">{g.name}</div>
                  <div className="text-[11px] text-[#7A8CA1]">{g.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
          <div className="mb-3 font-display text-[13.5px] font-semibold text-[#0F1B2D]">Approval workflow</div>
          <div className="flex flex-col">
            {approvalSteps.map((sp) => (
              <WorkflowStep key={sp.name} name={sp.name} detail={sp.detail} done={!!sp.done} pending={!!sp.pending} last={sp.last} />
            ))}
          </div>
          <div className="mt-0.5 flex gap-2">
            <button
              type="button"
              disabled={!canApprove}
              title={canApprove ? undefined : "Requires the senior-dev or admin role"}
              className={`focus-ring flex-1 rounded-md py-2 text-center font-semibold text-white ${
                canApprove ? "cursor-pointer bg-[#0FA79E] hover:bg-[#0C8C85]" : "cursor-not-allowed bg-[#C6D2DF]"
              }`}
            >
              Approve &amp; apply
            </button>
            <button
              type="button"
              disabled={!canApprove}
              title={canApprove ? undefined : "Requires the senior-dev or admin role"}
              className={`focus-ring flex-1 rounded-md border border-[#E3EAF2] py-2 text-center font-medium ${
                canApprove
                  ? "cursor-pointer text-[#41536A] hover:border-[#B4514D] hover:text-[#B4514D]"
                  : "cursor-not-allowed text-[#B5C2D2]"
              }`}
            >
              Reject
            </button>
          </div>
          <div className="mt-2.5 text-center text-[10.5px] text-[#93A3B6]">
            {canApprove
              ? "Requires 1 approval · policy: prod-changes"
              : "Your role can design and plan — approval needs a senior dev"}
          </div>
        </div>
      </div>
    </div>
  );
}
