import path from "node:path";
import { existsSync } from "node:fs";
import { Router } from "express";
import { createReportJobSchema, dateRangeQuerySchema } from "@edy/contracts";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../../platform/prisma.js";
import { HttpError } from "../../platform/errors.js";
import type { AppendOnlyAuditRepository } from "../audit/audit-repository.js";
import { authorize } from "../auth/rbac.js";
import { DateRangeError, resolveDateRange } from "./date-range.js";
import { buildAnalytics } from "./metrics.js";
import { allowedReportTypes, EXPORT_RETENTION_DAYS, processExportJob, safeExportPath } from "./reports.js";

const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
const idSchema = z.string().uuid();
const exportRate = new Map<string, number[]>();
export function resetExportRateLimitsForTests(): void { exportRate.clear(); }
type SafeSchema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ message?: string }> } } };
function parse<T>(schema: SafeSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, "Bad Request", result.error.issues[0]?.message ?? "Invalid request.");
  return result.data;
}
function interval(query: unknown) {
  const value = parse(dateRangeQuerySchema, query);
  try { return resolveDateRange(value); } catch (error) { if (error instanceof DateRangeError) throw new HttpError(400, "Bad Request", error.message); throw error; }
}
function rateLimit(accountId: string): void {
  const now = Date.now(); const current = (exportRate.get(accountId) ?? []).filter((timestamp) => timestamp > now - 60_000);
  if (current.length >= 5) throw new HttpError(429, "Too Many Requests", "Report creation is limited to five requests per minute.");
  current.push(now); exportRate.set(accountId, current);
}

export function createAnalyticsRouter(db: DatabaseClient, audit: AppendOnlyAuditRepository): Router {
  const router = Router();
  let projectRoot=path.resolve(process.cwd());
  while(!existsSync(path.join(projectRoot,"prisma","schema.prisma"))){const parent=path.dirname(projectRoot);if(parent===projectRoot)throw new Error("EDY HelpDesk project root could not be resolved");projectRoot=parent;}
  const exportRoot = path.join(projectRoot, "storage", "exports");

  router.get("/dashboard", authorize("dashboard.read", audit), async (req, res) => res.json(await buildAnalytics(db, req.auth!.accountId, interval(req.query))));
  for (const section of ["overview", "support", "sla", "tickets", "technicians", "assets", "diagnostics", "knowledge", "security", "operations"] as const) {
    router.get(`/dashboard/${section}`, authorize("dashboard.read", audit), async (req, res) => {
      const data = await buildAnalytics(db, req.auth!.accountId, interval(req.query));
      res.json({ range: data.range, generatedAt: data.generatedAt, mode: data.mode, data: data[section] });
    });
  }

  router.post("/reports", authorize("reports.create", audit), async (req, res) => {
    rateLimit(req.auth!.accountId);
    const dto = parse(createReportJobSchema, req.body);
    if (!allowedReportTypes[req.auth!.role].includes(dto.reportType)) {
      await audit.append({ actorId: req.auth!.accountId, actorType: "account", actorRoleSnapshot: req.auth!.role, action: "report.denied", resourceType: "report", outcome: "denied", reason: `Report type not allowed: ${dto.reportType}`, requestId: req.requestId, correlationId: req.correlationId });
      throw new HttpError(403, "Forbidden", "This report type is outside your authorized scope.");
    }
    try { resolveDateRange(dto.filters); } catch (error) { if (error instanceof DateRangeError) throw new HttpError(400, "Bad Request", error.message); throw error; }
    const expiresAt = new Date(Date.now() + EXPORT_RETENTION_DAYS * 86_400_000);
    const job = await db.$transaction(async (tx) => {
      const created = await tx.exportJob.create({ data: { requestedBy: req.auth!.accountId, reportType: dto.reportType, format: dto.format, filters: dto.filters as Prisma.InputJsonValue, expiresAt } });
      await tx.auditEvent.create({ data: { actorId: req.auth!.accountId, actorType: "account", actorRoleSnapshot: req.auth!.role, action: "report.requested", resourceType: "exportJob", resourceId: created.id, outcome: "success", requestId: req.requestId, correlationId: req.correlationId, changedFields: { reportType: dto.reportType, format: dto.format, filters: dto.filters } as Prisma.InputJsonValue } });
      return created;
    });
    setImmediate(() => void processExportJob(db, audit, exportRoot, job.id));
    res.status(202).json(job);
  });

  router.get("/reports", authorize("reports.read", audit), async (req, res) => {
    const page = parse(pageSchema, req.query); const now = new Date();
    await db.exportJob.updateMany({ where: { status: "Succeeded", expiresAt: { lte: now } }, data: { status: "Expired" } });
    const where = req.auth!.role === "Admin" ? {} : { requestedBy: req.auth!.accountId };
    const [data, total] = await Promise.all([
      db.exportJob.findMany({ where, include: { account: { select: { username: true, user: { select: { displayName: true } } } } }, orderBy: { requestedAt: "desc" }, skip: (page.page - 1) * page.pageSize, take: page.pageSize }),
      db.exportJob.count({ where }),
    ]);
    res.json({ data: data.map((job) => ({ ...job, requestedByName: job.account.user?.displayName ?? job.account.username, downloadable: job.status === "Succeeded" && job.expiresAt > now })), pagination: { ...page, total, totalPages: Math.ceil(total / page.pageSize) } });
  });

  router.get("/reports/:id/download", authorize("reports.read", audit), async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const job = await db.exportJob.findUnique({ where: { id } });
    if (!job || (req.auth!.role !== "Admin" && job.requestedBy !== req.auth!.accountId)) throw new HttpError(404, "Not Found", "Report not found.");
    if (job.expiresAt <= new Date()) { if (job.status === "Succeeded") await db.exportJob.update({ where: { id }, data: { status: "Expired" } }); throw new HttpError(410, "Gone", "This report has expired."); }
    if (job.status !== "Succeeded" || !job.fileName) throw new HttpError(409, "Conflict", "The report is not ready for download.");
    const file = safeExportPath(exportRoot, job.fileName);
    await audit.append({ actorId: req.auth!.accountId, actorType: "account", actorRoleSnapshot: req.auth!.role, action: "report.downloaded", resourceType: "exportJob", resourceId: job.id, outcome: "success", requestId: req.requestId, correlationId: req.correlationId, metadata: { reportType: job.reportType, format: job.format } });
    res.download(file, job.fileName);
  });
  return router;
}
