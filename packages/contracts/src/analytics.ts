import { z } from "zod";

export const analyticsSchemaVersion = 1 as const;
export const analyticsDatasetSchema = z.enum([
  "Tickets", "SLAs", "Assets", "Diagnostics", "Knowledge", "SecurityCases", "Calendar",
]);
export const analyticsEnvelopeSchema = z.object({
  schemaVersion: z.literal(analyticsSchemaVersion),
  generatedAt: z.string().datetime({ offset: true }),
  source: z.literal("edy-helpdesk"),
  dataset: analyticsDatasetSchema,
  records: z.array(z.record(z.unknown())),
}).strict();

export const reportTypeSchema = z.enum([
  "TicketReport", "SlaReport", "AssetReport", "DiagnosticReport",
  "KnowledgeReport", "SecurityCaseReport", "AuditSummary",
]);
export const exportFormatSchema = z.enum(["CSV", "JSON"]);
export const exportJobStatusSchema = z.enum(["Queued", "Running", "Succeeded", "Failed", "Expired"]);
export const datePresetSchema = z.enum(["today", "7d", "30d", "custom"]);

export const dateRangeQuerySchema = z.object({
  range: datePresetSchema.default("7d"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
}).strict().superRefine((value, context) => {
  if (value.range === "custom" && (!value.from || !value.to)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Custom ranges require from and to dates." });
  }
});

export const reportFiltersSchema = z.object({
  range: datePresetSchema.default("30d"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  status: z.string().trim().max(64).optional(),
  priority: z.string().trim().max(64).optional(),
}).strict();

export const createReportJobSchema = z.object({
  reportType: reportTypeSchema,
  format: exportFormatSchema,
  filters: reportFiltersSchema.default({ range: "30d" }),
}).strict();

export type AnalyticsEnvelope = z.infer<typeof analyticsEnvelopeSchema>;
export type ReportType = z.infer<typeof reportTypeSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type ExportJobStatus = z.infer<typeof exportJobStatusSchema>;
