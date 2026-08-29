import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import Database from "better-sqlite3";
import { seedDatabase } from "../prisma/seed.js";
import { buildAnalytics } from "../apps/api/src/modules/analytics/metrics.js";
import { resolveDateRange } from "../apps/api/src/modules/analytics/date-range.js";
import { generateReportRecords, recordsToCsv } from "../apps/api/src/modules/analytics/reports.js";
import { createPrismaClient } from "../apps/api/src/platform/prisma.js";

const root = path.resolve(process.cwd());
const directory = path.join(root, "storage", "performance-qa", `phase7-${randomUUID()}`);
await mkdir(directory, { recursive: true });
const databasePath = path.join(directory, "performance.db");
const sqlite = new Database(databasePath);
try {
  for (const entry of (await readdir(path.join(root, "prisma", "migrations"), { withFileTypes: true }))
    .filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    sqlite.exec(await readFile(path.join(root, "prisma", "migrations", entry.name, "migration.sql"), "utf8"));
  }
} finally { sqlite.close(); }

const db = createPrismaClient(`file:${databasePath}`);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
async function measure(run: () => Promise<unknown>) {
  const samples: number[] = [];
  for (let index = 0; index < 5; index += 1) {
    const started = performance.now();
    await run();
    samples.push(performance.now() - started);
  }
  return Number(median(samples).toFixed(1));
}

try {
  await seedDatabase(db);
  const requester = await db.user.findFirstOrThrow();
  const department = await db.department.findFirstOrThrow();
  const category = await db.ticketCategory.findFirstOrThrow();
  const policy = await db.slaPolicy.findFirstOrThrow({ where: { priority: "Medium" } });
  const technician = await db.account.findFirstOrThrow({ where: { role: "Technician" } });
  const now = Date.now();
  await db.ticket.createMany({ data: Array.from({ length: 5_000 }, (_, index) => ({
    id: randomUUID(), ticketNumber: `PERF-2026-${String(index + 1).padStart(6, "0")}`,
    title: `Synthetic performance ticket ${index + 1}`, description: "Synthetic non-production performance fixture.",
    priority: "Medium" as const, status: index % 4 === 0 ? "Resolved" as const : "Assigned" as const,
    requesterId: requester.id, departmentId: department.id, categoryId: category.id,
    assigneeAccountId: technician.id, slaPolicyId: policy.id,
    createdAt: new Date(now - (index % 25) * 86_400_000),
    resolvedAt: index % 4 === 0 ? new Date(now - (index % 25) * 86_400_000 + 3_600_000) : null,
  })) });

  const openStatuses = ["New", "Assigned", "InProgress", "WaitingUser", "WaitingThirdParty"] as const;
  const interval = resolveDateRange({ range: "30d" });
  const overviewMs = await measure(async () => Promise.all([
    db.ticket.count({ where: { status: { in: [...openStatuses] } } }),
    db.ticket.count({ where: { status: { in: [...openStatuses] }, assigneeAccountId: technician.id } }),
    db.ticket.count({ where: { status: { in: [...openStatuses] }, assigneeAccountId: null } }),
    db.ticket.count({ where: { status: { in: [...openStatuses] }, priority: "Critical" } }),
  ]));
  const operationsMs = await measure(async () => Promise.all([
    db.diagnosticJob.groupBy({ by: ["status"], _count: true }),
    db.integrationOutbox.groupBy({ by: ["status"], _count: true }),
    db.exportJob.groupBy({ by: ["status"], _count: true }),
  ]));
  const ticketQueueMs = await measure(async () => db.ticket.findMany({
    where: { status: { in: [...openStatuses] } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100,
    include: { requester: true, category: true, department: true, assignee: true, sla: true },
  }));
  const assetQueueMs = await measure(async () => db.asset.findMany({ where: { archivedAt: null }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100 }));
  const securityQueueMs = await measure(async () => db.securityCase.findMany({ where: { status: { not: "Closed" } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100 }));
  const dashboardMs = await measure(async () => buildAnalytics(db, technician.id, interval));
  let reportRows: Array<Record<string, unknown>> = [];
  const exportQueryMs = await measure(async () => {
    reportRows = await generateReportRecords(db, "TicketReport", "Admin", technician.id, interval);
  });
  const exportCsvMs = await measure(async () => {
    reportRows = await generateReportRecords(db, "TicketReport", "Admin", technician.id, interval);
    recordsToCsv(reportRows);
  });

  const timings = { overviewMs, operationsMs, ticketQueueMs, assetQueueMs, securityQueueMs, dashboardMs, exportQueryMs, exportCsvMs };
  if (Object.values(timings).some((value) => value > 5_000)) throw new Error("Phase 7 performance threshold exceeded");
  console.log(JSON.stringify({ phase7Performance: "PASS", method: "median-of-5", thresholdMs: 5_000,
    syntheticTickets: await db.ticket.count(), reportRows: reportRows.length, timings, databasePath }));
} finally { await db.$disconnect(); }

const explainDb = new Database(databasePath, { readonly: true });
try {
  const plans = {
    ticketQueue: explainDb.prepare('EXPLAIN QUERY PLAN SELECT id FROM "Ticket" WHERE status IN (?,?,?,?,?) ORDER BY updatedAt DESC, id ASC LIMIT 100').all("New", "Assigned", "InProgress", "WaitingUser", "WaitingThirdParty"),
    securityQueue: explainDb.prepare('EXPLAIN QUERY PLAN SELECT id FROM "SecurityCase" WHERE status <> ? ORDER BY updatedAt DESC, id ASC LIMIT 100').all("Closed"),
    outboxDispatch: explainDb.prepare('EXPLAIN QUERY PLAN SELECT id FROM "IntegrationOutbox" WHERE status = ? AND availableAt <= ? ORDER BY availableAt ASC LIMIT 25').all("Pending", new Date().toISOString()),
  };
  console.log(JSON.stringify({ explainPlans: plans }));
} finally { explainDb.close(); }
