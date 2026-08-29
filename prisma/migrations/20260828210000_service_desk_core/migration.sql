-- Phase 2: server-side sessions and explicit ticket department/context fields.
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_accountId_revokedAt_expiresAt_idx" ON "Session"("accountId", "revokedAt", "expiresAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Ticket" ADD COLUMN "departmentId" TEXT REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD COLUMN "waitingReason" TEXT;
UPDATE "Ticket"
SET "departmentId" = (SELECT "departmentId" FROM "User" WHERE "User"."id" = "Ticket"."requesterId")
WHERE "departmentId" IS NULL;
CREATE INDEX "Ticket_departmentId_status_idx" ON "Ticket"("departmentId", "status");
