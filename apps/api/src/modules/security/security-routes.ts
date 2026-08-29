import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import type { AppConfig } from "@edy/config";
import {
  securityAssignmentRequestSchema,
  securityCaseQuerySchema,
  securityEvidenceRequestSchema,
  securityEscalationRequestSchema,
  securityFalsePositiveRequestSchema,
  securityResolutionRequestSchema,
  securitySeverityRequestSchema,
  securityTransitionRequestSchema,
  siemEnvelopeSchema,
} from "@edy/contracts";
import {
  assertSecurityCaseTransition,
  getAllowedSecurityCaseTransitions,
  InvalidSecurityCaseTransitionError,
  TicketInvariantError,
  type SecurityCaseStatus,
} from "@edy/domain";
import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../../platform/prisma.js";
import { HttpError } from "../../platform/errors.js";
import type { AppendOnlyAuditRepository } from "../audit/audit-repository.js";
import { authorize } from "../auth/rbac.js";
import { auditRecord, nextCode, paged, parse, publicAccount, uuid } from "../inventory-knowledge/shared.js";

const accountView = publicAccount;
const securityInclude = {
  ticket: { include: { category: true } },
  asset: true,
  assignedAnalyst: accountView,
  createdBy: accountView,
} as const;
const securityDetailInclude = {
  ...securityInclude,
  evidence: { include: { createdBy: accountView }, orderBy: { createdAt: "asc" as const } },
  timeline: { include: { actor: accountView }, orderBy: { timestamp: "asc" as const } },
} as const;

const secretKey = /authorization|cookie|credential|password|secret|token|stdout|rawoutput/iu;
const secretText = /(bearer\s+[a-z0-9._~+/=-]+)|((?:password|token|secret|cookie|authorization)\s*[:=]\s*[^\s,;]+)/giu;
const jwtText = /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}(?:\.[a-zA-Z0-9_-]{8,})?\b/gu;

const pseudonymousAssetReference = (assetId: string): string =>
  `asset_${createHash("sha256").update(`edy-helpdesk:v1:asset:${assetId}`).digest("hex").slice(0, 16)}`;

export function redactSecurityText(value: string): string {
  return value.replace(secretText, "[REDACTED]").replace(jwtText, "[REDACTED]").slice(0, 5_000);
}

export function sanitizeSecurityValue(value: unknown, depth = 0): Prisma.InputJsonValue {
  if (depth > 8) return "[TRUNCATED]";
  if (value === null) return "[NULL]";
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return redactSecurityText(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => sanitizeSecurityValue(entry, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !secretKey.test(key))
      .slice(0, 100)
      .map(([key, entry]) => [key, sanitizeSecurityValue(entry, depth + 1)]));
  }
  return String(value).slice(0, 500);
}

function caseView<T extends { status: string }>(item: T) {
  return { ...item, caseCode: "securityCaseCode" in item ? item.securityCaseCode : undefined, allowedTransitions: getAllowedSecurityCaseTransitions(item.status as SecurityCaseStatus) };
}

function conflict(): never {
  throw new HttpError(409, "Conflict", "This security case was updated by another analyst.");
}

function transition(from: SecurityCaseStatus, to: SecurityCaseStatus, reason?: string) {
  try { assertSecurityCaseTransition(from, to, reason); }
  catch (error) {
    if (error instanceof InvalidSecurityCaseTransitionError || error instanceof TicketInvariantError) throw new HttpError(409, "Conflict", error.message);
    throw error;
  }
}

async function appendOutbox(
  tx: Prisma.TransactionClient,
  req: Express.Request,
  securityCaseId: string,
  eventType: "security.case.created" | "security.case.updated" | "security.case.evidence_added" | "security.case.resolved",
  idempotencyKey: string,
) {
  const item = await tx.securityCase.findUniqueOrThrow({ where: { id: securityCaseId }, include: securityDetailInclude });
  const eventId = randomUUID();
  const occurredAt = new Date();
  const envelope = siemEnvelopeSchema.parse({
    eventId,
    eventType,
    schemaVersion: 1,
    occurredAt: occurredAt.toISOString(),
    source: "edy-helpdesk",
    correlationId: req.correlationId,
    idempotencyKey,
    payload: {
      caseCode: item.securityCaseCode,
      sourceTicketCode: item.ticket.ticketNumber,
      severity: item.severity,
      status: item.status,
      summary: redactSecurityText(item.summary),
      asset: item.asset ? { reference: pseudonymousAssetReference(item.asset.id) } : null,
      evidenceSummaries: item.evidence.slice(0, 100).map((entry) => ({ type: entry.type, summary: redactSecurityText(entry.summary) })),
      timelineTimestamps: item.timeline.slice(0, 500).map((entry) => entry.timestamp.toISOString()),
      correlationId: req.correlationId,
    },
  });
  await tx.integrationOutbox.create({ data: { ...envelope, occurredAt, payload: envelope.payload } });
}

async function updateVersion(tx: Prisma.TransactionClient, id: string, version: number, data: Prisma.SecurityCaseUncheckedUpdateManyInput) {
  const updated = await tx.securityCase.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
  if (!updated.count) conflict();
}

export function createSecurityRouter(db: DatabaseClient, audit: AppendOnlyAuditRepository, config: AppConfig) {
  const router = Router();
  const synthetic = config.PORTFOLIO_DEMO;

  router.get("/security/dashboard", authorize("security.read", audit), async (_req, res) => {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const openStatuses = ["New", "Triaged", "Investigating", "Contained"] as const;
    const [openSecurityCases, highCriticalCases, unassignedCases, resolvedToday, bySeverity, byStatus, recentCases] = await Promise.all([
      db.securityCase.count({ where: { status: { in: [...openStatuses] } } }),
      db.securityCase.count({ where: { status: { in: [...openStatuses] }, severity: { in: ["High", "Critical"] } } }),
      db.securityCase.count({ where: { status: { in: [...openStatuses] }, assignedAnalystId: null } }),
      db.securityCase.count({ where: { resolvedAt: { gte: today } } }),
      db.securityCase.groupBy({ by: ["severity"], _count: { _all: true } }),
      db.securityCase.groupBy({ by: ["status"], _count: { _all: true } }),
      db.securityCase.findMany({ include: securityInclude, orderBy: { updatedAt: "desc" }, take: 5 }),
    ]);
    res.json({ synthetic, openSecurityCases, highCriticalCases, unassignedCases, resolvedToday, casesBySeverity: Object.fromEntries(bySeverity.map((x) => [x.severity, x._count._all])), casesByStatus: Object.fromEntries(byStatus.map((x) => [x.status, x._count._all])), recentCases: recentCases.map(caseView) });
  });

  router.get("/security/analysts", authorize("security.read", audit), async (_req, res) => {
    const data = await db.account.findMany({ where: { archivedAt: null, role: { in: ["Admin", "Technician"] }, OR: [{ userId: null }, { user: { archivedAt: null } }] }, ...accountView, orderBy: { username: "asc" } });
    res.json({ data });
  });

  router.get("/security/cases", authorize("security.read", audit), async (req, res) => {
    const query = parse(securityCaseQuerySchema, req.query);
    const where: Prisma.SecurityCaseWhereInput = {
      status: query.status,
      severity: query.severity,
      assignedAnalystId: query.assignedAnalystId,
      assetId: query.assetId,
      createdAt: query.createdFrom || query.createdTo ? { gte: query.createdFrom ? new Date(query.createdFrom) : undefined, lte: query.createdTo ? new Date(query.createdTo) : undefined } : undefined,
      ticket: query.sourceCategory ? { category: { OR: [{ code: { contains: query.sourceCategory } }, { name: { contains: query.sourceCategory } }] } } : undefined,
      OR: query.search ? [
        { securityCaseCode: { contains: query.search } }, { title: { contains: query.search } }, { summary: { contains: query.search } },
        { ticket: { ticketNumber: { contains: query.search } } }, { asset: { is: { OR: [{ assetCode: { contains: query.search } }, { name: { contains: query.search } }, { hostname: { contains: query.search } }] } } },
      ] : undefined,
    };
    const total = await db.securityCase.count({ where });
    let data;
    if (query.sort === "severity") {
      const all = await db.securityCase.findMany({ where, include: securityInclude });
      const rank = { Critical: 4, High: 3, Medium: 2, Low: 1 } as const;
      all.sort((a, b) => rank[b.severity] - rank[a.severity] || b.updatedAt.getTime() - a.updatedAt.getTime());
      data = all.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    } else {
      const orderBy = query.sort === "oldest" ? { createdAt: "asc" as const } : query.sort === "recentlyUpdated" ? { updatedAt: "desc" as const } : { createdAt: "desc" as const };
      data = await db.securityCase.findMany({ where, include: securityInclude, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize });
    }
    res.json({ ...paged(data.map(caseView), query.page, query.pageSize, total), synthetic });
  });

  router.get("/security/cases/:id", authorize("security.read", audit), async (req, res) => {
    const id = parse(uuid, req.params.id);
    const item = await db.securityCase.findUnique({ where: { id }, include: securityDetailInclude });
    if (!item) throw new HttpError(404, "Not Found", "Security case not found.");
    res.json({ ...caseView(item), synthetic });
  });

  router.get("/tickets/:id/security-case", authorize("security.read", audit), async (req, res) => {
    const ticketId = parse(uuid, req.params.id);
    if (!(await db.ticket.findUnique({ where: { id: ticketId }, select: { id: true } }))) throw new HttpError(404, "Not Found", "Ticket not found.");
    const item = await db.securityCase.findUnique({ where: { ticketId }, include: securityInclude });
    res.json(item ? caseView(item) : null);
  });

  router.get("/assets/:id/security-cases", authorize("security.read", audit), async (req, res) => {
    const assetId = parse(uuid, req.params.id);
    if (!(await db.asset.findUnique({ where: { id: assetId }, select: { id: true } }))) throw new HttpError(404, "Not Found", "Asset not found.");
    const data = await db.securityCase.findMany({ where: { assetId }, include: securityInclude, orderBy: { updatedAt: "desc" } });
    res.json({ data: data.map(caseView), openCount: data.filter((x) => !["Resolved", "Closed", "FalsePositive"].includes(x.status)).length, synthetic });
  });

  router.post("/tickets/:id/security-escalations", authorize("security.manage", audit), async (req, res) => {
    const ticketId = parse(uuid, req.params.id);
    const dto = parse(securityEscalationRequestSchema, req.body);
    const requestedKey = req.get("x-idempotency-key");
    if (!requestedKey || !uuid.safeParse(requestedKey).success) throw new HttpError(400, "Bad Request", "A UUID idempotency key is required.");
    const existing = await db.securityCase.findUnique({ where: { ticketId }, include: securityDetailInclude });
    if (existing) return res.status(200).json({ ...caseView(existing), synthetic, idempotentReplay: true });
    const ticket = await db.ticket.findUnique({ where: { id: ticketId }, include: { category: true } });
    if (!ticket) throw new HttpError(404, "Not Found", "Ticket not found.");
    if (req.auth!.role === "Technician" && ticket.assigneeAccountId !== req.auth!.accountId) throw new HttpError(403, "Forbidden", "Technicians may escalate only tickets assigned to them.");
    try {
      const created = await db.$transaction(async (tx) => {
        const securityCaseCode = await nextCode(tx, "security", "SEC");
        const item = await tx.securityCase.create({ data: { securityCaseCode, ticketId, title: ticket.title, summary: redactSecurityText(dto.summary), severity: dto.severity, status: "New", reason: redactSecurityText(dto.reason), assetId: ticket.assetId, createdById: req.auth!.accountId } });
        await tx.securityEvidence.create({ data: { securityCaseId: item.id, type: "TicketContext", title: `Source ticket ${ticket.ticketNumber}`, summary: redactSecurityText(`${ticket.title}: ${ticket.description}`), source: "EDY HelpDesk", sourceReference: ticket.id, createdById: req.auth!.accountId, snapshot: { ticketCode: ticket.ticketNumber, category: ticket.category.name, priority: ticket.priority, status: ticket.status } } });
        for (const jobId of dto.importantDiagnosticFindings ?? []) {
          const job = await tx.diagnosticJob.findUnique({ where: { id: jobId }, include: { result: true } });
          if (!job?.result || job.assetId !== ticket.assetId) throw new HttpError(400, "Bad Request", "Diagnostic evidence must belong to the ticket asset and have a stored result.");
          await tx.securityEvidence.create({ data: { securityCaseId: item.id, type: "DiagnosticFinding", title: `Diagnostic finding: ${job.actionId}`, summary: `Structured findings from ${job.actionId}; requires analyst review.`, source: "EDY Diagnostics", sourceReference: job.id, createdById: req.auth!.accountId, snapshot: sanitizeSecurityValue({ actionId: job.actionId, resultSummary: `Structured diagnostic result for ${job.actionId}`, structuredFindings: job.result.findings, severity: "Informational", collectedAt: job.result.collectedAt.toISOString(), diagnosticJobId: job.id }) } });
        }
        await tx.securityTimelineEntry.create({ data: { securityCaseId: item.id, actorAccountId: req.auth!.accountId, action: "case.created", summary: `Escalated from ${ticket.ticketNumber}.`, metadata: { ticketId, severity: dto.severity } } });
        await tx.auditEvent.create({ data: auditRecord(req, "security.escalated", "ticket", ticketId, { securityCaseId: item.id, securityCaseCode, severity: dto.severity }) });
        await tx.auditEvent.create({ data: auditRecord(req, "security.case_created", "security_case", item.id, { ticketId, securityCaseCode }) });
        await appendOutbox(tx, req, item.id, "security.case.created", `security.case.created:${requestedKey}`);
        return tx.securityCase.findUniqueOrThrow({ where: { id: item.id }, include: securityDetailInclude });
      });
      res.status(201).json({ ...caseView(created), synthetic, idempotentReplay: false });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
        const replay = await db.securityCase.findUnique({ where: { ticketId }, include: securityDetailInclude });
        if (replay) return res.status(200).json({ ...caseView(replay), synthetic, idempotentReplay: true });
        throw new HttpError(409, "Conflict", "The idempotency key has already been used for another security escalation.");
      }
      throw error;
    }
  });

  router.post("/security/cases/:id/assignments", authorize("security.manage", audit), async (req, res) => {
    const id = parse(uuid, req.params.id); const dto = parse(securityAssignmentRequestSchema, req.body);
    const current = await db.securityCase.findUnique({ where: { id } }); if (!current) throw new HttpError(404, "Not Found", "Security case not found.");
    if (current.status === "Closed") throw new HttpError(409, "Conflict", "Closed security cases must be reopened before assignment changes.");
    if (dto.assignedAnalystId) {
      const analyst = await db.account.findFirst({ where: { id: dto.assignedAnalystId, archivedAt: null, role: { in: ["Admin", "Technician"] }, OR: [{ userId: null }, { user: { archivedAt: null } }] } });
      if (!analyst) throw new HttpError(400, "Bad Request", "Assigned analyst must be an active Admin or Technician.");
    }
    const result = await db.$transaction(async (tx) => {
      await updateVersion(tx, id, dto.version, { assignedAnalystId: dto.assignedAnalystId });
      const action = current.assignedAnalystId ? "analyst.reassigned" : dto.assignedAnalystId ? "analyst.assigned" : "analyst.unassigned";
      await tx.securityTimelineEntry.create({ data: { securityCaseId: id, actorAccountId: req.auth!.accountId, action, summary: dto.assignedAnalystId ? "Security analyst assignment updated." : "Security case returned to the unassigned queue.", metadata: { previousAnalystId: current.assignedAnalystId, assignedAnalystId: dto.assignedAnalystId } } });
      await tx.auditEvent.create({ data: auditRecord(req, `security.${action.replace(".", "_")}`, "security_case", id, { previousAnalystId: current.assignedAnalystId, assignedAnalystId: dto.assignedAnalystId }) });
      await appendOutbox(tx, req, id, "security.case.updated", `security.case.updated:${id}:v${dto.version + 1}:assignment`);
      return tx.securityCase.findUniqueOrThrow({ where: { id }, include: securityDetailInclude });
    }); res.json(caseView(result));
  });

  router.post("/security/cases/:id/severity", authorize("security.manage", audit), async (req, res) => {
    const id = parse(uuid, req.params.id); const dto = parse(securitySeverityRequestSchema, req.body);
    const current = await db.securityCase.findUnique({ where: { id } }); if (!current) throw new HttpError(404, "Not Found", "Security case not found.");
    if (["Closed", "FalsePositive"].includes(current.status)) throw new HttpError(409, "Conflict", "Terminal security cases must be reopened before changing severity.");
    const result = await db.$transaction(async (tx) => {
      await updateVersion(tx, id, dto.version, { severity: dto.severity });
      await tx.securityTimelineEntry.create({ data: { securityCaseId: id, actorAccountId: req.auth!.accountId, action: "severity.changed", summary: `Severity changed from ${current.severity} to ${dto.severity}.`, metadata: { from: current.severity, to: dto.severity, reason: redactSecurityText(dto.reason) } } });
      await tx.auditEvent.create({ data: auditRecord(req, "security.severity_changed", "security_case", id, { from: current.severity, to: dto.severity }) });
      await appendOutbox(tx, req, id, "security.case.updated", `security.case.updated:${id}:v${dto.version + 1}:severity`);
      return tx.securityCase.findUniqueOrThrow({ where: { id }, include: securityDetailInclude });
    }); res.json(caseView(result));
  });

  router.post("/security/cases/:id/status-transitions", authorize("security.manage", audit), async (req, res) => {
    const id = parse(uuid, req.params.id); const dto = parse(securityTransitionRequestSchema, req.body);
    const current = await db.securityCase.findUnique({ where: { id } }); if (!current) throw new HttpError(404, "Not Found", "Security case not found.");
    if (dto.status === "Resolved") throw new HttpError(400, "Bad Request", "Use the resolution endpoint to resolve a security case.");
    if (dto.status === "FalsePositive") throw new HttpError(400, "Bad Request", "Use the false-positive endpoint for this classification.");
    transition(current.status, dto.status, dto.reason);
    const reopened = ["Resolved", "FalsePositive", "Closed"].includes(current.status) && dto.status === "Investigating";
    const result = await db.$transaction(async (tx) => {
      await updateVersion(tx, id, dto.version, { status: dto.status, closedAt: dto.status === "Closed" ? new Date() : reopened ? null : current.closedAt, resolvedAt: reopened ? null : current.resolvedAt, falsePositiveReason: reopened ? null : current.falsePositiveReason });
      const action = reopened ? "case.reopened" : dto.status === "Closed" ? "case.closed" : "status.changed";
      await tx.securityTimelineEntry.create({ data: { securityCaseId: id, actorAccountId: req.auth!.accountId, action, summary: reopened ? "Security case reopened for investigation." : `Status changed from ${current.status} to ${dto.status}.`, metadata: { from: current.status, to: dto.status, reason: dto.reason ? redactSecurityText(dto.reason) : undefined } } });
      await tx.auditEvent.create({ data: auditRecord(req, `security.${action.replace(".", "_")}`, "security_case", id, { from: current.status, to: dto.status }) });
      await appendOutbox(tx, req, id, "security.case.updated", `security.case.updated:${id}:v${dto.version + 1}:status`);
      return tx.securityCase.findUniqueOrThrow({ where: { id }, include: securityDetailInclude });
    }); res.json(caseView(result));
  });

  router.post("/security/cases/:id/resolution", authorize("security.manage", audit), async (req, res) => {
    const id = parse(uuid, req.params.id); const dto = parse(securityResolutionRequestSchema, req.body);
    const current = await db.securityCase.findUnique({ where: { id } }); if (!current) throw new HttpError(404, "Not Found", "Security case not found.");
    transition(current.status, "Resolved"); const now = new Date();
    const result = await db.$transaction(async (tx) => {
      await updateVersion(tx, id, dto.version, { status: "Resolved", resolutionSummary: redactSecurityText(dto.resolutionSummary), classification: dto.classification ? redactSecurityText(dto.classification) : undefined, lessonsLearned: dto.lessonsLearned ? redactSecurityText(dto.lessonsLearned) : undefined, resolvedAt: now, closedAt: null });
      await tx.securityTimelineEntry.create({ data: { securityCaseId: id, actorAccountId: req.auth!.accountId, action: "case.resolved", summary: "Security case resolved by analyst.", metadata: { classification: dto.classification ? redactSecurityText(dto.classification) : undefined } } });
      await tx.auditEvent.create({ data: auditRecord(req, "security.case_resolved", "security_case", id, { from: current.status, to: "Resolved", classification: dto.classification }) });
      await appendOutbox(tx, req, id, "security.case.resolved", `security.case.resolved:${id}:v${dto.version + 1}`);
      return tx.securityCase.findUniqueOrThrow({ where: { id }, include: securityDetailInclude });
    }); res.json(caseView(result));
  });

  router.post("/security/cases/:id/false-positive", authorize("security.manage", audit), async (req, res) => {
    const id = parse(uuid, req.params.id); const dto = parse(securityFalsePositiveRequestSchema, req.body);
    const current = await db.securityCase.findUnique({ where: { id } }); if (!current) throw new HttpError(404, "Not Found", "Security case not found.");
    transition(current.status, "FalsePositive");
    const result = await db.$transaction(async (tx) => {
      await updateVersion(tx, id, dto.version, { status: "FalsePositive", falsePositiveReason: redactSecurityText(dto.reason), resolvedAt: new Date(), closedAt: null });
      await tx.securityTimelineEntry.create({ data: { securityCaseId: id, actorAccountId: req.auth!.accountId, action: "case.false_positive", summary: "Classified as a false positive.", metadata: { reason: redactSecurityText(dto.reason) } } });
      await tx.auditEvent.create({ data: auditRecord(req, "security.false_positive", "security_case", id, { from: current.status, to: "FalsePositive" }) });
      await appendOutbox(tx, req, id, "security.case.updated", `security.case.updated:${id}:v${dto.version + 1}:false-positive`);
      return tx.securityCase.findUniqueOrThrow({ where: { id }, include: securityDetailInclude });
    }); res.json(caseView(result));
  });

  router.post("/security/cases/:id/evidence", authorize("security.manage", audit), async (req, res) => {
    const id = parse(uuid, req.params.id); const dto = parse(securityEvidenceRequestSchema, req.body);
    const current = await db.securityCase.findUnique({ where: { id }, include: { ticket: true } }); if (!current) throw new HttpError(404, "Not Found", "Security case not found.");
    if (current.status === "Closed") throw new HttpError(409, "Conflict", "Closed security cases must be reopened before evidence can be added.");
    let evidenceData: Omit<Prisma.SecurityEvidenceUncheckedCreateInput, "securityCaseId" | "createdById">;
    if (dto.type === "ManualNote") evidenceData = { type: dto.type, title: redactSecurityText(dto.title), summary: redactSecurityText(dto.summary), source: redactSecurityText(dto.source), sourceReference: null };
    else if (dto.type === "DiagnosticFinding") {
      const job = await db.diagnosticJob.findUnique({ where: { id: dto.diagnosticJobId }, include: { result: true } });
      if (!job?.result || job.assetId !== current.assetId) throw new HttpError(400, "Bad Request", "Diagnostic evidence must be an existing result for the linked asset.");
      evidenceData = { type: dto.type, title: dto.title ? redactSecurityText(dto.title) : `Diagnostic finding: ${job.actionId}`, summary: `Structured findings from ${job.actionId}; potentially relevant and requires analyst review.`, source: "EDY Diagnostics", sourceReference: job.id, snapshot: sanitizeSecurityValue({ actionId: job.actionId, resultSummary: `Structured diagnostic result for ${job.actionId}`, structuredFindings: job.result.findings, severity: "Informational", collectedAt: job.result.collectedAt.toISOString(), diagnosticJobId: job.id }) };
    } else {
      const event = await db.windowsEvent.findUnique({ where: { id: dto.windowsEventId }, include: { result: { include: { job: true } } } });
      const parameters = event?.result.job.parameters as Record<string, unknown> | undefined;
      if (!event || event.result.job.assetId !== current.assetId || event.result.job.actionId !== "eventlog.query" || !["System", "Application"].includes(String(parameters?.logName))) throw new HttpError(400, "Bad Request", "Event evidence must be an existing System or Application event for the linked asset.");
      evidenceData = { type: dto.type, title: dto.title ? redactSecurityText(dto.title) : `Event ${event.eventId} · ${event.provider}`, summary: redactSecurityText(event.message), source: `${String(parameters?.logName)} Event Log`, sourceReference: event.id, snapshot: sanitizeSecurityValue({ timestamp: event.timestamp.toISOString(), eventId: event.eventId, level: event.level, provider: event.provider, message: event.message }) };
    }
    const result = await db.$transaction(async (tx) => {
      await updateVersion(tx, id, dto.version, {});
      const evidence = await tx.securityEvidence.create({ data: { ...evidenceData, securityCaseId: id, createdById: req.auth!.accountId } });
      await tx.securityTimelineEntry.create({ data: { securityCaseId: id, actorAccountId: req.auth!.accountId, action: "evidence.added", summary: `${evidence.type} evidence added: ${evidence.title}.`, metadata: { evidenceId: evidence.evidenceId, type: evidence.type, sourceReference: evidence.sourceReference } } });
      await tx.auditEvent.create({ data: auditRecord(req, evidence.sourceReference ? "security.evidence_linked" : "security.evidence_added", "security_case", id, { evidenceId: evidence.evidenceId, type: evidence.type }) });
      await appendOutbox(tx, req, id, "security.case.evidence_added", `security.case.evidence_added:${evidence.evidenceId}`);
      return tx.securityCase.findUniqueOrThrow({ where: { id }, include: securityDetailInclude });
    }); res.status(201).json(caseView(result));
  });

  return router;
}
