import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown, Check, Plus, Users, Building2 } from 'lucide-react';

/**
 * Sidebar control to view, switch, and create workspaces. Switching just updates
 * the active workspace in AuthContext; ChatPage reacts by reloading data and
 * reconnecting its socket. Owners/admins also get a link to member management.
 */
export default function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const { workspaces, activeWorkspace, activeWorkspaceId, switchWorkspace, refreshWorkspaces, api } = useAuth();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    setBusy(true);
    try {
      const res = await api.post('/workspaces', { name: trimmed });
      await refreshWorkspaces();
      switchWorkspace(res.data.workspace.id);
      setName('');
      setCreating(false);
      setOpen(false);
    } catch {
      /* surfaced by the global interceptor */
    } finally {
      setBusy(false);
    }
  };

  const canManage = activeWorkspace && (activeWorkspace.role === 'owner' || activeWorkspace.role === 'admin');

  return (
    <div className="ws-switcher" ref={ref}>
      <button className="ws-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <span className="ws-mark"><Building2 size={16} /></span>
        <span className="ws-current">
          <span className="ws-name">{activeWorkspace?.name || t('selectWorkspace')}</span>
          {activeWorkspace && <span className="ws-role">{t(`role_${activeWorkspace.role}`)}</span>}
        </span>
        <ChevronDown size={16} className="ws-chevron" />
      </button>

      {open && (
        <div className="ws-menu" role="menu">
          <div className="ws-menu-label">{t('workspaces')}</div>
          <div className="ws-list">
            {workspaces.map((w) => (
              <button
                key={w.id}
                className={`ws-item ${w.id === activeWorkspaceId ? 'active' : ''}`}
                onClick={() => {
                  switchWorkspace(w.id);
                  setOpen(false);
                }}
                role="menuitem"
              >
                <span className="ws-item-name">{w.name}</span>
                <span className="ws-item-role">{t(`role_${w.role}`)}</span>
                {w.id === activeWorkspaceId && <Check size={15} className="ws-check" />}
              </button>
            ))}
          </div>

          <div className="ws-menu-divider" />

          {canManage && (
            <Link to="/workspace" className="ws-action" role="menuitem" onClick={() => setOpen(false)}>
              <Users size={15} /> {t('membersAndInvites')}
            </Link>
          )}

          {creating ? (
            <div className="ws-create">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder={t('workspaceName')}
                autoFocus
              />
              <button className="btn-primary ws-create-btn" onClick={create} disabled={busy || name.trim().length < 2}>
                {t('create')}
              </button>
            </div>
          ) : (
            <button className="ws-action" onClick={() => setCreating(true)} role="menuitem">
              <Plus size={15} /> {t('createWorkspace')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
