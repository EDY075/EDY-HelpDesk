import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-state__icon"><Inbox aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function ErrorState({ title = 'We could not load this view.', onRetry }: { title?: string; onRetry?: () => void }) {
  return <div className="empty-state empty-state--error" role="alert"><span className="empty-state__icon"><AlertCircle aria-hidden="true" /></span><h3>{title}</h3><p>The service may be temporarily unavailable. Your data was not changed.</p>{onRetry ? <button className="button button--secondary" type="button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Retry</button> : null}</div>;
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return <div className="list-skeleton" aria-busy="true" aria-label="Loading data">{Array.from({ length: rows }, (_, index) => <div className="list-skeleton__row" key={index}><span /><span /><span /><span /></div>)}</div>;
}
