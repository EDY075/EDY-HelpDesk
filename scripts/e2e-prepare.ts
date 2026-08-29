import { mkdir, rename, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const e2eRoot = path.join(root, "storage", "e2e");
const archiveRoot = path.join(e2eRoot, "archive");
const database = path.join(e2eRoot, "edy-helpdesk-e2e.db");
await mkdir(archiveRoot, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:.]/gu, "").toLowerCase();
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  const candidate = `${database}${suffix}`;
  try { await stat(candidate); await rename(candidate, path.join(archiveRoot, `${stamp}-${path.basename(candidate)}`)); }
  catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
}
const environment = {
  ...process.env,
  NODE_ENV: "test", API_HOST: "127.0.0.1", API_PORT: "8181", WEB_ORIGIN: "http://127.0.0.1:4273",
  DATABASE_PROVIDER: "sqlite", DATABASE_URL: "file:./storage/e2e/edy-helpdesk-e2e.db", LOG_LEVEL: "silent", PORTFOLIO_DEMO: "true",
  SESSION_IDLE_MINUTES: "30", SESSION_ABSOLUTE_HOURS: "12",
  INTEGRATION_SENTINEL_ENABLED: "false", INTEGRATION_SIEM_ENABLED: "false", INTEGRATION_ANALYTICS_ENABLED: "false",
  INTEGRATION_TIMEOUT_MS: "3000", INTEGRATION_MAX_ATTEMPTS: "5", INTEGRATION_BACKOFF_BASE_MS: "1000",
};
for (const [command, args] of [[process.execPath, ["--import", "tsx", "scripts/db-migrate.ts"]], [process.execPath, ["--import", "tsx", "prisma/seed.ts"]]] as const) {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: "inherit", shell: false, windowsHide: true });
  if (result.status !== 0) throw new Error(`E2E_PREPARE_FAILED:${args.at(-1)}`);
}
process.stdout.write("Isolated synthetic E2E database prepared.\n");
