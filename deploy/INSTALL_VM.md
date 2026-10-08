# Installing Kladen on the OCI runner VM

This deploys Kladen onto the free-tier VM that `deploy/` created. When you're
done, the whole app runs on the VM against your ATP, Vault, and Object Storage,
using **instance principals** (no OCI keys on the box).

## What runs on the VM

| Process | Port | Role |
|---|---|---|
| state service (`spike/state_server/server.py`) | 8300 | OpenTofu state + locking; mirrors to the state bucket |
| codegen API (`backend/app.py`, uvicorn) | 8000 (localhost) | drawboard world, HCL generation, tfstate import |
| platform API (`backend/api.py`) | 8400 (localhost) | clients/profiles/stacks/runs, ATP, Vault, artifacts |
| nginx | 80 | serves the built frontend, proxies `/api/*` to 8400 / 8000 |

Only nginx (:80) and SSH (:22) matter externally, and the security list opens
**only :22** — so you reach the UI over an SSH tunnel (hardening to a public
HTTPS endpoint is the last, optional step).

Auth model: the platform API and state service talk to Vault / Object Storage
with **instance principals** (the `iam.tf` dynamic group). ATP uses its own
wallet + DB user/password. No API keys are stored on the VM.

---

## Step 0 — prerequisites (already done by cloud-init)

`deploy/cloud-init/runner.yaml` installed Docker, Python 3.11, the OCI/oracledb
SDKs, git, and pre-pulled the OpenTofu image. Verify:

```sh
ssh opc@<runner_public_ip>
cat /etc/kladen/READY            # "kladen runner ready"
docker run --rm hello-world | head -1
python3.11 -c "import oci, oracledb; print('sdks ok')"
```

If `/etc/kladen/READY` is missing, cloud-init is still running — wait a minute
(`cloud-init status --wait`).

## Step 1 — get the code

These steps assume the app runs as a dedicated service user. Set it once and
reuse it (`opc` works too — use whatever user owns the code):

```sh
export KUSER=kladen        # the Linux user that owns /opt/kladen and runs the services
sudo useradd -m $KUSER 2>/dev/null || true
sudo usermod -aG docker $KUSER          # required: the runner launches containers
sudo mkdir -p /opt/kladen /etc/kladen
sudo chown -R $KUSER:$KUSER /opt/kladen /etc/kladen

sudo -u $KUSER git clone https://github.com/pareshzawar/kladen.git /opt/kladen
cd /opt/kladen
```

A new group membership only applies to new logins — after `usermod`, log out
and back in (or `newgrp docker`) before testing `docker ps` as that user.

Confirm the Python deps are importable (cloud-init installed them system-wide);
if anything is missing:

```sh
python3.11 -m pip install --user -r backend/requirements.txt
```

## Step 2 — upload the ATP wallet

From **your laptop**, in the root of your Kladen checkout (the wallet is secret — never commit it):

```sh
scp -r deploy/wallet opc@<runner_public_ip>:/etc/kladen/wallet
```

On the VM, lock it down:

```sh
chmod 700 /etc/kladen/wallet && chmod 600 /etc/kladen/wallet/*
```

Reload the schema if you haven't since the VARCHAR2 change (see
`deploy/README.md` — uncomment the DROP block, re-run `sql/schema_atp.sql` as
`KLADEN`). The tables must be empty; the app seeds them on first boot.

## Step 3 — the environment file

Create `/etc/kladen/kladen.env` (contains the ATP + wallet passwords, so keep
it 600):

```sh
cat > /etc/kladen/kladen.env <<'EOF'
# --- metadata store: ATP ---
KLADEN_DB=atp
KLADEN_ATP_USER=KLADEN
KLADEN_ATP_PASSWORD=your-atp-password
KLADEN_ATP_DSN=kladendb_high
KLADEN_ATP_WALLET_DIR=/etc/kladen/wallet
KLADEN_ATP_WALLET_PASSWORD=your-wallet-password

# --- OCI access: instance principals (no keys on the VM) ---
KLADEN_OCI_AUTH=instance_principal
KLADEN_COMPARTMENT_ID=ocid1.compartment.oc1..xxxx

# --- Object Storage ---
KLADEN_OS_NAMESPACE=your-namespace
KLADEN_ARTIFACTS_BUCKET=kladen-artifacts
KLADEN_STATE_BUCKET=kladen-tofu-state

# --- Vault (for the manual->vault bridge) ---
KLADEN_VAULT_ID=ocid1.vault.oc1..xxxx
KLADEN_VAULT_KEY_ID=ocid1.key.oc1..xxxx
EOF
chmod 600 /etc/kladen/kladen.env
```

Values come from `tofu output` in `deploy/` (`namespace`, `artifacts_bucket`,
`state_bucket`, `vault_id`, `master_key_id`, `compartment_ocid`) and your ATP
admin/wallet passwords.

## Step 4 — systemd services

Three units, all as `opc`, all reading the env file:

```sh
sudo tee /etc/systemd/system/kladen-state.service >/dev/null <<'EOF'
[Unit]
Description=Kladen state service
After=network-online.target docker.service
[Service]
User=kladen
WorkingDirectory=/opt/kladen
EnvironmentFile=/etc/kladen/kladen.env
ExecStart=/usr/bin/python3.11 /opt/kladen/spike/state_server/server.py
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/kladen-codegen.service >/dev/null <<'EOF'
[Unit]
Description=Kladen codegen API
After=network-online.target
[Service]
User=kladen
WorkingDirectory=/opt/kladen/backend
EnvironmentFile=/etc/kladen/kladen.env
ExecStart=/usr/bin/python3.11 -m uvicorn app:app --app-dir /opt/kladen/backend --host 127.0.0.1 --port 8000
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/kladen-platform.service >/dev/null <<'EOF'
[Unit]
Description=Kladen platform API
After=network-online.target docker.service kladen-state.service
[Service]
User=kladen
WorkingDirectory=/opt/kladen/backend
EnvironmentFile=/etc/kladen/kladen.env
ExecStart=/usr/bin/python3.11 /opt/kladen/backend/api.py
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now kladen-state kladen-codegen kladen-platform
```

(The units above say `User=kladen` — change all three if your service user is
`opc` or something else. The env file must be readable by that user.)

Verify the platform API came up on ATP:

```sh
curl -s localhost:8400/api/health
# {"ok": true, "store": "oracle", "orgs": 1}   <-- "oracle" == ATP is live
journalctl -u kladen-platform -n 20 --no-pager   # look for "metadata store: ATP (...)"
```

`"store": "oracle"` is your definitive "ATP connected" signal — the health
check runs a real query against ATP through the wallet.

## Step 5 — build and serve the frontend

Install Node (cloud-init didn't), build, and point nginx at `dist/`:

```sh
sudo dnf module reset nodejs -y && sudo dnf module enable nodejs:20 -y
sudo dnf install -y nodejs nginx
cd /opt/kladen/frontend && npm ci && npm run build
```

**Important — Oracle Linux ships its own default server block inside
`/etc/nginx/nginx.conf`** (there is no `conf.d/default.conf` to delete). If you
skip this, nginx serves the stock "Welcome to nginx on Oracle Linux!" page
instead of Kladen. Demote it so our block becomes the default:

```sh
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
sudo sed -i 's/ default_server;/;/g' /etc/nginx/nginx.conf
```

nginx config — the `/api` split must mirror the dev proxy (platform vs codegen):

```sh
sudo tee /etc/nginx/conf.d/kladen.conf >/dev/null <<'EOF'
server {
    # Both families: the stock block listens on IPv4 AND IPv6, and `curl
    # localhost` resolves to ::1 first — miss the IPv6 line and those requests
    # fall through to the stock server's 404 page.
    listen 80 default_server;
    listen [::]:80 default_server;
    root /opt/kladen/frontend/dist;
    index index.html;

    # platform API (auth, users, runs, profiles, stacks, clients, ATP health)
    location = /api/health   { proxy_pass http://127.0.0.1:8400; }
    location /api/login      { proxy_pass http://127.0.0.1:8400; }
    location /api/logout     { proxy_pass http://127.0.0.1:8400; }
    location /api/me         { proxy_pass http://127.0.0.1:8400; }
    location /api/users      { proxy_pass http://127.0.0.1:8400; }
    location /api/bootstrap  { proxy_pass http://127.0.0.1:8400; }
    location /api/clients    { proxy_pass http://127.0.0.1:8400; }
    location /api/profiles   { proxy_pass http://127.0.0.1:8400; }
    location /api/stacks     { proxy_pass http://127.0.0.1:8400; }
    location /api/runs       { proxy_pass http://127.0.0.1:8400; }
    # everything else under /api -> codegen (generate, import-state, world)
    location /api/           { proxy_pass http://127.0.0.1:8000; }

    location / { try_files $uri /index.html; }
}
EOF

# SELinux + permissions: let nginx read the built frontend and proxy to localhost.
# Without these you get the stock page, a 403, or a 502.
sudo setsebool -P httpd_can_network_connect 1
sudo chcon -Rt httpd_sys_content_t /opt/kladen/frontend/dist
sudo chmod o+x /opt/kladen /opt/kladen/frontend      # nginx must traverse to dist/

sudo nginx -t && sudo systemctl restart nginx && sudo systemctl enable nginx
```

`chcon` is reset by a full SELinux relabel; to make it permanent:

```sh
sudo dnf install -y policycoreutils-python-utils
sudo semanage fcontext -a -t httpd_sys_content_t "/opt/kladen/frontend/dist(/.*)?"
sudo restorecon -Rv /opt/kladen/frontend/dist
```

## Step 6 — reach the UI

### Option A — SSH tunnel (nothing exposed)

```sh
ssh -L 8080:localhost:80 <user>@<runner_public_ip>
# then browse http://localhost:8080
```

### Option B — straight to the public IP (testing)

Two gates must both open — the OCI security list **and** the VM's own firewall.
Missing the second is the usual reason "the security list is open but nothing
loads":

```sh
# On the VM: Oracle Linux runs firewalld with only SSH allowed.
# Allow HTTP from your address ONLY (a rich rule, not the blanket http service):
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="<your-public-ip>/32" service name="http" accept'
sudo firewall-cmd --reload
sudo firewall-cmd --list-all          # verify: no blanket "http" in services
```

```sh
# In deploy/ on your laptop: open :80 to your address only
echo 'http_ingress_cidr = "<your-public-ip>/32"' >> terraform.tfvars
tofu apply
```

Then browse `http://<runner_public_ip>`.

### Restricting to specific CIDRs (three layers)

The API has no login, so IP allowlisting is the only access control. Apply it
at every layer — each one alone is a single point of failure:

| Layer | Where | How |
|---|---|---|
| OCI security list | `deploy/` | `http_ingress_cidr = "1.2.3.4/32"` (never `0.0.0.0/0`) |
| Host firewall | VM | the `--add-rich-rule` above, scoped to the same CIDR |
| Web server | nginx | `allow`/`deny` inside the server block |

The nginx layer, added to `/etc/nginx/conf.d/kladen.conf` just below `listen`:

```nginx
    allow 1.2.3.4/32;      # your office / home IP
    # allow 10.10.0.0/16;  # optional: the VCN itself
    deny all;
```

Then `sudo nginx -t && sudo systemctl reload nginx`. Anything not allowed gets
403 without ever reaching the app.

> If your public IP is dynamic (most home broadband), these lists go stale and
> you'll be locked out of the UI — SSH still works, so keep Option A as the
> fallback and update the CIDRs when your address changes.

> **The API has no authentication yet.** Anyone who can reach port 80 can create
> profiles and trigger real plan/apply/destroy runs against your tenancy. Scope
> `http_ingress_cidr` to your own IP — never `0.0.0.0/0` — and close it again
> when you're done testing (`http_ingress_cidr = ""` + `tofu apply`).

The top-bar chip should read **API · ATP**. Switch to the Profiles screen,
add a client profile (manual or "Fetch from Vault"), open the Builder, and run
**Validate** then **Generate OpenTofu → Plan**. Watch it execute:

```sh
journalctl -u kladen-platform -f
```

## Step 7 (optional) — harden before real use

Option B above is fine for a scoped testing window. Before this holds anything
you care about:

1. **Add authentication** — the API has none (see the OAuth note on the Admin
   screen). This is the blocker for any real exposure.
2. Move to TLS: DNS name on the public IP, then `certbot --nginx`, and open 443
   instead of 80.
3. Keep the ingress CIDR scoped to your office/VPN, not the internet.

---

## Troubleshooting

- **UI loads but the chip says "Platform API offline · demo runs"** — the
  frontend's `/api/bootstrap` isn't getting through. Work outward:

  ```sh
  systemctl is-active kladen-state kladen-codegen kladen-platform
  sudo journalctl -u kladen-platform -n 40 --no-pager     # why it died
  curl -s localhost:8400/api/health                        # backend direct
  curl -s -o /dev/null -w "via nginx: %{http_code}\n" localhost/api/health
  ```

  - service `failed`/`inactive` → read the journal. Usual causes: the unit's
    `User=` doesn't match the user that owns the code, or that user can't read
    the wallet / env file. Fix with
    `sudo chown -R <user>:<user> /opt/kladen /etc/kladen`.
  - direct `:8400` works but nginx returns **502** → SELinux is blocking the
    proxy: `sudo setsebool -P httpd_can_network_connect 1`.
  - direct `:8400` works but nginx returns **404** → either the `/api`
    locations aren't in the running config (`sudo nginx -T | grep -c
    'proxy_pass'` should be 7), or you're hitting the **IPv6** socket. `curl
    localhost` prefers `::1`; if our block has no `listen [::]:80
    default_server;` the request falls through to the stock server. Compare
    `curl -s 127.0.0.1/api/health` (IPv4) with `curl -s localhost/api/health`
    — if only the first works, add the IPv6 listen line.

- **`/api/health` shows `"store": "sqlite"`** — `KLADEN_DB=atp` isn't reaching
  the process. Check `systemctl show kladen-platform -p EnvironmentFiles` and
  that the env file is readable by `opc`.
- **ATP connection errors** — wrong wallet dir/password or DSN. Re-run the
  standalone check: `set -a; . /etc/kladen/kladen.env; set +a; python3.11 /opt/kladen/backend/atp.py healthcheck`.
- **Plan/apply fail at init** — the container can't reach the state service.
  Confirm `kladen-state` is up (`curl localhost:8300/state/ping` → 404 is fine,
  means it's listening) and that Docker is ≥ 20.10 (host-gateway support).
- **You get the stock "Welcome to nginx on Oracle Linux!" page** — the default
  server block in `/etc/nginx/nginx.conf` is winning. Run the `sed` in Step 5,
  then `sudo nginx -t && sudo systemctl restart nginx`. Confirm ours is loaded:
  `sudo nginx -T | grep -A2 'listen 80'`.
- **nginx 403 on the app** — SELinux label or traversal permissions on
  `dist/`. Run the `chcon` + `chmod o+x` from Step 5; check with
  `sudo tail /var/log/audit/audit.log | grep denied`.
- **nginx 502** — a backend isn't running, or SELinux is blocking the proxy
  (`setsebool` above). Check `journalctl -u kladen-codegen -u kladen-platform`.
- **Page loads locally but not from the public IP** — firewalld on the VM
  (`sudo firewall-cmd --list-all`) or the security list. Both must allow :80.
- **Instance-principal auth fails** — the VM must be in the `kladen-runners`
  dynamic group and the `iam.tf` policy applied. Confirm with
  `oci-metadata` / that the VM's compartment matches the dynamic-group rule.
