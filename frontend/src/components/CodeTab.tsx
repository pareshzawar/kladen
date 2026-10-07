// OpenTofu tab: a VIEWER for generated code — no HCL is produced here.
// The actual generator is the Python service in backend/app.py: this
// component POSTs the current stack model to /api/generate and displays
// whatever files come back. Vite proxies /api/* to localhost:8000
// (see vite.config.ts), so the backend must be running for this tab.

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { authHeaders, registerWorkspace } from "../api";

// Shape of one generated file returned by POST /api/generate.
interface GenFile {
  name: string;
  content: string;
}

// Minimal HCL token coloring for the generated-code view (Monaco comes later,
// with the editing escape hatch).
const COLORS = { CMT: "#54687F", KW: "#5EC9C0", STR: "#A3C98F", ATTR: "#C9D6E3", NUM: "#D9A05B", REF: "#8FB7DC" };
const TOKEN = /("[^"]*")|(\b(?:true|false|\d+)\b)|(\b(?:var|local|oci_\w+|data)\.[\w.[\]]+)|(^\s*(?:resource|output|variable|provider|terraform|locals)\b)/gm;

function colorLine(line: string, key: number) {
  if (/^\s*#/.test(line)) {
    return (
      <span key={key} style={{ color: COLORS.CMT }}>
        {line}
      </span>
    );
  }
  const parts: { t: string; c: string }[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index! > last) parts.push({ t: line.slice(last, m.index), c: COLORS.ATTR });
    const c = m[1] ? COLORS.STR : m[2] ? COLORS.NUM : m[3] ? COLORS.REF : COLORS.KW;
    parts.push({ t: m[0], c });
    last = m.index! + m[0].length;
  }
  if (last < line.length) parts.push({ t: line.slice(last), c: COLORS.ATTR });
  return parts.map((p, j) => (
    <span key={`${key}-${j}`} style={{ color: p.c }}>
      {p.t}
    </span>
  ));
}

export default function CodeTab({ onRegistered, canSync = true }: { onRegistered?: () => void; canSync?: boolean }) {
  const { client, stack, getType } = useStore();
  const [files, setFiles] = useState<GenFile[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<{ ok: boolean; text: string } | null>(null);

  // The request body for the codegen service: which client/stack this is,
  // plus every resource on the board with its config. Memoized as a string
  // so the effect below re-fetches exactly when the model actually changes.
  const payload = useMemo(
    () =>
      JSON.stringify({
        client: client.name,
        stack: stack!.name,
        env: stack!.env,
        // rtype rides along so the backend can render admin-created custom
        // types through its generic template (they have no dedicated one).
        resources: stack!.resources.map((r) => ({ type: r.typeKey, config: r.config, rtype: getType(r.typeKey).rtype })),
      }),
    [client.name, stack, getType],
  );

  // Call the Python generator whenever the model changes. `cancelled` guards
  // against a slow older response overwriting a newer one after unmount.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: payload })
      .then((r) => {
        if (!r.ok) throw new Error(`codegen service returned ${r.status}`);
        return r.json();
      })
      .then((d: { files: GenFile[] }) => {
        if (cancelled) return;
        setFiles(d.files);
        setActive((a) => Math.min(a, d.files.length - 1));
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const file = files[active];
  const totalLines = files.reduce((n, f) => n + f.content.split("\n").length, 0);

  return (
    <div className="flex min-h-0 flex-1 bg-[#0B1523]">
      <div className="w-[212px] shrink-0 overflow-y-auto border-r border-[#1C2C45] px-2.5 py-3.5">
        <div className="px-2 pb-2 text-[10px] font-semibold tracking-[1px] text-[#5A6D85]">
          FILES · {files.length} · {totalLines} LINES
        </div>
        {files.map((fl, i) => (
          <button
            key={fl.name}
            onClick={() => setActive(i)}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-[9px] py-1.5 text-left font-mono text-[12px] hover:bg-[#152238] ${
              i === active ? "bg-[#1C2C45] text-[#E7EDF5]" : "text-[#8FA3BA]"
            }`}
          >
            <span className="text-[10px] text-[#3E5470]">▤</span>
            {fl.name}
            <span className="ml-auto text-[10px] text-[#4E6178]">{fl.content.split("\n").length}</span>
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2.5 border-b border-[#1C2C45] px-[18px] py-2.5">
          <div className="font-mono text-[12.5px] text-[#E7EDF5]">{file?.name ?? "—"}</div>
          <div className="flex items-center gap-1.5 rounded-md border border-[rgba(15,167,158,0.3)] bg-[rgba(15,167,158,0.12)] px-[9px] py-[3px] text-[11px] text-[#6FCFC8]">
            <div className="h-1.5 w-1.5 rounded-full bg-[#0FA79E]" />
            Generated by Kladen · in sync with design
          </div>
          <div className="ml-auto flex items-center gap-2">
            {sync && (
              <span className={`text-[11px] ${sync.ok ? "text-[#6FCFC8]" : "text-[#E0A0A0]"}`}>{sync.text}</span>
            )}
            <button
              type="button"
              onClick={() => file && navigator.clipboard.writeText(file.content)}
              className="focus-ring cursor-pointer rounded-md border border-[#2A3D5C] px-[11px] py-[5px] text-[11.5px] text-[#AFBDD0] hover:border-[#0FA79E] hover:text-[#6FCFC8]"
            >
              Copy
            </button>
            {/* Materialize these files as a real workspace on the server and
                register it against the stack — that's what makes plan/apply
                possible for a design drawn on the board. */}
            <button
              type="button"
              disabled={files.length === 0 || !canSync}
              title={canSync ? undefined : "Read-only: your role can view the code but not register it."}
              onClick={async () => {
                setSync({ ok: true, text: "syncing…" });
                const res = await registerWorkspace({
                  client: client.name,
                  stack: stack!.name,
                  env: stack!.env,
                  files: files.map((f) => ({ name: f.name, content: f.content })),
                });
                if (res) {
                  setSync({ ok: true, text: `synced ${res.files} files · ready to plan` });
                  onRegistered?.();
                } else {
                  setSync({ ok: false, text: "sync failed — is the platform API running?" });
                }
              }}
              className="focus-ring cursor-pointer rounded-md bg-[#0FA79E] px-[11px] py-[5px] text-[11.5px] font-semibold text-white hover:bg-[#0C8C85] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sync to workspace
            </button>
          </div>
        </div>
        {error ? (
          <div className="m-5 rounded-md border border-[#5A3030] bg-[#1d1417] p-4 text-[12px] text-[#E0A0A0]">
            Codegen service unreachable ({error}). Start it with:{" "}
            <span className="font-mono text-[#E7C9C9]">cd backend && ./.venv/bin/uvicorn app:app --port 8000</span>
          </div>
        ) : (
          <div className="flex-1 overflow-auto py-3.5 font-mono text-[12.5px] leading-[1.75]">
            {file?.content.split("\n").map((line, i) => (
              <div key={i} className="flex">
                <div className="w-[52px] shrink-0 pr-[18px] text-right text-[#3E5470] select-none">{i + 1}</div>
                <div className="whitespace-pre">{colorLine(line, i)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
