import { randomBytes, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
import { sendControl } from "./control-client.mjs";
import {
  demoUrl,
  envPath,
  isSupportedNode,
  loadSafeDemoEnvironment,
  logPath,
  projectRoot,
  runtimeDirectory,
  statePath,
  validateRuntimeState,
} from "./demo-policy.mjs";

function fail(message) {
  console.error(`[EDY HelpDesk] ${message}`);
  process.exit(1);
}

async function waitFor(predicate, timeoutMs, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

async function openBrowser() {
  if (process.env.EDY_DEMO_NO_BROWSER === "true") return;
  const browser = spawn("explorer.exe", [demoUrl], { detached: true, shell: false, stdio: "ignore", windowsHide: false });
  browser.unref();
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(750);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const unavailable = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", unavailable);
    socket.once("timeout", unavailable);
  });
}

if (process.platform !== "win32") fail("The easy demo launcher requires Windows.");
if (!isSupportedNode()) fail("Node.js 22.12 or newer is required. Run setup-demo.bat after installing Node.js.");
if (!existsSync(envPath)) fail("Local demo configuration is missing. Run setup-demo.bat first.");
await loadSafeDemoEnvironment().catch((error) => fail(error.message));
if (!existsSync(path.join(projectRoot, "node_modules"))) fail("Dependencies are missing. Run setup-demo.bat first.");
if (!existsSync(path.join(projectRoot, "storage", "edy-helpdesk.db"))) fail("The demo database is missing. Run setup-demo.bat first.");

mkdirSync(runtimeDirectory, { recursive: true });

if (existsSync(statePath)) {
  let existing;
  try {
    existing = validateRuntimeState(JSON.parse(await readFile(statePath, "utf8")));
    const response = await sendControl("status", existing);
    if (response.ok && response.status === "running") {
      console.log(`[EDY HelpDesk] Portfolio Demo is already running at ${demoUrl}`);
      await openBrowser();
      process.exit(0);
    }
  } catch (error) {
    if (existing && processExists(existing.supervisorPid)) {
      fail(`A demo supervisor is still active but did not answer safely: ${error.message}`);
    }
    await unlink(statePath).catch(() => {});
  }
}

if (await isPortOpen(5173)) fail("Port 5173 is already in use. Stop the other local service before starting the demo.");
if (await isPortOpen(8080)) fail("Port 8080 is already in use. Stop the other local service before starting the demo.");

const initialState = {
  version: 1,
  supervisorPid: process.pid,
  childPid: null,
  token: randomBytes(32).toString("base64url"),
  pipeName: `\\\\.\\pipe\\edy-helpdesk-demo-${randomUUID()}`,
  status: "starting",
  startedAt: new Date().toISOString(),
};
await writeFile(statePath, `${JSON.stringify(initialState, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });

const logDescriptor = openSync(logPath, "a");
const supervisor = spawn(process.execPath, [path.join(projectRoot, "scripts", "demo", "supervisor.mjs")], {
  cwd: projectRoot,
  detached: true,
  env: { ...process.env },
  shell: false,
  stdio: ["ignore", logDescriptor, logDescriptor],
  windowsHide: true,
});
closeSync(logDescriptor);
supervisor.unref();

const running = await waitFor(async () => {
  try {
    const state = validateRuntimeState(JSON.parse(await readFile(statePath, "utf8")));
    if (state.supervisorPid !== supervisor.pid || state.status !== "running") return null;
    const response = await sendControl("status", state);
    return response.ok ? state : null;
  } catch {
    return null;
  }
}, 20_000);

if (!running) fail(`The demo supervisor did not start. Review ${path.relative(projectRoot, logPath)}.`);

const ready = await waitFor(async () => {
  try {
    const response = await fetch(demoUrl, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
    return response.ok && (await response.text()).includes("EDY HelpDesk");
  } catch {
    return false;
  }
}, 120_000, 500);

const apiReady = ready
  ? await waitFor(async () => {
      try {
        const response = await fetch("http://127.0.0.1:8080/api/v1/ready", { signal: AbortSignal.timeout(2_000) });
        if (!response.ok) return false;
        const body = await response.json();
        return body.status === "ready" && body.service === "edy-helpdesk-api";
      } catch {
        return false;
      }
    }, 30_000, 500)
  : null;

if (!ready || !apiReady) fail(`The Portfolio Demo did not become ready. Review ${path.relative(projectRoot, logPath)} and run stop-demo.bat.`);

console.log(`[EDY HelpDesk] Portfolio Demo is running at ${demoUrl}`);
console.log("Real diagnostics: OFF | External integrations: OFF | Data: synthetic only");
await openBrowser();
