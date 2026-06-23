import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Globe, Languages } from 'lucide-react';

const LANGUAGES = [
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'en', name: 'English', native: 'English' },
];

export default function LoginPage() {
  const { login, register } = useAuth();
  const { t } = useTranslation();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', preferredLanguage: 'hi' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(form.name, form.email, form.password, form.preferredLanguage);
      } else {
        await login(form.email, form.password);
      }
    } catch (err) {
      setError(err.response?.data?.error || t('errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="aurora-bg" />
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
        <div className="hero-content">
          <div className="hero-icon">
            <Languages size={40} strokeWidth={2.2} />
          </div>
          <h1>IndQA</h1>
          <p className="hero-tagline">{t('heroSubtitle')}</p>
          <div className="language-showcase">
            {LANGUAGES.filter((l) => l.code !== 'en').map((l) => (
              <span key={l.code} className="language-chip">{l.native}</span>
            ))}
          </div>
          <p className="hero-desc">{t('heroDesc')}</p>
        </div>
      </div>

      <div className="login-form-container">
        <div className="login-card">
          <div className="login-brand">
            <span className="login-brand-mark"><Languages size={20} strokeWidth={2.4} /></span>
            <span className="login-brand-name">IndQA</span>
          </div>
          <h2>{isRegister ? t('createAccount') : t('welcomeBack')}</h2>
          <p className="login-subtitle">{isRegister ? t('startAsking') : t('signInToContinue')}</p>

          {error && <div className="error-msg" role="alert">{error}</div>}

          <form onSubmit={handleSubmit}>
            {isRegister && (
              <div className="form-group">
                <label htmlFor="name">{t('name')}</label>
                <input
                  id="name"
                  type="text"
                  placeholder={t('yourName')}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="email">{t('email')}</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">{t('password')}</label>
              <input
                id="password"
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                placeholder={isRegister ? t('passwordHint') : '••••••••'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={isRegister ? 8 : undefined}
              />
              {isRegister && <small className="field-hint">{t('passwordHint')}</small>}
            </div>
            {isRegister && (
              <div className="form-group">
                <label htmlFor="preferredLanguage"><Globe size={14} /> {t('preferredLanguage')}</label>
                <select
                  id="preferredLanguage"
                  value={form.preferredLanguage}
                  onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.native} ({l.name})</option>
                  ))}
                </select>
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? t('pleaseWait') : isRegister ? t('createAccount') : t('signIn')}
            </button>
          </form>

          <p className="toggle-auth">
            {isRegister ? t('alreadyHaveAccount') : t('dontHaveAccount')}
            <button
              className="btn-link"
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
            >
              {isRegister ? t('signIn') : t('createAccount')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export { LANGUAGES };
