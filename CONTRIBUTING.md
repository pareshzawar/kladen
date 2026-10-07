# Contributing to Kladen

Thanks for looking. Kladen is early and solo-maintained, so small, focused changes are
the easiest to land.

## Before you start

- **Open an issue first** for anything bigger than a bug fix, so we can agree on the
  approach before you spend time on it.
- Read [`docs/DECISIONS.md`](docs/DECISIONS.md). It records why things are the way they
  are, and a PR that quietly reverses one of those decisions will be asked to make the
  case in a new ADR entry instead.
- Get it running with the steps in the [README](README.md#run-it-locally).

## Ground rules

1. **OpenTofu only, never Terraform** (licensing, see ADR-0001).
2. **The JSON model is the source of truth; codegen is one-way, model → HCL.** No
   features that edit generated code and sync it back.
3. **Adding a resource type** means a `ResourceType` in `frontend/src/model.ts` **and** a
   matching Jinja2 template in `backend/app.py`, with identical keys and field names.
4. **No secrets** in the model, generated HCL, tests, fixtures, or docs. No real OCIDs or
   tenancy names either; use placeholders like `ocid1.compartment.oc1..xxxx`.
5. **Comment your code.** Every function gets a short comment saying what it does and
   why; explain anything non-obvious. Plain, readable code beats clever code here.
6. **Be honest in docs and UI.** Never present a security or compliance capability as
   finished when it isn't, and keep [`docs/STATUS.md`](docs/STATUS.md) accurate when your
   change affects it.

## Pull requests

- One logical change per PR, with a description of what it does and how you tested it
  (ideally which OpenTofu run you tried it against: plan, apply, drift…).
- If the change touches credentials, approvals, tenant isolation, or the state service,
  say so in the description; those get a closer review.
- Security issues go through [`SECURITY.md`](SECURITY.md), not a public PR or issue.

## License

Kladen is licensed under [AGPL-3.0](LICENSE). By submitting a contribution you agree it
is licensed under the same terms. The project may later ask contributors to sign a
contributor agreement; if that happens, it will be stated here before it applies to you.
