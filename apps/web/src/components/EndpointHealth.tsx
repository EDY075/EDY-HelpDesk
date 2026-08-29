import {useQuery} from '@tanstack/react-query';
import {Activity,ArrowUpRight,CheckCircle2,Clock3,Info,ShieldCheck,TriangleAlert} from 'lucide-react';
import {Link} from 'react-router-dom';
import {getDiagnosticCatalog,getDiagnosticHistory,collectedAgo,diagnosticName,type DiagnosticFinding} from '../lib/diagnostics';
import {ErrorState,ListSkeleton} from './Feedback';
import {useAuth} from './Auth';
import {translateUi} from '../i18n/I18nProvider';

export function HealthBadge({severity}:{severity:string}){const Icon=severity==='Healthy'||severity==='Succeeded'?CheckCircle2:severity==='Warning'||severity==='Critical'||severity==='Failed'||severity==='TimedOut'?TriangleAlert:severity==='Running'||severity==='Queued'?Activity:Info;return <span className={`health-badge health-badge--${severity.toLowerCase()}`}><Icon size={13} aria-hidden="true"/>{translateUi(severity)}</span>;}
export function DiagnosticMode({mode}:{mode:string}){return <div className={`diagnostic-mode diagnostic-mode--${mode.toLowerCase()}`}><ShieldCheck size={17} aria-hidden="true"/><div><strong>{translateUi(mode==='Demo'?'Portfolio Demo · synthetic results':'Local Operational · read-only')}</strong><span>{translateUi(mode==='Demo'?'Live diagnostics disabled in Portfolio Demo. No PowerShell is executed.':'Private local observations. No remediation, remote targets or elevated execution.')}</span></div></div>;}
export function EndpointHealth({assetId,compact=false}:{assetId:string;compact?:boolean}){
  const {session}=useAuth();
  const q=useQuery({queryKey:['endpoint-health',assetId],queryFn:()=>getDiagnosticHistory(assetId,1,50),refetchInterval:10000});
  const catalog=useQuery({queryKey:['diagnostic-catalog'],queryFn:getDiagnosticCatalog,staleTime:10000});
  if(q.isPending)return <ListSkeleton rows={3}/>;
  if(q.isError)return <ErrorState title="Endpoint health is unavailable." onRetry={()=>void q.refetch()}/>;
  const latest=q.data.data.filter(j=>j.result).filter((j,i,list)=>list.findIndex(x=>x.actionId===j.actionId)===i);
  const groups=['System','Resources','Network','Services','Updates'];
  const allFindings=latest.flatMap(j=>j.result?.findings??[]);
  const important=allFindings.filter(f=>['Critical','Warning'].includes(f.severity));
  const canRun=catalog.data?.mode==='Operational'&&catalog.data.liveExecutionEnabled&&catalog.data.localAssetId===assetId&&session?.account.role!=='Viewer';
  return <section className={`panel endpoint-health${compact?' endpoint-health--compact':''}`}>
    <header className="panel__header"><div><span className="section-kicker">{compact?'Support context':'Local diagnostics'}</span><h2>Endpoint health</h2></div><Link className="text-link" to={`/assets/${assetId}${compact?'':'/diagnostics'}`}>{compact?'Open Endpoint 360':'Diagnostic workspace'}<ArrowUpRight size={15}/></Link></header>
    <DiagnosticMode mode={q.data.mode}/>
    <div className="health-overview">{groups.map(area=>{const found=allFindings.filter(f=>f.area===area);const rank=['Healthy','Info','Unknown','Warning','Critical'];const severity=found.length?[...found].sort((a,b)=>rank.indexOf(b.severity)-rank.indexOf(a.severity))[0]!.severity:'Unknown';const stale=latest.some(j=>j.result?.findings.some(f=>f.area===area)&&j.freshness!=='Fresh');const observationLabel=found.length===1?translateUi('observation'):translateUi('observations');return <div className="health-domain" key={area}><span>{translateUi(area)}</span><HealthBadge severity={severity}/><small>{found.length?`${translateUi(stale?'Stale':'Fresh')} · ${found.length} ${observationLabel}`:translateUi('No collected data')}</small></div>;})}</div>
    {latest[0]?.result?<div className="diagnostic-freshness"><Clock3 size={14}/><span>{translateUi('Last diagnostic')}: {diagnosticName(latest[0].actionId)} · {collectedAgo(latest[0].result.collectedAt)} · {((latest[0].durationMs??0)/1000).toFixed(1)}s</span><strong title={translateUi('Fresh means collected within 15 minutes; status is a snapshot, not continuous monitoring.')}>{translateUi(latest[0].freshness ?? 'Unknown')}</strong></div>:<p className="mini-empty">No diagnostic history. Opening this workspace does not start a check.</p>}
    {important.length?<div className="health-findings"><span className="section-kicker">Potential support areas</span>{important.slice(0,compact?2:4).map(f=><FindingRow key={f.key} finding={f}/>)}<Link className="text-link" to={important.some(f=>f.area==='Network')?'/knowledge?search=network':'/knowledge'}>Search related knowledge<ArrowUpRight size={13}/></Link></div>:null}
    {!compact?<footer className="health-actions"><Link className="button button--secondary" to={`/assets/${assetId}/diagnostics?action=windows.system.summary`}>{canRun?'Run System Check':'Review System Checks'}</Link><Link className="button button--secondary" to={`/assets/${assetId}/diagnostics?action=network.ip.configuration`}>{canRun?'Run Network Check':'Review Network Checks'}</Link><Link className="button button--ghost" to={`/assets/${assetId}/diagnostics?action=eventlog.query`}>View Event Logs</Link><small>{catalog.data?.mode==='Demo'?'Review synthetic examples; live execution is locked.':'Actions open a review form. Nothing runs automatically.'}</small></footer>:null}
  </section>;
}
export function FindingRow({finding}:{finding:DiagnosticFinding}){return <div className="finding-row"><div><strong>{finding.label}</strong><p>{finding.detail}</p><small>{finding.recommendation}</small></div><HealthBadge severity={finding.severity}/></div>;}
