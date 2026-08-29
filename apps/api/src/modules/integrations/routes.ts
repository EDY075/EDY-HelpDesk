import { existsSync } from "node:fs";
import path from "node:path";
import { Router } from "express";
import { createAnalyticsIntegrationExportSchema, settingsOverviewSchema } from "@edy/contracts";
import type { AppConfig } from "@edy/config";
import type { DatabaseClient } from "../../platform/prisma.js";
import { HttpError } from "../../platform/errors.js";
import type { AppendOnlyAuditRepository } from "../audit/audit-repository.js";
import { authorize } from "../auth/rbac.js";
import { createAnalyticsIntegrationExport } from "./analytics-export.js";
import { buildIntegrationOverview } from "./status.js";

const creationRate = new Map<string, number[]>();
export function resetIntegrationRateLimitsForTests(): void { creationRate.clear(); }
function enforceCreationRate(accountId: string): void {
  const now = Date.now(); const current = (creationRate.get(accountId) ?? []).filter((item) => item > now - 60_000);
  if (current.length >= 5) throw new HttpError(429, "Too Many Requests", "Analytics export creation is limited to five requests per minute.");
  current.push(now); creationRate.set(accountId, current);
}
function projectRoot(): string {
  let current = path.resolve(process.cwd());
  while (!existsSync(path.join(current, "prisma", "schema.prisma"))) { const parent = path.dirname(current); if (parent === current) throw new Error("EDY HelpDesk project root could not be resolved"); current = parent; }
  return current;
}

export function createIntegrationsRouter(db: DatabaseClient, audit: AppendOnlyAuditRepository, config: AppConfig, version: string, exportRootOverride?: string): Router {
  const router = Router(); const exportRoot = exportRootOverride ?? path.join(projectRoot(), "storage", "analytics-export");
  router.get("/integrations", authorize("integrations.read", audit), async (_req, res) => res.json(await buildIntegrationOverview(db, config)));
  router.get("/settings", authorize("settings.read", audit), (_req, res) => res.json(settingsOverviewSchema.parse({
    application: { version, mode: config.PORTFOLIO_DEMO ? "Demo" : "Operational", databaseProvider: config.DATABASE_PROVIDER },
    session: { idleMinutes: config.SESSION_IDLE_MINUTES, absoluteHours: config.SESSION_ABSOLUTE_HOURS, cookies: { httpOnly: true, sameSite: "strict", secureInProduction: true } },
    diagnostics: { workerIsolated: true, realExecutionEnabled: !config.PORTFOLIO_DEMO, elevationAllowed: false, arbitraryCommandsAllowed: false },
    integrations: { externalEnabled: config.INTEGRATION_SENTINEL_ENABLED || config.INTEGRATION_SIEM_ENABLED || config.INTEGRATION_ANALYTICS_ENABLED, portfolioDemoLock: config.PORTFOLIO_DEMO },
  })));
  router.post("/integrations/analytics/exports", authorize("integrations.manage", audit), async (req, res) => {
    enforceCreationRate(req.auth!.accountId);
    const parsed = createAnalyticsIntegrationExportSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Bad Request", parsed.error.issues[0]?.message ?? "Invalid analytics export request.");
    const result = await createAnalyticsIntegrationExport(db, exportRoot, parsed.data.dataset);
    await audit.append({ actorId: req.auth!.accountId, actorType: "account", actorRoleSnapshot: req.auth!.role, action: "integration.analytics_export.created", resourceType: "analyticsExport", resourceId: result.fileName, outcome: "success", requestId: req.requestId, correlationId: req.correlationId, metadata: { dataset: parsed.data.dataset, recordCount: result.recordCount, fileSize: result.fileSize, sha256: result.sha256 } });
    res.status(201).json(result);
  });
  return router;
}
