import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadPostImage } from '../lib/storage';
import { sanitizeHtml, looksLikeHtml } from '../lib/sanitize';
import CommentEditor from './CommentEditor.jsx';

// LoungeChat - a dedicated Discord-style live chat for the Lounge tab. Same
// realtime engine as the Cafeteria/community chats (postgres_changes on a
// per-channel supabase channel), but its own lounge_channels / lounge_messages
// tables. Two layouts driven by `expanded`:
//   • compact  - a single-channel panel (sticky bar on the Lounge page)
//   • expanded - a full-screen overlay with a channel sidebar (the "bigger
//                Discord community" view); admins can create/delete channels.
// The composer reuses CommentEditor, so chat gets B/I/U/color + emoji + images
// for free. Messages store sanitized HTML content and/or a post-images URL.

const MSG_SELECT = `
  *,
  profiles:user_id (username, display_name, avatar_emoji, avatar_url, name_color),
  reply_message:reply_to ( id, content, profiles:user_id (username, display_name) )
`;
const PAGE = 50;

// One-time style injection (mirrors the CommentEditor pattern).
if (typeof document !== 'undefined' && !document.getElementById('lounge-chat-styles')) {
  const tag = document.createElement('style');
  tag.id = 'lounge-chat-styles';
  tag.textContent = `
    .lc-wrap { display:flex; flex-direction:column; background:#0e1014; border:1px solid #20242c; border-radius:14px; overflow:hidden; min-height:0; }
    .lc-head { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid #1c2027; background:#12151b; flex-shrink:0; }
    .lc-head-title { font-weight:800; color:#fff; font-size:14px; display:flex; align-items:center; gap:6px; }
    .lc-head-hash { color:#5b6470; }
    .lc-channel-select { background:#0e1014; color:#cbd5e1; border:1px solid #262b34; border-radius:8px; padding:4px 8px; font-size:13px; font-weight:600; cursor:pointer; max-width:160px; }
    .lc-head-spacer { flex:1; }
    .lc-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:8px; border:1px solid #262b34; background:transparent; color:#cbd5e1; cursor:pointer; }
    .lc-icon-btn:hover { background:rgba(255,255,255,0.06); }
    .lc-messages { flex:1; overflow-y:auto; padding:10px 12px; display:flex; flex-direction:column; gap:10px; min-height:0; }
    .lc-msg { display:flex; gap:9px; }
    .lc-msg-avatar { width:32px; height:32px; border-radius:50%; flex-shrink:0; background:#2a2f3a; display:flex; align-items:center; justify-content:center; overflow:hidden; font-size:16px; cursor:pointer; }
    .lc-msg-avatar img { width:100%; height:100%; object-fit:cover; }
    .lc-msg-body { min-width:0; flex:1; }
    .lc-msg-head { display:flex; align-items:baseline; gap:8px; }
    .lc-msg-name { font-weight:700; font-size:13.5px; cursor:pointer; }
    .lc-msg-time { font-size:11px; color:#6b7480; }
    .lc-msg-content { color:#e7ebf0; font-size:14px; line-height:1.45; word-break:break-word; }
    .lc-msg-content img { max-width:100%; }
    .lc-msg-img { margin-top:5px; max-width:260px; max-height:240px; border-radius:10px; border:1px solid #20242c; display:block; cursor:zoom-in; }
    .lc-reply-ref { font-size:12px; color:#8a93a3; margin-bottom:2px; padding-left:6px; border-left:2px solid #313845; }
    .lc-composer { border-top:1px solid #1c2027; padding:8px; background:#12151b; flex-shrink:0; }
    .lc-send-row { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:6px; }
    .lc-send-btn { background:var(--accent-primary,#4ECDC4); color:#04201d; border:none; border-radius:999px; padding:7px 18px; font-weight:800; font-size:14px; cursor:pointer; }
    .lc-send-btn:disabled { opacity:.5; cursor:default; }
    .lc-reply-banner { display:flex; align-items:center; justify-content:space-between; font-size:12px; color:#9aa4b2; padding:4px 6px; }
    .lc-chat-input { background:#0e1014; border:1px solid #262b34; border-radius:10px; color:#fff; font-size:14px; min-height:42px; max-height:160px; overflow-y:auto; }
    .lc-empty { color:#6b7480; text-align:center; padding:24px 12px; font-size:13px; }
    /* expanded overlay */
    .lc-overlay { position:fixed; inset:0; z-index:1000; background:rgba(5,6,8,.86); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:24px; }
    .lc-overlay-panel { width:min(1000px,96vw); height:min(760px,92vh); display:flex; background:#0e1014; border:1px solid #20242c; border-radius:16px; overflow:hidden; }
    .lc-sidebar { width:210px; flex-shrink:0; background:#0a0c10; border-right:1px solid #1c2027; display:flex; flex-direction:column; }
    .lc-sidebar-head { padding:14px 14px 8px; font-weight:800; color:#fff; font-size:15px; display:flex; align-items:center; justify-content:space-between; }
    .lc-channel-list { flex:1; overflow-y:auto; padding:4px 8px; }
    .lc-channel-item { display:flex; align-items:center; gap:6px; width:100%; text-align:left; padding:7px 10px; border-radius:8px; border:none; background:transparent; color:#aab2c0; font-size:14px; font-weight:600; cursor:pointer; }
    .lc-channel-item:hover { background:rgba(255,255,255,0.05); color:#fff; }
    .lc-channel-item.active { background:rgba(78,205,196,0.14); color:#4ECDC4; }
    .lc-channel-hash { opacity:.6; }
    .lc-newchan-btn { margin:8px; padding:8px; border-radius:8px; border:1px dashed #313845; background:transparent; color:#9aa4b2; font-size:13px; font-weight:700; cursor:pointer; }
    .lc-overlay-main { flex:1; display:flex; flex-direction:column; min-width:0; }
    @media (max-width:640px){ .lc-sidebar{ width:150px; } .lc-overlay{ padding:0; } .lc-overlay-panel{ width:100vw; height:100vh; border-radius:0; } }
  `;
  document.head.appendChild(tag);
}

const fmtTime = (iso) => {
  try {
    const d = new Date(iso);
    const today = new Date();
    const same = d.toDateString() === today.toDateString();
    return same ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
};
const stripTags = (html) => (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();

function MessageView({ m, currentUserId, isAdmin, onReply, onDelete, onUserClick }) {
  const [hover, setHover] = useState(false);
  const canDelete = currentUserId === m.user_id || isAdmin;
  const p = m.profiles || {};
  return (
    <div className="lc-msg" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="lc-msg-avatar" onClick={() => onUserClick?.(m.user_id)}>
        {p.avatar_url ? <img src={p.avatar_url} alt="" /> : <span>{p.avatar_emoji || '🧑‍💻'}</span>}
      </div>
      <div className="lc-msg-body">
        {m.reply_message && (
          <div className="lc-reply-ref">
            ↳ {m.reply_message.profiles?.display_name || m.reply_message.profiles?.username || 'user'}: {stripTags(m.reply_message.content).slice(0, 70)}
          </div>
        )}
        <div className="lc-msg-head">
          <span className="lc-msg-name" style={{ color: p.name_color || '#4ECDC4' }} onClick={() => onUserClick?.(m.user_id)}>
            {p.display_name || p.username || 'Unknown'}
          </span>
          <span className="lc-msg-time">{fmtTime(m.created_at)}{m.is_edited ? ' (edited)' : ''}</span>
          {hover && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className="lc-icon-btn" style={{ width: 24, height: 24 }} title="Reply" onClick={() => onReply(m)}>↩</button>
              {canDelete && <button className="lc-icon-btn" style={{ width: 24, height: 24 }} title="Delete" onClick={() => onDelete(m.id)}>🗑</button>}
            </span>
          )}
        </div>
        {m.content && (
          looksLikeHtml(m.content)
            ? <div className="lc-msg-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.content) }} />
            : <div className="lc-msg-content">{m.content}</div>
        )}
        {m.image_url && (
          <a href={m.image_url} target="_blank" rel="noopener noreferrer">
            <img src={m.image_url} alt="" className="lc-msg-img" loading="lazy" />
          </a>
        )}
      </div>
    </div>
  );
}

// The message feed + composer for one channel.
function ChannelFeed({ channel, currentUser, profile, isAdmin, onUserClick }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [draftImage, setDraftImage] = useState(null); // { file, preview }
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const containerRef = useRef(null);
  const atBottomRef = useRef(true);

  const scrollToBottom = useCallback((smooth = false) => {
    const c = containerRef.current;
    if (c) c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const load = useCallback(async () => {
    if (!channel?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lounge_messages').select(MSG_SELECT)
        .eq('channel_id', channel.id)
        .order('created_at', { ascending: false }).range(0, PAGE - 1);
      if (error) throw error;
      setMessages((data || []).reverse());
    } catch (err) { console.error('Lounge chat load failed', err); }
    finally { setLoading(false); setTimeout(() => scrollToBottom(), 50); }
  }, [channel?.id, scrollToBottom]);

  useEffect(() => { load(); setReplyTo(null); }, [channel?.id, load]);

  useEffect(() => {
    if (!channel?.id) return undefined;
    const sub = supabase.channel(`lounge-${channel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lounge_messages', filter: `channel_id=eq.${channel.id}` },
        async (payload) => {
          if (payload.new.user_id === currentUser?.id) return; // our own - already optimistic
          const { data } = await supabase.from('lounge_messages').select(MSG_SELECT).eq('id', payload.new.id).single();
          if (data) setMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data]);
          if (atBottomRef.current) setTimeout(() => scrollToBottom(true), 50);
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lounge_messages', filter: `channel_id=eq.${channel.id}` },
        (payload) => setMessages((prev) => prev.filter((m) => m.id !== payload.old.id)))
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channel?.id, currentUser?.id, scrollToBottom]);

  const onScroll = () => {
    const c = containerRef.current;
    if (c) atBottomRef.current = c.scrollHeight - c.scrollTop - c.clientHeight < 100;
  };

  const send = async () => {
    if (sending || !currentUser?.id || !channel?.id) return;
    const plain = stripTags(draft);
    if (!plain && !draftImage) return;
    setSending(true);
    const snapshotDraft = draft, snapshotImg = draftImage, reply = replyTo;
    setDraft(''); setDraftImage(null); setReplyTo(null);

    const optimistic = {
      id: 'temp-' + Math.random().toString(36).slice(2),
      channel_id: channel.id, user_id: currentUser.id,
      content: plain ? sanitizeHtml(snapshotDraft) : null,
      image_url: snapshotImg?.preview || null,
      is_edited: false, reply_to: reply?.id || null, created_at: new Date().toISOString(),
      profiles: { username: profile?.username, display_name: profile?.display_name || profile?.username, avatar_emoji: profile?.avatar_emoji, avatar_url: profile?.avatar_url, name_color: profile?.name_color },
      reply_message: reply ? { id: reply.id, content: reply.content, profiles: reply.profiles } : null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => scrollToBottom(true), 0);

    try {
      let imageUrl = null;
      if (snapshotImg?.file) {
        const { url, error } = await uploadPostImage(supabase, snapshotImg.file, currentUser.id);
        if (!error) imageUrl = url || null;
      }
      const insert = { channel_id: channel.id, user_id: currentUser.id };
      if (plain) insert.content = sanitizeHtml(snapshotDraft);
      if (imageUrl) insert.image_url = imageUrl;
      if (reply?.id) insert.reply_to = reply.id;
      const { data, error } = await supabase.from('lounge_messages').insert(insert).select(MSG_SELECT).single();
      if (error) throw error;
      setMessages((prev) => prev.map((m) => m.id === optimistic.id ? data : m));
    } catch (err) {
      console.error('Lounge chat send failed', err);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(snapshotDraft); setDraftImage(snapshotImg); setReplyTo(reply);
    } finally {
      setSending(false);
    }
  };

  const del = async (id) => {
    const prev = messages;
    setMessages((p) => p.filter((m) => m.id !== id));
    const { error } = await supabase.from('lounge_messages').delete().eq('id', id);
    if (error) { console.error('Lounge chat delete failed', error); setMessages(prev); }
  };

  const canSend = !sending && (!!stripTags(draft) || !!draftImage);

  return (
    <>
      <div className="lc-messages" ref={containerRef} onScroll={onScroll}>
        {loading ? (
          <div className="lc-empty">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="lc-empty">No messages yet - say hi 👋</div>
        ) : messages.map((m) => (
          <MessageView key={m.id} m={m} currentUserId={currentUser?.id} isAdmin={isAdmin} onReply={setReplyTo} onDelete={del} onUserClick={onUserClick} />
        ))}
      </div>

      <div className="lc-composer">
        {replyTo && (
          <div className="lc-reply-banner">
            <span>Replying to {replyTo.profiles?.display_name || replyTo.profiles?.username || 'user'}</span>
            <button className="lc-icon-btn" style={{ width: 22, height: 22 }} onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        {currentUser ? (
          <>
            <CommentEditor
              value={draft}
              onChange={setDraft}
              onSubmit={send}
              submitOnEnter
              placeholder={`Message #${channel?.name || 'general'}`}
              className="lc-chat-input"
              allowImage
              image={draftImage}
              onPickImage={(file) => setDraftImage({ file, preview: URL.createObjectURL(file) })}
              onClearImage={() => setDraftImage(null)}
            />
            <div className="lc-send-row">
              <span style={{ fontSize: 11, color: '#5b6470' }}>Enter to send · Shift+Enter for a new line</span>
              <button className="lc-send-btn" onClick={send} disabled={!canSend}>{sending ? 'Sending…' : 'Send'}</button>
            </div>
          </>
        ) : (
          <div className="lc-empty">Sign in to join the chat.</div>
        )}
      </div>
    </>
  );
}

export default function LoungeChat({ currentUser, profile, isAdmin = false, onUserClick, expanded = false, onToggleExpand, onRequireAuth }) {
  const [channels, setChannels] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const loadChannels = useCallback(async () => {
    const { data, error } = await supabase
      .from('lounge_channels').select('*').order('position', { ascending: true }).order('created_at', { ascending: true });
    if (error) { console.error('Lounge channels load failed', error); return; }
    setChannels(data || []);
    setActiveId((cur) => cur || (data && data[0]?.id) || null);
  }, []);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const activeChannel = channels.find((c) => c.id === activeId) || channels[0] || null;

  const createChannel = async () => {
    const name = (prompt('New channel name (letters, numbers, dashes):') || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!name) return;
    const { data, error } = await supabase.from('lounge_channels')
      .insert({ name, position: channels.length, created_by: currentUser?.id }).select().single();
    if (error) { alert(error.message); return; }
    setChannels((prev) => [...prev, data]);
    setActiveId(data.id);
  };

  const deleteChannel = async (id) => {
    if (!confirm('Delete this channel and all its messages?')) return;
    const { error } = await supabase.from('lounge_channels').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    setChannels((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(channels.find((c) => c.id !== id)?.id || null);
  };

  const feedKey = activeChannel?.id || 'none';
  const feed = activeChannel ? (
    <ChannelFeed
      key={feedKey}
      channel={activeChannel}
      currentUser={currentUser}
      profile={profile}
      isAdmin={isAdmin}
      onUserClick={onUserClick}
    />
  ) : <div className="lc-empty">No channels yet.</div>;

  // ── Expanded overlay (the "bigger Discord community" view) ──
  if (expanded) {
    return (
      <div className="lc-overlay" onClick={(e) => { if (e.target === e.currentTarget) onToggleExpand?.(false); }}>
        <div className="lc-overlay-panel">
          <div className="lc-sidebar">
            <div className="lc-sidebar-head">
              <span>💬 Lounge</span>
              <button className="lc-icon-btn" style={{ width: 26, height: 26 }} title="Close" onClick={() => onToggleExpand?.(false)}>✕</button>
            </div>
            <div className="lc-channel-list">
              {channels.map((c) => (
                <button key={c.id} className={`lc-channel-item ${c.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(c.id)} title={c.description || ''}>
                  <span className="lc-channel-hash">#</span>{c.name}
                  {isAdmin && <span style={{ marginLeft: 'auto', opacity: 0.6 }} onClick={(e) => { e.stopPropagation(); deleteChannel(c.id); }}>🗑</span>}
                </button>
              ))}
            </div>
            {isAdmin && <button className="lc-newchan-btn" onClick={createChannel}>+ New channel</button>}
          </div>
          <div className="lc-overlay-main">
            <div className="lc-head">
              <span className="lc-head-title">#{activeChannel?.name || 'general'}</span>
              {activeChannel?.description && <span style={{ fontSize: 12, color: '#6b7480' }}>{activeChannel.description}</span>}
            </div>
            {feed}
          </div>
        </div>
      </div>
    );
  }

  // ── Compact panel (sticky bar on the Lounge page) ──
  return (
    <div className="lc-wrap" style={{ height: '100%' }}>
      <div className="lc-head">
        <span className="lc-head-title">💬 Live chat</span>
        <select className="lc-channel-select" value={activeId || ''} onChange={(e) => setActiveId(e.target.value)}>
          {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
        </select>
        <span className="lc-head-spacer" />
        <button className="lc-icon-btn" title="Expand" onClick={() => onToggleExpand?.(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
        </button>
      </div>
      {feed}
    </div>
  );
}
