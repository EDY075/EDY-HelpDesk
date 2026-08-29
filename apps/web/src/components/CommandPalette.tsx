import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BookOpen, FileBarChart, Laptop, Plus, Plug, Settings, Search, ShieldCheck, TicketCheck, UserRound, Wrench, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from './Auth';
import { commandAllowed } from '../lib/command-access';
const commands = [
  { label: 'Operations', hint: 'Open the live operations center', path: '/operations', icon: Activity },
  { label: 'Reports', hint: 'Open governed report history', path: '/reports', icon: FileBarChart },
  { label: 'Create Report', hint: 'Queue a CSV or JSON export', path: '/reports#create-report', icon: Plus },
  { label: 'Recent Reports', hint: 'Review export job status', path: '/reports#recent-reports', icon: FileBarChart },
  { label: 'Assets', hint: 'Open endpoint inventory', path: '/assets', icon: Laptop },
  { label: 'Search Asset', hint: 'Find code, hostname or serial', path: '/assets?focus=search', icon: Search },
  { label: 'Knowledge Base', hint: 'Open the support library', path: '/knowledge', icon: BookOpen },
  { label: 'Search Knowledge', hint: 'Find a support procedure', path: '/knowledge?focus=search', icon: Search },
  { label: 'Create Knowledge Article', hint: 'Write a reviewed draft', path: '/knowledge/new', icon: Plus },
  { label: 'Open tickets', hint: 'View service desk queue', path: '/tickets', icon: TicketCheck },
  { label: 'Create ticket', hint: 'Start a new request', path: '/tickets/new', icon: Wrench },
  { label: 'Users', hint: 'Manage people and access', path: '/users', icon: UserRound },
  { label: 'Integrations', hint: 'Review contract and outbox health', path: '/integrations', icon: Plug },
  { label: 'Settings', hint: 'Review effective service settings', path: '/settings', icon: Settings },
  { label: 'Search ticket', hint: 'Search by code or summary', path: '/tickets?focus=search', icon: Search },
  { label: 'Security Cases', hint: 'Open the security triage queue', path: '/security/cases', icon: ShieldCheck },
  { label: 'Search Security Case', hint: 'Find a SEC code, ticket, asset or summary', path: '/security/cases?focus=search', icon: Search },
  { label: 'Open Recent Security Cases', hint: 'Review recently updated investigations', path: '/security/cases?sort=recentlyUpdated', icon: ShieldCheck },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => commands.filter(item => commandAllowed(session?.account.role,item.path)).filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(query.toLowerCase())), [query, session?.account]);
  const close = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; previousFocus?.focus({ preventScroll: true }); };
  }, [open]);

  useEffect(() => {
    const results = resultsRef.current;
    const item = results?.querySelector<HTMLElement>('.command-item--active');
    if (!open || !results || !item) return;
    const container = results.getBoundingClientRect();
    const active = item.getBoundingClientRect();
    if (active.top < container.top) results.scrollTop -= container.top - active.top;
    else if (active.bottom > container.bottom) results.scrollTop += active.bottom - container.bottom;
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => filtered.length ? (index + 1) % filtered.length : 0); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => filtered.length ? (index - 1 + filtered.length) % filtered.length : 0); }
      if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); void navigate(filtered[activeIndex].path); close(); }
      if (event.key === 'Tab') { const controls = Array.from(document.querySelectorAll<HTMLElement>('.command-palette input, .command-palette button')); const first = controls[0]; const last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, close, filtered, navigate, open]);

  if (!open) return null;
  return <div className="command-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-title">
      <h2 className="sr-only" id="command-title">Command palette</h2>
      <div className="command-search"><Search size={18} aria-hidden="true" /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder="Search commands…" aria-label="Search commands" /><kbd>Esc</kbd><button className="icon-button command-close" type="button" onClick={close} aria-label="Close command palette"><X size={17} /></button></div>
      <div ref={resultsRef} className="command-results" role="listbox" aria-label="Available commands">
        {filtered.length ? filtered.map(({ label, hint, path, icon: Icon }, index) => <button className={`command-item${index === activeIndex ? ' command-item--active' : ''}`} type="button" role="option" aria-selected={index === activeIndex} key={label} onMouseEnter={() => setActiveIndex(index)} onClick={() => { void navigate(path); close(); }}><span className="command-item__icon"><Icon size={17} aria-hidden="true" /></span><span><strong>{label}</strong><small>{hint}</small></span>{index === activeIndex ? <kbd>↵</kbd> : null}</button>) : <p className="command-empty">No matching commands.</p>}
      </div>
      <footer className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span></footer>
    </section>
  </div>;
}
