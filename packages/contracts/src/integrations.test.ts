import { describe, expect, it } from "vitest";

import {
  analyticsIntegrationEnvelopeSchema,
  integrationOverviewSchema,
  settingsOverviewSchema,
} from "./integrations.js";

describe("Phase 7 integration contracts", () => {
  it("keeps integration status honest and strict", () => {
    const value = {
      mode: "Demo",
      integrations: [
        { id: "sentinel", name: "EDY Sentinel", status: "Unavailable", enabled: false, configured: false, contractVersion: null, lastSuccessfulCommunication: null, lastError: "Canonical project unavailable.", description: "No compatible endpoint was found.", actions: { testConnection: false, enable: false, disable: false, createLocalExport: false } },
        { id: "siem", name: "EDY SIEM", status: "Incompatible", enabled: false, configured: false, contractVersion: "HelpDesk SIEM v1", lastSuccessfulCommunication: null, lastError: "Contract mismatch.", description: "Delivery remains fail-closed.", actions: { testConnection: false, enable: false, disable: false, createLocalExport: false } },
        { id: "analytics", name: "EDY SOC Analytics", status: "ExportReady", enabled: false, configured: true, contractVersion: "1", lastSuccessfulCommunication: null, lastError: null, description: "Local minimized exports are available.", actions: { testConnection: false, enable: false, disable: false, createLocalExport: true } },
      ],
      outbox: { pending: 3, failed: 0, deadLetter: 0, processed: 0 },
    } as const;

    expect(integrationOverviewSchema.parse(value).integrations.some((item) => item.status === "Connected")).toBe(false);
    expect(integrationOverviewSchema.safeParse({ ...value, token: "forbidden" }).success).toBe(false);
  });

  it("requires analytics recordCount to match records", () => {
    const value = { schemaVersion: 1, generatedAt: "2026-08-28T15:00:00.000Z", source: "edy-helpdesk", dataset: "Tickets", recordCount: 1, records: [] };
    expect(analyticsIntegrationEnvelopeSchema.safeParse(value).success).toBe(false);
    expect(analyticsIntegrationEnvelopeSchema.safeParse({ ...value, recordCount: 0 }).success).toBe(true);
  });

  it("exposes only real and non-secret settings", () => {
    const value = {
      application: { version: "1.0.0", mode: "Demo", databaseProvider: "sqlite" },
      session: { idleMinutes: 30, absoluteHours: 12, cookies: { httpOnly: true, sameSite: "strict", secureInProduction: true } },
      diagnostics: { workerIsolated: true, realExecutionEnabled: false, elevationAllowed: false, arbitraryCommandsAllowed: false },
      integrations: { externalEnabled: false, portfolioDemoLock: true },
    } as const;
    expect(settingsOverviewSchema.safeParse(value).success).toBe(true);
    expect(settingsOverviewSchema.safeParse({ ...value, databaseUrl: "forbidden" }).success).toBe(false);
  });
});
