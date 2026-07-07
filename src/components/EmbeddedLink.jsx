// EmbeddedLink — the one anchor component for user-authored links in post
// descriptions and comments (markdown `[text](url)` links, bare URLs, and
// editor-authored <a> tags routed through richText's HTML walker).
//
// Safety model (anti-phishing first):
//   - Only http:/https: URLs ever become links; everything else (javascript:,
//     data:, vbscript:, …) renders as plain text. Validation goes through
//     `new URL()` — no regex-only trust.
//   - Hovering the link (~150ms delay) opens a dark tooltip showing the FULL
//     destination URL before any preview, so display text can't hide where a
//     link really goes. Long URLs are middle-truncated (start + end visible)
//     with the complete value in the title attribute.
//   - The optional page preview is CLICK-TO-LOAD only (a "Preview" button in
//     the tooltip) and https-only, inside an iframe with
//     sandbox="allow-scripts allow-popups" (never allow-same-origin — that
//     combination allows sandbox escape) and referrerPolicy="no-referrer".
//   - All anchors get target="_blank" rel="noopener noreferrer nofollow ugc".
//
// No-hover devices: the first tap opens the tooltip instead of navigating;
// navigation happens from the "open in new tab" link inside it.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const LINK_REL = 'noopener noreferrer nofollow ugc';

// Combined tokenizer for user text, shared by richText.jsx and postShared.jsx
// so both post descriptions and comments parse identically. Alternatives, in
// priority order (earlier wins at the same position):
//   groups 1+2 — markdown link  [label](https://url)
//   group  3   — bare URL       https://…
//   groups 4+5 — @mention       @username
// Conservative on purpose: the markdown-link URL must itself be http(s), so
// `[x](javascript:…)` never even tokenizes as a link.
export const LINKIFY_RE =
  /\[([^\]\n]+?)\]\((https?:\/\/[^\s()<>]+)\)|(https?:\/\/[^\s<>"')\]]+)|(@(\w+))/g;

// Parse with `new URL()`; only http:/https: survive. Returns the normalized
// href string, or null for anything unparseable or on another scheme.
export function safeHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u.href;
}

// Truncate in the middle so both the origin AND the path tail stay visible —
// the two parts phishers most like to hide.
export function middleTruncate(str, max = 72) {
  if (!str || str.length <= max) return str;
  const head = Math.ceil((max - 1) * 0.6);
  const tail = max - 1 - head;
  return `${str.slice(0, head)}…${str.slice(str.length - tail)}`;
}

const HOVER_OPEN_DELAY = 150;
const HOVER_CLOSE_GRACE = 160; // lets the pointer cross the gap into the tooltip
const TOOLTIP_WIDTH = 380;

export const EmbeddedLink = ({ href, children }) => {
  const safe = safeHttpUrl(href);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { left, top?, bottom? } in viewport px
  const [showPreview, setShowPreview] = useState(false);
  const anchorRef = useRef(null);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);

  const clearTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  const openNow = () => {
    clearTimers();
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(TOOLTIP_WIDTH, vw - 16);
    const left = Math.max(8, Math.min(rect.left, vw - width - 8));
    // Place below unless the space there is tight AND there's more room above.
    const spaceBelow = vh - rect.bottom;
    const placeBelow = spaceBelow >= 340 || spaceBelow >= rect.top;
    setPos(placeBelow
      ? { left, width, top: rect.bottom + 6 }
      : { left, width, bottom: vh - rect.top + 6 });
    setOpen(true);
  };

  const close = () => {
    clearTimers();
    setOpen(false);
    setShowPreview(false); // preview never persists across hovers
  };

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(close, HOVER_CLOSE_GRACE);
  };

  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  // Escape closes; any scroll closes (the tooltip is fixed-position and would
  // otherwise drift away from its link).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onScroll = () => close();
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => clearTimers, []);

  // Reject unsafe/unparseable hrefs entirely — the text stays text.
  if (!safe) return <>{children}</>;

  const canPreview = safe.startsWith('https:'); // iframe sources are https-only

  const onAnchorClick = (e) => {
    e.stopPropagation(); // cards/rows have their own click handlers
    // No hover available (touch): first tap opens the URL-reveal tooltip and
    // does NOT navigate; the tooltip's "open in new tab" link navigates.
    const noHover = typeof window.matchMedia === 'function' &&
      !window.matchMedia('(hover: hover)').matches;
    if (noHover && !open) {
      e.preventDefault();
      openNow();
    }
  };

  const tooltip = open && pos ? createPortal(
    <div
      role="tooltip"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        bottom: pos.bottom,
        width: pos.width,
        zIndex: 10000,
        background: 'var(--bg-secondary, #15171c)',
        border: '1px solid var(--border-color, #2a2f3a)',
        borderRadius: 10,
        padding: '10px 12px',
        boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
        color: 'var(--text-primary, #e2e8f0)',
        fontSize: 12,
        lineHeight: 1.4,
        boxSizing: 'border-box',
      }}
    >
      {/* Full destination URL — always shown before/without any preview. */}
      <div
        title={safe}
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          color: '#4ECDC4',
          wordBreak: 'break-all',
          marginBottom: 8,
        }}
      >
        {middleTruncate(safe)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {canPreview && !showPreview && (
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            style={{
              padding: '4px 10px',
              borderRadius: 7,
              border: '1px solid var(--border-color, #2a2f3a)',
              background: 'rgba(78,205,196,0.12)',
              color: '#4ECDC4',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Preview
          </button>
        )}
        <a
          href={safe}
          target="_blank"
          rel={LINK_REL}
          style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 12, textDecoration: 'underline' }}
        >
          open in new tab ↗
        </a>
      </div>
      {showPreview && canPreview && (
        <div style={{ marginTop: 8 }}>
          <iframe
            src={safe}
            title={`Preview of ${safe}`}
            sandbox="allow-scripts allow-popups"
            referrerPolicy="no-referrer"
            loading="lazy"
            style={{
              width: '100%',
              maxWidth: 360,
              height: 240,
              border: '1px solid var(--border-color, #2a2f3a)',
              borderRadius: 8,
              background: '#fff',
              display: 'block',
            }}
          />
          <div style={{ marginTop: 6, color: 'var(--text-muted, #64748b)', fontSize: 11 }}>
            Preview may be blank if the site blocks embedding —{' '}
            <a href={safe} target="_blank" rel={LINK_REL} style={{ color: 'inherit', textDecoration: 'underline' }}>
              open in new tab ↗
            </a>
          </div>
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <a
        ref={anchorRef}
        href={safe}
        target="_blank"
        rel={LINK_REL}
        className="post-inline-link"
        onClick={onAnchorClick}
        onMouseEnter={() => {
          cancelClose();
          if (!open && !openTimer.current) openTimer.current = setTimeout(openNow, HOVER_OPEN_DELAY);
        }}
        onMouseLeave={() => {
          if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
          scheduleClose();
        }}
      >
        {children}
      </a>
      {tooltip}
    </>
  );
};
