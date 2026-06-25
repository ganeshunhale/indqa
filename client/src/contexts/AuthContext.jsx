import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// API base URL comes from the environment so the same build works in dev
// (Vite proxy → "/api") and in production (full URL via VITE_API_URL).
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const api = axios.create({ baseURL: API_BASE });

// Attach the auth token + active workspace to every outgoing request. The
// server scopes all knowledge, conversations, and analytics to this workspace.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('indqa_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const workspaceId = localStorage.getItem('indqa_workspace');
  if (workspaceId) config.headers['X-Workspace-Id'] = workspaceId;
  return config;
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => localStorage.getItem('indqa_workspace') || null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('indqa_token');
    localStorage.removeItem('indqa_workspace');
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
  }, []);

  // Persist the active workspace so the request interceptor and socket pick it up.
  const applyActiveWorkspace = useCallback((id) => {
    if (id) localStorage.setItem('indqa_workspace', id);
    else localStorage.removeItem('indqa_workspace');
    setActiveWorkspaceId(id || null);
  }, []);

  // Adopt the workspace context returned by login/register/me. Keeps the current
  // active workspace if it is still valid; otherwise falls back to the server's
  // suggestion or the first workspace.
  const adoptWorkspaceContext = useCallback(
    (list, suggestedId) => {
      const next = list || [];
      setWorkspaces(next);
      const current = localStorage.getItem('indqa_workspace');
      const stillValid = current && next.some((w) => w.id === current);
      const chosen = stillValid ? current : suggestedId || next[0]?.id || null;
      applyActiveWorkspace(chosen);
      return chosen;
    },
    [applyActiveWorkspace]
  );

  // Global 401 handling: an expired/invalid token logs the user out so they are
  // redirected to login instead of seeing silent failures everywhere.
  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (res) => res,
      (error) => {
        if (error.response?.status === 401 && localStorage.getItem('indqa_token')) {
          logout();
        }
        return Promise.reject(error);
      }
    );
    return () => api.interceptors.response.eject(interceptorId);
  }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem('indqa_token');
    if (token) {
      api
        .get('/auth/me')
        .then((res) => {
          setUser(res.data.user);
          adoptWorkspaceContext(res.data.workspaces, res.data.activeWorkspaceId);
        })
        .catch(() => {
          localStorage.removeItem('indqa_token');
          localStorage.removeItem('indqa_workspace');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('indqa_token', res.data.token);
    setUser(res.data.user);
    adoptWorkspaceContext(res.data.workspaces, res.data.activeWorkspaceId);
    return res.data;
  };

  const register = async (name, email, password, preferredLanguage) => {
    const res = await api.post('/auth/register', { name, email, password, preferredLanguage });
    localStorage.setItem('indqa_token', res.data.token);
    setUser(res.data.user);
    adoptWorkspaceContext(res.data.workspaces, res.data.activeWorkspaceId);
    return res.data;
  };

  // Re-fetch the workspace list (after creating one or accepting an invite).
  const refreshWorkspaces = useCallback(async () => {
    const res = await api.get('/workspaces');
    adoptWorkspaceContext(res.data.workspaces, activeWorkspaceId);
    return res.data.workspaces;
  }, [adoptWorkspaceContext, activeWorkspaceId]);

  const switchWorkspace = useCallback(
    (id) => {
      if (id && id !== activeWorkspaceId) applyActiveWorkspace(id);
    },
    [activeWorkspaceId, applyActiveWorkspace]
  );

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        api,
        workspaces,
        activeWorkspaceId,
        activeWorkspace,
        switchWorkspace,
        refreshWorkspaces,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { api };
