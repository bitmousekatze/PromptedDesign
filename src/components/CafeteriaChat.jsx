import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { uploadPostImage } from '../lib/storage';
import { EmojiPicker, GifPicker, ChatComposerStyles } from './chatComposer';

// The Cafeteria - a single Discord-style live chat for the Learn tab. Reuses the
// community channel CSS classes (channel-sidebar / channel-feed / channel-message …)
// so it inherits the existing chat styling, but talks to cafeteria_channels /
// cafeteria_messages. Admins manage channels; any signed-in learner posts.

const MSG_SELECT = `
  *,
  profiles:user_id (username, display_name, avatar_emoji, avatar_url, name_color, builder_points),
  reply_message:reply_to ( id, content, profiles:user_id (username, display_name, avatar_emoji, avatar_url) )
`;

const PAGE = 50;

// Gated-channel rules → display + which rank from get_my_cafeteria_ranks() unlocks them.
const RULE_META = {
  top_students: { icon: '😎', board: 'Top Students', rankKey: 'student_rank', climb: 'Complete more projects to climb the Top Students board.' },
  top_teachers: { icon: '☕', board: 'Top Teachers', rankKey: 'teacher_rank', climb: "Grade other learners' builds to climb the Top Teachers board." },
  top_gpa:      { icon: '🤓', board: 'Best GPA',     rankKey: 'gpa_rank',     climb: 'Earn higher grades on your builds to climb the Best GPA board.' },
};

// Decorative fake chatter shown blurred behind the lock - teases the vibe without
// leaking any real (RLS-protected) messages.
const TEASE = [
  { n: 'toparchitect', c: '#4ECDC4', e: '🦾', t: 'just shipped project 9, that API one was wild 🔥' },
  { n: 'gradeguru',    c: '#C9A227', e: '☕', t: 'anyone want a fast review? drop your links' },
  { n: 'promptqueen',  c: '#ff6b9d', e: '👑', t: 'the MCP project finally made it click for me lol' },
  { n: 'shipfast',     c: '#34d399', e: '🚀', t: 'top 15 grind is real 😤 almost there' },
  { n: 'debugknight',  c: '#8b9cff', e: '🛠️', t: 'pinned the fix to that bug in here earlier' },
  { n: 'honorroll1',   c: '#fbbf24', e: '🤓', t: 'GPA 3.9 gang where you at' },
];

function LockedPanel({ channel, ranks, loggedIn }) {
  const meta = RULE_META[channel.access_rule];
  const rank = ranks && meta ? ranks[meta.rankKey] : null;
  const limit = channel.access_limit;
  return (
    <div className="channel-feed">
      <div className="channel-feed-header">
        <span className="channel-feed-header-hash">{meta?.icon || '🔒'}</span>
        <span className="channel-feed-header-name">{channel.name}</span>
        <span className="channel-feed-header-divider">|</span>
        <span className="channel-feed-header-desc">{channel.description}</span>
      </div>
      <div className="channel-messages cafe-tease">
        <div className="cafe-tease-blur" aria-hidden="true">
          {TEASE.map((m, i) => (
            <div key={i} className="channel-message">
              <div className="message-row">
                <div className="message-avatar"><span>{m.e}</span></div>
                <div className="message-body">
                  <div className="message-header">
                    <span className="message-username" style={{ color: m.c }}>{m.n}</span>
                    <span className="message-time">Today at 12:0{i}</span>
                  </div>
                  <div className="message-content">{m.t}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="cafe-tease-lock">
          <div className="cafe-tease-card">
            <div className="cafe-tease-icon">🔒</div>
            <h3>{meta?.board} - top {limit} only</h3>
            {!loggedIn ? (
              <p>Sign in, then climb the {meta?.board} leaderboard to earn your seat.</p>
            ) : rank != null ? (
              <p>You're <strong>#{rank}</strong> on {meta?.board}. Crack the top {limit} to get a seat - so close! {meta?.climb}</p>
            ) : (
              <p>You haven't made the {meta?.board} board yet. {meta?.climb}</p>
            )}
          </div>
        </div>
      </div>
      <div className="channel-input-bar disabled">
        <span className="channel-input-disabled-text">🔒 Reserved for the {meta?.board} top {limit}</span>
      </div>
    </div>
  );
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now - d) / 86400000);
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return 'Today at ' + t;
  if (days === 1) return 'Yesterday at ' + t;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + t;
}

function Message({ m, currentUserId, isAdmin, onReply, onDelete, onUserClick }) {
  const [hover, setHover] = useState(false);
  const isOwn = currentUserId === m.user_id;
  const canDelete = isOwn || isAdmin;
  return (
    <div className={`channel-message ${isOwn ? 'own' : ''}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {m.reply_message && (
        <div className="message-reply-ref">
          <span className="message-reply-ref-line" />
          <span className="message-reply-ref-user">
            {m.reply_message.profiles?.display_name || m.reply_message.profiles?.username || 'User'}
          </span>
          <span className="message-reply-ref-content">
            {m.reply_message.content?.substring(0, 80)}{m.reply_message.content?.length > 80 ? '…' : ''}
          </span>
        </div>
      )}
      <div className="message-row">
        <div className="message-avatar" onClick={() => onUserClick && onUserClick(m.user_id)} style={{ cursor: onUserClick ? 'pointer' : 'default' }}>
          {m.profiles?.avatar_url ? <img src={m.profiles.avatar_url} alt="" /> : <span>{m.profiles?.avatar_emoji || '🧑‍💻'}</span>}
        </div>
        <div className="message-body">
          <div className="message-header">
            <span className="message-username" onClick={() => onUserClick && onUserClick(m.user_id)}
              style={{ cursor: onUserClick ? 'pointer' : 'default', color: m.profiles?.name_color || '#22c55e' }}>
              {m.profiles?.display_name || m.profiles?.username || 'Unknown'}
            </span>
            <span className="message-time">{formatTime(m.created_at)}</span>
            {m.is_edited && <span className="message-edited">(edited)</span>}
          </div>
          {m.content && <div className="message-content">{m.content}</div>}
          {m.image_url && (
            <a href={m.image_url} target="_blank" rel="noopener noreferrer" className="cafe-img-wrap">
              <img src={m.image_url} alt="" className="cafe-img" loading="lazy" />
            </a>
          )}
        </div>
        {hover && (
          <div className="message-actions">
            <button className="message-action-btn" onClick={() => onReply(m)} title="Reply">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
            </button>
            {canDelete && (
              <button className="message-action-btn delete" onClick={() => onDelete(m.id)} title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Feed({ channel, user, profile, isAdmin, onUserClick, onActivity }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [uploading, setUploading] = useState(false);
  const containerRef = useRef(null);
  const atBottomRef = useRef(true);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  const scrollToBottom = useCallback((smooth = false) => {
    const c = containerRef.current;
    if (c) c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const load = useCallback(async () => {
    if (!channel?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cafeteria_messages').select(MSG_SELECT)
        .eq('channel_id', channel.id)
        .order('created_at', { ascending: false }).range(0, PAGE - 1);
      if (error) throw error;
      setMessages((data || []).reverse());
    } catch (err) { console.error('Cafeteria load failed', err); }
    finally { setLoading(false); setTimeout(() => scrollToBottom(), 50); }
  }, [channel?.id, scrollToBottom]);

  useEffect(() => { load(); setReplyTo(null); setInput(''); }, [channel?.id, load]);

  // Realtime: new / deleted messages in this channel.
  useEffect(() => {
    if (!channel?.id) return;
    const sub = supabase.channel(`cafeteria-${channel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cafeteria_messages', filter: `channel_id=eq.${channel.id}` },
        async (payload) => {
          onActivity?.();
          if (payload.new.user_id === user?.id) return; // our own - already optimistic
          const { data } = await supabase.from('cafeteria_messages').select(MSG_SELECT).eq('id', payload.new.id).single();
          if (data) setMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data]);
          if (atBottomRef.current) setTimeout(() => scrollToBottom(true), 50);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cafeteria_messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => setMessages((prev) => prev.filter((m) => m.id !== payload.old.id)))
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channel?.id, user?.id, scrollToBottom, onActivity]);

  const onScroll = () => {
    const c = containerRef.current;
    if (c) atBottomRef.current = c.scrollHeight - c.scrollTop - c.clientHeight < 100;
  };

  // One path for every kind of message (text, image, GIF). Optimistic + reconcile.
  const postMessage = async ({ content = '', imageUrl = null }) => {
    const text = (content || '').trim();
    if ((!text && !imageUrl) || !user || !channel?.id) return;
    const reply = replyTo;
    const optimistic = {
      id: 'temp-' + Math.random().toString(36).slice(2),
      channel_id: channel.id, user_id: user.id, content: text || null, image_url: imageUrl,
      is_edited: false, reply_to: reply?.id || null, created_at: new Date().toISOString(),
      profiles: { username: profile?.username, display_name: profile?.display_name || profile?.username, avatar_emoji: profile?.avatar_emoji, avatar_url: profile?.avatar_url, name_color: profile?.name_color },
      reply_message: reply ? { id: reply.id, content: reply.content, profiles: reply.profiles } : null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setReplyTo(null);
    setTimeout(() => scrollToBottom(true), 0);
    try {
      const insert = { channel_id: channel.id, user_id: user.id };
      if (text) insert.content = text;
      if (imageUrl) insert.image_url = imageUrl;
      if (reply?.id) insert.reply_to = reply.id;
      const { data, error } = await supabase.from('cafeteria_messages').insert(insert).select(MSG_SELECT).single();
      if (error) throw error;
      setMessages((prev) => prev.map((m) => m.id === optimistic.id ? data : m));
      onActivity?.();
    } catch (err) {
      console.error('Cafeteria send failed', err);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      throw err;
    }
  };

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput(''); setShowEmoji(false);
    try { await postMessage({ content }); } catch { setInput(content); }
    finally { setSending(false); inputRef.current?.focus(); }
  };

  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !user) return;
    setUploading(true);
    try {
      const { url, error } = await uploadPostImage(supabase, f, user.id);
      if (error) throw new Error(error);
      await postMessage({ imageUrl: url });
    } catch (err) { console.error('Cafeteria upload failed', err); }
    finally { setUploading(false); }
  };

  const onPickGif = async (gifUrl) => {
    setShowGif(false);
    try { await postMessage({ imageUrl: gifUrl }); } catch {}
  };

  const insertEmoji = (emo) => { setInput((prev) => prev + emo); inputRef.current?.focus(); };

  const del = async (id) => {
    const prev = messages;
    setMessages((p) => p.filter((m) => m.id !== id));
    const { error } = await supabase.from('cafeteria_messages').delete().eq('id', id);
    if (error) { console.error('Cafeteria delete failed', error); setMessages(prev); }
  };

  return (
    <div className="channel-feed">
      <div className="channel-feed-header">
        <span className="channel-feed-header-hash">#</span>
        <span className="channel-feed-header-name">{channel?.name || 'lunch-table'}</span>
        {channel?.description && (
          <>
            <span className="channel-feed-header-divider">|</span>
            <span className="channel-feed-header-desc">{channel.description}</span>
          </>
        )}
      </div>

      <div className="channel-messages" ref={containerRef} onScroll={onScroll}>
        {loading ? (
          <div className="channel-messages-loading"><div className="spinner" /><p>Loading…</p></div>
        ) : messages.length === 0 ? (
          <div className="channel-messages-empty">
            <div className="channel-messages-empty-icon">🍽️</div>
            <h3>Welcome to #{channel?.name}!</h3>
            <p>This is the start of the channel. Say hi 👋</p>
          </div>
        ) : messages.map((m) => (
          <Message key={m.id} m={m} currentUserId={user?.id} isAdmin={isAdmin} onReply={setReplyTo} onDelete={del} onUserClick={onUserClick} />
        ))}
      </div>

      {replyTo && (
        <div className="channel-reply-bar">
          <span className="channel-reply-bar-text">Replying to <strong>{replyTo.profiles?.display_name || replyTo.profiles?.username || 'User'}</strong></span>
          <button className="channel-reply-bar-close" onClick={() => setReplyTo(null)}>&times;</button>
        </div>
      )}

      {user ? (
        <div className="cafe-composer">
          {showEmoji && <EmojiPicker onPick={(e) => { insertEmoji(e); }} onClose={() => setShowEmoji(false)} />}
          {showGif && <GifPicker onPick={onPickGif} onClose={() => setShowGif(false)} />}
          <div className="channel-input-bar">
            <div className="cafe-tools">
              <button className="cafe-tool-btn" title="Emoji" onClick={() => { setShowEmoji((v) => !v); setShowGif(false); }}>😊</button>
              <button className="cafe-tool-btn" title="Upload image or GIF" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <span className="cafe-spin">⏳</span> : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                )}
              </button>
              <button className="cafe-tool-btn cafe-gif-btn" title="Search GIFs" onClick={() => { setShowGif((v) => !v); setShowEmoji(false); }}>GIF</button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={onPickFile} />
            </div>
            <textarea ref={inputRef} className="channel-input" value={input} rows={2}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Message #${channel?.name || 'lunch-table'}`} />
            <button className="channel-send-btn" onClick={send} disabled={!input.trim() || sending}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="channel-input-bar disabled"><span className="channel-input-disabled-text">Sign in to chat in the Cafeteria</span></div>
      )}
    </div>
  );
}

function CreateChannelModal({ onClose, onCreate, existing }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fmt = (raw) => raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');

  const submit = async (e) => {
    e.preventDefault();
    const n = fmt(name);
    if (!n) return setError('Channel name is required');
    if (existing.includes(n)) return setError('A channel with this name already exists');
    setBusy(true); setError('');
    try { await onCreate({ name: n, description: description.trim() || null }); onClose(); }
    catch (err) { setError(err.message || 'Failed to create channel'); setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="channel-modal">
        <div className="channel-modal-header"><h2>New Cafeteria channel</h2><button className="channel-modal-close" onClick={onClose}>&times;</button></div>
        <form onSubmit={submit}>
          <div className="channel-modal-field">
            <label>Channel Name</label>
            <div className="channel-name-input-wrapper">
              <span className="channel-name-prefix">#</span>
              <input type="text" value={name} onChange={(e) => { setName(fmt(e.target.value)); setError(''); }} placeholder="e.g. study-hall" maxLength={40} autoFocus />
            </div>
            <span className="channel-modal-hint">Lowercase, no spaces (auto-formatted)</span>
          </div>
          <div className="channel-modal-field">
            <label>Description (optional)</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this channel for?" maxLength={120} />
          </div>
          {error && <div className="channel-modal-error">{error}</div>}
          <div className="channel-modal-actions">
            <button type="button" className="channel-modal-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="channel-modal-submit" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create Channel'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CafeteriaChat({ user, profile, isAdmin, onUserClick, onActivity }) {
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [ranks, setRanks] = useState(null); // { student_rank, teacher_rank, gpa_rank } - null until loaded

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('cafeteria_channels').select('*').order('position', { ascending: true });
      if (error) throw error;
      setChannels(data || []);
      setActive((prev) => (prev && (data || []).find((c) => c.id === prev.id)) ? prev : (data || [])[0] || null);
    } catch (err) { console.error('Cafeteria channels failed', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  // The user's standing on each leaderboard (gates the exclusive tables).
  useEffect(() => {
    if (!user?.id) { setRanks({}); return; }
    let cancelled = false;
    supabase.rpc('get_my_cafeteria_ranks')
      .then(({ data }) => { if (!cancelled) setRanks(data || {}); })
      .catch(() => { if (!cancelled) setRanks({}); });
    return () => { cancelled = true; };
  }, [user?.id]);

  // Can the current user enter this channel? Open → yes; admins → always; gated → must
  // rank within the limit on the matching board (RLS enforces this too).
  const canAccess = (ch) => {
    if (!ch?.access_rule) return true;
    if (isAdmin) return true;
    const meta = RULE_META[ch.access_rule];
    const rank = meta && ranks ? ranks[meta.rankKey] : null;
    return rank != null && rank <= ch.access_limit;
  };

  const createChannel = async ({ name, description }) => {
    const maxPos = channels.reduce((mx, c) => Math.max(mx, c.position), -1);
    const { data, error } = await supabase.from('cafeteria_channels')
      .insert({ name, description, position: maxPos + 1, created_by: user?.id }).select().single();
    if (error) throw error;
    setChannels((prev) => [...prev, data]); setActive(data);
  };

  const deleteChannel = async (id) => {
    const { error } = await supabase.from('cafeteria_channels').delete().eq('id', id);
    if (error) { console.error('Delete channel failed', error); return; }
    setChannels((prev) => prev.filter((c) => c.id !== id));
    setActive((prev) => prev?.id === id ? channels.find((c) => c.id !== id) || null : prev);
    setConfirmDelete(null);
  };

  return (
    <div className="community-channels-container">
      <ChatComposerStyles />
      <div className="channel-sidebar">
        <div className="channel-sidebar-header">
          <h3 className="channel-sidebar-title">🍽️ Cafeteria</h3>
        </div>
        <div className="channel-list">
          <div className="channel-group">
            <div className="channel-group-header">CHANNELS</div>
            {channels.map((ch) => {
              const meta = ch.access_rule ? RULE_META[ch.access_rule] : null;
              const locked = meta && !canAccess(ch);
              return (
              <div key={ch.id} className="channel-item-wrapper">
                <button className={`channel-item ${active?.id === ch.id ? 'active' : ''}`} onClick={() => setActive(ch)}
                  title={meta ? `${meta.board} top ${ch.access_limit} only` : undefined}>
                  <span className="channel-hash">{meta ? meta.icon : '#'}</span>
                  <span className="channel-name">{ch.name}</span>
                  {locked && <span className="channel-private-badge">🔒</span>}
                </button>
                {isAdmin && (
                  <div className="channel-reorder-btns">
                    <button className="channel-edit-btn" title="Delete channel"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(ch); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                )}
              </div>
              ); })}
          </div>
        </div>
        {isAdmin && <button className="channel-create-btn" onClick={() => setShowCreate(true)}>+ New Channel</button>}
      </div>

      {loading ? (
        <div className="channel-feed"><div className="channel-messages-loading"><div className="spinner" /><p>Loading the Cafeteria…</p></div></div>
      ) : active && active.access_rule && !canAccess(active) ? (
        <LockedPanel channel={active} ranks={ranks} loggedIn={!!user} />
      ) : active ? (
        <Feed channel={active} user={user} profile={profile} isAdmin={isAdmin} onUserClick={onUserClick} onActivity={onActivity} />
      ) : (
        <div className="channel-feed"><div className="channel-messages-empty">
          <div className="channel-messages-empty-icon">🍽️</div>
          <h3>No channels yet</h3>
          <p>{isAdmin ? 'Create the first channel to open the Cafeteria.' : 'Check back soon.'}</p>
        </div></div>
      )}

      {showCreate && <CreateChannelModal onClose={() => setShowCreate(false)} onCreate={createChannel} existing={channels.map((c) => c.name)} />}

      {confirmDelete && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="channel-modal" style={{ maxWidth: 380 }}>
            <div className="channel-modal-header"><h3>Delete #{confirmDelete.name}?</h3><button className="channel-modal-close" onClick={() => setConfirmDelete(null)}>&times;</button></div>
            <div className="channel-modal-body" style={{ color: '#ccc' }}>This removes the channel and all its messages. This can't be undone.</div>
            <div className="channel-modal-actions">
              <button className="channel-modal-cancel" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="channel-modal-submit" style={{ background: '#ef4444' }} onClick={() => deleteChannel(confirmDelete.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
