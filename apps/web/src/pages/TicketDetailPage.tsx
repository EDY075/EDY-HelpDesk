import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock3, Laptop, LockKeyhole, MessageSquare, RefreshCw, RotateCcw, UserRound } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../components/Auth';
import { ErrorState, ListSkeleton } from '../components/Feedback';
import { TicketResources } from '../components/TicketResources';
import {EndpointHealth} from '../components/EndpointHealth';
import { TicketSecurity } from '../components/TicketSecurity';
import { PriorityIndicator, SlaIndicator, StatusChip, TicketCode } from '../components/TicketPrimitives';
import { addComment, ApiError, assignTicket, getMetadata, getTicket, transitionTicket, type TicketStatus } from '../lib/api';
import { formatDateTime, translateUi } from '../i18n/I18nProvider';

const allowed: Record<TicketStatus, TicketStatus[]> = { New: ['Assigned'], Assigned: ['InProgress'], InProgress: ['WaitingUser', 'WaitingThirdParty', 'Resolved'], WaitingUser: ['InProgress'], WaitingThirdParty: ['InProgress'], Resolved: ['Closed', 'InProgress'], Closed: [] };

export function TicketDetailPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const ticket = useQuery({ queryKey: ['ticket', id], queryFn: () => getTicket(id), enabled: Boolean(id) });
  const metadata = useQuery({ queryKey: ['metadata'], queryFn: getMetadata });
  const [feedback, setFeedback] = useState((location.state as { message?: string } | null)?.message ?? '');
  const [conflict, setConflict] = useState(false);
  const [actionError, setActionError] = useState('');
  const mutation = useMutation({ mutationFn: async (work: () => Promise<unknown>) => work(), onSuccess: async () => { setConflict(false); setActionError(''); await ticket.refetch(); await queryClient.invalidateQueries({ queryKey: ['tickets'] }); } });
  const canOperate = ticket.data && (session?.account.role === 'Admin' || ticket.data.assignee?.id === session?.account.id);
  const nextStatuses = useMemo(() => ticket.data ? allowed[ticket.data.status] : [], [ticket.data]);

  async function run(work: () => Promise<unknown>, message: string) {
    try { await mutation.mutateAsync(work); setFeedback(message); }
    catch (reason) { if (reason instanceof ApiError && reason.status === 409 && reason.detail?.includes('updated by another technician')) setConflict(true); else setActionError(reason instanceof ApiError ? reason.detail ?? reason.message : 'The action could not be completed.'); }
  }

  if (ticket.isPending) return <ListSkeleton rows={8} />;
  if (ticket.isError || !ticket.data) return <ErrorState title="Ticket workspace could not be loaded." onRetry={() => void ticket.refetch()} />;
  const item = ticket.data;
  return <div className="page-stack ticket-workspace">
    <header className="ticket-hero"><div className="ticket-hero__identity"><Link className="breadcrumb" to="/tickets"><ArrowLeft size={14} />Ticket queue</Link><TicketCode ticket={item} /><h1>{item.title}</h1><div className="ticket-hero__meta"><PriorityIndicator priority={item.priority} /><StatusChip status={item.status} /><SlaIndicator ticket={item} /></div></div><div className="ticket-hero__actions"><button className="button button--secondary" type="button" onClick={() => void ticket.refetch()}><RefreshCw size={15} />Reload</button><a className="button button--secondary" href="#ticket-security">Security status</a></div></header>
    {feedback ? <div className="toast toast--success" role="status">{feedback}<button type="button" onClick={() => setFeedback('')} aria-label="Dismiss message">×</button></div> : null}
    {conflict ? <div className="conflict-banner" role="alert"><div><strong>This ticket was updated by another technician.</strong><span>Reload the latest version before making another change.</span></div><button className="button button--secondary" type="button" onClick={() => { setConflict(false); void ticket.refetch(); }}><RotateCcw size={15} />Reload latest version</button></div> : null}
    {actionError ? <div className="inline-alert" role="alert">{actionError}</div> : null}
    <div className="workspace-grid">
      <div className="workspace-main">
        <section className="panel ticket-description"><header className="panel__header"><div><span className="section-kicker">Request</span><h2>Description</h2></div></header><p>{item.description}</p>{item.solution ? <div className="solution-block"><strong>Resolution</strong><p>{item.solution}</p></div> : null}</section>
        <section className="panel activity-panel"><header className="panel__header"><div><span className="section-kicker">Chronology</span><h2>Activity</h2></div></header>
          {item.timeline?.length ? <ol className="timeline">{item.timeline.map((entry, index) => <li key={(entry as { id?: string }).id ?? index}><span className="timeline__marker">{(entry as { internal?: boolean }).internal ? <LockKeyhole size={13} /> : <MessageSquare size={13} />}</span><div><strong>{activityTitle(entry)}</strong><p>{(entry as { body?: string }).body ?? activityDetail(entry)}</p><time>{formatDate((entry as { createdAt: string }).createdAt)}</time></div></li>)}</ol> : <div className="mini-empty">No activity yet.</div>}
        </section>
        <TicketResources ticket={item} />
        <TicketSecurity ticket={item} />
        {item.asset ? <EndpointHealth assetId={item.asset.id} compact/> : null}
        {canOperate && session?.account.role !== 'Viewer' ? <CommentComposer internalAllowed version={item.version} pending={mutation.isPending} onSubmit={(content, type) => run(() => addComment(item.id, { content, type, version: item.version }), type === 'Internal' ? 'Internal note added.' : 'Public comment added.')} /> : null}
      </div>
      <aside className="workspace-context">
        <section className="panel action-panel"><header><span className="section-kicker">Actions</span><h2>Move work forward</h2></header>
          {!item.assignee && session?.account.role !== 'Viewer' ? <button className="button button--primary button--wide" type="button" disabled={mutation.isPending} onClick={() => void run(() => assignTicket(item.id, { assigneeAccountId: session!.account.role === 'Technician' ? session!.account.id : metadata.data?.technicians?.[0]?.id ?? null, version: item.version }), 'Ticket assigned.')}>Assign ticket</button> : null}
          {session?.account.role === 'Admin' ? <label className="field"><span>Assignee</span><select value={item.assignee?.id ?? ''} onChange={(event) => void run(() => assignTicket(item.id, { assigneeAccountId: event.target.value || null, version: item.version }), 'Assignment updated.')}><option value="">Unassigned</option>{metadata.data?.technicians?.map((tech) => <option value={tech.id} key={tech.id}>{tech.user?.displayName ?? tech.username}</option>)}</select></label> : null}
          {nextStatuses.length && canOperate ? <TransitionForm statuses={nextStatuses} current={item.status} pending={mutation.isPending} onSubmit={(toStatus, reason, solution) => run(() => transitionTicket(item.id, { toStatus, version: item.version, reason: reason || undefined, solution: solution || undefined }), `Status changed to ${labelStatus(toStatus)}.`)} /> : <p className="action-help">{item.status === 'Closed' ? 'This ticket is closed.' : 'Assignment is required before operational transitions.'}</p>}
        </section>
        <section className="panel context-card"><header><span className="section-kicker">Context</span><h2>Request details</h2></header><dl><div><dt><UserRound size={14} />Requester</dt><dd>{item.requester.displayName}</dd></div><div><dt>Department</dt><dd>{item.department?.name ?? 'No department snapshot'}</dd></div><div><dt>Category</dt><dd>{item.category.name}</dd></div><div><dt><Laptop size={14} />Related asset</dt><dd>{item.asset ? `${item.asset.assetTag} · ${item.asset.name}` : 'No related asset'}</dd></div><div><dt><Clock3 size={14} />Created</dt><dd>{formatDate(item.createdAt)}</dd></div><div><dt>Updated</dt><dd>{formatDate(item.updatedAt)}</dd></div><div><dt>Version</dt><dd className="mono">v{item.version}</dd></div></dl></section>
      </aside>
    </div>
  </div>;
}

function CommentComposer({ internalAllowed, version, pending, onSubmit }: { internalAllowed: boolean; version: number; pending: boolean; onSubmit: (content: string, type: 'Public' | 'Internal') => Promise<void> }) {
  const [type, setType] = useState<'Public' | 'Internal'>('Public'); const [content, setContent] = useState('');
  return <form className="panel composer" onSubmit={(event) => { event.preventDefault(); void onSubmit(content, type).then(() => setContent('')); }}><header><div><span className="section-kicker">Respond</span><h2>Add to conversation</h2></div><div className="segmented"><button type="button" className={type === 'Public' ? 'active' : ''} onClick={() => setType('Public')}>Public</button>{internalAllowed ? <button type="button" className={type === 'Internal' ? 'active' : ''} onClick={() => setType('Internal')}><LockKeyhole size={12} />Internal</button> : null}</div></header><textarea value={content} onChange={(event) => setContent(event.target.value)} rows={4} required maxLength={10000} placeholder={type === 'Internal' ? 'Add an internal note visible to technicians…' : 'Write a clear update for the requester…'} /><footer><span>Ticket version v{version}</span><button className="button button--primary" type="submit" disabled={pending || !content.trim()}>Add {type === 'Internal' ? 'note' : 'comment'}</button></footer></form>;
}

function TransitionForm({ statuses, current, pending, onSubmit }: { statuses: TicketStatus[]; current: TicketStatus; pending: boolean; onSubmit: (status: TicketStatus, reason: string, solution: string) => Promise<void> }) {
  const [status, setStatus] = useState<TicketStatus>(statuses[0]!); const [reason, setReason] = useState(''); const [solution, setSolution] = useState(''); const needsReason = status === 'WaitingUser' || status === 'WaitingThirdParty' || (current === 'Resolved' && status === 'InProgress');
  return <form className="transition-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSubmit(status, reason, solution); }}><label className="field"><span>Next status</span><select value={status} onChange={(event) => setStatus(event.target.value as TicketStatus)}>{statuses.map((value) => <option key={value} value={value}>{labelStatus(value)}</option>)}</select></label>{needsReason ? <label className="field"><span>Reason</span><textarea rows={3} required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label> : null}{status === 'Resolved' ? <label className="field"><span>Solution</span><textarea rows={4} required minLength={3} value={solution} onChange={(event) => setSolution(event.target.value)} /></label> : null}<button className="button button--primary button--wide" type="submit" disabled={pending}>Change status</button></form>;
}

function labelStatus(value: string) { return translateUi(value.replace(/([a-z])([A-Z])/g, '$1 $2')); }
function formatDate(value: string) { return formatDateTime(value); }
function activityTitle(entry: unknown) { const item = entry as { kind?: string; action?: string; internal?: boolean }; if (item.internal || item.kind === 'internalNote') return 'Internal note'; if (item.kind === 'comment') return 'Public comment'; return (item.action ?? 'Ticket updated').replace(/[._]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function activityDetail(entry: unknown) { const item = entry as { fromStatus?: string; toStatus?: string }; return item.fromStatus && item.toStatus ? `${labelStatus(item.fromStatus)} → ${labelStatus(item.toStatus)}` : 'Recorded in ticket history.'; }
