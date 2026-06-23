import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// API base URL comes from the environment so the same build works in dev
// (Vite proxy → "/api") and in production (full URL via VITE_API_URL).
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const api = axios.create({ baseURL: API_BASE });

// Attach the auth token to every outgoing request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('indqa_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('indqa_token');
    setUser(null);
  }, []);

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
        .then((res) => setUser(res.data.user))
        .catch(() => localStorage.removeItem('indqa_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('indqa_token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const register = async (name, email, password, preferredLanguage) => {
    const res = await api.post('/auth/register', { name, email, password, preferredLanguage });
    localStorage.setItem('indqa_token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, api }}>
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
