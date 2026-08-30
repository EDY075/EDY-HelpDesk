import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { sendControl, readRuntimeState } from "./control-client.mjs";
import { statePath } from "./demo-policy.mjs";

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (process.platform !== "win32") {
  console.error("[EDY HelpDesk] The easy demo launcher requires Windows.");
  process.exit(1);
}

if (!existsSync(statePath)) {
  console.log("[EDY HelpDesk] No supervised Portfolio Demo is running.");
  process.exit(0);
}

try {
  const state = await readRuntimeState();
  const response = await sendControl("stop", state);
  if (!response.ok) throw new Error(response.error ?? "Stop request was rejected");
  console.log("[EDY HelpDesk] Stop requested for the supervised demo process tree only.");
} catch (error) {
  try {
    const state = await readRuntimeState();
    if (!processExists(state.supervisorPid)) {
      await unlink(statePath).catch(() => {});
      console.log("[EDY HelpDesk] Removed stale local demo state; no process was terminated.");
      process.exit(0);
    }
  } catch {
    // Preserve ambiguous state rather than terminating an unverified process.
  }
  console.error(`[EDY HelpDesk] Safe stop failed: ${error.message}`);
  console.error("No global Node process was terminated. Review storage/demo-runtime/demo.log.");
  process.exit(1);
}
