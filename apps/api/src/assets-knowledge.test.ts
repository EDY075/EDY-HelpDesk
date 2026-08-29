import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../../prisma/seed.js";
import { createApp } from "./app.js";
import { createAuditRepository } from "./modules/audit/audit-repository.js";
import { resetLoginRateLimitsForTests } from "./modules/auth/auth-routes.js";
import { testDatabase } from "./test-database.js";
import type { DatabaseClient } from "./platform/prisma.js";

const origin = "http://127.0.0.1:5173";
let db: DatabaseClient;
let app: ReturnType<typeof createApp>;
type Client = { agent: ReturnType<typeof request.agent>; csrf: string };
let admin: Client;
let tech: Client;
let viewer: Client;
let departmentId: string;
let categoryId: string;
let users: string[];
const send = (
  client: Client,
  path: string,
  body: object,
  method: "post" | "patch" = "post",
) =>
  client.agent[method](`/api/v1${path}`)
    .set("origin", origin)
    .set("x-csrf-token", client.csrf)
    .send(body);
async function asset() {
  const r = await send(admin, "/assets", {
    name: "Synthetic test laptop",
    type: "Laptop",
    departmentId,
  });
  expect(r.status).toBe(201);
  return r.body;
}
async function article() {
  const r = await send(tech, "/knowledge", {
    title: "Synthetic support guide",
    summary: "A structured guide.",
    problem: "A reproducible symptom.",
    symptoms: "A visible error.",
    diagnosticSteps: "1. Record sanitized observations.",
    solution: "Follow the approved support process.",
    validationSteps: "Confirm the original workflow.",
    categoryId,
    tags: ["network", "test"],
  });
  expect(r.status).toBe(201);
  return r.body;
}
async function ticket() {
  return db.ticket.findUniqueOrThrow({
    where: { ticketNumber: "HD-2026-000001" },
  });
}
beforeAll(async () => {
  db = await testDatabase();
  await seedDatabase(db);
  app = createApp({
    logger: pino({ level: "silent" }),
    webOrigin: origin,
    jsonLimit: "64kb",
    version: "test",
    checkDatabase: async () => {},
    prisma: db,
    audit: createAuditRepository(db),
    config: {
      NODE_ENV: "test",
      API_HOST: "127.0.0.1",
      API_PORT: 8080,
      WEB_ORIGIN: origin,
      DATABASE_PROVIDER: "sqlite",
      DATABASE_URL: "file:test",
      LOG_LEVEL: "silent",
      PORTFOLIO_DEMO: true,
      SESSION_IDLE_MINUTES: 30,
      SESSION_ABSOLUTE_HOURS: 12,
      INTEGRATION_SENTINEL_ENABLED: false,
      INTEGRATION_SIEM_ENABLED: false,
      INTEGRATION_ANALYTICS_ENABLED: false,
      INTEGRATION_TIMEOUT_MS: 3_000,
      INTEGRATION_MAX_ATTEMPTS: 5,
      INTEGRATION_BACKOFF_BASE_MS: 1_000,
    },
  });
  resetLoginRateLimitsForTests();
  const login = async (username: string) => {
    const agent = request.agent(app);
    const r = await agent
      .post("/api/v1/auth/login")
      .set("origin", origin)
      .send({ username, password: process.env.DEMO_SEED_PASSWORD });
    expect(r.status).toBe(200);
    return { agent, csrf: r.body.csrfToken as string };
  };
  admin = await login("demo.admin");
  tech = await login("demo.technician");
  viewer = await login("demo.viewer");
  departmentId = (
    await db.department.findUniqueOrThrow({ where: { code: "IT" } })
  ).id;
  categoryId = (
    await db.ticketCategory.findUniqueOrThrow({ where: { name: "Network" } })
  ).id;
  users = (await db.user.findMany({ take: 2 })).map((u) => u.id);
});
afterAll(async () => {
  await db?.$disconnect();
});
describe("Phase 3 assets", () => {
  it("creates minimally specified assets with immutable human codes", async () => {
    const a = await asset();
    expect(a.assetCode).toMatch(/^AST-\d{4}-\d{6}$/);
    expect(a.version).toBe(1);
    expect(a.ramBytes).toBeNull();
    expect(
      (
        await send(
          admin,
          `/assets/${a.id}`,
          { version: 1, assetCode: "AST-2026-999999" },
          "patch",
        )
      ).status,
    ).toBe(400);
  });
  it("allocates unique asset codes under concurrent requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        send(admin, "/assets", {
          name: `Concurrent asset ${i}`,
          type: "Other",
          departmentId,
        }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
    expect(new Set(results.map((r) => r.body.assetCode)).size).toBe(6);
  });
  it("updates optional inventory without elevating or executing diagnostics", async () => {
    const a = await asset();
    const r = await send(
      admin,
      `/assets/${a.id}`,
      {
        version: 1,
        ramBytes: 16 * 1024 ** 3,
        ipv4: "192.0.2.55",
        macAddress: "02:00:00:00:00:55",
      },
      "patch",
    );
    expect(r.status).toBe(200);
    expect(r.body.ramBytes).toBe(17179869184);
    expect(
      (await admin.agent.get(`/api/v1/assets/${a.id}`)).body
        .diagnosticsAvailable,
    ).toBe(false);
  });
  it("rejects invalid IP, MAC, type, byte size and executable fields", async () => {
    for (const invalid of [
      { ipv4: "999.1.2.3" },
      { macAddress: "bad" },
      { type: "Exploit" },
      { ramBytes: -1 },
      { scriptPath: "arbitrary.ps1" },
      { serialNumber: "<invalid>" },
    ])
      expect(
        (
          await send(admin, "/assets", {
            name: "Invalid asset",
            type: "Laptop",
            departmentId,
            ...invalid,
          })
        ).status,
      ).toBe(400);
  });
  it("permits only one concurrent update for the same asset version", async () => {
    const a = await asset();
    const results = await Promise.all(
      ["One", "Two"].map((name) =>
        send(admin, `/assets/${a.id}`, { version: 1, name }, "patch"),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it("assigns, reassigns and unassigns with durable audit history", async () => {
    let a = await asset();
    for (const userId of [users[0], users[1], null]) {
      const r = await send(tech, `/assets/${a.id}/assignments`, {
        version: a.version,
        assignedUserId: userId,
      });
      expect(r.status).toBe(200);
      a = r.body;
    }
    expect(a.assignedUserId).toBeNull();
    expect(
      (await db.auditEvent.findMany({ where: { resourceId: a.id } })).map(
        (e) => e.action,
      ),
    ).toEqual(
      expect.arrayContaining([
        "asset.assigned",
        "asset.reassigned",
        "asset.unassigned",
      ]),
    );
  });
  it("rejects archived assignees", async () => {
    const u = await db.user.create({
      data: {
        displayName: "Archived synthetic",
        departmentId,
        archivedAt: new Date(),
      },
    });
    const a = await asset();
    expect(
      (
        await send(admin, `/assets/${a.id}/assignments`, {
          version: 1,
          assignedUserId: u.id,
        })
      ).status,
    ).toBe(400);
  });
  it("archives without deleting and restores with version checks", async () => {
    const a = await asset();
    expect(
      (await send(admin, `/assets/${a.id}/archive`, { version: 1 })).status,
    ).toBe(200);
    expect(
      (await send(admin, `/assets/${a.id}/restore`, { version: 1 })).status,
    ).toBe(409);
    expect(
      (await send(admin, `/assets/${a.id}/restore`, { version: 2 })).body
        .archivedAt,
    ).toBeNull();
    expect(await db.asset.count({ where: { id: a.id } })).toBe(1);
  });
  it("filters archived inventory from queues and new-ticket metadata", async () => {
    const a = await asset();
    await send(admin, `/assets/${a.id}/archive`, { version: 1 });
    expect(
      (await admin.agent.get(`/api/v1/assets?search=${a.assetCode}`)).body
        .pagination.total,
    ).toBe(0);
    expect(
      (
        await admin.agent.get(
          `/api/v1/assets?search=${a.assetCode}&includeArchived=true`,
        )
      ).body.pagination.total,
    ).toBe(1);
    expect(
      (await admin.agent.get("/api/v1/metadata")).body.assets.some(
        (x: { id: string }) => x.id === a.id,
      ),
    ).toBe(false);
  });
  it("applies asset filters, search, sort and pagination", async () => {
    const a = await asset();
    await send(
      admin,
      `/assets/${a.id}`,
      { version: 1, operatingSystem: "TestOS", status: "Maintenance" },
      "patch",
    );
    const r = await viewer.agent.get(
      "/api/v1/assets?type=Laptop&status=Maintenance&operatingSystem=TestOS&pageSize=1&sort=assetCode&order=asc",
    );
    expect(r.status).toBe(200);
    expect(r.body.data[0].id).toBe(a.id);
    expect(r.body.pagination.pageSize).toBe(1);
  });
  it("links, changes and unlinks ticket assets with ticket versions and history", async () => {
    const a = await asset();
    let t = await ticket();
    const old = t.assetId;
    expect(
      (
        await send(tech, `/tickets/${t.id}/asset`, {
          version: t.version,
          assetId: a.id,
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await send(tech, `/tickets/${t.id}/asset`, {
          version: t.version,
          assetId: null,
        })
      ).status,
    ).toBe(409);
    t = await ticket();
    expect(
      (
        await send(tech, `/tickets/${t.id}/asset`, {
          version: t.version,
          assetId: null,
        })
      ).status,
    ).toBe(204);
    const history = await db.ticketHistory.findFirst({
      where: { ticketId: t.id, action: "ticket.asset_changed" },
      orderBy: { createdAt: "asc" },
    });
    expect(history?.details).toMatchObject({
      previousAssetId: old,
      newAssetId: a.id,
    });
  });
  it("blocks archived assets through both ticket mutation routes and creation", async () => {
    const a = await asset();
    await send(admin, `/assets/${a.id}/archive`, { version: 1 });
    const t = await ticket();
    expect(
      (
        await send(admin, `/tickets/${t.id}/asset`, {
          version: t.version,
          assetId: a.id,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(
          admin,
          `/tickets/${t.id}`,
          { version: t.version, assetId: a.id },
          "patch",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await send(admin, "/tickets", {
          title: "Synthetic request",
          description: "Archived asset must be rejected.",
          requesterId: t.requesterId,
          categoryId,
          priority: "Low",
          assetId: a.id,
        })
      ).status,
    ).toBe(400);
  });
  it("preserves historical ticket references when an asset is archived", async () => {
    const a = await asset();
    const t = await ticket();
    await send(admin, `/tickets/${t.id}/asset`, {
      version: t.version,
      assetId: a.id,
    });
    await send(admin, `/assets/${a.id}/archive`, { version: 1 });
    expect(
      (await admin.agent.get(`/api/v1/tickets/${t.id}`)).body.asset.id,
    ).toBe(a.id);
  });
  it("exposes assigned assets and real ticket sets in User Workspace", async () => {
    const a = await asset();
    await send(admin, `/assets/${a.id}/assignments`, {
      version: 1,
      assignedUserId: users[0],
    });
    const r = await viewer.agent.get(`/api/v1/users/${users[0]}`);
    expect(r.status).toBe(200);
    expect(r.body.assets.some((x: { id: string }) => x.id === a.id)).toBe(true);
    expect(
      r.body.openTickets.every(
        (t: { status: string }) => !["Resolved", "Closed"].includes(t.status),
      ),
    ).toBe(true);
  });
});
describe("Phase 3 knowledge and safeguards", () => {
  it("creates drafts with human codes and author identity", async () => {
    const a = await article();
    expect(a.articleCode).toMatch(/^KB-\d{4}-\d{6}$/);
    expect(a.status).toBe("Draft");
    expect(a.author.username).toBe("demo.technician");
  });
  it("allocates unique article codes concurrently", async () => {
    const articles = await Promise.all(
      Array.from({ length: 6 }, () => article()),
    );
    expect(new Set(articles.map((a) => a.articleCode)).size).toBe(6);
  });
  it("rejects HTML, forced publication, codes and arbitrary fields", async () => {
    const a = await article();
    for (const dto of [
      { solution: "<script>alert(1)</script>" },
      { status: "Published" },
      { articleCode: "KB-2026-999999" },
    ])
      expect(
        (
          await send(
            tech,
            `/knowledge/${a.id}`,
            { version: 1, ...dto },
            "patch",
          )
        ).status,
      ).toBe(400);
  });
  it("allows draft editing but detects stale versions", async () => {
    const a = await article();
    expect(
      (
        await send(
          tech,
          `/knowledge/${a.id}`,
          { version: 1, summary: "Updated draft" },
          "patch",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await send(
          tech,
          `/knowledge/${a.id}`,
          { version: 1, summary: "Lost update" },
          "patch",
        )
      ).status,
    ).toBe(409);
  });
  it("permits only one simultaneous article update", async () => {
    const a = await article();
    const r = await Promise.all(
      ["First", "Second"].map((summary) =>
        send(tech, `/knowledge/${a.id}`, { version: 1, summary }, "patch"),
      ),
    );
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
  });
  it("requires Admin and complete content for publication", async () => {
    const a = await article();
    expect(
      (await send(tech, `/knowledge/${a.id}/publish`, { version: 1 })).status,
    ).toBe(403);
    expect(
      (await send(admin, `/knowledge/${a.id}/publish`, { version: 1 })).status,
    ).toBe(200);
    expect(
      (
        await send(
          tech,
          `/knowledge/${a.id}`,
          { version: 2, summary: "Forbidden" },
          "patch",
        )
      ).status,
    ).toBe(403);
    const b = await article();
    await send(
      tech,
      `/knowledge/${b.id}`,
      { version: 1, solution: "" },
      "patch",
    );
    expect(
      (await send(admin, `/knowledge/${b.id}/publish`, { version: 2 })).status,
    ).toBe(400);
  });
  it("hides drafts and archives from Viewer, including direct URLs and filters", async () => {
    const a = await article();
    expect((await viewer.agent.get(`/api/v1/knowledge/${a.id}`)).status).toBe(
      404,
    );
    expect(
      (await viewer.agent.get("/api/v1/knowledge?status=Draft")).status,
    ).toBe(403);
    expect(
      (await viewer.agent.get("/api/v1/knowledge")).body.data.every(
        (x: { status: string }) => x.status === "Published",
      ),
    ).toBe(true);
  });
  it("archives and restores to Draft without publishing implicitly", async () => {
    const a = await article();
    await send(admin, `/knowledge/${a.id}/publish`, { version: 1 });
    expect(
      (await send(admin, `/knowledge/${a.id}/archive`, { version: 2 })).body
        .status,
    ).toBe("Archived");
    expect((await viewer.agent.get(`/api/v1/knowledge/${a.id}`)).status).toBe(
      404,
    );
    const restored = await send(admin, `/knowledge/${a.id}/restore`, {
      version: 3,
    });
    expect(restored.body.status).toBe("Draft");
    expect(restored.body.archivedAt).toBeNull();
  });
  it("searches codes, content and exact tags with category/status filters", async () => {
    const a = await article();
    await send(
      tech,
      `/knowledge/${a.id}`,
      { version: 1, solution: "UniqueSanitizedSolution" },
      "patch",
    );
    const r = await tech.agent.get(
      `/api/v1/knowledge?search=UniqueSanitizedSolution&tag=test&status=Draft&categoryId=${categoryId}`,
    );
    expect(r.body.data.map((x: { id: string }) => x.id)).toContain(a.id);
    expect(
      (
        await tech.agent.get(
          `/api/v1/knowledge?search=${a.articleCode}&tag=tes`,
        )
      ).body.pagination.total,
    ).toBe(0);
  });
  it("links and unlinks published articles with ticket history and audit", async () => {
    const a = await article();
    await send(admin, `/knowledge/${a.id}/publish`, { version: 1 });
    let t = await ticket();
    expect(
      (
        await send(tech, `/tickets/${t.id}/knowledge/link`, {
          version: t.version,
          articleId: a.id,
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await viewer.agent.get(`/api/v1/tickets/${t.id}/knowledge`)
      ).body.data.some((x: { id: string }) => x.id === a.id),
    ).toBe(true);
    t = await ticket();
    expect(
      (
        await send(tech, `/tickets/${t.id}/knowledge/unlink`, {
          version: t.version,
          articleId: a.id,
        })
      ).status,
    ).toBe(204);
    expect(
      await db.auditEvent.count({
        where: { resourceId: t.id, action: "ticket.knowledge_unlinked" },
      }),
    ).toBeGreaterThan(0);
  });
  it("rejects draft links and unauthorized ticket scope", async () => {
    const a = await article();
    const t = await ticket();
    expect(
      (
        await send(tech, `/tickets/${t.id}/knowledge/link`, {
          version: t.version,
          articleId: a.id,
        })
      ).status,
    ).toBe(400);
    await send(admin, `/knowledge/${a.id}/publish`, { version: 1 });
    const unassigned = await db.ticket.findUniqueOrThrow({
      where: { ticketNumber: "HD-2026-000003" },
    });
    expect(
      (
        await send(tech, `/tickets/${unassigned.id}/knowledge/link`, {
          version: unassigned.version,
          articleId: a.id,
        })
      ).status,
    ).toBe(403);
  });
  it("denies anonymous and Viewer mutations and Technician archival", async () => {
    expect((await request(app).get("/api/v1/assets")).status).toBe(401);
    expect((await request(app).get("/api/v1/knowledge")).status).toBe(401);
    expect((await send(viewer, "/assets", {})).status).toBe(403);
    expect((await send(viewer, "/knowledge", {})).status).toBe(403);
    const a = await asset();
    expect(
      (await send(tech, `/assets/${a.id}/archive`, { version: 1 })).status,
    ).toBe(403);
  });
  it("keeps CSRF checks active on new endpoints", async () => {
    expect(
      (await admin.agent.post("/api/v1/assets").set("origin", origin).send({}))
        .status,
    ).toBe(403);
  });
  it("never serializes account credential hashes in ticket or article responses", async () => {
    const t = await ticket();
    const a = await article();
    for (const path of ["/tickets", `/tickets/${t.id}`, `/knowledge/${a.id}`]) {
      const r = await admin.agent.get(`/api/v1${path}`);
      expect(JSON.stringify(r.body)).not.toContain("credentialHash");
      expect(JSON.stringify(r.body)).not.toContain("$argon2");
    }
  });
  it("enforces append-only audit at database level", async () => {
    const event = await db.auditEvent.findFirstOrThrow();
    await expect(
      db.auditEvent.update({
        where: { id: event.id },
        data: { action: "tampered" },
      }),
    ).rejects.toThrow();
    await expect(
      db.auditEvent.delete({ where: { id: event.id } }),
    ).rejects.toThrow();
  });
  it("does not reset ticket state, SLA or sequence values on repeated seed", async () => {
    const t = await ticket();
    const sla = await db.ticketSla.findUniqueOrThrow({
      where: { ticketId: t.id },
    });
    await db.sequenceCounter.update({
      where: { scope_year: { scope: "ticket", year: 2026 } },
      data: { value: 500 },
    });
    await seedDatabase(db);
    expect((await ticket()).version).toBe(t.version);
    expect(
      (await db.ticketSla.findUniqueOrThrow({ where: { ticketId: t.id } }))
        .resolutionDueAt,
    ).toEqual(sla.resolutionDueAt);
    expect(
      (
        await db.sequenceCounter.findUniqueOrThrow({
          where: { scope_year: { scope: "ticket", year: 2026 } },
        })
      ).value,
    ).toBe(500);
  });
});
