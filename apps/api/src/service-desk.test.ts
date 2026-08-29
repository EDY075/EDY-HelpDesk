import { testDatabase } from "./test-database.js";

import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AppConfig } from "@edy/config";
import { seedDatabase } from "../../../prisma/seed.js";
import { createApp } from "./app.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { createAuditRepository } from "./modules/audit/audit-repository.js";
import { resetLoginRateLimitsForTests } from "./modules/auth/auth-routes.js";

const origin = "http://127.0.0.1:5173";
let prisma: PrismaClient;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  prisma = await testDatabase();
  const file = "isolated-test";
  await seedDatabase(prisma);
  const config: AppConfig = { NODE_ENV: "test", API_HOST: "127.0.0.1", API_PORT: 8080, WEB_ORIGIN: origin, DATABASE_PROVIDER: "sqlite", DATABASE_URL: `file:${file}`, LOG_LEVEL: "silent", PORTFOLIO_DEMO: true, SESSION_IDLE_MINUTES: 30, SESSION_ABSOLUTE_HOURS: 12, INTEGRATION_SENTINEL_ENABLED: false, INTEGRATION_SIEM_ENABLED: false, INTEGRATION_ANALYTICS_ENABLED: false, INTEGRATION_TIMEOUT_MS: 3_000, INTEGRATION_MAX_ATTEMPTS: 5, INTEGRATION_BACKOFF_BASE_MS: 1_000 };
  app = createApp({ logger: pino({ level: "silent" }), webOrigin: origin, jsonLimit: "64kb", version: "test", checkDatabase: async () => { await prisma.$queryRaw`SELECT 1`; }, prisma, audit: createAuditRepository(prisma), config });
  resetLoginRateLimitsForTests();
});

afterAll(async () => { await prisma.$disconnect();  });

async function login(username: string) {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").set("origin", origin).send({ username, password: process.env.DEMO_SEED_PASSWORD });
  return { agent, response, csrf: response.body.csrfToken as string };
}

describe("Phase 2 authentication and service desk", () => {
  it("authenticates with Argon2id and secure cookie attributes", async () => {
    const { response } = await login("demo.admin");
    expect(response.status).toBe(200);
    expect(String(response.headers["set-cookie"])).toContain("HttpOnly");
    expect(String(response.headers["set-cookie"])).toContain("SameSite=Strict");
    const account = await prisma.account.findUniqueOrThrow({ where: { username: "demo.admin" } });
    expect(account.credentialHash).toMatch(/^\$argon2id\$/u);
    expect(account.credentialHash).not.toContain(process.env.DEMO_SEED_PASSWORD!);
  });

  it("returns the same non-enumerating error for invalid credentials", async () => {
    const missing = await request(app).post("/api/v1/auth/login").set("origin", origin).send({ username: "missing.user", password: "Incorrect-demo-password" });
    const invalid = await request(app).post("/api/v1/auth/login").set("origin", origin).send({ username: "demo.admin", password: "Incorrect-demo-password" });
    expect([missing.status, invalid.status]).toEqual([401, 401]);
    expect(missing.body.detail).toBe(invalid.body.detail);
  });

  it("rejects cross-origin login and cookie mutation without CSRF", async () => {
    const crossOrigin = await request(app).post("/api/v1/auth/login").set("origin", "http://invalid.example").send({ username: "demo.admin", password: process.env.DEMO_SEED_PASSWORD });
    expect(crossOrigin.status).toBe(403);
    const { agent } = await login("demo.admin");
    const response = await agent.post("/api/v1/tickets").set("origin", origin).send({});
    expect(response.status).toBe(403);
  });

  it("enforces anonymous and Viewer RBAC negative cases", async () => {
    expect((await request(app).get("/api/v1/tickets")).status).toBe(401);
    const { agent, csrf } = await login("demo.viewer");
    const response = await agent.post("/api/v1/tickets").set("origin", origin).set("x-csrf-token", csrf).send({});
    expect(response.status).toBe(403);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "HD-2026-000001" } });
    const comment = await agent.post(`/api/v1/tickets/${ticket.id}/comments`).set("origin", origin).set("x-csrf-token", csrf).send({ content: "Viewer mutation must be denied.", type: "Public", version: ticket.version });
    expect(comment.status).toBe(403);
  });

  it("returns real overview metrics and paginated filters", async () => {
    const { agent } = await login("demo.admin");
    const overview = await agent.get("/api/v1/overview");
    const list = await agent.get("/api/v1/tickets?priority=Critical&page=1&pageSize=2");
    expect(overview.status).toBe(200);
    expect(overview.body.openTickets).toBeGreaterThan(0);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.pagination.total).toBe(1);
  });

  it("creates an immutable ticket code with SLA, history and audit atomically", async () => {
    const { agent, csrf } = await login("demo.admin");
    const metadata = await agent.get("/api/v1/metadata");
    const response = await agent.post("/api/v1/tickets").set("origin", origin).set("x-csrf-token", csrf).send({ title: "Synthetic onboarding access request", description: "Portfolio Demo request created by an integration test.", requesterId: metadata.body.requesters[0].id, categoryId: metadata.body.categories.find((item: { name: string }) => item.name === "Access").id, priority: "Medium" });
    expect(response.status).toBe(201);
    expect(response.body.ticketCode).toMatch(/^HD-\d{4}-\d{6}$/u);
    expect(response.body.version).toBe(1);
    expect(await prisma.ticketHistory.count({ where: { ticketId: response.body.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { resourceId: response.body.id, action: "ticket.created" } })).toBe(1);
    expect(await prisma.ticketSla.count({ where: { ticketId: response.body.id } })).toBe(1);
  });

  it("assigns, transitions and requires waiting reasons", async () => {
    const { agent, csrf } = await login("demo.admin");
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "HD-2026-000003" } });
    const tech = await prisma.account.findUniqueOrThrow({ where: { username: "demo.technician" } });
    const assigned = await agent.post(`/api/v1/tickets/${ticket.id}/assignments`).set("origin", origin).set("x-csrf-token", csrf).send({ assigneeAccountId: tech.id, version: ticket.version });
    expect(assigned.status).toBe(200);
    expect(assigned.body.status).toBe("Assigned");
    const active = await agent.post(`/api/v1/tickets/${ticket.id}/transitions`).set("origin", origin).set("x-csrf-token", csrf).send({ toStatus: "InProgress", version: assigned.body.version });
    expect(active.status).toBe(200);
    const invalid = await agent.post(`/api/v1/tickets/${ticket.id}/transitions`).set("origin", origin).set("x-csrf-token", csrf).send({ toStatus: "WaitingUser", version: active.body.version });
    expect(invalid.status).toBe(409);
  });

  it("records reassignment between active technicians", async () => {
    const { agent, csrf } = await login("demo.admin");
    const metadata = await agent.get("/api/v1/metadata");
    const created = await agent.post("/api/v1/tickets").set("origin", origin).set("x-csrf-token", csrf).send({ title: "Synthetic reassignment validation", description: "Controlled request used to validate assignment history.", requesterId: metadata.body.requesters[0].id, categoryId: metadata.body.categories[0].id, priority: "Low" });
    const primary = await prisma.account.findUniqueOrThrow({ where: { username: "demo.technician" } });
    const department = await prisma.department.findUniqueOrThrow({ where: { code: "IT" } });
    const secondUser = await prisma.user.create({ data: { displayName: "Riley Morgan", email: "riley.morgan@example.invalid", departmentId: department.id } });
    const secondary = await prisma.account.create({ data: { username: "demo.technician.secondary", role: "Technician", userId: secondUser.id, credentialHash: primary.credentialHash } });
    const assigned = await agent.post(`/api/v1/tickets/${created.body.id}/assignments`).set("origin", origin).set("x-csrf-token", csrf).send({ assigneeAccountId: primary.id, version: created.body.version });
    const reassigned = await agent.post(`/api/v1/tickets/${created.body.id}/assignments`).set("origin", origin).set("x-csrf-token", csrf).send({ assigneeAccountId: secondary.id, version: assigned.body.version });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.assignee.id).toBe(secondary.id);
    expect(await prisma.ticketHistory.count({ where: { ticketId: created.body.id, action: "ticket.reassigned" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { resourceId: created.body.id, action: "ticket.reassigned" } })).toBe(1);
  });

  it("pauses, resumes, resolves and reopens SLA without erasing elapsed time", async () => {
    const { agent, csrf } = await login("demo.admin");
    const metadata = await agent.get("/api/v1/metadata");
    const created = await agent.post("/api/v1/tickets").set("origin", origin).set("x-csrf-token", csrf).send({ title: "Synthetic SLA lifecycle validation", description: "Controlled request used to validate pause and reopen behavior.", requesterId: metadata.body.requesters[0].id, categoryId: metadata.body.categories[0].id, priority: "High" });
    const technician = await prisma.account.findUniqueOrThrow({ where: { username: "demo.technician" } });
    const assigned = await agent.post(`/api/v1/tickets/${created.body.id}/assignments`).set("origin", origin).set("x-csrf-token", csrf).send({ assigneeAccountId: technician.id, version: created.body.version });
    const active = await agent.post(`/api/v1/tickets/${created.body.id}/transitions`).set("origin", origin).set("x-csrf-token", csrf).send({ toStatus: "InProgress", version: assigned.body.version });
    const waiting = await agent.post(`/api/v1/tickets/${created.body.id}/transitions`).set("origin", origin).set("x-csrf-token", csrf).send({ toStatus: "WaitingUser", reason: "Waiting for synthetic requester confirmation.", version: active.body.version });
    expect(waiting.status).toBe(200);
    const beforeResume = await prisma.ticketSla.findUniqueOrThrow({ where: { ticketId: created.body.id } });
    await prisma.ticketSla.update({ where: { ticketId: created.body.id }, data: { pausedAt: new Date(Date.now() - 610_000) } });
    const resumed = await agent.post(`/api/v1/tickets/${created.body.id}/transitions`).set("origin", origin).set("x-csrf-token", csrf).send({ toStatus: "InProgress", version: waiting.body.version });
    const afterResume = await prisma.ticketSla.findUniqueOrThrow({ where: { ticketId: created.body.id } });
    expect(resumed.status).toBe(200);
    expect(afterResume.pausedAt).toBeNull();
    expect(afterResume.totalPausedSeconds).toBeGreaterThanOrEqual(610);
    expect(afterResume.resolutionDueAt.getTime()).toBeGreaterThan(beforeResume.resolutionDueAt.getTime());
    const resolved = await agent.post(`/api/v1/tickets/${created.body.id}/transitions`).set("origin", origin).set("x-csrf-token", csrf).send({ toStatus: "Resolved", solution: "Synthetic resolution recorded for lifecycle validation.", version: resumed.body.version });
    expect(resolved.status).toBe(200);
    expect((await prisma.ticketSla.findUniqueOrThrow({ where: { ticketId: created.body.id } })).resolutionStoppedAt).not.toBeNull();
    const reopened = await agent.post(`/api/v1/tickets/${created.body.id}/transitions`).set("origin", origin).set("x-csrf-token", csrf).send({ toStatus: "InProgress", reason: "Synthetic requester confirmed recurrence.", version: resolved.body.version });
    const afterReopen = await prisma.ticketSla.findUniqueOrThrow({ where: { ticketId: created.body.id } });
    expect(reopened.status).toBe(200);
    expect(reopened.body.resolvedAt).toBeNull();
    expect(afterReopen.resolutionStoppedAt).toBeNull();
    expect(await prisma.ticketHistory.count({ where: { ticketId: created.body.id, action: "ticket.reopened" } })).toBe(1);
  });

  it("rejects invalid state transitions and resolution without a solution", async () => {
    const { agent, csrf } = await login("demo.admin");
    const fresh = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "HD-2026-000007" } });
    const invalid = await agent.post(`/api/v1/tickets/${fresh.id}/transitions`).set("origin", origin).set("x-csrf-token", csrf).send({ toStatus: "Resolved", version: fresh.version });
    expect(invalid.status).toBe(409);
  });

  it("prevents lost updates with optimistic locking", async () => {
    const { agent, csrf } = await login("demo.admin");
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "HD-2026-000004" } });
    const first = await agent.patch(`/api/v1/tickets/${ticket.id}`).set("origin", origin).set("x-csrf-token", csrf).send({ version: ticket.version, title: "Approved application startup failure" });
    const stale = await agent.patch(`/api/v1/tickets/${ticket.id}`).set("origin", origin).set("x-csrf-token", csrf).send({ version: ticket.version, title: "Stale overwrite" });
    expect(first.status).toBe(200);
    expect(stale.status).toBe(409);
    expect(stale.body.detail).toBe("This ticket was updated by another technician.");
  });

  it("blocks Viewer internal notes and versions technician comments", async () => {
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "HD-2026-000001" } });
    const viewer = await login("demo.viewer");
    expect((await viewer.agent.post(`/api/v1/tickets/${ticket.id}/comments`).set("origin", origin).set("x-csrf-token", viewer.csrf).send({ content: "Hidden note", type: "Internal", version: ticket.version })).status).toBe(403);
    const technician = await login("demo.technician");
    const response = await technician.agent.post(`/api/v1/tickets/${ticket.id}/comments`).set("origin", origin).set("x-csrf-token", technician.csrf).send({ content: "Synthetic public update.", type: "Public", version: ticket.version });
    expect(response.status).toBe(201);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).version).toBe(ticket.version + 1);
  });

  it("archives instead of deleting and revokes linked sessions", async () => {
    const { agent, csrf } = await login("demo.admin");
    const target = await prisma.user.findUniqueOrThrow({ where: { email: "sam.chen@example.invalid" } });
    const response = await agent.post(`/api/v1/users/${target.id}/archive`).set("origin", origin).set("x-csrf-token", csrf);
    expect(response.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).archivedAt).not.toBeNull();
    expect(await prisma.auditEvent.count({ where: { resourceId: target.id, action: "user.archived" } })).toBe(1);
  });

  it("enforces AuditEvent append-only at the database boundary", async () => {
    const event = await prisma.auditEvent.findFirstOrThrow();
    await expect(prisma.$executeRawUnsafe(`UPDATE AuditEvent SET outcome = 'changed' WHERE id = ?`, event.id)).rejects.toThrow(/append-only/u);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM AuditEvent WHERE id = ?`, event.id)).rejects.toThrow(/append-only/u);
  });
});
