import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { LANGUAGES } from './LoginPage';
import { ArrowLeft, Users, MessageSquare, Database, BookOpen, Clock, Target, Settings, Loader2 } from 'lucide-react';

const langName = (code) => LANGUAGES.find((l) => l.code === code)?.native || code;

// Animate a number from 0 → target on mount (eased).
function useCountUp(target, duration = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setN(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setN(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

function StatCard({ icon, label, value, format = (n) => Math.round(n).toLocaleString() }) {
  const n = useCountUp(value);
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-value">{format(n)}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function Bar({ label, value, max, suffix = '' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${w}%` }} />
      </div>
      <span className="bar-value">{value}{suffix}</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const { api } = useAuth();
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    api
      .get('/analytics')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load analytics.'));
  }, [api]);

  // Grow the grounding bar once data is in.
  useEffect(() => {
    if (!data) return;
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [data]);

  if (error) return <div className="admin-page"><p className="admin-feedback error">{error}</p></div>;
  if (!data) {
    return (
      <div className="admin-page">
        <p className="admin-hint"><Loader2 size={16} className="spin" /> Loading analytics…</p>
      </div>
    );
  }

  const maxLang = Math.max(1, ...data.questionsByLanguage.map((q) => q.count));
  const maxDay = Math.max(1, ...data.messagesPerDay.map((d) => d.count));
  const groundedPct = Math.round(data.grounding.groundedRatio * 100);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <Link to="/" className="btn-icon" aria-label={t('backToChat')}>
          <ArrowLeft size={20} />
        </Link>
        <h1>{t('analytics')} · Dashboard</h1>
        <Link to="/admin" className="admin-nav-link">
          <Settings size={16} /> {t('admin')}
        </Link>
      </header>

      <div className="stat-grid">
        <StatCard icon={<Users size={22} />} label="Users" value={data.totals.users} />
        <StatCard icon={<MessageSquare size={22} />} label="Conversations" value={data.totals.conversations} />
        <StatCard icon={<Database size={22} />} label="Messages" value={data.totals.messages} />
        <StatCard icon={<BookOpen size={22} />} label="Knowledge chunks" value={data.totals.knowledgeChunks} />
        <StatCard icon={<Clock size={22} />} label="Avg response" value={data.answers.avgLatencyMs / 1000} format={(n) => `${n.toFixed(1)}s`} />
        <StatCard icon={<Target size={22} />} label="Avg confidence" value={data.answers.avgConfidence * 100} format={(n) => `${Math.round(n)}%`} />
      </div>

      <div className="admin-grid">
        <div className="admin-card">
          <h2>Questions by language</h2>
          {data.questionsByLanguage.length === 0 ? (
            <p className="admin-hint">No questions yet.</p>
          ) : (
            data.questionsByLanguage.map((q) => (
              <Bar key={q.language} label={langName(q.language)} value={q.count} max={maxLang} />
            ))
          )}
        </div>

        <div className="admin-card">
          <h2>Answer grounding (RAG vs direct)</h2>
          <p className="admin-hint">
            Confidence threshold: {data.grounding.confidenceThreshold}. {groundedPct}% of answers were grounded in
            retrieved sources.
          </p>
          <div className="grounding-bar">
            <div className="grounding-grounded" style={{ width: `${grown ? groundedPct : 0}%` }}>
              {groundedPct >= 12 ? `RAG ${groundedPct}%` : ''}
            </div>
            <div className="grounding-direct" style={{ width: `${grown ? 100 - groundedPct : 0}%` }}>
              {100 - groundedPct >= 12 ? `Direct ${100 - groundedPct}%` : ''}
            </div>
          </div>
          <div className="grounding-legend">
            <span><i className="dot grounded" /> Grounded: {data.grounding.grounded}</span>
            <span><i className="dot direct" /> Direct: {data.grounding.direct}</span>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h2>Activity (last 7 days)</h2>
        {data.messagesPerDay.length === 0 ? (
          <p className="admin-hint">No activity yet.</p>
        ) : (
          data.messagesPerDay.map((d) => <Bar key={d.date} label={d.date} value={d.count} max={maxDay} />)
        )}
      </div>
    </div>
  );
}
