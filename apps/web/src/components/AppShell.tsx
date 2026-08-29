import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, BookOpen, Laptop, Building2, ChevronDown, Command, FileBarChart, FolderTree, LayoutDashboard, LogOut, Menu, Plus, Plug, Search, Settings, ShieldCheck, TicketCheck, UserRound, X } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from './Auth';
import { Avatar } from './TicketPrimitives';
import { BrandMark } from './BrandMark';
import { CommandPalette } from './CommandPalette';
import {useQuery} from '@tanstack/react-query';
import {getDiagnosticCatalog} from '../lib/diagnostics';
import { PageErrorBoundary } from './PageErrorBoundary';
import { LanguageSelector, ThemeSelector } from './PreferenceControls';

const navigationGroups = [
  { label: 'Operations', items: [
    { label: 'Overview', icon: LayoutDashboard, to: '/overview' },
    { label: 'Operations Center', icon: Activity, to: '/operations' },
    { label: 'Tickets', icon: TicketCheck, to: '/tickets' },
    { label: 'Assets', icon: Laptop, to: '/assets' },
  ] },
  { label: 'Knowledge', items: [
    { label: 'Knowledge Base', icon: BookOpen, to: '/knowledge' },
  ] },
  { label: 'Security', items: [
    { label: 'Security Cases', icon: ShieldCheck, to: '/security' },
  ] },
  { label: 'Management', items: [
    { label: 'Reports', icon: FileBarChart, to: '/reports' },
    { label: 'Analytics', icon: BarChart3, to: '/analytics/support' },
    { label: 'Integrations', icon: Plug, to: '/integrations' },
    { label: 'Users', icon: UserRound, to: '/users' },
    { label: 'Settings', icon: Settings, to: '/settings' },
  ] },
  { label: 'Configuration', items: [
    { label: 'Departments', icon: Building2, to: '/departments' },
    { label: 'Categories', icon: FolderTree, to: '/categories' },
  ] },
];

const routeContext: Array<[RegExp, string, string]> = [
  [/^\/tickets\/new$/, 'Ticket intake', 'New service request'],
  [/^\/tickets\//, 'Technician workspace', 'Ticket context'],
  [/^\/tickets$/, 'Service operations', 'Ticket queue'],
  [/^\/assets\/[^/]+\/diagnostics/, 'IT troubleshooting', 'Endpoint diagnostics'],
  [/^\/assets\//, 'Endpoint operations', 'Endpoint 360'],
  [/^\/assets$/, 'Endpoint operations', 'Asset inventory'],
  [/^\/knowledge\//, 'Support knowledge', 'Internal runbook'],
  [/^\/knowledge$/, 'Support knowledge', 'Knowledge center'],
  [/^\/security\/cases\//, 'Service security', 'Case workspace'],
  [/^\/security/, 'Service security', 'Security cases'],
  [/^\/operations$/, 'IT operations', 'Operations Center'],
  [/^\/reports$/, 'Service management', 'Reports'],
  [/^\/analytics/, 'Service management', 'Operational analytics'],
  [/^\/integrations$/, 'System interfaces', 'Integrations'],
  [/^\/settings$/, 'Application', 'Settings'],
  [/^\/users/, 'Service management', 'Users'],
  [/^\/(departments|categories)/, 'Configuration', 'Service catalog'],
];

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobileWasOpen = useRef(false);
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mode=useQuery({queryKey:['diagnostic-catalog'],queryFn:getDiagnosticCatalog,staleTime:10000});
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const displayName = session?.account.displayName ?? session?.account.user?.displayName ?? session?.account.username ?? 'Workspace user';
  const context = useMemo(() => {
    const matched = routeContext.find(([pattern]) => pattern.test(location.pathname));
    return matched ? { eyebrow: matched[1], title: matched[2] } : { eyebrow: 'IT operations', title: 'Service overview' };
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen((open) => !open); }
      if (event.key === 'Escape') { setMobileOpen(false); setAccountOpen(false); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (mobileOpen) mobileCloseRef.current?.focus({ preventScroll: true });
    else if (mobileWasOpen.current) mobileMenuRef.current?.focus({ preventScroll: true });
    mobileWasOpen.current = mobileOpen;
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);

  return <div className="app-frame">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className={`sidebar${mobileOpen ? ' sidebar--open' : ''}`} aria-label="Primary navigation">
      <div className="sidebar__brand"><BrandMark /><div><strong>EDY HelpDesk</strong><span>IT Operations</span></div><button ref={mobileCloseRef} className="icon-button sidebar__close" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={19} /></button></div>
      <div className="sidebar__environment"><span className="status-dot status-dot--healthy" /><span>{mode.data?.mode==='Demo'?'Portfolio Demo':mode.data?.mode==='Operational'?'Local Operational':'Service desk'}</span><small>{mode.data?.mode==='Demo'?'Demo data':mode.data?.mode==='Operational'?'Private':'—'}</small></div>
      <nav className="sidebar__nav">
        {session?.account.role !== 'Viewer' ? <button className="nav-quick-action" type="button" onClick={() => { setMobileOpen(false); void navigate('/tickets/new'); }}><Plus size={15} aria-hidden="true" />New ticket</button> : null}
        {navigationGroups.map((group) => <div className="nav-group" key={group.label}><p className="nav-label">{group.label}</p>{group.items.map(({ label, icon: Icon, to }) => <NavLink end={to === '/overview'} className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`} key={to} to={to} onClick={() => { setMobileOpen(false); setAccountOpen(false); }}><Icon size={16} aria-hidden="true" /><span>{label}</span></NavLink>)}</div>)}
      </nav>
      <div className="sidebar__footer"><Avatar name={displayName} small /><div><strong>{displayName}</strong><span>{session?.account.role ?? 'Session'}</span></div></div>
    </aside>
    {mobileOpen ? <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}
    <div className="workspace">
      <header className="topbar">
        <div className="topbar__start"><button ref={mobileMenuRef} className="icon-button mobile-menu" type="button" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div><span className="eyebrow">{context.eyebrow}</span><strong>{context.title}</strong></div></div>
        <div className="topbar__end">
          {mode.data?.mode === 'Demo' ? <span className="demo-indicator">Demo data</span> : null}
          <button className="global-search" type="button" onClick={() => setPaletteOpen(true)} aria-label="Open command palette"><Search size={15} aria-hidden="true" /><span>Search or jump to…</span><kbd><Command size={11} />K</kbd></button>
          <div className="account-menu"><button className="user-chip" aria-label={`Account menu for ${displayName}`} type="button" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}><Avatar name={displayName} small /><span><strong>{displayName}</strong><small>{session?.account.role}</small></span><ChevronDown size={14} aria-hidden="true" /></button>{accountOpen ? <div className="account-popover"><div><strong>{displayName}</strong><span>{session?.account.username}</span></div><div className="account-preferences"><LanguageSelector compact /><ThemeSelector compact /></div><button type="button" onClick={() => void signOut()}><LogOut size={15} />Sign out</button></div> : null}</div>
        </div>
      </header>
      <main className="main-content" id="main-content" tabIndex={-1}><PageErrorBoundary resetKey={location.pathname}><Suspense fallback={<div className="route-loading" role="status"><span className="spinner" />Loading workspace…</div>}><Outlet /></Suspense></PageErrorBoundary></main>
    </div>
    <CommandPalette open={paletteOpen} onClose={closePalette} />
  </div>;
}
