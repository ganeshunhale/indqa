import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Plus, Upload, Trash2, FileText, BarChart3, Loader2 } from 'lucide-react';

const CATEGORIES = ['government', 'education', 'health', 'agriculture', 'general'];

export default function AdminPage() {
  const { api } = useAuth();
  const { t } = useTranslation();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', text }
  const [busy, setBusy] = useState(false);

  const [passage, setPassage] = useState({ text: '', source: '', category: 'general' });
  const [file, setFile] = useState(null);
  const [uploadMeta, setUploadMeta] = useState({ source: '', category: 'general' });
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  };

  const loadKnowledge = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/knowledge');
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.error || 'Failed to load knowledge base.' });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadKnowledge();
  }, [loadKnowledge]);

  const addPassage = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await api.post('/admin/knowledge', passage);
      setPassage({ text: '', source: '', category: 'general' });
      setFeedback({ type: 'success', text: 'Passage added and embedded.' });
      loadKnowledge();
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.error || 'Failed to add passage.' });
    } finally {
      setBusy(false);
    }
  };

  const uploadDocument = async (e) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', uploadMeta.source || file.name);
      formData.append('category', uploadMeta.category);
      const res = await api.post('/admin/knowledge/upload', formData);
      setFeedback({
        type: 'success',
        text: `Ingested ${res.data.added} chunk(s) from "${res.data.source}".${res.data.truncated ? ' (truncated)' : ''}`,
      });
      setFile(null);
      setUploadMeta({ source: '', category: 'general' });
      e.target.reset();
      loadKnowledge();
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.error || 'Upload failed.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this passage?')) return;
    try {
      await api.delete(`/admin/knowledge/${id}`);
      loadKnowledge();
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.error || 'Delete failed.' });
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <Link to="/" className="btn-icon" aria-label={t('backToChat')}>
          <ArrowLeft size={20} />
        </Link>
        <h1>{t('admin')} · Knowledge Base</h1>
        <Link to="/analytics" className="admin-nav-link">
          <BarChart3 size={16} /> {t('analytics')}
        </Link>
      </header>

      {feedback && <div className={`admin-feedback ${feedback.type}`}>{feedback.text}</div>}

      <div className="admin-grid">
        {/* Add a single passage */}
        <form className="admin-card" onSubmit={addPassage}>
          <h2><Plus size={18} /> Add Passage</h2>
          <textarea
            placeholder="Knowledge passage text (min. 20 characters)…"
            value={passage.text}
            onChange={(e) => setPassage({ ...passage, text: e.target.value })}
            rows={5}
            required
            minLength={20}
          />
          <input
            type="text"
            placeholder="Source (e.g. Ministry of Finance)"
            value={passage.source}
            onChange={(e) => setPassage({ ...passage, source: e.target.value })}
          />
          <select value={passage.category} onChange={(e) => setPassage({ ...passage, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} Add
          </button>
        </form>

        {/* Upload a document */}
        <form className="admin-card" onSubmit={uploadDocument}>
          <h2><Upload size={18} /> Upload Document</h2>
          <p className="admin-hint">Upload a .txt, .md, or .pdf file. It will be split into chunks and embedded.</p>
          <label
            className={`dropzone ${dragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload size={26} className="dropzone-icon" />
            {file ? (
              <span className="dropzone-file">{file.name}</span>
            ) : (
              <span className="dropzone-text"><strong>Click to choose</strong> or drag &amp; drop a file here</span>
            )}
            <input type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" onChange={(e) => setFile(e.target.files[0])} />
          </label>
          <input
            type="text"
            placeholder="Source label (optional)"
            value={uploadMeta.source}
            onChange={(e) => setUploadMeta({ ...uploadMeta, source: e.target.value })}
          />
          <select value={uploadMeta.category} onChange={(e) => setUploadMeta({ ...uploadMeta, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary" disabled={busy || !file}>
            {busy ? <Loader2 size={16} className="spin" /> : <Upload size={16} />} Upload &amp; Embed
          </button>
        </form>
      </div>

      {/* Knowledge list */}
      <div className="admin-card admin-list">
        <h2><FileText size={18} /> Knowledge Base ({total})</h2>
        {loading ? (
          <p className="admin-hint"><Loader2 size={16} className="spin" /> Loading…</p>
        ) : items.length === 0 ? (
          <p className="admin-hint">No passages yet. Add one above or run the seed script.</p>
        ) : (
          <ul className="knowledge-list">
            {items.map((item) => (
              <li key={item._id}>
                <div className="knowledge-text">
                  <span className={`category-tag cat-${item.category}`}>{item.category}</span>
                  <p>{item.text.length > 220 ? `${item.text.slice(0, 220)}…` : item.text}</p>
                  <span className="knowledge-source">{item.source}</span>
                </div>
                <button className="btn-icon danger" onClick={() => remove(item._id)} aria-label="Delete passage">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
