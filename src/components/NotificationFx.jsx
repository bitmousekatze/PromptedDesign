import { useEffect, useMemo, useRef, useState } from 'react';

// Alternate, playful ways to view the notifications list: Instagram-style Grid,
// floating Bubble mode (click to dismiss, hold to read), and a Matrix rain
// theme. The plain List mode stays in App.jsx; this component owns the rest.
//
// Each renderer takes the same shape:
//   notifications  – the loaded rows (with .profiles / .data / .achievement)
//   onOpen(n)      – open/route a notification (same as a list click)
//   onDismiss(n)   – remove it from view (bubble mode)

const displayName = (n) => n.profiles?.display_name || n.profiles?.username || 'Someone';

// Plain-text summary of a notification — a lighter mirror of App.jsx's JSX
// getNotificationMessage(), so the fancy views stay self-contained.
export const notificationSummary = (n) => {
  const who = displayName(n);
  switch (n.type) {
    case 'follow': return `${who} followed you`;
    case 'post_like': return `${who} liked your post`;
    case 'comment_like': return `${who} liked your comment`;
    case 'comment': return `${who} commented on your post`;
    case 'reply': return `${who} replied to your comment`;
    case 'post_save': return `${who} saved your post`;
    case 'repost': return `${who} reposted your post`;
    case 'community_join': return `${who} joined your community`;
    case 'community_paid_request': return `${who} wants to join your paid community`;
    case 'community_paid_approved': return `${who} approved your subscription`;
    case 'community_paid_denied': return `${who} denied your subscription`;
    case 'linked_question': return `${who} asked about your post`;
    case 'achievement_unlocked': return `You unlocked ${n.achievement?.name || 'an achievement'}`;
    case 'skills_feature_launch': return 'New Skills feature — add yours';
    case 'stream_live': return `${who} is live now`;
    case 'daily_reward_review': return `${who} shared on X to claim (+${n.data?.points ?? ''} BP)`;
    case 'daily_reward_confirmed': return `Daily reward approved · +${n.data?.points ?? ''} BP`;
    case 'daily_reward_denied': return 'Daily reward claim denied';
    default: return `${who} interacted with you`;
  }
};

const Avatar = ({ n, size }) => {
  const p = n.profiles || {};
  if (p.avatar_url) {
    return <img src={p.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-tertiary, #1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, flexShrink: 0 }}>
      {p.avatar_emoji || '🔔'}
    </div>
  );
};

// ── Grid: square tiles, Instagram-style ──────────────────────────────────────
const GridView = ({ notifications, onOpen }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))', gap: 8, padding: 12 }}>
    {notifications.map((n) => (
      <button
        key={n.id}
        onClick={() => onOpen(n)}
        style={{
          aspectRatio: '1 / 1', border: n.is_read ? '1px solid var(--border-color)' : '2px solid #ff4444',
          borderRadius: 12, background: 'var(--bg-tertiary)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10, cursor: 'pointer',
          color: 'var(--text-primary)', overflow: 'hidden', textAlign: 'center',
        }}
      >
        <Avatar n={n} size={46} />
        <div style={{ fontSize: '0.72rem', lineHeight: 1.25, maxHeight: '3.7em', overflow: 'hidden' }}>
          {notificationSummary(n)}
        </div>
      </button>
    ))}
  </div>
);

// ── Bubble: floating avatars, click to dismiss, hold to read ─────────────────
const BubbleView = ({ notifications, onOpen, onDismiss }) => {
  const [reading, setReading] = useState(null);
  const hold = useRef({ id: null, timer: null, fired: false });

  // Stable random layout per render of this set (re-rolls only when ids change).
  const ids = notifications.map((n) => n.id).join(',');
  const layout = useMemo(() => {
    const map = {};
    notifications.forEach((n) => {
      map[n.id] = {
        top: 6 + Math.random() * 70,
        left: 5 + Math.random() * 78,
        dur: 9 + Math.random() * 10,
        delay: -Math.random() * 12,
        size: 54 + Math.random() * 26,
      };
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const clearHold = () => { clearTimeout(hold.current.timer); };
  const onDown = (n) => {
    hold.current = { id: n.id, fired: false, timer: setTimeout(() => { hold.current.fired = true; setReading(n.id); }, 220) };
  };
  const onUp = (n) => {
    clearHold();
    if (hold.current.fired) setReading(null);   // was a hold-to-read → just release
    else onDismiss(n);                          // was a quick click → pop it
    hold.current = { id: null, timer: null, fired: false };
  };
  const onLeave = () => {
    clearHold();
    if (hold.current.fired) setReading(null);
    hold.current = { id: null, timer: null, fired: false };
  };

  const readingNote = reading ? notifications.find((n) => n.id === reading) : null;

  return (
    <div style={{ position: 'relative', height: 440, overflow: 'hidden' }}>
      <style>{`@keyframes nfx-float {
        0%   { transform: translate(0, 0); }
        25%  { transform: translate(14px, -22px); }
        50%  { transform: translate(-16px, -34px); }
        75%  { transform: translate(-22px, -12px); }
        100% { transform: translate(0, 0); }
      }`}</style>
      {notifications.map((n) => {
        const l = layout[n.id] || { top: 30, left: 30, dur: 12, delay: 0, size: 60 };
        const isReading = reading === n.id;
        return (
          <button
            key={n.id}
            onPointerDown={() => onDown(n)}
            onPointerUp={() => onUp(n)}
            onPointerLeave={onLeave}
            title="Click to dismiss · hold to read"
            style={{
              position: 'absolute', top: `${l.top}%`, left: `${l.left}%`,
              width: l.size, height: l.size, borderRadius: '50%', padding: 0, cursor: 'pointer',
              border: n.is_read ? '2px solid rgba(148,163,184,0.5)' : '2px solid #ff4444',
              background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isReading ? '0 0 0 4px rgba(255,68,68,0.25)' : '0 4px 14px rgba(0,0,0,0.4)',
              animation: `nfx-float ${l.dur}s ease-in-out ${l.delay}s infinite`,
              animationPlayState: isReading ? 'paused' : 'running',
              zIndex: isReading ? 5 : 1, transition: 'box-shadow 0.15s',
            }}
          >
            <Avatar n={n} size={l.size - 8} />
          </button>
        );
      })}

      {readingNote && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 10,
          maxWidth: '90%', background: 'rgba(15,23,42,0.96)', border: '1px solid var(--border-color)',
          borderRadius: 12, padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: 10,
          pointerEvents: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <Avatar n={readingNote} size={34} />
          <div>
            <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{notificationSummary(readingNote)}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 2 }}>
              {new Date(readingNote.created_at).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', top: 8, left: 0, right: 0, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem', pointerEvents: 'none' }}>
        Tap a bubble to dismiss · press &amp; hold to read
      </div>
    </div>
  );
};

// ── Matrix: green rain canvas behind green-on-black notification rows ─────────
const MatrixRain = () => {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const fontSize = 14;
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ﾊﾋﾌﾍﾎ@#$%';
    let cols = 0; let drops = []; let raf = 0;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      cols = Math.max(1, Math.floor(canvas.width / fontSize));
      drops = Array.from({ length: cols }, () => Math.random() * (canvas.height / fontSize));
    };
    const draw = () => {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#00ff41';
      ctx.font = `${fontSize}px monospace`;
      for (let i = 0; i < cols; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(ch, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
      raf = requestAnimationFrame(draw);
    };
    resize();
    draw();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />;
};

const MatrixView = ({ notifications, onOpen }) => (
  <div style={{ position: 'relative', background: '#000', minHeight: 440, overflow: 'hidden' }}>
    <MatrixRain />
    <div style={{ position: 'relative', zIndex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {notifications.map((n) => (
        <button
          key={n.id}
          onClick={() => onOpen(n)}
          style={{
            textAlign: 'left', fontFamily: 'monospace', color: '#00ff41', textShadow: '0 0 6px rgba(0,255,65,0.8)',
            background: 'rgba(0,0,0,0.55)', border: `1px solid rgba(0,255,65,${n.is_read ? 0.25 : 0.6})`,
            borderRadius: 6, padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
          }}
        >
          <span style={{ opacity: 0.7 }}>&gt;&nbsp;</span>{notificationSummary(n)}
          <span style={{ opacity: 0.5, fontSize: '0.72rem' }}> · {new Date(n.created_at).toLocaleDateString()}</span>
        </button>
      ))}
    </div>
  </div>
);

const NotificationFx = ({ mode, notifications, onOpen, onDismiss }) => {
  if (mode === 'grid') return <GridView notifications={notifications} onOpen={onOpen} />;
  if (mode === 'bubble') return <BubbleView notifications={notifications} onOpen={onOpen} onDismiss={onDismiss} />;
  if (mode === 'matrix') return <MatrixView notifications={notifications} onOpen={onOpen} />;
  return null;
};

export default NotificationFx;
