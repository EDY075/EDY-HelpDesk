import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AppConfig } from "@edy/config";
import { seedDatabase } from "../../../prisma/seed.js";
import { createApp } from "./app.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { createAuditRepository } from "./modules/audit/audit-repository.js";
import { sessionCookieOptions } from "./modules/auth/auth.js";
import { resetLoginRateLimitsForTests } from "./modules/auth/auth-routes.js";
import { testDatabase } from "./test-database.js";

const origin = "http://127.0.0.1:5173";
const config: AppConfig = { NODE_ENV: "test", API_HOST: "127.0.0.1", API_PORT: 8080, WEB_ORIGIN: origin, DATABASE_PROVIDER: "sqlite", DATABASE_URL: "file:test", LOG_LEVEL: "silent", PORTFOLIO_DEMO: true, SESSION_IDLE_MINUTES: 30, SESSION_ABSOLUTE_HOURS: 12, INTEGRATION_SENTINEL_ENABLED: false, INTEGRATION_SIEM_ENABLED: false, INTEGRATION_ANALYTICS_ENABLED: false, INTEGRATION_TIMEOUT_MS: 3_000, INTEGRATION_MAX_ATTEMPTS: 5, INTEGRATION_BACKOFF_BASE_MS: 1_000 };
let db: PrismaClient;
let app: ReturnType<typeof createApp>;

async function login(agent: ReturnType<typeof request.agent>) {
  return agent.post("/api/v1/auth/login").set("origin", origin).send({ username: "demo.admin", password: process.env.DEMO_SEED_PASSWORD });
}

beforeAll(async () => {
  db = await testDatabase(); await seedDatabase(db);
  app = createApp({ logger: pino({ level: "silent" }), webOrigin: origin, jsonLimit: "64kb", version: "test", checkDatabase: async () => {}, prisma: db, audit: createAuditRepository(db), config });
  resetLoginRateLimitsForTests();
});
afterAll(async () => db?.$disconnect());

describe.sequential("Phase 7 authentication and session hardening", () => {
  it("uses Secure, HttpOnly, Strict and root-path production session cookies", () => {
    expect(sessionCookieOptions(true, 60_000)).toEqual({ httpOnly: true, sameSite: "strict", secure: true, path: "/", maxAge: 60_000 });
  });

  it("rotates an existing authenticated session on a new login", async () => {
    const agent = request.agent(app);
    expect((await login(agent)).status).toBe(200);
    const account = await db.account.findUniqueOrThrow({ where: { username: "demo.admin" } });
    const first = await db.session.findFirstOrThrow({ where: { accountId: account.id }, orderBy: { createdAt: "desc" } });
    expect((await login(agent)).status).toBe(200);
    expect((await db.session.findUniqueOrThrow({ where: { id: first.id } })).revokedAt).not.toBeNull();
    expect(await db.session.count({ where: { accountId: account.id, revokedAt: null, expiresAt: { gt: new Date() } } })).toBe(1);
  });

  it("treats malformed cookie encoding as unauthenticated instead of a server error", async () => {
    expect((await request(app).get("/api/v1/tickets").set("cookie", "edy_session=%")).status).toBe(401);
  });

  it("rejects absolute-expired and idle-expired sessions", async () => {
    const account = await db.account.findUniqueOrThrow({ where: { username: "demo.admin" } });
    const expiredAgent = request.agent(app); expect((await login(expiredAgent)).status).toBe(200);
    const absolute = await db.session.findFirstOrThrow({ where: { accountId: account.id, revokedAt: null }, orderBy: { createdAt: "desc" } });
    await db.session.update({ where: { id: absolute.id }, data: { expiresAt: new Date(0) } });
    expect((await expiredAgent.get("/api/v1/tickets")).status).toBe(401);

    const idleAgent = request.agent(app); expect((await login(idleAgent)).status).toBe(200);
    const idle = await db.session.findFirstOrThrow({ where: { accountId: account.id, revokedAt: null }, orderBy: { createdAt: "desc" } });
    await db.session.update({ where: { id: idle.id }, data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) } });
    expect((await idleAgent.get("/api/v1/tickets")).status).toBe(401);
  });

  it("revokes logout server-side before clearing browser cookies", async () => {
    const agent = request.agent(app); const session = await login(agent);
    const active = await db.session.findFirstOrThrow({ where: { accountId: session.body.account.id as string, revokedAt: null }, orderBy: { createdAt: "desc" } });
    expect((await agent.post("/api/v1/auth/logout").set("origin", origin).set("x-csrf-token", session.body.csrfToken as string)).status).toBe(204);
    expect((await db.session.findUniqueOrThrow({ where: { id: active.id } })).revokedAt).not.toBeNull();
    expect((await agent.get("/api/v1/tickets")).status).toBe(401);
  });
});
