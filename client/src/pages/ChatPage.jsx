import { useState, useEffect, useRef, memo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { LANGUAGES } from './LoginPage';
import WorkspaceSwitcher from '../components/WorkspaceSwitcher';
import {
  MessageCircle, Plus, Send, Globe, LogOut, Trash2, Menu, X,
  ChevronDown, ChevronUp, Clock, Shield, Sparkles, WifiOff, Moon, Sun, Settings, BarChart3,
} from 'lucide-react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '/';

export default function ChatPage() {
  const { user, logout, api, activeWorkspace, activeWorkspaceId } = useAuth();
  const { t, i18n } = useTranslation();

  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState(user?.preferredLanguage || 'hi');
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [connState, setConnState] = useState('connecting'); // connecting | connected | reconnecting | disconnected
  const [theme, setTheme] = useState(() => localStorage.getItem('indqa_theme') || 'dark');
  // Per-session answer mode (Strict | Hybrid). Seeded from the workspace default;
  // the user can override it for this session via the header toggle.
  const [chatMode, setChatMode] = useState('hybrid');

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Seed the session answer mode from the active workspace's default.
  useEffect(() => {
    if (activeWorkspace?.answerMode) setChatMode(activeWorkspace.answerMode);
  }, [activeWorkspaceId, activeWorkspace?.answerMode]);

  // Sync UI language with the selected answer language.
  useEffect(() => { i18n.changeLanguage(language); }, [language, i18n]);

  // Persist + apply theme.
  useEffect(() => {
    localStorage.setItem('indqa_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  // Socket.IO connection + event wiring. Re-established when the active
  // workspace changes so the connection (and its retrieval) is scoped correctly.
  useEffect(() => {
    if (!activeWorkspaceId) return undefined;
    const token = localStorage.getItem('indqa_token');
    const socket = io(SOCKET_URL, {
      auth: { token, workspaceId: activeWorkspaceId },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => setConnState('connected'));
    socket.on('disconnect', () => setConnState('disconnected'));
    socket.on('connect_error', () => setConnState('disconnected'));
    socket.io.on('reconnect_attempt', () => setConnState('reconnecting'));

    socket.on('status', (data) => setStatusMsg(data.message));
    socket.on('token', (data) => setStreamText(data.partial));

    socket.on('answer-complete', (data) => {
      setStreamText('');
      setIsProcessing(false);
      setStatusMsg('');
      setMessages((prev) => [
        ...prev,
        {
          _id: Date.now().toString(),
          role: 'assistant',
          originalText: data.answer,
          englishText: data.englishAnswer,
          language: data.detectedLanguage,
          retrievedChunks: data.sources,
          confidence: data.confidence,
          latencyMs: data.latencyMs,
          createdAt: new Date().toISOString(),
        },
      ]);
    });

    socket.on('error', (data) => {
      setIsProcessing(false);
      setStreamText('');
      setStatusMsg('');
      setMessages((prev) => [
        ...prev,
        {
          _id: Date.now().toString(),
          role: 'assistant',
          originalText: data.message || t('errorOccurred'),
          language: 'en',
          isError: true,
          createdAt: new Date().toISOString(),
        },
      ]);
    });

    socketRef.current = socket;
    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  // Load the conversation list for the active workspace. Switching workspaces
  // clears the current conversation and reloads the list.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    setActiveConv(null);
    setMessages([]);
    api.get('/conversations').then((res) => setConversations(res.data.conversations)).catch(() => setConversations([]));
  }, [api, activeWorkspaceId]);

  // Load messages when the active conversation changes.
  useEffect(() => {
    if (activeConv) {
      api
        .get(`/conversations/${activeConv._id}/messages`)
        .then((res) => setMessages(res.data.messages))
        .catch(() => {});
      socketRef.current?.emit('join-conversation', activeConv._id);
    } else {
      setMessages([]);
    }
  }, [activeConv, api]);

  const createConversation = async () => {
    const res = await api.post('/conversations', { language });
    setConversations((prev) => [res.data.conversation, ...prev]);
    setActiveConv(res.data.conversation);
    setMessages([]);
    inputRef.current?.focus();
  };

  const deleteConversation = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm(t('confirmDelete'))) return;
    await api.delete(`/conversations/${id}`);
    setConversations((prev) => prev.filter((c) => c._id !== id));
    if (activeConv?._id === id) {
      setActiveConv(null);
      setMessages([]);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    let conv = activeConv;
    if (!conv) {
      const res = await api.post('/conversations', { language });
      conv = res.data.conversation;
      setConversations((prev) => [conv, ...prev]);
      setActiveConv(conv);
    }

    const text = input.trim();
    setMessages((prev) => [
      ...prev,
      { _id: Date.now().toString(), role: 'user', originalText: text, language, createdAt: new Date().toISOString() },
    ]);
    setInput('');
    setIsProcessing(true);

    socketRef.current?.emit('ask-question', { question: text, language, conversationId: conv._id, mode: chatMode });
  };

  // Switch the per-session answer mode and drop an inline notice into the chat so
  // the change is visible in the conversation. Session-only: not emitted or persisted.
  const changeMode = (mode) => {
    if (mode === chatMode) return;
    setChatMode(mode);
    setMessages((prev) => [
      ...prev,
      {
        _id: `mode-${Date.now()}`,
        role: 'system',
        originalText: t('modeSwitched', { mode: t(mode === 'hybrid' ? 'modeHybrid' : 'modeStrict') }),
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  const examples = [t('example1'), t('example2'), t('example3')];

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="brand">
            <MessageCircle size={24} />
            <span>IndQA</span>
          </div>
          <button className="btn-icon mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <X size={20} />
          </button>
        </div>

        <WorkspaceSwitcher />

        <button className="btn-new-chat" onClick={createConversation}>
          <Plus size={18} /> {t('newChat')}
        </button>

        <div className="conversation-list">
          {conversations.length === 0 && <p className="empty-conversations">{t('noConversations')}</p>}
          {conversations.map((conv) => (
            <div
              key={conv._id}
              className={`conv-item ${activeConv?._id === conv._id ? 'active' : ''}`}
              onClick={() => {
                setActiveConv(conv);
                setSidebarOpen(false);
              }}
            >
              <MessageCircle size={16} />
              <span className="conv-title">{conv.title}</span>
              <button
                className="btn-delete"
                onClick={(e) => deleteConversation(conv._id, e)}
                aria-label={`Delete conversation: ${conv.title}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {(activeWorkspace?.role === 'owner' || activeWorkspace?.role === 'admin') && (
          <nav className="sidebar-admin-nav">
            <Link to="/admin" className="admin-nav-item"><Settings size={16} /> {t('admin')}</Link>
            <Link to="/analytics" className="admin-nav-item"><BarChart3 size={16} /> {t('analytics')}</Link>
          </nav>
        )}

        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{user?.name}</span>
            <span className="user-email">{user?.email}</span>
          </div>
          <button className="btn-icon" onClick={toggleTheme} title={t('darkMode')} aria-label={t('darkMode')}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="btn-icon" onClick={logout} title={t('logout')} aria-label={t('logout')}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main">
        <header className="chat-header">
          <button className="btn-icon mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
            <Menu size={22} />
          </button>
          <div className="language-selector">
            <Globe size={16} />
            <label htmlFor="language-select" className="sr-only">{t('selectLanguage')}</label>
            <select
              id="language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isProcessing}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.native} ({l.name})</option>
              ))}
            </select>
          </div>

          <div className="mode-toggle" role="group" aria-label={t('answerMode')}>
            <button
              type="button"
              className={`mode-btn ${chatMode === 'hybrid' ? 'active' : ''}`}
              onClick={() => changeMode('hybrid')}
              title={t('modeHybridDesc')}
              aria-pressed={chatMode === 'hybrid'}
            >
              <Sparkles size={13} /> {t('modeHybrid')}
            </button>
            <button
              type="button"
              className={`mode-btn ${chatMode === 'strict' ? 'active' : ''}`}
              onClick={() => changeMode('strict')}
              title={t('modeStrictDesc')}
              aria-pressed={chatMode === 'strict'}
            >
              <Shield size={13} /> {t('modeStrict')}
            </button>
          </div>

          <ConnectionStatus state={connState} t={t} />

          {activeConv && (
            <span className="conv-info">
              {activeConv.title} &middot; {t('messagesCount', { count: messages.length })}
            </span>
          )}
        </header>

        {/* Messages */}
        <div className="messages-container" role="log" aria-live="polite" aria-relevant="additions">
          {!messages.some((m) => m.role === 'user' || m.role === 'assistant') && !isProcessing && (
            <div className="welcome-screen">
              <Sparkles size={48} className="welcome-icon" />
              <h2>{t('welcome')}</h2>
              <p>{t('welcomeDesc')}</p>
              <div className="example-questions">
                <p>{t('tryAsking')}</p>
                {examples.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(ex);
                      inputRef.current?.focus();
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg._id} message={msg} />
          ))}

          {/* Streaming / processing indicator */}
          {isProcessing && (
            <div className="message-row assistant">
              <div className="message-bubble assistant">
                {streamText ? (
                  <p className="message-text">
                    {streamText}
                    <span className="cursor-blink">|</span>
                  </p>
                ) : (
                  <div className="typing-indicator">
                    <span className="typing-dots" aria-hidden="true"><span /><span /><span /></span>
                    <span>{statusMsg || t('processing')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="input-bar">
          <div className="input-wrapper">
            <label htmlFor="question-input" className="sr-only">{t('placeholder')}</label>
            <textarea
              id="question-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('placeholder')}
              rows={1}
              disabled={isProcessing}
            />
            <button
              className="btn-send"
              onClick={handleSend}
              disabled={!input.trim() || isProcessing || connState === 'disconnected'}
              aria-label={t('send')}
            >
              <Send size={18} />
            </button>
          </div>
          <p className="input-hint">
            {t('poweredBy')} | {LANGUAGES.find((l) => l.code === language)?.native}
          </p>
        </div>
      </main>
    </div>
  );
}

function ConnectionStatus({ state, t }) {
  if (state === 'connected' || state === 'connecting') return null;
  const label = state === 'reconnecting' ? t('reconnecting') : t('disconnected');
  return (
    <span className={`conn-status ${state}`} role="status">
      <WifiOff size={14} /> {label}
    </span>
  );
}

// Memoized so existing messages don't re-render on every keystroke / new message.
const MessageBubble = memo(function MessageBubble({ message }) {
  const { t, i18n } = useTranslation();
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === 'user';

  if (message.role === 'system') {
    return (
      <div className="mode-notice" role="status">
        <Sparkles size={12} /> {message.originalText}
      </div>
    );
  }

  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className={`message-bubble ${isUser ? 'user' : 'assistant'} ${message.isError ? 'error' : ''}`}>
        <p className="message-text">{message.originalText}</p>

        {!isUser && message.englishText && message.language !== 'en' && (
          <details className="english-translation">
            <summary>{t('viewEnglish')}</summary>
            <p>{message.englishText}</p>
          </details>
        )}

        {!isUser && message.retrievedChunks?.length > 0 && (
          <div className="message-meta">
            <button
              className="btn-sources"
              onClick={() => setShowSources(!showSources)}
              aria-expanded={showSources}
            >
              <Shield size={12} />
              {t('sources')} ({message.retrievedChunks.length})
              {showSources ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {message.confidence != null && (
              <span className="meta-tag confidence-meter" title={`${t('confidence')}: ${(message.confidence * 100).toFixed(0)}%`}>
                {t('confidence')}
                <span className="confidence-track">
                  <span className="confidence-fill" style={{ width: `${Math.round(message.confidence * 100)}%` }} />
                </span>
                {(message.confidence * 100).toFixed(0)}%
              </span>
            )}
            {message.latencyMs != null && (
              <span className="meta-tag">
                <Clock size={10} /> {(message.latencyMs / 1000).toFixed(1)}s
              </span>
            )}

            {showSources && (
              <div className="sources-panel">
                {message.retrievedChunks.map((chunk, i) => (
                  <div key={i} className="source-item">
                    <span className="source-label">
                      {t('sources')} {i + 1}: {chunk.source}
                    </span>
                    <p className="source-snippet">{chunk.snippet}</p>
                    <span className="source-score">Score: {chunk.score?.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <span className="message-time">
          {new Date(message.createdAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
});
