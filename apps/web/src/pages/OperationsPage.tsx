import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Database, Server, ShieldCheck, TicketCheck } from 'lucide-react';
import { BarChart, MetricCard } from '../components/AnalyticsPrimitives';
import { ErrorState, ListSkeleton } from '../components/Feedback';
import { getDashboard, getIntegrations } from '../lib/api';
import { formatDateTime, translateUi } from '../i18n/I18nProvider';

export function OperationsPage(){
  const query=useQuery({queryKey:['dashboard','operations'],queryFn:()=>getDashboard({range:'7d'}),refetchInterval:30_000});
  const integrations=useQuery({queryKey:['integrations'],queryFn:getIntegrations,refetchInterval:30_000});
  if(query.isPending)return <div className="page-stack"><section className="panel"><ListSkeleton rows={8}/></section></div>;
  if(query.isError)return <div className="page-stack"><section className="panel"><ErrorState onRetry={()=>void query.refetch()}/></section></div>;
  const {operations}=query.data;
  const outboxState=integrations.isPending?'Loading':integrations.isError?'Attention':(integrations.data.outbox.failed+integrations.data.outbox.deadLetter)>0?'Attention':'Ready';
  return <div className="page-stack operations-center">
    <header className="page-header"><div><span className="eyebrow eyebrow--accent">Live operational context</span><h1>Operations Center</h1><p>A dense, real-data view of attention, activity, workload and local platform health.</p></div><span className="mode-pill">{query.data.mode==='Demo'?'Portfolio Demo · Synthetic':'Local Operational · Private'}</span></header>
    <section className="analytics-metrics attention-metrics"><MetricCard label="SLA at risk" value={operations.attention.slaAtRisk} tone="warning"/><MetricCard label="SLA breached" value={operations.attention.slaBreached} tone="critical"/><MetricCard label="Critical tickets" value={operations.attention.criticalTickets} tone="critical"/><MetricCard label="Unassigned" value={operations.attention.unassignedTickets}/><MetricCard label="Endpoint warnings" value={operations.attention.endpointWarnings} tone="warning"/><MetricCard label="Open security cases" value={operations.attention.openSecurityCases}/></section>
    <section className="operations-grid">
      <article className="panel operations-health"><header className="panel__header"><div><span className="section-kicker">Health</span><h2>Local platform</h2></div></header><div><Health icon={Server} label="API" value={operations.health.api}/><Health icon={Database} label="Database" value={operations.health.database}/><Health icon={Activity} label="Diagnostics Worker" value={operations.health.diagnosticsWorker}/><Health icon={ShieldCheck} label="Outbox" value={outboxState}/></div><small>Worker heartbeat: {query.data.mode==='Demo'?'Not required in Portfolio Demo':operations.health.workerHeartbeatAt?formatDateTime(operations.health.workerHeartbeatAt):'No heartbeat available'}</small></article>
      <article className="panel operations-health integration-health"><header className="panel__header"><div><span className="section-kicker">Optional boundaries</span><h2>Integration health</h2></div></header>{integrations.data?.integrations.map(item=><Health key={item.id} icon={Activity} label={item.name.replace('EDY ','')} value={item.status==='ExportReady'?'Export Ready':item.status}/>)??<p className="chart-empty">Integration health unavailable.</p>}</article>
      <BarChart title="Current workload" description="Active assignments by technician; informational, not a performance ranking." data={operations.workload.map(item=>({label:item.name,value:item.total}))} tone="success"/>
    </section>
    <section className="recent-activity-grid"><Recent title="Recent tickets" icon={TicketCheck} items={operations.recent.tickets}/><Recent title="Recent diagnostics" icon={Activity} items={operations.recent.diagnostics}/><Recent title="Recent security escalations" icon={ShieldCheck} items={operations.recent.securityCases}/></section>
  </div>;
}
function Health({icon:Icon,label,value}:{icon:typeof Activity;label:string;value:string}){const tone=value==='Ready'||value==='Export Ready'?'health-ready':value==='Disabled'?'health-neutral':'health-attention';return <div className="health-line"><Icon size={16}/><span>{label}</span><strong className={tone}>{translateUi(value)}</strong></div>}
function Recent({title,icon:Icon,items}:{title:string;icon:typeof Activity;items:unknown[]}){return <article className="panel recent-card"><header className="panel__header"><div><span className="section-kicker">Recent activity</span><h2>{title}</h2></div><Icon size={17}/></header>{items.length?<div>{items.map((raw,index)=>{const item=raw as Record<string,unknown>;const key=scalar(item.id)??String(index),identity=scalar(item.ticketNumber)??scalar(item.actionId)??scalar(item.securityCaseCode)??'Activity',summary=scalar(item.title)??scalar(item.status)??'Recorded',timestamp=scalar(item.updatedAt)??scalar(item.requestedAt);return <p key={key}><strong>{identity}</strong><span>{translateUi(summary)}</span><small>{timestamp?formatDateTime(timestamp):'Timestamp unavailable'}</small></p>})}</div>:<p className="chart-empty"><AlertTriangle size={15}/>No data available.</p>}</article>}
function scalar(value:unknown):string|undefined{return typeof value==='string'||typeof value==='number'?String(value):undefined}
