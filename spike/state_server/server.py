#!/usr/bin/env python3
"""Kladen state service — OpenTofu `http` backend target (GET/POST/DELETE state,
LOCK/UNLOCK), persisting each version to OCI Object Storage. No S3 customer
secret keys; locking is enforced here (in-memory for now; DB row locks later).

State always lands on local disk (DATA_DIR); it is ALSO mirrored to Object
Storage when KLADEN_STATE_OS != '0'. Object Storage auth uses the OCI SDK:

    KLADEN_OCI_AUTH   = config | instance_principal   (default: config)
    KLADEN_STATE_BUCKET = kladen-tofu-state
    KLADEN_OS_NAMESPACE = <namespace>                 (auto-detected if unset)
    KLADEN_STATE_OS     = 1 (mirror to bucket) | 0 (local disk only)

On the runner VM set KLADEN_OCI_AUTH=instance_principal — no keys on the box.
"""

import functools
import json
import os
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8300
BUCKET = os.environ.get("KLADEN_STATE_BUCKET", "kladen-tofu-state")
MIRROR = os.environ.get("KLADEN_STATE_OS", "1") != "0"
DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(exist_ok=True)

_locks: dict[str, dict] = {}
_mutex = threading.Lock()


@functools.lru_cache(maxsize=1)
def _os_client_ns():
    import oci  # lazy: only needed when mirroring to Object Storage
    mode = os.environ.get("KLADEN_OCI_AUTH", "config")
    if mode == "instance_principal":
        signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
        client = oci.object_storage.ObjectStorageClient({}, signer=signer)
    else:
        config = oci.config.from_file(profile_name=os.environ.get("KLADEN_OCI_PROFILE", "DEFAULT"))
        client = oci.object_storage.ObjectStorageClient(config)
    namespace = os.environ.get("KLADEN_OS_NAMESPACE") or client.get_namespace().data
    return client, namespace


def object_put(name: str, data: bytes) -> None:
    if not MIRROR:
        return
    client, namespace = _os_client_ns()
    client.put_object(namespace, BUCKET, name, data)


class StateHandler(BaseHTTPRequestHandler):
    def _stack(self) -> str:
        # The http backend appends ?ID=<lock-id> to writes — the state key is
        # the path only, or every POST lands under a lock-unique name.
        return urllib.parse.urlsplit(self.path).path.strip("/").replace("/", "_")

    def _reply(self, code: int, body: bytes = b"") -> None:
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        f = DATA_DIR / f"{self._stack()}.tfstate"
        if f.exists():
            self._reply(200, f.read_bytes())
        else:
            self._reply(404)

    def do_POST(self) -> None:
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        f = DATA_DIR / f"{self._stack()}.tfstate"
        f.write_bytes(body)
        object_put(f"{self._stack()}/terraform.tfstate", body)
        self._reply(200)

    def do_DELETE(self) -> None:
        (DATA_DIR / f"{self._stack()}.tfstate").unlink(missing_ok=True)
        self._reply(200)

    def do_LOCK(self) -> None:
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with _mutex:
            held = _locks.get(self._stack())
            if held:
                self._reply(423, json.dumps(held).encode())
            else:
                _locks[self._stack()] = json.loads(body or b"{}")
                self._reply(200)

    def do_UNLOCK(self) -> None:
        with _mutex:
            _locks.pop(self._stack(), None)
        self._reply(200)

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.command} {self.path} -> {args[1] if len(args) > 1 else ''}")


if __name__ == "__main__":
    where = f"local disk + bucket {BUCKET}" if MIRROR else "local disk only"
    print(f"kladen state service on :{PORT} · state: {where}")
    ThreadingHTTPServer(("0.0.0.0", PORT), StateHandler).serve_forever()
