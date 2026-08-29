import { Router } from "express";
import { z } from "zod";
import type {
  KnowledgeArticle,
  Prisma,
} from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../../platform/prisma.js";
import { HttpError } from "../../platform/errors.js";
import type { AppendOnlyAuditRepository } from "../audit/audit-repository.js";
import { authorize } from "../auth/rbac.js";
import {
  auditRecord,
  conflict,
  missing,
  nextCode,
  pageSchema,
  paged,
  parse,
  publicAccount,
  revision,
  ticketForChange,
  uuid,
} from "./shared.js";

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/<\/?[a-z][^>]*>/i.test(v), "Use plain text, not HTML.");
const tag = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9 -]+$/, "Tags use letters, digits, spaces and hyphens.")
  .transform((v) => v.toLowerCase());
const fields = z
  .object({
    title: safeText(200).refine(
      (v) => v.length >= 3,
      "Title needs at least 3 characters.",
    ),
    summary: safeText(1000),
    problem: safeText(8000),
    symptoms: safeText(8000),
    diagnosticSteps: safeText(8000),
    solution: safeText(8000),
    validationSteps: safeText(8000),
    categoryId: uuid,
    tags: z.array(tag).max(12),
  })
  .strict();
const include = {
  author: publicAccount,
  category: true,
  _count: { select: { ticketLinks: true } },
} satisfies Prisma.KnowledgeArticleInclude;
const view = <T extends KnowledgeArticle>(article: T) => ({
  ...article,
  tags: article.tags.split("|").filter(Boolean),
});
const encodeTags = (tags: string[]) =>
  tags.length ? `|${[...new Set(tags)].sort().join("|")}|` : "";
async function activeCategory(tx: Prisma.TransactionClient, id: string) {
  if (!(await tx.ticketCategory.findFirst({ where: { id, archivedAt: null } })))
    throw new HttpError(400, "Bad Request", "Select an active category.");
}

export function createKnowledgeRouter(
  prisma: DatabaseClient,
  audit: AppendOnlyAuditRepository,
) {
  const router = Router();
  router.get(
    "/knowledge",
    authorize("knowledge.read", audit),
    async (req, res) => {
      const q = parse(
        pageSchema.extend({
          categoryId: uuid.optional(),
          status: z.enum(["Draft", "Published", "Archived"]).optional(),
          tag: tag.optional(),
          sort: z.enum(["updatedAt", "title"]).default("updatedAt"),
          order: z.enum(["asc", "desc"]).default("desc"),
        }),
        req.query,
      );
      if (req.auth!.role === "Viewer" && q.status && q.status !== "Published")
        throw new HttpError(
          403,
          "Forbidden",
          "Only published knowledge is available to this role.",
        );
      const where: Prisma.KnowledgeArticleWhereInput = {
        categoryId: q.categoryId,
        status:
          req.auth!.role === "Viewer"
            ? "Published"
            : (q.status ?? { not: "Archived" }),
        tags: q.tag ? { contains: `|${q.tag}|` } : undefined,
        OR: q.search
          ? [
              "articleCode",
              "title",
              "summary",
              "problem",
              "symptoms",
              "solution",
              "tags",
            ].map((key) => ({ [key]: { contains: q.search } }))
          : undefined,
      };
      const [data, total] = await Promise.all([
        prisma.knowledgeArticle.findMany({
          where,
          include,
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
          orderBy: [{ [q.sort]: q.order }, { id: "asc" }],
        }),
        prisma.knowledgeArticle.count({ where }),
      ]);
      res.json(paged(data.map(view), q.page, q.pageSize, total));
    },
  );
  router.post(
    "/knowledge",
    authorize("knowledge.draft", audit),
    async (req, res) => {
      const { tags, ...dto } = parse(fields, req.body);
      const item = await prisma.$transaction(async (tx) => {
        await activeCategory(tx, dto.categoryId);
        const articleCode = await nextCode(tx, "knowledge", "KB");
        const article = await tx.knowledgeArticle.create({
          data: {
            ...dto,
            articleCode,
            tags: encodeTags(tags),
            authorAccountId: req.auth!.accountId,
            status: "Draft",
          },
          include,
        });
        await tx.auditEvent.create({
          data: auditRecord(req, "knowledge.created", "knowledge", article.id),
        });
        return article;
      });
      res.status(201).json(view(item));
    },
  );
  router.get(
    "/knowledge/:id",
    authorize("knowledge.read", audit),
    async (req, res) => {
      const id = parse(uuid, req.params.id);
      const article = await prisma.knowledgeArticle.findFirst({
        where: {
          id,
          status: req.auth!.role === "Viewer" ? "Published" : undefined,
        },
        include: {
          ...include,
          ticketLinks: {
            include: {
              ticket: {
                select: {
                  id: true,
                  ticketNumber: true,
                  title: true,
                  status: true,
                  priority: true,
                  updatedAt: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      });
      if (!article) return missing();
      res.json(view(article));
    },
  );
  router.patch(
    "/knowledge/:id",
    authorize("knowledge.draft", audit),
    async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { version, tags, ...dto } = parse(
        fields.partial().extend({ version: revision }).strict(),
        req.body,
      );
      const item = await prisma.$transaction(async (tx) => {
        const current = await tx.knowledgeArticle.findUnique({ where: { id } });
        if (!current) return missing();
        if (req.auth!.role !== "Admin" && current.status !== "Draft")
          throw new HttpError(
            403,
            "Forbidden",
            "Technicians can edit drafts only.",
          );
        if (current.status === "Archived" || current.version !== version)
          return conflict();
        if (dto.categoryId) await activeCategory(tx, dto.categoryId);
        if (
          current.status === "Published" &&
          Object.values(dto).some((v) => typeof v === "string" && !v.trim())
        )
          throw new HttpError(
            400,
            "Bad Request",
            "Published articles require complete content.",
          );
        const changed = await tx.knowledgeArticle.updateMany({
          where: { id, version },
          data: {
            ...dto,
            tags: tags ? encodeTags(tags) : undefined,
            version: { increment: 1 },
          },
        });
        if (!changed.count) return conflict();
        await tx.auditEvent.create({
          data: auditRecord(req, "knowledge.updated", "knowledge", id, {
            fields: Object.keys(dto),
            tagsChanged: tags !== undefined,
          }),
        });
        return tx.knowledgeArticle.findUniqueOrThrow({
          where: { id },
          include,
        });
      });
      res.json(view(item));
    },
  );
  for (const action of ["publish", "archive", "restore"] as const)
    router.post(
      `/knowledge/:id/${action}`,
      authorize("knowledge.publish", audit),
      async (req, res) => {
        const id = parse(uuid, req.params.id);
        const { version } = parse(
          z.object({ version: revision }).strict(),
          req.body,
        );
        const item = await prisma.$transaction(async (tx) => {
          const current = await tx.knowledgeArticle.findUnique({
            where: { id },
          });
          if (!current) return missing();
          if (
            current.version !== version ||
            (action === "restore"
              ? current.status !== "Archived"
              : current.status === "Archived") ||
            (action === "publish" && current.status !== "Draft")
          )
            return conflict();
          if (action === "publish") {
            await activeCategory(tx, current.categoryId);
            if (
              [
                current.summary,
                current.problem,
                current.symptoms,
                current.diagnosticSteps,
                current.solution,
                current.validationSteps,
              ].some((v) => !v.trim())
            )
              throw new HttpError(
                400,
                "Bad Request",
                "Complete all support sections before publishing.",
              );
          }
          const status =
            action === "publish"
              ? "Published"
              : action === "archive"
                ? "Archived"
                : "Draft";
          const changed = await tx.knowledgeArticle.updateMany({
            where: { id, version },
            data: {
              status,
              archivedAt: action === "archive" ? new Date() : null,
              publishedAt:
                action === "publish" ? new Date() : current.publishedAt,
              version: { increment: 1 },
            },
          });
          if (!changed.count) return conflict();
          await tx.auditEvent.create({
            data: auditRecord(
              req,
              `knowledge.${action === "publish" ? "published" : action === "archive" ? "archived" : "restored"}`,
              "knowledge",
              id,
              { previousStatus: current.status, newStatus: status },
            ),
          });
          return tx.knowledgeArticle.findUniqueOrThrow({
            where: { id },
            include,
          });
        });
        res.json(view(item));
      },
    );
  router.get(
    "/tickets/:id/knowledge",
    authorize("knowledge.read", audit),
    async (req, res) => {
      const id = parse(uuid, req.params.id);
      if (
        !(await prisma.ticket.findUnique({
          where: { id },
          select: { id: true },
        }))
      )
        return missing();
      const links = await prisma.knowledgeArticleTicket.findMany({
        where: { ticketId: id, article: { status: "Published" } },
        include: { article: { include } },
        orderBy: { createdAt: "desc" },
      });
      res.json({ data: links.map((link) => view(link.article)) });
    },
  );
  for (const action of ["link", "unlink"] as const)
    router.post(
      `/tickets/:id/knowledge/${action}`,
      authorize("knowledge.link", audit),
      async (req, res) => {
        const id = parse(uuid, req.params.id);
        const dto = parse(
          z.object({ articleId: uuid, version: revision }).strict(),
          req.body,
        );
        await prisma.$transaction(async (tx) => {
          await ticketForChange(tx, req, id, dto.version);
          const article = await tx.knowledgeArticle.findUnique({
            where: { id: dto.articleId },
          });
          if (!article) return missing();
          if (action === "link" && article.status !== "Published")
            throw new HttpError(
              400,
              "Bad Request",
              "Only published articles can be linked.",
            );
          const existing = await tx.knowledgeArticleTicket.findUnique({
            where: {
              ticketId_articleId: { ticketId: id, articleId: dto.articleId },
            },
          });
          if (
            (action === "link" && existing) ||
            (action === "unlink" && !existing)
          )
            return conflict();
          const changed = await tx.ticket.updateMany({
            where: { id, version: dto.version },
            data: { version: { increment: 1 } },
          });
          if (!changed.count) return conflict();
          if (action === "link")
            await tx.knowledgeArticleTicket.create({
              data: { ticketId: id, articleId: dto.articleId },
            });
          else
            await tx.knowledgeArticleTicket.delete({
              where: { id: existing!.id },
            });
          const event = `ticket.knowledge_${action === "link" ? "linked" : "unlinked"}`;
          const details = {
            articleId: article.id,
            articleCode: article.articleCode,
          };
          await tx.ticketHistory.create({
            data: {
              ticketId: id,
              actorAccountId: req.auth!.accountId,
              action: event,
              previousVersion: dto.version,
              newVersion: dto.version + 1,
              details,
            },
          });
          await tx.auditEvent.create({
            data: auditRecord(req, event, "ticket", id, details),
          });
          await tx.auditEvent.create({
            data: auditRecord(req, event, "knowledge", article.id, {
              ticketId: id,
            }),
          });
        });
        res.status(204).end();
      },
    );
  return router;
}
