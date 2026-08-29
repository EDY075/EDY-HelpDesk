import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Box, DatabaseZap, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '../components/Auth';
import { ErrorState, ListSkeleton } from '../components/Feedback';
import { createAnalyticsIntegrationExport, getIntegrations, integrationDatasets } from '../lib/api';
import { formatDateTime, translateUi } from '../i18n/I18nProvider';

const iconById = { sentinel: Activity, siem: ShieldCheck, analytics: DatabaseZap } as const;

export function IntegrationsPage() {
  const query = useQuery({ queryKey: ['integrations'], queryFn: getIntegrations, refetchInterval: 30_000 });
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [dataset, setDataset] = useState<(typeof integrationDatasets)[number]>('Tickets');
  const exportMutation = useMutation({ mutationFn: () => createAnalyticsIntegrationExport(dataset), onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['integrations'] }) });
  if (query.isPending) return <div className="page-stack"><section className="panel"><ListSkeleton rows={6} /></section></div>;
  if (query.isError) return <div className="page-stack"><section className="panel"><ErrorState onRetry={() => void query.refetch()} /></section></div>;

  return <div className="page-stack integrations-page">
    <header className="page-header"><div><span className="eyebrow eyebrow--accent">Controlled boundaries</span><h1>Integrations</h1><p>Real contract readiness and delivery state. No connection is claimed unless communication has succeeded.</p></div><span className="mode-pill">{query.data.mode === 'Demo' ? 'DEMO DATA · External off' : 'Local Operational'}</span></header>
    <section className="integration-grid" aria-label="Integration status">
      {query.data.integrations.map((item) => { const Icon = iconById[item.id]; return <article className="panel integration-card" key={item.id}>
        <header><span className="integration-card__icon"><Icon size={19} /></span><div><h2>{item.name}</h2><p>{item.description}</p></div><span className={`integration-status integration-status--${item.status.toLowerCase()}`}>{translateUi(item.status === 'ExportReady' ? 'Export ready' : item.status)}</span></header>
        <dl><div><dt>Enabled</dt><dd>{translateUi(item.enabled ? 'Yes' : 'No')}</dd></div><div><dt>Configured</dt><dd>{translateUi(item.configured ? 'Yes' : 'No')}</dd></div><div><dt>Contract</dt><dd>{item.contractVersion ?? translateUi('Unavailable')}</dd></div><div><dt>Last success</dt><dd>{item.lastSuccessfulCommunication ? formatDateTime(item.lastSuccessfulCommunication) : translateUi('Never')}</dd></div></dl>
        {item.lastError ? <p className="integration-card__notice" role="status">{item.lastError}</p> : null}
        {item.actions.createLocalExport && session?.account.role === 'Admin' ? <div className="integration-export"><label>Dataset<select value={dataset} onChange={(event) => setDataset(event.target.value as typeof dataset)}>{integrationDatasets.map((value) => <option key={value}>{value}</option>)}</select></label><button className="button button--secondary" type="button" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>{exportMutation.isPending ? <RefreshCw className="spin-icon" size={15} /> : <Download size={15} />}{exportMutation.isPending ? 'Creating…' : 'Create local export'}</button></div> : null}
        {item.id === 'analytics' && exportMutation.isSuccess ? <p className="success-banner" role="status">Export created: {exportMutation.data.fileName} · {exportMutation.data.recordCount} records.</p> : null}
        {item.id === 'analytics' && exportMutation.isError ? <p className="error-banner" role="alert">The export could not be created safely. Retry after reviewing local storage availability.</p> : null}
      </article>; })}
    </section>
    <section className="panel outbox-panel"><header className="panel__header"><div><span className="section-kicker">Transactional delivery</span><h2>Outbox</h2></div><Box size={18} /></header><div className="outbox-stats"><Stat label="Pending" value={query.data.outbox.pending} /><Stat label="Failed" value={query.data.outbox.failed} /><Stat label="Dead-letter" value={query.data.outbox.deadLetter} /><Stat label="Processed" value={query.data.outbox.processed} /></div><p>Retries are bounded and contract failures fail closed. The incompatible SIEM adapter is not running.</p></section>
  </div>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
