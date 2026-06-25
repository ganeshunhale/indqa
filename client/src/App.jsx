import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';

// Lazy-load route pages so the initial bundle stays small.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const WorkspaceSettingsPage = lazy(() => import('./pages/WorkspaceSettingsPage'));

function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>{t('loading')}</p>
    </div>
  );
}

export default function App() {
  const { user, loading, activeWorkspace } = useAuth();

  if (loading) return <LoadingScreen />;

  // Guards. "Admin" is now per-workspace: owner/admin of the ACTIVE workspace.
  const isWorkspaceAdmin = activeWorkspace?.role === 'owner' || activeWorkspace?.role === 'admin';
  const requireAuth = (element) => (user ? element : <Navigate to="/login" />);
  const requireWorkspaceAdmin = (element) =>
    user ? (isWorkspaceAdmin ? element : <Navigate to="/" />) : <Navigate to="/login" />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/admin" element={requireWorkspaceAdmin(<AdminPage />)} />
        <Route path="/analytics" element={requireWorkspaceAdmin(<AnalyticsPage />)} />
        <Route path="/workspace" element={requireWorkspaceAdmin(<WorkspaceSettingsPage />)} />
        <Route path="/*" element={requireAuth(<ChatPage />)} />
      </Routes>
    </Suspense>
  );
}
