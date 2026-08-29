import type { DatabaseClient } from "../../platform/prisma.js";
import type { DateInterval } from "./date-range.js";

const OPEN_TICKETS = ["New", "Assigned", "InProgress", "WaitingUser", "WaitingThirdParty"] as const;
const OPEN_CASES = ["New", "Triaged", "Investigating", "Contained"] as const;

type Distribution = { label: string; value: number };
const mean = (values: number[]): number | null => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const percent = (part: number, total: number): number | null => total ? Number(((part / total) * 100).toFixed(1)) : null;
function distribution(values: string[], order: readonly string[] = []): Distribution[] {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts].sort(([a], [b]) => {
    const ai = order.indexOf(a); const bi = order.indexOf(b);
    return ai >= 0 || bi >= 0 ? (ai < 0 ? 1 : bi < 0 ? -1 : ai - bi) : a.localeCompare(b);
  }).map(([label, value]) => ({ label, value }));
}
function findingItems(value: unknown): Array<{ key?: string; label?: string; severity?: string; area?: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { key?: string; label?: string; severity?: string; area?: string } => typeof item === "object" && item !== null);
}

export async function buildAnalytics(db: DatabaseClient, accountId: string, interval: DateInterval) {
  const now = new Date();
  const inRange = { gte: interval.from, lt: interval.toExclusive };
  const [allOpen, rangedTickets, reopened, assets, diagnosticJobs, diagnosticResults, articles, securityCases, resolvedCases, recentTickets, recentJobs, recentCases, technicians, worker, mode] = await Promise.all([
    db.ticket.findMany({ where: { status: { in: [...OPEN_TICKETS] } }, include: { sla: { include: { slaPolicy: true } } } }),
    db.ticket.findMany({ where: { createdAt: inRange }, include: { category: true, department: true, assignee: { include: { user: true } }, sla: true } }),
    db.ticketHistory.count({ where: { action: "ticket.reopened", createdAt: inRange } }),
    db.asset.findMany({ where: { archivedAt: null }, include: { department: true } }),
    db.diagnosticJob.findMany({ where: { requestedAt: inRange }, include: { action: true, result: true } }),
    db.diagnosticResult.findMany({ where: { collectedAt: inRange, expiresAt: { gt: now } }, orderBy: { collectedAt: "desc" } }),
    db.knowledgeArticle.findMany({ include: { category: true, _count: { select: { ticketLinks: true } } } }),
    db.securityCase.findMany({ where: { createdAt: inRange }, include: { assignedAnalyst: { include: { user: true } } } }),
    db.securityCase.count({ where: { resolvedAt: inRange } }),
    db.ticket.findMany({ orderBy: { updatedAt: "desc" }, take: 6, select: { id: true, ticketNumber: true, title: true, status: true, priority: true, updatedAt: true } }),
    db.diagnosticJob.findMany({ orderBy: { requestedAt: "desc" }, take: 6, select: { id: true, actionId: true, status: true, requestedAt: true, assetId: true } }),
    db.securityCase.findMany({ orderBy: { updatedAt: "desc" }, take: 6, select: { id: true, securityCaseCode: true, title: true, severity: true, status: true, updatedAt: true } }),
    db.account.findMany({ where: { role: "Technician", archivedAt: null }, include: { user: true, assignedTickets: { where: { status: { in: [...OPEN_TICKETS] } }, select: { status: true } } } }),
    db.diagnosticWorkerState.findUnique({ where: { id: "local" } }),
    db.deploymentState.findUnique({ where: { id: "local" } }),
  ]);

  const slaState = (ticket: (typeof allOpen)[number]) => {
    if (!ticket.sla) return "No SLA";
    if (ticket.sla.pausedAt) return "Paused";
    const breached = Boolean(ticket.sla.responseBreachedAt || ticket.sla.resolutionBreachedAt) || now > ticket.sla.resolutionDueAt;
    if (breached) return "Breached";
    if (ticket.sla.resolutionDueAt.getTime() - now.getTime() <= ticket.sla.slaPolicy.atRiskThresholdMinutes * 60_000) return "At Risk";
    return "Within SLA";
  };
  const openStates = allOpen.map(slaState);
  const completed = rangedTickets.filter((ticket) => ticket.resolvedAt);
  const responseMinutes = rangedTickets.flatMap((ticket) => ticket.sla?.firstResponseAt ? [(ticket.sla.firstResponseAt.getTime() - ticket.createdAt.getTime()) / 60_000] : []);
  const resolutionMinutes = completed.map((ticket) => (ticket.resolvedAt!.getTime() - ticket.createdAt.getTime() - (ticket.sla?.totalPausedSeconds ?? 0) * 1_000) / 60_000);
  const slaResolved = completed.filter((ticket) => ticket.sla);
  const resolvedWithin = slaResolved.filter((ticket) => !ticket.sla!.resolutionBreachedAt && ticket.resolvedAt! <= ticket.sla!.resolutionDueAt).length;
  const latestResultByAsset = new Map<string, (typeof diagnosticResults)[number]>();
  diagnosticResults.forEach((result) => { if (!latestResultByAsset.has(result.assetId)) latestResultByAsset.set(result.assetId, result); });
  const latestFindings = [...latestResultByAsset.values()].flatMap((result) => findingItems(result.findings).map((finding) => ({ ...finding, assetId: result.assetId, collectedAt: result.collectedAt })));
  const commonFindings = distribution(latestFindings.map((finding) => finding.label ?? finding.key ?? "Structured finding")).sort((a, b) => b.value - a.value).slice(0, 6);
  const warningAssets = new Set(latestFindings.filter((finding) => finding.severity === "Warning").map((finding) => finding.assetId)).size;
  const criticalAssets = new Set(latestFindings.filter((finding) => finding.severity === "Critical").map((finding) => finding.assetId)).size;
  const staleThreshold = now.getTime() - 24 * 60 * 60_000;
  const diagnosedAssetIds = new Set(latestResultByAsset.keys());
  const staleDiagnostics = assets.filter((asset) => {
    const result = latestResultByAsset.get(asset.id);
    return diagnosedAssetIds.has(asset.id) && result!.collectedAt.getTime() < staleThreshold;
  }).length;
  const linkedArticles = articles.filter((article) => article._count.ticketLinks > 0);
  const linkedTickets = await db.knowledgeArticleTicket.groupBy({ by: ["ticketId"] });
  const openSecurity = await db.securityCase.findMany({ where: { status: { in: [...OPEN_CASES] } } });
  const unassigned = allOpen.filter((ticket) => !ticket.assigneeAccountId).length;
  const critical = allOpen.filter((ticket) => ticket.priority === "Critical").length;
  const slaAtRisk = openStates.filter((state) => state === "At Risk").length;
  const slaBreached = openStates.filter((state) => state === "Breached").length;

  return {
    range: { preset: interval.preset, from: interval.from.toISOString(), toExclusive: interval.toExclusive.toISOString(), displayFrom: interval.displayFrom, displayTo: interval.displayTo, timeZone: interval.timeZone },
    generatedAt: now.toISOString(),
    mode: mode?.mode ?? "Unknown",
    overview: { openTickets: allOpen.length, myTickets: allOpen.filter((ticket) => ticket.assigneeAccountId === accountId).length, unassignedTickets: unassigned, slaAtRisk, slaBreached, criticalTickets: critical, openSecurityCases: openSecurity.length, highCriticalSecurityCases: openSecurity.filter((item) => item.severity === "High" || item.severity === "Critical").length },
    support: { ticketsCreated: rangedTickets.length, ticketsResolved: completed.length, ticketsClosed: rangedTickets.filter((ticket) => ticket.closedAt).length, averageResolutionMinutes: mean(resolutionMinutes), averageFirstResponseMinutes: mean(responseMinutes), slaCompliancePercent: percent(resolvedWithin, slaResolved.length), reopenedTickets: reopened, unassignedTickets: unassigned },
    sla: { withinSla: openStates.filter((state) => state === "Within SLA").length, atRisk: slaAtRisk, breached: slaBreached, paused: openStates.filter((state) => state === "Paused").length, resolvedWithinSla: resolvedWithin, resolvedMeasured: slaResolved.length, compliancePercent: percent(resolvedWithin, slaResolved.length), distribution: distribution(openStates, ["Within SLA", "At Risk", "Breached", "Paused"]) },
    tickets: { byStatus: distribution(rangedTickets.map((ticket) => ticket.status), ["New", "Assigned", "InProgress", "WaitingUser", "WaitingThirdParty", "Resolved", "Closed"]), byPriority: distribution(rangedTickets.map((ticket) => ticket.priority), ["Low", "Medium", "High", "Critical"]), byCategory: distribution(rangedTickets.map((ticket) => ticket.category.name)), byDepartment: distribution(rangedTickets.map((ticket) => ticket.department?.name ?? "No department")), byTechnician: distribution(rangedTickets.map((ticket) => ticket.assignee?.user?.displayName ?? ticket.assignee?.username ?? "Unassigned")) },
    technicians: technicians.map((technician) => ({ id: technician.id, name: technician.user?.displayName ?? technician.username, assignedTickets: technician.assignedTickets.length, byStatus: distribution(technician.assignedTickets.map((ticket) => ticket.status)) })),
    assets: { active: assets.filter((asset) => asset.status === "Active").length, maintenance: assets.filter((asset) => asset.status === "Maintenance").length, retired: assets.filter((asset) => asset.status === "Retired").length, unassigned: assets.filter((asset) => !asset.ownerId).length, warningFindings: warningAssets, criticalFindings: criticalAssets, staleDiagnosticData: staleDiagnostics, byDepartment: distribution(assets.map((asset) => asset.department.name)), byType: distribution(assets.map((asset) => asset.assetType)), byOs: distribution(assets.map((asset) => asset.operatingSystem ?? "Unknown")) },
    diagnostics: { runs: diagnosticJobs.length, succeeded: diagnosticJobs.filter((job) => job.status === "Succeeded").length, failed: diagnosticJobs.filter((job) => job.status === "Failed").length, timedOut: diagnosticJobs.filter((job) => job.status === "TimedOut").length, cancelled: diagnosticJobs.filter((job) => job.status === "Cancelled").length, byArea: distribution(diagnosticJobs.map((job) => job.action.category)), commonFindings },
    knowledge: { published: articles.filter((article) => article.status === "Published").length, draft: articles.filter((article) => article.status === "Draft").length, archived: articles.filter((article) => article.status === "Archived").length, articlesLinkedToTickets: linkedArticles.length, ticketsWithKnowledgeReference: linkedTickets.length, mostReferenced: linkedArticles.sort((a, b) => b._count.ticketLinks - a._count.ticketLinks).slice(0, 6).map((article) => ({ label: article.title, value: article._count.ticketLinks })) },
    security: { open: openSecurity.length, highCritical: openSecurity.filter((item) => item.severity === "High" || item.severity === "Critical").length, unassigned: openSecurity.filter((item) => !item.assignedAnalystId).length, resolved: resolvedCases, falsePositive: securityCases.filter((item) => item.status === "FalsePositive").length, bySeverity: distribution(securityCases.map((item) => item.severity), ["Low", "Medium", "High", "Critical"]), byStatus: distribution(securityCases.map((item) => item.status), ["New", "Triaged", "Investigating", "Contained", "Resolved", "Closed", "FalsePositive"]) },
    operations: { attention: { slaAtRisk, slaBreached, criticalTickets: critical, unassignedTickets: unassigned, endpointWarnings: warningAssets + criticalAssets, openSecurityCases: openSecurity.length }, recent: { tickets: recentTickets, diagnostics: recentJobs, securityCases: recentCases }, workload: technicians.map((technician) => ({ id: technician.id, name: technician.user?.displayName ?? technician.username, total: technician.assignedTickets.length, byStatus: distribution(technician.assignedTickets.map((ticket) => ticket.status)) })), health: { api: "Ready", database: "Ready", diagnosticsWorker: mode?.mode === "Demo" ? "Disabled" : worker?.ready && worker.leaseUntil > now ? "Ready" : "Attention", workerHeartbeatAt: worker?.heartbeatAt?.toISOString() ?? null } },
  };
}
