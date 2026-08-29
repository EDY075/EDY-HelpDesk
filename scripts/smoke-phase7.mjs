import assert from "node:assert/strict";

const api = process.env.SMOKE_API_ORIGIN ?? "http://127.0.0.1:8081";
const web = process.env.SMOKE_WEB_ORIGIN ?? "http://127.0.0.1:4173";
for (const value of [api, web]) assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname));
assert.equal(process.env.PORTFOLIO_DEMO, "true");
assert.equal((await fetch(`${api}/api/v1/ready`)).status, 200);
assert.equal((await fetch(web)).status, 200);

const login = await fetch(`${api}/api/v1/auth/login`, {
  method: "POST", headers: { origin: web, "content-type": "application/json" },
  body: JSON.stringify({ username: "demo.admin", password: process.env.DEMO_SEED_PASSWORD }),
});
assert.equal(login.status, 200);
const session = await login.json();
const headers = {
  origin: web,
  cookie: login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; "),
  "content-type": "application/json",
  "x-csrf-token": session.csrfToken,
};

const integrationResponse = await fetch(`${api}/api/v1/integrations`, { headers });
assert.equal(integrationResponse.status, 200);
const integrations = await integrationResponse.json();
assert.equal(integrations.integrations.length, 3);
assert.equal(integrations.integrations.some((item) => item.status === "Connected"), false);
assert.equal(integrations.integrations.find((item) => item.id === "sentinel")?.status, "Unavailable");
assert.equal(integrations.integrations.find((item) => item.id === "siem")?.status, "Incompatible");
assert.equal(integrations.integrations.find((item) => item.id === "analytics")?.status, "ExportReady");

const settingsResponse = await fetch(`${api}/api/v1/settings`, { headers });
assert.equal(settingsResponse.status, 200);
const settings = await settingsResponse.json();
assert.equal(settings.application.mode, "Demo");
assert.equal(settings.diagnostics.realExecutionEnabled, false);
assert.deepEqual(settings.integrations, { externalEnabled: false, portfolioDemoLock: true });
assert.doesNotMatch(JSON.stringify(settings), /token|password|secret|integrationUrl/iu);

const exportResponse = await fetch(`${api}/api/v1/integrations/analytics/exports`, {
  method: "POST", headers, body: JSON.stringify({ dataset: "Tickets" }),
});
assert.equal(exportResponse.status, 201);
const exported = await exportResponse.json();
assert.match(exported.fileName, /^tickets-[a-z0-9-]+\.json$/u);
assert.ok(exported.recordCount >= 0);

const operationsResponse = await fetch(`${api}/api/v1/dashboard/operations?range=7d`, { headers });
assert.equal(operationsResponse.status, 200);
const operations = await operationsResponse.json();
assert.ok(operations);

console.log(JSON.stringify({ phase7Smoke: "PASS", integrations: {
  sentinel: "Unavailable", siem: "Incompatible", analytics: "ExportReady",
}, analyticsDataset: "Tickets", externalIntegration: false, portfolioDemo: true }));
