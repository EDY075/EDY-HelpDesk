import type { Prisma } from "../../generated/prisma/client.js";
import type { DatabaseClient } from "../../platform/prisma.js";

export interface AppendOnlyAuditRepository {
  append(data: Prisma.AuditEventCreateInput): Promise<{ id: string }>;
  count(): Promise<number>;
}

export function createAuditRepository(prisma: DatabaseClient): AppendOnlyAuditRepository {
  return Object.freeze({
    async append(data: Prisma.AuditEventCreateInput) {
      return prisma.auditEvent.create({ data, select: { id: true } });
    },
    async count() {
      return prisma.auditEvent.count();
    },
  });
}
