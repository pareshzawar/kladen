// Diagram tab: a hand-laid-out architecture picture of the demo stack.
// STATIC for now — it does not read the drawboard model yet. Real version
// (v2 in the architecture) generates this from the same JSON model that
// drives codegen.

export default function DiagramTab() {
  return (
    <div className="flex-1 overflow-auto px-5 py-4">
      <div className="mb-3.5 flex items-center gap-2.5">
        <div className="font-display text-[15px] font-semibold text-[#0F1B2D]">Architecture diagram</div>
        <div className="text-[11px] text-[#7A8CA1]">Auto-generated from stack design · updated 2 min ago</div>
        <div className="ml-auto flex gap-2">
          {["Export SVG", "Export PNG", "Include in docs"].map((a) => (
            <button
              type="button"
              key={a}
              className="focus-ring cursor-pointer rounded-md border border-[#E3EAF2] bg-white px-3 py-1.5 font-medium text-[#41536A] hover:border-[#0FA79E] hover:text-[#0B7D76]"
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center gap-10 rounded-xl border border-[#E3EAF2] bg-white p-[34px]">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-[9px] rounded-[20px] border-[1.5px] border-[#C6D2DF] bg-[#F8FAFC] px-[18px] py-2 font-semibold text-[#41536A]">
            <div className="h-[9px] w-[9px] rounded-full border-2 border-[#7A8CA1]" />
            Internet
          </div>
          <div className="h-[26px] w-[1.5px] bg-[#9DB0C4]" />
          <div className="-mt-px h-0 w-0 border-t-[6px] border-r-4 border-l-4 border-t-[#9DB0C4] border-r-transparent border-l-transparent" />

          <div className="w-[560px] rounded-xl border-[1.5px] border-dashed border-[#8FA6BF] bg-[#FAFCFE] p-[18px]">
            <div className="mb-3 font-mono text-[11px] text-[#5F7490]">VCN · vcn-acme-prod · 10.0.0.0/16</div>

            <div className="rounded-[9px] border border-[#DCE6F0] bg-white p-3">
              <div className="mb-2 text-[10px] font-semibold tracking-[0.8px] text-[#93A3B6]">PUBLIC SUBNET · 10.0.0.0/24</div>
              <div className="flex gap-2.5">
                <div className="flex-1 rounded-[7px] border-[1.5px] border-[#0FA79E] bg-[#F4FBFA] px-3 py-[9px]">
                  <div className="text-[12px] font-semibold text-[#0F1B2D]">API Gateway</div>
                  <div className="font-mono text-[9.5px] text-[#7A8CA1]">public · 12 routes</div>
                </div>
                <div className="flex-1 rounded-[7px] border-[1.5px] border-[#0FA79E] bg-[#F4FBFA] px-3 py-[9px]">
                  <div className="text-[12px] font-semibold text-[#0F1B2D]">Load Balancer</div>
                  <div className="font-mono text-[9.5px] text-[#7A8CA1]">flexible · 100 Mbps</div>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="h-5 w-[1.5px] bg-[#9DB0C4]" />
            </div>

            <div className="rounded-[9px] border border-[#DCE6F0] bg-white p-3">
              <div className="mb-2 text-[10px] font-semibold tracking-[0.8px] text-[#93A3B6]">PRIVATE SUBNET · 10.0.1.0/24</div>
              <div className="flex gap-2.5">
                <div className="flex-[1.2] rounded-[7px] border border-[#DCE6F0] px-3 py-[9px]">
                  <div className="text-[12px] font-semibold text-[#0F1B2D]">OKE Cluster</div>
                  <div className="font-mono text-[9.5px] text-[#7A8CA1]">v1.31 · 3 node pools</div>
                  <div className="mt-[7px] flex gap-[5px]">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-4 w-4 rounded border border-[#BFE5E2] bg-[#E6F5F4]" />
                    ))}
                  </div>
                </div>
                <div className="flex-1 rounded-[7px] border border-[#DCE6F0] px-3 py-[9px]">
                  <div className="text-[12px] font-semibold text-[#0F1B2D]">Compute ×2</div>
                  <div className="font-mono text-[9.5px] text-[#7A8CA1]">VM.Standard.E5.Flex</div>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="h-5 w-[1.5px] bg-[#9DB0C4]" />
            </div>

            <div className="rounded-[9px] border border-[#DCE6F0] bg-white p-3">
              <div className="mb-2 text-[10px] font-semibold tracking-[0.8px] text-[#93A3B6]">DATABASE SUBNET · 10.0.2.0/24</div>
              <div className="w-[240px] rounded-[7px] border border-[#DCE6F0] px-3 py-[9px]">
                <div className="text-[12px] font-semibold text-[#0F1B2D]">Autonomous Database</div>
                <div className="font-mono text-[9.5px] text-[#7A8CA1]">OLTP · 4 ECPU · 1 TB · mTLS</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-3.5">
          <div className="flex items-center">
            <div className="h-[1.5px] w-[34px] bg-[#9DB0C4]" />
            <div className="rounded-lg border border-[#DCE6F0] bg-white px-3.5 py-2.5">
              <div className="text-[12px] font-semibold text-[#0F1B2D]">Object Storage</div>
              <div className="font-mono text-[9.5px] text-[#7A8CA1]">3 buckets · private · versioned</div>
            </div>
          </div>
          <div className="pl-[34px] text-[10px] text-[#93A3B6]">
            via Service Gateway
            <br />
            no public endpoint
          </div>
        </div>
      </div>
    </div>
  );
}
