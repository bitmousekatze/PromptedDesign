import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { getSiteSettings, onSiteSettings, refreshSiteSettings } from '../lib/readOnly';

// Big sticky bottom banner announcing the July 2 2026 platform migration
// (the perf/SEO/Next.js move described in docs/PROMPTED_REDESIGN_DESIGN.html).
// Reuses the old "bottom ad banner" slot at the foot of the viewport, but this
// is a first-party maintenance notice, not an AdSense unit.
//
// Window: read-only for ~4 hours starting MIDNIGHT US-EASTERN on July 2, back
// online by 4:20 AM ET. Eastern is on daylight time in July (UTC-4), so the
// instants are pinned with an explicit offset — everyone worldwide sees the
// same schedule regardless of their own timezone.
const MAINT_START_MS = new Date('2026-07-02T00:00:00-04:00').getTime();
const MAINT_END_MS   = new Date('2026-07-02T04:20:00-04:00').getTime();

// Reaction store key (see migration 20260701000001_banner_reactions.sql).
const BANNER_KEY = 'maint-2026-07-02';

// Persistence:
//   • "Don't show me again" → localStorage: gone for good on this device.
//   • Plain close (×)       → sessionStorage: reappears next visit.
const DONT_SHOW_KEY = 'prompted-maint-2026-07-02-hide';
const SESSION_KEY   = 'prompted-maint-2026-07-02-closed';

const hiddenForever = () => {
  try { return localStorage.getItem(DONT_SHOW_KEY) === '1'; } catch { return false; }
};
const closedThisSession = () => {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
};

// Quick-access row shown when the user taps "React"; the "+" opens the full
// modal below for any emoji.
const QUICK_EMOJIS = ['👍', '❤️', '🔥', '🎉', '😮', '🚀'];

// Full picker grid (the "react emoji modal").
const ALL_EMOJIS = [
  '😀', '😂', '🥲', '😊', '😍', '🤩', '😎', '🤔',
  '😅', '😭', '😡', '🥳', '😴', '🤯', '🙃', '😬',
  '👍', '👎', '👏', '🙌', '🙏', '👀', '💪', '🤝',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '🔥', '✨', '⭐', '💯', '🎉', '🎊', '🚀', '⚡',
  '💡', '🧠', '🤖', '🛠️', '📌', '✅', '🏎️', '🎮',
];

export default function MaintenanceBanner({ currentUser = null, addToast, isAdmin = false }) {
  const [now, setNow] = useState(() => Date.now());
  const [dontShow, setDontShow] = useState(false);
  const [closed, setClosed] = useState(() => hiddenForever() || closedThisSession());
  // Stored dismissals are ignored while read-only is live (the banner IS the
  // status page then); an explicit × click this page load still closes it.
  const closedByClickRef = useRef(false);

  // Live read-only flag from site_settings (polled by lib/readOnly.js).
  const [site, setSite] = useState(getSiteSettings());
  useEffect(() => onSiteSettings(setSite), []);
  const readOnly = !!site.read_only;
  const [adminBusy, setAdminBusy] = useState(false);

  // Reactions: [{ emoji, count, me }]
  const [reactions, setReactions] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false); // quick bar
  const [modalOpen, setModalOpen] = useState(false);   // full emoji modal
  const [busyEmoji, setBusyEmoji] = useState(null);
  const pickerWrapRef = useRef(null);

  // Tick so the live copy + countdown + auto-hide update without a reload.
  // 15s keeps the read-only countdown feeling live; it's just a state set.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const loadReactions = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_banner_reactions', { p_banner_key: BANNER_KEY });
    if (!error && Array.isArray(data)) {
      setReactions(data.map((r) => ({ emoji: r.emoji, count: Number(r.count) || 0, me: !!r.me })));
    }
  }, []);

  useEffect(() => {
    if (closed) return;
    loadReactions();
  }, [closed, currentUser?.id, loadReactions]);

  // Close the quick bar on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDown = (e) => {
      if (pickerWrapRef.current && !pickerWrapRef.current.contains(e.target)) setPickerOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setPickerOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  // The migration is over — retire the banner permanently (but never while
  // the read-only flag is still on: the flag is the source of truth then).
  if (now >= MAINT_END_MS && !readOnly) return null;
  // Stored dismissals don't apply during live read-only; a fresh × click does.
  if (closed && (!readOnly || closedByClickRef.current)) return null;

  const inWindow = readOnly || (now >= MAINT_START_MS && now < MAINT_END_MS);

  // Countdown target: the admin-set return time, else the announced 4:20 AM ET.
  const backAtMs = site.back_online_at ? new Date(site.back_online_at).getTime() : MAINT_END_MS;
  const msLeft = backAtMs - now;
  const backIn = msLeft <= 0
    ? 'any minute now'
    : msLeft >= 3_600_000
      ? `~${Math.floor(msLeft / 3_600_000)}h ${Math.floor((msLeft % 3_600_000) / 60_000)}m`
      : `~${Math.max(1, Math.round(msLeft / 60_000))}m`;

  let lead;
  if (readOnly) {
    lead = `Prompted is in read-only mode — back ${msLeft <= 0 ? backIn : `in ${backIn}`}.`;
  } else if (inWindow) {
    lead = "We're migrating right now — Prompted is in read-only mode.";
  } else {
    const ms = MAINT_START_MS - now;
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    const when = days >= 1 ? `in ${days} day${days > 1 ? 's' : ''}` : hours >= 1 ? `in ${hours}h` : 'soon';
    lead = `Scheduled maintenance ${when} — heads up!`;
  }

  const dismiss = () => {
    closedByClickRef.current = true;
    try {
      if (dontShow) localStorage.setItem(DONT_SHOW_KEY, '1');
      else sessionStorage.setItem(SESSION_KEY, '1');
    } catch { /* private mode / storage off — just close for now */ }
    setClosed(true);
  };

  // Admin: flip site-wide read-only via the set_read_only_mode RPC. Turning it
  // on pins the countdown to the announced 4:20 AM ET return time.
  const toggleReadOnly = async () => {
    if (adminBusy) return;
    setAdminBusy(true);
    const next = !readOnly;
    const { error } = await supabase.rpc('set_read_only_mode', {
      p_read_only: next,
      p_back_online_at: next ? new Date(MAINT_END_MS).toISOString() : null,
      p_message: null,
    });
    if (error) addToast?.(`Could not ${next ? 'enable' : 'disable'} read-only: ${error.message}`, 'error');
    else addToast?.(next ? 'Site is now READ-ONLY' : 'Site is writable again', 'success');
    await refreshSiteSettings();
    setAdminBusy(false);
  };

  // Toggle the current user's reaction for an emoji (optimistic, server-reconciled).
  const react = async (emoji) => {
    setPickerOpen(false);
    setModalOpen(false);
    if (!currentUser) {
      addToast?.('Sign in to react', 'error');
      return;
    }
    if (busyEmoji) return;
    setBusyEmoji(emoji);

    // Optimistic: flip my reaction + adjust the count locally.
    setReactions((prev) => {
      const existing = prev.find((r) => r.emoji === emoji);
      if (existing) {
        const nextCount = existing.count + (existing.me ? -1 : 1);
        const updated = prev
          .map((r) => (r.emoji === emoji ? { ...r, me: !r.me, count: nextCount } : r))
          .filter((r) => r.count > 0);
        return updated;
      }
      return [...prev, { emoji, count: 1, me: true }];
    });

    const { error } = await supabase.rpc('toggle_banner_reaction', { p_banner_key: BANNER_KEY, p_emoji: emoji });
    if (error) {
      addToast?.('Could not save your reaction', 'error');
    }
    // Reconcile with the server either way (covers concurrent reactors).
    await loadReactions();
    setBusyEmoji(null);
  };

  return (
    <>
      <div role="status" aria-live="polite" style={wrapStyle}>
        <div style={innerStyle}>
          <div style={iconBoxStyle} aria-hidden="true">
            <span style={{ fontSize: 26, lineHeight: 1 }}>🛠️</span>
          </div>

          <div style={copyStyle}>
            <div style={titleRowStyle}>
              <span style={{ ...pillStyle, ...(readOnly ? { background: 'linear-gradient(135deg,#ff6b6b,#ffb800)' } : {}) }}>
                {readOnly ? 'READ-ONLY' : inWindow ? 'LIVE' : 'SCHEDULED'}
              </span>
              <strong style={titleStyle}>{lead}</strong>
            </div>
            {readOnly ? (
              <p style={bodyStyle}>
                {site.read_only_message || (
                  <>
                    We&apos;re shipping the big performance &amp; SEO upgrade right now. You can still browse —
                    posting, likes &amp; comments are paused. Back online <b style={hi}>{backIn}</b>
                    {msLeft > 0 && (
                      <> (by <b style={hi}>
                        {new Date(backAtMs).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}&nbsp;ET
                      </b>)</>
                    )}. Thanks for your patience. 💛
                  </>
                )}
              </p>
            ) : (
              <p style={bodyStyle}>
                On <b style={hi}>July&nbsp;2</b> starting at <b style={hi}>12:00&nbsp;AM&nbsp;ET</b>, Prompted goes into{' '}
                <b style={hi}>read-only mode for ~4&nbsp;hours</b> while we ship a big performance &amp; SEO upgrade.
                You can still browse — posting, likes &amp; comments pause. We&apos;ll be fully back online by{' '}
                <b style={hi}>4:20&nbsp;AM&nbsp;ET</b>. Thanks for your patience. 💛
              </p>
            )}

            {/* Reaction row */}
            <div style={reactRowStyle}>
              {reactions.map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => react(r.emoji)}
                  title={r.me ? 'Remove your reaction' : 'React'}
                  style={chipStyle(r.me)}
                >
                  <span style={{ fontSize: 14 }}>{r.emoji}</span>
                  <span style={chipCountStyle}>{r.count}</span>
                </button>
              ))}

              <div ref={pickerWrapRef} style={{ position: 'relative' }}>
                <button onClick={() => setPickerOpen((v) => !v)} style={reactBtnStyle} title="Add a reaction">
                  <span style={{ fontSize: 14 }}>🙂</span>
                  <span style={{ fontSize: 16, fontWeight: 700, marginTop: -2 }}>+</span>
                </button>

                {pickerOpen && (
                  <div style={quickBarStyle}>
                    {QUICK_EMOJIS.map((e) => (
                      <button key={e} onClick={() => react(e)} style={quickEmojiStyle} title={`React ${e}`}>
                        {e}
                      </button>
                    ))}
                    <button
                      onClick={() => { setPickerOpen(false); setModalOpen(true); }}
                      style={quickMoreStyle}
                      title="More emoji"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={controlsStyle}>
            {!readOnly && (
              <label style={dontShowStyle}>
                <input
                  type="checkbox"
                  checked={dontShow}
                  onChange={(e) => setDontShow(e.target.checked)}
                  style={{ accentColor: '#ffd700', cursor: 'pointer' }}
                />
                Don&apos;t show me again
              </label>
            )}
            <button onClick={dismiss} style={dismissBtnStyle}>Dismiss</button>
            {isAdmin && (
              <button onClick={toggleReadOnly} disabled={adminBusy} style={adminBtnStyle(readOnly, adminBusy)}>
                {adminBusy ? 'Saving…' : readOnly ? '🔓 Admin: end read-only' : '🔒 Admin: go read-only'}
              </button>
            )}
          </div>

          <button onClick={dismiss} aria-label="Close" style={closeBtnStyle}>×</button>
        </div>
      </div>

      {/* Full "react emoji" modal */}
      {modalOpen && createPortal(
        <div style={modalOverlayStyle} onClick={() => setModalOpen(false)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <strong style={{ fontSize: '0.95rem' }}>Pick a reaction</strong>
              <button onClick={() => setModalOpen(false)} aria-label="Close" style={modalCloseStyle}>×</button>
            </div>
            <div style={modalGridStyle}>
              {ALL_EMOJIS.map((e) => (
                <button key={e} onClick={() => react(e)} style={modalEmojiStyle} title={`React ${e}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Styles (inline, matching App.jsx's CSS-in-template patterns) ─────────────
const wrapStyle = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 4000,
  padding: '0 12px 12px',
  pointerEvents: 'none',
};
const innerStyle = {
  pointerEvents: 'auto',
  position: 'relative',
  maxWidth: 1180,
  margin: '0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '14px 48px 14px 16px',
  borderRadius: 14,
  border: '1px solid rgba(255,215,0,.45)',
  background: 'linear-gradient(135deg, #14171f 0%, #1b1f29 60%, #241b12 100%)',
  boxShadow: '0 -2px 24px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.3)',
  color: '#e6e9ef',
};
const iconBoxStyle = {
  flexShrink: 0,
  width: 46,
  height: 46,
  borderRadius: 12,
  display: 'grid',
  placeItems: 'center',
  background: 'radial-gradient(circle at 30% 30%, rgba(255,215,0,.25), rgba(255,215,0,.06))',
  border: '1px solid rgba(255,215,0,.35)',
};
const copyStyle = { flex: 1, minWidth: 0 };
const titleRowStyle = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' };
const pillStyle = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '.06em',
  padding: '2px 7px',
  borderRadius: 999,
  background: 'linear-gradient(135deg,#ffb800,#ff4fa3)',
  color: '#1a1024',
};
const titleStyle = { fontSize: '0.95rem', color: '#fff' };
const bodyStyle = { margin: 0, fontSize: '0.82rem', lineHeight: 1.5, color: '#c3cad6' };
const hi = { color: '#ffd700', fontWeight: 700 };

const reactRowStyle = { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' };
const chipStyle = (mine) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 9px',
  borderRadius: 999,
  cursor: 'pointer',
  fontSize: '0.78rem',
  lineHeight: 1,
  border: `1px solid ${mine ? 'rgba(255,215,0,.6)' : 'rgba(255,255,255,.14)'}`,
  background: mine ? 'rgba(255,215,0,.14)' : 'rgba(255,255,255,.05)',
  color: mine ? '#ffd700' : '#c3cad6',
});
const chipCountStyle = { fontWeight: 700, fontSize: '0.72rem' };
const reactBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  padding: '3px 9px',
  borderRadius: 999,
  cursor: 'pointer',
  border: '1px dashed rgba(255,255,255,.22)',
  background: 'rgba(255,255,255,.04)',
  color: '#9aa3b2',
};
const quickBarStyle = {
  position: 'absolute',
  bottom: 'calc(100% + 6px)',
  left: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: 4,
  borderRadius: 999,
  background: '#0f1218',
  border: '1px solid #2a2f3a',
  boxShadow: '0 8px 24px rgba(0,0,0,.5)',
  zIndex: 5,
};
const quickEmojiStyle = {
  width: 30,
  height: 30,
  borderRadius: '50%',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 17,
  lineHeight: 1,
};
const quickMoreStyle = {
  width: 30,
  height: 30,
  borderRadius: '50%',
  border: '1px solid #2a2f3a',
  background: '#1b1f29',
  color: '#9aa3b2',
  cursor: 'pointer',
  fontSize: 16,
  fontWeight: 700,
};
const controlsStyle = {
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 8,
};
const dontShowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: '0.74rem',
  color: '#9aa3b2',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const dismissBtnStyle = {
  border: '1px solid rgba(255,215,0,.5)',
  background: 'rgba(255,215,0,.1)',
  color: '#ffd700',
  fontWeight: 700,
  fontSize: '0.78rem',
  padding: '6px 16px',
  borderRadius: 8,
  cursor: 'pointer',
};
const adminBtnStyle = (active, busy) => ({
  border: `1px dashed ${active ? 'rgba(107,255,138,.55)' : 'rgba(255,107,107,.55)'}`,
  background: active ? 'rgba(107,255,138,.08)' : 'rgba(255,107,107,.08)',
  color: active ? '#6bff8a' : '#ff6b6b',
  fontWeight: 700,
  fontSize: '0.72rem',
  padding: '5px 12px',
  borderRadius: 8,
  cursor: busy ? 'wait' : 'pointer',
  opacity: busy ? 0.6 : 1,
  whiteSpace: 'nowrap',
});
const closeBtnStyle = {
  position: 'absolute',
  top: 8,
  right: 10,
  border: 'none',
  background: 'transparent',
  color: '#9aa3b2',
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 2,
};

// Modal
const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 5000,
  background: 'rgba(0,0,0,.6)',
  display: 'grid',
  placeItems: 'center',
  padding: 16,
};
const modalCardStyle = {
  width: 'min(420px, 92vw)',
  background: '#14171f',
  border: '1px solid #2a2f3a',
  borderRadius: 16,
  boxShadow: '0 20px 60px rgba(0,0,0,.6)',
  overflow: 'hidden',
};
const modalHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid #2a2f3a',
  color: '#e6e9ef',
};
const modalCloseStyle = {
  border: 'none',
  background: 'transparent',
  color: '#9aa3b2',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
};
const modalGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(8, 1fr)',
  gap: 4,
  padding: 14,
  maxHeight: 320,
  overflowY: 'auto',
};
const modalEmojiStyle = {
  aspectRatio: '1 / 1',
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 20,
  lineHeight: 1,
};
