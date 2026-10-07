# Kladen platform on OCI (Always Free)

This provisions the OCI services Kladen needs to run remotely and store
remotely, and explains how to wire the backend to them. Everything defaults to
the Always Free tier.

```
deploy/
  *.tf                 Terraform for ATP, buckets, Vault, runner VM, IAM
  cloud-init/runner.yaml   VM bootstrap (Docker + OpenTofu + Python SDKs)
  sql/schema_atp.sql   Oracle metadata schema (dual-mode profiles + pointers)
  terraform.tfvars.example
```

## Storage strategy — what goes where

| Data | Store | Why |
|---|---|---|
| Metadata: orgs, clients, stacks, runs, profile **pointers**, users, approvals | **ATP** (`atp.tf`) | Relational, transactional, tiny, queried constantly |
| Run logs, `plan.json`/`result.json`, generated HCL, reports | **Object Storage** — artifacts bucket | Large append-only blobs; DB keeps only the object prefix |
| OpenTofu **state** | **Object Storage** — state bucket, via the state service | Versioned + locked; OpenTofu has no native Oracle backend |
| Client OCI **credentials & private keys** | **OCI Vault** secret, with **manual on-disk fallback** | Secrets never sit in DB or bucket in plaintext |
| Platform's own identity on the VM | **Instance principals** (`iam.tf`) | No API keys on the VM |

The DB stores credentials only for *manual* profiles (and even then the private
key is a path, not the key). *Vault* profiles store just the secret OCID.

## Step 1 — apply the bundle

You need an OCI account, an API key in `~/.oci/config`, and OpenTofu/Terraform.

```sh
cd deploy
cp terraform.tfvars.example terraform.tfvars   # fill in your values
tofu init
tofu plan       # review — everything should be free-tier
tofu apply
```

Note the outputs (`tofu output`): `runner_public_ip`, `adb_id`, `vault_id`,
`master_key_id`, `namespace`, `artifacts_bucket`, `state_bucket`,
`compartment_ocid`. You'll feed several into the backend as env vars.

## Step 2 — load the ATP schema

Download the wallet and connect as ADMIN, then run the schema:

```sh
# Download the wallet (or use the console: ATP > DB Connection > Download Wallet)
oci db autonomous-database generate-wallet --autonomous-database-id <adb_id> \
  --file deploy/wallet.zip --password '<wallet-password>'
mkdir -p deploy/wallet && unzip -o deploy/wallet.zip -d deploy/wallet

# Load the schema with any Oracle client (SQLcl shown):
sql /nolog
SQL> set cloudconfig deploy/wallet/wallet.zip
SQL> connect ADMIN/<adb-admin-password>@kladendb_high
SQL> @deploy/sql/schema_atp.sql
```

Smoke-test connectivity from the backend:

```sh
KLADEN_ATP_USER=ADMIN KLADEN_ATP_PASSWORD='<pw>' KLADEN_ATP_DSN=kladendb_high \
KLADEN_ATP_WALLET_DIR=deploy/wallet KLADEN_ATP_WALLET_PASSWORD='<wallet-pw>' \
python3 backend/atp.py healthcheck
# -> connected: SELECT returned 'ok'; kladen tables present: 6/6
```

## Step 3 — configure the Vault (client credentials)

The vault and master key already exist (`vault.tf`). A client's credentials are
one **secret** whose plaintext is a JSON bundle:

```json
{
  "tenancy_ocid": "ocid1.tenancy.oc1..…",
  "user_ocid": "ocid1.user.oc1..…",
  "fingerprint": "aa:bb:…",
  "region": "eu-frankfurt-1",
  "compartment_ocid": "ocid1.compartment.oc1..…",
  "private_key_pem": "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
}
```

Two ways to create it — **both supported, and you need the first to bootstrap**:

**A. Let Kladen create it** (the manual→vault bridge). In the Profiles screen,
"Configure manually", fill the client's credentials, and the backend can push
them into Vault when `store_in_vault` is set (needs `KLADEN_VAULT_ID`,
`KLADEN_VAULT_KEY_ID`, `KLADEN_COMPARTMENT_ID` in the backend env). It stores a
vault-mode profile pointing at the new secret.

**B. Create the secret yourself**, then reference it:

```sh
BUNDLE=$(jq -c . client-acme.json | base64)
oci vault secret create-base64 \
  --compartment-id <compartment_ocid> \
  --secret-name kladen-acme-prod \
  --vault-id <vault_id> \
  --key-id <master_key_id> \
  --secret-content-content "$BUNDLE"
# copy the returned secret OCID
```

Then in the Profiles screen choose **"Fetch from Vault"** and paste the secret
OCID. At run time Kladen pulls the bundle, writes the key to a 0600 temp file
used only for that run, and wipes it after.

## Step 4 — point the backend at OCI

Set these where `backend/api.py` runs (locally, or on the VM):

```sh
export KLADEN_OCI_AUTH=config          # 'instance_principal' on the VM
export KLADEN_ARTIFACTS_BUCKET=kladen-artifacts
export KLADEN_OS_NAMESPACE=<namespace>
export KLADEN_VAULT_ID=<vault_id>              # for the manual->vault bridge
export KLADEN_VAULT_KEY_ID=<master_key_id>
export KLADEN_COMPARTMENT_ID=<compartment_ocid>
# ATP as the metadata store (KLADEN_DB=atp turns it on):
export KLADEN_DB=atp
export KLADEN_ATP_USER=KLADEN KLADEN_ATP_PASSWORD=... KLADEN_ATP_DSN=kladendb_high
export KLADEN_ATP_WALLET_DIR=/abs/path/deploy/wallet KLADEN_ATP_WALLET_PASSWORD=...
```

Nothing here is required to run locally — with none of it set, the backend uses
SQLite for metadata and the local filesystem for artifacts, exactly as before.
Each variable you add turns on the corresponding OCI store.

**With `KLADEN_DB=atp`** the backend reads and writes all metadata to ATP
(the same code runs on both engines via `backend/db.py`). On first boot against
an empty schema it seeds the demo org/clients/stacks and imports your
`~/.oci/config` as the workspace default profile — just like the SQLite path.
The Oracle schema keeps timestamps and `summary_json` as VARCHAR2 and names the
runs mode column `run_mode` (MODE is reserved); the backend maps it back to the
`mode` field, so the API contract is identical.

## Step 5 — run on the VM (instance principals)

```sh
ssh opc@<runner_public_ip>
# app ports aren't public — tunnel them from your laptop instead:
ssh -L 8400:localhost:8400 -L 8000:localhost:8000 opc@<runner_public_ip>
```

Deploy the app (git pull / rsync the repo to `/opt/kladen`), set
`KLADEN_OCI_AUTH=instance_principal`, and start `backend/api.py`. The IAM policy
in `iam.tf` lets the VM read Vault secrets, read/write the buckets, and use ATP
with **no keys on the VM**.

## What's live vs. staged

- **Live now**: dual-mode profiles (manual + Vault) end to end; run-time Vault
  fetch of the credential bundle; artifact upload to Object Storage (gated by
  `KLADEN_ARTIFACTS_BUCKET`); the runner executing real tofu; **ATP as the
  metadata store** via `KLADEN_DB=atp` — verified end to end (seed, CRUD, run
  lifecycle, approvals) on Oracle 23c.
- **Provisioned by this bundle** (you apply): ATP, buckets, Vault + key, runner
  VM, IAM.
- **Note on the schema**: if you loaded `sql/schema_atp.sql` before this change,
  reload it — the timestamp and `summary_json` columns are now VARCHAR2 and the
  runs mode column is `run_mode`. Uncomment the DROP block at the top of the
  file (the tables are empty until the app runs) and re-run it.
