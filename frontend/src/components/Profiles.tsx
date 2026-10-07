import { useState } from "react";
import {
  createProfile, updateProfile, deleteProfile, pinStackProfile,
  type ApiClient, type ApiProfile, type ApiStack, type Bootstrap,
} from "../api";

/** Configuration profiles, scoped per customer (the MSP workspace) and per
 *  client. Each profile is one OCI identity: tenancy/user/fingerprint/key
 *  plus region and default compartment. A run resolves its profile:
 *  stack pin -> client profile matching the stack env -> any client profile
 *  -> workspace default. */
export default function Profiles({ boot, onChanged }: { boot: Bootstrap | null; onChanged: () => void }) {
  if (!boot) {
    return (
      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="font-display text-[17px] font-semibold text-[#0F1B2D]">Configuration profiles</div>
        <div className="mt-4 max-w-[560px] rounded-[10px] border border-[#E3EAF2] bg-white p-5 text-[12.5px] leading-[1.6] text-[#41536A]">
          The API is offline, so profiles cannot be managed right now. Start it with
          <code className="mx-1 rounded bg-[#F0F4F9] px-1.5 py-0.5 font-mono text-[11.5px]">python3 backend/api.py</code>
          and reload.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-6 py-5">
      <div className="font-display text-[17px] font-semibold text-[#0F1B2D]">Configuration profiles</div>
      <div className="mt-0.5 mb-1 text-[12px] text-[#7A8CA1]">
        OCI credentials scoped per client, with workspace-level defaults · private keys stay on disk, only the path is stored
      </div>
      <div className="mb-4 text-[11px] text-[#93A3B6]">
        Resolution per run: stack pin → client profile matching the stack&#39;s env → any client profile → workspace default
      </div>

      <div className="flex max-w-[980px] flex-col gap-4">
        <ScopeCard
          title={`${boot.org.name} · workspace defaults`}
          subtitle="Used by any stack whose client has no profile of its own"
          profiles={boot.profiles}
          clientId={null}
          onChanged={onChanged}
        />
        {boot.clients.map((cl) => (
          <ClientCard key={cl.id} client={cl} orgProfiles={boot.profiles} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function ClientCard({
  client, orgProfiles, onChanged,
}: {
  client: ApiClient;
  orgProfiles: ApiProfile[];
  onChanged: () => void;
}) {
  return (
    <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
      <div className="flex items-center gap-[9px]">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[#0F1B2D] text-[10px] font-semibold text-[#9FD8D3]">
          {client.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div className="font-display text-[13.5px] font-semibold text-[#0F1B2D]">{client.name}</div>
        <div className="text-[11px] text-[#7A8CA1]">
          {client.profiles.length} profile{client.profiles.length === 1 ? "" : "s"} ·{" "}
          {client.profiles.length === 0 ? "falls back to workspace default" : "own tenancy credentials"}
        </div>
      </div>

      <ProfileList profiles={client.profiles} onChanged={onChanged} />
      <AddProfile clientId={client.id} onChanged={onChanged} />

      {client.stacks.length > 0 && (
        <>
          <div className="mt-4 mb-1.5 text-[10px] font-semibold tracking-[1px] text-[#93A3B6]">STACK PROFILE PINS</div>
          <div className="flex flex-col gap-1.5">
            {client.stacks.map((st) => (
              <StackPin key={st.id} stack={st} choices={[...client.profiles, ...orgProfiles]} onChanged={onChanged} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ScopeCard({
  title, subtitle, profiles, clientId, onChanged,
}: {
  title: string;
  subtitle: string;
  profiles: ApiProfile[];
  clientId: number | null;
  onChanged: () => void;
}) {
  return (
    <div className="rounded-[10px] border border-[#E3EAF2] bg-white p-4">
      <div className="font-display text-[13.5px] font-semibold text-[#0F1B2D]">{title}</div>
      <div className="text-[11px] text-[#7A8CA1]">{subtitle}</div>
      <ProfileList profiles={profiles} onChanged={onChanged} />
      <AddProfile clientId={clientId} onChanged={onChanged} />
    </div>
  );
}

const mask = (s: string, keep = 10) => (s.length > keep ? `…${s.slice(-keep)}` : s);

function ProfileList({ profiles, onChanged }: { profiles: ApiProfile[]; onChanged: () => void }) {
  // Which profile (if any) is currently open in its inline edit form.
  const [editingId, setEditingId] = useState<number | null>(null);
  if (profiles.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {profiles.map((p) =>
        editingId === p.id ? (
          // Inline edit form, prefilled from this profile. Same form as "add",
          // in edit mode — saving PUTs the changes; cancel closes it untouched.
          <ProfileForm
            key={p.id}
            clientId={p.client_id}
            edit={p}
            onClose={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              onChanged();
            }}
          />
        ) : (
          <div key={p.id} className="flex items-center gap-3 rounded-md border border-[#E9EFF5] bg-[#FCFDFE] px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-semibold text-[#0F1B2D]">{p.name}</span>
                {p.env && (
                  <span className="rounded-[9px] bg-[#E6F5F4] px-[7px] py-px text-[10px] font-semibold text-[#0B7D76]">
                    {p.env}
                  </span>
                )}
                <span className="font-mono text-[10.5px] text-[#7A8CA1]">{p.region}</span>
                {p.source !== "manual" && (
                  <span className="rounded-[9px] bg-[#F0F4F9] px-[7px] py-px text-[10px] text-[#7A8CA1]">{p.source}</span>
                )}
              </div>
              {p.source === "vault" ? (
                <div className="mt-0.5 truncate font-mono text-[10.5px] text-[#93A3B6]">
                  🔒 vault secret {mask(p.secret_ocid ?? "")}
                  {p.vault_id ? ` · vault ${mask(p.vault_id)}` : ""} · fetched at run time
                </div>
              ) : (
                <div className="mt-0.5 truncate font-mono text-[10.5px] text-[#93A3B6]">
                  tenancy {mask(p.tenancy_ocid)} · user {mask(p.user_ocid)} · fp {p.fingerprint.slice(-8)} · key{" "}
                  {p.key_path} {p.compartment_ocid && `· compartment ${mask(p.compartment_ocid)}`}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditingId(p.id)}
              className="focus-ring ml-auto shrink-0 cursor-pointer rounded-md border border-[#E3EAF2] px-2.5 py-1 text-[11px] font-medium text-[#41536A] hover:border-[#0FA79E] hover:text-[#0B7D76]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={async () => {
                await deleteProfile(p.id);
                onChanged();
              }}
              className="focus-ring shrink-0 cursor-pointer rounded-md border border-[#F2DBDB] px-2.5 py-1 text-[11px] font-medium text-[#B4514D] hover:bg-[#FBF1F0]"
            >
              Remove
            </button>
          </div>
        ),
      )}
    </div>
  );
}

const EMPTY = {
  name: "", env: "", region: "", tenancy_ocid: "", user_ocid: "",
  fingerprint: "", key_path: "", compartment_ocid: "",
  vault_id: "", secret_ocid: "",
};

type Mode = "manual" | "vault";

// Prefill the form state from an existing profile (edit mode).
const fromProfile = (p: ApiProfile): typeof EMPTY => ({
  name: p.name, env: p.env, region: p.region,
  tenancy_ocid: p.tenancy_ocid, user_ocid: p.user_ocid,
  fingerprint: p.fingerprint, key_path: p.key_path,
  compartment_ocid: p.compartment_ocid,
  vault_id: p.vault_id ?? "", secret_ocid: p.secret_ocid ?? "",
});

// Collapsed "+ Add profile" trigger. Expands into a blank ProfileForm.
function AddProfile({ clientId, onChanged }: { clientId: number | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring mt-2.5 cursor-pointer rounded-md border border-[#E3EAF2] px-3 py-1.5 text-[11.5px] font-medium text-[#41536A] hover:border-[#0FA79E] hover:text-[#0B7D76]"
      >
        + Add profile
      </button>
    );
  }
  return (
    <ProfileForm
      clientId={clientId}
      onClose={() => setOpen(false)}
      onSaved={() => {
        setOpen(false);
        onChanged();
      }}
    />
  );
}

/** The create/edit form for one configuration profile. Without `edit` it creates
 *  a new profile (POST); with `edit` it updates that profile (PUT). Source
 *  (manual vs vault) is chosen only on create — editing keeps the same source,
 *  since switching how a profile authenticates is a delete-and-recreate. */
function ProfileForm({
  clientId, edit, onClose, onSaved,
}: {
  clientId: number | null;
  edit?: ApiProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<Mode>(edit?.source === "vault" ? "vault" : "manual");
  const [f, setF] = useState<typeof EMPTY>(() => (edit ? fromProfile(edit) : { ...EMPTY }));
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const valid =
    mode === "vault"
      ? f.name && f.secret_ocid
      : f.name && f.region && f.tenancy_ocid && f.user_ocid && f.fingerprint && f.key_path;

  const field = (label: string, k: keyof typeof EMPTY, placeholder: string, required = true) => (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[#5F7490]">
        {label}
        {required && <span className="ml-1 text-[#9A6B1F]">*</span>}
      </span>
      <input
        value={f[k]}
        onChange={set(k)}
        placeholder={placeholder}
        className="focus-ring w-full rounded-md border border-[#E3EAF2] bg-[#FCFDFE] px-2.5 py-[7px] font-mono text-[11.5px] text-[#1E2B3C] placeholder:text-[#B5C2D2]"
      />
    </label>
  );

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`focus-ring cursor-pointer rounded-md px-3 py-1 text-[11.5px] font-medium ${
        mode === m ? "bg-[#0FA79E] text-white" : "border border-[#E3EAF2] text-[#41536A] hover:border-[#0FA79E]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-3 rounded-md border border-[#E3EAF2] bg-[#F8FAFC] p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[12px] font-semibold text-[#0F1B2D]">
          {edit ? `Edit ${edit.name}` : `New profile ${clientId === null ? "(workspace default)" : ""}`}
        </span>
        {/* Source is chosen only on create; editing keeps the same source. */}
        {!edit && (
          <span className="ml-auto flex gap-1.5">
            {tab("manual", "Configure manually")}
            {tab("vault", "Fetch from Vault")}
          </span>
        )}
      </div>

      {mode === "vault" ? (
        <>
          <div className="mb-2.5 rounded-md bg-[#E6F5F4] px-2.5 py-1.5 text-[10.5px] leading-[1.5] text-[#0B7D76]">
            Credentials stay in OCI Vault. Kladen stores only the secret OCID and fetches the bundle at run
            time. Create the secret first (deploy/README.md) — the plaintext is a JSON credential bundle.
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {field("Profile name", "name", "acme-prod")}
            {field("Environment (optional)", "env", "prod", false)}
            {field("Secret OCID", "secret_ocid", "ocid1.vaultsecret.oc1..…")}
            {field("Vault OCID (optional)", "vault_id", "ocid1.vault.oc1..…", false)}
            {field("Region (optional)", "region", "eu-frankfurt-1", false)}
            {field("Compartment OCID (optional)", "compartment_ocid", "ocid1.compartment.oc1..…", false)}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {field("Profile name", "name", "prod-tenancy")}
          {field("Environment (optional)", "env", "prod", false)}
          {field("Region", "region", "eu-frankfurt-1")}
          {field("Compartment OCID (optional)", "compartment_ocid", "ocid1.compartment.oc1..…", false)}
          {field("Tenancy OCID", "tenancy_ocid", "ocid1.tenancy.oc1..…")}
          {field("User OCID", "user_ocid", "ocid1.user.oc1..…")}
          {field("Fingerprint", "fingerprint", "aa:bb:cc:…")}
          {field("Private key path (PEM on the Kladen host)", "key_path", "/etc/kladen/keys/acme.pem")}
        </div>
      )}

      {error && <div className="mt-2 text-[11.5px] text-[#B4514D]">{error}</div>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!valid}
          onClick={async () => {
            const payload =
              mode === "vault"
                ? {
                    source: "vault", client_id: clientId, name: f.name, env: f.env,
                    secret_ocid: f.secret_ocid, vault_id: f.vault_id, region: f.region,
                    compartment_ocid: f.compartment_ocid,
                  }
                : { ...f, source: "manual", client_id: clientId };
            // Edit -> PUT the changes; new -> POST a fresh profile.
            const saved = edit ? await updateProfile(edit.id, payload) : await createProfile(payload);
            if (saved) {
              onSaved();
            } else {
              setError("Could not save the profile — check the required fields and that the API is running.");
            }
          }}
          className="focus-ring cursor-pointer rounded-md bg-[#0FA79E] px-4 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[#0C8C85] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {edit ? "Save changes" : "Save profile"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring cursor-pointer rounded-md border border-[#E3EAF2] px-4 py-1.5 text-[11.5px] font-medium text-[#41536A] hover:border-[#0FA79E] hover:text-[#0B7D76]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function StackPin({
  stack, choices, onChanged,
}: {
  stack: ApiStack;
  choices: ApiProfile[];
  onChanged: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-[#EFF3F8] px-3 py-1.5">
      <span className="font-mono text-[11.5px] text-[#41536A]">{stack.name}</span>
      <span className="text-[10px] text-[#93A3B6]">{stack.env}</span>
      <label className="ml-auto flex items-center gap-1.5 text-[10.5px] text-[#7A8CA1]">
        profile
        <select
          value={stack.profile_id ?? ""}
          onChange={async (e) => {
            await pinStackProfile(stack.id, e.target.value === "" ? null : Number(e.target.value));
            onChanged();
          }}
          className="focus-ring cursor-pointer rounded-md border border-[#E3EAF2] bg-white px-2 py-1 text-[11px] text-[#1E2B3C]"
        >
          <option value="">Auto (resolve by scope)</option>
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.client_id === null ? " · workspace" : ""}
              {p.env ? ` · ${p.env}` : ""}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
