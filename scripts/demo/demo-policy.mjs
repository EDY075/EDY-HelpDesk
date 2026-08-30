import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const envPath = path.join(projectRoot, ".env");
export const envExamplePath = path.join(projectRoot, ".env.example");
export const runtimeDirectory = path.join(projectRoot, "storage", "demo-runtime");
export const statePath = path.join(runtimeDirectory, "state.json");
export const logPath = path.join(runtimeDirectory, "demo.log");
export const demoUrl = "http://127.0.0.1:5173";
export const minimumNodeVersion = [22, 12, 0];

const requiredDemoValues = Object.freeze({
  NODE_ENV: "development",
  API_HOST: "127.0.0.1",
  API_PORT: "8080",
  WEB_ORIGIN: demoUrl,
  DATABASE_PROVIDER: "sqlite",
  DATABASE_URL: "file:./storage/edy-helpdesk.db",
  PORTFOLIO_DEMO: "true",
  INTEGRATION_SENTINEL_ENABLED: "false",
  INTEGRATION_SENTINEL_URL: "",
  INTEGRATION_SENTINEL_TOKEN: "",
  INTEGRATION_SIEM_ENABLED: "false",
  INTEGRATION_SIEM_URL: "",
  INTEGRATION_SIEM_TOKEN: "",
  INTEGRATION_ANALYTICS_ENABLED: "false",
});

export function isSupportedNode(version = process.versions.node) {
  const parts = version.split(".").map(Number);
  if (parts.length < 3 || parts.some((value) => !Number.isInteger(value) || value < 0)) return false;
  for (let index = 0; index < minimumNodeVersion.length; index += 1) {
    if (parts[index] > minimumNodeVersion[index]) return true;
    if (parts[index] < minimumNodeVersion[index]) return false;
  }
  return true;
}

export function parseEnvironment(text) {
  const values = new Map();
  for (const [index, sourceLine] of text.split(/\r?\n/).entries()) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error(`Invalid .env syntax on line ${index + 1}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`Invalid .env key on line ${index + 1}`);
    if (values.has(key)) throw new Error(`Duplicate .env key: ${key}`);
    values.set(key, value);
  }
  return values;
}

export function assertSafeDemoEnvironment(values) {
  for (const [key, expected] of Object.entries(requiredDemoValues)) {
    if (values.get(key) !== expected) throw new Error(`${key} must be ${expected || "empty"} for the public Portfolio Demo`);
  }
  const password = values.get("DEMO_SEED_PASSWORD") ?? "";
  if (Buffer.byteLength(password, "utf8") < 12 || /^(?:change-me|example|placeholder)$/i.test(password)) {
    throw new Error("DEMO_SEED_PASSWORD must be a unique local value with at least 12 bytes");
  }
  return { password };
}

export function createDemoEnvironment(template, password = randomBytes(18).toString("base64url")) {
  const source = parseEnvironment(template);
  for (const [key, value] of Object.entries(requiredDemoValues)) source.set(key, value);
  source.set("DEMO_SEED_PASSWORD", password);
  const output = [];
  const emitted = new Set();
  for (const sourceLine of template.split(/\r?\n/)) {
    const trimmed = sourceLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      output.push(sourceLine);
      continue;
    }
    const separator = trimmed.indexOf("=");
    const key = separator > 0 ? trimmed.slice(0, separator).trim() : "";
    if (!source.has(key)) {
      output.push(sourceLine);
      continue;
    }
    output.push(`${key}=${source.get(key)}`);
    emitted.add(key);
  }
  for (const [key, value] of source.entries()) if (!emitted.has(key)) output.push(`${key}=${value}`);
  const text = `${output.join("\r\n").replace(/(?:\r?\n)+$/, "")}\r\n`;
  assertSafeDemoEnvironment(parseEnvironment(text));
  return { text, password };
}

export async function loadSafeDemoEnvironment() {
  const values = parseEnvironment(await readFile(envPath, "utf8"));
  return { values, ...assertSafeDemoEnvironment(values) };
}

export async function writeNewDemoEnvironment() {
  const template = await readFile(envExamplePath, "utf8");
  const generated = createDemoEnvironment(template);
  await writeFile(envPath, generated.text, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return generated;
}

export function validateRuntimeState(value) {
  if (!value || typeof value !== "object") throw new Error("Invalid demo runtime state");
  if (value.version !== 1) throw new Error("Unsupported demo runtime state");
  if (!Number.isInteger(value.supervisorPid) || value.supervisorPid <= 0) throw new Error("Invalid supervisor PID");
  if (value.childPid !== null && (!Number.isInteger(value.childPid) || value.childPid <= 0)) throw new Error("Invalid child PID");
  if (typeof value.token !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(value.token)) throw new Error("Invalid control token");
  if (typeof value.pipeName !== "string" || !/^\\\\\.\\pipe\\edy-helpdesk-demo-[0-9a-f-]{36}$/i.test(value.pipeName)) {
    throw new Error("Invalid control pipe");
  }
  if (!new Set(["starting", "running", "stopping"]).has(value.status)) throw new Error("Invalid demo status");
  return value;
}
