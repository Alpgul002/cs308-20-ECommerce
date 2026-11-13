import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

process.env.E2E_DB_FILE ||= join(tmpdir(), `orbit-e2e-${randomUUID()}.sqlite`);
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: "node scripts/e2e-api.mjs", url: "http://127.0.0.1:4001/api/health", reuseExistingServer: false, env: { E2E_DB_FILE: process.env.E2E_DB_FILE } },
    { command: "npm run dev --workspace @cs308/frontend -- --port 5174", url: "http://127.0.0.1:5174", reuseExistingServer: false, env: { API_PROXY_TARGET: "http://127.0.0.1:4001" } }
  ],
  globalTeardown: "./scripts/e2e-cleanup.mjs"
});
