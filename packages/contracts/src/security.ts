import { z } from "zod";

export const securitySeverities = ["Low", "Medium", "High", "Critical"] as const;
export const securityCaseStatuses = ["New", "Triaged", "Investigating", "Contained", "Resolved", "Closed", "FalsePositive"] as const;
export const securityEvidenceTypes = ["TicketContext", "DiagnosticFinding", "EventLog", "ManualNote"] as const;
export const securityCaseSorts = ["newest", "oldest", "severity", "recentlyUpdated"] as const;

export const securitySeveritySchema = z.enum(securitySeverities);
export const securityCaseStatusSchema = z.enum(securityCaseStatuses);
export const securityEvidenceTypeSchema = z.enum(securityEvidenceTypes);

const noMarkupOrControls = (value: string) =>
  !/[<>]/u.test(value) && ![...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  });

export const securityTextSchema = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum).refine(noMarkupOrControls, "Text contains markup or unsupported control characters.");

export const securityEscalationRequestSchema = z.object({
  reason: securityTextSchema(3, 2_000),
  severity: securitySeveritySchema,
  summary: securityTextSchema(3, 5_000),
  importantDiagnosticFindings: z.array(z.string().uuid()).max(20).optional(),
}).strict();

export const securityAssignmentRequestSchema = z.object({
  version: z.number().int().min(1),
  assignedAnalystId: z.string().uuid().nullable(),
}).strict();

export const securitySeverityRequestSchema = z.object({
  version: z.number().int().min(1),
  severity: securitySeveritySchema,
  reason: securityTextSchema(3, 1_000),
}).strict();

export const securityTransitionRequestSchema = z.object({
  version: z.number().int().min(1),
  status: securityCaseStatusSchema,
  reason: securityTextSchema(3, 2_000).optional(),
}).strict();

export const securityEvidenceRequestSchema = z.discriminatedUnion("type", [
  z.object({ version: z.number().int().min(1), type: z.literal("ManualNote"), title: securityTextSchema(2, 200), summary: securityTextSchema(2, 5_000), source: securityTextSchema(2, 200).default("Analyst") }).strict(),
  z.object({ version: z.number().int().min(1), type: z.literal("DiagnosticFinding"), diagnosticJobId: z.string().uuid(), title: securityTextSchema(2, 200).optional() }).strict(),
  z.object({ version: z.number().int().min(1), type: z.literal("EventLog"), windowsEventId: z.string().uuid(), title: securityTextSchema(2, 200).optional() }).strict(),
]);

export const securityResolutionRequestSchema = z.object({
  version: z.number().int().min(1),
  resolutionSummary: securityTextSchema(3, 5_000),
  classification: securityTextSchema(2, 200).optional(),
  lessonsLearned: securityTextSchema(3, 5_000).optional(),
}).strict();

export const securityFalsePositiveRequestSchema = z.object({
  version: z.number().int().min(1),
  reason: securityTextSchema(3, 2_000),
}).strict();

export const securityCaseQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: securityCaseStatusSchema.optional(),
  severity: securitySeveritySchema.optional(),
  assignedAnalystId: z.string().uuid().optional(),
  sourceCategory: z.string().trim().max(100).optional(),
  assetId: z.string().uuid().optional(),
  createdFrom: z.string().datetime({ offset: true }).optional(),
  createdTo: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(securityCaseSorts).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const siemEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(["security.case.created", "security.case.updated", "security.case.evidence_added", "security.case.resolved"]),
  schemaVersion: z.literal(1),
  occurredAt: z.string().datetime({ offset: true }),
  source: z.literal("edy-helpdesk"),
  correlationId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(250),
  payload: z.object({
    caseCode: z.string().regex(/^SEC-\d{4}-\d{6}$/u),
    sourceTicketCode: z.string().regex(/^HD-\d{4}-\d{6}$/u),
    severity: securitySeveritySchema,
    status: securityCaseStatusSchema,
    summary: z.string().max(5_000),
    asset: z.object({ reference: z.string().regex(/^asset_[0-9a-f]{16}$/u) }).strict().nullable(),
    evidenceSummaries: z.array(z.object({ type: securityEvidenceTypeSchema, summary: z.string().max(5_000) })).max(100),
    timelineTimestamps: z.array(z.string().datetime({ offset: true })).max(500),
    correlationId: z.string().uuid(),
  }).strict(),
}).strict();

export type SecuritySeverity = z.infer<typeof securitySeveritySchema>;
export type SecurityCaseStatus = z.infer<typeof securityCaseStatusSchema>;
export type SecurityEvidenceType = z.infer<typeof securityEvidenceTypeSchema>;
export type SecurityEscalationRequest = z.infer<typeof securityEscalationRequestSchema>;
export type SecurityEvidenceRequest = z.infer<typeof securityEvidenceRequestSchema>;
export type SiemEnvelope = z.infer<typeof siemEnvelopeSchema>;
