import type { Prisma, PrismaClient, SecurityCaseStatus, SecuritySeverity } from "../apps/api/src/generated/prisma/client.js";

const caseFixtures: Array<{
  id: string;
  code: string;
  ticketNumber: string;
  title: string;
  summary: string;
  reason: string;
  severity: SecuritySeverity;
  status: SecurityCaseStatus;
  analyst: boolean;
  resolutionSummary?: string;
  falsePositiveReason?: string;
}> = [
  { id: "50000000-0000-4000-8000-000000000001", code: "SEC-2026-000001", ticketNumber: "HD-2026-000007", title: "Suspicious account activity", summary: "An unfamiliar synthetic sign-in prompt requires analyst review.", reason: "The support report may be relevant to account security and needs a separate investigation record.", severity: "High", status: "Investigating", analyst: true },
  { id: "50000000-0000-4000-8000-000000000002", code: "SEC-2026-000002", ticketNumber: "HD-2026-000004", title: "Repeated application failure requiring review", summary: "Repeated synthetic application failures are being reviewed for an operational or security explanation.", reason: "The repeated failure pattern warrants documented triage without assuming malicious activity.", severity: "Medium", status: "Triaged", analyst: true },
  { id: "50000000-0000-4000-8000-000000000003", code: "SEC-2026-000003", ticketNumber: "HD-2026-000001", title: "Potential unauthorized access", summary: "A synthetic access observation was escalated for validation; no attack has been confirmed.", reason: "The network access report requires analyst validation and preserved evidence.", severity: "Critical", status: "New", analyst: false },
  { id: "50000000-0000-4000-8000-000000000004", code: "SEC-2026-000004", ticketNumber: "HD-2026-000005", title: "Endpoint network anomaly requiring validation", summary: "A synthetic endpoint observation was reviewed and resolved without technical containment.", reason: "The endpoint context required a durable review trail.", severity: "Low", status: "Resolved", analyst: true, resolutionSummary: "Reviewed the synthetic endpoint context and documented the support conclusion." },
  { id: "50000000-0000-4000-8000-000000000005", code: "SEC-2026-000005", ticketNumber: "HD-2026-000002", title: "Synthetic access prompt review", summary: "A synthetic access prompt was classified as an expected training condition.", reason: "The prompt required validation before returning the ticket to normal support handling.", severity: "Low", status: "FalsePositive", analyst: true, falsePositiveReason: "Confirmed as expected synthetic Portfolio Demo behavior." },
];

export async function seedPhase5(db: PrismaClient): Promise<void> {
  const deployment = await db.deploymentState.findUnique({ where: { id: "local" } });
  if (deployment?.mode === "Operational") throw new Error("DEMO_SEED_DENIED");
  const admin = await db.account.findUnique({ where: { username: "demo.admin" } });
  const technician = await db.account.findUnique({ where: { username: "demo.technician" } });
  if (!admin || !technician) return;
  const diagnosticAsset = await db.asset.findUnique({ where: { assetTag: "DEMO-P3-FIN" } });

  for (const [index, fixture] of caseFixtures.entries()) {
    let ticket = await db.ticket.findUnique({ where: { ticketNumber: fixture.ticketNumber } });
    if (!ticket) continue;
    if (fixture.ticketNumber === "HD-2026-000007" && diagnosticAsset && ticket.assetId !== diagnosticAsset.id) {
      ticket = await db.ticket.update({ where: { id: ticket.id }, data: { assetId: diagnosticAsset.id } });
    }
    const createdAt = new Date(Date.now() - (index + 1) * 3_600_000);
    const resolvedAt = ["Resolved", "FalsePositive", "Closed"].includes(fixture.status) ? new Date(createdAt.getTime() + 1_800_000) : null;
    const item = await db.securityCase.upsert({
      where: { ticketId: ticket.id },
      update: {},
      create: {
        id: fixture.id,
        securityCaseCode: fixture.code,
        ticketId: ticket.id,
        title: fixture.title,
        summary: fixture.summary,
        severity: fixture.severity,
        status: fixture.status,
        reason: fixture.reason,
        assignedAnalystId: fixture.analyst ? technician.id : null,
        assetId: ticket.assetId,
        createdById: admin.id,
        resolutionSummary: fixture.resolutionSummary,
        falsePositiveReason: fixture.falsePositiveReason,
        resolvedAt,
        createdAt,
      },
    });
    await db.securityEvidence.upsert({
      where: { securityCaseId_type_sourceReference: { securityCaseId: item.id, type: "TicketContext", sourceReference: ticket.id } },
      update: {},
      create: {
        evidenceId: `51000000-0000-4000-8000-00000000000${index + 1}`,
        securityCaseId: item.id,
        type: "TicketContext",
        title: `Source ticket ${ticket.ticketNumber}`,
        summary: `${ticket.title}: synthetic ticket context retained for analyst review.`,
        source: "EDY HelpDesk Portfolio Demo",
        sourceReference: ticket.id,
        snapshot: { synthetic: true, ticketCode: ticket.ticketNumber, priority: ticket.priority, status: ticket.status } as Prisma.InputJsonValue,
        createdById: admin.id,
        createdAt,
      },
    });
    await db.securityTimelineEntry.upsert({
      where: { id: `52000000-0000-4000-8000-00000000000${index + 1}` },
      update: {},
      create: { id: `52000000-0000-4000-8000-00000000000${index + 1}`, securityCaseId: item.id, actorAccountId: admin.id, action: "case.created", summary: `Escalated from ${ticket.ticketNumber}. Synthetic Demo Data.`, metadata: { synthetic: true }, timestamp: createdAt },
    });
    const correlationId = `53000000-0000-4000-8000-00000000000${index + 1}`;
    await db.integrationOutbox.upsert({
      where: { idempotencyKey: `synthetic-phase5:${fixture.code}:created` },
      update: {},
      create: {
        id: `54000000-0000-4000-8000-00000000000${index + 1}`,
        eventId: `55000000-0000-4000-8000-00000000000${index + 1}`,
        eventType: "security.case.created",
        schemaVersion: 1,
        occurredAt: createdAt,
        source: "edy-helpdesk",
        correlationId,
        idempotencyKey: `synthetic-phase5:${fixture.code}:created`,
        payload: { caseCode: fixture.code, sourceTicketCode: ticket.ticketNumber, severity: fixture.severity, status: fixture.status, summary: fixture.summary, asset: null, evidenceSummaries: [], timelineTimestamps: [createdAt.toISOString()], correlationId } as Prisma.InputJsonValue,
        status: "Pending",
      },
    });
  }
  const counter = await db.sequenceCounter.findUnique({ where: { scope_year: { scope: "security", year: 2026 } } });
  if (!counter) await db.sequenceCounter.create({ data: { scope: "security", year: 2026, value: caseFixtures.length } });
  else if (counter.value < caseFixtures.length) await db.sequenceCounter.update({ where: { id: counter.id }, data: { value: caseFixtures.length } });
}
