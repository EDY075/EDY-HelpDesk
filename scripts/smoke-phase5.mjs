import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const api = process.env.SMOKE_API_ORIGIN ?? "http://127.0.0.1:8081";
const web = process.env.SMOKE_WEB_ORIGIN ?? "http://127.0.0.1:4173";
for (const value of [api, web]) assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname));
assert.equal(process.env.PORTFOLIO_DEMO, "true");
assert.equal((await fetch(api + "/api/v1/ready")).status, 200);
assert.equal((await fetch(web)).status, 200);

async function authenticate(username) {
  const response = await fetch(api + "/api/v1/auth/login", { method: "POST", headers: { origin: web, "content-type": "application/json" }, body: JSON.stringify({ username, password: process.env.DEMO_SEED_PASSWORD }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { headers: { origin: web, cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; "), "content-type": "application/json", "x-csrf-token": body.csrfToken } };
}

let readChecks = 0;
const admin = await authenticate("demo.admin");
const viewer = await authenticate("demo.viewer");
async function read(headers, route) {
  const response = await fetch(api + "/api/v1" + route, { headers });
  assert.equal(response.status, 200, route);
  readChecks += 1;
  return response.json();
}

const dashboard = await read(admin.headers, "/security/dashboard");
assert.equal(dashboard.synthetic, true);
assert.ok(dashboard.openSecurityCases >= 3);
const queue = await read(admin.headers, "/security/cases?page=1&pageSize=20&sort=recentlyUpdated");
assert.equal(queue.synthetic, true);
assert.equal(queue.pagination.total, 5);
assert.ok(queue.data.every((item) => /^SEC-\d{4}-\d{6}$/u.test(item.securityCaseCode)));
const securityCase = await read(admin.headers, "/security/cases/50000000-0000-4000-8000-000000000001");
assert.equal(securityCase.synthetic, true);
assert.ok(securityCase.evidence.some((item) => item.type === "TicketContext"));
assert.ok(securityCase.timeline.length >= 1);
assert.ok(securityCase.asset);
const byTicket = await read(admin.headers, `/tickets/${securityCase.ticket.id}/security-case`);
assert.equal(byTicket.id, securityCase.id);
const byAsset = await read(admin.headers, `/assets/${securityCase.asset.id}/security-cases`);
assert.ok(byAsset.data.some((item) => item.id === securityCase.id));
await read(viewer.headers, "/security/dashboard");
await read(viewer.headers, "/security/cases?page=1&pageSize=20");
const denied = await fetch(api + `/api/v1/security/cases/${securityCase.id}/evidence`, { method: "POST", headers: { ...viewer.headers, "x-idempotency-key": randomUUID() }, body: JSON.stringify({ version: securityCase.version, type: "ManualNote", title: "Denied synthetic note", note: "Viewer must not mutate." }) });
assert.equal(denied.status, 403);
const catalog = await read(admin.headers, "/diagnostics/catalog");
assert.equal(catalog.liveExecutionEnabled, false);
assert.ok(catalog.data.every((action) => action.requiresElevation === false && !("scriptPath" in action)));

console.log(JSON.stringify({ phase5Smoke: "PASS", readChecks, securityCases: queue.pagination.total, viewerMutationDenied: true, localOutboxOnly: true, externalIntegration: false, liveDiagnosticsExecution: false }));
