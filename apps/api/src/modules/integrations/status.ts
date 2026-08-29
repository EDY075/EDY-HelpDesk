import type { AppConfig } from "@edy/config";
import { integrationOverviewSchema } from "@edy/contracts";
import type { DatabaseClient } from "../../platform/prisma.js";

export async function buildIntegrationOverview(db: DatabaseClient, config: AppConfig) {
  const [groups, lastExport] = await Promise.all([
    db.integrationOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
    db.auditEvent.findFirst({ where: { action: "integration.analytics_export.created", outcome: "success" }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
  ]);
  const counts = Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  const mode = config.PORTFOLIO_DEMO ? "Demo" : "Operational";
  return integrationOverviewSchema.parse({ mode, integrations: [
    {
      id: "sentinel", name: "EDY Sentinel", status: "Unavailable", enabled: config.INTEGRATION_SENTINEL_ENABLED,
      configured: Boolean(config.INTEGRATION_SENTINEL_URL && config.INTEGRATION_SENTINEL_TOKEN), contractVersion: null,
      lastSuccessfulCommunication: null, lastError: "Canonical project and endpoint contract were not found.",
      description: "Endpoint context integration is blocked until a real Sentinel contract is approved.",
      actions: { testConnection: false, enable: false, disable: false, createLocalExport: false },
    },
    {
      id: "siem", name: "EDY SIEM", status: "Incompatible", enabled: config.INTEGRATION_SIEM_ENABLED,
      configured: Boolean(config.INTEGRATION_SIEM_URL && config.INTEGRATION_SIEM_TOKEN), contractVersion: "HelpDesk SIEM v1",
      lastSuccessfulCommunication: null, lastError: "EDY SIEM 0.3.0 only exposes the EDY Shield event contract.",
      description: "SecurityCase delivery is fail-closed; no payload is sent to the Shield ingestion endpoint.",
      actions: { testConnection: false, enable: false, disable: false, createLocalExport: false },
    },
    {
      id: "analytics", name: "EDY SOC Analytics", status: "ExportReady", enabled: config.INTEGRATION_ANALYTICS_ENABLED,
      configured: true, contractVersion: "1", lastSuccessfulCommunication: lastExport?.occurredAt.toISOString() ?? null, lastError: null,
      description: "Versioned minimized JSON exports are ready locally; no Power BI project is connected.",
      actions: { testConnection: false, enable: false, disable: false, createLocalExport: true },
    },
  ], outbox: { pending: counts.Pending ?? 0, failed: counts.Failed ?? 0, deadLetter: counts.DeadLetter ?? 0, processed: counts.Processed ?? 0 } });
}
