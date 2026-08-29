import { z } from "zod";
import { analyticsDatasetSchema } from "./analytics.js";

export const integrationIdSchema = z.enum(["sentinel", "siem", "analytics"]);
export const integrationStatusSchema = z.enum(["Disabled", "Ready", "Connected", "Error", "Incompatible", "Unavailable", "ExportReady"]);

export const integrationSummarySchema = z.object({
  id: integrationIdSchema,
  name: z.string().min(1).max(80),
  status: integrationStatusSchema,
  enabled: z.boolean(),
  configured: z.boolean(),
  contractVersion: z.string().min(1).max(32).nullable(),
  lastSuccessfulCommunication: z.string().datetime({ offset: true }).nullable(),
  lastError: z.string().min(1).max(240).nullable(),
  description: z.string().min(1).max(500),
  actions: z.object({
    testConnection: z.boolean(),
    enable: z.boolean(),
    disable: z.boolean(),
    createLocalExport: z.boolean(),
  }).strict(),
}).strict();

export const integrationOverviewSchema = z.object({
  mode: z.enum(["Demo", "Operational"]),
  integrations: z.array(integrationSummarySchema).length(3),
  outbox: z.object({
    pending: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    deadLetter: z.number().int().nonnegative(),
    processed: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const createAnalyticsIntegrationExportSchema = z.object({ dataset: analyticsDatasetSchema }).strict();
export const analyticsIntegrationEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  source: z.literal("edy-helpdesk"),
  dataset: analyticsDatasetSchema,
  recordCount: z.number().int().nonnegative(),
  records: z.array(z.record(z.unknown())),
}).strict().superRefine((value, context) => {
  if (value.recordCount !== value.records.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["recordCount"], message: "recordCount must match records.length" });
});

export const settingsOverviewSchema = z.object({
  application: z.object({ version: z.string().min(1), mode: z.enum(["Demo", "Operational"]), databaseProvider: z.enum(["sqlite", "postgresql"]) }).strict(),
  session: z.object({ idleMinutes: z.number().int().positive(), absoluteHours: z.number().int().positive(), cookies: z.object({ httpOnly: z.boolean(), sameSite: z.literal("strict"), secureInProduction: z.boolean() }).strict() }).strict(),
  diagnostics: z.object({ workerIsolated: z.literal(true), realExecutionEnabled: z.boolean(), elevationAllowed: z.literal(false), arbitraryCommandsAllowed: z.literal(false) }).strict(),
  integrations: z.object({ externalEnabled: z.boolean(), portfolioDemoLock: z.boolean() }).strict(),
}).strict();

export type IntegrationOverview = z.infer<typeof integrationOverviewSchema>;
export type IntegrationSummary = z.infer<typeof integrationSummarySchema>;
export type AnalyticsIntegrationEnvelope = z.infer<typeof analyticsIntegrationEnvelopeSchema>;
