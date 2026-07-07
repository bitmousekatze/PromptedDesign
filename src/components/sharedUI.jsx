// Shared UI components extracted verbatim from App.jsx during the
// post-experience component split (July 2026). Used by App.jsx and the
// extracted post components — no behavior change.
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase.js';
import { useToast, hexToRgba, getRankForPoints, copyToClipboard, buildProfileShareUrl } from '../lib/appShared.js';
import { getDisplayedBadges } from '../lib/badges.js';
import BadgeSVG, { getBadgeForPoints } from './BadgeSVG.jsx';
import { ZoomInIcon, ZoomOutIcon, HeartIcon, CommentIcon, ShareIcon, MessageIcon } from './icons.jsx';

// Custom badge renderer. Looks up the user's chosen display badge from the
// synchronous badge map (see src/lib/badges.js) and renders it with a hover
// tooltip. Drop-in replacement for `isVerifiedUser(x) && <VerifiedBadge/>`.

// Verified users list — usernames lowercased; isVerifiedUser() lowercases input before lookup.
export const VERIFIED_USERS = [
  'aminceo',
  'angolabrown26',
  'aporiabuilds',
  'chlo',
  'col_asy',
  'david',
  'devmouse',
  'mouse',
  'herz',
  'jackle',
  'jagadeeswar',
  'kapilansh_twt',
  'kennethics',
  'ktb',
  'lev',
  'mamoshi',
  'mehulfanawla',
  'sal',
  'theprompted',
  'ugxships',
  'vision',
];

// Helper function to check if a user is verified
export const isVerifiedUser = (username) => {
  if (!username) return false;
  return VERIFIED_USERS.includes(username.toLowerCase());
};

// Verification badge component - golden checkmark
export const VerifiedBadge = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="#FFD700"
    className="verified-badge"
    title="Verified"
  >
    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    <path d="M9 12l2 2 4-4" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

// The Spotlight gem — the Spotlight page's icon, drawn bare (no circle).
// Slightly inset (padded viewBox) so it reads a touch smaller than the shield.
// Spins + pulses on hover; shows a styled tooltip when given a label.
// `color` tints the gem; `tipColor` tints the hover text box (text + border) —
// default gold, but a Spotlight holder can recolor it (red/blue/whatever).
export const SpotlightGem = ({ size = 16, color = '#FFD700', label, tipColor = '#FFD700' }) => {
  // The hover label is rendered into a portal as a position:fixed element so it
  // can NEVER be clipped by a feed card's overflow (the old approach popped an
  // absolutely-positioned tip upward, which got cut off at the card's top edge —
  // so the feed fell back to the ugly native `title` box). Portal + fixed coords
  // makes the same gold tooltip show identically everywhere.
  const wrapRef = useRef(null);
  const [tip, setTip] = useState(null); // { left, top, above } | null

  const showTip = () => {
    if (!label || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const above = r.top > 44; // flip below the gem when there's no headroom above
    setTip({ left: r.left + r.width / 2, top: above ? r.top - 7 : r.bottom + 7, above });
  };
  const hideTip = () => setTip(null);

  return (
    <span
      ref={wrapRef}
      className="spotlight-badge-wrap"
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
    >
      <style>{`
        .spotlight-badge-wrap .spotlight-gem { transform-origin: center; transform-box: fill-box; }
        .spotlight-badge-wrap:hover .spotlight-gem { animation: spotlight-spin 0.8s ease-in-out; }
        @keyframes spotlight-spin {
          0%   { transform: rotate(0deg) scale(1); }
          50%  { transform: rotate(180deg) scale(0.9); }
          100% { transform: rotate(360deg) scale(1); }
        }
      `}</style>
      <svg width={size} height={size} viewBox="-3 -3 30 30" fill={color}
        className="spotlight-badge user-badge" role="img" aria-label={label || 'Spotlight'}>
        <path className="spotlight-gem" d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" />
      </svg>
      {tip && label && createPortal(
        <span style={{
          position: 'fixed', left: tip.left, top: tip.top,
          transform: `translateX(-50%) ${tip.above ? 'translateY(-100%)' : ''}`,
          background: '#15171c', color: tipColor, border: `1px solid ${hexToRgba(tipColor, 0.55)}`,
          padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          whiteSpace: 'nowrap', zIndex: 100000, pointerEvents: 'none',
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        }}>{label}</span>,
        document.body
      )}
    </span>
  );
};

// Renders a single displayed badge (custom icon / Spotlight gem / shield / glyph).
// Owns its own lightbox state so two badges next to a name don't share it.
export const SingleBadge = ({ badge, username, size }) => {
  const [expanded, setExpanded] = useState(false);

  const tip = badge.description ? `${badge.label} — ${badge.description}` : badge.label;

  // Custom uploaded icon image / NFT takes precedence over any glyph/SVG.
  // Clicking it opens a lightbox so you can see the full badge art.
  if (badge.icon_url) {
    return (
      <>
        <img
          src={badge.icon_url}
          alt={badge.label}
          title={`${tip} — click to expand`}
          className="user-badge"
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          style={{
            width: size, height: size, borderRadius: '50%', flexShrink: 0,
            objectFit: 'cover', verticalAlign: 'middle', display: 'inline-block',
            background: badge.color || 'transparent', cursor: 'zoom-in',
          }}
        />
        {expanded && (
          <div
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <img
                src={badge.icon_url}
                alt={badge.label}
                style={{ width: 'min(320px, 80vw)', height: 'min(320px, 80vw)', objectFit: 'contain', borderRadius: 24, background: badge.color || '#15171c', boxShadow: '0 16px 60px rgba(0,0,0,0.6)' }}
              />
              <div style={{ textAlign: 'center', color: '#fff', fontFamily: "'Space Grotesk', sans-serif" }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{badge.label_override || badge.label}</div>
                {badge.description && <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4, maxWidth: 360 }}>{badge.description}</div>}
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>@{username}</div>
              </div>
              <button onClick={() => setExpanded(false)} style={{ marginTop: 4, padding: '7px 18px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        )}
      </>
    );
  }

  // The Spotlight gem — same idea as the Pro shield, just the Spotlight page's
  // gem icon (bare, no circle). Awarded to the top-3 Creator-of-the-Month
  // finalists. Spins on hover + shows its label, e.g. "June Winner 2026".
  // Pro-contest winner badges (slug 'pro-contest-*') get the same gem so all
  // contest awards look alike — the hover label is what tells them apart.
  if (badge.slug === 'spotlight' || badge.slug.startsWith('pro-contest-')) {
    return (
      <SpotlightGem
        size={size}
        color={badge.color || '#FFD700'}
        label={badge.label_override || badge.label}
        tipColor={badge.text_color || '#FFD700'}
      />
    );
  }

  // The gold shield-checkmark — shared by the verified badge AND Pro members,
  // so Pro shows the exact same badge as a verified account.
  if (badge.slug === 'verified' || badge.slug === 'pro') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={badge.color || '#FFD700'}
        className="verified-badge user-badge" role="img" aria-label={badge.label}>
        <title>{tip}</title>
        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        <path d="M9 12l2 2 4-4" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }

  // Generic glyph badge: filled circle in the badge color + icon char.
  return (
    <span
      className="user-badge"
      title={tip}
      role="img"
      aria-label={badge.label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: badge.color || '#C9A227', color: '#0a0a0a',
        fontSize: Math.round(size * 0.62), fontWeight: 700, lineHeight: 1,
        verticalAlign: 'middle', cursor: 'default', userSelect: 'none',
      }}
    >
      {badge.icon || '★'}
    </span>
  );
};

// A user can display up to two badges (e.g. Pro shield + Spotlight gem). Renders
// each via SingleBadge, re-rendering when the global badge map (re)loads.
export const UserBadge = ({ username, size = 16 }) => {
  const [, force] = useState(0);
  useEffect(() => {
    const handler = () => force((n) => n + 1);
    window.addEventListener('badges-loaded', handler);
    return () => window.removeEventListener('badges-loaded', handler);
  }, []);

  const badges = getDisplayedBadges(username);
  if (!badges.length) return null;
  if (badges.length === 1) {
    return <SingleBadge badge={badges[0]} username={username} size={size} />;
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.max(2, Math.round(size * 0.18)), verticalAlign: 'middle' }}>
      {badges.map((b) => (
        <SingleBadge key={b.slug} badge={b} username={username} size={size} />
      ))}
    </span>
  );
};

export const BuilderRankBadge = ({ points, ranks, size = 'small', onClick }) => {
  if (points === undefined || points === null) return null;
  const badge = getBadgeForPoints(points || 0);
  const svgSize = size === 'medium' ? 30 : size === 'leaderboard' ? 24 : 18;
  const handleClick = onClick || (() => {
    window.history.pushState({}, '', '/ranks');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  return (
    <span
      className="builder-rank-badge-svg"
      style={{
        display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle',
        cursor: 'pointer',
      }}
      title={`${badge.name} — ${points || 0} Builder Points`}
      onClick={(e) => { e.stopPropagation(); handleClick(); }}
    >
      <BadgeSVG badge={badge} size={svgSize} />
    </span>
  );
};

// Display label for a conversation (group title, or the other DM participant).
export const getConversationTitle = (conv, currentUserId) => {
  if (!conv) return '';
  if (conv.is_group) return conv.title || 'Group chat';
  const other = (conv.conversation_participants || []).find(p => p.user_id !== currentUserId);
  return other?.profiles?.username ? `@${other.profiles.username}` : 'Direct message';
};

// Compact avatar bubble for inbox rows / thread headers.
export const ChatAvatar = ({ profile, size = 36 }) => {
  const dim = `${size}px`;
  const style = { width: dim, height: dim, fontSize: `${Math.round(size * 0.45)}px` };
  if (profile?.avatar_url) {
    return <div className="chat-avatar" style={style}><img src={profile.avatar_url} alt="" /></div>;
  }
  if (profile?.avatar_emoji) {
    return <div className="chat-avatar chat-avatar-emoji" style={style}>{profile.avatar_emoji}</div>;
  }
  return (
    <div className="chat-avatar chat-avatar-fallback" style={style}>
      {(profile?.username || '?').charAt(0).toUpperCase()}
    </div>
  );
};

// Modal that forwards a post / profile / community into one of the user's
// existing conversations. `entity` is { kind: 'post'|'profile'|'community',
// id, label? }. The right shared_*_id column is populated based on kind.
export const ShareToChatModal = ({ isOpen, onClose, entity = null, currentUserId }) => {
  const { addToast } = useToast();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState(null);

  useEffect(() => {
    if (!isOpen || !currentUserId) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
          conversations:conversation_id (
            id, is_group, title, last_message_at, created_at,
            conversation_participants (
              user_id,
              profiles:user_id (id, username, avatar_url, avatar_emoji, name_color)
            )
          )
        `)
        .eq('user_id', currentUserId);
      const rows = (data || [])
        .map(r => r.conversations)
        .filter(Boolean)
        .sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
      setConversations(rows);
      setLoading(false);
    })();
  }, [isOpen, currentUserId]);

  const handleSend = async (conv) => {
    if (sendingTo || !entity) return;
    setSendingTo(conv.id);
    try {
      const insertRow = { conversation_id: conv.id };
      if (entity.kind === 'post') insertRow.shared_post_id = entity.id;
      else if (entity.kind === 'profile') insertRow.shared_profile_id = entity.id;
      else if (entity.kind === 'community') insertRow.shared_community_id = entity.id;
      const { error } = await supabase.from('messages').insert(insertRow);
      if (error) throw error;
      if (addToast) addToast('Sent!', 'success');
      onClose();
    } catch (err) {
      console.error('Share to chat failed', err);
      const detail = err?.message || err?.error_description || (err && JSON.stringify(err)) || '';
      if (addToast) addToast(`Could not send${detail ? ': ' + detail : ''}`, 'error');
    } finally {
      setSendingTo(null);
    }
  };

  const titleText = entity?.kind === 'profile'
    ? 'Send profile to chat'
    : entity?.kind === 'community'
      ? 'Send community to chat'
      : 'Send to chat';

  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal share-to-chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{titleText}</div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body share-to-chat-body">
          {loading ? (
            <div className="share-to-chat-empty">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="share-to-chat-empty">
              No conversations yet. Open Messages to start a chat first, then come back here.
            </div>
          ) : (
            <ul className="share-to-chat-list">
              {conversations.map(conv => {
                const otherParts = (conv.conversation_participants || []).filter(p => p.user_id !== currentUserId);
                const head = conv.is_group ? null : otherParts[0]?.profiles;
                return (
                  <li key={conv.id} className="share-to-chat-row">
                    {conv.is_group ? (
                      <div className="chat-avatar chat-avatar-group" style={{ width: 36, height: 36, fontSize: 14 }}>
                        {(conv.title || 'G').charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <ChatAvatar profile={head} size={36} />
                    )}
                    <span className="share-to-chat-name">
                      {getConversationTitle(conv, currentUserId)}
                    </span>
                    <button
                      className="share-to-chat-send"
                      disabled={sendingTo === conv.id}
                      onClick={() => handleSend(conv)}
                    >
                      {sendingTo === conv.id ? 'Sending…' : 'Send'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// IMAGE CROPPER COMPONENT
// ============================================
export const ImageCropper = ({ imageUrl, aspectRatio = 1, onCrop, onCancel, cropShape = 'circle' }) => {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

  // Calculate crop area size based on aspect ratio (Twitter standard dimensions)
  const getCropAreaSize = () => {
    if (cropShape === 'circle') {
      return { width: 200, height: 200 };
    }
    // Banner: 3:1 aspect ratio (Twitter standard: 1500x500)
    return { width: 336, height: 112 };
  };

  const cropArea = getCropAreaSize();

  const handleImageLoad = (e) => {
    const img = e.target;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setImageLoaded(true);
    // Calculate initial zoom to fit image in crop area
    const minZoom = Math.max(
      cropArea.width / img.naturalWidth,
      cropArea.height / img.naturalHeight
    );
    setZoom(Math.max(minZoom, minZoom * 1.02));
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.x;
    const newY = touch.clientY - dragStart.y;
    setPosition({ x: newX, y: newY });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleZoomChange = (e) => {
    setZoom(parseFloat(e.target.value));
  };

  const handleCrop = () => {
    if (!imageRef.current || !containerRef.current) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    // Set canvas size based on crop shape (Twitter standard dimensions)
    if (cropShape === 'circle') {
      canvas.width = 400;
      canvas.height = 400;
    } else {
      canvas.width = 1500;
      canvas.height = 500;
    }

    // Calculate the crop region
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerCenterX = containerRect.width / 2;
    const containerCenterY = containerRect.height / 2;

    // Image dimensions after zoom
    const scaledWidth = imageDimensions.width * zoom;
    const scaledHeight = imageDimensions.height * zoom;

    // Image position relative to container center
    const imgLeft = containerCenterX - scaledWidth / 2 + position.x;
    const imgTop = containerCenterY - scaledHeight / 2 + position.y;

    // Crop area position (centered in container)
    const cropLeft = containerCenterX - cropArea.width / 2;
    const cropTop = containerCenterY - cropArea.height / 2;

    // Calculate source rectangle in original image coordinates
    const srcX = ((cropLeft - imgLeft) / zoom);
    const srcY = ((cropTop - imgTop) / zoom);
    const srcWidth = cropArea.width / zoom;
    const srcHeight = cropArea.height / zoom;

    // Draw the cropped image
    ctx.drawImage(
      img,
      srcX, srcY, srcWidth, srcHeight,
      0, 0, canvas.width, canvas.height
    );

    // Convert to blob and return
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'cropped-image.jpg', { type: 'image/jpeg' });
        onCrop(file, URL.createObjectURL(blob));
      }
    }, 'image/jpeg', 0.85);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, []);

  return (
    <div className="image-cropper-overlay" onClick={onCancel}>
      <div className="image-cropper-modal" onClick={(e) => e.stopPropagation()}>
        <div className="image-cropper-header">
          <h3>Adjust Image</h3>
          <button className="image-cropper-close" onClick={onCancel}>×</button>
        </div>

        <div
          className="image-cropper-container"
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Crop preview"
            onLoad={handleImageLoad}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              opacity: imageLoaded ? 1 : 0
            }}
            draggable={false}
          />
          <div
            className={`image-cropper-overlay-mask ${cropShape}`}
            style={{
              '--crop-width': `${cropArea.width}px`,
              '--crop-height': `${cropArea.height}px`
            }}
          />
          <div
            className={`image-cropper-frame ${cropShape}`}
            style={{
              width: cropArea.width,
              height: cropArea.height
            }}
          />
        </div>

        <div className="image-cropper-controls">
          <div className="zoom-control">
            <ZoomOutIcon />
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={handleZoomChange}
              className="zoom-slider"
            />
            <ZoomInIcon />
          </div>
          <p className="zoom-hint">Drag to reposition • Use slider to zoom</p>
        </div>

        <div className="image-cropper-actions">
          <button className="cropper-cancel-btn" onClick={onCancel}>Cancel</button>
          <button className="cropper-apply-btn" onClick={handleCrop}>Apply</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// POST GRID COMPONENT
// Instagram-style image grid used by all feeds when feedViewMode === 'grid'.
// Filters to posts with images; hover overlay shows description + stats.
// ============================================
// Strip HTML tags + decode common entities for the grid hover preview.
// Descriptions in the DB can contain rich-text markup (spans, br, color styles)
// that should never leak into the plain-text overlay.
export const stripHtmlForPreview = (raw) => {
  if (!raw) return '';
  // Convert <br> and block tags to spaces so words don't run together.
  let text = String(raw).replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, ' ');
  // Drop all remaining tags.
  text = text.replace(/<[^>]*>/g, '');
  // Decode the handful of entities we actually see.
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Collapse runs of whitespace.
  return text.replace(/\s+/g, ' ').trim();
};

export const PostGrid = ({ posts, onOpenFullPost }) => {
  const withImages = (posts || []).filter(p => p && p.images && p.images.length > 0);
  if (withImages.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-text">No posts with images to show in grid view.</p>
      </div>
    );
  }
  return (
    <div className="profile-grid-view">
      {withImages.map(post => {
        const previewText = stripHtmlForPreview(post.description) || stripHtmlForPreview(post.title);
        return (
          <div
            key={post.id}
            className="profile-grid-item"
            onClick={() => onOpenFullPost && onOpenFullPost(post)}
          >
            <img src={post.images[0]} alt={post.title} loading="lazy" />
            <div className="profile-grid-overlay">
              {previewText && <p className="profile-grid-desc">{previewText}</p>}
              <div className="profile-grid-stats">
                <span className="profile-grid-stat"><HeartIcon filled={false} /> {post.likes_count || 0}</span>
                <span className="profile-grid-stat"><CommentIcon /> {post.comments_count || 0}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================
// SKILLS — user-attached AI artifacts
// ============================================
export const SKILL_TYPE_META = {
  chatgpt_gpt:  { label: 'ChatGPT Skill', color: '#10a37f',              text: '#fff' },
  claude_skill: { label: 'Claude Skill',  color: '#cc785c',              text: '#fff' },
  gemini_gem:   { label: 'Gemini Gem',    color: '#4285f4',              text: '#fff' },
  prompt:       { label: 'Prompt',        color: 'var(--accent-primary)', text: '#000' }
};

export const useSkill = async (skill, addToast) => {
  if (skill.platform_url) {
    window.open(skill.platform_url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (skill.prompt_content) {
    const ok = await copyToClipboard(skill.prompt_content);
    if (addToast) addToast(ok ? 'Prompt copied to clipboard!' : 'Copy failed', ok ? 'success' : 'error');
    return;
  }
  if (addToast) addToast('Nothing to use yet', 'error');
};

export const SkillCard = ({ skill, isOwner, onUse, onDelete, categories = [] }) => {
  const meta = SKILL_TYPE_META[skill.skill_type] || SKILL_TYPE_META.prompt;
  const useLabel = skill.platform_url ? 'Open' : 'Copy prompt';
  const categoryName = skill.category_id
    ? (categories.find(c => c.id === skill.category_id)?.name || null)
    : null;
  return (
    <div className="skill-card">
      <div className="skill-card-header">
        <div className="skill-card-badges">
          <span className="skill-type-badge" style={{ background: meta.color, color: meta.text }}>{meta.label}</span>
          {categoryName && <span className="skill-category-badge">{categoryName}</span>}
        </div>
        {isOwner && (
          <button
            className="skill-delete-btn"
            onClick={(e) => { e.stopPropagation(); onDelete && onDelete(skill); }}
            title="Delete skill"
            aria-label="Delete skill"
          >×</button>
        )}
      </div>
      <div className="skill-card-name">{skill.name}</div>
      {skill.description && <div className="skill-card-desc">{skill.description}</div>}
      <button className="skill-use-btn" onClick={() => onUse(skill)}>{useLabel}</button>
    </div>
  );
};

// Profile share button (copy link / send to chat) — moved verbatim from App.jsx
// during the profile component split (July 2026). No behavior change.
export const ProfileShareButton = ({ username, profileId, currentUserId }) => {
  const { addToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareToChatOpen, setShareToChatOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [menuOpen]);

  if (!username) return null;

  const handleCopyLink = async () => {
    setMenuOpen(false);
    const url = buildProfileShareUrl(username);
    if (navigator.share) {
      try { await navigator.share({ url }); return; }
      catch (err) { if (err?.name === 'AbortError') return; }
    }
    const ok = await copyToClipboard(url);
    addToast(ok ? 'Profile link copied!' : `Copy failed — ${url}`, ok ? 'success' : 'error');
  };

  const handleSendToChat = () => {
    setMenuOpen(false);
    if (!currentUserId) {
      if (addToast) addToast('Sign in to send to a friend', 'error');
      return;
    }
    setShareToChatOpen(true);
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className="profile-action-btn share-btn"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        onClick={() => setMenuOpen(o => !o)}
        title="Share profile"
      >
        <ShareIcon />
        Share
      </button>
      {menuOpen && (
        <div className="profile-share-menu">
          <button className="profile-share-menu-item" onClick={handleCopyLink}>
            <ShareIcon /> Copy link
          </button>
          {profileId && currentUserId && profileId !== currentUserId && (
            <button className="profile-share-menu-item" onClick={handleSendToChat}>
              <MessageIcon /> Send to a friend
            </button>
          )}
        </div>
      )}
      <ShareToChatModal
        isOpen={shareToChatOpen}
        onClose={() => setShareToChatOpen(false)}
        entity={profileId ? { kind: 'profile', id: profileId } : null}
        currentUserId={currentUserId}
      />
    </div>
  );
};
