import { Router } from "express";
import { activeAsset, auditRecord, publicAccount } from "../inventory-knowledge/shared.js";
import { z } from "zod";

import { assertTicketTransition, TicketInvariantError, InvalidTicketTransitionError } from "@edy/domain";
import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../../platform/prisma.js";
import { HttpError } from "../../platform/errors.js";
import type { AppendOnlyAuditRepository } from "../audit/audit-repository.js";
import { authorize } from "../auth/rbac.js";

const idSchema = z.string().uuid();
const paginationSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
const ticketPrioritySchema = z.enum(["Low", "Medium", "High", "Critical"]);
const ticketStatusSchema = z.enum(["New", "Assigned", "InProgress", "WaitingUser", "WaitingThirdParty", "Resolved", "Closed"]);
const ticketInclude = {
  requester: { include: { department: true } }, department: true, category: true,
  assignee: publicAccount, asset: true,
  sla: { include: { slaPolicy: true } },
} satisfies Prisma.TicketInclude;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, "Bad Request", result.error.issues[0]?.message ?? "Invalid request.");
  return result.data;
}

const pageResult = <T>(data: T[], page: number, pageSize: number, total: number) => ({
  data,
  pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
});

function slaView(ticket: { createdAt: Date; status: string; sla: ({ responseDueAt: Date; resolutionDueAt: Date; firstResponseAt: Date | null; resolutionStoppedAt: Date | null; pausedAt: Date | null; totalPausedSeconds: number; responseBreachedAt: Date | null; resolutionBreachedAt: Date | null; slaPolicy: { atRiskThresholdMinutes: number } }) | null }, now = new Date()) {
  if (!ticket.sla) return null;
  const clockAt = ticket.sla.pausedAt ?? ticket.sla.resolutionStoppedAt ?? now;
  const elapsedSeconds = Math.max(0, Math.floor((clockAt.getTime() - ticket.createdAt.getTime()) / 1_000) - ticket.sla.totalPausedSeconds);
  const remainingSeconds = Math.floor((ticket.sla.resolutionDueAt.getTime() - clockAt.getTime()) / 1_000);
  const resolutionBreached = Boolean(ticket.sla.resolutionBreachedAt) || (!ticket.sla.pausedAt && !ticket.sla.resolutionStoppedAt && remainingSeconds < 0);
  const responseBreached = Boolean(ticket.sla.responseBreachedAt) || (!ticket.sla.firstResponseAt && now > ticket.sla.responseDueAt);
  return {
    responseDueAt: ticket.sla.responseDueAt,
    resolutionDueAt: ticket.sla.resolutionDueAt,
    elapsedSeconds,
    pausedSeconds: ticket.sla.totalPausedSeconds,
    remainingSeconds,
    paused: Boolean(ticket.sla.pausedAt),
    responseBreached,
    resolutionBreached,
    breached: responseBreached || resolutionBreached,
    atRisk: !resolutionBreached && remainingSeconds >= 0 && remainingSeconds <= ticket.sla.slaPolicy.atRiskThresholdMinutes * 60,
    stopped: Boolean(ticket.sla.resolutionStoppedAt),
  };
}

function ticketView<T extends { createdAt: Date; status: string; sla: Parameters<typeof slaView>[0]["sla"] }>(ticket: T) {
  return { ...ticket, ticketCode: "ticketNumber" in ticket ? ticket.ticketNumber : undefined, slaState: slaView(ticket) };
}

function assertOperationalScope(req: Express.Request, ticket: { assigneeAccountId: string | null }): void {
  if (req.auth!.role === "Admin") return;
  if (req.auth!.role === "Technician" && ticket.assigneeAccountId === req.auth!.accountId) return;
  throw new HttpError(403, "Forbidden", "This ticket is outside your operational scope.");
}

function auditData(req: Express.Request, action: string, resourceType: string, resourceId: string | null, outcome = "success", changedFields?: Prisma.InputJsonValue) {
  return { actorId: req.auth!.accountId, actorType: "account", actorRoleSnapshot: req.auth!.role, action, resourceType, resourceId, outcome, requestId: req.requestId, correlationId: req.correlationId, changedFields };
}

async function optimisticConflict(audit: AppendOnlyAuditRepository, req: Express.Request, ticketId: string): Promise<never> {
  await audit.append(auditData(req, "ticket.optimistic_lock_conflict", "ticket", ticketId, "conflict"));
  throw new HttpError(409, "Conflict", "This ticket was updated by another technician.");
}

export function createServiceDeskRouter(prisma: DatabaseClient, audit: AppendOnlyAuditRepository): Router {
  const router = Router();

  router.get("/overview", authorize("tickets.read", audit), async (req, res) => {
    const openStatuses = ["New", "Assigned", "InProgress", "WaitingUser", "WaitingThirdParty"] as const;
    const [openTickets, myTickets, unassigned, critical, tickets] = await Promise.all([
      prisma.ticket.count({ where: { status: { in: [...openStatuses] } } }),
      prisma.ticket.count({ where: { status: { in: [...openStatuses] }, assigneeAccountId: req.auth!.accountId } }),
      prisma.ticket.count({ where: { status: { in: [...openStatuses] }, assigneeAccountId: null } }),
      prisma.ticket.count({ where: { status: { in: [...openStatuses] }, priority: "Critical" } }),
      prisma.ticket.findMany({ where: { status: { in: [...openStatuses] } }, include: { sla: { include: { slaPolicy: true } } } }),
    ]);
    const slaAtRisk = tickets.filter((ticket) => slaView(ticket)?.atRisk).length;
    res.json({ openTickets, myTickets, unassigned, slaAtRisk, critical });
  });

  router.get("/metadata", authorize("directory.read", audit), async (_req, res) => {
    const [requesters, departments, categories, assets, technicians] = await Promise.all([
      prisma.user.findMany({ where: { archivedAt: null }, select: { id: true, displayName: true, email: true, departmentId: true }, orderBy: { displayName: "asc" } }),
      prisma.department.findMany({ where: { archivedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      prisma.ticketCategory.findMany({ where: { archivedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      prisma.asset.findMany({ where: { archivedAt: null }, select: { id: true, assetCode: true, assetTag: true, name: true, departmentId: true, ownerId: true }, orderBy: { assetTag: "asc" } }),
      prisma.account.findMany({ where: { archivedAt: null, role: "Technician", user: { archivedAt: null } }, select: { id: true, username: true, role: true, user: { select: { id: true, displayName: true, email: true, archivedAt: true } } }, orderBy: { username: "asc" } }),
    ]);
    res.json({ requesters, departments, categories, assets, technicians });
  });

  router.get("/accounts", authorize("directory.read", audit), async (req, res) => {
    const role = z.enum(["Admin", "Technician", "Viewer"]).optional().safeParse(req.query.role);
    if (!role.success) throw new HttpError(400, "Bad Request", "Invalid account role.");
    const data = await prisma.account.findMany({ where: { archivedAt: null, role: role.data }, select: { id: true, username: true, role: true, user: { select: { id: true, displayName: true, email: true, archivedAt: true } } }, orderBy: { username: "asc" } });
    res.json({ data, pagination: { page: 1, pageSize: data.length, total: data.length, totalPages: data.length ? 1 : 0 } });
  });

  const ticketListSchema = paginationSchema.extend({
    search: z.string().trim().max(200).optional(), status: ticketStatusSchema.optional(), priority: ticketPrioritySchema.optional(),
    categoryId: idSchema.optional(), assigneeId: z.union([idSchema, z.literal("unassigned")]).optional(), departmentId: idSchema.optional(),
    slaState: z.enum(["at-risk", "breached", "healthy", "paused"]).optional(), sort: z.enum(["updatedAt", "createdAt", "priority", "ticketNumber"]).default("updatedAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
  });
  router.get("/tickets", authorize("tickets.read", audit), async (req, res) => {
    const query = parse(ticketListSchema, req.query);
    const where: Prisma.TicketWhereInput = {
      status: query.status, priority: query.priority, categoryId: query.categoryId, departmentId: query.departmentId,
      assigneeAccountId: query.assigneeId === "unassigned" ? null : query.assigneeId,
      OR: query.search ? [{ ticketNumber: { contains: query.search } }, { title: { contains: query.search } }, { description: { contains: query.search } }] : undefined,
    };
    const raw = await prisma.ticket.findMany({ where, include: ticketInclude, orderBy: [{ [query.sort]: query.order }, { id: "asc" }] });
    const filtered = query.slaState ? raw.filter((ticket) => {
      const state = slaView(ticket);
      return query.slaState === "at-risk" ? state?.atRisk : query.slaState === "breached" ? state?.breached : query.slaState === "paused" ? state?.paused : state && !state.atRisk && !state.breached && !state.paused;
    }) : raw;
    const start = (query.page - 1) * query.pageSize;
    res.json(pageResult(filtered.slice(start, start + query.pageSize).map(ticketView), query.page, query.pageSize, filtered.length));
  });

  const createTicketSchema = z.object({ title: z.string().trim().min(3).max(200), description: z.string().trim().min(3).max(10_000), requesterId: idSchema, departmentId: idSchema.optional(), categoryId: idSchema, priority: ticketPrioritySchema, assetId: idSchema.nullish() }).strict();
  router.post("/tickets", authorize("tickets.create", audit), async (req, res) => {
    const dto = parse(createTicketSchema, req.body);
    const requester = await prisma.user.findFirst({ where: { id: dto.requesterId, archivedAt: null } });
    const category = await prisma.ticketCategory.findFirst({ where: { id: dto.categoryId, archivedAt: null } });
    if (!requester || !category) throw new HttpError(400, "Bad Request", "Requester or category is unavailable.");
    const policy = await prisma.slaPolicy.findFirst({ where: { priority: dto.priority, retiredAt: null }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] });
    if (!policy) throw new HttpError(409, "Conflict", "No active SLA policy is configured for this priority.");
    const created = await prisma.$transaction(async (tx) => {
      await activeAsset(tx, dto.assetId);
      const year = new Date().getUTCFullYear();
      const counter = await tx.sequenceCounter.upsert({ where: { scope_year: { scope: "ticket", year } }, create: { scope: "ticket", year, value: 1 }, update: { value: { increment: 1 } } });
      const ticketNumber = `HD-${year}-${String(counter.value).padStart(6, "0")}`;
      const now = new Date();
      const ticket = await tx.ticket.create({ data: { ticketNumber, title: dto.title, description: dto.description, requesterId: dto.requesterId, departmentId: dto.departmentId ?? requester.departmentId, categoryId: dto.categoryId, priority: dto.priority, assetId: dto.assetId ?? null, slaPolicyId: policy.id, sla: { create: { slaPolicyId: policy.id, responseDueAt: new Date(now.getTime() + policy.responseTargetMinutes * 60_000), resolutionDueAt: new Date(now.getTime() + policy.resolutionTargetMinutes * 60_000) } }, history: { create: { actorAccountId: req.auth!.accountId, action: "ticket.created", toStatus: "New", previousVersion: 0, newVersion: 1, details: { ticketNumber } } } }, include: ticketInclude });
      await tx.auditEvent.create({ data: auditData(req, "ticket.created", "ticket", ticket.id, "success", { ticketNumber }) });
      if (dto.assetId) await tx.auditEvent.create({ data: auditRecord(req, "asset.ticket_linked", "asset", dto.assetId, { ticketId: ticket.id }) });
      return ticket;
    });
    res.status(201).json(ticketView(created));
  });

  router.get("/tickets/:id", authorize("tickets.read", audit), async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const ticket = await prisma.ticket.findUnique({ where: { id }, include: { ...ticketInclude, comments: { include: { author: publicAccount }, orderBy: { createdAt: "asc" } }, history: { include: { actor: publicAccount }, orderBy: { createdAt: "asc" } } } });
    if (!ticket) throw new HttpError(404, "Not Found", "Ticket not found.");
    const comments = req.auth!.role === "Viewer" ? ticket.comments.filter((comment) => !comment.internal) : ticket.comments;
    const timeline = [...ticket.history.map((item) => ({ kind: "history", ...item })), ...comments.map((item) => ({ kind: item.internal ? "internalNote" : "comment", ...item }))].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    res.json({ ...ticketView(ticket), comments, timeline });
  });

  const updateTicketSchema = z.object({ version: z.number().int().min(1), title: z.string().trim().min(3).max(200).optional(), description: z.string().trim().min(3).max(10_000).optional(), priority: ticketPrioritySchema.optional(), categoryId: idSchema.optional(), assetId: idSchema.nullable().optional() }).strict();
  router.patch("/tickets/:id", authorize("tickets.update", audit), async (req, res) => {
    const id = parse(idSchema, req.params.id); const dto = parse(updateTicketSchema, req.body);
    const current = await prisma.ticket.findUnique({ where: { id }, select: { assigneeAccountId: true, assetId: true, status: true } });
    if (!current) throw new HttpError(404, "Not Found", "Ticket not found.");
    assertOperationalScope(req, current);
    const result = await prisma.$transaction(async (tx) => {
      if (dto.assetId !== undefined) { if (current.status === "Closed") throw new HttpError(409, "Conflict", "Closed ticket asset references cannot be changed."); await activeAsset(tx, dto.assetId); }
      const updated = await tx.ticket.updateMany({ where: { id, version: dto.version }, data: { title: dto.title, description: dto.description, priority: dto.priority, categoryId: dto.categoryId, assetId: dto.assetId, version: { increment: 1 } } });
      if (!updated.count) return null;
      if (dto.assetId !== undefined && dto.assetId !== current.assetId) {
        const details = { previousAssetId: current.assetId, newAssetId: dto.assetId };
        await tx.ticketHistory.create({ data: { ticketId: id, actorAccountId: req.auth!.accountId, action: "ticket.asset_changed", previousVersion: dto.version, newVersion: dto.version + 1, details } });
        await tx.auditEvent.create({ data: auditRecord(req, "ticket.asset_changed", "ticket", id, details) });
        for (const assetId of [current.assetId, dto.assetId].filter((v): v is string => Boolean(v))) await tx.auditEvent.create({ data: auditRecord(req, assetId === dto.assetId ? "asset.ticket_linked" : "asset.ticket_unlinked", "asset", assetId, { ticketId: id }) });
      }
      await tx.ticketHistory.create({ data: { ticketId: id, actorAccountId: req.auth!.accountId, action: "ticket.updated", previousVersion: dto.version, newVersion: dto.version + 1, details: { fields: Object.keys(dto).filter((key) => key !== "version") } } });
      await tx.auditEvent.create({ data: auditData(req, "ticket.updated", "ticket", id, "success", { fields: Object.keys(dto).filter((key) => key !== "version") }) });
      return tx.ticket.findUniqueOrThrow({ where: { id }, include: ticketInclude });
    });
    if (!result) return optimisticConflict(audit, req, id);
    res.json(ticketView(result));
  });

  const assignmentSchema = z.object({ assigneeAccountId: idSchema.nullable(), version: z.number().int().min(1) }).strict();
  router.post("/tickets/:id/assignments", authorize("tickets.assign", audit), async (req, res) => {
    const id = parse(idSchema, req.params.id); const dto = parse(assignmentSchema, req.body);
    const current = await prisma.ticket.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "Not Found", "Ticket not found.");
    if (req.auth!.role === "Technician" && (current.assigneeAccountId || dto.assigneeAccountId !== req.auth!.accountId)) {
      throw new HttpError(403, "Forbidden", "Technicians may only self-assign an unassigned ticket.");
    }
    if (dto.assigneeAccountId) {
      const assignee = await prisma.account.findFirst({ where: { id: dto.assigneeAccountId, archivedAt: null, role: "Technician", user: { archivedAt: null } } });
      if (!assignee) throw new HttpError(400, "Bad Request", "Assignee must be an active technician.");
    } else if (current.status !== "New") {
      throw new HttpError(409, "Conflict", "Only New tickets may remain unassigned.");
    }
    const newStatus = current.status === "New" && dto.assigneeAccountId ? "Assigned" : current.status;
    const action = current.assigneeAccountId ? "ticket.reassigned" : dto.assigneeAccountId ? "ticket.assigned" : "ticket.unassigned";
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.updateMany({ where: { id, version: dto.version }, data: { assigneeAccountId: dto.assigneeAccountId, status: newStatus, version: { increment: 1 } } });
      if (!updated.count) return null;
      const details = { previousAssigneeAccountId: current.assigneeAccountId, newAssigneeAccountId: dto.assigneeAccountId };
      await tx.ticketHistory.create({ data: { ticketId: id, actorAccountId: req.auth!.accountId, action, fromStatus: current.status, toStatus: newStatus, previousVersion: dto.version, newVersion: dto.version + 1, details } });
      await tx.auditEvent.create({ data: auditData(req, action, "ticket", id, "success", details) });
      return tx.ticket.findUniqueOrThrow({ where: { id }, include: ticketInclude });
    });
    if (!result) return optimisticConflict(audit, req, id);
    res.json(ticketView(result));
  });

  const transitionSchema = z.object({ toStatus: ticketStatusSchema, version: z.number().int().min(1), reason: z.string().trim().min(3).max(1_000).optional(), solution: z.string().trim().min(3).max(10_000).optional() }).strict();
  router.post("/tickets/:id/transitions", authorize("tickets.transition", audit), async (req, res) => {
    const id = parse(idSchema, req.params.id); const dto = parse(transitionSchema, req.body);
    const current = await prisma.ticket.findUnique({ where: { id }, include: { sla: { include: { slaPolicy: true } } } });
    if (!current) throw new HttpError(404, "Not Found", "Ticket not found.");
    assertOperationalScope(req, current);
    try {
      assertTicketTransition({ from: current.status, to: dto.toStatus, actorRole: req.auth!.role, assigneeAccountId: current.assigneeAccountId, reason: dto.reason, solution: dto.solution });
    } catch (error) {
      if (error instanceof InvalidTicketTransitionError || error instanceof TicketInvariantError) throw new HttpError(409, "Conflict", error.message);
      throw error;
    }
    const now = new Date();
    const isWaiting = dto.toStatus === "WaitingUser" || (dto.toStatus === "WaitingThirdParty" && current.sla?.slaPolicy.waitingThirdPartyPauses);
    const isResume = (current.status === "WaitingUser" || current.status === "WaitingThirdParty") && dto.toStatus === "InProgress";
    const isReopen = current.status === "Resolved" && dto.toStatus === "InProgress";
    const isResolve = dto.toStatus === "Resolved";
    const isClose = dto.toStatus === "Closed";
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.updateMany({ where: { id, version: dto.version }, data: { status: dto.toStatus, waitingReason: isWaiting ? dto.reason : null, solution: isResolve ? dto.solution : current.solution, resolvedAt: isResolve ? now : isReopen ? null : current.resolvedAt, closedAt: isClose ? now : null, version: { increment: 1 } } });
      if (!updated.count) return null;
      if (current.sla) {
        let resolutionDueAt = current.sla.resolutionDueAt;
        let totalPausedSeconds = current.sla.totalPausedSeconds;
        let pausedAt = current.sla.pausedAt;
        let resolutionStoppedAt = current.sla.resolutionStoppedAt;
        if (isWaiting && !pausedAt && !resolutionStoppedAt) pausedAt = now;
        if (isResume && pausedAt) {
          const seconds = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1_000));
          totalPausedSeconds += seconds; resolutionDueAt = new Date(resolutionDueAt.getTime() + seconds * 1_000); pausedAt = null;
        }
        if (isResolve) resolutionStoppedAt = now;
        if (isReopen && resolutionStoppedAt) {
          const seconds = Math.max(0, Math.floor((now.getTime() - resolutionStoppedAt.getTime()) / 1_000));
          resolutionDueAt = new Date(resolutionDueAt.getTime() + seconds * 1_000); resolutionStoppedAt = null;
        }
        const resolutionBreachedAt = current.sla.resolutionBreachedAt ?? (!pausedAt && !resolutionStoppedAt && now >= resolutionDueAt ? resolutionDueAt : null);
        await tx.ticketSla.update({ where: { ticketId: id }, data: { pausedAt, totalPausedSeconds, resolutionDueAt, resolutionStoppedAt, resolutionBreachedAt } });
      }
      const action = isResolve ? "ticket.resolved" : isReopen ? "ticket.reopened" : "ticket.status_transitioned";
      const details = { reason: dto.reason, solutionProvided: Boolean(dto.solution) };
      await tx.ticketHistory.create({ data: { ticketId: id, actorAccountId: req.auth!.accountId, action, fromStatus: current.status, toStatus: dto.toStatus, previousVersion: dto.version, newVersion: dto.version + 1, details } });
      await tx.auditEvent.create({ data: auditData(req, action, "ticket", id, "success", { fromStatus: current.status, toStatus: dto.toStatus }) });
      return tx.ticket.findUniqueOrThrow({ where: { id }, include: ticketInclude });
    });
    if (!result) return optimisticConflict(audit, req, id);
    res.json(ticketView(result));
  });

  const commentSchema = z.object({ content: z.string().trim().min(1).max(10_000).refine((value) => ![...value].some((character) => { const code = character.charCodeAt(0); return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127; }), "Comment contains unsupported control characters."), type: z.enum(["Public", "Internal"]), version: z.number().int().min(1) }).strict();
  router.post("/tickets/:id/comments", async (req, res, next) => {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return next(new HttpError(400, "Bad Request", parsed.error.issues[0]?.message ?? "Invalid comment."));
    return authorize(parsed.data.type === "Internal" ? "comments.internal" : "comments.public", audit)(req, res, next);
  }, async (req, res) => {
    const id = parse(idSchema, req.params.id); const dto = parse(commentSchema, req.body);
    const current = await prisma.ticket.findUnique({ where: { id }, include: { sla: true } });
    if (!current) throw new HttpError(404, "Not Found", "Ticket not found.");
    assertOperationalScope(req, current);
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.updateMany({ where: { id, version: dto.version }, data: { version: { increment: 1 } } });
      if (!updated.count) return null;
      const comment = await tx.ticketComment.create({ data: { ticketId: id, authorAccountId: req.auth!.accountId, body: dto.content, internal: dto.type === "Internal" }, include: { author: publicAccount } });
      if (dto.type === "Public" && current.sla && !current.sla.firstResponseAt) {
        const now = new Date();
        await tx.ticketSla.update({ where: { ticketId: id }, data: { firstResponseAt: now, responseBreachedAt: now > current.sla.responseDueAt ? now : null } });
      }
      const action = dto.type === "Internal" ? "ticket.internal_note_added" : "ticket.comment_added";
      await tx.ticketHistory.create({ data: { ticketId: id, actorAccountId: req.auth!.accountId, action, previousVersion: dto.version, newVersion: dto.version + 1, details: { commentId: comment.id, type: dto.type } } });
      await tx.auditEvent.create({ data: auditData(req, action, "ticket", id) });
      return comment;
    });
    if (!result) return optimisticConflict(audit, req, id);
    res.status(201).json(result);
  });

  const directoryList = paginationSchema.extend({ search: z.string().trim().max(200).optional(), includeArchived: z.enum(["true", "false"]).default("false") });
  router.get("/users", authorize("directory.read", audit), async (req, res) => {
    const query = parse(directoryList, req.query);
    const where: Prisma.UserWhereInput = { archivedAt: query.includeArchived === "true" ? undefined : null, OR: query.search ? [{ displayName: { contains: query.search } }, { email: { contains: query.search } }] : undefined };
    const [data, total] = await Promise.all([prisma.user.findMany({ where, include: { department: true, accounts: { select: { id: true, username: true, role: true, archivedAt: true } } }, orderBy: { displayName: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.user.count({ where })]);
    res.json(pageResult(data, query.page, query.pageSize, total));
  });
  const userSchema = z.object({ displayName: z.string().trim().min(2).max(150), email: z.string().trim().email().max(254).nullable().optional(), departmentId: idSchema }).strict();
  router.post("/users", authorize("directory.manage", audit), async (req, res) => {
    const dto = parse(userSchema, req.body);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: dto, include: { department: true } });
      await tx.auditEvent.create({ data: auditData(req, "user.created", "user", created.id) }); return created;
    }); res.status(201).json(user);
  });
  router.patch("/users/:id", authorize("directory.manage", audit), async (req, res) => {
    const id = parse(idSchema, req.params.id); const dto = parse(userSchema.partial(), req.body);
    const user = await prisma.$transaction(async (tx) => { const updated = await tx.user.update({ where: { id }, data: dto, include: { department: true } }); await tx.auditEvent.create({ data: auditData(req, "user.updated", "user", id, "success", { fields: Object.keys(dto) }) }); return updated; }); res.json(user);
  });
  router.post("/users/:id/archive", authorize("directory.manage", audit), async (req, res) => {
    const id = parse(idSchema, req.params.id); const user = await prisma.$transaction(async (tx) => { const updated = await tx.user.update({ where: { id }, data: { archivedAt: new Date(), accounts: { updateMany: { where: {}, data: { archivedAt: new Date(), credentialHash: null } } } } }); await tx.session.updateMany({ where: { account: { userId: id }, revokedAt: null }, data: { revokedAt: new Date() } }); await tx.auditEvent.create({ data: auditData(req, "user.archived", "user", id) }); return updated; }); res.json(user);
  });

  router.get("/departments", authorize("directory.read", audit), async (req, res) => {
    const query = parse(directoryList, req.query); const where: Prisma.DepartmentWhereInput = { archivedAt: query.includeArchived === "true" ? undefined : null, OR: query.search ? [{ name: { contains: query.search } }, { code: { contains: query.search } }] : undefined };
    const [data, total] = await Promise.all([prisma.department.findMany({ where, orderBy: { name: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.department.count({ where })]); res.json(pageResult(data, query.page, query.pageSize, total));
  });
  const departmentSchema = z.object({ code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()), name: z.string().trim().min(2).max(150) }).strict();
  router.post("/departments", authorize("directory.manage", audit), async (req, res) => { const dto = parse(departmentSchema, req.body); const item = await prisma.$transaction(async (tx) => { const created = await tx.department.create({ data: dto }); await tx.auditEvent.create({ data: auditData(req, "department.created", "department", created.id) }); return created; }); res.status(201).json(item); });
  router.patch("/departments/:id", authorize("directory.manage", audit), async (req, res) => { const id = parse(idSchema, req.params.id); const dto = parse(departmentSchema.partial(), req.body); const item = await prisma.$transaction(async (tx) => { const updated = await tx.department.update({ where: { id }, data: dto }); await tx.auditEvent.create({ data: auditData(req, "department.updated", "department", id) }); return updated; }); res.json(item); });
  router.post("/departments/:id/archive", authorize("directory.manage", audit), async (req, res) => { const id = parse(idSchema, req.params.id); const item = await prisma.$transaction(async (tx) => { const updated = await tx.department.update({ where: { id }, data: { archivedAt: new Date() } }); await tx.auditEvent.create({ data: auditData(req, "department.archived", "department", id) }); return updated; }); res.json(item); });

  router.get("/categories", authorize("directory.read", audit), async (req, res) => {
    const query = parse(directoryList, req.query); const where: Prisma.TicketCategoryWhereInput = { archivedAt: query.includeArchived === "true" ? undefined : null, OR: query.search ? [{ name: { contains: query.search } }, { code: { contains: query.search } }] : undefined };
    const [data, total] = await Promise.all([prisma.ticketCategory.findMany({ where, orderBy: { name: "asc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.ticketCategory.count({ where })]); res.json(pageResult(data, query.page, query.pageSize, total));
  });
  const categorySchema = z.object({ code: z.string().trim().min(2).max(30).transform((v) => v.toUpperCase()), name: z.string().trim().min(2).max(150), description: z.string().trim().max(1_000).nullable().optional() }).strict();
  router.post("/categories", authorize("directory.manage", audit), async (req, res) => { const dto = parse(categorySchema, req.body); const item = await prisma.$transaction(async (tx) => { const created = await tx.ticketCategory.create({ data: dto }); await tx.auditEvent.create({ data: auditData(req, "category.created", "category", created.id) }); return created; }); res.status(201).json(item); });
  router.patch("/categories/:id", authorize("directory.manage", audit), async (req, res) => { const id = parse(idSchema, req.params.id); const dto = parse(categorySchema.partial(), req.body); const item = await prisma.$transaction(async (tx) => { const updated = await tx.ticketCategory.update({ where: { id }, data: dto }); await tx.auditEvent.create({ data: auditData(req, "category.updated", "category", id) }); return updated; }); res.json(item); });
  router.post("/categories/:id/archive", authorize("directory.manage", audit), async (req, res) => { const id = parse(idSchema, req.params.id); const item = await prisma.$transaction(async (tx) => { const updated = await tx.ticketCategory.update({ where: { id }, data: { archivedAt: new Date() } }); await tx.auditEvent.create({ data: auditData(req, "category.archived", "category", id) }); return updated; }); res.json(item); });

  return router;
}
