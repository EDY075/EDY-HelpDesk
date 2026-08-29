import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ShieldAlert, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from './Auth';
import { SecurityCaseCode, SecurityStatusBadge, SeverityBadge } from './SecurityPrimitives';
import { securityCaseCode } from '../lib/security-ui';
import { ApiError, escalateTicketToSecurity, getTicketSecurityCase, securitySeverities, type SecuritySeverity, type Ticket } from '../lib/api';

export function TicketSecurity({ ticket }: { ticket: Ticket }) {
  const { session } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState('');
  const [severity, setSeverity] = useState<SecuritySeverity>('Medium');
  const intentKey = useRef(crypto.randomUUID());
  const security = useQuery({ queryKey: ['ticket-security-case', ticket.id], queryFn: () => getTicketSecurityCase(ticket.id) });
  const securityCase = security.data ?? null;
  const canEscalate = session?.account.role === 'Admin' || session?.account.role === 'Technician';
  const mutation = useMutation({
    mutationFn: () => escalateTicketToSecurity(ticket.id, { reason, severity, summary }, intentKey.current),
    onSuccess: async () => { setOpen(false); setFeedback('Ticket escalated to Security.'); intentKey.current = crypto.randomUUID(); await client.invalidateQueries({ queryKey: ['ticket', ticket.id] }); await client.invalidateQueries({ queryKey: ['ticket-security-case', ticket.id] }); await client.invalidateQueries({ queryKey: ['security-cases'] }); },
    onError: (value) => setError(value instanceof ApiError ? value.detail ?? value.message : 'Security escalation could not be completed.'),
  });
  function submit(event: FormEvent) { event.preventDefault(); setError(''); mutation.mutate(); }
  return <section className="panel ticket-security" id="ticket-security"><header className="panel__header"><div><span className="section-kicker">Security status</span><h2>{security.isPending ? 'Checking security status' : securityCase ? 'Escalated for analyst review' : 'Not escalated'}</h2></div><span className="security-section-icon"><ShieldAlert size={18} aria-hidden="true" /></span></header>
    {feedback ? <div className="toast toast--success" role="status">{feedback}</div> : null}
    {security.isPending ? <div className="ticket-security__empty"><p>Loading security status…</p></div> : security.isError ? <div className="ticket-security__empty"><p>Security status is temporarily unavailable.</p><button className="button button--secondary" type="button" onClick={() => void security.refetch()}>Retry</button></div> : securityCase ? <div className="ticket-security__case"><div><SecurityCaseCode value={securityCaseCode(securityCase)} /><strong>{securityCase.title}</strong><p>Security owns the investigation record; this ticket remains the support source.</p></div><SeverityBadge severity={securityCase.severity} /><SecurityStatusBadge status={securityCase.status} /><Link className="button button--secondary" to={`/security/cases/${securityCase.id}`}>Open Security Case <ArrowRight size={14} /></Link></div> : <div className="ticket-security__empty"><p>No security case is linked to this ticket. Escalation creates one durable case and does not perform technical containment.</p>{canEscalate ? <button className="button button--secondary" type="button" onClick={() => setOpen(true)}><ShieldAlert size={15} />Escalate to Security</button> : null}</div>}
    {open ? <section className="security-escalation" role="dialog" aria-modal="false" aria-labelledby="escalation-title"><header><div><span className="section-kicker">Authorized escalation</span><h3 id="escalation-title">Create a security case</h3></div><button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close escalation"><X size={17} /></button></header><form onSubmit={submit}><label className="field"><span>Reason</span><textarea required minLength={3} maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why this ticket requires security review" /></label><label className="field"><span>Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as SecuritySeverity)}>{securitySeverities.map((value) => <option value={value} key={value}>{value}</option>)}</select><small>Select based on observed impact and urgency; the frontend does not infer severity.</small></label><label className="field"><span>Security summary</span><textarea required minLength={3} maxLength={5000} rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Provide concise, sanitized context for the analyst" /></label>{error ? <div className="inline-alert" role="alert">{error}</div> : null}<footer><button className="button button--secondary" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="button button--primary button--security" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Escalating…' : 'Create Security Case'}</button></footer></form></section> : null}
  </section>;
}
