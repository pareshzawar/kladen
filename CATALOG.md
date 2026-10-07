# Editing the service catalog

The catalog is the palette of services you drag onto the board. There are two
ways to change it, for two different needs.

## 1. From the front end (no code) — Admin → Service catalog

As an **admin**, open **Admin → Service catalog**:

- **Hide/show a built-in** — click the dot next to any built-in service to
  remove it from the Builder palette (or bring it back). Verified: hiding a
  service removes it from every stack's catalog immediately.
- **Add a custom service** — give it a name, an OpenTofu resource type
  (`oci_...`), a group, and any number of config fields (text / dropdown /
  toggle). It appears in the palette right away.
- **Edit / delete** custom services from the same card.

These changes are stored in the workspace world (the codegen service's DB) and
apply to everyone in the workspace.

**What the front end can and can't do:** you can add *custom* services and
hide built-ins, but you can't rewrite a *built-in's* fields — those are wired to
a hand-written OpenTofu template on the backend (below). A custom service uses a
**generic template**: it emits `compartment_id`, `freeform_tags`, and one
commented line per field, which is enough to plan but not a full resource. For
real attribute mapping, add a backend template.

```hcl
# what a custom "Streaming" service generates (generic template)
resource "oci_streaming_stream" "custom_ab12cd" {
  compartment_id = var.compartment_ocid
  freeform_tags  = local.tags
  # stream_name = orders-events
}
```

## 2. On the backend (code) — a first-class service with a real template

To add a service whose config maps to actual OpenTofu attributes, touch two
files. Keep the **`key`** identical in both — that's the contract.

### a) Declare it in the palette — `frontend/src/model.ts`

Add a `ResourceType` to `resourceTypes`. Field helpers: `t()` text, `s()`
dropdown, `b()` toggle.

```ts
// key, name, glyph, rtype, group, fields
{ key: "nosql", name: "NoSQL Table", glyph: "NQ", rtype: "oci_nosql_table",
  group: "DATABASE",
  fields: [
    t("name", "Table name", "users"),
    t("ddl",  "DDL statement", "CREATE TABLE users(id INTEGER, PRIMARY KEY(id))"),
    s("capacity", "Capacity mode", ["PROVISIONED", "ON_DEMAND"], "ON_DEMAND"),
  ] },
```

Each field's first argument is its **key** — that's how you reference it in the
template as `{{ c.<key> }}` (here `c.name`, `c.ddl`, `c.capacity`).

### b) Write its OpenTofu — `backend/app.py`

Add a Jinja2 template to `TEMPLATES`, keyed by the same `"nosql"`, and map it to
a file in `FILE_OF_TYPE`.

```python
FILE_OF_TYPE = {
    ...
    "nosql": "database.tf",
}

TEMPLATES = {
    ...
    "nosql": """
resource "oci_nosql_table" "{{ label }}" {
  compartment_id = var.compartment_ocid
  name           = "{{ c.name }}"
  ddl_statement  = "{{ c.ddl }}"
  table_limits {
    max_read_units     = 50
    max_write_units    = 50
    max_storage_in_gbs = 25
  }
  freeform_tags = local.tags
}
""",
}
```

Inside a template you have:

- `{{ c.<fieldkey> }}` — the value typed in that config field
- `{{ label }}` — a sanitized, unique HCL block name derived from the resource
- `var.*` — inputs declared in `VARIABLES_TF` (add any new ones there; give them
  a default so a plan never blocks on a prompt)
- `local.tags` — the enforced client/env/managed-by tags (from `MAIN_TF`)
- `{% if c.some_toggle %}...{% endif %}`, `{% for %}` — normal Jinja2 logic
  (e.g. only emit a WAF block when its toggle is on)

Subnets `public`, `private_app`, `private_db` always exist (from `NETWORK_BASE`),
so you can reference `oci_core_subnet.private_app.id` freely.

### c) Ship it

No DB change is needed — the catalog palette is code. Restart the codegen
service and rebuild the front end:

```sh
cd /opt/kladen && git pull
cd frontend && npm ci && npm run build && sudo chcon -Rt httpd_sys_content_t dist
sudo systemctl restart kladen-codegen
```

## Which should I use?

| Need | Use |
|---|---|
| Toggle a service on/off for the workspace | Front end (hide/show) |
| A quick service that only needs a few tagged attributes | Front end (custom service, generic template) |
| A service whose fields must map to real OpenTofu attributes | Backend (`model.ts` + `app.py` template) |
| Change what an existing built-in emits | Backend (edit its template in `app.py`) |

The rule of thumb: the front end is for **composition** (what's available, what
a stack uses); the backend template is the **source of truth** for the HCL a
service actually produces.
