// Zoetrope ("Zoe") — Prompted's livestreaming tab. Phase 1 = external video
// (Twitch / YouTube embed). Everyone can browse + watch what's live; hosting a
// stream is a Pro perk. Going live raises a site-wide banner (App.jsx subscribes
// to live_streams) and blasts a launch push (DB trigger). Voice rooms are Phase 2.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../lib/supabase.js';
import { moderateContent } from '../lib/moderation.js';
import {
  fetchLiveStreams, fetchMyChannel, startLiveStream, endLiveStream,
  joinStream, leaveStream, bumpChannelClick,
  parseStreamLink, buildEmbedSrc, channelWatchUrl,
  toggleStreamLike, fetchMyStreamLike,
  fetchStreamMessages, postStreamMessage, deleteStreamMessage, fetchProfileBrief,
  boostCheckout, verifyBoost, adminTestBoost,
} from '../lib/zoe.js';

// Neutral, ChatGPT-style accent — no gold. White primary surfaces with
// near-black text/marks sitting on them; white also reads as the "accent" text
// color on the dark theme.
const ACCENT = '#ffffff';      // white accent (buttons, LIVE badge, links)
const ON_ACCENT = '#0d0d0d';   // near-black text/marks that sit on the white

// Open-hosting week: until this date ANY logged-in user can host (normally Pro
// only). The server enforces the same cutoff in start_live_stream — keep in sync.
const OPEN_HOST_UNTIL = new Date('2026-06-29T00:00:00Z');
const isOpenHostWeek = () => new Date() < OPEN_HOST_UNTIL;

function isProMember(profile) {
  return !!profile?.is_pro && (!profile?.pro_expires_at || new Date(profile.pro_expires_at) > new Date());
}

// A stable per-session presence id so logged-out viewers are counted once and
// de-duped across reconnects within the same tab.
function viewerPresenceKey(currentUser) {
  if (currentUser?.id) return currentUser.id;
  try {
    let id = sessionStorage.getItem('zoe_anon_viewer');
    if (!id) { id = 'guest-' + crypto.randomUUID(); sessionStorage.setItem('zoe_anon_viewer', id); }
    return id;
  } catch {
    return 'guest-' + Math.random().toString(36).slice(2);
  }
}

// Live concurrent-viewer count via Supabase Realtime Presence. Counts everyone
// watching right now — guests included — and drops them automatically when they
// close the tab (no zombie rows, unlike live_participants, which we keep only for
// the historical viewer_peak). One presence key per viewer, so a user with two
// tabs counts once.
function useViewerCount(streamId, currentUser) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!streamId) { setCount(0); return; }
    const key = viewerPresenceKey(currentUser);
    const ch = supabase.channel(`zoe-presence-${streamId}`, { config: { presence: { key } } });
    ch.on('presence', { event: 'sync' }, () => {
      setCount(Object.keys(ch.presenceState()).length);
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') ch.track({ at: new Date().toISOString() });
    });
    return () => { supabase.removeChannel(ch); };
  }, [streamId, currentUser?.id]);
  return count;
}

// Copy the page's styling into a popped-out window so the chat looks identical
// there: clone every stylesheet (covers class-based bits like .form-input) and
// carry the theme — the inline styles below lean on CSS variables that live on
// :root, which a blank window wouldn't have.
function paintPopup(win) {
  try {
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      win.document.head.appendChild(node.cloneNode(true));
    });
    win.document.documentElement.className = document.documentElement.className;
    const cs = getComputedStyle(document.documentElement);
    ['--text-primary', '--text-secondary', '--text-muted', '--border-color', '--bg-primary', '--bg-card']
      .forEach((v) => win.document.documentElement.style.setProperty(v, cs.getPropertyValue(v)));
    win.document.body.style.margin = '0';
    win.document.body.style.background = (cs.getPropertyValue('--bg-primary') || '#0d1016').trim();
    win.document.title = 'Zeo — Live chat';
  } catch { /* cross-doc styling is best-effort */ }
}

export default function ZoePage({ currentUser, profile, initialStreamId, onConsumeInitial, onRequireAuth, addToast, onUserClick }) {
  const canHost = !!currentUser && (isOpenHostWeek() || isProMember(profile) || !!profile?.is_admin);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showGoLive, setShowGoLive] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [myChannel, setMyChannel] = useState(null);

  const load = async () => {
    try {
      const list = await fetchLiveStreams();
      setStreams(list);
      // Keep the open viewer in sync (e.g. host ended it elsewhere).
      setSelected((cur) => (cur ? list.find((s) => s.id === cur.id) || null : null));
    } catch (e) {
      console.warn('[zoe] load failed', e?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Deep-link from the feed banner: auto-open the requested stream once it loads.
  useEffect(() => {
    if (!initialStreamId || streams.length === 0) return;
    const match = streams.find((s) => s.id === initialStreamId);
    if (match) setSelected(match);
    onConsumeInitial?.();
  }, [initialStreamId, streams]);

  useEffect(() => {
    if (currentUser?.id) fetchMyChannel(currentUser.id).then(setMyChannel).catch(() => {});
  }, [currentUser?.id]);

  // Returning from Stripe Checkout (/?boost=success&session_id=cs_...): confirm
  // the payment server-side and fan out the boost, then clean the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('boost') !== 'success') return;
    const sessionId = q.get('session_id');
    const clean = () => {
      q.delete('boost'); q.delete('session_id'); q.delete('stream');
      const qs = q.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    };
    if (!sessionId) { clean(); return; }
    verifyBoost(sessionId)
      .then((r) => addToast?.(
        `Boost sent — notified ${r.notified ?? 0} people on the leaderboard. ⚡` +
        (r.proGranted ? ` You've got Pro for ${r.proDays || 7} days. 👑` : ''),
        'success'))
      .catch((e) => addToast?.(e.message || 'Could not confirm the boost.', 'error'))
      .finally(clean);
  }, []);

  // Refetch the grid whenever any stream starts/ends.
  useEffect(() => {
    const ch = supabase
      .channel('zoe-streams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const myLiveStream = currentUser ? streams.find((s) => s.host_id === currentUser.id) : null;

  return (
    <div style={wrap}>
      <header style={headerRow}>
        <div>
          <h1 style={h1}>Zeo <span style={{ color: ACCENT }}>Live</span></h1>
          <p style={sub}>
            {isOpenHostWeek()
              ? '🎉 Open week — anyone can host a stream right now. Watching is always for everyone.'
              : 'Live builds and conversations from the community. Hosting is a Pro perk — watching is for everyone.'}
          </p>
        </div>
        <div style={headerActions}>
          <button style={infoBtn} onClick={() => setShowInfo(true)} title="How going live works" aria-label="How going live works">
            <span aria-hidden="true">ⓘ</span> How it works
          </button>
          {canHost ? (
            myLiveStream ? (
              <button style={endBtn} onClick={async () => {
                try { await endLiveStream(myLiveStream.id); addToast?.('Stream ended.', 'success'); load(); }
                catch (e) { addToast?.(e.message, 'error'); }
              }}>End my stream</button>
            ) : (
              <button style={goLiveBtn} onClick={() => setShowGoLive(true)}>
                <span style={{ fontSize: 16 }}>●</span> Go Live
              </button>
            )
          ) : currentUser ? (
            <span style={proHint}>Go Pro to host your own streams →</span>
          ) : null}
        </div>
      </header>

      {showInfo && <InfoModal canHost={canHost} onClose={() => setShowInfo(false)} />}

      {showGoLive && (
        <GoLivePanel
          myChannel={myChannel}
          onClose={() => setShowGoLive(false)}
          addToast={addToast}
          onLive={(stream) => { setShowGoLive(false); setSelected(stream); load(); }}
        />
      )}

      {selected && (
        <StreamViewer
          stream={selected}
          currentUser={currentUser}
          profile={profile}
          onClose={() => setSelected(null)}
          onEnd={async () => {
            try { await endLiveStream(selected.id); addToast?.('Stream ended.', 'success'); setSelected(null); load(); }
            catch (e) { addToast?.(e.message, 'error'); }
          }}
          onUserClick={onUserClick}
          addToast={addToast}
          onRequireAuth={onRequireAuth}
        />
      )}

      {loading ? (
        <p style={muted}>Checking who's live…</p>
      ) : streams.length === 0 ? (
        <div style={emptyCard}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>📺</div>
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Nobody's live right now</div>
          <div style={muted}>{canHost ? 'Be the first — tap Go Live.' : 'Check back soon, or go Pro to host your own.'}</div>
        </div>
      ) : (
        <div style={grid}>
          {streams.map((s) => (
            <LiveCard key={s.id} stream={s} active={selected?.id === s.id} onOpen={() => setSelected(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveCard({ stream, onOpen, active }) {
  const host = stream.host || {};
  return (
    <button style={{ ...card, ...(active ? { borderColor: ACCENT } : {}) }} onClick={onOpen}>
      <div style={cardThumb}>
        <span style={liveTag}><span style={dot} /> LIVE</span>
        <span style={typeTag}>{stream.platform === 'twitch' ? 'Twitch' : stream.platform === 'youtube' ? 'YouTube' : 'Live'}</span>
        <span style={{ fontSize: 34, opacity: 0.6 }}>{stream.type === 'voice_room' ? '🎙️' : '📺'}</span>
      </div>
      <div style={{ padding: '12px 14px', textAlign: 'left' }}>
        <div style={cardTitle}>{stream.title}</div>
        <div style={cardHost}>
          {host.avatar_emoji ? <span>{host.avatar_emoji}</span> : null}
          <span>@{host.username || 'someone'}</span>
        </div>
      </div>
    </button>
  );
}

function StreamViewer({ stream, currentUser, profile, onClose, onEnd, onUserClick, addToast, onRequireAuth }) {
  const isHost = currentUser && stream.host_id === currentUser.id;
  const isAdmin = !!profile?.is_admin;
  // Temporary: limit buying a Boost to mouse only while we finalize the flow.
  const canBuyBoost = profile?.username === 'mouse';
  const src = buildEmbedSrc(stream, typeof window !== 'undefined' ? window.location.hostname : undefined);
  const joinedRef = useRef(false);
  const viewerCount = useViewerCount(stream.id, currentUser);
  const [chatPopped, setChatPopped] = useState(false);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(stream.like_count || 0);
  const [liking, setLiking] = useState(false);
  const [boosting, setBoosting] = useState(false);

  // Keep the count in sync when the parent refetches the stream (others' likes).
  useEffect(() => { setLikeCount(stream.like_count || 0); }, [stream.like_count]);

  // Track presence (logged-in viewers) for the live count + viewer_peak.
  useEffect(() => {
    if (!currentUser || isHost) return;
    joinedRef.current = true;
    joinStream(stream.id).catch(() => {});
    return () => { if (joinedRef.current) leaveStream(stream.id).catch(() => {}); };
  }, [stream.id, currentUser?.id]);

  // Whether the current user has already liked this stream.
  useEffect(() => {
    if (!currentUser?.id) { setLiked(false); return; }
    fetchMyStreamLike(stream.id, currentUser.id).then(setLiked).catch(() => {});
  }, [stream.id, currentUser?.id]);

  const onLike = async () => {
    if (!currentUser) { onRequireAuth?.(); return; }
    if (liking) return;
    setLiking(true);
    // Optimistic.
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      const serverLiked = await toggleStreamLike(stream.id);
      setLiked(serverLiked);
    } catch (e) {
      // Roll back.
      setLiked(!next);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
      addToast?.(e.message || 'Could not register your like.', 'error');
    } finally {
      setLiking(false);
    }
  };

  // Pay $2.99 to notify the top 67 on the BP leaderboard (bell fully on).
  const onBoost = async () => {
    if (!currentUser) { onRequireAuth?.(); return; }
    if (boosting) return;
    setBoosting(true);
    try {
      const { url } = await boostCheckout({
        userId: currentUser.id,
        username: profile?.username, // the buyer (may be a viewer, not the host)
        streamId: stream.id,
      });
      if (url) window.location.href = url; // hosted Stripe Checkout
      else throw new Error('No checkout URL returned.');
    } catch (e) {
      addToast?.(e.message || 'Could not start the boost checkout.', 'error');
      setBoosting(false);
    }
  };

  // Admin-only FREE test (no charge, no spam): pings only you, and reports how
  // many a real boost would reach.
  const onTestBoost = async () => {
    if (boosting) return;
    setBoosting(true);
    try {
      const n = await adminTestBoost(stream.id);
      addToast?.(`Test ping sent to you ⚡ A real boost would reach ${n} ${n === 1 ? 'person' : 'people'}.`, 'success');
    } catch (e) {
      addToast?.(e.message || 'Test boost failed.', 'error');
    } finally {
      setBoosting(false);
    }
  };

  return (
    <div style={viewer}>
      <div style={viewerHead}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={liveTag}><span style={dot} /> LIVE</span>
            <span style={viewerPill} title="People watching right now">
              <span aria-hidden="true">👁</span> {viewerCount.toLocaleString()}
            </span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stream.title}</span>
          </div>
          <button style={viewerHost} onClick={() => stream.host_id && onUserClick?.(stream.host_id)}>
            {stream.host?.avatar_emoji ? <span>{stream.host.avatar_emoji} </span> : null}
            @{stream.host?.username || 'someone'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {isHost && <button style={endBtnSm} onClick={onEnd}>End stream</button>}
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>
      </div>

      {src ? (
        <iframe
          src={src}
          title={stream.title}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 12, background: '#000' }}
        />
      ) : (
        <div style={{ ...emptyCard, aspectRatio: '16 / 9' }}>
          <div style={muted}>This stream can't be embedded here.</div>
        </div>
      )}

      <div style={actionsRow}>
        <button style={{ ...likeBtn, ...(liked ? likeBtnOn : {}) }} onClick={onLike} aria-pressed={liked}>
          <span style={{ fontSize: 15 }}>{liked ? '♥' : '♡'}</span>
          {likeCount > 0 ? likeCount : 'Like'}
        </button>
        {canBuyBoost && (
          <button style={{ ...boostBtn, ...(boosting ? { opacity: 0.6 } : {}) }} onClick={onBoost} disabled={boosting}>
            ⚡ Boost — notify top 67 · $2.99
          </button>
        )}
        {isAdmin && (
          <button style={{ ...testBoostBtn, ...(boosting ? { opacity: 0.6 } : {}) }} onClick={onTestBoost} disabled={boosting}>
            Test boost (no charge)
          </button>
        )}
        {channelWatchUrl(stream) && (
          <a
            href={channelWatchUrl(stream)} target="_blank" rel="noopener noreferrer"
            style={watchOut}
            onClick={() => bumpChannelClick(stream.host_id)}
          >
            Watch on {stream.platform === 'twitch' ? 'Twitch' : 'YouTube'} ↗
          </a>
        )}
      </div>
      {canBuyBoost && (
        <div style={boostHint}>
          ⚡ Boost pings the top 67 Builder-Points members who have live alerts on —
          a one-time $2.99 that also unlocks <strong>Pro for a week</strong> for you.
        </div>
      )}

      {chatPopped && (
        <div style={chatDockHint}>
          <span>💬 Live chat is open in a separate window — drag it to another monitor.</span>
          <button
            style={chatDockBtn}
            onClick={() => { try { const w = window.open('', 'zeo-live-chat'); w && w.close(); } catch { /* its pagehide docks it */ } }}
          >
            Bring it back
          </button>
        </div>
      )}

      <StreamChat
        stream={stream}
        currentUser={currentUser}
        isHost={isHost}
        onUserClick={onUserClick}
        addToast={addToast}
        onRequireAuth={onRequireAuth}
        onPopOut={() => setChatPopped(true)}
        onDock={() => setChatPopped(false)}
      />
    </div>
  );
}

// Presentational + realtime chat. Rendered inline by StreamChat, and again inside
// the pop-out window (variant="window") with its own React root. The header button
// is "Pop out" inline and "Dock" in the window.
function ChatPanel({ stream, currentUser, isHost, onUserClick, addToast, onRequireAuth, variant = 'inline', channelSuffix = '', onPopOut, onDock }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const windowed = variant === 'window';

  useEffect(() => {
    let alive = true;
    fetchStreamMessages(stream.id).then((m) => { if (alive) setMessages(m); }).catch(() => {});
    const ch = supabase
      .channel(`zoe-chat-${stream.id}${channelSuffix}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_stream_messages', filter: `stream_id=eq.${stream.id}` },
        async (payload) => {
          const author = await fetchProfileBrief(payload.new.user_id);
          setMessages((prev) => prev.some((m) => m.id === payload.new.id) ? prev : [...prev, { ...payload.new, author }]);
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'live_stream_messages', filter: `stream_id=eq.${stream.id}` },
        (payload) => setMessages((prev) => prev.filter((m) => m.id !== payload.old.id)))
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [stream.id]);

  // Keep the newest message in view.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    if (!currentUser) { onRequireAuth?.(); return; }
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await postStreamMessage(stream.id, text);
      setDraft(''); // realtime appends it for everyone, including us
    } catch (e) {
      addToast?.(e.message || 'Could not send your message.', 'error');
    } finally {
      setSending(false);
    }
  };

  const removeMsg = async (id) => {
    try { await deleteStreamMessage(id); }
    catch (e) { addToast?.(e.message || 'Could not delete.', 'error'); }
  };

  return (
    <div style={windowed ? popShell : chatWrap}>
      <div style={chatHeader}>
        <span>Live chat</span>
        <button
          style={popBtn}
          onClick={windowed ? onDock : onPopOut}
          title={windowed ? 'Bring chat back into the page' : 'Open chat in its own window'}
        >
          {windowed ? '⤓ Dock' : '↗ Pop out'}
        </button>
      </div>
      <div ref={listRef} style={windowed ? { ...chatList, maxHeight: 'none', flex: 1 } : chatList}>
        {messages.length === 0 ? (
          <div style={{ ...muted, textAlign: 'center', padding: '18px 0' }}>No messages yet — say hi 👋</div>
        ) : (
          messages.map((m) => {
            const external = m.source && m.source !== 'prompted';
            const a = m.author || {};
            // External (mirrored) messages have no Prompted user — only host/admin can remove them.
            const canDelete = currentUser && ((!external && currentUser.id === m.user_id) || isHost);
            return (
              <div key={m.id} style={chatMsg}>
                {external ? (
                  <span style={chatExtAuthor}>
                    <span style={m.source === 'youtube' ? badgeYouTube : badgeTwitch}>
                      {m.source === 'youtube' ? 'YouTube' : 'Twitch'}
                    </span>
                    <span style={{ color: m.source === 'youtube' ? '#FF4D4D' : '#A970FF', fontWeight: 600 }}>
                      {m.external_author || 'viewer'}
                    </span>
                  </span>
                ) : (
                  <button style={chatAuthor} onClick={() => m.user_id && onUserClick?.(m.user_id)}>
                    {a.avatar_emoji ? <span>{a.avatar_emoji} </span> : null}
                    <span style={{ color: a.name_color || 'var(--text-secondary)' }}>@{a.username || 'someone'}</span>
                  </button>
                )}
                <span style={chatText}>{m.content}</span>
                {canDelete && <button style={chatDel} title="Delete" onClick={() => removeMsg(m.id)}>✕</button>}
              </div>
            );
          })
        )}
      </div>
      <div style={chatInputRow}>
        <input
          className="form-input"
          placeholder={currentUser ? 'Send a message…' : 'Sign in to chat'}
          value={draft}
          maxLength={500}
          disabled={sending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          onFocus={() => { if (!currentUser) onRequireAuth?.(); }}
          style={{ flex: 1 }}
        />
        <button style={{ ...goLiveBtn, padding: '10px 16px', opacity: (sending || !draft.trim()) ? 0.6 : 1 }} disabled={sending || !draft.trim()} onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}

// Owns the optional pop-out window. The chat is rendered into that window with its
// OWN React root (createRoot) rather than a portal: a portal into a separate
// document renders fine but its clicks/typing never reach React's event system,
// which is rooted in the main document. A dedicated root makes the window fully
// interactive. Inline and windowed panels each hold their own realtime sub
// (distinct channel names), and only one is mounted at a time.
function StreamChat(props) {
  const { onPopOut, onDock, addToast } = props;
  const [popped, setPopped] = useState(false);
  const winRef = useRef(null);
  const rootRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const renderWindow = () => {
    const p = propsRef.current;
    rootRef.current?.render(
      <ChatPanel {...p} variant="window" channelSuffix="-popout" onDock={dock} />
    );
  };

  // Bring the chat back inline. Safe to call twice (the in-window Dock button and
  // the OS close button — via pagehide — both land here). Teardown is deferred so
  // we never unmount a root from inside its own click handler.
  const dock = () => {
    const root = rootRef.current; rootRef.current = null;
    const w = winRef.current; winRef.current = null;
    setPopped(false);
    onDock?.();
    setTimeout(() => {
      try { root?.unmount(); } catch { /* window already gone */ }
      try { w && !w.closed && w.close(); } catch { /* noop */ }
    }, 0);
  };

  const popOut = () => {
    const left = Math.max(0, (window.screenX || 0) + (window.outerWidth || 1200) - 400);
    const top = Math.max(0, (window.screenY || 0) + 80);
    const win = window.open('', 'zeo-live-chat', `popup=yes,width=380,height=560,left=${left},top=${top}`);
    if (!win) { addToast?.('Your browser blocked the chat window — allow pop-ups for this site.', 'error'); return; }
    paintPopup(win);
    const mount = win.document.createElement('div');
    win.document.body.appendChild(mount);
    winRef.current = win;
    rootRef.current = createRoot(mount);
    setPopped(true);
    onPopOut?.();
    renderWindow();
    win.addEventListener('pagehide', dock, { once: true });
  };

  // Keep the windowed panel's props fresh as the parent re-renders.
  useEffect(() => { if (popped) renderWindow(); });

  // Take the window down if the viewer/stream goes away while popped out.
  useEffect(() => () => { try { rootRef.current?.unmount(); winRef.current?.close(); } catch { /* noop */ } }, []);

  if (popped) return null; // chat lives in the window; parent shows the placeholder
  return <ChatPanel {...props} variant="inline" onPopOut={popOut} />;
}

function GoLivePanel({ myChannel, onClose, addToast, onLive }) {
  const [platform, setPlatform] = useState('twitch');
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  // Prefill the Twitch channel from the connected channel (Twitch only needs the
  // channel name; YouTube needs the specific live-video URL each time).
  useEffect(() => {
    if (platform === 'twitch' && myChannel?.twitch_url && !link) setLink(myChannel.twitch_url);
  }, [platform, myChannel]);

  const submit = async () => {
    if (!title.trim()) { addToast?.('Give your stream a title.', 'error'); return; }
    const parsed = parseStreamLink(platform, link);
    if (parsed.error) { addToast?.(parsed.error, 'error'); return; }
    setBusy(true);
    try {
      // The title gets pushed to the whole community — moderate it first.
      const mod = await moderateContent(title);
      if (!mod.approved) { addToast?.(mod.reason || 'That title was not approved.', 'error'); setBusy(false); return; }
      const stream = await startLiveStream({ platform, title: title.trim(), embedKey: parsed.key, notify });
      addToast?.(notify ? "You're live! 🔴" : "You're live (silent) 🤫", 'success');
      onLive?.(stream);
    } catch (e) {
      addToast?.(e.message || 'Could not start the stream.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Go Live</div>
        <button style={closeBtn} onClick={onClose}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['twitch', 'youtube'].map((p) => (
          <button
            key={p}
            onClick={() => { setPlatform(p); setLink(''); }}
            style={{ ...platBtn, ...(platform === p ? platBtnActive : {}) }}
          >
            {p === 'twitch' ? 'Twitch' : 'YouTube'}
          </button>
        ))}
      </div>

      <label style={lbl}>Stream title</label>
      <input
        className="form-input"
        placeholder="What are you building / talking about?"
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      <label style={lbl}>{platform === 'twitch' ? 'Twitch channel' : 'YouTube live video link'}</label>
      <input
        className="form-input"
        placeholder={platform === 'twitch' ? 'twitch.tv/yourname (or just yourname)' : 'https://youtube.com/watch?v=…'}
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
      <p style={hint}>
        {platform === 'twitch'
          ? 'Start your stream on Twitch first, then go live here to embed it.'
          : 'Start your live stream on YouTube, then paste the watch link of the live video.'}
      </p>

      <button
        type="button"
        role="switch"
        aria-checked={notify}
        onClick={() => setNotify((v) => !v)}
        style={notifyRow}
      >
        <span style={{ ...toggleTrack, ...(notify ? toggleTrackOn : {}) }}>
          <span style={{ ...toggleKnob, ...(notify ? toggleKnobOn : {}) }} />
        </span>
        <span style={{ textAlign: 'left' }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
            Notify people when I go live
          </span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
            {notify ? 'Sends an inbox alert + push with your title.' : 'Silent — no inbox alert or push to anyone.'}
          </span>
        </span>
      </button>

      <button style={{ ...goLiveBtn, width: '100%', justifyContent: 'center', opacity: busy ? 0.6 : 1, marginTop: 14 }} disabled={busy} onClick={submit}>
        {busy ? 'Going live…' : notify ? 'Go Live now' : 'Go Live (silent)'}
      </button>
    </div>
  );
}

// Explains the (non-obvious) "stream elsewhere, mirror it here" flow. Shown to
// everyone — non-Pro members see what they'd unlock; hosts get the steps.
function InfoModal({ canHost, onClose }) {
  const steps = [
    ['Start streaming on Twitch or YouTube', 'Go live there as you normally would — Zeo mirrors your stream, it doesn’t host the video.'],
    ['Tap “Go Live” here and pick your platform', 'Twitch or YouTube. Your saved Twitch channel is prefilled automatically.'],
    ['Paste your link and add a title', 'Twitch: your channel (twitch.tv/yourname). YouTube: the live video’s watch link.'],
    ['Hit “Go Live now”', 'Your stream embeds on Zeo, a site-wide LIVE banner lights up, and the community gets a launch ping with your title.'],
  ];
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-primary)' }}>
            How to go <span style={{ color: ACCENT }}>Live</span>
          </div>
          <button style={closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p style={{ ...muted, margin: '0 0 16px' }}>
          Watching is free for everyone. <strong style={{ color: 'var(--text-secondary)' }}>Hosting a stream is a Pro perk.</strong>
        </p>

        <ol style={stepsList}>
          {steps.map(([title, body], i) => (
            <li key={i} style={stepRow}>
              <span style={stepNum}>{i + 1}</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{title}</div>
                <div style={{ ...muted, marginTop: 2 }}>{body}</div>
              </div>
            </li>
          ))}
        </ol>

        <p style={{ ...hint, margin: '14px 0 0' }}>
          Done streaming? Tap <strong>End my stream</strong> to take the banner down.
        </p>

        <div style={nameNote}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13, marginBottom: 4 }}>
            Why “Zeo”?
          </div>
          <p style={{ ...muted, margin: 0 }}>
            It comes from the <em>zoetrope</em> — the 19th-century spinning drum that turned a
            ring of still frames into the illusion of motion, the ancestor of film. Its root,
            the Greek <em>zoē</em>, means “life.” <strong style={{ color: 'var(--text-secondary)' }}>Zeo</strong> keeps
            that idea: still moments spun into something alive — your builds and conversations, in real time.
          </p>
        </div>

        {!canHost && (
          <p style={{ ...hint, margin: '8px 0 0', color: ACCENT }}>
            Go Pro to unlock hosting and start your own streams.
          </p>
        )}
      </div>
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────
const wrap = { maxWidth: 1100, margin: '0 auto', padding: 'clamp(16px, 3vw, 32px)' };
const headerRow = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 };
const headerActions = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' };
const infoBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '10px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const h1 = { fontSize: 'clamp(26px, 4vw, 38px)', margin: '0 0 4px', color: 'var(--text-primary)', letterSpacing: '-0.02em' };
const sub = { margin: 0, color: 'var(--text-secondary)', fontSize: 14, maxWidth: 560 };
const muted = { color: 'var(--text-muted)', fontSize: 14 };
const goLiveBtn = { display: 'inline-flex', alignItems: 'center', gap: 8, background: ACCENT, color: ON_ACCENT, border: 'none', borderRadius: 10, padding: '11px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const endBtn = { ...goLiveBtn, background: 'transparent', color: ACCENT, border: `1px solid ${ACCENT}` };
const endBtnSm = { ...endBtn, padding: '6px 12px', fontSize: 12 };
const proHint = { color: 'var(--text-muted)', fontSize: 13 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 };
const card = { display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', background: 'var(--bg-card, #14181f)', border: '1px solid var(--border-color)', borderRadius: 14, cursor: 'pointer', textAlign: 'left' };
const cardThumb = { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '16 / 9', background: 'linear-gradient(135deg, #1a1f2b, #0d1016)' };
const liveTag = { position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 5, background: ACCENT, color: ON_ACCENT, fontWeight: 800, fontSize: 10, letterSpacing: 1, padding: '3px 7px', borderRadius: 6 };
const typeTag = { position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontWeight: 600, fontSize: 10, padding: '3px 7px', borderRadius: 6 };
const dot = { width: 7, height: 7, borderRadius: '50%', background: ON_ACCENT };
const cardTitle = { fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const cardHost = { display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, color: 'var(--text-secondary)', fontSize: 12.5 };
const emptyCard = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40, background: 'var(--bg-card, #14181f)', border: '1px dashed var(--border-color)', borderRadius: 14 };
const viewer = { marginBottom: 22, padding: 14, background: 'var(--bg-card, #14181f)', border: '1px solid var(--border-color)', borderRadius: 16 };
const viewerHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 };
const viewerHost = { background: 'none', border: 'none', padding: 0, marginTop: 2, color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' };
const closeBtn = { background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 14, lineHeight: 1 };
const watchOut = { color: ACCENT, fontWeight: 600, fontSize: 13, textDecoration: 'none' };
const actionsRow = { display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 };
const likeBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 999, padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const likeBtnOn = { color: '#FF4D6D', borderColor: '#FF4D6D', background: 'rgba(255,77,109,0.10)' };
const boostBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, background: ACCENT, color: ON_ACCENT, border: 'none', borderRadius: 999, padding: '7px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer' };
const testBoostBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: ACCENT, border: `1px dashed ${ACCENT}`, borderRadius: 999, padding: '6px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' };
const boostHint = { marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 };
const chatWrap = { marginTop: 14, border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-primary)' };
const chatHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' };
const popBtn = { flexShrink: 0, background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: 7, padding: '3px 9px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' };
const viewerPill = { display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, background: 'rgba(0,0,0,0.4)', color: '#fff', fontWeight: 700, fontSize: 11.5, padding: '3px 8px', borderRadius: 999, border: '1px solid var(--border-color)' };
const chatDockHint = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 14, padding: '12px 14px', border: '1px dashed var(--border-color)', borderRadius: 12, color: 'var(--text-secondary)', fontSize: 13 };
const chatDockBtn = { flexShrink: 0, background: 'transparent', border: `1px solid ${ACCENT}`, color: ACCENT, borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' };
const popShell = { display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' };
const chatList = { maxHeight: 280, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 7 };
const chatMsg = { display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13.5, lineHeight: 1.4 };
const chatAuthor = { flexShrink: 0, background: 'none', border: 'none', padding: 0, fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const chatExtAuthor = { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13 };
const badgeTwitch = { fontSize: 10, fontWeight: 800, letterSpacing: 0.3, color: '#fff', background: '#9146FF', borderRadius: 5, padding: '1px 5px', textTransform: 'uppercase' };
const badgeYouTube = { fontSize: 10, fontWeight: 800, letterSpacing: 0.3, color: '#fff', background: '#FF0000', borderRadius: 5, padding: '1px 5px', textTransform: 'uppercase' };
const chatText = { color: 'var(--text-primary)', wordBreak: 'break-word', flex: 1 };
const chatDel = { flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 2 };
const chatInputRow = { display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--border-color)' };
const panel = { marginBottom: 22, padding: 18, background: 'var(--bg-card, #14181f)', border: '1px solid var(--border-color)', borderRadius: 16, maxWidth: 520 };
const platBtn = { flex: 1, padding: '9px 0', borderRadius: 9, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const platBtnActive = { borderColor: ACCENT, color: '#fff', background: 'rgba(255,255,255,0.12)' };
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 };
const hint = { fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 14px' };
const overlay = { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' };
const modal = { width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: 22, background: 'var(--bg-card, #14181f)', border: '1px solid var(--border-color)', borderRadius: 16 };
const stepsList = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 };
const stepRow = { display: 'flex', gap: 12, alignItems: 'flex-start' };
const stepNum = { flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: ACCENT, color: ON_ACCENT, fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const nameNote = { marginTop: 16, padding: 14, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 12 };
const notifyRow = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', marginTop: 14, padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 12, cursor: 'pointer' };
const toggleTrack = { flexShrink: 0, width: 40, height: 23, borderRadius: 999, background: 'var(--border-color)', position: 'relative', transition: 'background 0.15s' };
const toggleTrackOn = { background: ACCENT };
const toggleKnob = { position: 'absolute', top: 2, left: 2, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'transform 0.15s' };
const toggleKnobOn = { transform: 'translateX(17px)' };
