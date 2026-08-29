import { Router } from "express";
import { z } from "zod";
import type { Asset, Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../../platform/prisma.js";
import { HttpError } from "../../platform/errors.js";
import type { AppendOnlyAuditRepository } from "../audit/audit-repository.js";
import { authorize } from "../auth/rbac.js";
import {
  activeAsset,
  activeDepartment,
  auditRecord,
  conflict,
  missing,
  nextCode,
  pageSchema,
  paged,
  parse,
  revision,
  ticketForChange,
  uuid,
} from "./shared.js";

const types = z.enum([
  "Desktop",
  "Laptop",
  "Server",
  "Printer",
  "NetworkDevice",
  "Mobile",
  "Other",
]);
const statuses = z.enum([
  "Active",
  "InStock",
  "Maintenance",
  "Retired",
  "Lost",
]);
const optionalText = z.string().trim().max(200).nullable().optional();
const date = z
  .string()
  .datetime()
  .transform((v) => new Date(v))
  .nullable()
  .optional();
const bytes = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
  .nullable()
  .optional();
const fields = z
  .object({
    name: z.string().trim().min(2).max(150),
    type: types,
    departmentId: uuid,
    hostname: z
      .string()
      .trim()
      .max(253)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/, "Invalid hostname.")
      .nullable()
      .optional(),
    manufacturer: optionalText,
    model: optionalText,
    serialNumber: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9 ._/-]+$/, "Invalid serial number.")
      .nullable()
      .optional(),
    operatingSystem: optionalText,
    osVersion: optionalText,
    cpu: optionalText,
    ramBytes: bytes,
    storageBytes: bytes,
    ipv4: z.string().ipv4().nullable().optional(),
    macAddress: z
      .string()
      .regex(
        /^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/,
        "Use a MAC address such as 02:00:00:00:00:01.",
      )
      .transform((v) => v.toUpperCase())
      .nullable()
      .optional(),
    status: statuses.optional(),
    location: optionalText,
    purchaseDate: date,
    warrantyUntil: date,
    notes: z.string().trim().max(5000).nullable().optional(),
    lastSeenAt: date,
  })
  .strict();
const include = {
  owner: { include: { department: true } },
  department: true,
} satisfies Prisma.AssetInclude;
const view = <T extends Asset>(asset: T) => ({
  ...asset,
  type: asset.assetType,
  assignedUserId: asset.ownerId,
});
const ticketSummary = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  priority: true,
  updatedAt: true,
} as const;
export function createAssetsRouter(
  prisma: DatabaseClient,
  audit: AppendOnlyAuditRepository,
) {
  const router = Router();
  router.get("/assets", authorize("assets.read", audit), async (req, res) => {
    const q = parse(
      pageSchema.extend({
        type: types.optional(),
        status: statuses.optional(),
        departmentId: uuid.optional(),
        assignedUserId: z.union([uuid, z.literal("unassigned")]).optional(),
        operatingSystem: z.string().max(200).optional(),
        includeArchived: z.enum(["true", "false"]).default("false"),
        sort: z
          .enum(["updatedAt", "assetCode", "name", "lastSeenAt"])
          .default("updatedAt"),
        order: z.enum(["asc", "desc"]).default("desc"),
      }),
      req.query,
    );
    const where: Prisma.AssetWhereInput = {
      archivedAt: q.includeArchived === "true" ? undefined : null,
      assetType: q.type,
      status: q.status,
      departmentId: q.departmentId,
      ownerId: q.assignedUserId === "unassigned" ? null : q.assignedUserId,
      operatingSystem: q.operatingSystem
        ? { contains: q.operatingSystem }
        : undefined,
      OR: q.search
        ? [
            "name",
            "assetCode",
            "assetTag",
            "hostname",
            "serialNumber",
            "model",
          ].map((key) => ({ [key]: { contains: q.search } }))
        : undefined,
    };
    const [data, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        include,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ [q.sort]: q.order }, { id: "asc" }],
      }),
      prisma.asset.count({ where }),
    ]);
    res.json(paged(data.map(view), q.page, q.pageSize, total));
  });
  router.post(
    "/assets",
    authorize("assets.manage", audit),
    async (req, res) => {
      const { type, ...dto } = parse(fields, req.body);
      const item = await prisma.$transaction(async (tx) => {
        await activeDepartment(tx, dto.departmentId);
        const assetCode = await nextCode(tx, "asset", "AST");
        const asset = await tx.asset.create({
          data: { ...dto, assetType: type, assetCode, assetTag: assetCode },
          include,
        });
        await tx.auditEvent.create({
          data: auditRecord(req, "asset.created", "asset", asset.id),
        });
        return asset;
      });
      res.status(201).json(view(item));
    },
  );
  router.get(
    "/assets/:id",
    authorize("assets.read", audit),
    async (req, res) => {
      const id = parse(uuid, req.params.id);
      const item = await prisma.asset.findUnique({
        where: { id },
        include: {
          ...include,
          tickets: {
            select: ticketSummary,
            orderBy: { updatedAt: "desc" },
            take: 50,
          },
        },
      });
      if (!item) return missing();
      const activity = await prisma.auditEvent.findMany({
        where: { resourceType: "asset", resourceId: id },
        select: {
          id: true,
          occurredAt: true,
          action: true,
          actorId: true,
          changedFields: true,
        },
        orderBy: { occurredAt: "desc" },
        take: 50,
      });
      res.json({
        ...view(item),
        activity,
        inventorySource: "manual",
        diagnosticsAvailable: false,
      });
    },
  );
  router.patch(
    "/assets/:id",
    authorize("assets.manage", audit),
    async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { version, type, ...dto } = parse(
        fields.partial().extend({ version: revision }).strict(),
        req.body,
      );
      const item = await prisma.$transaction(async (tx) => {
        const current = await tx.asset.findUnique({ where: { id } });
        if (!current) return missing();
        if (current.archivedAt || current.version !== version)
          return conflict();
        if (dto.departmentId) await activeDepartment(tx, dto.departmentId);
        const changed = await tx.asset.updateMany({
          where: { id, version, archivedAt: null },
          data: { ...dto, assetType: type, version: { increment: 1 } },
        });
        if (!changed.count) return conflict();
        await tx.auditEvent.create({
          data: auditRecord(req, "asset.updated", "asset", id, {
            fields: Object.keys(dto),
            previousDepartmentId: current.departmentId,
            newDepartmentId: dto.departmentId ?? current.departmentId,
          }),
        });
        return tx.asset.findUniqueOrThrow({ where: { id }, include });
      });
      res.json(view(item));
    },
  );
  router.post(
    "/assets/:id/assignments",
    authorize("assets.manage", audit),
    async (req, res) => {
      const id = parse(uuid, req.params.id);
      const dto = parse(
        z
          .object({ assignedUserId: uuid.nullable(), version: revision })
          .strict(),
        req.body,
      );
      const item = await prisma.$transaction(async (tx) => {
        const current = await tx.asset.findUnique({ where: { id } });
        if (!current) return missing();
        if (current.archivedAt || current.version !== dto.version)
          return conflict();
        if (
          dto.assignedUserId &&
          !(await tx.user.findFirst({
            where: {
              id: dto.assignedUserId,
              archivedAt: null,
              department: { archivedAt: null },
            },
          }))
        )
          throw new HttpError(400, "Bad Request", "Select an active user.");
        const changed = await tx.asset.updateMany({
          where: { id, version: dto.version, archivedAt: null },
          data: { ownerId: dto.assignedUserId, version: { increment: 1 } },
        });
        if (!changed.count) return conflict();
        const action = !dto.assignedUserId
          ? "asset.unassigned"
          : current.ownerId
            ? "asset.reassigned"
            : "asset.assigned";
        await tx.auditEvent.create({
          data: auditRecord(req, action, "asset", id, {
            previousUserId: current.ownerId,
            newUserId: dto.assignedUserId,
          }),
        });
        return tx.asset.findUniqueOrThrow({ where: { id }, include });
      });
      res.json(view(item));
    },
  );
  for (const action of ["archive", "restore"] as const)
    router.post(
      `/assets/:id/${action}`,
      authorize("assets.archive", audit),
      async (req, res) => {
        const id = parse(uuid, req.params.id);
        const dto = parse(z.object({ version: revision }).strict(), req.body);
        const item = await prisma.$transaction(async (tx) => {
          const current = await tx.asset.findUnique({ where: { id } });
          if (!current) return missing();
          if (
            current.version !== dto.version ||
            Boolean(current.archivedAt) !== (action === "restore")
          )
            return conflict();
          const changed = await tx.asset.updateMany({
            where: { id, version: dto.version },
            data: {
              archivedAt: action === "archive" ? new Date() : null,
              version: { increment: 1 },
            },
          });
          if (!changed.count) return conflict();
          await tx.auditEvent.create({
            data: auditRecord(
              req,
              action === "archive" ? "asset.archived" : "asset.restored",
              "asset",
              id,
            ),
          });
          return tx.asset.findUniqueOrThrow({ where: { id }, include });
        });
        res.json(view(item));
      },
    );
  router.post(
    "/tickets/:id/asset",
    authorize("tickets.update", audit),
    async (req, res) => {
      const id = parse(uuid, req.params.id);
      const dto = parse(
        z.object({ assetId: uuid.nullable(), version: revision }).strict(),
        req.body,
      );
      await prisma.$transaction(async (tx) => {
        const current = await ticketForChange(tx, req, id, dto.version);
        await activeAsset(tx, dto.assetId);
        const changed = await tx.ticket.updateMany({
          where: { id, version: dto.version },
          data: { assetId: dto.assetId, version: { increment: 1 } },
        });
        if (!changed.count) return conflict();
        const details = {
          previousAssetId: current.assetId,
          newAssetId: dto.assetId,
        };
        await tx.ticketHistory.create({
          data: {
            ticketId: id,
            actorAccountId: req.auth!.accountId,
            action: "ticket.asset_changed",
            previousVersion: dto.version,
            newVersion: dto.version + 1,
            details,
          },
        });
        await tx.auditEvent.create({
          data: auditRecord(req, "ticket.asset_changed", "ticket", id, details),
        });
        for (const assetId of new Set(
          [current.assetId, dto.assetId].filter((v): v is string => Boolean(v)),
        ))
          await tx.auditEvent.create({
            data: auditRecord(
              req,
              assetId === dto.assetId
                ? "asset.ticket_linked"
                : "asset.ticket_unlinked",
              "asset",
              assetId,
              { ticketId: id },
            ),
          });
      });
      res.status(204).end();
    },
  );
  router.get(
    "/users/:id",
    authorize("directory.read", audit),
    async (req, res) => {
      const id = parse(uuid, req.params.id);
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          department: true,
          assets: {
            where: { archivedAt: null },
            include,
            orderBy: { name: "asc" },
          },
        },
      });
      if (!user) return missing();
      const [openTickets, recentTickets] = await Promise.all([
        prisma.ticket.findMany({
          where: { requesterId: id, status: { notIn: ["Resolved", "Closed"] } },
          select: ticketSummary,
          orderBy: { updatedAt: "desc" },
          take: 25,
        }),
        prisma.ticket.findMany({
          where: { requesterId: id },
          select: ticketSummary,
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),
      ]);
      res.json({
        ...user,
        assets: user.assets.map(view),
        openTickets,
        recentTickets,
      });
    },
  );
  return router;
}
