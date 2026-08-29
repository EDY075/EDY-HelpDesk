import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute } from './components/Auth';
import { AppShell } from './components/AppShell';
const LoginPage=lazy(()=>import('./pages/LoginPage').then(module=>({default:module.LoginPage})));
const OverviewPage=lazy(()=>import('./pages/OverviewPage').then(module=>({default:module.OverviewPage})));
const OperationsPage=lazy(()=>import('./pages/OperationsPage').then(module=>({default:module.OperationsPage})));
const AnalyticsPage=lazy(()=>import('./pages/AnalyticsPages').then(module=>({default:module.AnalyticsPage})));
const ReportsPage=lazy(()=>import('./pages/ReportsPage').then(module=>({default:module.ReportsPage})));
const TicketsPage=lazy(()=>import('./pages/TicketsPage').then(module=>({default:module.TicketsPage})));
const NewTicketPage=lazy(()=>import('./pages/NewTicketPage').then(module=>({default:module.NewTicketPage})));
const TicketDetailPage=lazy(()=>import('./pages/TicketDetailPage').then(module=>({default:module.TicketDetailPage})));
const SecurityDashboardPage=lazy(()=>import('./pages/SecurityPages').then(module=>({default:module.SecurityDashboardPage})));
const SecurityCasesPage=lazy(()=>import('./pages/SecurityPages').then(module=>({default:module.SecurityCasesPage})));
const SecurityCasePage=lazy(()=>import('./pages/SecurityPages').then(module=>({default:module.SecurityCasePage})));
const UsersPage=lazy(()=>import('./pages/DirectoryPages').then(module=>({default:module.UsersPage})));
const DepartmentsPage=lazy(()=>import('./pages/DirectoryPages').then(module=>({default:module.DepartmentsPage})));
const CategoriesPage=lazy(()=>import('./pages/DirectoryPages').then(module=>({default:module.CategoriesPage})));
const UserDetailPage=lazy(()=>import('./pages/UserDetailPage').then(module=>({default:module.UserDetailPage})));
const AssetsPage=lazy(()=>import('./pages/AssetsPage').then(module=>({default:module.AssetsPage})));
const AssetDetailPage=lazy(()=>import('./pages/AssetsPage').then(module=>({default:module.AssetDetailPage})));
const DiagnosticsPage=lazy(()=>import('./pages/DiagnosticsPages').then(module=>({default:module.DiagnosticsPage})));
const DiagnosticResultPage=lazy(()=>import('./pages/DiagnosticsPages').then(module=>({default:module.DiagnosticResultPage})));
const KnowledgePage=lazy(()=>import('./pages/KnowledgePages').then(module=>({default:module.KnowledgePage})));
const NewArticlePage=lazy(()=>import('./pages/KnowledgePages').then(module=>({default:module.NewArticlePage})));
const ArticleDetailPage=lazy(()=>import('./pages/KnowledgePages').then(module=>({default:module.ArticleDetailPage})));
const IntegrationsPage=lazy(()=>import('./pages/IntegrationsPage').then(module=>({default:module.IntegrationsPage})));
const SettingsPage=lazy(()=>import('./pages/SettingsPage').then(module=>({default:module.SettingsPage})));
const NotFoundPage=lazy(()=>import('./pages/NotFoundPage').then(module=>({default:module.NotFoundPage})));

export function App() {
  return (
    <><ScrollToTop /><Suspense fallback={<div className="route-loading" role="status"><span className="spinner" />Loading workspace…</div>}><Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate replace to="/overview" />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="analytics/support" element={<AnalyticsPage kind="support" />} />
          <Route path="analytics/sla" element={<AnalyticsPage kind="sla" />} />
          <Route path="analytics/assets" element={<AnalyticsPage kind="assets" />} />
          <Route path="analytics/diagnostics" element={<AnalyticsPage kind="diagnostics" />} />
          <Route path="analytics/knowledge" element={<AnalyticsPage kind="knowledge" />} />
          <Route path="analytics/security" element={<AnalyticsPage kind="security" />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="tickets/new" element={<NewTicketPage />} />
          <Route path="tickets/:id" element={<TicketDetailPage />} />
          <Route path="security" element={<SecurityDashboardPage />} />
          <Route path="security/cases" element={<SecurityCasesPage />} />
          <Route path="security/cases/:id" element={<SecurityCasePage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:id" element={<UserDetailPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="assets/:id" element={<AssetDetailPage />} />
          <Route path="assets/:id/diagnostics" element={<DiagnosticsPage />} />
          <Route path="diagnostics/jobs/:id" element={<DiagnosticResultPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="knowledge/new" element={<NewArticlePage />} />
          <Route path="knowledge/:id" element={<ArticleDetailPage />} />
          <Route path="departments" element={<DepartmentsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes></Suspense></>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0 }); }, [pathname]);
  return null;
}
