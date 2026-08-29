import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { analyticsIntegrationEnvelopeSchema, type AnalyticsIntegrationEnvelope } from "@edy/contracts";
import type { DatabaseClient } from "../../platform/prisma.js";

const pseudonym = (kind: string, value: string | null | undefined) => value
  ? `${kind}_${createHash("sha256").update(`edy-helpdesk:v1:${kind}:${value}`).digest("hex").slice(0, 16)}`
  : null;

async function recordsFor(db: DatabaseClient, dataset: AnalyticsIntegrationEnvelope["dataset"]): Promise<Array<Record<string, unknown>>> {
  switch (dataset) {
    case "Tickets": return (await db.ticket.findMany({ include: { category: true, department: true } })).map((row) => ({ ticketCode: row.ticketNumber, status: row.status, priority: row.priority, categoryCode: row.category.code, departmentCode: row.department?.code ?? null, requesterRef: pseudonym("usr", row.requesterId), assigneeRef: pseudonym("acct", row.assigneeAccountId), assetRef: pseudonym("asset", row.assetId), createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null, closedAt: row.closedAt?.toISOString() ?? null }));
    case "SLAs": return (await db.ticketSla.findMany({ include: { ticket: { select: { ticketNumber: true, status: true, priority: true } }, slaPolicy: true } })).map((row) => ({ ticketCode: row.ticket.ticketNumber, ticketStatus: row.ticket.status, priority: row.ticket.priority, policy: row.slaPolicy.name, policyVersion: row.slaPolicy.version, responseDueAt: row.responseDueAt.toISOString(), resolutionDueAt: row.resolutionDueAt.toISOString(), pausedSeconds: row.totalPausedSeconds, responseBreachedAt: row.responseBreachedAt?.toISOString() ?? null, resolutionBreachedAt: row.resolutionBreachedAt?.toISOString() ?? null }));
    case "Assets": return (await db.asset.findMany({ where: { archivedAt: null }, include: { department: true } })).map((row) => ({ assetRef: pseudonym("asset", row.id), assetCode: row.assetCode, assetType: row.assetType, status: row.status, departmentCode: row.department.code, operatingSystem: row.operatingSystem, assigned: Boolean(row.ownerId), lastSeenAt: row.lastSeenAt?.toISOString() ?? null }));
    case "Diagnostics": return (await db.diagnosticJob.findMany({ include: { action: { select: { category: true } }, result: { select: { findings: true, redactionCount: true } } } })).map((row) => ({ diagnosticRef: pseudonym("diag", row.id), assetRef: pseudonym("asset", row.assetId), actionId: row.actionId, category: row.action.category, status: row.status, sourceMode: row.sourceMode, requestedAt: row.requestedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null, findingCount: Array.isArray(row.result?.findings) ? row.result.findings.length : 0, redactionCount: row.result?.redactionCount ?? 0, errorCode: row.errorCode }));
    case "Knowledge": return (await db.knowledgeArticle.findMany({ include: { category: true, _count: { select: { ticketLinks: true } } } })).map((row) => ({ articleCode: row.articleCode, status: row.status, categoryCode: row.category.code, linkedTicketCount: row._count.ticketLinks, version: row.version, publishedAt: row.publishedAt?.toISOString() ?? null, archivedAt: row.archivedAt?.toISOString() ?? null }));
    case "SecurityCases": return (await db.securityCase.findMany({ include: { ticket: { select: { ticketNumber: true } }, _count: { select: { evidence: true, timeline: true } } } })).map((row) => ({ securityCaseCode: row.securityCaseCode, sourceTicketCode: row.ticket.ticketNumber, severity: row.severity, status: row.status, assetRef: pseudonym("asset", row.assetId), analystRef: pseudonym("acct", row.assignedAnalystId), evidenceCount: row._count.evidence, timelineCount: row._count.timeline, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null, closedAt: row.closedAt?.toISOString() ?? null }));
    case "Calendar": {
      const today = new Date(); const records: Array<Record<string, unknown>> = [];
      for (let offset = 364; offset >= 0; offset -= 1) { const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset)); records.push({ date: date.toISOString().slice(0, 10), year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, quarter: Math.floor(date.getUTCMonth() / 3) + 1, dayOfWeek: date.getUTCDay() }); }
      return records;
    }
  }
}

export function safeAnalyticsExportPath(root: string, fileName: string): string {
  if (!/^(tickets|slas|assets|diagnostics|knowledge|securitycases|calendar)-\d{8}t\d{6}-[0-9a-f-]{36}\.json$/u.test(fileName)) throw new Error("INVALID_ANALYTICS_EXPORT_PATH");
  const resolvedRoot = path.resolve(root); const resolved = path.resolve(resolvedRoot, fileName);
  if (path.dirname(resolved) !== resolvedRoot) throw new Error("INVALID_ANALYTICS_EXPORT_PATH");
  return resolved;
}

export async function createAnalyticsIntegrationExport(db: DatabaseClient, root: string, dataset: AnalyticsIntegrationEnvelope["dataset"]) {
  const records = await recordsFor(db, dataset);
  const generatedAt = new Date().toISOString();
  const envelope = analyticsIntegrationEnvelopeSchema.parse({ schemaVersion: 1, generatedAt, source: "edy-helpdesk", dataset, recordCount: records.length, records });
  const stamp = generatedAt.replace(/[-:]/gu, "").replace(/\.\d{3}z$/iu, "").toLowerCase();
  const fileName = `${dataset.toLowerCase()}-${stamp}-${randomUUID()}.json`;
  await mkdir(root, { recursive: true });
  const destination = safeAnalyticsExportPath(root, fileName); const temporary = `${destination}.tmp`;
  const content = JSON.stringify(envelope, null, 2);
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  await rename(temporary, destination);
  const metadata = await stat(destination);
  return { fileName, fileSize: metadata.size, recordCount: records.length, sha256: createHash("sha256").update(content).digest("hex"), generatedAt };
}
