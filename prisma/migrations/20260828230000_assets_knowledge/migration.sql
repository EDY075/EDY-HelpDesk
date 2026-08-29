-- Additive migration: retain legacy asset tags and every historical FK.
ALTER TABLE "Asset" ADD COLUMN "assetCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Asset" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Asset" ADD COLUMN "hostname" TEXT;
ALTER TABLE "Asset" ADD COLUMN "manufacturer" TEXT;
ALTER TABLE "Asset" ADD COLUMN "model" TEXT;
ALTER TABLE "Asset" ADD COLUMN "operatingSystem" TEXT;
ALTER TABLE "Asset" ADD COLUMN "osVersion" TEXT;
ALTER TABLE "Asset" ADD COLUMN "cpu" TEXT;
ALTER TABLE "Asset" ADD COLUMN "ramBytes" REAL;
ALTER TABLE "Asset" ADD COLUMN "storageBytes" REAL;
ALTER TABLE "Asset" ADD COLUMN "ipv4" TEXT;
ALTER TABLE "Asset" ADD COLUMN "macAddress" TEXT;
ALTER TABLE "Asset" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Active';
ALTER TABLE "Asset" ADD COLUMN "location" TEXT;
ALTER TABLE "Asset" ADD COLUMN "purchaseDate" DATETIME;
ALTER TABLE "Asset" ADD COLUMN "warrantyUntil" DATETIME;
ALTER TABLE "Asset" ADD COLUMN "notes" TEXT;
ALTER TABLE "Asset" ADD COLUMN "lastSeenAt" DATETIME;
WITH numbered AS (SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS n FROM "Asset")
UPDATE "Asset" SET "assetCode" = 'AST-2026-' || printf('%06d', (SELECT n FROM numbered WHERE numbered.id = "Asset".id));
CREATE UNIQUE INDEX "Asset_assetCode_key" ON "Asset"("assetCode");
INSERT INTO "SequenceCounter"("id", "scope", "year", "value", "updatedAt")
VALUES ('phase3-asset-counter', 'asset', 2026, (SELECT COUNT(*) FROM "Asset"), CURRENT_TIMESTAMP)
ON CONFLICT("scope", "year") DO UPDATE SET "value" = MAX("value", excluded."value");
CREATE TRIGGER "Asset_code_immutable" BEFORE UPDATE OF "assetCode" ON "Asset"
WHEN OLD."assetCode" <> NEW."assetCode" BEGIN SELECT RAISE(ABORT, 'Asset code is immutable'); END;
CREATE TABLE "KnowledgeArticle" (
 "id" TEXT NOT NULL PRIMARY KEY, "articleCode" TEXT NOT NULL, "title" TEXT NOT NULL,
 "summary" TEXT NOT NULL, "problem" TEXT NOT NULL, "symptoms" TEXT NOT NULL,
 "diagnosticSteps" TEXT NOT NULL, "solution" TEXT NOT NULL, "validationSteps" TEXT NOT NULL,
 "categoryId" TEXT NOT NULL, "tags" TEXT NOT NULL DEFAULT '',
 "status" TEXT NOT NULL DEFAULT 'Draft' CHECK("status" IN ('Draft','Published','Archived')),
 "authorAccountId" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
 "publishedAt" DATETIME, "archivedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY("categoryId") REFERENCES "TicketCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY("authorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK (("status" = 'Archived') = ("archivedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "KnowledgeArticle_articleCode_key" ON "KnowledgeArticle"("articleCode");
CREATE INDEX "KnowledgeArticle_status_updatedAt_idx" ON "KnowledgeArticle"("status", "updatedAt");
CREATE INDEX "KnowledgeArticle_categoryId_status_idx" ON "KnowledgeArticle"("categoryId", "status");
CREATE TRIGGER "KnowledgeArticle_code_immutable" BEFORE UPDATE OF "articleCode" ON "KnowledgeArticle"
WHEN OLD."articleCode" <> NEW."articleCode" BEGIN SELECT RAISE(ABORT, 'Article code is immutable'); END;
CREATE TABLE "KnowledgeArticleTicket" (
 "id" TEXT NOT NULL PRIMARY KEY, "ticketId" TEXT NOT NULL, "articleId" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KnowledgeArticleTicket_ticketId_articleId_key" ON "KnowledgeArticleTicket"("ticketId", "articleId");
CREATE INDEX "KnowledgeArticleTicket_articleId_idx" ON "KnowledgeArticleTicket"("articleId");
