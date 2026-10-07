import { useState } from "react";
import { login, type AuthUser } from "../api";

// The demo accounts seeded by the backend (DEMO_USERS in api.py). Shown as
// one-click fills so every role is easy to test.
const DEMO = [
  { role: "admin", email: "admin@meridian.io", password: "admin123", label: "Full access · manage users · view as any role" },
  { role: "senior", email: "senior@meridian.io", password: "senior123", label: "Design, plan, approve, apply, destroy" },
  { role: "junior", email: "junior@meridian.io", password: "junior123", label: "Design + validate/plan (no deploy)" },
  { role: "management", email: "manager@meridian.io", password: "manager123", label: "Dashboard + reports · read-only builder" },
];

export default function Login({ onLogin }: { onLogin: (u: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const user = await login(email.trim(), password);
    setBusy(false);
    if (user) onLogin(user);
    else setError("Invalid email or password, or the platform API is offline.");
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#0F1B2D] font-sans text-[13px] text-[#1E2B3C]">
      <div className="w-[380px] rounded-[14px] bg-white p-7 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-[#0FA79E] font-display text-[14px] font-semibold text-[#08201E]">
            K
          </div>
          <div className="font-display text-[18px] font-semibold text-[#0F1B2D]">Kladen</div>
        </div>
        <div className="mb-1 font-display text-[15px] font-semibold text-[#0F1B2D]">Sign in</div>
        <div className="mb-4 text-[11.5px] text-[#7A8CA1]">Meridian MSP workspace</div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="mb-1 block text-[11px] font-medium text-[#5F7490]">Email</label>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@meridian.io"
            className="focus-ring mb-3 w-full rounded-md border border-[#E3EAF2] bg-[#FCFDFE] px-3 py-2 text-[12.5px] text-[#1E2B3C] placeholder:text-[#B5C2D2]"
          />
          <label className="mb-1 block text-[11px] font-medium text-[#5F7490]">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="focus-ring mb-3 w-full rounded-md border border-[#E3EAF2] bg-[#FCFDFE] px-3 py-2 text-[12.5px] text-[#1E2B3C] placeholder:text-[#B5C2D2]"
          />
          {error && <div className="mb-3 text-[11.5px] text-[#B4514D]">{error}</div>}
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="focus-ring w-full cursor-pointer rounded-md bg-[#0FA79E] py-2 font-semibold text-white hover:bg-[#0C8C85] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-5 border-t border-[#EFF3F8] pt-3">
          <div className="mb-2 text-[10px] font-semibold tracking-[1px] text-[#93A3B6]">DEMO ACCOUNTS · CLICK TO FILL</div>
          <div className="flex flex-col gap-1.5">
            {DEMO.map((d) => (
              <button
                type="button"
                key={d.role}
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
                className="focus-ring flex cursor-pointer items-center gap-2 rounded-md border border-[#E9EFF5] bg-[#FCFDFE] px-2.5 py-1.5 text-left hover:border-[#0FA79E]"
              >
                <span className="rounded-[5px] bg-[#E6F5F4] px-[7px] py-px text-[10px] font-semibold text-[#0B7D76] capitalize">
                  {d.role}
                </span>
                <span className="text-[11.5px] text-[#5F7490]">{d.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
