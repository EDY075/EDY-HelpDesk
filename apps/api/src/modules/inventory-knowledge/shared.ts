import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../platform/errors.js";

export const publicAccount = {
  select: {
    id: true,
    username: true,
    role: true,
    user: {
      select: { id: true, displayName: true, email: true, archivedAt: true },
    },
  },
} as const;
export const uuid = z.string().uuid();
export const revision = z.number().int().positive();
export const pageSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
});
type SafeParseSchema<T> = {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues?: ReadonlyArray<{ message?: string }> } };
};

export function parse<T>(schema: SafeParseSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new HttpError(
      400,
      "Bad Request",
      result.error.issues?.[0]?.message ?? "Invalid request.",
    );
  return result.data;
}
export function paged<T>(
  data: T[],
  page: number,
  pageSize: number,
  total: number,
) {
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
export function auditRecord(
  req: Express.Request,
  action: string,
  resourceType: string,
  resourceId: string,
  changedFields?: Prisma.InputJsonValue,
) {
  return {
    actorId: req.auth!.accountId,
    actorType: "account",
    actorRoleSnapshot: req.auth!.role,
    action,
    resourceType,
    resourceId,
    outcome: "success",
    requestId: req.requestId,
    correlationId: req.correlationId,
    changedFields,
  };
}
export function conflict(): never {
  throw new HttpError(
    409,
    "Conflict",
    "This record was updated or its state changed. Reload the latest version.",
  );
}
export function missing(): never {
  throw new HttpError(404, "Not Found", "The requested record was not found.");
}
export async function nextCode(
  tx: Prisma.TransactionClient,
  scope: "asset" | "knowledge" | "security",
  prefix: "AST" | "KB" | "SEC",
) {
  const year = new Date().getUTCFullYear();
  const counter = await tx.sequenceCounter.upsert({
    where: { scope_year: { scope, year } },
    create: { scope, year, value: 1 },
    update: { value: { increment: 1 } },
  });
  if (counter.value > 999999)
    throw new HttpError(
      409,
      "Conflict",
      "The annual numbering capacity has been reached.",
    );
  return `${prefix}-${year}-${String(counter.value).padStart(6, "0")}`;
}
export async function activeDepartment(
  tx: Prisma.TransactionClient,
  id: string,
) {
  if (!(await tx.department.findFirst({ where: { id, archivedAt: null } })))
    throw new HttpError(400, "Bad Request", "Select an active department.");
}
export async function activeAsset(
  tx: Prisma.TransactionClient,
  id: string | null | undefined,
) {
  if (id && !(await tx.asset.findFirst({ where: { id, archivedAt: null } })))
    throw new HttpError(400, "Bad Request", "Select an active asset.");
}
export async function ticketForChange(
  tx: Prisma.TransactionClient,
  req: Express.Request,
  id: string,
  version: number,
) {
  const ticket = await tx.ticket.findUnique({ where: { id } });
  if (!ticket) return missing();
  if (
    req.auth!.role !== "Admin" &&
    ticket.assigneeAccountId !== req.auth!.accountId
  )
    throw new HttpError(
      403,
      "Forbidden",
      "This ticket is outside your operational scope.",
    );
  if (ticket.status === "Closed" || ticket.version !== version)
    return conflict();
  return ticket;
}
