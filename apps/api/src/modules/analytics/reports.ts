import { createHash } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AnalyticsEnvelope, ReportType } from "@edy/contracts";
import type { AccountRole } from "@edy/domain";
import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../../platform/prisma.js";
import type { AppendOnlyAuditRepository } from "../audit/audit-repository.js";
import { resolveDateRange, type DateInterval, type DateRangeInput } from "./date-range.js";

export const EXPORT_RETENTION_DAYS = 7;
const CSV_DANGEROUS = /^[=+\-@]/u;
const reportDataset: Record<ReportType, AnalyticsEnvelope["dataset"]> = {
  TicketReport: "Tickets", SlaReport: "SLAs", AssetReport: "Assets", DiagnosticReport: "Diagnostics",
  KnowledgeReport: "Knowledge", SecurityCaseReport: "SecurityCases", AuditSummary: "Calendar",
};

export const allowedReportTypes: Record<AccountRole, readonly ReportType[]> = {
  Viewer: ["TicketReport", "SlaReport", "AssetReport", "KnowledgeReport"],
  Technician: ["TicketReport", "SlaReport", "AssetReport", "DiagnosticReport", "KnowledgeReport", "SecurityCaseReport"],
  Admin: ["TicketReport", "SlaReport", "AssetReport", "DiagnosticReport", "KnowledgeReport", "SecurityCaseReport", "AuditSummary"],
};

export function protectCsvFormula(value: unknown): string {
  if (value === null || value === undefined) return "";
  const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
  return CSV_DANGEROUS.test(rendered.trimStart()) ? `'${rendered}` : rendered;
}

export function recordsToCsv(records: Array<Record<string, unknown>>): string {
  if (!records.length) return "";
  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const cell = (value: unknown) => `"${protectCsvFormula(value).replaceAll('"', '""')}"`;
  return `${columns.map(cell).join(",")}\r\n${records.map((record) => columns.map((column) => cell(record[column])).join(",")).join("\r\n")}\r\n`;
}

export function safeExportPath(root: string, fileName: string): string {
  if (!/^[0-9a-f-]{36}\.(csv|json)$/u.test(fileName)) throw new Error("INVALID_EXPORT_PATH");
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, fileName);
  if (path.dirname(resolved) !== resolvedRoot) throw new Error("INVALID_EXPORT_PATH");
  return resolved;
}

const pseudonym = (value: string | null | undefined) => value ? createHash("sha256").update(value).digest("hex").slice(0, 16) : null;
const inRange = (interval: DateInterval) => ({ gte: interval.from, lt: interval.toExclusive });

export async function generateReportRecords(db: DatabaseClient, reportType: ReportType, role: AccountRole, accountId: string, interval: DateInterval): Promise<Array<Record<string, unknown>>> {
  const technicianScope = role === "Technician" ? accountId : undefined;
  switch (reportType) {
    case "TicketReport": {
      const rows = await db.ticket.findMany({ where: { createdAt: inRange(interval), assigneeAccountId: technicianScope }, include: { category: true, department: true } });
      return rows.map((row) => ({ ticketCode: row.ticketNumber, priority: row.priority, status: row.status, categoryCode: row.category.code, departmentCode: row.department?.code ?? null, assigneeRef: pseudonym(row.assigneeAccountId), assetRef: pseudonym(row.assetId), createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null, closedAt: row.closedAt?.toISOString() ?? null }));
    }
    case "SlaReport": {
      const rows = await db.ticketSla.findMany({ where: { ticket: { createdAt: inRange(interval), assigneeAccountId: technicianScope } }, include: { ticket: { select: { ticketNumber: true, priority: true, status: true, createdAt: true, resolvedAt: true } }, slaPolicy: true } });
      return rows.map((row) => ({ ticketCode: row.ticket.ticketNumber, priority: row.ticket.priority, ticketStatus: row.ticket.status, policy: row.slaPolicy.name, policyVersion: row.slaPolicy.version, responseTargetMinutes: row.slaPolicy.responseTargetMinutes, resolutionTargetMinutes: row.slaPolicy.resolutionTargetMinutes, pausedSeconds: row.totalPausedSeconds, firstResponseMinutes: row.firstResponseAt ? Math.round((row.firstResponseAt.getTime() - row.ticket.createdAt.getTime()) / 60_000) : null, resolutionMinutes: row.ticket.resolvedAt ? Math.round((row.ticket.resolvedAt.getTime() - row.ticket.createdAt.getTime() - row.totalPausedSeconds * 1_000) / 60_000) : null, responseBreached: Boolean(row.responseBreachedAt), resolutionBreached: Boolean(row.resolutionBreachedAt), responseDueAt: row.responseDueAt.toISOString(), resolutionDueAt: row.resolutionDueAt.toISOString() }));
    }
    case "AssetReport": {
      const rows = await db.asset.findMany({ where: { archivedAt: null }, include: { department: true } });
      return rows.map((row) => ({ assetCode: row.assetCode, assetType: row.assetType, status: row.status, departmentCode: row.department.code, assigned: Boolean(row.ownerId), operatingSystem: row.operatingSystem, lastSeenAt: row.lastSeenAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() }));
    }
    case "DiagnosticReport": {
      const rows = await db.diagnosticJob.findMany({ where: { requestedAt: inRange(interval), requestedBy: technicianScope }, include: { result: { select: { findings: true, redactionCount: true } } } });
      return rows.map((row) => ({ diagnosticRef: pseudonym(row.id), assetRef: pseudonym(row.assetId), actionId: row.actionId, status: row.status, sourceMode: row.sourceMode, requestedAt: row.requestedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null, durationMs: row.durationMs, findingCount: Array.isArray(row.result?.findings) ? row.result.findings.length : 0, redactionCount: row.result?.redactionCount ?? 0, errorCode: row.errorCode }));
    }
    case "KnowledgeReport": {
      const rows = await db.knowledgeArticle.findMany({ include: { category: true, _count: { select: { ticketLinks: true } } } });
      return rows.map((row) => ({ articleCode: row.articleCode, status: row.status, categoryCode: row.category.code, linkedTicketCount: row._count.ticketLinks, version: row.version, publishedAt: row.publishedAt?.toISOString() ?? null, archivedAt: row.archivedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString() }));
    }
    case "SecurityCaseReport": {
      const rows = await db.securityCase.findMany({ where: { createdAt: inRange(interval), assignedAnalystId: technicianScope }, include: { _count: { select: { evidence: true, timeline: true } } } });
      return rows.map((row) => ({ securityCaseCode: row.securityCaseCode, severity: row.severity, status: row.status, assignedAnalystRef: pseudonym(row.assignedAnalystId), assetRef: pseudonym(row.assetId), evidenceCount: row._count.evidence, timelineEntryCount: row._count.timeline, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null, closedAt: row.closedAt?.toISOString() ?? null }));
    }
    case "AuditSummary": {
      if (role !== "Admin") return [];
      const rows = await db.auditEvent.findMany({ where: { occurredAt: inRange(interval) }, orderBy: { occurredAt: "asc" } });
      return rows.map((row) => ({ occurredAt: row.occurredAt.toISOString(), actorType: row.actorType, actorRole: row.actorRoleSnapshot, action: row.action, resourceType: row.resourceType, outcome: row.outcome, reasonCode: row.reason ? "recorded" : null }));
    }
  }
}

export async function processExportJob(db: DatabaseClient, audit: AppendOnlyAuditRepository, exportRoot: string, jobId: string): Promise<void> {
  const job = await db.exportJob.findUnique({ where: { id: jobId }, include: { account: true } });
  if (!job || job.status !== "Queued") return;
  await db.exportJob.update({ where: { id: job.id }, data: { status: "Running", startedAt: new Date() } });
  try {
    const input = job.filters as DateRangeInput;
    const interval = resolveDateRange(input);
    const rows = await generateReportRecords(db, job.reportType, job.account.role, job.requestedBy, interval);
    const fileName = `${job.id}.${job.format.toLowerCase()}`;
    await mkdir(exportRoot, { recursive: true });
    const destination = safeExportPath(exportRoot, fileName);
    const temporary = `${destination}.tmp`;
    const content = job.format === "CSV" ? recordsToCsv(rows) : JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), source: "edy-helpdesk", dataset: reportDataset[job.reportType], records: rows }, null, 2);
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await rename(temporary, destination);
    const file = await stat(destination);
    await db.$transaction([
      db.exportJob.update({ where: { id: job.id }, data: { status: "Succeeded", completedAt: new Date(), fileName, fileSize: file.size, rowCount: rows.length } }),
      db.auditEvent.create({ data: { actorId: job.requestedBy, actorType: "account", actorRoleSnapshot: job.account.role, action: "report.succeeded", resourceType: "exportJob", resourceId: job.id, outcome: "success", changedFields: { reportType: job.reportType, format: job.format, filters: job.filters, rowCount: rows.length } as Prisma.InputJsonValue } }),
    ]);
  } catch {
    await db.$transaction([
      db.exportJob.update({ where: { id: job.id }, data: { status: "Failed", completedAt: new Date(), errorCode: "EXPORT_GENERATION_FAILED" } }),
      db.auditEvent.create({ data: { actorId: job.requestedBy, actorType: "account", actorRoleSnapshot: job.account.role, action: "report.failed", resourceType: "exportJob", resourceId: job.id, outcome: "failure", changedFields: { reportType: job.reportType, format: job.format, filters: job.filters } as Prisma.InputJsonValue } }),
    ]);
  }
  void audit;
}
