import net from "node:net";
import { readFile } from "node:fs/promises";
import { statePath, validateRuntimeState } from "./demo-policy.mjs";

export async function readRuntimeState() {
  return validateRuntimeState(JSON.parse(await readFile(statePath, "utf8")));
}

export async function sendControl(action, state) {
  if (!new Set(["status", "stop"]).has(action)) throw new Error("Unsupported control action");
  const runtimeState = state ?? (await readRuntimeState());
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(runtimeState.pipeName);
    let response = "";
    const timer = setTimeout(() => socket.destroy(new Error("Demo supervisor response timed out")), 5_000);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify({ action, token: runtimeState.token })}\n`));
    socket.on("data", (chunk) => {
      response += chunk;
      if (!response.includes("\n")) return;
      clearTimeout(timer);
      socket.end();
      try {
        resolve(JSON.parse(response.slice(0, response.indexOf("\n"))));
      } catch {
        reject(new Error("Invalid demo supervisor response"));
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
