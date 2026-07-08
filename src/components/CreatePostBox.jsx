import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/appShared.js';
import { UserIcon } from './icons.jsx';

// ============================================
// CREATE POST BOX COMPONENT (Twitter-style)
// ============================================
const CreatePostBox = ({ onCreateClick, onAuthRequired, theme = 'prompted' }) => {
  const { user, profile } = useAuth();
  const tabsKey = user ? `postBoxTabs:${user.id}` : null;
  const newTab = () => ({ id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, content: '' });

  const [tabs, setTabs] = useState(() => {
    if (!tabsKey || typeof localStorage === 'undefined') return [newTab()];
    try {
      const raw = localStorage.getItem(tabsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [newTab()];
  });
  const [activeTabId, setActiveTabId] = useState(() => {
    if (!tabsKey || typeof localStorage === 'undefined') return null;
    try {
      const saved = localStorage.getItem(`${tabsKey}:active`);
      if (saved) return saved;
    } catch {}
    return null;
  });

  // Ensure activeTabId always points to a real tab
  useEffect(() => {
    if (tabs.length === 0) return;
    if (!activeTabId || !tabs.find(t => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  // Persist tabs + active id
  useEffect(() => {
    if (!tabsKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(tabsKey, JSON.stringify(tabs));
      if (activeTabId) localStorage.setItem(`${tabsKey}:active`, activeTabId);
    } catch {}
  }, [tabs, activeTabId, tabsKey]);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0] || { content: '' };
  const draft = activeTab.content;

  const updateActiveContent = (val) => {
    setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, content: val } : t));
  };

  const addTab = () => {
    const t = newTab();
    setTabs(prev => [...prev, t]);
    setActiveTabId(t.id);
  };

  const closeTab = (id) => {
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== id);
      if (remaining.length === 0) return [newTab()];
      return remaining;
    });
    if (id === activeTabId) {
      const idx = tabs.findIndex(t => t.id === id);
      const fallback = tabs[idx - 1] || tabs[idx + 1];
      if (fallback) setActiveTabId(fallback.id);
    }
  };

  const handleOpen = (text) => {
    if (!user) {
      onAuthRequired();
    } else {
      onCreateClick(text || '');
      updateActiveContent('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim()) handleOpen(draft.trim());
    }
  };

  const userHandle = profile?.username || user?.user_metadata?.username || 'user';
  const placeholders = {
    prompted: 'What are you sharing?',
    mac: `$ ./post --what-are-you-sharing`,
    windows: `C:\\Users\\${userHandle}> new-post`,
    linux: `➜ ~ post "what are you sharing?"`,
    retro: '> COMPOSE NEW TRANSMISSION_',
  };

  const tabLabel = (t) => {
    if (t.name) return t.name;
    const first = (t.content || '').trim().split('\n')[0];
    if (!first) return 'Untitled';
    return first.length > 22 ? first.slice(0, 22) + '…' : first;
  };

  const [editingTabId, setEditingTabId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const startRename = (t) => {
    setEditingTabId(t.id);
    setEditingName(t.name || '');
  };
  const commitRename = () => {
    if (!editingTabId) return;
    const name = editingName.trim();
    setTabs(prev => prev.map(t => t.id === editingTabId ? { ...t, name: name || null } : t));
    setEditingTabId(null);
    setEditingName('');
  };

  const isTerminal = theme && theme !== 'prompted';

  const renderTabs = () => (
    <div className="post-tabs-strip">
      {tabs.map(t => (
        <div
          key={t.id}
          className={`post-tab ${t.id === activeTabId ? 'active' : ''}`}
          onClick={() => {
            if (t.id === activeTabId && editingTabId !== t.id) {
              startRename(t);
            } else {
              setActiveTabId(t.id);
            }
          }}
          onDoubleClick={(e) => { e.stopPropagation(); startRename(t); }}
          title={t.name || t.content || 'Empty note · click active tab to rename'}
        >
          <span className="post-tab-icon">▮</span>
          {editingTabId === t.id ? (
            <input
              autoFocus
              className="post-tab-rename-input"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') { e.preventDefault(); setEditingTabId(null); setEditingName(''); }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="post-tab-title">{tabLabel(t)}</span>
          )}
          <span
            className="post-tab-close"
            onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
            title="Close note"
          >✕</span>
        </div>
      ))}
      <button className="post-tab-add" onClick={addTab} title="New note">+</button>
    </div>
  );

  return (
    <div className={`create-post-box ${isTerminal ? `terminal-themed terminal-theme-${theme}` : ''}`}>
      {isTerminal && (theme === 'windows' ? (
        <div className="create-post-titlebar windows-tabs">
          {renderTabs()}
          <div className="terminal-titlebar-spacer" />
          <div className="create-post-win-controls">
            <span>-</span><span>▢</span><span className="close">✕</span>
          </div>
        </div>
      ) : (
        <div className="create-post-titlebar">
          <div className="create-post-dots">
            <span className="create-post-dot close" />
            <span className="create-post-dot min" />
            <span className="create-post-dot max" />
          </div>
          <span className="create-post-titlebar-title">
            prompted - {theme === 'linux' ? 'bash' : theme === 'retro' ? 'tty1' : 'zsh'}
          </span>
          <div style={{ width: 42 }} />
        </div>
      ))}
      {isTerminal && theme !== 'windows' && (
        <div className="post-tabs-strip-row">{renderTabs()}</div>
      )}
      {!isTerminal && tabs.length > 1 && (
        <div className="post-tabs-strip-row prompted">{renderTabs()}</div>
      )}
      <div className="create-post-input-wrapper">
        <div className="create-post-avatar">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" />
          ) : profile?.avatar_emoji ? (
            <span>{profile.avatar_emoji}</span>
          ) : (
            <UserIcon />
          )}
        </div>
        <div className="create-post-input-container">
          <textarea
            className="create-post-textarea"
            placeholder={placeholders[theme] || placeholders.prompted}
            value={draft}
            onChange={(e) => updateActiveContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (!user) { onAuthRequired(); } }}
          />
          <div className="create-post-actions">
            {!isTerminal && tabs.length === 1 && (
              <button
                className="create-post-submit-btn"
                style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                onClick={addTab}
                title="Save another draft"
              >
                + Note
              </button>
            )}
            <button className="create-post-submit-btn" onClick={() => handleOpen(draft.trim())}>
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatePostBox;