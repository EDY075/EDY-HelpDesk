import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppConfig } from "@edy/config";
import { seedDatabase } from "../../../prisma/seed.js";
import { seedPhase4 } from "../../../prisma/seed-phase4.js";
import { createApp } from "./app.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { createAuditRepository } from "./modules/audit/audit-repository.js";
import { resetLoginRateLimitsForTests } from "./modules/auth/auth-routes.js";
import { testDatabase } from "./test-database.js";

const origin = "http://127.0.0.1:5173";
type Client = { agent: ReturnType<typeof request.agent>; csrf: string };
let db: PrismaClient;
let app: ReturnType<typeof createApp>;
let admin: Client;
let technician: Client;
let viewer: Client;
let caseId = "";
let caseVersion = 1;
let ticketId = "";
let assetId = "";
let firstKey = "";

async function login(username: string): Promise<Client> {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").set("origin", origin).send({ username, password: process.env.DEMO_SEED_PASSWORD });
  return { agent, csrf: response.body.csrfToken as string };
}

function post(client: Client, path: string, body: object, idempotencyKey?: string) {
  const call = client.agent.post(`/api/v1${path}`).set("origin", origin).set("x-csrf-token", client.csrf);
  if (idempotencyKey) call.set("x-idempotency-key", idempotencyKey);
  return call.send(body);
}

beforeAll(async () => {
  db = await testDatabase();
  await seedDatabase(db);
  await seedPhase4(db);
  const config: AppConfig = { NODE_ENV: "test", API_HOST: "127.0.0.1", API_PORT: 8080, WEB_ORIGIN: origin, DATABASE_PROVIDER: "sqlite", DATABASE_URL: "file:test", LOG_LEVEL: "silent", PORTFOLIO_DEMO: true, SESSION_IDLE_MINUTES: 30, SESSION_ABSOLUTE_HOURS: 12, INTEGRATION_SENTINEL_ENABLED: false, INTEGRATION_SIEM_ENABLED: false, INTEGRATION_ANALYTICS_ENABLED: false, INTEGRATION_TIMEOUT_MS: 3_000, INTEGRATION_MAX_ATTEMPTS: 5, INTEGRATION_BACKOFF_BASE_MS: 1_000 };
  app = createApp({ logger: pino({ level: "silent" }), webOrigin: origin, jsonLimit: "64kb", version: "test", checkDatabase: async () => {}, prisma: db, audit: createAuditRepository(db), config });
  resetLoginRateLimitsForTests();
  admin = await login("demo.admin");
  technician = await login("demo.technician");
  viewer = await login("demo.viewer");
  const diagnosticAsset = await db.asset.findUniqueOrThrow({ where: { assetTag: "DEMO-P3-FIN" } });
  const sourceTicket = await db.ticket.findUniqueOrThrow({ where: { ticketNumber: "HD-2026-000007" } });
  const ticket = await db.ticket.update({ where: { id: sourceTicket.id }, data: { assetId: diagnosticAsset.id } });
  ticketId = ticket.id;
  assetId = ticket.assetId!;
});

afterAll(async () => { await db.$disconnect(); });

describe.sequential("Phase 5 security escalation", () => {
  it("denies anonymous access and Viewer mutations while preserving read capability", async () => {
    expect((await request(app).get("/api/v1/security/cases")).status).toBe(401);
    expect((await viewer.agent.get("/api/v1/security/cases")).status).toBe(200);
    const denied = await post(viewer, `/tickets/${ticketId}/security-escalations`, { reason: "Review required", severity: "High", summary: "Synthetic context" }, randomUUID());
    expect(denied.status).toBe(403);
    expect(await db.auditEvent.count({ where: { action: "security.authorization_denied", actorRoleSnapshot: "Viewer" } })).toBeGreaterThan(0);
  });

  it("requires a UUID idempotency key and validates severity", async () => {
    expect((await post(technician, `/tickets/${ticketId}/security-escalations`, { reason: "Review required", severity: "High", summary: "Synthetic context" })).status).toBe(400);
    expect((await post(technician, `/tickets/${ticketId}/security-escalations`, { reason: "Review required", severity: "Emergency", summary: "Synthetic context" }, randomUUID())).status).toBe(400);
  });

  it("creates one numbered case, ticket evidence, timeline, audit and outbox atomically", async () => {
    firstKey = randomUUID();
    const response = await post(technician, `/tickets/${ticketId}/security-escalations`, { reason: "Unfamiliar synthetic sign-in prompt requires review", severity: "High", summary: "Potential account concern requiring analyst validation" }, firstKey);
    expect(response.status).toBe(201);
    expect(response.body.securityCaseCode).toMatch(/^SEC-\d{4}-\d{6}$/u);
    expect(response.body.status).toBe("New");
    expect(response.body.version).toBe(1);
    caseId = response.body.id as string;
    caseVersion = response.body.version as number;
    expect(await db.securityEvidence.count({ where: { securityCaseId: caseId, type: "TicketContext" } })).toBe(1);
    expect(await db.securityTimelineEntry.count({ where: { securityCaseId: caseId, action: "case.created" } })).toBe(1);
    expect(await db.auditEvent.count({ where: { resourceId: caseId, action: "security.case_created" } })).toBe(1);
    expect(await db.integrationOutbox.count({ where: { eventType: "security.case.created" } })).toBe(1);
  });

  it("returns the same case for duplicate escalation and prevents key reuse across tickets", async () => {
    const replay = await post(technician, `/tickets/${ticketId}/security-escalations`, { reason: "Replay", severity: "Low", summary: "Replay" }, randomUUID());
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(caseId);
    expect(await db.securityCase.count({ where: { ticketId } })).toBe(1);
    const other = await db.ticket.findUniqueOrThrow({ where: { ticketNumber: "HD-2026-000004" } });
    const conflict = await post(technician, `/tickets/${other.id}/security-escalations`, { reason: "Review required", severity: "Medium", summary: "Synthetic review" }, firstKey);
    expect(conflict.status).toBe(409);
  });

  it("limits technicians to their assigned tickets", async () => {
    const unassigned = await db.ticket.findUniqueOrThrow({ where: { ticketNumber: "HD-2026-000003" } });
    expect((await post(technician, `/tickets/${unassigned.id}/security-escalations`, { reason: "Review required", severity: "Low", summary: "Synthetic review" }, randomUUID())).status).toBe(403);
  });

  it("supports search, filters, sorting and pagination", async () => {
    const response = await admin.agent.get("/api/v1/security/cases").query({ search: "SEC-", severity: "High", status: "New", sort: "severity", page: 1, pageSize: 1 });
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.pagination).toMatchObject({ page: 1, pageSize: 1, total: 1 });
  });

  it("assigns and reassigns only active analysts", async () => {
    const adminAccount = await db.account.findUniqueOrThrow({ where: { username: "demo.admin" } });
    const assigned = await post(admin, `/security/cases/${caseId}/assignments`, { version: caseVersion, assignedAnalystId: adminAccount.id });
    expect(assigned.status).toBe(200); caseVersion = assigned.body.version;
    const techAccount = await db.account.findUniqueOrThrow({ where: { username: "demo.technician" } });
    const reassigned = await post(admin, `/security/cases/${caseId}/assignments`, { version: caseVersion, assignedAnalystId: techAccount.id });
    expect(reassigned.status).toBe(200); caseVersion = reassigned.body.version;
    expect(await db.securityTimelineEntry.count({ where: { securityCaseId: caseId, action: { in: ["analyst.assigned", "analyst.reassigned"] } } })).toBe(2);
  });

  it("enforces optimistic locking with a 409 conflict", async () => {
    const stale = await post(admin, `/security/cases/${caseId}/severity`, { version: caseVersion - 1, severity: "Critical", reason: "Stale update" });
    expect(stale.status).toBe(409);
    expect(stale.body.detail).toBe("This security case was updated by another analyst.");
  });

  it("validates transitions and records severity changes", async () => {
    expect((await post(admin, `/security/cases/${caseId}/status-transitions`, { version: caseVersion, status: "Closed" })).status).toBe(409);
    const severity = await post(admin, `/security/cases/${caseId}/severity`, { version: caseVersion, severity: "Critical", reason: "Observed impact requires priority review" });
    expect(severity.status).toBe(200); caseVersion = severity.body.version;
    const triaged = await post(admin, `/security/cases/${caseId}/status-transitions`, { version: caseVersion, status: "Triaged" });
    expect(triaged.status).toBe(200); caseVersion = triaged.body.version;
    const investigating = await post(admin, `/security/cases/${caseId}/status-transitions`, { version: caseVersion, status: "Investigating" });
    expect(investigating.status).toBe(200); caseVersion = investigating.body.version;
  });

  it("adds redacted manual evidence without HTML or secrets", async () => {
    const response = await post(admin, `/security/cases/${caseId}/evidence`, { version: caseVersion, type: "ManualNote", title: "Analyst observation", summary: "password=synthetic-secret must be hidden", source: "Analyst" });
    expect(response.status).toBe(201); caseVersion = response.body.version;
    const evidence = await db.securityEvidence.findFirstOrThrow({ where: { securityCaseId: caseId, type: "ManualNote" } });
    expect(evidence.summary).toContain("[REDACTED]");
    expect(evidence.summary).not.toContain("synthetic-secret");
    expect((await post(admin, `/security/cases/${caseId}/evidence`, { version: caseVersion, type: "ManualNote", title: "<script>", summary: "Unsafe", source: "Analyst" })).status).toBe(400);
  });

  it("links only structured diagnostic findings without raw stdout", async () => {
    const job = await db.diagnosticJob.findFirstOrThrow({ where: { assetId, actionId: "windows.system.summary" } });
    const response = await post(admin, `/security/cases/${caseId}/evidence`, { version: caseVersion, type: "DiagnosticFinding", diagnosticJobId: job.id });
    expect(response.status).toBe(201); caseVersion = response.body.version;
    const evidence = await db.securityEvidence.findFirstOrThrow({ where: { securityCaseId: caseId, type: "DiagnosticFinding" } });
    const snapshot = JSON.stringify(evidence.snapshot).toLowerCase();
    expect(snapshot).toContain("structuredfindings");
    expect(snapshot).not.toContain("stdout");
  });

  it("links a previously collected System event without running a new query", async () => {
    const event = await db.windowsEvent.findFirstOrThrow({ where: { result: { job: { assetId, actionId: "eventlog.query" } } } });
    const jobsBefore = await db.diagnosticJob.count();
    const response = await post(admin, `/security/cases/${caseId}/evidence`, { version: caseVersion, type: "EventLog", windowsEventId: event.id });
    expect(response.status).toBe(201); caseVersion = response.body.version;
    expect(await db.diagnosticJob.count()).toBe(jobsBefore);
    expect(await db.securityEvidence.count({ where: { securityCaseId: caseId, type: "EventLog" } })).toBe(1);
  });

  it("integrates the case with ticket, asset and real dashboard metrics", async () => {
    const ticket = await admin.agent.get(`/api/v1/tickets/${ticketId}/security-case`);
    const asset = await admin.agent.get(`/api/v1/assets/${assetId}/security-cases`);
    const dashboard = await admin.agent.get("/api/v1/security/dashboard");
    expect(ticket.body.id).toBe(caseId);
    expect(asset.body.data.some((entry: { id: string }) => entry.id === caseId)).toBe(true);
    expect(dashboard.body.openSecurityCases).toBe(1);
    expect(dashboard.body.highCriticalCases).toBe(1);
  });

  it("resolves, reopens, classifies false positive and closes without deleting history", async () => {
    const resolved = await post(admin, `/security/cases/${caseId}/resolution`, { version: caseVersion, resolutionSummary: "Synthetic investigation completed", classification: "Support validation", lessonsLearned: "Retain sanitized context" });
    expect(resolved.status).toBe(200); caseVersion = resolved.body.version;
    const reopen = await post(admin, `/security/cases/${caseId}/status-transitions`, { version: caseVersion, status: "Investigating", reason: "New synthetic evidence received" });
    expect(reopen.status).toBe(200); caseVersion = reopen.body.version;
    const falsePositive = await post(admin, `/security/cases/${caseId}/false-positive`, { version: caseVersion, reason: "Expected Portfolio Demo behavior" });
    expect(falsePositive.status).toBe(200); caseVersion = falsePositive.body.version;
    const closed = await post(admin, `/security/cases/${caseId}/status-transitions`, { version: caseVersion, status: "Closed" });
    expect(closed.status).toBe(200); caseVersion = closed.body.version;
    expect(await db.securityEvidence.count({ where: { securityCaseId: caseId } })).toBeGreaterThanOrEqual(4);
    expect(await db.securityTimelineEntry.count({ where: { securityCaseId: caseId } })).toBeGreaterThanOrEqual(10);
  });

  it("keeps timeline and audit append-only and outbox local/idempotent", async () => {
    const timeline = await db.securityTimelineEntry.findFirstOrThrow({ where: { securityCaseId: caseId } });
    await expect(db.securityTimelineEntry.update({ where: { id: timeline.id }, data: { summary: "tamper" } })).rejects.toThrow();
    const audit = await db.auditEvent.findFirstOrThrow({ where: { resourceId: caseId } });
    await expect(db.auditEvent.delete({ where: { id: audit.id } })).rejects.toThrow();
    const outbox = (await db.integrationOutbox.findMany()).filter((entry) => (entry.payload as { caseCode?: string }).caseCode === "SEC-2026-000001");
    expect(outbox.length).toBeGreaterThan(0);
    expect(new Set(outbox.map((entry) => entry.idempotencyKey)).size).toBe(outbox.length);
    expect(outbox.every((entry) => entry.status === "Pending" && entry.source === "edy-helpdesk")).toBe(true);
    expect(JSON.stringify(outbox).toLowerCase()).not.toMatch(/password|cookie|token|stdout|rawoutput/u);
  });
});
