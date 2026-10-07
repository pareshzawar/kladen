import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Two backends share the /api namespace. The platform API (backend/api.py,
    // stdlib on :8400) owns runs/approvals/logs, clients, stacks, and the
    // scoped configuration profiles. Everything else — codegen, tfstate
    // import, world persistence, health — goes to the Python codegen service
    // (backend/app.py, uvicorn on :8000). Keys are matched in order, most
    // specific first.
    proxy: {
      "/api/login": "http://localhost:8400",
      "/api/logout": "http://localhost:8400",
      "/api/me": "http://localhost:8400",
      "/api/users": "http://localhost:8400",
      "/api/health": "http://localhost:8400",
      "/api/bootstrap": "http://localhost:8400",
      "/api/clients": "http://localhost:8400",
      "/api/profiles": "http://localhost:8400",
      "/api/stacks": "http://localhost:8400",
      "/api/runs": "http://localhost:8400",
      "/api/security": "http://localhost:8400",
      "/api/findings": "http://localhost:8400",
      "/api": "http://localhost:8000",
    },
  },
});
