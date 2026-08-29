import { z } from 'zod';

export const ticketPriorities = ['Low', 'Medium', 'High', 'Critical'] as const;
export const ticketStatuses = ['New', 'Assigned', 'InProgress', 'WaitingUser', 'WaitingThirdParty', 'Resolved', 'Closed'] as const;
export const securitySeverities = ['Low', 'Medium', 'High', 'Critical'] as const;
export const securityCaseStatuses = ['New', 'Triaged', 'Investigating', 'Contained', 'Resolved', 'Closed', 'FalsePositive'] as const;
export type TicketPriority = (typeof ticketPriorities)[number];
export type TicketStatus = (typeof ticketStatuses)[number];
export type SecuritySeverity = (typeof securitySeverities)[number];
export type SecurityCaseStatus = (typeof securityCaseStatuses)[number];

const nullableString = z.string().nullable().optional();
const namedEntitySchema = z.object({ id: z.string(), name: z.string(), archivedAt: nullableString }).passthrough();
const personSchema = z.object({ id: z.string(), displayName: z.string(), email: z.string().nullable().optional(), archivedAt: nullableString }).passthrough();
const accountSchema = z.object({ id: z.string(), username: z.string(), role: z.enum(['Admin', 'Technician', 'Viewer']), displayName: z.string().nullable().optional(), user: personSchema.optional() }).passthrough();
const slaSchema = z.object({
  responseDueAt: nullableString, resolutionDueAt: nullableString, firstResponseAt: nullableString,
  resolutionStoppedAt: nullableString, pausedAt: nullableString, responseBreachedAt: nullableString,
  resolutionBreachedAt: nullableString, remainingSeconds: z.number().optional(),
  state: z.enum(['healthy', 'at-risk', 'breached', 'paused', 'stopped']).optional(),
}).passthrough();
const slaStateSchema = z.object({ remainingSeconds: z.number(), atRisk: z.boolean(), breached: z.boolean(), paused: z.boolean(), stopped: z.boolean() }).passthrough();

export const ticketSchema = z.object({
  id: z.string(), ticketCode: z.string().optional(), ticketNumber: z.string().optional(),
  title: z.string(), description: z.string(), priority: z.enum(ticketPriorities), status: z.enum(ticketStatuses),
  version: z.number().int().nonnegative(), createdAt: z.string(), updatedAt: z.string(), resolvedAt: nullableString,
  closedAt: nullableString, solution: nullableString, requester: personSchema, department: namedEntitySchema.optional(),
  category: namedEntitySchema, assignee: accountSchema.nullable().optional(),
  asset: z.object({ id: z.string(), assetTag: z.string(), assetCode: z.string().optional(), name: z.string() }).passthrough().nullable().optional(),
  securityCase: z.unknown().nullable().optional(),
  sla: slaSchema.nullable().optional(), ticketSla: slaSchema.nullable().optional(),
  slaState: slaStateSchema.nullable().optional(),
  timeline: z.array(z.unknown()).optional(), history: z.array(z.unknown()).optional(), comments: z.array(z.unknown()).optional(),
}).passthrough();

export type Ticket = z.infer<typeof ticketSchema>;
export type Person = z.infer<typeof personSchema>;
export type Account = z.infer<typeof accountSchema>;
export type NamedEntity = z.infer<typeof namedEntitySchema>;

export const activitySchema = z.object({
  id: z.string(), createdAt: z.string(), type: z.string().optional(), eventType: z.string().optional(),
  action: z.string().optional(), fromStatus: nullableString, toStatus: nullableString, body: nullableString,
  content: nullableString, internal: z.boolean().optional(), details: z.unknown().optional(),
  actor: accountSchema.nullable().optional(), author: accountSchema.nullable().optional(),
}).passthrough();
export type ActivityItem = z.infer<typeof activitySchema>;

const paginationSchema = z.object({ page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() });
export const assetTypes = ['Desktop','Laptop','Server','Printer','NetworkDevice','Mobile','Other'] as const;
export const assetStatuses = ['Active','InStock','Maintenance','Retired','Lost'] as const;
export const assetSchema = z.object({ id:z.string(),assetCode:z.string(),assetTag:z.string(),name:z.string(),type:z.enum(assetTypes),assetType:z.string(),version:z.number(),hostname:nullableString,manufacturer:nullableString,model:nullableString,serialNumber:nullableString,operatingSystem:nullableString,osVersion:nullableString,cpu:nullableString,ramBytes:z.number().nullable().optional(),storageBytes:z.number().nullable().optional(),ipv4:nullableString,macAddress:nullableString,status:z.enum(assetStatuses),location:nullableString,notes:nullableString,lastSeenAt:nullableString,archivedAt:nullableString,assignedUserId:nullableString,owner:personSchema.nullable().optional(),department:namedEntitySchema,tickets:z.array(z.unknown()).optional(),securityCases:z.array(z.unknown()).optional(),activity:z.array(z.unknown()).optional(),diagnosticsAvailable:z.boolean().optional(),inventorySource:z.string().optional(),createdAt:z.string(),updatedAt:z.string()}).passthrough();
export const articleSchema=z.object({id:z.string(),articleCode:z.string(),title:z.string(),summary:z.string(),problem:z.string(),symptoms:z.string(),diagnosticSteps:z.string(),solution:z.string(),validationSteps:z.string(),category:namedEntitySchema,categoryId:z.string(),tags:z.array(z.string()),status:z.enum(['Draft','Published','Archived']),version:z.number(),publishedAt:nullableString,archivedAt:nullableString,author:accountSchema,createdAt:z.string(),updatedAt:z.string(),ticketLinks:z.array(z.unknown()).optional(),_count:z.object({ticketLinks:z.number()}).optional()}).passthrough();
export type Asset=z.infer<typeof assetSchema>;export type Article=z.infer<typeof articleSchema>;
const ticketListSchema = z.object({ data: z.array(ticketSchema), pagination: paginationSchema });
const overviewSchema = z.object({ openTickets: z.number().int().nonnegative().nullable(), myTickets: z.number().int().nonnegative().nullable(), unassigned: z.number().int().nonnegative().nullable(), slaAtRisk: z.number().int().nonnegative().nullable(), critical: z.number().int().nonnegative().nullable() }).passthrough();
const serviceStatusSchema = z.object({ status: z.literal('ok'), service: z.literal('edy-helpdesk-api'), version: z.string(), timestamp: z.string(), uptimeSeconds: z.number().nonnegative() });
const readinessSchema = z.object({ status: z.enum(['ready', 'not_ready']), service: z.literal('edy-helpdesk-api'), timestamp: z.string(), checks: z.object({ configuration: z.object({ status: z.literal('ok') }), database: z.object({ status: z.enum(['ok', 'error']), message: z.string().optional() }) }) });
const sessionSchema = z.object({ account: accountSchema, csrfToken: z.string().min(16) }).passthrough();

const securityTicketSchema = z.object({ id: z.string(), ticketCode: z.string().optional(), ticketNumber: z.string().optional(), title: z.string(), category: namedEntitySchema.optional() }).passthrough();
const securityAssetSchema = z.object({ id: z.string(), assetCode: z.string().optional(), assetTag: z.string().optional(), name: z.string(), hostname: nullableString }).passthrough();
const securityEvidenceSchema = z.object({
  id: z.string().optional(), evidenceId: z.string().optional(), type: z.enum(['TicketContext', 'DiagnosticFinding', 'EventLog', 'ManualNote']),
  title: z.string(), summary: z.string(), source: z.string(), sourceReference: nullableString,
  createdBy: accountSchema.optional(), createdAt: z.string(),
}).passthrough();
const securityTimelineSchema = z.object({
  id: z.string(), timestamp: z.string().optional(), occurredAt: z.string().optional(), createdAt: z.string().optional(),
  actor: accountSchema.nullable().optional(), action: z.string(), summary: z.string(), metadata: z.unknown().optional(),
}).passthrough();
export const securityCaseSchema = z.object({
  id: z.string(), securityCaseCode: z.string().optional(), caseNumber: z.string().optional(), ticketId: z.string(),
  title: z.string(), summary: z.string(), severity: z.enum(securitySeverities), status: z.enum(securityCaseStatuses), reason: z.string(),
  version: z.number().int().positive(), assignedAnalyst: accountSchema.nullable().optional(), assignedAnalystId: nullableString,
  assetId: nullableString, asset: securityAssetSchema.nullable().optional(), ticket: securityTicketSchema,
  createdBy: accountSchema.optional(), createdAt: z.string(), updatedAt: z.string(), closedAt: nullableString,
  resolutionSummary: nullableString, classification: nullableString, lessonsLearned: nullableString,
  evidence: z.array(securityEvidenceSchema).optional(), timeline: z.array(securityTimelineSchema).optional(), synthetic: z.boolean().optional(),
}).passthrough();
export type SecurityCase = z.infer<typeof securityCaseSchema>;
export type SecurityEvidence = z.infer<typeof securityEvidenceSchema>;
export type SecurityTimelineEntry = z.infer<typeof securityTimelineSchema>;
const securityCaseListSchema = z.object({ data: z.array(securityCaseSchema), pagination: paginationSchema, synthetic: z.boolean().optional() });
const assetSecurityCasesSchema = z.object({ data: z.array(securityCaseSchema), openCount: z.number().int().nonnegative(), synthetic: z.boolean().optional() });
const securityDashboardSchema = z.object({
  openSecurityCases: z.number().int().nonnegative(), highCriticalCases: z.number().int().nonnegative(),
  unassignedCases: z.number().int().nonnegative(), resolvedToday: z.number().int().nonnegative(),
  casesBySeverity: z.record(z.number().int().nonnegative()).optional(), casesByStatus: z.record(z.number().int().nonnegative()).optional(),
  recentCases: z.array(securityCaseSchema).optional(), synthetic: z.boolean().optional(),
}).passthrough();
export type SecurityDashboard = z.infer<typeof securityDashboardSchema>;

export type Session = z.infer<typeof sessionSchema>;
export type OverviewMetrics = z.infer<typeof overviewSchema>;
export type ReadinessStatus = z.infer<typeof readinessSchema>;
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: string, readonly requestId?: string) { super(message); this.name = 'ApiError'; }
}

let csrfToken: string | null = null;
export function setCsrfToken(value: string | null) { csrfToken = value; }

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };
export async function requestJson<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json', 'x-correlation-id': crypto.randomUUID() };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers['x-csrf-token'] = csrfToken;
  Object.assign(headers, options.headers);
  const response = await fetch(path, { ...options, credentials: 'include', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  if (!response.ok) {
    let problem: { title?: string; detail?: string; requestId?: string } = {};
    try { problem = (await response.json()) as typeof problem; } catch { /* retain safe message */ }
    if (response.status === 401 && !path.endsWith('/auth/login') && !path.endsWith('/auth/me')) { setCsrfToken(null); window.dispatchEvent(new Event('edy:session-expired')); }
    throw new ApiError(problem.title ?? 'The request could not be completed.', response.status, problem.detail, problem.requestId ?? response.headers.get('x-request-id') ?? undefined);
  }
  if (response.status === 204) return undefined as T;
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new ApiError('The API returned an unexpected response.', response.status);
  return parsed.data;
}

function qs(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && String(value).length > 0) search.set(key, String(value)); });
  return search.size ? `?${search}` : '';
}

export const getHealth = () => requestJson('/api/v1/health', serviceStatusSchema);
export const getReadiness = () => requestJson('/api/v1/ready', readinessSchema);
export const getSession = async () => { const value = await requestJson('/api/v1/auth/me', sessionSchema); setCsrfToken(value.csrfToken); return value; };
export const login = async (username: string, password: string) => { const value = await requestJson('/api/v1/auth/login', sessionSchema, { method: 'POST', body: { username, password } }); setCsrfToken(value.csrfToken); return value; };
export const logout = async () => { await requestJson('/api/v1/auth/logout', z.undefined(), { method: 'POST' }); setCsrfToken(null); };
export const getOverview = () => requestJson('/api/v1/overview', overviewSchema);
export const getTickets = (params: Record<string, string | number | undefined>) => requestJson(`/api/v1/tickets${qs(params)}`, ticketListSchema);
export const getTicket = (id: string) => requestJson(`/api/v1/tickets/${id}`, ticketSchema);
export const createTicket = (input: Record<string, unknown>) => requestJson('/api/v1/tickets', ticketSchema, { method: 'POST', body: input });
export const transitionTicket = (id: string, input: { toStatus: TicketStatus; version: number; reason?: string; solution?: string }) => requestJson(`/api/v1/tickets/${id}/transitions`, ticketSchema, { method: 'POST', body: input });
export const assignTicket = (id: string, input: { assigneeAccountId: string | null; version: number }) => requestJson(`/api/v1/tickets/${id}/assignments`, ticketSchema, { method: 'POST', body: input });
export const addComment = (id: string, input: { content: string; type: 'Public' | 'Internal'; version: number }) => requestJson(`/api/v1/tickets/${id}/comments`, activitySchema, { method: 'POST', body: input });

const usersListSchema = z.object({ data: z.array(personSchema), pagination: paginationSchema.optional() });
const namedListSchema = z.object({ data: z.array(namedEntitySchema), pagination: paginationSchema.optional() });
const accountsListSchema = z.object({ data: z.array(accountSchema), pagination: paginationSchema.optional() });
const metadataSchema = z.object({ requesters: z.array(personSchema), departments: z.array(namedEntitySchema), categories: z.array(namedEntitySchema), assets: z.array(z.object({ id: z.string(), name: z.string(), assetCode: z.string().optional(), assetTag: z.string() }).passthrough()), technicians: z.array(accountSchema).optional() }).passthrough();
export const getUsers = (params: Record<string, string | number | undefined> = {}) => requestJson(`/api/v1/users${qs(params)}`, usersListSchema);
export const getDepartments = (params: Record<string, string | number | undefined> = {}) => requestJson(`/api/v1/departments${qs(params)}`, namedListSchema);
export const getCategories = (params: Record<string, string | number | undefined> = {}) => requestJson(`/api/v1/categories${qs(params)}`, namedListSchema);
export const getTechnicians = () => requestJson('/api/v1/accounts?role=Technician&pageSize=100', accountsListSchema);
export const getMetadata = () => requestJson('/api/v1/metadata', metadataSchema);
export const createUser = (input: Record<string, unknown>) => requestJson('/api/v1/users', personSchema, { method: 'POST', body: input });
export const updateUser = (id: string, input: Record<string, unknown>) => requestJson(`/api/v1/users/${id}`, personSchema, { method: 'PATCH', body: input });
export const archiveUser = (id: string) => requestJson(`/api/v1/users/${id}/archive`, personSchema, { method: 'POST' });
export const createDepartment = (input: Record<string, unknown>) => requestJson('/api/v1/departments', namedEntitySchema, { method: 'POST', body: input });
export const updateDepartment = (id: string, input: Record<string, unknown>) => requestJson(`/api/v1/departments/${id}`, namedEntitySchema, { method: 'PATCH', body: input });
export const archiveDepartment = (id: string) => requestJson(`/api/v1/departments/${id}/archive`, namedEntitySchema, { method: 'POST' });
export const createCategory = (input: Record<string, unknown>) => requestJson('/api/v1/categories', namedEntitySchema, { method: 'POST', body: input });
export const updateCategory = (id: string, input: Record<string, unknown>) => requestJson(`/api/v1/categories/${id}`, namedEntitySchema, { method: 'PATCH', body: input });
export const archiveCategory = (id: string) => requestJson(`/api/v1/categories/${id}/archive`, namedEntitySchema, { method: 'POST' });
const assetListSchema=z.object({data:z.array(assetSchema),pagination:paginationSchema});
const articleListSchema=z.object({data:z.array(articleSchema),pagination:paginationSchema});
export const getAssets=(params:Record<string,string|number|undefined>={})=>requestJson(`/api/v1/assets${qs(params)}`,assetListSchema);
export const getAsset=(id:string)=>requestJson(`/api/v1/assets/${id}`,assetSchema);
export const createAsset=(input:Record<string,unknown>)=>requestJson('/api/v1/assets',assetSchema,{method:'POST',body:input});
export const updateAsset=(id:string,input:Record<string,unknown>)=>requestJson(`/api/v1/assets/${id}`,assetSchema,{method:'PATCH',body:input});
export const assignAsset=(id:string,input:{version:number;assignedUserId:string|null})=>requestJson(`/api/v1/assets/${id}/assignments`,assetSchema,{method:'POST',body:input});
export const archiveAsset=(id:string,version:number)=>requestJson(`/api/v1/assets/${id}/archive`,assetSchema,{method:'POST',body:{version}});
export const restoreAsset=(id:string,version:number)=>requestJson(`/api/v1/assets/${id}/restore`,assetSchema,{method:'POST',body:{version}});
export const linkTicketAsset=(id:string,input:{version:number;assetId:string|null})=>requestJson(`/api/v1/tickets/${id}/asset`,z.undefined(),{method:'POST',body:input});
export const getArticles=(params:Record<string,string|number|undefined>={})=>requestJson(`/api/v1/knowledge${qs(params)}`,articleListSchema);
export const getArticle=(id:string)=>requestJson(`/api/v1/knowledge/${id}`,articleSchema);
export const createArticle=(input:Record<string,unknown>)=>requestJson('/api/v1/knowledge',articleSchema,{method:'POST',body:input});
export const updateArticle=(id:string,input:Record<string,unknown>)=>requestJson(`/api/v1/knowledge/${id}`,articleSchema,{method:'PATCH',body:input});
export const articleAction=(id:string,action:'publish'|'archive'|'restore',version:number)=>requestJson(`/api/v1/knowledge/${id}/${action}`,articleSchema,{method:'POST',body:{version}});
export const getTicketKnowledge=(id:string)=>requestJson(`/api/v1/tickets/${id}/knowledge`,z.object({data:z.array(articleSchema)}));
export const changeTicketKnowledge=(id:string,action:'link'|'unlink',input:{version:number;articleId:string})=>requestJson(`/api/v1/tickets/${id}/knowledge/${action}`,z.undefined(),{method:'POST',body:input});
const ticketSummarySchema=z.object({id:z.string(),ticketNumber:z.string(),title:z.string(),status:z.enum(ticketStatuses),priority:z.enum(ticketPriorities),updatedAt:z.string()}).passthrough();
const userWorkspaceSchema=personSchema.extend({department:namedEntitySchema,assets:z.array(assetSchema),openTickets:z.array(ticketSummarySchema),recentTickets:z.array(ticketSummarySchema)}).passthrough();
export const getUser=(id:string)=>requestJson(`/api/v1/users/${id}`,userWorkspaceSchema);

const distributionSchema=z.array(z.object({label:z.string(),value:z.number().int().nonnegative()}));
const rangeSchema=z.object({preset:z.enum(['today','7d','30d','custom']),from:z.string(),toExclusive:z.string(),displayFrom:z.string(),displayTo:z.string(),timeZone:z.literal('America/Sao_Paulo')});
const analyticsSchema=z.object({
  range:rangeSchema,generatedAt:z.string(),mode:z.string(),
  overview:z.object({openTickets:z.number(),myTickets:z.number(),unassignedTickets:z.number(),slaAtRisk:z.number(),slaBreached:z.number(),criticalTickets:z.number(),openSecurityCases:z.number(),highCriticalSecurityCases:z.number()}),
  support:z.object({ticketsCreated:z.number(),ticketsResolved:z.number(),ticketsClosed:z.number(),averageResolutionMinutes:z.number().nullable(),averageFirstResponseMinutes:z.number().nullable(),slaCompliancePercent:z.number().nullable(),reopenedTickets:z.number(),unassignedTickets:z.number()}),
  sla:z.object({withinSla:z.number(),atRisk:z.number(),breached:z.number(),paused:z.number(),resolvedWithinSla:z.number(),resolvedMeasured:z.number(),compliancePercent:z.number().nullable(),distribution:distributionSchema}),
  tickets:z.object({byStatus:distributionSchema,byPriority:distributionSchema,byCategory:distributionSchema,byDepartment:distributionSchema,byTechnician:distributionSchema}),
  technicians:z.array(z.object({id:z.string(),name:z.string(),assignedTickets:z.number(),byStatus:distributionSchema})),
  assets:z.object({active:z.number(),maintenance:z.number(),retired:z.number(),unassigned:z.number(),warningFindings:z.number(),criticalFindings:z.number(),staleDiagnosticData:z.number(),byDepartment:distributionSchema,byType:distributionSchema,byOs:distributionSchema}),
  diagnostics:z.object({runs:z.number(),succeeded:z.number(),failed:z.number(),timedOut:z.number(),cancelled:z.number(),byArea:distributionSchema,commonFindings:distributionSchema}),
  knowledge:z.object({published:z.number(),draft:z.number(),archived:z.number(),articlesLinkedToTickets:z.number(),ticketsWithKnowledgeReference:z.number(),mostReferenced:distributionSchema}),
  security:z.object({open:z.number(),highCritical:z.number(),unassigned:z.number(),resolved:z.number(),falsePositive:z.number(),bySeverity:distributionSchema,byStatus:distributionSchema}),
  operations:z.object({attention:z.object({slaAtRisk:z.number(),slaBreached:z.number(),criticalTickets:z.number(),unassignedTickets:z.number(),endpointWarnings:z.number(),openSecurityCases:z.number()}),recent:z.object({tickets:z.array(z.unknown()),diagnostics:z.array(z.unknown()),securityCases:z.array(z.unknown())}),workload:z.array(z.object({id:z.string(),name:z.string(),total:z.number(),byStatus:distributionSchema})),health:z.object({api:z.string(),database:z.string(),diagnosticsWorker:z.string(),workerHeartbeatAt:z.string().nullable()})}),
});
export type AnalyticsData=z.infer<typeof analyticsSchema>;
export type DateRangeSelection={range:'today'|'7d'|'30d'|'custom';from?:string;to?:string};
export const getDashboard=(selection:DateRangeSelection)=>requestJson(`/api/v1/dashboard${qs(selection)}`,analyticsSchema);

export const integrationDatasets=['Tickets','SLAs','Assets','Diagnostics','Knowledge','SecurityCases','Calendar'] as const;
const integrationStatusSchema=z.enum(['Disabled','Ready','Connected','Error','Incompatible','Unavailable','ExportReady']);
const integrationOverviewSchema=z.object({mode:z.enum(['Demo','Operational']),integrations:z.array(z.object({id:z.enum(['sentinel','siem','analytics']),name:z.string(),status:integrationStatusSchema,enabled:z.boolean(),configured:z.boolean(),contractVersion:z.string().nullable(),lastSuccessfulCommunication:z.string().nullable(),lastError:z.string().nullable(),description:z.string(),actions:z.object({testConnection:z.boolean(),enable:z.boolean(),disable:z.boolean(),createLocalExport:z.boolean()})})).length(3),outbox:z.object({pending:z.number(),failed:z.number(),deadLetter:z.number(),processed:z.number()})});
const integrationExportResultSchema=z.object({fileName:z.string(),fileSize:z.number(),recordCount:z.number(),sha256:z.string(),generatedAt:z.string()});
const settingsOverviewSchema=z.object({application:z.object({version:z.string(),mode:z.enum(['Demo','Operational']),databaseProvider:z.enum(['sqlite','postgresql'])}),session:z.object({idleMinutes:z.number(),absoluteHours:z.number(),cookies:z.object({httpOnly:z.boolean(),sameSite:z.literal('strict'),secureInProduction:z.boolean()})}),diagnostics:z.object({workerIsolated:z.literal(true),realExecutionEnabled:z.boolean(),elevationAllowed:z.literal(false),arbitraryCommandsAllowed:z.literal(false)}),integrations:z.object({externalEnabled:z.boolean(),portfolioDemoLock:z.boolean()})});
export const getIntegrations=()=>requestJson('/api/v1/integrations',integrationOverviewSchema);
export const createAnalyticsIntegrationExport=(dataset:(typeof integrationDatasets)[number])=>requestJson('/api/v1/integrations/analytics/exports',integrationExportResultSchema,{method:'POST',body:{dataset}});
export const getSettings=()=>requestJson('/api/v1/settings',settingsOverviewSchema);

export const reportTypes=['TicketReport','SlaReport','AssetReport','DiagnosticReport','KnowledgeReport','SecurityCaseReport','AuditSummary'] as const;
export const exportFormats=['CSV','JSON'] as const;
const exportJobSchema=z.object({id:z.string(),requestedBy:z.string(),requestedByName:z.string().optional(),reportType:z.enum(reportTypes),format:z.enum(exportFormats),status:z.enum(['Queued','Running','Succeeded','Failed','Expired']),requestedAt:z.string(),startedAt:nullableString,completedAt:nullableString,expiresAt:z.string(),fileName:nullableString,fileSize:z.number().nullable().optional(),rowCount:z.number().nullable().optional(),errorCode:nullableString,downloadable:z.boolean().optional()}).passthrough();
const reportListSchema=z.object({data:z.array(exportJobSchema),pagination:paginationSchema});
export type ExportJob=z.infer<typeof exportJobSchema>;
export const getReports=(page=1,pageSize=20)=>requestJson(`/api/v1/reports${qs({page,pageSize})}`,reportListSchema);
export const createReport=(input:{reportType:(typeof reportTypes)[number];format:(typeof exportFormats)[number];filters:DateRangeSelection})=>requestJson('/api/v1/reports',exportJobSchema,{method:'POST',body:input});
export const reportDownloadUrl=(id:string)=>`/api/v1/reports/${encodeURIComponent(id)}/download`;

// Phase 5 security adapters keep the UI decoupled from the future SIEM boundary.
export const getSecurityDashboard=()=>requestJson('/api/v1/security/dashboard',securityDashboardSchema);
export const getSecurityCases=(params:Record<string,string|number|undefined>={})=>{
  const normalized={...params};
  if(typeof normalized.createdFrom==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(normalized.createdFrom)) normalized.createdFrom=`${normalized.createdFrom}T00:00:00.000Z`;
  if(typeof normalized.createdTo==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(normalized.createdTo)) normalized.createdTo=`${normalized.createdTo}T23:59:59.999Z`;
  return requestJson(`/api/v1/security/cases${qs(normalized)}`,securityCaseListSchema);
};
export const getSecurityCase=(id:string)=>requestJson(`/api/v1/security/cases/${id}`,securityCaseSchema);
export const getTicketSecurityCase=(ticketId:string)=>requestJson(`/api/v1/tickets/${ticketId}/security-case`,securityCaseSchema.nullable());
export const getAssetSecurityCases=(assetId:string)=>requestJson(`/api/v1/assets/${assetId}/security-cases`,assetSecurityCasesSchema);
export const escalateTicketToSecurity=(ticketId:string,input:{reason:string;severity:SecuritySeverity;summary:string;importantDiagnosticFindings?:string[]},idempotencyKey:string)=>requestJson(`/api/v1/tickets/${ticketId}/security-escalations`,securityCaseSchema,{method:'POST',headers:{'x-idempotency-key':idempotencyKey},body:input});
export const assignSecurityCase=(id:string,input:{assignedAnalystId:string|null;version:number})=>requestJson(`/api/v1/security/cases/${id}/assignments`,securityCaseSchema,{method:'POST',body:input});
export const changeSecurityCaseStatus=(id:string,input:{status:SecurityCaseStatus;version:number;reason?:string})=>requestJson(`/api/v1/security/cases/${id}/status-transitions`,securityCaseSchema,{method:'POST',body:input});
export const changeSecurityCaseSeverity=(id:string,input:{severity:SecuritySeverity;version:number;reason:string})=>requestJson(`/api/v1/security/cases/${id}/severity`,securityCaseSchema,{method:'POST',body:input});
export const addManualSecurityEvidence=(id:string,input:{title:string;summary:string;source:string;version:number})=>requestJson(`/api/v1/security/cases/${id}/evidence`,securityCaseSchema,{method:'POST',body:{...input,type:'ManualNote'}});
export const linkDiagnosticSecurityEvidence=(id:string,input:{diagnosticJobId:string;title?:string;version:number})=>requestJson(`/api/v1/security/cases/${id}/evidence`,securityCaseSchema,{method:'POST',body:{...input,type:'DiagnosticFinding'}});
export const linkEventSecurityEvidence=(id:string,input:{windowsEventId:string;title?:string;version:number})=>requestJson(`/api/v1/security/cases/${id}/evidence`,securityCaseSchema,{method:'POST',body:{...input,type:'EventLog'}});
export const resolveSecurityCase=(id:string,input:{resolutionSummary:string;classification?:string;lessonsLearned?:string;version:number})=>requestJson(`/api/v1/security/cases/${id}/resolution`,securityCaseSchema,{method:'POST',body:input});
export const markSecurityCaseFalsePositive=(id:string,input:{reason:string;version:number})=>requestJson(`/api/v1/security/cases/${id}/false-positive`,securityCaseSchema,{method:'POST',body:input});
