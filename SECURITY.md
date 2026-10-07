# Security

Kladen handles cloud credentials and can create and destroy real infrastructure, so this
file tells you plainly what is and isn't safe today.

## Reporting a vulnerability

Please **don't open a public issue.** Use GitHub's private vulnerability reporting
("Report a vulnerability" under this repo's **Security** tab). You'll get an
acknowledgement within a few days. This is a solo-maintained project, so fixes may take
longer than that.

## Current state: prototype, not production-ready

Run Kladen locally, against a **test** tenancy, with credentials you can revoke. Don't
expose it on a network or point it at production. These shortcuts are known and
deliberate for now (tracked in `docs/DECISIONS.md`, ADR-0006):

| Shortcut | Risk | Intended design |
|---|---|---|
| **Seeded demo accounts** with passwords published in the code and on the login screen | Anyone who can reach the UI can log in as admin | Seeding behind an explicit opt-in flag; first-run admin setup |
| **No auth on the state service** (:8300) | Anyone who can reach it can read or overwrite OpenTofu state, which can contain sensitive values | Per-run tokens issued by the platform API |
| **In-memory locks and sessions** | Restarting a process drops locks and logs everyone out; no multi-instance safety | Locks and sessions persisted in the metadata DB |
| **Host `~/.oci` key** mounted read-only into the runner container | Runs use the host operator's identity | Per-client credentials injected from OCI Vault (the code path exists, see `deploy/`) |
| **Local Docker runner** | Runs share the host's Docker daemon | Isolated job execution (e.g. OKE jobs) |

## Rules the code keeps

- Secrets are never written into the resource model or the generated OpenTofu code.
  Credentials reach a run as environment variables and a read-only key mount, or are
  fetched from OCI Vault at run time.
- Apply and destroy need an approval, and run exactly the plan that was reviewed.
- Client data is isolated per tenant in both backend services; cross-client access
  returns 403.
- The CIS checks and the posture report are **advisory**. They are not a certified
  compliance audit.

## Don't commit tenancy data

When contributing, never commit real OCIDs, tenancy or namespace names, API keys,
wallets, `terraform.tfvars`, or state files. `.gitignore` covers the usual paths;
check your diff anyway.
