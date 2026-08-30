import { timingSafeEqual } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { loadSafeDemoEnvironment, projectRoot, statePath, validateRuntimeState } from "./demo-policy.mjs";

const state = validateRuntimeState(JSON.parse(await readFile(statePath, "utf8")));
state.supervisorPid = process.pid;

await loadSafeDemoEnvironment();

const child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm.cmd run dev"], {
  cwd: projectRoot,
  env: { ...process.env },
  shell: false,
  stdio: "inherit",
  windowsHide: true,
});

state.childPid = child.pid;
state.status = "running";
await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

let stopping = false;
let server;

function tokenMatches(candidate) {
  if (typeof candidate !== "string") return false;
  const expected = Buffer.from(state.token);
  const received = Buffer.from(candidate);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminateOwnedTree() {
  if (!Number.isInteger(child.pid) || child.pid <= 0 || !processExists(child.pid)) return;
  spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T"], { shell: false, stdio: "ignore", windowsHide: true });
  const deadline = Date.now() + 5_000;
  while (processExists(child.pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
  if (processExists(child.pid)) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { shell: false, stdio: "ignore", windowsHide: true });
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  state.status = "stopping";
  if (existsSync(statePath)) await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8").catch(() => {});
  server?.close();
  await terminateOwnedTree();
  await unlink(statePath).catch(() => {});
}

server = net.createServer((socket) => {
  socket.setEncoding("utf8");
  let input = "";
  socket.on("data", (chunk) => {
    input += chunk;
    if (!input.includes("\n") || input.length > 2_048) return;
    let request;
    try {
      request = JSON.parse(input.slice(0, input.indexOf("\n")));
    } catch {
      socket.end(`${JSON.stringify({ ok: false, error: "INVALID_REQUEST" })}\n`);
      return;
    }
    if (!tokenMatches(request.token)) {
      socket.end(`${JSON.stringify({ ok: false, error: "UNAUTHORIZED" })}\n`);
      return;
    }
    if (request.action === "status") {
      socket.end(`${JSON.stringify({ ok: true, status: stopping ? "stopping" : "running" })}\n`);
      return;
    }
    if (request.action === "stop") {
      socket.end(`${JSON.stringify({ ok: true, status: "stopping" })}\n`);
      setImmediate(async () => {
        await shutdown();
        process.exit(0);
      });
      return;
    }
    socket.end(`${JSON.stringify({ ok: false, error: "UNSUPPORTED_ACTION" })}\n`);
  });
});

server.listen(state.pipeName);
child.once("exit", async () => {
  await shutdown();
  process.exit(stopping ? 0 : 1);
});
process.once("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});
process.once("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});
