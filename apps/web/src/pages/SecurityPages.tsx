import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, CircleDotDashed, FileCheck2, Filter, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/Auth';
import { EmptyState, ErrorState, ListSkeleton } from '../components/Feedback';
import { SecurityCaseCode, SecurityStatusBadge, SeverityBadge } from '../components/SecurityPrimitives';
import { securityCaseCode, securityDate, securityLabel } from '../lib/security-ui';
import {
  ApiError,
  addManualSecurityEvidence,
  assignSecurityCase,
  changeSecurityCaseSeverity,
  changeSecurityCaseStatus,
  getAssets,
  getCategories,
  getSecurityCase,
  getSecurityCases,
  getSecurityDashboard,
  getTechnicians,
  linkDiagnosticSecurityEvidence,
  linkEventSecurityEvidence,
  markSecurityCaseFalsePositive,
  resolveSecurityCase,
  securityCaseStatuses,
  securitySeverities,
  type SecurityCase,
  type SecurityCaseStatus,
  type SecuritySeverity,
} from '../lib/api';
import { diagnosticName, getDiagnosticHistory, getDiagnosticJob } from '../lib/diagnostics';
import { formatDateTime } from '../i18n/I18nProvider';

const statusTransitions: Record<SecurityCaseStatus, SecurityCaseStatus[]> = {
  New: ['Triaged', 'Investigating', 'FalsePositive'],
  Triaged: ['Investigating', 'FalsePositive'],
  Investigating: ['Contained', 'Resolved', 'FalsePositive'],
  Contained: ['Investigating', 'Resolved', 'FalsePositive'],
  Resolved: ['Investigating', 'Closed'],
  Closed: ['Investigating'],
  FalsePositive: ['Investigating', 'Closed'],
};

export function SecurityDashboardPage() {
  const dashboard = useQuery({ queryKey: ['security-dashboard'], queryFn: getSecurityDashboard, refetchInterval: 60_000 });
  const recent = useQuery({ queryKey: ['security-cases', 'dashboard'], queryFn: () => getSecurityCases({ page: 1, pageSize: 6, sort: 'recentlyUpdated' }) });
  const metrics = [
    { label: 'Open security cases', value: dashboard.data?.openSecurityCases, icon: ShieldCheck, tone: 'security' },
    { label: 'High / Critical', value: dashboard.data?.highCriticalCases, icon: AlertTriangle, tone: 'critical' },
    { label: 'Unassigned cases', value: dashboard.data?.unassignedCases, icon: CircleDotDashed, tone: 'warning' },
    { label: 'Resolved today', value: dashboard.data?.resolvedToday, icon: CheckCircle2, tone: 'health' },
  ] as const;
  return <div className="page-stack page-stack--dense security-area">
    <header className="page-header security-page-header"><div><span className="eyebrow eyebrow--security">Security operations</span><h1>Security triage</h1><p>Review escalations, ownership, and case progress using persisted operational data.</p>{dashboard.data?.synthetic ? <span className="synthetic-label">Synthetic Demo Data</span> : null}</div><Link className="button button--primary button--security" to="/security/cases">Open case queue <ArrowRight size={15} /></Link></header>
    {dashboard.isError ? <ErrorState title="Security metrics could not be loaded." onRetry={() => void dashboard.refetch()} /> : <section className="metric-strip security-metrics" aria-label="Security case metrics">{metrics.map(({ label, value, icon: Icon, tone }) => <article className={`metric metric--${tone}`} key={label}><span className="metric__icon"><Icon size={17} aria-hidden="true" /></span><span><small>{label}</small><strong>{dashboard.isPending ? '—' : value ?? 0}</strong></span></article>)}</section>}
    <div className="security-dashboard-grid">
      <section className="panel panel--flush" aria-labelledby="recent-security-title"><header className="panel__header"><div><span className="section-kicker">Recently updated</span><h2 id="recent-security-title">Active investigations</h2></div><Link className="text-link" to="/security/cases">View queue <ArrowRight size={14} /></Link></header>{recent.isPending ? <ListSkeleton rows={5} /> : recent.isError ? <ErrorState onRetry={() => void recent.refetch()} /> : recent.data?.data.length ? <div className="security-compact-list">{recent.data.data.map((item) => <SecurityCompactCase item={item} key={item.id} />)}</div> : <EmptyState title="No security cases yet." description="Authorized ticket escalations will appear here for analyst review." />}</section>
      <aside className="panel security-distribution"><header className="panel__header"><div><span className="section-kicker">Current workload</span><h2>Cases by severity</h2></div></header><div className="severity-bars">{securitySeverities.map((severity) => { const count = dashboard.data?.casesBySeverity?.[severity] ?? 0; const total = Object.values(dashboard.data?.casesBySeverity ?? {}).reduce((sum, value) => sum + value, 0); return <div key={severity}><span><SeverityBadge severity={severity} /><strong>{count}</strong></span><div className="severity-bar" aria-label={`${severity}: ${count} cases`}><i style={{ width: total ? `${Math.max(5, (count / total) * 100)}%` : '0%' }} /></div></div>; })}</div><p className="security-safety-note"><ShieldCheck size={16} aria-hidden="true" />This workspace supports triage and case management only. No endpoint containment is performed.</p></aside>
    </div>
  </div>;
}

export function SecurityCasesPage() {
  const [params, setParams] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const query = Object.fromEntries(params);
  const cases = useQuery({ queryKey: ['security-cases', query], queryFn: () => getSecurityCases({ ...query, page: query.page ?? 1, pageSize: 20, sort: query.sort ?? 'recentlyUpdated' }) });
  const technicians = useQuery({ queryKey: ['technicians'], queryFn: getTechnicians });
  const categories = useQuery({ queryKey: ['categories', 'security-filters'], queryFn: () => getCategories({ pageSize: 100 }) });
  const assets = useQuery({ queryKey: ['assets', 'security-filters'], queryFn: () => getAssets({ pageSize: 100 }) });
  useEffect(() => { if (params.get('focus') === 'search') searchRef.current?.focus({ preventScroll: true }); }, [params]);
  function setFilter(key: string, value: string) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); next.delete('focus'); setParams(next); }
  const page = Number(query.page ?? 1);
  const active = [...params.entries()].filter(([key, value]) => value && !['page', 'sort', 'focus'].includes(key));
  return <div className="page-stack page-stack--dense security-area">
    <header className="page-header security-page-header"><div><span className="eyebrow eyebrow--security">Security operations</span><h1>Security cases</h1><p>Search and triage escalated support work with durable filters and explicit ownership.</p>{cases.data?.synthetic ? <span className="synthetic-label">Synthetic Demo Data</span> : null}</div><Link className="button button--secondary" to="/security"><ShieldCheck size={15} />Security dashboard</Link></header>
    <section className="queue-controls security-filters" aria-label="Security case filters">
      <label className="search-field"><Search size={16} aria-hidden="true" /><input ref={searchRef} type="search" value={query.search ?? ''} onChange={(event) => setFilter('search', event.target.value)} placeholder="Search SEC code, ticket, title, asset or summary…" aria-label="Search security cases" /></label>
      <div className="filter-row"><FilterSelect label="Status" value={query.status} onChange={(value) => setFilter('status', value)} options={securityCaseStatuses.map((value) => ({ value, label: securityLabel(value) }))} /><FilterSelect label="Severity" value={query.severity} onChange={(value) => setFilter('severity', value)} options={securitySeverities.map((value) => ({ value, label: value }))} /><FilterSelect label="Analyst" value={query.assignedAnalystId} onChange={(value) => setFilter('assignedAnalystId', value)} options={(technicians.data?.data ?? []).map((item) => ({ value: item.id, label: item.user?.displayName ?? item.displayName ?? item.username }))} /><FilterSelect label="Source category" value={query.sourceCategory} onChange={(value) => setFilter('sourceCategory', value)} options={(categories.data?.data ?? []).map((item) => ({ value: item.name, label: item.name }))} /><FilterSelect label="Asset" value={query.assetId} onChange={(value) => setFilter('assetId', value)} options={(assets.data?.data ?? []).map((item) => ({ value: item.id, label: `${item.assetCode} · ${item.hostname || item.name}` }))} /><label className={query.createdFrom ? 'filter-select filter-select--active' : 'filter-select'}><span className="sr-only">Created from</span><input type="date" value={query.createdFrom ?? ''} onChange={(event) => setFilter('createdFrom', event.target.value)} aria-label="Created from" /></label></div>
      {active.length ? <div className="active-filters"><span><Filter size={13} />{active.length} active</span>{active.map(([key, value]) => <button type="button" key={key} onClick={() => setFilter(key, '')}>{securityLabel(key)}: {value}<X size={12} /></button>)}<button className="clear-filter" type="button" onClick={() => setParams({})}>Clear all</button></div> : null}
    </section>
    <section className="queue-panel security-queue" aria-label="Security case results"><header className="queue-panel__header"><div><strong>{cases.data?.pagination.total ?? '—'} cases</strong><span>Persisted security escalations</span></div><label>Sort<select value={query.sort ?? 'recentlyUpdated'} onChange={(event) => setFilter('sort', event.target.value)}><option value="recentlyUpdated">Recently updated</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="severity">Severity</option></select></label></header>
      {cases.isPending ? <ListSkeleton rows={8} /> : cases.isError ? <ErrorState title="Security case queue could not be loaded." onRetry={() => void cases.refetch()} /> : cases.data?.data.length ? <div className="ticket-table-wrap"><table className="ticket-table security-table"><thead><tr><th>Case</th><th>Investigation</th><th>Source</th><th>Asset</th><th>Severity</th><th>Status</th><th>Analyst</th><th>Updated</th></tr></thead><tbody>{cases.data.data.map((item) => <tr key={item.id}><td><Link to={`/security/cases/${item.id}`}><SecurityCaseCode value={securityCaseCode(item)} /></Link></td><td><Link className="ticket-summary" to={`/security/cases/${item.id}`}><strong>{item.title}</strong><span>{item.summary}</span></Link></td><td><Link to={`/tickets/${item.ticketId}`}>{item.ticket.ticketCode ?? item.ticket.ticketNumber}</Link></td><td>{item.asset ? <Link to={`/assets/${item.asset.id}`}>{item.asset.assetCode ?? item.asset.assetTag}</Link> : <span className="muted">No asset</span>}</td><td><SeverityBadge severity={item.severity} /></td><td><SecurityStatusBadge status={item.status} /></td><td>{item.assignedAnalyst?.user?.displayName ?? item.assignedAnalyst?.displayName ?? item.assignedAnalyst?.username ?? <span className="muted">Unassigned</span>}</td><td><time dateTime={item.updatedAt}>{securityDate(item.updatedAt)}</time></td></tr>)}</tbody></table></div> : <EmptyState title="No cases match these filters." description="Adjust or clear the filters to return to the full security queue." action={<button className="button button--secondary" type="button" onClick={() => setParams({})}>Clear filters</button>} />}
      {cases.data && cases.data.pagination.totalPages > 1 ? <footer className="pagination"><span>Page {cases.data.pagination.page} of {cases.data.pagination.totalPages}</span><div><button type="button" disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))} aria-label="Previous page"><ChevronLeft size={16} /></button><button type="button" disabled={page >= cases.data.pagination.totalPages} onClick={() => setFilter('page', String(page + 1))} aria-label="Next page"><ChevronRight size={16} /></button></div></footer> : null}
    </section>
  </div>;
}

type CaseAction = 'assign' | 'status' | 'severity' | 'evidence' | 'resolve' | 'false-positive' | null;

export function SecurityCasePage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const client = useQueryClient();
  const detail = useQuery({ queryKey: ['security-case', id], queryFn: () => getSecurityCase(id), enabled: Boolean(id) });
  const technicians = useQuery({ queryKey: ['technicians'], queryFn: getTechnicians });
  const [action, setAction] = useState<CaseAction>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const mutation = useMutation({ mutationFn: (work: () => Promise<SecurityCase>) => work(), onSuccess: async () => { setAction(null); setConflict(false); setError(''); await detail.refetch(); await client.invalidateQueries({ queryKey: ['security-cases'] }); await client.invalidateQueries({ queryKey: ['security-dashboard'] }); } });
  const canOperate = session?.account.role === 'Admin' || session?.account.role === 'Technician';
  async function run(work: () => Promise<SecurityCase>, message: string) { try { await mutation.mutateAsync(work); setFeedback(message); } catch (reason) { if (reason instanceof ApiError && reason.status === 409) setConflict(true); else setError(reason instanceof ApiError ? reason.detail ?? reason.message : 'The action could not be completed.'); } }
  if (detail.isPending) return <ListSkeleton rows={9} />;
  if (detail.isError || !detail.data) return <ErrorState title="Security case workspace could not be loaded." onRetry={() => void detail.refetch()} />;
  const item = detail.data;
  return <div className="page-stack security-workspace">
    <header className="security-case-hero"><div className="security-case-hero__identity"><Link className="breadcrumb" to="/security/cases"><ArrowLeft size={14} />Security cases</Link><div className="security-case-kicker"><SecurityCaseCode value={securityCaseCode(item)} />{item.synthetic ? <span className="synthetic-label">Synthetic Demo Data</span> : null}</div><h1>{item.title}</h1><p>{item.summary}</p><div className="security-case-hero__meta"><SeverityBadge severity={item.severity} /><SecurityStatusBadge status={item.status} /><span>v{item.version}</span></div></div><div className="security-case-hero__actions"><button className="button button--secondary" type="button" onClick={() => void detail.refetch()}><RefreshCw size={15} />Reload</button>{canOperate ? <><button className="button button--secondary" type="button" onClick={() => setAction('evidence')}><FileCheck2 size={15} />Add evidence</button><button className="button button--primary button--security" type="button" onClick={() => setAction('status')}>Change status</button></> : null}</div></header>
    {feedback ? <div className="toast toast--success" role="status">{feedback}<button type="button" onClick={() => setFeedback('')} aria-label="Dismiss message">×</button></div> : null}
    {conflict ? <div className="conflict-banner" role="alert"><div><strong>This security case was updated by another analyst.</strong><span>Reload the latest version before making another change.</span></div><button className="button button--secondary" type="button" onClick={() => { setConflict(false); setAction(null); void detail.refetch(); }}><RefreshCw size={15} />Reload latest version</button></div> : null}
    {error ? <div className="inline-alert" role="alert">{error}</div> : null}
    {action ? <CaseActionPanel action={action} item={item} technicians={technicians.data?.data ?? []} pending={mutation.isPending} onClose={() => setAction(null)} run={run} /> : null}
    <section className="security-source-strip" aria-label="Case source context"><div><small>Source ticket</small><Link to={`/tickets/${item.ticketId}`}><strong>{item.ticket.ticketCode ?? item.ticket.ticketNumber}</strong><span>{item.ticket.title}</span></Link></div><div><small>Linked asset</small>{item.asset ? <Link to={`/assets/${item.asset.id}`}><strong>{item.asset.assetCode ?? item.asset.assetTag}</strong><span>{item.asset.hostname || item.asset.name}</span></Link> : <p>No linked asset</p>}</div><div><small>Assigned analyst</small><p><strong>{item.assignedAnalyst?.user?.displayName ?? item.assignedAnalyst?.displayName ?? item.assignedAnalyst?.username ?? 'Unassigned'}</strong><span>{item.assignedAnalyst ? 'Security case owner' : 'Assignment required'}</span></p></div></section>
    <div className="security-workspace-grid"><div className="workspace-main">
      <section className="panel security-context"><header className="panel__header"><div><span className="section-kicker">Security context</span><h2>Escalation rationale</h2></div></header><dl><div><dt>Reason</dt><dd>{item.reason}</dd></div><div><dt>Severity</dt><dd><SeverityBadge severity={item.severity} /></dd></div><div><dt>Created by</dt><dd>{item.createdBy?.user?.displayName ?? item.createdBy?.displayName ?? item.createdBy?.username ?? 'System record'}</dd></div><div><dt>Created</dt><dd>{securityDate(item.createdAt)}</dd></div></dl></section>
      <section className="panel evidence-panel"><header className="panel__header"><div><span className="section-kicker">Sanitized records</span><h2>Evidence</h2></div>{canOperate ? <button className="text-button" type="button" onClick={() => setAction('evidence')}>Add evidence</button> : null}</header>{item.evidence?.length ? <div className="evidence-grid">{item.evidence.map((evidence, index) => <article className="evidence-card" key={evidence.id ?? evidence.evidenceId ?? index}><span className="evidence-type"><FileCheck2 size={14} />{securityLabel(evidence.type)}</span><h3>{evidence.title}</h3><p>{evidence.summary}</p><footer><span>{evidence.source}</span><time dateTime={evidence.createdAt}>{securityDate(evidence.createdAt)}</time></footer></article>)}</div> : <EmptyState title="No additional evidence yet." description="Analysts can attach sanitized diagnostic findings, collected event records, ticket context, or a manual note." />}</section>
    </div><aside className="workspace-context security-context-column">
      <section className="panel action-panel"><header><span className="section-kicker">Quick actions</span><h2>Case controls</h2></header>{canOperate ? <div className="security-action-list"><button type="button" onClick={() => setAction('assign')}>Assign analyst <ArrowRight size={14} /></button><button type="button" onClick={() => setAction('severity')}>Change severity <ArrowRight size={14} /></button><button type="button" onClick={() => setAction('status')}>Change status <ArrowRight size={14} /></button>{['Investigating', 'Contained'].includes(item.status) ? <button type="button" onClick={() => setAction('resolve')}>Resolve case <ArrowRight size={14} /></button> : null}{!['FalsePositive', 'Closed'].includes(item.status) ? <button type="button" onClick={() => setAction('false-positive')}>Mark false positive <ArrowRight size={14} /></button> : null}</div> : <p>Viewer access is read-only.</p>}<p className="action-help">Contained is a workflow state only. No endpoint action is performed.</p></section>
      <section className="panel security-timeline"><header className="panel__header"><div><span className="section-kicker">Append-oriented</span><h2>Timeline</h2></div></header>{item.timeline?.length ? <ol className="timeline">{item.timeline.map((entry) => <li key={entry.id}><span className="timeline__marker"><ShieldCheck size={13} /></span><div><strong>{securityLabel(entry.action)}</strong><p>{entry.summary}</p><time dateTime={entry.timestamp ?? entry.occurredAt ?? entry.createdAt}>{securityDate(entry.timestamp ?? entry.occurredAt ?? entry.createdAt)}</time></div></li>)}</ol> : <div className="mini-empty">No timeline entries.</div>}</section>
    </aside></div>
  </div>;
}

function CaseActionPanel({ action, item, technicians, pending, onClose, run }: { action: Exclude<CaseAction, null>; item: SecurityCase; technicians: Array<{ id: string; username: string; displayName?: string | null; user?: { displayName: string } }>; pending: boolean; onClose: () => void; run: (work: () => Promise<SecurityCase>, message: string) => Promise<void> }) {
  const [analystId, setAnalystId] = useState(item.assignedAnalystId ?? '');
  const [status, setStatus] = useState<SecurityCaseStatus>(statusTransitions[item.status][0] ?? item.status);
  const [severity, setSeverity] = useState<SecuritySeverity>(item.severity);
  const [reason, setReason] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [evidenceType, setEvidenceType] = useState<'ManualNote' | 'DiagnosticFinding' | 'EventLog'>('ManualNote');
  const [diagnosticJobId, setDiagnosticJobId] = useState('');
  const [windowsEventId, setWindowsEventId] = useState('');
  const [classification, setClassification] = useState('');
  const [lessons, setLessons] = useState('');
  const diagnosticHistory = useQuery({ queryKey: ['security-evidence-diagnostics', item.assetId], queryFn: () => getDiagnosticHistory(item.assetId ?? '', 1, 50), enabled: action === 'evidence' && Boolean(item.assetId) && evidenceType !== 'ManualNote' });
  const eventJob = useQuery({ queryKey: ['security-evidence-event-job', diagnosticJobId], queryFn: () => getDiagnosticJob(diagnosticJobId, 1), enabled: action === 'evidence' && evidenceType === 'EventLog' && Boolean(diagnosticJobId) });
  const heading = { assign: 'Assign analyst', status: 'Change case status', severity: 'Change severity', evidence: 'Add manual evidence', resolve: 'Resolve security case', 'false-positive': 'Mark as false positive' }[action];
  function submit(event: FormEvent) { event.preventDefault(); const v = item.version; if (action === 'assign') void run(() => assignSecurityCase(item.id, { assignedAnalystId: analystId || null, version: v }), 'Analyst assignment updated.'); if (action === 'status') void run(() => changeSecurityCaseStatus(item.id, { status, version: v, reason: reason || undefined }), `Status changed to ${securityLabel(status)}.`); if (action === 'severity') void run(() => changeSecurityCaseSeverity(item.id, { severity, reason, version: v }), `Severity changed to ${severity}.`); if (action === 'evidence' && evidenceType === 'ManualNote') void run(() => addManualSecurityEvidence(item.id, { title, summary, source: 'Analyst', version: v }), 'Sanitized evidence added.'); if (action === 'evidence' && evidenceType === 'DiagnosticFinding') void run(() => linkDiagnosticSecurityEvidence(item.id, { diagnosticJobId, title: title || undefined, version: v }), 'Diagnostic finding linked as sanitized evidence.'); if (action === 'evidence' && evidenceType === 'EventLog') void run(() => linkEventSecurityEvidence(item.id, { windowsEventId, title: title || undefined, version: v }), 'Collected event linked as sanitized evidence.'); if (action === 'resolve') void run(() => resolveSecurityCase(item.id, { resolutionSummary: summary, classification: classification || undefined, lessonsLearned: lessons || undefined, version: v }), 'Security case resolved.'); if (action === 'false-positive') void run(() => markSecurityCaseFalsePositive(item.id, { reason, version: v }), 'Case classified as false positive.'); }
  return <section className="case-action-panel" role="dialog" aria-modal="false" aria-labelledby="case-action-title"><header><div><span className="section-kicker">Case action · v{item.version}</span><h2 id="case-action-title">{heading}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close action"><X size={18} /></button></header><form onSubmit={submit}>
    {action === 'assign' ? <label className="field"><span>Security analyst</span><select value={analystId} onChange={(event) => setAnalystId(event.target.value)}><option value="">Unassigned</option>{technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.user?.displayName ?? tech.displayName ?? tech.username}</option>)}</select></label> : null}
    {action === 'status' ? <label className="field"><span>Next status</span><select value={status} onChange={(event) => setStatus(event.target.value as SecurityCaseStatus)}>{statusTransitions[item.status].map((value) => <option value={value} key={value}>{securityLabel(value)}</option>)}</select></label> : null}
    {action === 'severity' ? <label className="field"><span>Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as SecuritySeverity)}>{securitySeverities.map((value) => <option value={value} key={value}>{value}</option>)}</select></label> : null}
    {action === 'evidence' ? <><label className="field"><span>Evidence type</span><select value={evidenceType} onChange={(event) => { setEvidenceType(event.target.value as typeof evidenceType); setDiagnosticJobId(''); setWindowsEventId(''); }}><option value="ManualNote">Manual note</option><option value="DiagnosticFinding" disabled={!item.assetId}>Existing diagnostic finding</option><option value="EventLog" disabled={!item.assetId}>Existing System/Application event</option></select></label><label className="field"><span>Evidence title {evidenceType === 'ManualNote' ? '' : '(optional)'}</span><input required={evidenceType === 'ManualNote'} minLength={2} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label></> : null}
    {action === 'evidence' && evidenceType === 'DiagnosticFinding' ? <label className="field"><span>Persisted diagnostic result</span><select required value={diagnosticJobId} onChange={(event) => setDiagnosticJobId(event.target.value)}><option value="">Select a completed diagnostic</option>{(diagnosticHistory.data?.data ?? []).filter((job) => job.status === 'Succeeded' && job.result).map((job) => <option value={job.id} key={job.id}>{diagnosticName(job.actionId)} · {formatDateTime(job.completedAt ?? job.requestedAt)}</option>)}</select><small>Only structured findings are copied. Raw stdout is never stored.</small></label> : null}
    {action === 'evidence' && evidenceType === 'EventLog' ? <><label className="field"><span>Persisted event query</span><select required value={diagnosticJobId} onChange={(event) => { setDiagnosticJobId(event.target.value); setWindowsEventId(''); }}><option value="">Select an existing event-log result</option>{(diagnosticHistory.data?.data ?? []).filter((job) => job.status === 'Succeeded' && job.actionId === 'eventlog.query').map((job) => <option value={job.id} key={job.id}>{diagnosticName(job.actionId)} · {formatDateTime(job.completedAt ?? job.requestedAt)}</option>)}</select></label><label className="field"><span>Collected System/Application event</span><select required value={windowsEventId} onChange={(event) => setWindowsEventId(event.target.value)} disabled={!diagnosticJobId || eventJob.isPending}><option value="">Select a sanitized event</option>{(eventJob.data?.events ?? []).map((entry) => <option value={entry.id} key={entry.id}>{entry.provider} · Event {entry.eventId} · {entry.level}</option>)}</select><small>No new query is executed.</small></label></> : null}
    {(action === 'evidence' && evidenceType === 'ManualNote') || action === 'resolve' ? <label className="field"><span>{action === 'resolve' ? 'Resolution summary' : 'Sanitized summary'}</span><textarea required minLength={3} maxLength={4000} rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} /><small>Do not include passwords, tokens, raw diagnostic output, or unnecessary personal data.</small></label> : null}
    {action === 'resolve' ? <><label className="field"><span>Classification (optional)</span><input maxLength={120} value={classification} onChange={(event) => setClassification(event.target.value)} /></label><label className="field"><span>Lessons learned (optional)</span><textarea maxLength={2000} rows={3} value={lessons} onChange={(event) => setLessons(event.target.value)} /></label></> : null}
    {['status', 'severity', 'false-positive'].includes(action) ? <label className="field"><span>Reason{action === 'status' ? ' (recommended)' : ''}</span><textarea required={action !== 'status'} minLength={3} maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label> : null}
    <footer><button className="button button--secondary" type="button" onClick={onClose}>Cancel</button><button className="button button--primary button--security" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Confirm action'}</button></footer>
  </form></section>;
}

function SecurityCompactCase({ item }: { item: SecurityCase }) { return <Link className="security-compact" to={`/security/cases/${item.id}`}><div><SecurityCaseCode value={securityCaseCode(item)} /><strong>{item.title}</strong><span>{item.ticket.ticketCode ?? item.ticket.ticketNumber} · {item.asset?.assetCode ?? item.asset?.assetTag ?? 'No linked asset'}</span></div><SeverityBadge severity={item.severity} /><SecurityStatusBadge status={item.status} /></Link>; }
function FilterSelect({ label, value, options, onChange }: { label: string; value?: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) { return <label className={value ? 'filter-select filter-select--active' : 'filter-select'}><span className="sr-only">{label}</span><select value={value ?? ''} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>; }
