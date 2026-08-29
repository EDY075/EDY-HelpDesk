import { describe, expect, it } from "vitest";
import {
  securityCaseQuerySchema,
  securityEscalationRequestSchema,
  securityEvidenceRequestSchema,
  securitySeveritySchema,
  siemEnvelopeSchema,
} from "./security.js";

describe("Phase 5 security contracts", () => {
  it("accepts only the four approved severity values", () => {
    for (const value of ["Low", "Medium", "High", "Critical"]) expect(securitySeveritySchema.parse(value)).toBe(value);
    expect(securitySeveritySchema.safeParse("Emergency").success).toBe(false);
  });

  it("rejects markup and unknown escalation fields", () => {
    expect(securityEscalationRequestSchema.safeParse({ reason: "<b>review</b>", severity: "High", summary: "Review" }).success).toBe(false);
    expect(securityEscalationRequestSchema.safeParse({ reason: "Review required", severity: "High", summary: "Synthetic context", command: "whoami" }).success).toBe(false);
  });

  it("models each evidence type without raw output", () => {
    expect(securityEvidenceRequestSchema.safeParse({ version: 1, type: "ManualNote", title: "Review", summary: "Sanitized note", source: "Analyst" }).success).toBe(true);
    expect(securityEvidenceRequestSchema.safeParse({ version: 1, type: "TicketContext", title: "Forged context", summary: "Client supplied" }).success).toBe(false);
    expect(securityEvidenceRequestSchema.safeParse({ version: 1, type: "DiagnosticFinding", diagnosticJobId: "10000000-0000-4000-8000-000000000001", stdout: "forbidden" }).success).toBe(false);
    expect(securityEvidenceRequestSchema.safeParse({ version: 1, type: "EventLog", windowsEventId: "10000000-0000-4000-8000-000000000002" }).success).toBe(true);
  });

  it("bounds filtering and pagination", () => {
    expect(securityCaseQuerySchema.parse({ page: "2", pageSize: "20", sort: "severity" })).toMatchObject({ page: 2, pageSize: 20, sort: "severity" });
    expect(securityCaseQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });

  it("keeps the SIEM envelope minimal and versioned", () => {
    const correlationId = "10000000-0000-4000-8000-000000000003";
    const value = { eventId: "10000000-0000-4000-8000-000000000004", eventType: "security.case.created", schemaVersion: 1, occurredAt: new Date().toISOString(), source: "edy-helpdesk", correlationId, idempotencyKey: "case-created", payload: { caseCode: "SEC-2026-000001", sourceTicketCode: "HD-2026-000001", severity: "High", status: "New", summary: "Sanitized", asset: null, evidenceSummaries: [], timelineTimestamps: [], correlationId } };
    expect(siemEnvelopeSchema.safeParse(value).success).toBe(true);
    expect(siemEnvelopeSchema.safeParse({ ...value, payload: { ...value.payload, password: "forbidden" } }).success).toBe(false);
    expect(siemEnvelopeSchema.safeParse({ ...value, payload: { ...value.payload, asset: { id: correlationId, assetCode: "AST-1", hostname: "private-host" } } }).success).toBe(false);
    expect(siemEnvelopeSchema.safeParse({ ...value, payload: { ...value.payload, asset: { reference: "asset_0123456789abcdef" } } }).success).toBe(true);
  });
});
