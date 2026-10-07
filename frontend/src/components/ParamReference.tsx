// Provider-docs parameter reference for one resource type, keyed by rtype.
// Data comes from catalog.ts, generated from the OpenTofu registry docs for
// the oci provider (see frontend/scripts/gen_catalog.py): required args are
// flagged, each with the provider's description of what it asks for and an
// example value in HCL. Types without docs coverage render nothing.

import { catalogGroups, PROVIDER_VERSION, type CatalogService } from "../catalog";

const byRtype: Record<string, CatalogService> = Object.fromEntries(
  catalogGroups.flatMap((g) => g.items.map((s) => [s.rtype, s])),
);

export default function ParamReference({ rtype }: { rtype: string }) {
  const svc = byRtype[rtype];
  if (!svc) return null;
  const nReq = svc.params.filter((p) => p.required).length;
  return (
    <div>
      <div className="mt-4 mb-2 text-[10px] font-semibold tracking-[1px] text-[#93A3B6]">
        PROVIDER PARAMETERS · {nReq} REQUIRED
      </div>
      <div className="flex flex-col gap-3">
        {svc.params.map((p) => (
          <div key={p.name}>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11.5px] font-medium text-[#1E2B3C]">{p.name}</span>
              {p.required ? (
                <span className="rounded-[5px] bg-[#FAF0E0] px-[7px] py-px text-[9.5px] font-semibold tracking-[0.5px] text-[#9A6B1F]">
                  REQUIRED
                </span>
              ) : (
                <span className="rounded-[5px] bg-[#F0F4F9] px-[7px] py-px text-[9.5px] font-medium tracking-[0.5px] text-[#7A8CA1]">
                  optional
                </span>
              )}
            </div>
            <div className="mt-1 text-[11px] leading-[1.45] text-[#5F7490]">{p.desc}</div>
            <div className="mt-1 flex items-start gap-1.5 rounded-md border border-[#E3EAF2] bg-[#FCFDFE] px-2 py-1">
              <span className="pt-px text-[9.5px] text-[#93A3B6]">e.g.</span>
              <code className="font-mono text-[10.5px] break-all whitespace-pre-wrap text-[#0B7D76]">{p.example}</code>
            </div>
          </div>
        ))}
      </div>
      {svc.nOptionalMore > 0 && (
        <div className="mt-3 border-t border-[#EFF3F8] pt-2 text-[10.5px] text-[#93A3B6]">
          + {svc.nOptionalMore} more optional parameters · {svc.rtype} · oci {PROVIDER_VERSION}
        </div>
      )}
    </div>
  );
}
