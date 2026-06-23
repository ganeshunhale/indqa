import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './styles/global.css';
import './i18n/i18n';

// Apply the saved theme before first paint to avoid a flash of the wrong theme.
document.documentElement.setAttribute('data-theme', localStorage.getItem('indqa_theme') || 'dark');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
