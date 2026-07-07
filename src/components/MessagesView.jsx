// Messages (DM inbox + chat thread) view — extracted verbatim from App.jsx
// during the messages component split (July 2026). No behavior change.
// formatChatTime, NewConversationModal, chat color presets and MessageBubble
// are private helpers used only by this view.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../lib/appShared.js';
import { ChatAvatar, getConversationTitle } from './sharedUI.jsx';
import { PencilIcon } from './icons.jsx';

const formatChatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};



// New conversation modal — search users and (optionally) start a group.
const NewConversationModal = ({ isOpen, onClose, onCreated, currentUserId, currentProfile }) => {
  const { addToast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]); // [{id, username, ...}]
  const [groupTitle, setGroupTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery(''); setResults([]); setSelected([]); setGroupTitle(''); setBusy(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    if (q.length < 1) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, avatar_emoji, name_color')
        .ilike('username', `${q}%`)
        .neq('id', currentUserId || '00000000-0000-0000-0000-000000000000')
        .limit(10);
      if (!cancelled && !error) setResults(data || []);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, isOpen, currentUserId]);

  const toggleSelect = (profile) => {
    setSelected(prev => prev.find(p => p.id === profile.id)
      ? prev.filter(p => p.id !== profile.id)
      : [...prev, profile]);
  };

  const handleCreate = async () => {
    if (busy || selected.length === 0) return;
    setBusy(true);
    const isGroup = selected.length > 1;
    try {
      // For 1-on-1 DMs, reuse an existing conversation between the two users.
      if (!isGroup) {
        const otherId = selected[0].id;
        const { data: mine } = await supabase
          .from('conversation_participants')
          .select('conversation_id, conversations!inner(is_group)')
          .eq('user_id', currentUserId);
        const myConvIds = (mine || [])
          .filter(r => r.conversations && !r.conversations.is_group)
          .map(r => r.conversation_id);
        if (myConvIds.length > 0) {
          const { data: shared } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .in('conversation_id', myConvIds)
            .eq('user_id', otherId)
            .limit(1);
          if (shared && shared.length > 0) {
            onCreated(shared[0].conversation_id);
            onClose();
            setBusy(false);
            return;
          }
        }
      }

      const { data: convo, error: convErr } = await supabase
        .from('conversations')
        .insert({
          is_group: isGroup,
          title: isGroup ? (groupTitle.trim() || null) : null,
          created_by: currentUserId,
        })
        .select('id')
        .single();
      if (convErr) throw convErr;

      const participantRows = [
        { conversation_id: convo.id, user_id: currentUserId },
        ...selected.map(p => ({ conversation_id: convo.id, user_id: p.id })),
      ];
      const { error: partErr } = await supabase
        .from('conversation_participants')
        .insert(participantRows);
      if (partErr) throw partErr;

      onCreated(convo.id);
      onClose();
    } catch (err) {
      console.error('Create conversation failed', err);
      const detail = err?.message || err?.error_description || (err && JSON.stringify(err)) || '';
      if (addToast) addToast(`Could not start conversation${detail ? ': ' + detail : ''}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;
  const isGroup = selected.length > 1;

  return (
    <div className="modal-overlay new-convo-overlay" onClick={onClose}>
      <div className="modal new-convo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">New message</div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body new-convo-body">
          {selected.length > 0 && (
            <div className="new-convo-chips">
              {selected.map(p => (
                <span key={p.id} className="new-convo-chip">
                  @{p.username}
                  <button className="new-convo-chip-x" onClick={() => toggleSelect(p)} aria-label="Remove">✕</button>
                </span>
              ))}
            </div>
          )}
          {isGroup && (
            <input
              type="text"
              className="new-convo-group-input"
              placeholder="Group name (optional)"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              maxLength={60}
            />
          )}
          <input
            type="text"
            className="new-convo-search"
            placeholder="Search users by @username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="new-convo-results">
            {results.length === 0 && query.trim().length > 0 && (
              <div className="new-convo-empty">No users found.</div>
            )}
            {results.map(p => {
              const picked = !!selected.find(x => x.id === p.id);
              return (
                <button
                  key={p.id}
                  className={`new-convo-result ${picked ? 'picked' : ''}`}
                  onClick={() => toggleSelect(p)}
                >
                  <ChatAvatar profile={p} size={32} />
                  <span className="new-convo-result-name" style={p.name_color ? { color: p.name_color } : undefined}>
                    @{p.username}
                  </span>
                  {picked && <span className="new-convo-pick-mark">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="new-convo-footer">
          <button
            className="new-convo-create"
            disabled={selected.length === 0 || busy}
            onClick={handleCreate}
          >
            {busy ? 'Starting…' : isGroup ? `Start group (${selected.length})` : 'Start chat'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Chat customization — bubble color swatches + background presets. Stored as
// plain CSS strings so they can be dropped straight into inline styles.
const CHAT_BUBBLE_COLORS = [
  { value: '', label: 'Default' },
  { value: '#4ECDC4' }, { value: '#10A37F' }, { value: '#3B82F6' }, { value: '#8B5CF6' },
  { value: '#EC4899' }, { value: '#D97757' }, { value: '#C9A227' }, { value: '#EF4444' },
  { value: '#0EA5E9' }, { value: '#22C55E' }, { value: '#F59E0B' }, { value: '#64748B' },
];
const CHAT_BG_PRESETS = [
  { value: '', label: 'Default' },
  { value: 'linear-gradient(160deg, #0f2027, #203a43, #2c5364)', label: 'Midnight' },
  { value: 'linear-gradient(160deg, #2b1055, #7597de)', label: 'Dusk' },
  { value: 'linear-gradient(160deg, #0b3d2e, #1d6f53)', label: 'Forest' },
  { value: 'linear-gradient(160deg, #2a0a0a, #6b2b2b)', label: 'Ember' },
  { value: 'linear-gradient(160deg, #0a2342, #126e82)', label: 'Ocean' },
  { value: 'linear-gradient(160deg, #3d1f2b, #7d4a5f)', label: 'Rosé' },
  { value: '#15151b', label: 'Graphite' },
];

// Black or white text, whichever reads better on the given bubble color.
const pickChatTextColor = (hex) => {
  if (!hex || hex[0] !== '#') return undefined;
  const h = hex.length === 4
    ? '#' + hex.slice(1).split('').map(c => c + c).join('')
    : hex;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  if ([r, g, b].some(Number.isNaN)) return undefined;
  // Perceived luminance (sRGB) → dark text on light bubbles, light on dark.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000' : '#fff';
};

// Single message bubble. Renders text, optional image attachment, and an
// optional shared-post mini-card.
const MessageBubble = ({ message, isMine, myBubbleColor, sharedPostsById, sharedProfilesById, sharedCommunitiesById, onOpenSharedPost, onOpenSharedProfile, onOpenSharedCommunity, isEditing = false, editValue = '', onEditChange, onStartEdit, onSaveEdit, onCancelEdit, onDeleteMessage }) => {
  const sharedPost = message.shared_post_id ? sharedPostsById?.[message.shared_post_id] : null;
  const sharedProfile = message.shared_profile_id ? sharedProfilesById?.[message.shared_profile_id] : null;
  const sharedCommunity = message.shared_community_id ? sharedCommunitiesById?.[message.shared_community_id] : null;
  return (
    <div className={`chat-msg ${isMine ? 'chat-msg-mine' : 'chat-msg-theirs'}`}>
      {!isMine && message.sender && (
        <ChatAvatar profile={message.sender} size={28} />
      )}
      <div
        className="chat-msg-body"
        style={isMine && myBubbleColor ? { background: myBubbleColor, color: pickChatTextColor(myBubbleColor) } : undefined}
      >
        {!isMine && message.sender?.username && (
          <div className="chat-msg-author" style={message.sender?.name_color ? { color: message.sender.name_color } : undefined}>
            @{message.sender.username}
          </div>
        )}
        {message.attachment_url && (
          message.attachment_type === 'video'
            ? <video src={message.attachment_url} controls playsInline className="chat-msg-attachment" />
            : <img src={message.attachment_url} alt="" className="chat-msg-attachment" />
        )}
        {sharedPost && (
          <button
            className="chat-msg-shared"
            onClick={() => onOpenSharedPost && onOpenSharedPost(sharedPost)}
          >
            <div className="chat-msg-shared-label">Shared {sharedPost.post_type === 'post' ? 'post' : 'build'}</div>
            <div className="chat-msg-shared-title">{sharedPost.title || 'Untitled'}</div>
            {sharedPost.images && sharedPost.images.length > 0 && (
              <img src={sharedPost.images[0]} alt="" className="chat-msg-shared-thumb" />
            )}
          </button>
        )}
        {sharedProfile && (
          <button
            className="chat-msg-shared chat-msg-shared-profile"
            onClick={() => onOpenSharedProfile && onOpenSharedProfile(sharedProfile)}
          >
            <div className="chat-msg-shared-label">Shared profile</div>
            <div className="chat-msg-shared-profile-row">
              <ChatAvatar profile={sharedProfile} size={40} />
              <div className="chat-msg-shared-title" style={sharedProfile.name_color ? { color: sharedProfile.name_color } : undefined}>
                @{sharedProfile.username}
              </div>
            </div>
          </button>
        )}
        {sharedCommunity && (
          <button
            className="chat-msg-shared chat-msg-shared-community"
            onClick={() => onOpenSharedCommunity && onOpenSharedCommunity(sharedCommunity)}
          >
            <div className="chat-msg-shared-label">Shared community</div>
            <div className="chat-msg-shared-title">{sharedCommunity.name || 'Community'}</div>
            {sharedCommunity.icon_url && (
              <img src={sharedCommunity.icon_url} alt="" className="chat-msg-shared-thumb" />
            )}
          </button>
        )}
        {isEditing ? (
          <div className="chat-msg-edit" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              className="chat-msg-edit-input"
              value={editValue}
              autoFocus
              onChange={(e) => onEditChange && onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit && onSaveEdit(); }
                else if (e.key === 'Escape') { onCancelEdit && onCancelEdit(); }
              }}
              rows={2}
              style={{ width: '100%', background: 'rgba(0,0,0,0.25)', color: 'inherit', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, padding: '6px 8px', font: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => onCancelEdit && onCancelEdit()} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'inherit', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => onSaveEdit && onSaveEdit()} disabled={!editValue.trim()} style={{ background: '#a855f7', border: 'none', color: '#fff', borderRadius: 6, padding: '3px 12px', fontSize: 12, cursor: editValue.trim() ? 'pointer' : 'not-allowed', opacity: editValue.trim() ? 1 : 0.5 }}>Save</button>
            </div>
          </div>
        ) : (
          message.content && <div className="chat-msg-text">{message.content}</div>
        )}
        <div className="chat-msg-time">
          {formatChatTime(message.created_at)}
          {message.edited_at && <span className="chat-msg-edited" style={{ opacity: 0.7 }}> · edited</span>}
          {isMine && message.content && !isEditing && onStartEdit && (
            <button
              className="chat-msg-edit-btn"
              onClick={() => onStartEdit(message)}
              style={{ marginLeft: 8, background: 'transparent', border: 'none', color: 'inherit', opacity: 0.6, fontSize: 11, cursor: 'pointer', padding: 0 }}
              title="Edit message"
            >Edit</button>
          )}
          {isMine && !isEditing && onDeleteMessage && (
            <button
              className="chat-msg-delete-btn"
              onClick={() => onDeleteMessage(message)}
              style={{ marginLeft: 8, background: 'transparent', border: 'none', color: 'inherit', opacity: 0.6, fontSize: 11, cursor: 'pointer', padding: 0 }}
              title="Delete message"
            >Delete</button>
          )}
        </div>
      </div>
    </div>
  );
};


// Inbox + thread. The inbox is always visible; on mobile a selected
// conversation slides over the inbox (controlled by a CSS class).
const MessagesView = ({ user, profile, onUserClick, onOpenSharedPost, onOpenSharedProfile, onOpenSharedCommunity, initialConversationId = null, onRead = null }) => {
  const { addToast } = useToast();
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [sharedPostsById, setSharedPostsById] = useState({});
  const [sharedProfilesById, setSharedProfilesById] = useState({});
  const [sharedCommunitiesById, setSharedCommunitiesById] = useState({});
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState(null); // {file, previewUrl, kind}
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);   // message id being edited
  const [editDraft, setEditDraft] = useState('');
  const [otherReadAt, setOtherReadAt] = useState(null); // latest last_read_at among other participants (1:1 read receipts)
  const [groupAvatarBusy, setGroupAvatarBusy] = useState(false);
  const fileInputRef = useRef(null);
  const groupAvatarInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Chat customization (bubble color + background). globalTheme mirrors the
  // user's profile defaults; per-chat overrides ride on each conversation row
  // (my_chat_bubble_color / my_chat_bg_theme). The picker writes to whichever
  // scope the user chose.
  const [globalTheme, setGlobalTheme] = useState({
    bubble: profile?.chat_bubble_color || '',
    bg: profile?.chat_bg_theme || '',
  });
  useEffect(() => {
    setGlobalTheme({ bubble: profile?.chat_bubble_color || '', bg: profile?.chat_bg_theme || '' });
  }, [profile?.chat_bubble_color, profile?.chat_bg_theme]);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [themeScope, setThemeScope] = useState('all'); // 'all' | 'this'
  const [themeBubble, setThemeBubble] = useState('');
  const [themeBg, setThemeBg] = useState('');
  const [savingTheme, setSavingTheme] = useState(false);

  // Initial inbox load + realtime subscription on participants for this user.
  const reloadInbox = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id,
        last_read_at,
        chat_bubble_color,
        chat_bg_theme,
        conversations:conversation_id (
          id, is_group, title, avatar_url, created_by, last_message_at, created_at,
          conversation_participants (
            user_id,
            profiles:user_id (id, username, avatar_url, avatar_emoji, name_color)
          )
        )
      `)
      .eq('user_id', user.id);
    if (error) { console.error(error); return; }
    const rows = (data || [])
      .map(r => ({ ...r.conversations, my_last_read_at: r.last_read_at, my_chat_bubble_color: r.chat_bubble_color || '', my_chat_bg_theme: r.chat_bg_theme || '' }))
      .filter(Boolean)
      .sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));

    // Pull last message preview for each conversation.
    const ids = rows.map(c => c.id);
    let previewByConv = {};
    if (ids.length > 0) {
      const { data: lastMsgs } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, attachment_url, shared_post_id, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false });
      for (const m of (lastMsgs || [])) {
        if (!previewByConv[m.conversation_id]) previewByConv[m.conversation_id] = m;
      }
    }
    setConversations(rows.map(c => ({ ...c, last_message: previewByConv[c.id] || null })));
  }, [user?.id]);

  useEffect(() => { reloadInbox(); }, [reloadInbox]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const ch = supabase
      .channel(`inbox-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${user.id}` }, () => reloadInbox())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => reloadInbox())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, reloadInbox]);

  // If parent passed an initialConversationId (e.g. opened from a share menu)
  // pick that conversation once it loads.
  useEffect(() => {
    if (initialConversationId && !activeConvId) setActiveConvId(initialConversationId);
  }, [initialConversationId, activeConvId]);

  // Hydrate the active conversation directly when the user opens or creates
  // one. The inbox reload is async, so right after setActiveConvId fires the
  // `conversations` array may not yet include the row — that left the thread
  // header stuck on "Loading…". This effect fetches the row + its
  // participants + their profiles in one trip and inserts it into local
  // state if it isn't already there.
  useEffect(() => {
    if (!activeConvId) return undefined;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id, is_group, title, avatar_url, created_by, last_message_at, created_at,
          conversation_participants (
            user_id,
            profiles:user_id (id, username, avatar_url, avatar_emoji, name_color)
          )
        `)
        .eq('id', activeConvId)
        .single();
      if (cancelled || error || !data) return;
      setConversations(prev => {
        if (prev.find(c => c.id === activeConvId)) return prev;
        return [{ ...data, my_last_read_at: data.created_at }, ...prev];
      });
    })();
    return () => { cancelled = true; };
  }, [activeConvId]);

  // Load messages for active conversation + realtime.
  useEffect(() => {
    if (!activeConvId) { setMessages([]); return undefined; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select(`
          id, conversation_id, sender_id, content, attachment_url, attachment_type,
          shared_post_id, shared_profile_id, shared_community_id, created_at, edited_at,
          sender:sender_id (id, username, avatar_url, avatar_emoji, name_color)
        `)
        .eq('conversation_id', activeConvId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (cancelled) return;
      setMessages(data || []);

      // Read receipts: seed the latest last_read_at among the OTHER
      // participant(s). Kept fresh by the realtime participant listener below.
      if (user?.id) {
        const { data: parts } = await supabase
          .from('conversation_participants')
          .select('user_id, last_read_at')
          .eq('conversation_id', activeConvId)
          .neq('user_id', user.id);
        if (!cancelled) {
          const times = (parts || []).map(p => p.last_read_at).filter(Boolean).map(t => new Date(t).getTime());
          setOtherReadAt(times.length ? new Date(Math.max(...times)).toISOString() : null);
        }
      }

      // Hydrate the three shared-entity caches in parallel.
      const postIds = (data || []).map(m => m.shared_post_id).filter(Boolean);
      const profileIds = (data || []).map(m => m.shared_profile_id).filter(Boolean);
      const communityIds = (data || []).map(m => m.shared_community_id).filter(Boolean);

      if (postIds.length > 0) {
        const { data: posts } = await supabase
          .from('posts')
          .select('id, title, post_type, images, user_id')
          .in('id', postIds);
        if (!cancelled) {
          setSharedPostsById(prev => {
            const next = { ...prev };
            for (const p of (posts || [])) next[p.id] = p;
            return next;
          });
        }
      }
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, avatar_emoji, name_color')
          .in('id', profileIds);
        if (!cancelled) {
          setSharedProfilesById(prev => {
            const next = { ...prev };
            for (const p of (profiles || [])) next[p.id] = p;
            return next;
          });
        }
      }
      if (communityIds.length > 0) {
        const { data: comms } = await supabase
          .from('communities')
          .select('id, name, icon_url')
          .in('id', communityIds);
        if (!cancelled) {
          setSharedCommunitiesById(prev => {
            const next = { ...prev };
            for (const c of (comms || [])) next[c.id] = c;
            return next;
          });
        }
      }
    })();

    const ch = supabase
      .channel(`thread-${activeConvId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConvId}` },
        async (payload) => {
          const m = payload.new;
          // Hydrate sender profile + any shared-entity references in parallel
          // so the bubble renders complete on first paint.
          const [senderRes, postRes, profileRes, commRes] = await Promise.all([
            supabase.from('profiles').select('id, username, avatar_url, avatar_emoji, name_color').eq('id', m.sender_id).single(),
            m.shared_post_id
              ? supabase.from('posts').select('id, title, post_type, images, user_id').eq('id', m.shared_post_id).single()
              : Promise.resolve({ data: null }),
            m.shared_profile_id
              ? supabase.from('profiles').select('id, username, avatar_url, avatar_emoji, name_color').eq('id', m.shared_profile_id).single()
              : Promise.resolve({ data: null }),
            m.shared_community_id
              ? supabase.from('communities').select('id, name, icon_url').eq('id', m.shared_community_id).single()
              : Promise.resolve({ data: null }),
          ]);
          if (postRes.data) setSharedPostsById(prev => ({ ...prev, [postRes.data.id]: postRes.data }));
          if (profileRes.data) setSharedProfilesById(prev => ({ ...prev, [profileRes.data.id]: profileRes.data }));
          if (commRes.data) setSharedCommunitiesById(prev => ({ ...prev, [commRes.data.id]: commRes.data }));
          setMessages(prev => prev.find(x => x.id === m.id) ? prev : [...prev, { ...m, sender: senderRes.data }]);
        }
      )
      // Live edits: merge the changed fields, keep the hydrated sender/shared refs.
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConvId}` },
        (payload) => {
          const m = payload.new;
          setMessages(prev => prev.map(x => x.id === m.id
            ? { ...x, content: m.content, edited_at: m.edited_at, attachment_url: m.attachment_url, attachment_type: m.attachment_type }
            : x));
        }
      )
      // Live deletes (no conversation filter: DELETE old-row matching is by id,
      // and we only drop ids we actually have).
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const oldId = payload.old?.id;
          if (oldId) setMessages(prev => prev.filter(x => x.id !== oldId));
        }
      )
      // Read receipts: the other participant reading bumps their last_read_at.
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_participants', filter: `conversation_id=eq.${activeConvId}` },
        (payload) => {
          const row = payload.new;
          if (!row || row.user_id === user?.id || !row.last_read_at) return;
          setOtherReadAt(prev => (!prev || new Date(row.last_read_at).getTime() > new Date(prev).getTime()) ? row.last_read_at : prev);
        }
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [activeConvId]);

  // Mark active conversation as read whenever messages change.
  // The unread badge compares the conversation's (server-time) last_message_at
  // against this last_read_at. Stamping with the client clock alone is unsafe:
  // if the device clock runs behind the server the stamp lands in the past and
  // the conversation stays "unread" forever. So stamp with the later instant of
  // the client now and the conversation's (server) last_message_at, guaranteeing
  // last_read_at >= last_message_at regardless of device clock skew.
  // Depend on the primitive last_message_at (not the conversations array): the
  // read-stamp below never changes last_message_at, so this stays stable across
  // the participant UPDATE → inbox reload cycle and can't spin into a write loop.
  const activeConvLastMsgAt = conversations.find(c => c.id === activeConvId)?.last_message_at || null;
  useEffect(() => {
    if (!activeConvId || !user?.id) return;
    const clientNow = new Date();
    const lastMsgAt = activeConvLastMsgAt ? new Date(activeConvLastMsgAt) : null;
    const readAt = (lastMsgAt && lastMsgAt.getTime() > clientNow.getTime() ? lastMsgAt : clientNow).toISOString();
    supabase
      .from('conversation_participants')
      .update({ last_read_at: readAt })
      .eq('conversation_id', activeConvId)
      .eq('user_id', user.id)
      .then(({ error }) => {
        // Refresh the header/sidebar badge directly rather than waiting on the
        // realtime UPDATE event, which can be dropped on a flaky native socket.
        if (!error && onRead) onRead();
      });
  }, [activeConvId, messages.length, user?.id, activeConvLastMsgAt, onRead]);

  // Auto-scroll thread to bottom on new messages.
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ block: 'end' });
    }
  }, [messages.length, activeConvId]);

  const handlePickAttachment = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type);
    const isVideo = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
    if (!isImage && !isVideo) {
      if (addToast) addToast('Only images (JPEG/PNG/GIF/WebP) or videos (MP4/WebM/MOV) are supported.', 'error');
      return;
    }
    const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      if (addToast) addToast(`${isVideo ? 'Video' : 'Image'} too large (max ${isVideo ? '50MB' : '5MB'}).`, 'error');
      return;
    }
    setPendingAttachment({ file, previewUrl: URL.createObjectURL(file), kind: isVideo ? 'video' : 'image' });
    e.target.value = '';
  };

  const clearAttachment = () => {
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
  };

  const handlePickGroupAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeConvId || !user?.id) return;
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      if (addToast) addToast('Only JPEG / PNG / GIF / WebP images are supported.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      if (addToast) addToast('Image too large (max 5MB).', 'error');
      return;
    }
    setGroupAvatarBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user.id}/group-${activeConvId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('chat-attachments')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      const nextUrl = signed.signedUrl;
      const { error: updateErr } = await supabase
        .from('conversations')
        .update({ avatar_url: nextUrl })
        .eq('id', activeConvId);
      if (updateErr) throw updateErr;
      setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, avatar_url: nextUrl } : c));
    } catch (err) {
      console.error('Group avatar upload failed', err);
      if (addToast) addToast(`Could not update group photo${err?.message ? ': ' + err.message : ''}`, 'error');
    } finally {
      setGroupAvatarBusy(false);
    }
  };

  const handleSend = async () => {
    if (sending || !activeConvId || !user?.id) return;
    const text = draft.trim();
    if (!text && !pendingAttachment) return;
    setSending(true);
    try {
      let attachmentUrl = null;
      const attachmentKind = pendingAttachment?.kind || 'image';
      if (pendingAttachment) {
        setAttachmentBusy(true);
        const file = pendingAttachment.file;
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('chat-attachments')
          .upload(path, file, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;
        // Bucket is private — create a long-lived signed URL we store on the message.
        const { data: signed, error: signErr } = await supabase.storage
          .from('chat-attachments')
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signErr) throw signErr;
        attachmentUrl = signed.signedUrl;
        setAttachmentBusy(false);
      }
      // sender_id is set server-side via the auth.uid() column default; do not
      // send it from the client. Only include content / attachment_url when
      // we have them. Use .select() so we can optimistically append the
      // new message into local state regardless of realtime delivery timing.
      const insertRow = { conversation_id: activeConvId };
      if (text) insertRow.content = text;
      if (attachmentUrl) {
        insertRow.attachment_url = attachmentUrl;
        insertRow.attachment_type = attachmentKind;
      }
      const { data: insertedMsg, error } = await supabase
        .from('messages')
        .insert(insertRow)
        .select(`
          id, conversation_id, sender_id, content, attachment_url, attachment_type,
          shared_post_id, shared_profile_id, shared_community_id, created_at, edited_at,
          sender:sender_id (id, username, avatar_url, avatar_emoji, name_color)
        `)
        .single();
      if (error) throw error;
      if (insertedMsg) {
        setMessages(prev => prev.find(x => x.id === insertedMsg.id) ? prev : [...prev, insertedMsg]);
      }
      setDraft('');
      clearAttachment();
    } catch (err) {
      console.error('Send failed', err);
      const detail = err?.message || err?.error_description || (err && JSON.stringify(err)) || '';
      if (addToast) addToast(`Could not send message${detail ? ': ' + detail : ''}`, 'error');
      setAttachmentBusy(false);
    } finally {
      setSending(false);
    }
  };

  const startEditMessage = (message) => {
    setEditingId(message.id);
    setEditDraft(message.content || '');
  };
  const cancelEditMessage = () => {
    setEditingId(null);
    setEditDraft('');
  };
  const saveEditMessage = async () => {
    const text = editDraft.trim();
    if (!editingId || !text) return;
    const id = editingId;
    const editedAt = new Date().toISOString();
    try {
      // RLS (messages_update_sender) already limits this to the sender's rows.
      const { error } = await supabase
        .from('messages')
        .update({ content: text, edited_at: editedAt })
        .eq('id', id);
      if (error) throw error;
      setMessages(prev => prev.map(m => (m.id === id ? { ...m, content: text, edited_at: editedAt } : m)));
      cancelEditMessage();
    } catch (err) {
      console.error('Edit failed', err);
      if (addToast) addToast(`Could not edit message${err?.message ? ': ' + err.message : ''}`, 'error');
    }
  };

  const deleteMessage = async (message) => {
    if (!message?.id) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this message? This cannot be undone.')) return;
    try {
      // RLS (messages_delete_sender) limits this to the sender's own rows.
      const { error } = await supabase.from('messages').delete().eq('id', message.id);
      if (error) throw error;
      setMessages(prev => prev.filter(m => m.id !== message.id));
      if (editingId === message.id) cancelEditMessage();
    } catch (err) {
      console.error('Delete failed', err);
      if (addToast) addToast(`Could not delete message${err?.message ? ': ' + err.message : ''}`, 'error');
    }
  };

  const activeConv = conversations.find(c => c.id === activeConvId) || null;
  const isInboxView = !activeConvId;

  // Resolve the theme for the open chat: per-chat override wins, else the
  // user's global default, else the app default (empty → CSS handles it).
  const resolvedBubble = (activeConv?.my_chat_bubble_color || globalTheme.bubble) || '';
  const resolvedBg = (activeConv?.my_chat_bg_theme || globalTheme.bg) || '';

  // Load the picker's draft from whichever scope we're editing.
  const loadThemeDraft = (scope) => {
    if (scope === 'this') {
      setThemeBubble(activeConv?.my_chat_bubble_color || '');
      setThemeBg(activeConv?.my_chat_bg_theme || '');
    } else {
      setThemeBubble(globalTheme.bubble || '');
      setThemeBg(globalTheme.bg || '');
    }
  };
  const openThemePicker = () => {
    const scope = (activeConv?.my_chat_bubble_color || activeConv?.my_chat_bg_theme) ? 'this' : 'all';
    setThemeScope(scope);
    loadThemeDraft(scope);
    setShowThemePicker(true);
  };
  const switchThemeScope = (scope) => {
    setThemeScope(scope);
    loadThemeDraft(scope);
  };
  const saveChatTheme = async () => {
    if (!user?.id) return;
    setSavingTheme(true);
    try {
      if (themeScope === 'all') {
        const { error } = await supabase
          .from('profiles')
          .update({ chat_bubble_color: themeBubble || null, chat_bg_theme: themeBg || null })
          .eq('id', user.id);
        if (error) throw error;
        setGlobalTheme({ bubble: themeBubble || '', bg: themeBg || '' });
        window.dispatchEvent(new Event('profile-updated'));
      } else {
        const { error } = await supabase
          .from('conversation_participants')
          .update({ chat_bubble_color: themeBubble || null, chat_bg_theme: themeBg || null })
          .eq('conversation_id', activeConvId)
          .eq('user_id', user.id);
        if (error) throw error;
        setConversations(prev => prev.map(c => c.id === activeConvId
          ? { ...c, my_chat_bubble_color: themeBubble || '', my_chat_bg_theme: themeBg || '' }
          : c));
      }
      if (addToast) addToast('Chat theme saved', 'success');
      setShowThemePicker(false);
    } catch (err) {
      console.error('Save chat theme failed', err);
      if (addToast) addToast(`Could not save theme${err?.message ? ': ' + err.message : ''}`, 'error');
    } finally {
      setSavingTheme(false);
    }
  };

  return (
    <div className={`messages-view ${isInboxView ? 'show-inbox' : 'show-thread'}`}>
      <aside className="messages-inbox">
        <div className="messages-inbox-header">
          <h2 className="messages-inbox-title">Messages</h2>
          <button className="messages-new-btn" onClick={() => setShowNewConvo(true)} aria-label="New message">
            <PencilIcon />
          </button>
        </div>
        {conversations.length === 0 ? (
          <div className="messages-inbox-empty">
            <p>No conversations yet.</p>
            <button className="messages-empty-cta" onClick={() => setShowNewConvo(true)}>Start your first chat</button>
          </div>
        ) : (
          <ul className="messages-inbox-list">
            {conversations.map(conv => {
              const isActive = conv.id === activeConvId;
              const isUnread = conv.last_message_at && conv.my_last_read_at
                && new Date(conv.last_message_at).getTime() > new Date(conv.my_last_read_at).getTime();
              const previewMsg = conv.last_message;
              const previewText = previewMsg?.content
                ? previewMsg.content
                : previewMsg?.attachment_url
                  ? (previewMsg.attachment_type === 'video' ? '🎬 Video' : '📎 Image')
                  : previewMsg?.shared_post_id
                    ? '↗ Shared a post'
                    : 'New conversation';
              const otherParts = (conv.conversation_participants || []).filter(p => p.user_id !== user?.id);
              const headProfile = conv.is_group ? null : otherParts[0]?.profiles;
              return (
                <li
                  key={conv.id}
                  className={`inbox-row ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}`}
                  onClick={() => setActiveConvId(conv.id)}
                >
                  {conv.is_group ? (
                    conv.avatar_url ? (
                      <div className="chat-avatar" style={{ width: 40, height: 40 }}>
                        <img src={conv.avatar_url} alt="" />
                      </div>
                    ) : (
                      <div className="chat-avatar chat-avatar-group" style={{ width: 40, height: 40, fontSize: 16 }}>
                        {(conv.title || 'G').charAt(0).toUpperCase()}
                      </div>
                    )
                  ) : (
                    <ChatAvatar profile={headProfile} size={40} />
                  )}
                  <div className="inbox-row-body">
                    <div className="inbox-row-top">
                      <span className="inbox-row-name">{getConversationTitle(conv, user?.id)}</span>
                      <span className="inbox-row-time">{formatChatTime(conv.last_message_at)}</span>
                    </div>
                    <div className="inbox-row-preview">{previewText}</div>
                  </div>
                  {isUnread && <span className="inbox-row-dot" aria-hidden />}
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="messages-thread">
        {/* Gate the thread on activeConvId, not activeConv. activeConv is
            derived from the inbox `conversations` array which loads
            asynchronously; if we waited on it the composer + thread body
            would flicker through the "Select a conversation" empty state
            every time the user opened or created a new chat. */}
        {!activeConvId ? (
          <div className="messages-thread-empty">Select a conversation</div>
        ) : (
          <>
            <header className="messages-thread-header">
              <button
                className="messages-thread-back"
                onClick={() => setActiveConvId(null)}
                aria-label="Back to inbox"
              >
                ‹
              </button>
              {(() => {
                const otherParts = ((activeConv?.conversation_participants) || []).filter(p => p.user_id !== user?.id);
                const headProfile = activeConv?.is_group ? null : otherParts[0]?.profiles;
                if (!activeConv) {
                  return <div className="chat-avatar chat-avatar-fallback" style={{ width: 32, height: 32, fontSize: 14 }}>·</div>;
                }
                if (!activeConv.is_group) {
                  return <ChatAvatar profile={headProfile} size={32} />;
                }
                const isCreator = activeConv.created_by === user?.id;
                const avatarNode = activeConv.avatar_url ? (
                  <div className="chat-avatar" style={{ width: 32, height: 32 }}>
                    <img src={activeConv.avatar_url} alt="" />
                  </div>
                ) : (
                  <div className="chat-avatar chat-avatar-group" style={{ width: 32, height: 32, fontSize: 14 }}>
                    {(activeConv.title || 'G').charAt(0).toUpperCase()}
                  </div>
                );
                if (!isCreator) return avatarNode;
                return (
                  <button
                    type="button"
                    className="messages-thread-avatar-edit"
                    onClick={() => groupAvatarInputRef.current?.click()}
                    disabled={groupAvatarBusy}
                    aria-label="Change group photo"
                    title="Change group photo"
                  >
                    {avatarNode}
                    <span className="messages-thread-avatar-edit-overlay" aria-hidden>
                      {groupAvatarBusy ? '…' : '✎'}
                    </span>
                  </button>
                );
              })()}
              <input
                ref={groupAvatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={handlePickGroupAvatar}
              />
              <div className="messages-thread-title-block">
                {activeConv?.is_group && activeConv?.created_by === user?.id && !renamingGroup ? (
                  <button
                    className="messages-thread-title messages-thread-title-editable"
                    onClick={() => {
                      setRenameDraft(activeConv.title || '');
                      setRenamingGroup(true);
                    }}
                    title="Tap to rename group"
                  >
                    {getConversationTitle(activeConv, user?.id)}
                    <span className="messages-thread-title-edit-hint" aria-hidden>✎</span>
                  </button>
                ) : activeConv?.is_group && activeConv?.created_by === user?.id && renamingGroup ? (
                  <form
                    className="messages-thread-rename"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const next = renameDraft.trim();
                      if (next === (activeConv.title || '').trim()) {
                        setRenamingGroup(false);
                        return;
                      }
                      try {
                        const { error } = await supabase
                          .from('conversations')
                          .update({ title: next || null })
                          .eq('id', activeConvId);
                        if (error) throw error;
                        setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, title: next || null } : c));
                      } catch (err) {
                        console.error('Rename group failed', err);
                        if (addToast) addToast(`Could not rename group${err?.message ? ': ' + err.message : ''}`, 'error');
                      } finally {
                        setRenamingGroup(false);
                      }
                    }}
                  >
                    <input
                      type="text"
                      className="messages-thread-rename-input"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => setRenamingGroup(false)}
                      autoFocus
                      maxLength={60}
                      placeholder="Group name"
                    />
                  </form>
                ) : (
                  <div className="messages-thread-title">{activeConv ? getConversationTitle(activeConv, user?.id) : 'Loading…'}</div>
                )}
                {activeConv?.is_group && (
                  <div className="messages-thread-sub">
                    {(activeConv.conversation_participants || []).length} members
                  </div>
                )}
              </div>
              {activeConv && (
                <button
                  type="button"
                  className="messages-thread-theme-btn"
                  onClick={openThemePicker}
                  aria-label="Customize chat colors"
                  title="Customize chat colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/>
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996C18.928 16.27 22 13.198 22 9.5 22 5.36 17.64 2 12 2z"/>
                  </svg>
                </button>
              )}
            </header>
            <div className="messages-thread-body" style={resolvedBg ? { background: resolvedBg } : undefined}>
              {messages.map(m => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isMine={m.sender_id === user?.id}
                  myBubbleColor={resolvedBubble}
                  sharedPostsById={sharedPostsById}
                  sharedProfilesById={sharedProfilesById}
                  sharedCommunitiesById={sharedCommunitiesById}
                  onOpenSharedPost={onOpenSharedPost}
                  onOpenSharedProfile={onOpenSharedProfile}
                  onOpenSharedCommunity={onOpenSharedCommunity}
                  isEditing={editingId === m.id}
                  editValue={editDraft}
                  onEditChange={setEditDraft}
                  onStartEdit={startEditMessage}
                  onSaveEdit={saveEditMessage}
                  onCancelEdit={cancelEditMessage}
                  onDeleteMessage={deleteMessage}
                />
              ))}
              {/* Read receipt under my most-recent message (1:1 chats only). */}
              {!activeConv?.is_group && messages.length > 0 && messages[messages.length - 1].sender_id === user?.id && (
                <div style={{ textAlign: 'right', fontSize: 11, opacity: 0.55, padding: '2px 10px 0' }}>
                  {otherReadAt && new Date(otherReadAt).getTime() >= new Date(messages[messages.length - 1].created_at).getTime() ? 'Seen' : 'Sent'}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            {showThemePicker && (
              <div className="chat-theme-overlay" onClick={() => setShowThemePicker(false)}>
                <div className="chat-theme-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="chat-theme-head">
                    <span>Chat theme</span>
                    <button className="chat-theme-close" onClick={() => setShowThemePicker(false)} aria-label="Close">✕</button>
                  </div>

                  <div className="chat-theme-scope">
                    <button
                      className={`chat-theme-scope-btn ${themeScope === 'all' ? 'active' : ''}`}
                      onClick={() => switchThemeScope('all')}
                    >For all chats</button>
                    <button
                      className={`chat-theme-scope-btn ${themeScope === 'this' ? 'active' : ''}`}
                      onClick={() => switchThemeScope('this')}
                    >Just this chat</button>
                  </div>

                  <div className="chat-theme-preview" style={themeBg ? { background: themeBg } : undefined}>
                    <div className="chat-theme-preview-bubble theirs">Like the new colors?</div>
                    <div
                      className="chat-theme-preview-bubble mine"
                      style={themeBubble ? { background: themeBubble, color: pickChatTextColor(themeBubble) } : undefined}
                    >Looks great 🎨</div>
                  </div>

                  <div className="chat-theme-label">Bubble color</div>
                  <div className="chat-theme-swatches">
                    {CHAT_BUBBLE_COLORS.map((c, i) => (
                      <button
                        key={i}
                        className={`chat-theme-swatch ${(themeBubble || '') === c.value ? 'selected' : ''} ${!c.value ? 'is-default' : ''}`}
                        style={c.value ? { background: c.value } : undefined}
                        onClick={() => setThemeBubble(c.value)}
                        title={c.label || c.value}
                      >{!c.value ? '⊘' : ''}</button>
                    ))}
                  </div>

                  <div className="chat-theme-label">Background</div>
                  <div className="chat-theme-swatches">
                    {CHAT_BG_PRESETS.map((b, i) => (
                      <button
                        key={i}
                        className={`chat-theme-swatch chat-theme-swatch-bg ${(themeBg || '') === b.value ? 'selected' : ''} ${!b.value ? 'is-default' : ''}`}
                        style={b.value ? { background: b.value } : undefined}
                        onClick={() => setThemeBg(b.value)}
                        title={b.label}
                      >{!b.value ? '⊘' : ''}</button>
                    ))}
                  </div>

                  <button className="chat-theme-save" onClick={saveChatTheme} disabled={savingTheme}>
                    {savingTheme ? 'Saving…' : themeScope === 'all' ? 'Save for all chats' : 'Save for this chat'}
                  </button>
                </div>
              </div>
            )}
            {pendingAttachment && (
              <div className="messages-pending-attachment">
                {pendingAttachment.kind === 'video'
                  ? <video src={pendingAttachment.previewUrl} muted playsInline style={{ maxHeight: 120, borderRadius: 8 }} />
                  : <img src={pendingAttachment.previewUrl} alt="" />}
                <button onClick={clearAttachment} aria-label="Remove attachment">✕</button>
              </div>
            )}
            <div className="messages-composer">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
                style={{ display: 'none' }}
                onChange={handlePickAttachment}
              />
              <button
                className="messages-composer-attach"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || attachmentBusy}
                aria-label="Attach image or video"
                title="Attach image or video"
              >
                +
              </button>
              <textarea
                className="messages-composer-input"
                placeholder={user ? 'Message…' : 'Sign in to send messages'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                disabled={!user || sending}
              />
              <button
                className="messages-composer-send"
                disabled={sending || attachmentBusy || (!draft.trim() && !pendingAttachment)}
                onClick={handleSend}
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </section>

      <NewConversationModal
        isOpen={showNewConvo}
        onClose={() => setShowNewConvo(false)}
        onCreated={(id) => {
          // Reload the inbox so the new conversation appears in the list;
          // hydration also runs via the activeConvId useEffect so the
          // thread header populates immediately regardless of inbox state.
          reloadInbox();
          setActiveConvId(id);
        }}
        currentUserId={user?.id}
        currentProfile={profile}
      />
    </div>
  );
};


export default MessagesView;
