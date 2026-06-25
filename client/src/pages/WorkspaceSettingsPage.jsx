import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, UserPlus, Trash2, Loader2, Mail, Crown, Shield, Sparkles, User as UserIcon } from 'lucide-react';

const ROLE_ICON = { owner: <Crown size={14} />, admin: <Shield size={14} />, member: <UserIcon size={14} /> };

export default function WorkspaceSettingsPage() {
  const { t } = useTranslation();
  const { api, activeWorkspace, activeWorkspaceId, refreshWorkspaces } = useAuth();

  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null); // { type, text }
  const [invite, setInvite] = useState({ email: '', role: 'member' });
  const [busy, setBusy] = useState(false);

  const isOwner = activeWorkspace?.role === 'owner';
  const answerMode = activeWorkspace?.answerMode || 'hybrid';

  const changeAnswerMode = async (mode) => {
    if (mode === answerMode) return;
    setFeedback(null);
    try {
      await api.patch(`/workspaces/${activeWorkspaceId}`, { answerMode: mode });
      await refreshWorkspaces();
      setFeedback({ type: 'success', text: t('answerModeSaved') });
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.error || 'Failed to update answer mode.' });
    }
  };

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const res = await api.get(`/workspaces/${activeWorkspaceId}/members`);
      setMembers(res.data.members);
      setInvites(res.data.pendingInvites || []);
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.error || 'Failed to load members.' });
    } finally {
      setLoading(false);
    }
  }, [api, activeWorkspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const sendInvite = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api.post(`/workspaces/${activeWorkspaceId}/invites`, invite);
      const msg =
        res.data.status === 'added'
          ? `${invite.email} added to the workspace.`
          : res.data.status === 'already_member'
          ? `${invite.email} is already a member.`
          : `Invitation saved for ${invite.email}. They'll join when they sign up.`;
      setFeedback({ type: 'success', text: msg });
      setInvite({ email: '', role: 'member' });
      load();
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.error || 'Failed to invite.' });
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId, role) => {
    try {
      await api.patch(`/workspaces/${activeWorkspaceId}/members/${userId}`, { role });
      load();
      refreshWorkspaces();
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.error || 'Failed to change role.' });
    }
  };

  const removeMember = async (userId) => {
    if (!window.confirm(t('confirmRemoveMember'))) return;
    try {
      await api.delete(`/workspaces/${activeWorkspaceId}/members/${userId}`);
      load();
    } catch (err) {
      setFeedback({ type: 'error', text: err.response?.data?.error || 'Failed to remove member.' });
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <Link to="/" className="btn-icon" aria-label={t('backToChat')}>
          <ArrowLeft size={20} />
        </Link>
        <h1>{activeWorkspace?.name || t('workspace')} · {t('membersAndInvites')}</h1>
      </header>

      {feedback && <div className={`admin-feedback ${feedback.type}`}>{feedback.text}</div>}

      <div className="admin-card" style={{ marginBottom: 18 }}>
        <h2><Sparkles size={18} /> {t('answerMode')}</h2>
        <p className="admin-hint">{t('answerModeHint')}</p>
        <div className="mode-options">
          <button
            type="button"
            className={`mode-option ${answerMode === 'hybrid' ? 'active' : ''}`}
            onClick={() => changeAnswerMode('hybrid')}
            aria-pressed={answerMode === 'hybrid'}
          >
            <span className="mode-option-title"><Sparkles size={15} /> {t('modeHybrid')}</span>
            <span className="mode-option-desc">{t('modeHybridDesc')}</span>
          </button>
          <button
            type="button"
            className={`mode-option ${answerMode === 'strict' ? 'active' : ''}`}
            onClick={() => changeAnswerMode('strict')}
            aria-pressed={answerMode === 'strict'}
          >
            <span className="mode-option-title"><Shield size={15} /> {t('modeStrict')}</span>
            <span className="mode-option-desc">{t('modeStrictDesc')}</span>
          </button>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: 18 }}>
        <h2><UserPlus size={18} /> {t('inviteMember')}</h2>
        <p className="admin-hint">{t('inviteHint')}</p>
        <form onSubmit={sendInvite} className="invite-form">
          <input
            type="email"
            required
            placeholder="teammate@example.com"
            value={invite.email}
            onChange={(e) => setInvite({ ...invite, email: e.target.value })}
          />
          <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
            <option value="member">{t('role_member')}</option>
            <option value="admin">{t('role_admin')}</option>
          </select>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />} {t('invite')}
          </button>
        </form>
      </div>

      <div className="admin-card">
        <h2><UserIcon size={18} /> {t('members')} ({members.length})</h2>
        {loading ? (
          <p className="admin-hint"><Loader2 size={16} className="spin" /> {t('loading')}</p>
        ) : (
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.userId}>
                <div className="member-info">
                  <span className="member-name">{m.name}</span>
                  <span className="member-email">{m.email}</span>
                </div>
                {isOwner ? (
                  <select className="role-select" value={m.role} onChange={(e) => changeRole(m.userId, e.target.value)}>
                    <option value="owner">{t('role_owner')}</option>
                    <option value="admin">{t('role_admin')}</option>
                    <option value="member">{t('role_member')}</option>
                  </select>
                ) : (
                  <span className={`role-badge role-${m.role}`}>{ROLE_ICON[m.role]} {t(`role_${m.role}`)}</span>
                )}
                {isOwner && (
                  <button className="btn-icon danger" onClick={() => removeMember(m.userId)} aria-label={t('remove')}>
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
            {invites.map((inv) => (
              <li key={inv.email} className="invite-row">
                <div className="member-info">
                  <span className="member-name"><Mail size={13} /> {inv.email}</span>
                  <span className="member-email">{t('pendingInvite')}</span>
                </div>
                <span className={`role-badge role-${inv.role}`}>{ROLE_ICON[inv.role]} {t(`role_${inv.role}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
