import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { envPath, isSupportedNode, loadSafeDemoEnvironment, projectRoot, writeNewDemoEnvironment } from "./demo-policy.mjs";

function fail(message) {
  console.error(`[EDY HelpDesk] ${message}`);
  process.exit(1);
}

function runNpm(args, label, capture = false) {
  const command = `${["npm.cmd", ...args].join(" ")}`;
  const result = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false,
    stdio: capture ? "pipe" : "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) fail(`${label} failed. Review the terminal output and run setup-demo.bat again.`);
  return capture ? (result.stdout ?? "").trim() : "";
}

if (process.platform !== "win32") fail("The easy demo launcher requires Windows.");
if (!isSupportedNode()) fail(`Node.js 22.12 or newer is required. Current version: ${process.versions.node}. Install from https://nodejs.org/en/download`);

const npmVersion = runNpm(["--version"], "npm detection", true);
const npmMajor = Number(npmVersion.split(".")[0]);
if (!Number.isInteger(npmMajor) || npmMajor < 10) fail(`npm 10 or newer is required. Current version: ${npmVersion || "unknown"}.`);

console.log(`[EDY HelpDesk] Node ${process.versions.node} and npm ${npmVersion} detected.`);

let password;
if (existsSync(envPath)) {
  ({ password } = await loadSafeDemoEnvironment());
  console.log("[EDY HelpDesk] Reusing the existing safe Portfolio Demo .env.");
} else {
  ({ password } = await writeNewDemoEnvironment());
  console.log("[EDY HelpDesk] Created a local Git-ignored Portfolio Demo .env.");
}

const steps = [
  [["ci"], "Dependency installation"],
  [["run", "db:generate"], "Prisma client generation"],
  [["run", "db:migrate"], "Database migration"],
  [["run", "db:seed"], "Synthetic demo seed"],
];

for (const [args, label] of steps) {
  console.log(`[EDY HelpDesk] ${label}...`);
  runNpm(args, label);
}

console.log("");
console.log("[EDY HelpDesk] Portfolio Demo setup complete.");
console.log("Demo accounts: demo.admin, demo.technician, demo.viewer");
console.log(`Local demo password: ${process.env.EDY_DEMO_SUPPRESS_PASSWORD_OUTPUT === "true" ? "[suppressed for automated QA]" : password}`);
console.log("Keep this password local. It is stored only in the Git-ignored .env file.");
console.log("Next: run start-demo.bat");
