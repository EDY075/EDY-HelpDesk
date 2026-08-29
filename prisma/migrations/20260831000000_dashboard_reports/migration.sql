CREATE INDEX "Asset_status_archivedAt_idx" ON "Asset"("status", "archivedAt");

CREATE TABLE "ExportJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestedBy" TEXT NOT NULL,
  "reportType" TEXT NOT NULL CHECK("reportType" IN ('TicketReport','SlaReport','AssetReport','DiagnosticReport','KnowledgeReport','SecurityCaseReport','AuditSummary')),
  "filters" JSONB NOT NULL,
  "format" TEXT NOT NULL CHECK("format" IN ('CSV','JSON')),
  "status" TEXT NOT NULL DEFAULT 'Queued' CHECK("status" IN ('Queued','Running','Succeeded','Failed','Expired')),
  "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "expiresAt" DATETIME NOT NULL,
  "fileName" TEXT,
  "fileSize" INTEGER,
  "rowCount" INTEGER,
  "errorCode" TEXT,
  CONSTRAINT "ExportJob_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ExportJob_requestedBy_requestedAt_idx" ON "ExportJob"("requestedBy", "requestedAt");
CREATE INDEX "ExportJob_status_requestedAt_idx" ON "ExportJob"("status", "requestedAt");
CREATE INDEX "ExportJob_expiresAt_idx" ON "ExportJob"("expiresAt");

PRAGMA foreign_key_check;
