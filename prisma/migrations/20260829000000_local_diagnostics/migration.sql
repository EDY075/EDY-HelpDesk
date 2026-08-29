ALTER TABLE "DiagnosticAction" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
CREATE TABLE "DeploymentState" ("id" TEXT PRIMARY KEY NOT NULL,"mode" TEXT NOT NULL CHECK("mode" IN ('Demo','Operational')),"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "LocalEndpoint" ("id" TEXT PRIMARY KEY NOT NULL,"assetId" TEXT NOT NULL UNIQUE REFERENCES "Asset"("id") ON DELETE RESTRICT,"fingerprint" TEXT NOT NULL,"registeredBy" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,"registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "DiagnosticWorkerState" ("id" TEXT PRIMARY KEY NOT NULL,"owner" TEXT NOT NULL,"fingerprint" TEXT NOT NULL,"heartbeatAt" DATETIME NOT NULL,"leaseUntil" DATETIME NOT NULL,"engine" TEXT,"ready" BOOLEAN NOT NULL DEFAULT false,"errorCode" TEXT);
CREATE TABLE "DiagnosticJob" (
 "id" TEXT PRIMARY KEY NOT NULL,"actionId" TEXT NOT NULL,"actionRecordId" TEXT NOT NULL REFERENCES "DiagnosticAction"("id") ON DELETE RESTRICT,"assetId" TEXT NOT NULL REFERENCES "Asset"("id") ON DELETE RESTRICT,"requestedBy" TEXT NOT NULL REFERENCES "Account"("id") ON DELETE RESTRICT,
 "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"startedAt" DATETIME,"completedAt" DATETIME,"status" TEXT NOT NULL DEFAULT 'Queued' CHECK("status" IN ('Queued','Running','Succeeded','Failed','TimedOut','Cancelled')),
 "parameters" JSONB NOT NULL,"idempotencyKey" TEXT NOT NULL,"requestId" TEXT,"correlationId" TEXT,"scriptVersion" INTEGER NOT NULL,"scriptHash" TEXT NOT NULL,"engine" TEXT,"outputBytes" INTEGER NOT NULL DEFAULT 0,"durationMs" INTEGER,"exitCode" INTEGER,"errorCode" TEXT,"cancelRequestedAt" DATETIME,"owner" TEXT,"sourceMode" TEXT NOT NULL CHECK("sourceMode" IN ('Demo','Operational')),"expiresAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "DiagnosticJob_requestedBy_idempotencyKey_key" ON "DiagnosticJob"("requestedBy","idempotencyKey");
CREATE UNIQUE INDEX "DiagnosticJob_one_active_asset" ON "DiagnosticJob"("assetId") WHERE "status" IN ('Queued','Running');
CREATE INDEX "DiagnosticJob_status_requestedAt_idx" ON "DiagnosticJob"("status","requestedAt");
CREATE INDEX "DiagnosticJob_assetId_requestedAt_idx" ON "DiagnosticJob"("assetId","requestedAt");
CREATE TABLE "DiagnosticResult" (
 "id" TEXT PRIMARY KEY NOT NULL,"jobId" TEXT NOT NULL UNIQUE REFERENCES "DiagnosticJob"("id") ON DELETE RESTRICT,"assetId" TEXT NOT NULL REFERENCES "Asset"("id") ON DELETE RESTRICT,"actionId" TEXT NOT NULL,"collectedAt" DATETIME NOT NULL,"payload" JSONB NOT NULL,"findings" JSONB NOT NULL,"ruleVersion" INTEGER NOT NULL DEFAULT 1,"sourceMode" TEXT NOT NULL,"redactionCount" INTEGER NOT NULL DEFAULT 0,"expiresAt" DATETIME NOT NULL
);
CREATE INDEX "DiagnosticResult_assetId_collectedAt_idx" ON "DiagnosticResult"("assetId","collectedAt");
CREATE INDEX "DiagnosticResult_expiresAt_idx" ON "DiagnosticResult"("expiresAt");
CREATE TABLE "WindowsEvent" ("id" TEXT PRIMARY KEY NOT NULL,"resultId" TEXT NOT NULL REFERENCES "DiagnosticResult"("id") ON DELETE RESTRICT,"timestamp" DATETIME NOT NULL,"eventId" INTEGER NOT NULL,"level" TEXT NOT NULL,"provider" TEXT NOT NULL,"message" TEXT NOT NULL,"expiresAt" DATETIME NOT NULL);
CREATE INDEX "WindowsEvent_resultId_timestamp_idx" ON "WindowsEvent"("resultId","timestamp");
CREATE INDEX "WindowsEvent_expiresAt_idx" ON "WindowsEvent"("expiresAt");
CREATE TRIGGER "DiagnosticResult_mode_guard" BEFORE INSERT ON "DiagnosticResult"
WHEN NEW."sourceMode" <> COALESCE((SELECT "mode" FROM "DeploymentState" WHERE "id"='local'),'missing') OR NEW."sourceMode" <> (SELECT "sourceMode" FROM "DiagnosticJob" WHERE "id"=NEW."jobId")
BEGIN SELECT RAISE(ABORT,'Diagnostic deployment mode mismatch'); END;
CREATE TRIGGER "DeploymentState_mode_immutable" BEFORE UPDATE OF "mode" ON "DeploymentState" WHEN OLD."mode" <> NEW."mode" BEGIN SELECT RAISE(ABORT,'Deployment mode is immutable'); END;
