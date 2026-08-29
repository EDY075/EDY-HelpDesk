PRAGMA foreign_keys=OFF;

CREATE TABLE "new_SecurityCase" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "securityCaseCode" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "severity" TEXT NOT NULL CHECK("severity" IN ('Low','Medium','High','Critical')),
  "status" TEXT NOT NULL DEFAULT 'New' CHECK("status" IN ('New','Triaged','Investigating','Contained','Resolved','Closed','FalsePositive')),
  "reason" TEXT NOT NULL,
  "assignedAnalystId" TEXT,
  "assetId" TEXT,
  "createdById" TEXT NOT NULL,
  "resolutionSummary" TEXT,
  "classification" TEXT,
  "lessonsLearned" TEXT,
  "falsePositiveReason" TEXT,
  "resolvedAt" DATETIME,
  "closedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SecurityCase_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SecurityCase_assignedAnalystId_fkey" FOREIGN KEY ("assignedAnalystId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SecurityCase_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SecurityCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_SecurityCase" ("id","securityCaseCode","ticketId","title","summary","severity","status","reason","assignedAnalystId","assetId","createdById","createdAt","updatedAt")
SELECT sc."id",sc."caseNumber",sc."ticketId",t."title",sc."summary",sc."severity",
       CASE WHEN sc."status"='Closed' THEN 'Closed' WHEN sc."status"='New' THEN 'New' ELSE 'Investigating' END,
       'Migrated security escalation',t."assigneeAccountId",t."assetId",
       COALESCE(t."assigneeAccountId",(SELECT "id" FROM "Account" WHERE "role"='Admin' AND "archivedAt" IS NULL ORDER BY "createdAt" LIMIT 1)),
       sc."createdAt",sc."updatedAt"
FROM "SecurityCase" sc JOIN "Ticket" t ON t."id"=sc."ticketId";

DROP TABLE "SecurityCase";
ALTER TABLE "new_SecurityCase" RENAME TO "SecurityCase";

CREATE UNIQUE INDEX "SecurityCase_securityCaseCode_key" ON "SecurityCase"("securityCaseCode");
CREATE UNIQUE INDEX "SecurityCase_ticketId_key" ON "SecurityCase"("ticketId");
CREATE INDEX "SecurityCase_status_severity_createdAt_idx" ON "SecurityCase"("status","severity","createdAt");
CREATE INDEX "SecurityCase_assignedAnalystId_status_idx" ON "SecurityCase"("assignedAnalystId","status");
CREATE INDEX "SecurityCase_assetId_status_idx" ON "SecurityCase"("assetId","status");
CREATE INDEX "SecurityCase_updatedAt_idx" ON "SecurityCase"("updatedAt");

CREATE TABLE "SecurityEvidence" (
  "evidenceId" TEXT NOT NULL PRIMARY KEY,
  "securityCaseId" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK("type" IN ('TicketContext','DiagnosticFinding','EventLog','ManualNote')),
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceReference" TEXT,
  "snapshot" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvidence_securityCaseId_fkey" FOREIGN KEY ("securityCaseId") REFERENCES "SecurityCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SecurityEvidence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SecurityEvidence_securityCaseId_createdAt_idx" ON "SecurityEvidence"("securityCaseId","createdAt");
CREATE INDEX "SecurityEvidence_type_createdAt_idx" ON "SecurityEvidence"("type","createdAt");
CREATE UNIQUE INDEX "SecurityEvidence_securityCaseId_type_sourceReference_key" ON "SecurityEvidence"("securityCaseId","type","sourceReference");

CREATE TABLE "SecurityTimelineEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "securityCaseId" TEXT NOT NULL,
  "actorAccountId" TEXT,
  "action" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityTimelineEntry_securityCaseId_fkey" FOREIGN KEY ("securityCaseId") REFERENCES "SecurityCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SecurityTimelineEntry_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SecurityTimelineEntry_securityCaseId_timestamp_idx" ON "SecurityTimelineEntry"("securityCaseId","timestamp");
CREATE INDEX "SecurityTimelineEntry_actorAccountId_timestamp_idx" ON "SecurityTimelineEntry"("actorAccountId","timestamp");
CREATE TRIGGER "SecurityTimelineEntry_prevent_update" BEFORE UPDATE ON "SecurityTimelineEntry" BEGIN SELECT RAISE(ABORT,'SecurityTimelineEntry is append-only'); END;
CREATE TRIGGER "SecurityTimelineEntry_prevent_delete" BEFORE DELETE ON "SecurityTimelineEntry" BEGIN SELECT RAISE(ABORT,'SecurityTimelineEntry is append-only'); END;

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
