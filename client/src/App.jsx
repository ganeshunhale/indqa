import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';

// Lazy-load route pages so the initial bundle stays small.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));

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
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  // Guards
  const requireAuth = (element) => (user ? element : <Navigate to="/login" />);
  const requireAdmin = (element) =>
    user ? (user.role === 'admin' ? element : <Navigate to="/" />) : <Navigate to="/login" />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/admin" element={requireAdmin(<AdminPage />)} />
        <Route path="/analytics" element={requireAdmin(<AnalyticsPage />)} />
        <Route path="/*" element={requireAuth(<ChatPage />)} />
      </Routes>
    </Suspense>
  );
}
