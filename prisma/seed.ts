import { randomUUID } from "node:crypto";
import { nextCode } from "../apps/api/src/modules/inventory-knowledge/shared.js";
import { seedPhase3 } from "./seed-phase3.js";
import { seedPhase4 } from './seed-phase4.js';
import { seedPhase5 } from './seed-phase5.js';
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import argon2 from "argon2";
import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";

const departments = [
  { code: "IT", name: "Information Technology" }, { code: "FIN", name: "Finance" },
  { code: "OPS", name: "Operations" }, { code: "HR", name: "Human Resources" },
] as const;
const categories = ["Network", "Hardware", "Software", "Account", "Printer", "Access", "Security"] as const;
const slaTargets = {
  Low: { response: 240, resolution: 2880, risk: 480 }, Medium: { response: 60, resolution: 480, risk: 60 },
  High: { response: 30, resolution: 240, risk: 45 }, Critical: { response: 15, resolution: 120, risk: 30 },
} as const;

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  if((await prisma.deploymentState.findUnique({where:{id:'local'}}))?.mode==='Operational')throw new Error('DEMO_SEED_DENIED');
  const demoPassword = process.env.DEMO_SEED_PASSWORD;
  if (!demoPassword || Buffer.byteLength(demoPassword, "utf8") < 12) throw new Error("DEMO_SEED_PASSWORD must contain at least 12 bytes");
  const credentialHash = await argon2.hash(demoPassword, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1, hashLength: 32 });

  const departmentByCode = new Map<string, string>();
  for (const item of departments) {
    const stored = await prisma.department.upsert({ where: { code: item.code }, update: {}, create: item });
    departmentByCode.set(stored.code, stored.id);
  }
  const categoryByName = new Map<string, string>();
  for (const name of categories) {
    const stored = await prisma.ticketCategory.upsert({ where: { name }, update: {}, create: { code: name.toUpperCase(), name } });
    categoryByName.set(name, stored.id);
  }

  const people = [
    ["morgan", "Morgan Lee", "morgan.lee@example.invalid", "FIN"], ["casey", "Casey Rivera", "casey.rivera@example.invalid", "OPS"],
    ["taylor", "Taylor Brooks", "taylor.brooks@example.invalid", "HR"], ["alex", "Alex Kim", "alex.kim@example.invalid", "IT"],
    ["jordan", "Jordan Patel", "jordan.patel@example.invalid", "IT"], ["sam", "Sam Chen", "sam.chen@example.invalid", "IT"],
  ] as const;
  const userByKey = new Map<string, { id: string; departmentId: string }>();
  for (const [key, displayName, email, department] of people) {
    const user = await prisma.user.upsert({ where: { email }, update: {}, create: { displayName, email, departmentId: departmentByCode.get(department)! } });
    userByKey.set(key, { id: user.id, departmentId: user.departmentId });
  }

  const accountByKey = new Map<string, string>();
  for (const item of [
    { key: "admin", username: "demo.admin", role: "Admin" as const, user: "jordan" },
    { key: "technician", username: "demo.technician", role: "Technician" as const, user: "alex" },
    { key: "viewer", username: "demo.viewer", role: "Viewer" as const, user: "sam" },
  ]) {
    const stored = await prisma.account.upsert({ where: { username: item.username }, update: {}, create: { username: item.username, role: item.role, userId: userByKey.get(item.user)!.id, credentialHash } });
    accountByKey.set(item.key, stored.id);
  }

  const financeCode = await prisma.asset.findUnique({ where: { assetTag: "DEMO-LT-001" } }) ?? await prisma.$transaction(async tx => ({ assetCode: await nextCode(tx, "asset", "AST") }));
  const financeLaptop = await prisma.asset.upsert({ where: { assetTag: "DEMO-LT-001" }, update: {}, create: { assetCode: financeCode.assetCode, assetTag: "DEMO-LT-001", name: "Finance Laptop 01", assetType: "Laptop", serialNumber: "SYNTH-LT-0001", ownerId: userByKey.get("morgan")!.id, departmentId: departmentByCode.get("FIN")! } });
  const operationsCode = await prisma.asset.findUnique({ where: { assetTag: "DEMO-WS-002" } }) ?? await prisma.$transaction(async tx => ({ assetCode: await nextCode(tx, "asset", "AST") }));
  const operationsDesktop = await prisma.asset.upsert({ where: { assetTag: "DEMO-WS-002" }, update: {}, create: { assetCode: operationsCode.assetCode, assetTag: "DEMO-WS-002", name: "Operations Workstation 02", assetType: "Desktop", serialNumber: "SYNTH-WS-0002", ownerId: userByKey.get("casey")!.id, departmentId: departmentByCode.get("OPS")! } });

  const policyByPriority = new Map<string, { id: string; responseTargetMinutes: number; resolutionTargetMinutes: number }>();
  for (const [priority, targets] of Object.entries(slaTargets)) {
    const typedPriority = priority as keyof typeof slaTargets;
    const policy = await prisma.slaPolicy.upsert({ where: { name_version_priority: { name: "Core 24x7", version: 1, priority: typedPriority } }, update: {}, create: { name: "Core 24x7", version: 1, priority: typedPriority, responseTargetMinutes: targets.response, resolutionTargetMinutes: targets.resolution, atRiskThresholdMinutes: targets.risk, waitingThirdPartyPauses: true, effectiveFrom: new Date("2026-01-01T00:00:00.000Z") } });
    policyByPriority.set(priority, policy);
  }

  const now = new Date();
  const fixtures = [
    { code: "HD-2026-000001", title: "Intermittent access to operations network", description: "Connection drops during access to the synthetic operations segment.", requester: "casey", category: "Network", priority: "High" as const, status: "InProgress" as const, assignee: true, assetId: operationsDesktop.id, age: 95 },
    { code: "HD-2026-000002", title: "Password reset required for finance portal", description: "Synthetic requester cannot access the demonstration finance portal after a password change.", requester: "morgan", category: "Account", priority: "Medium" as const, status: "WaitingUser" as const, assignee: true, assetId: financeLaptop.id, age: 180, waitingReason: "Waiting for requester confirmation." },
    { code: "HD-2026-000003", title: "Printer queue remains paused", description: "The shared training printer queue does not resume after clearing sample jobs.", requester: "taylor", category: "Printer", priority: "Low" as const, status: "New" as const, assignee: false, assetId: null, age: 45 },
    { code: "HD-2026-000004", title: "Approved application fails to launch", description: "The synthetic reporting application exits during startup without displaying a technical error.", requester: "morgan", category: "Software", priority: "Medium" as const, status: "Assigned" as const, assignee: true, assetId: financeLaptop.id, age: 75 },
    { code: "HD-2026-000005", title: "Workstation performance degraded", description: "Operations workstation responds slowly when opening local demonstration files.", requester: "casey", category: "Hardware", priority: "High" as const, status: "WaitingThirdParty" as const, assignee: true, assetId: operationsDesktop.id, age: 260, waitingReason: "Waiting for synthetic vendor assessment." },
    { code: "HD-2026-000006", title: "Request access to training knowledge base", description: "Human Resources needs read access to the synthetic support knowledge base.", requester: "taylor", category: "Access", priority: "Low" as const, status: "Resolved" as const, assignee: true, assetId: null, age: 1200, solution: "Assigned the synthetic read-only access group." },
    { code: "HD-2026-000007", title: "Unexpected sign-in prompt reported", description: "A synthetic user reported an unfamiliar sign-in prompt. The case is handled through the governed security escalation workflow.", requester: "morgan", category: "Security", priority: "Critical" as const, status: "Assigned" as const, assignee: true, assetId: financeLaptop.id, age: 18 },
  ];
  for (const fixture of fixtures) {
    const requester = userByKey.get(fixture.requester)!;
    const policy = policyByPriority.get(fixture.priority)!;
    const createdAt = new Date(now.getTime() - fixture.age * 60_000);
    const assigneeAccountId = fixture.assignee ? accountByKey.get("technician")! : null;
    const ticket = await prisma.ticket.upsert({ where: { ticketNumber: fixture.code }, update: fixture.code === "HD-2026-000007" ? { description: fixture.description } : {}, create: { ticketNumber: fixture.code, title: fixture.title, description: fixture.description, requesterId: requester.id, departmentId: requester.departmentId, categoryId: categoryByName.get(fixture.category)!, priority: fixture.priority, status: fixture.status, assigneeAccountId, assetId: fixture.assetId, slaPolicyId: policy.id, waitingReason: fixture.waitingReason ?? null, solution: fixture.solution ?? null, createdAt, resolvedAt: fixture.status === "Resolved" ? now : null, history: { create: { actorAccountId: accountByKey.get("admin")!, action: "seed.ticket.created", toStatus: fixture.status, previousVersion: 0, newVersion: 1, details: { synthetic: true } } } } });
    const responseDueAt = new Date(createdAt.getTime() + policy.responseTargetMinutes * 60_000);
    const resolutionDueAt = new Date(createdAt.getTime() + policy.resolutionTargetMinutes * 60_000);
    const paused = fixture.status === "WaitingUser" || fixture.status === "WaitingThirdParty";
    await prisma.ticketSla.upsert({ where: { ticketId: ticket.id }, update: {}, create: { ticketId: ticket.id, slaPolicyId: policy.id, responseDueAt, resolutionDueAt, firstResponseAt: assigneeAccountId ? new Date(createdAt.getTime() + 10 * 60_000) : null, pausedAt: paused ? now : null, resolutionStoppedAt: fixture.status === "Resolved" ? now : null } });
  }
  await prisma.sequenceCounter.upsert({ where: { scope_year: { scope: "ticket", year: 2026 } }, update: {}, create: { scope: "ticket", year: 2026, value: 7 } });
  await seedPhase3(prisma);
  await prisma.auditEvent.create({ data: { id: randomUUID(), actorType: "system", action: "database.seed.executed", resourceType: "database", outcome: "success", metadata: { syntheticOnly: true, seedVersion: 3 } } });
}

async function main(): Promise<void> {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./storage/edy-helpdesk.db" });
  const prisma = new PrismaClient({ adapter });
  try { if (process.env.PORTFOLIO_DEMO !== "true") throw new Error("Synthetic seed requires PORTFOLIO_DEMO=true"); await seedDatabase(prisma); await seedPhase4(prisma); await seedPhase5(prisma); } finally { await prisma.$disconnect(); }
}
const invokedFile = process.argv[1];
if (invokedFile && resolve(fileURLToPath(import.meta.url)) === resolve(invokedFile)) main().catch((error: unknown) => { console.error("Synthetic seed failed."); process.exitCode = 1; throw error; });
