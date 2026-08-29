import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedDatabase } from "../../../prisma/seed.js";
import { createAuditRepository } from "./modules/audit/audit-repository.js";
import { testDatabase } from "./test-database.js";
import { type DatabaseClient } from "./platform/prisma.js";

describe("SQLite foundation", () => {
  let prisma: DatabaseClient;

  beforeAll(async () => {
    prisma = await testDatabase();
    await prisma.$queryRaw`SELECT 1`;
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects to the migrated SQLite database", async () => {
    const result = await prisma.$queryRaw<Array<{ answer: bigint }>>`SELECT 1 AS answer`;
    expect(Number(result[0]?.answer)).toBe(1);
  });

  it("keeps the synthetic seed categories and departments consistent", async () => {
    const [departmentCount, categoryCount] = await Promise.all([
      prisma.department.count({ where: { archivedAt: null } }),
      prisma.ticketCategory.count({ where: { archivedAt: null } }),
    ]);
    expect(departmentCount).toBe(4);
    expect(categoryCount).toBe(7);
  });

  it("persists valid ticket relations and optimistic versions", async () => {
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { ticketNumber: "HD-2026-000001" },
      include: { requester: true, category: true, asset: true, assignee: true, sla: true, history: true },
    });

    expect(ticket.version).toBe(1);
    expect(ticket.requester.email).toMatch(/@example\.invalid$/u);
    expect(ticket.category.name).toBe("Network");
    expect(ticket.asset?.assetTag).toBe("DEMO-WS-002");
    expect(ticket.assignee?.role).toBe("Technician");
    expect(ticket.sla).not.toBeNull();
    expect(ticket.history.length).toBeGreaterThan(0);
  });

  it("exposes an append-only audit repository", async () => {
    const audit = createAuditRepository(prisma);
    expect(Object.keys(audit).sort()).toEqual(["append", "count"]);
    expect(audit).not.toHaveProperty("update");
    expect(audit).not.toHaveProperty("delete");

    const before = await audit.count();
    await audit.append({
      id: randomUUID(),
      actorType: "system",
      action: "test.audit.append",
      resourceType: "test",
      outcome: "success",
      metadata: { synthetic: true },
    });
    expect(await audit.count()).toBe(before + 1);
  });

  it("keeps all diagnostic actions disabled in the Service Desk Core phase", async () => {
    expect(await prisma.diagnosticAction.count({ where: { enabled: true } })).toBe(0);
  });
});
