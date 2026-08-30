import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSafeDemoEnvironment,
  createDemoEnvironment,
  isSupportedNode,
  parseEnvironment,
  validateRuntimeState,
} from "./demo-policy.mjs";
import { sendControl } from "./control-client.mjs";

const template = `NODE_ENV=development
API_HOST=127.0.0.1
API_PORT=8080
WEB_ORIGIN=http://127.0.0.1:5173
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:./storage/edy-helpdesk.db
PORTFOLIO_DEMO=true
DEMO_SEED_PASSWORD=
INTEGRATION_SENTINEL_ENABLED=false
INTEGRATION_SENTINEL_URL=
INTEGRATION_SENTINEL_TOKEN=
INTEGRATION_SIEM_ENABLED=false
INTEGRATION_SIEM_URL=
INTEGRATION_SIEM_TOKEN=
INTEGRATION_ANALYTICS_ENABLED=false
`;

describe("public demo policy", () => {
  it("requires the supported Node baseline", () => {
    assert.equal(isSupportedNode("22.12.0"), true);
    assert.equal(isSupportedNode("22.11.9"), false);
    assert.equal(isSupportedNode("24.0.0"), true);
  });

  it("creates a safe environment without a fixed public password", () => {
    const generated = createDemoEnvironment(template, "synthetic-local-only-123");
    assert.equal(generated.password, "synthetic-local-only-123");
    assert.equal(assertSafeDemoEnvironment(parseEnvironment(generated.text)).password, generated.password);
  });

  it("rejects operational mode, external integrations, and non-loopback origins", () => {
    for (const [key, value] of [
      ["PORTFOLIO_DEMO", "false"],
      ["INTEGRATION_SENTINEL_ENABLED", "true"],
      ["WEB_ORIGIN", "http://192.0.2.10:5173"],
    ]) {
      const environment = parseEnvironment(createDemoEnvironment(template, "synthetic-local-only-123").text);
      environment.set(key, value);
      assert.throws(() => assertSafeDemoEnvironment(environment));
    }
  });

  it("rejects weak or placeholder credentials", () => {
    const environment = parseEnvironment(createDemoEnvironment(template, "synthetic-local-only-123").text);
    environment.set("DEMO_SEED_PASSWORD", "change-me");
    assert.throws(() => assertSafeDemoEnvironment(environment));
  });

  it("rejects duplicate environment keys", () => {
    assert.throws(() => parseEnvironment("PORTFOLIO_DEMO=true\nPORTFOLIO_DEMO=false\n"));
  });

  it("accepts only the owned local named-pipe state shape", () => {
    const valid = {
      version: 1,
      supervisorPid: 123,
      childPid: 456,
      token: "a".repeat(43),
      pipeName: "\\\\.\\pipe\\edy-helpdesk-demo-123e4567-e89b-12d3-a456-426614174000",
      status: "running",
    };
    assert.equal(validateRuntimeState(valid), valid);
    assert.throws(() => validateRuntimeState({ ...valid, pipeName: "\\\\.\\pipe\\another-project" }));
  });

  it("rejects unsupported supervisor control actions before touching runtime state", async () => {
    await assert.rejects(() => sendControl("restart"), /Unsupported control action/);
  });
});
