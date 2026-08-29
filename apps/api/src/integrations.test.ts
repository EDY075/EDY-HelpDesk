import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "@edy/config";
import { analyticsIntegrationEnvelopeSchema } from "@edy/contracts";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedDatabase } from "../../../prisma/seed.js";
import { seedPhase4 } from "../../../prisma/seed-phase4.js";
import { seedPhase5 } from "../../../prisma/seed-phase5.js";
import { createApp } from "./app.js";
import type { Prisma, PrismaClient } from "./generated/prisma/client.js";
import { createAuditRepository } from "./modules/audit/audit-repository.js";
import { resetLoginRateLimitsForTests } from "./modules/auth/auth-routes.js";
import { createAnalyticsIntegrationExport } from "./modules/integrations/analytics-export.js";
import { IntegrationDeliveryError, type IntegrationPort } from "./modules/integrations/http-port.js";
import { dispatchNextOutboxEvent } from "./modules/integrations/outbox-dispatcher.js";
import { resetIntegrationRateLimitsForTests } from "./modules/integrations/routes.js";
import { testDatabase } from "./test-database.js";

const origin = "http://127.0.0.1:5173";
const exportRoot = path.resolve("../../storage/test-artifacts", `phase7-integrations-${randomUUID()}`);
const config: AppConfig = {
  NODE_ENV: "test", API_HOST: "127.0.0.1", API_PORT: 8080, WEB_ORIGIN: origin,
  DATABASE_PROVIDER: "sqlite", DATABASE_URL: "file:test", LOG_LEVEL: "silent", PORTFOLIO_DEMO: true,
  SESSION_IDLE_MINUTES: 30, SESSION_ABSOLUTE_HOURS: 12,
  INTEGRATION_SENTINEL_ENABLED: false, INTEGRATION_SIEM_ENABLED: false, INTEGRATION_ANALYTICS_ENABLED: false,
  INTEGRATION_TIMEOUT_MS: 3_000, INTEGRATION_MAX_ATTEMPTS: 3, INTEGRATION_BACKOFF_BASE_MS: 1_000,
};
type Client = { agent: ReturnType<typeof request.agent>; csrf: string; id: string };
let db: PrismaClient;
let app: ReturnType<typeof createApp>;
let admin: Client;
let viewer: Client;

async function login(username: string): Promise<Client> {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").set("origin", origin).send({ username, password: process.env.DEMO_SEED_PASSWORD });
  return { agent, csrf: response.body.csrfToken as string, id: response.body.account.id as string };
}

function syntheticOutboxPayload(correlationId: string) {
  return {
    caseCode: "SEC-2026-000001", sourceTicketCode: "HD-2026-000001", severity: "High", status: "New",
    summary: "Synthetic minimized context", asset: { reference: "asset_0123456789abcdef" }, evidenceSummaries: [],
    timelineTimestamps: ["2026-08-28T15:00:00.000Z"], correlationId,
  } satisfies Prisma.InputJsonObject;
}

async function createOutbox(status: "Pending" | "Failed" = "Pending", attempts = 0, payload?: Prisma.InputJsonValue) {
  const correlationId = randomUUID();
  return db.integrationOutbox.create({ data: {
    eventId: randomUUID(), eventType: "security.case.created", schemaVersion: 1,
    occurredAt: new Date("2026-08-28T15:00:00.000Z"), source: "edy-helpdesk", correlationId,
    idempotencyKey: `phase7-test:${randomUUID()}`, payload: payload ?? syntheticOutboxPayload(correlationId), status, attempts,
    availableAt: new Date("2026-08-28T15:00:00.000Z"),
  } });
}

beforeAll(async () => {
  db = await testDatabase();
  await seedDatabase(db); await seedPhase4(db); await seedPhase5(db);
  app = createApp({ logger: pino({ level: "silent" }), webOrigin: origin, jsonLimit: "64kb", version: "1.0.0", checkDatabase: async () => {}, prisma: db, audit: createAuditRepository(db), config, integrationExportRoot: exportRoot });
  resetLoginRateLimitsForTests(); resetIntegrationRateLimitsForTests();
  admin = await login("demo.admin"); viewer = await login("demo.viewer");
});
afterAll(async () => db.$disconnect());

describe.sequential("Phase 7 integrations", () => {
  it("requires authentication and never claims a connection that was not made", async () => {
    expect((await request(app).get("/api/v1/integrations")).status).toBe(401);
    const response = await viewer.agent.get("/api/v1/integrations");
    expect(response.status).toBe(200);
    expect(response.body.integrations.map((item: { status: string }) => item.status)).toEqual(["Unavailable", "Incompatible", "ExportReady"]);
    expect(response.body.integrations.some((item: { status: string }) => item.status === "Connected")).toBe(false);
    expect(response.body.outbox.pending).toBeGreaterThanOrEqual(3);
  });

  it("returns non-secret real settings and Demo safety locks", async () => {
    const response = await viewer.agent.get("/api/v1/settings");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ application: { version: "1.0.0", mode: "Demo", databaseProvider: "sqlite" }, diagnostics: { workerIsolated: true, realExecutionEnabled: false, elevationAllowed: false, arbitraryCommandsAllowed: false }, integrations: { externalEnabled: false, portfolioDemoLock: true } });
    expect(JSON.stringify(response.body)).not.toMatch(/token|secret|databaseUrl|password/iu);
  });

  it("denies Viewer export mutation and audits the authorization decision", async () => {
    const response = await viewer.agent.post("/api/v1/integrations/analytics/exports").set("origin", origin).set("x-csrf-token", viewer.csrf).send({ dataset: "Tickets" });
    expect(response.status).toBe(403);
    expect(await db.auditEvent.count({ where: { actorId: viewer.id, action: "authorization.denied", outcome: "denied" } })).toBeGreaterThan(0);
  });

  it("creates a strict minimized local analytics export for Admin", async () => {
    const response = await admin.agent.post("/api/v1/integrations/analytics/exports").set("origin", origin).set("x-csrf-token", admin.csrf).send({ dataset: "Tickets" });
    expect(response.status).toBe(201);
    const content = await readFile(path.join(exportRoot, response.body.fileName as string), "utf8");
    expect(analyticsIntegrationEnvelopeSchema.safeParse(JSON.parse(content)).success).toBe(true);
    expect(content).not.toMatch(/description|internalNote|credential|password|cookie|token|hostname|macAddress|ipv4/iu);
  });

  it("exports all seven versioned datasets with matching record counts", async () => {
    for (const dataset of ["Tickets", "SLAs", "Assets", "Diagnostics", "Knowledge", "SecurityCases", "Calendar"] as const) {
      const result = await createAnalyticsIntegrationExport(db, exportRoot, dataset);
      const envelope = analyticsIntegrationEnvelopeSchema.parse(JSON.parse(await readFile(path.join(exportRoot, result.fileName), "utf8")));
      expect(envelope.recordCount).toBe(envelope.records.length);
      expect(envelope.dataset).toBe(dataset);
    }
  });

  it("delivers a valid outbox event exactly once", async () => {
    await db.integrationOutbox.updateMany({ data: { status: "Processed", processedAt: new Date() } });
    const row = await createOutbox();
    const port: IntegrationPort = { deliver: vi.fn(async () => {}) };
    expect(await dispatchNextOutboxEvent({ db, port, now: new Date("2026-08-28T15:01:00.000Z"), maxAttempts: 3, backoffBaseMs: 1_000 })).toBe("processed");
    expect(port.deliver).toHaveBeenCalledOnce();
    expect((await db.integrationOutbox.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("Processed");
  });

  it("retries transient failures with exponential backoff and sanitized errors", async () => {
    const row = await createOutbox();
    const port: IntegrationPort = { deliver: async () => { throw new IntegrationDeliveryError("timeout", true); } };
    expect(await dispatchNextOutboxEvent({ db, port, now: new Date("2026-08-28T15:01:00.000Z"), maxAttempts: 3, backoffBaseMs: 2_000 })).toBe("retry");
    const updated = await db.integrationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated).toMatchObject({ status: "Failed", attempts: 1, lastError: "timeout" });
    expect(updated.availableAt.toISOString()).toBe("2026-08-28T15:01:02.000Z");
  });

  it("dead-letters permanent and exhausted deliveries", async () => {
    const permanent = await createOutbox();
    const invalidPort: IntegrationPort = { deliver: async () => { throw new IntegrationDeliveryError("contract_mismatch", false); } };
    expect(await dispatchNextOutboxEvent({ db, port: invalidPort, now: new Date("2026-08-28T15:01:00.000Z"), maxAttempts: 3, backoffBaseMs: 1_000 })).toBe("dead-letter");
    expect((await db.integrationOutbox.findUniqueOrThrow({ where: { id: permanent.id } })).lastError).toBe("contract_mismatch");

    const exhausted = await createOutbox("Failed", 2);
    const retryablePort: IntegrationPort = { deliver: async () => { throw new IntegrationDeliveryError("unavailable", true); } };
    expect(await dispatchNextOutboxEvent({ db, port: retryablePort, now: new Date("2026-08-28T15:02:00.000Z"), maxAttempts: 3, backoffBaseMs: 1_000 })).toBe("dead-letter");
    expect((await db.integrationOutbox.findUniqueOrThrow({ where: { id: exhausted.id } })).status).toBe("DeadLetter");
  });

  it("dead-letters an invalid stored contract before any network call", async () => {
    const row = await createOutbox("Pending", 0, { password: "must-not-leave-storage" });
    const port: IntegrationPort = { deliver: vi.fn(async () => {}) };
    expect(await dispatchNextOutboxEvent({ db, port, now: new Date("2026-08-28T15:03:00.000Z"), maxAttempts: 3, backoffBaseMs: 1_000 })).toBe("dead-letter");
    expect(port.deliver).not.toHaveBeenCalled();
    expect((await db.integrationOutbox.findUniqueOrThrow({ where: { id: row.id } })).lastError).toBe("contract_mismatch");
  });

  it("rate limits expensive analytics export creation", async () => {
    resetIntegrationRateLimitsForTests();
    for (let index = 0; index < 5; index += 1) expect((await admin.agent.post("/api/v1/integrations/analytics/exports").set("origin", origin).set("x-csrf-token", admin.csrf).send({ dataset: "Knowledge" })).status).toBe(201);
    expect((await admin.agent.post("/api/v1/integrations/analytics/exports").set("origin", origin).set("x-csrf-token", admin.csrf).send({ dataset: "Knowledge" })).status).toBe(429);
  });
});
