-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('Admin', 'Technician', 'Viewer');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('Low', 'Medium', 'High', 'Critical');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('New', 'Assigned', 'InProgress', 'WaitingUser', 'WaitingThirdParty', 'Resolved', 'Closed');

-- CreateEnum
CREATE TYPE "DiagnosticCategory" AS ENUM ('Windows', 'Network', 'Hardware', 'EventLog');

-- CreateEnum
CREATE TYPE "SecuritySeverity" AS ENUM ('Low', 'Medium', 'High', 'Critical');

-- CreateEnum
CREATE TYPE "SecurityCaseStatus" AS ENUM ('New', 'Triaged', 'Investigating', 'Contained', 'Resolved', 'Closed', 'FalsePositive');

-- CreateEnum
CREATE TYPE "SecurityEvidenceType" AS ENUM ('TicketContext', 'DiagnosticFinding', 'EventLog', 'ManualNote');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('Pending', 'Processed', 'Failed', 'DeadLetter');

-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('Queued', 'Running', 'Succeeded', 'Failed', 'Expired');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('TicketReport', 'SlaReport', 'AssetReport', 'DiagnosticReport', 'KnowledgeReport', 'SecurityCaseReport', 'AuditSummary');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'JSON');

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "departmentId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "credentialHash" TEXT,
    "role" "AccountRole" NOT NULL,
    "userId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "hostname" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "operatingSystem" TEXT,
    "osVersion" TEXT,
    "cpu" TEXT,
    "ramBytes" DOUBLE PRECISION,
    "storageBytes" DOUBLE PRECISION,
    "ipv4" TEXT,
    "macAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "location" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "notes" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "assetTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "serialNumber" TEXT,
    "ownerId" TEXT,
    "departmentId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'New',
    "requesterId" TEXT NOT NULL,
    "departmentId" TEXT,
    "categoryId" TEXT NOT NULL,
    "assigneeAccountId" TEXT,
    "assetId" TEXT,
    "slaPolicyId" TEXT NOT NULL,
    "solution" TEXT,
    "waitingReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorAccountId" TEXT,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketHistory" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorAccountId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" "TicketStatus",
    "toStatus" "TicketStatus",
    "previousVersion" INTEGER NOT NULL,
    "newVersion" INTEGER NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "responseTargetMinutes" INTEGER NOT NULL,
    "resolutionTargetMinutes" INTEGER NOT NULL,
    "atRiskThresholdMinutes" INTEGER NOT NULL,
    "waitingThirdPartyPauses" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSla" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "slaPolicyId" TEXT NOT NULL,
    "responseDueAt" TIMESTAMP(3) NOT NULL,
    "resolutionDueAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolutionStoppedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "totalPausedSeconds" INTEGER NOT NULL DEFAULT 0,
    "responseBreachedAt" TIMESTAMP(3),
    "resolutionBreachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketSla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticAction" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" "DiagnosticCategory" NOT NULL,
    "version" INTEGER NOT NULL,
    "scriptPath" TEXT NOT NULL,
    "scriptHash" TEXT NOT NULL,
    "requiredPermission" TEXT NOT NULL,
    "parameterSchema" JSONB NOT NULL,
    "outputSchema" JSONB NOT NULL,
    "timeoutMs" INTEGER NOT NULL,
    "maxOutputBytes" INTEGER NOT NULL,
    "requiresElevation" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityCase" (
    "id" TEXT NOT NULL,
    "securityCaseCode" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" "SecuritySeverity" NOT NULL,
    "status" "SecurityCaseStatus" NOT NULL DEFAULT 'New',
    "reason" TEXT NOT NULL,
    "assignedAnalystId" TEXT,
    "assetId" TEXT,
    "createdById" TEXT NOT NULL,
    "resolutionSummary" TEXT,
    "classification" TEXT,
    "lessonsLearned" TEXT,
    "falsePositiveReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvidence" (
    "evidenceId" TEXT NOT NULL,
    "securityCaseId" TEXT NOT NULL,
    "type" "SecurityEvidenceType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceReference" TEXT,
    "snapshot" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvidence_pkey" PRIMARY KEY ("evidenceId")
);

-- CreateTable
CREATE TABLE "SecurityTimelineEntry" (
    "id" TEXT NOT NULL,
    "securityCaseId" TEXT NOT NULL,
    "actorAccountId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityTimelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorRoleSnapshot" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "requestId" TEXT,
    "correlationId" TEXT,
    "changedFields" JSONB,
    "metadata" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationOutbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'Pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "filters" JSONB NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'Queued',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "rowCount" INTEGER,
    "errorCode" TEXT,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "articleCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "symptoms" TEXT NOT NULL,
    "diagnosticSteps" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "validationSteps" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "authorAccountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticleTicket" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticleTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentState" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalEndpoint" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "registeredBy" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticWorkerState" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "heartbeatAt" TIMESTAMP(3) NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "engine" TEXT,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,

    CONSTRAINT "DiagnosticWorkerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticJob" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "actionRecordId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Queued',
    "parameters" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestId" TEXT,
    "correlationId" TEXT,
    "scriptVersion" INTEGER NOT NULL,
    "scriptHash" TEXT NOT NULL,
    "engine" TEXT,
    "outputBytes" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "exitCode" INTEGER,
    "errorCode" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "owner" TEXT,
    "sourceMode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticResult" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceMode" TEXT NOT NULL,
    "redactionCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WindowsEvent" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "eventId" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WindowsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE INDEX "Department_archivedAt_idx" ON "Department"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_departmentId_archivedAt_idx" ON "User"("departmentId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_key" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Account_role_archivedAt_idx" ON "Account"("role", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_accountId_revokedAt_expiresAt_idx" ON "Session"("accountId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetCode_key" ON "Asset"("assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetTag_key" ON "Asset"("assetTag");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_serialNumber_key" ON "Asset"("serialNumber");

-- CreateIndex
CREATE INDEX "Asset_departmentId_archivedAt_idx" ON "Asset"("departmentId", "archivedAt");

-- CreateIndex
CREATE INDEX "Asset_ownerId_idx" ON "Asset"("ownerId");

-- CreateIndex
CREATE INDEX "Asset_status_archivedAt_idx" ON "Asset"("status", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketCategory_code_key" ON "TicketCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TicketCategory_name_key" ON "TicketCategory"("name");

-- CreateIndex
CREATE INDEX "TicketCategory_archivedAt_idx" ON "TicketCategory"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");

-- CreateIndex
CREATE INDEX "Ticket_status_priority_createdAt_idx" ON "Ticket"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_idx" ON "Ticket"("requesterId");

-- CreateIndex
CREATE INDEX "Ticket_departmentId_status_idx" ON "Ticket"("departmentId", "status");

-- CreateIndex
CREATE INDEX "Ticket_assigneeAccountId_status_idx" ON "Ticket"("assigneeAccountId", "status");

-- CreateIndex
CREATE INDEX "Ticket_categoryId_idx" ON "Ticket"("categoryId");

-- CreateIndex
CREATE INDEX "Ticket_assetId_idx" ON "Ticket"("assetId");

-- CreateIndex
CREATE INDEX "TicketComment_ticketId_createdAt_idx" ON "TicketComment"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketComment_authorAccountId_idx" ON "TicketComment"("authorAccountId");

-- CreateIndex
CREATE INDEX "TicketHistory_ticketId_createdAt_idx" ON "TicketHistory"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketHistory_actorAccountId_idx" ON "TicketHistory"("actorAccountId");

-- CreateIndex
CREATE INDEX "SlaPolicy_priority_effectiveFrom_retiredAt_idx" ON "SlaPolicy"("priority", "effectiveFrom", "retiredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicy_name_version_priority_key" ON "SlaPolicy"("name", "version", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSla_ticketId_key" ON "TicketSla"("ticketId");

-- CreateIndex
CREATE INDEX "TicketSla_responseDueAt_idx" ON "TicketSla"("responseDueAt");

-- CreateIndex
CREATE INDEX "TicketSla_resolutionDueAt_idx" ON "TicketSla"("resolutionDueAt");

-- CreateIndex
CREATE INDEX "TicketSla_slaPolicyId_idx" ON "TicketSla"("slaPolicyId");

-- CreateIndex
CREATE INDEX "DiagnosticAction_category_enabled_idx" ON "DiagnosticAction"("category", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticAction_actionId_version_key" ON "DiagnosticAction"("actionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityCase_securityCaseCode_key" ON "SecurityCase"("securityCaseCode");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityCase_ticketId_key" ON "SecurityCase"("ticketId");

-- CreateIndex
CREATE INDEX "SecurityCase_status_severity_createdAt_idx" ON "SecurityCase"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityCase_assignedAnalystId_status_idx" ON "SecurityCase"("assignedAnalystId", "status");

-- CreateIndex
CREATE INDEX "SecurityCase_assetId_status_idx" ON "SecurityCase"("assetId", "status");

-- CreateIndex
CREATE INDEX "SecurityCase_updatedAt_idx" ON "SecurityCase"("updatedAt");

-- CreateIndex
CREATE INDEX "SecurityEvidence_securityCaseId_createdAt_idx" ON "SecurityEvidence"("securityCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvidence_type_createdAt_idx" ON "SecurityEvidence"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityEvidence_securityCaseId_type_sourceReference_key" ON "SecurityEvidence"("securityCaseId", "type", "sourceReference");

-- CreateIndex
CREATE INDEX "SecurityTimelineEntry_securityCaseId_timestamp_idx" ON "SecurityTimelineEntry"("securityCaseId", "timestamp");

-- CreateIndex
CREATE INDEX "SecurityTimelineEntry_actorAccountId_timestamp_idx" ON "SecurityTimelineEntry"("actorAccountId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_occurredAt_idx" ON "AuditEvent"("resourceType", "resourceId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_occurredAt_idx" ON "AuditEvent"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationOutbox_eventId_key" ON "IntegrationOutbox"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationOutbox_idempotencyKey_key" ON "IntegrationOutbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IntegrationOutbox_status_availableAt_idx" ON "IntegrationOutbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "ExportJob_requestedBy_requestedAt_idx" ON "ExportJob"("requestedBy", "requestedAt");

-- CreateIndex
CREATE INDEX "ExportJob_status_requestedAt_idx" ON "ExportJob"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "ExportJob_expiresAt_idx" ON "ExportJob"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceCounter_scope_year_key" ON "SequenceCounter"("scope", "year");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_articleCode_key" ON "KnowledgeArticle"("articleCode");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_status_updatedAt_idx" ON "KnowledgeArticle"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_categoryId_status_idx" ON "KnowledgeArticle"("categoryId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeArticleTicket_articleId_idx" ON "KnowledgeArticleTicket"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticleTicket_ticketId_articleId_key" ON "KnowledgeArticleTicket"("ticketId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalEndpoint_assetId_key" ON "LocalEndpoint"("assetId");

-- CreateIndex
CREATE INDEX "DiagnosticJob_status_requestedAt_idx" ON "DiagnosticJob"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "DiagnosticJob_assetId_requestedAt_idx" ON "DiagnosticJob"("assetId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticJob_requestedBy_idempotencyKey_key" ON "DiagnosticJob"("requestedBy", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticResult_jobId_key" ON "DiagnosticResult"("jobId");

-- CreateIndex
CREATE INDEX "DiagnosticResult_assetId_collectedAt_idx" ON "DiagnosticResult"("assetId", "collectedAt");

-- CreateIndex
CREATE INDEX "DiagnosticResult_expiresAt_idx" ON "DiagnosticResult"("expiresAt");

-- CreateIndex
CREATE INDEX "WindowsEvent_resultId_timestamp_idx" ON "WindowsEvent"("resultId", "timestamp");

-- CreateIndex
CREATE INDEX "WindowsEvent_expiresAt_idx" ON "WindowsEvent"("expiresAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TicketCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assigneeAccountId_fkey" FOREIGN KEY ("assigneeAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_authorAccountId_fkey" FOREIGN KEY ("authorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketHistory" ADD CONSTRAINT "TicketHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketHistory" ADD CONSTRAINT "TicketHistory_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSla" ADD CONSTRAINT "TicketSla_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSla" ADD CONSTRAINT "TicketSla_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityCase" ADD CONSTRAINT "SecurityCase_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityCase" ADD CONSTRAINT "SecurityCase_assignedAnalystId_fkey" FOREIGN KEY ("assignedAnalystId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityCase" ADD CONSTRAINT "SecurityCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityCase" ADD CONSTRAINT "SecurityCase_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvidence" ADD CONSTRAINT "SecurityEvidence_securityCaseId_fkey" FOREIGN KEY ("securityCaseId") REFERENCES "SecurityCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvidence" ADD CONSTRAINT "SecurityEvidence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityTimelineEntry" ADD CONSTRAINT "SecurityTimelineEntry_securityCaseId_fkey" FOREIGN KEY ("securityCaseId") REFERENCES "SecurityCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityTimelineEntry" ADD CONSTRAINT "SecurityTimelineEntry_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_authorAccountId_fkey" FOREIGN KEY ("authorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TicketCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleTicket" ADD CONSTRAINT "KnowledgeArticleTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticleTicket" ADD CONSTRAINT "KnowledgeArticleTicket_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticJob" ADD CONSTRAINT "DiagnosticJob_actionRecordId_fkey" FOREIGN KEY ("actionRecordId") REFERENCES "DiagnosticAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticResult" ADD CONSTRAINT "DiagnosticResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DiagnosticJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowsEvent" ADD CONSTRAINT "WindowsEvent_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "DiagnosticResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
