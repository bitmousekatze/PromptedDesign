// Feed "Live Now" banner for Zoetrope (Zoe). Pinned just under the create-post
// box: whenever anyone is live it shows a red strip; tapping it jumps to the Zoe
// tab and opens that stream. Self-contained — it does its own read + realtime
// subscription to live_streams, so App.jsx only has to render it once.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fetchLiveStreams } from '../lib/zoe.js';

const ACCENT = '#F5C518';      // Zeo gold (matches ZoePage)
const ON_ACCENT = '#1c1500';

export default function LiveBanner({ onOpenStream }) {
  const [streams, setStreams] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());

  const load = async () => {
    try { setStreams(await fetchLiveStreams()); } catch { /* guests / offline: just hide */ }
  };

  useEffect(() => { load(); }, []);

  // Appears within ~1–2s of "Go Live"; clears when a stream ends.
  useEffect(() => {
    const ch = supabase
      .channel('zoe-banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const visible = streams.filter((s) => !dismissed.has(s.id));
  if (visible.length === 0) return null;

  const primary = visible[0];
  const more = visible.length - 1;
  const host = primary.host || {};
  const typeIcon = primary.type === 'voice_room' ? '🎙️' : '📺';

  return (
    <div style={bar} role="region" aria-label="Live now">
      <button style={main} onClick={() => onOpenStream?.(primary)}>
        <span style={liveTag}><span style={dot} /> LIVE</span>
        {more > 0 ? (
          <span style={label}>
            <strong>{visible.length} people are live</strong> — tap to watch
          </span>
        ) : (
          <span style={label}>
            <span style={{ opacity: 0.85 }}>{typeIcon} @{host.username || 'someone'}</span>
            {' — '}
            <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{primary.title}</strong>
          </span>
        )}
        <span style={watch}>Watch ▶</span>
      </button>
      <button
        style={close}
        title="Dismiss"
        aria-label="Dismiss live banner"
        onClick={(e) => { e.stopPropagation(); setDismissed((prev) => new Set(prev).add(primary.id)); }}
      >✕</button>
    </div>
  );
}

const bar = {
  display: 'flex', alignItems: 'stretch', gap: 0, margin: '0 0 14px',
  border: `1px solid ${ACCENT}`, borderRadius: 12, overflow: 'hidden',
  background: 'linear-gradient(90deg, rgba(245,197,24,0.16), rgba(245,197,24,0.06))',
};
const main = {
  flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
  padding: '11px 14px', background: 'transparent', border: 'none',
  cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left', font: 'inherit',
};
const liveTag = {
  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
  background: ACCENT, color: ON_ACCENT, fontWeight: 800, fontSize: 10, letterSpacing: 1,
  padding: '3px 7px', borderRadius: 6,
};
const dot = { width: 7, height: 7, borderRadius: '50%', background: ON_ACCENT };
const label = { flex: 1, minWidth: 0, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const watch = { flexShrink: 0, color: ACCENT, fontWeight: 700, fontSize: 13 };
const close = {
  flexShrink: 0, width: 38, background: 'transparent', border: 'none',
  borderLeft: `1px solid rgba(245,197,24,0.3)`, color: 'var(--text-muted)',
  cursor: 'pointer', fontSize: 13,
};
