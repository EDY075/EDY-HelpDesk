import { AlertTriangle, CircleCheck, CircleDashed, CirclePause, Clock3, UserRoundCheck } from 'lucide-react';
import type { Ticket, TicketPriority, TicketStatus } from '../lib/api';
import { currentLanguage, formatDateTime, translateUi } from '../i18n/I18nProvider';

const statusLabels: Record<TicketStatus, string> = { New: 'New', Assigned: 'Assigned', InProgress: 'In progress', WaitingUser: 'Waiting for user', WaitingThirdParty: 'Waiting third party', Resolved: 'Resolved', Closed: 'Closed' };
const statusIcons = { New: CircleDashed, Assigned: UserRoundCheck, InProgress: Clock3, WaitingUser: CirclePause, WaitingThirdParty: CirclePause, Resolved: CircleCheck, Closed: CircleCheck };

export function TicketCode({ ticket }: { ticket: Ticket }) { return <span className="ticket-code">{ticket.ticketCode ?? ticket.ticketNumber ?? ticket.id.slice(0, 8)}</span>; }
export function StatusChip({ status }: { status: TicketStatus }) { const Icon = statusIcons[status]; return <span className={`status-chip status-chip--${status.toLowerCase()}`}><Icon size={13} aria-hidden="true" />{translateUi(statusLabels[status])}</span>; }
export function PriorityIndicator({ priority }: { priority: TicketPriority }) { return <span className={`priority priority--${priority.toLowerCase()}`}><i aria-hidden="true" />{translateUi(priority)}</span>; }

export function SlaIndicator({ ticket, compact = false }: { ticket: Ticket; compact?: boolean }) {
  const sla = ticket.sla ?? ticket.ticketSla;
  if (!sla) return <span className="sla sla--neutral">{translateUi('No SLA policy')}</span>;
  const due = sla.resolutionDueAt ? new Date(sla.resolutionDueAt) : null;
  const remaining = ticket.slaState?.remainingSeconds ?? sla.remainingSeconds ?? null;
  const state = sla.state ?? (ticket.slaState?.stopped ? 'stopped' : ticket.slaState?.paused ? 'paused' : ticket.slaState?.breached ? 'breached' : ticket.slaState?.atRisk ? 'at-risk' : 'healthy');
  const pt = currentLanguage() === 'pt-BR';
  const label = state === 'stopped' ? (pt ? 'Encerrado' : 'Stopped') : state === 'paused' ? translateUi('Paused') : remaining === null ? (pt ? 'Monitorado' : 'Tracked') : remaining < 0 ? `${formatDuration(Math.abs(remaining))} ${pt ? 'em atraso' : 'overdue'}` : `${formatDuration(remaining)} ${pt ? 'restantes' : 'left'}`;
  return <span className={`sla sla--${state}`} title={due ? `${pt ? 'Prazo de resolução' : 'Resolution target'} ${formatDateTime(due)}` : undefined}>{state === 'breached' || state === 'at-risk' ? <AlertTriangle size={compact ? 12 : 14} aria-hidden="true" /> : <Clock3 size={compact ? 12 : 14} aria-hidden="true" />}{compact ? label : `${pt ? 'Resolução' : 'Resolution'} · ${label}`}</span>;
}

function formatDuration(seconds: number) { const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600); const minutes = Math.max(0, Math.floor((seconds % 3600) / 60)); return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`; }

export function Avatar({ name, small = false }: { name: string; small?: boolean }) { const initials = name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(); return <span className={`avatar${small ? ' avatar--small' : ''}`} aria-hidden="true">{initials}</span>; }
