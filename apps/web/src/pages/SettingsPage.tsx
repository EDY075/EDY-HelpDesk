import { useQuery } from '@tanstack/react-query';
import { Clock3, Database, Link2Off, MonitorCog, ShieldCheck } from 'lucide-react';

import { ErrorState, ListSkeleton } from '../components/Feedback';
import { getSettings } from '../lib/api';
import { LanguageSelector, ThemeSelector } from '../components/PreferenceControls';
import { translateUi } from '../i18n/I18nProvider';

export function SettingsPage() {
  const query = useQuery({ queryKey: ['settings'], queryFn: getSettings, staleTime: 30_000 });
  if (query.isPending) return <div className="page-stack"><section className="panel"><ListSkeleton rows={6} /></section></div>;
  if (query.isError) return <div className="page-stack"><section className="panel"><ErrorState onRetry={() => void query.refetch()} /></section></div>;
  const data = query.data;
  return <div className="page-stack settings-page"><header className="page-header"><div><span className="eyebrow eyebrow--accent">Effective configuration</span><h1>Settings</h1><p>Theme and language are local interface preferences. Operational values below remain read-only and API-reported.</p></div><span className="mode-pill">{data.application.mode === 'Demo' ? 'DEMO DATA' : 'Local Operational'}</span></header><section className="panel appearance-settings" aria-labelledby="appearance-title"><header><span className="eyebrow eyebrow--accent">Interface preferences</span><h2 id="appearance-title">Appearance</h2><p>Choose the interface language and visual density that best supports your work.</p></header><div><ThemeSelector /><LanguageSelector /></div></section><section className="settings-grid">
    <Card icon={MonitorCog} title="Application" rows={[['Version', data.application.version], ['Mode', translateUi(data.application.mode)]]} />
    <Card icon={Database} title="Database" rows={[['Provider', data.application.databaseProvider.toUpperCase()], ['Persistence', 'Local configured storage']]} />
    <Card icon={Clock3} title="Session" rows={[['Idle timeout', translateUi(`${data.session.idleMinutes} minutes`)], ['Absolute timeout', translateUi(`${data.session.absoluteHours} hours`)], ['Cookie policy', `HttpOnly · SameSite ${data.session.cookies.sameSite}`]]} />
    <Card icon={ShieldCheck} title="Diagnostics" rows={[['Worker', data.diagnostics.workerIsolated ? 'Isolated process' : 'Unavailable'], ['Real execution', data.diagnostics.realExecutionEnabled ? 'Local allowlist only' : 'Disabled'], ['Elevation', data.diagnostics.elevationAllowed ? 'Allowed' : 'Denied'], ['Arbitrary commands', data.diagnostics.arbitraryCommandsAllowed ? 'Allowed' : 'Denied']]} />
    <Card icon={Link2Off} title="Integrations" rows={[['External delivery', data.integrations.externalEnabled ? 'Enabled by approved config' : 'Disabled'], ['Portfolio Demo lock', data.integrations.portfolioDemoLock ? 'Enforced' : 'Not applicable']]} />
  </section></div>;
}

function Card({ icon: Icon, title, rows }: { icon: typeof MonitorCog; title: string; rows: Array<[string, string]> }) { return <article className="panel settings-card"><header><span><Icon size={18} /></span><h2>{title}</h2></header><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>; }
