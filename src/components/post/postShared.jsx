// Components and helpers shared by the post experience (PostCard, FullPostView,
// CreatePostModal) — extracted verbatim from App.jsx during the post-experience
// component split (July 2026). No behavior change.
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAuth, useToast, buildPostShareUrl } from '../../lib/appShared.js';
import { uploadPostImage } from '../../lib/storage.js';
import { looksLikeHtml } from '../../lib/sanitize.js';
import { advisorMentionsIn, fetchAdvisorQuota } from '../../lib/advisorQuota.js';
import { reportContent, REPORT_REASONS } from '../../lib/moderation.js';
import { RichText } from '../../lib/richText.jsx';
import { EmbeddedLink, safeHttpUrl, LINKIFY_RE } from '../EmbeddedLink.jsx';

export const COMMENT_EMOJIS = [
  '😀', '😂', '🥲', '😊', '😍', '🤩', '😎', '🤔',
  '😅', '😭', '😡', '🥳', '😴', '🤯', '🙃', '😬',
  '👍', '👎', '👏', '🙌', '🙏', '👀', '💪', '🤝',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '🔥', '✨', '⭐', '💯', '🎉', '🎊', '🚀', '⚡',
  '💡', '🧠', '👨‍💻', '👩‍💻', '🤖', '🛠️', '📌', '✅',
];

// ============================================
// @MENTION HELPER
// ============================================
// Comment body renderer. Comments are stored in `comments.content` as either
// plain text (legacy / Enter-only users) or sanitized HTML with B/I/U/color
// from the new CommentEditor. We branch on the content shape:
//   - HTML-shaped → render through RichText, whose HTML branch re-sanitizes
//     defensively then rebuilds the DOM as React — this is what turns typed
//     markdown links / bare URLs / @mentions inside formatted comments into
//     live EmbeddedLink / mention components (a dangerouslySetInnerHTML blob
//     can't carry the hover-to-reveal-URL affordance).
//   - Plaintext → use the existing MentionText so @mentions and bare URLs
//     keep auto-linking the same way they always did (no **bold** parsing —
//     old plaintext comments keep their literal asterisks).
export const CommentContent = ({ text, onUserClick, className = '' }) => {
  if (!text) return null;
  if (looksLikeHtml(text)) {
    return (
      <span className={className}>
        <RichText text={text} onUserClick={onUserClick} />
      </span>
    );
  }
  return <MentionText text={text} onUserClick={onUserClick} />;
};

// Upload an optional comment/reply image (Pro perk) to the public post-images
// bucket. Returns the public URL, or null on failure so the caller can post the
// comment without the image rather than blocking on it. The Pro entitlement is
// enforced server-side by the enforce_comment_image_pro trigger regardless.
export const uploadCommentImage = async (img, userId) => {
  if (!img?.file || !userId) return null;
  try {
    const { url, error } = await uploadPostImage(supabase, img.file, userId);
    return error ? null : (url || null);
  } catch { return null; }
};

// Small image attached under a comment/reply. Click opens the full image.
export const CommentImage = ({ url }) => {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="comment-attached-image-link">
      <img src={url} alt="comment attachment" className="comment-attached-image" loading="lazy" />
    </a>
  );
};

export const MentionText = ({ text, onUserClick }) => {
  if (!text) return null;

  // Combined regex (shared with richText.jsx via EmbeddedLink.jsx): markdown
  // links [label](https://url) → groups 1+2, bare URLs → group 3, @mentions →
  // groups 4+5. Links render as EmbeddedLink (hover reveals the real URL,
  // click-to-load preview); URLs that fail safeHttpUrl stay plain text.
  const combinedRegex = new RegExp(LINKIFY_RE.source, 'g');
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2] !== undefined) {
      // Markdown link — label shown, destination revealed on hover.
      const href = safeHttpUrl(match[2]);
      if (href) {
        parts.push(
          <EmbeddedLink key={`link-${match.index}`} href={href}>{match[1]}</EmbeddedLink>
        );
      } else {
        parts.push(match[0]);
      }
    } else if (match[3]) {
      // Bare URL match
      const href = safeHttpUrl(match[3]);
      if (href) {
        parts.push(
          <EmbeddedLink key={`link-${match.index}`} href={href}>{match[3]}</EmbeddedLink>
        );
      } else {
        parts.push(match[3]);
      }
    } else if (match[4] && onUserClick) {
      // @mention match
      const username = match[5];
      parts.push(
        <span
          key={`mention-${match.index}`}
          className="mention-link"
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            try {
              const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', username)
                .single();
              if (data?.id) {
                onUserClick(data.id);
              }
            } catch (err) {
              // Username not found, do nothing
            }
          }}
        >
          @{username}
        </span>
      );
    } else if (match[4]) {
      // @mention but no onUserClick handler - render as plain text
      parts.push(match[4]);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 0) return text;
  return <>{parts}</>;
};

// ============================================
// AI Advisor mention hint — shows under the comment composer when the draft
// @mentions an advisor (claude/chatgpt/grok) but the user can't get a reply
// (not Pro, or out of their rolling reply allowance). Self-contained: fetches
// the caller's own quota from advisor_quota_self() only when a mention appears.
// ============================================
export const AdvisorMentionHint = ({ text }) => {
  const mentions = advisorMentionsIn(text);
  const count = mentions.length;
  const key = mentions.join(',');
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    let active = true;
    if (count === 0) { setQuota(null); return; }
    fetchAdvisorQuota().then((q) => { if (active) setQuota(q); }).catch(() => {});
    return () => { active = false; };
  }, [count, key]);

  if (count === 0 || !quota || !quota.signed_in || !quota.enabled) return null;

  // Render the tagged advisors, e.g. "@claude, @grok & @chatgpt".
  const names = mentions.map((m) => `@${m}`);
  const nameList = names.length === 1 ? names[0]
    : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  const plural = count > 1;

  let body = null;
  let ok = false;
  if (!quota.is_pro) {
    body = <>✨ <strong>{nameList}</strong> {plural ? 'reply' : 'replies'} only for <strong>Prompted Pro</strong> members — upgrade to summon AI advisors.</>;
  } else if (quota.remaining <= 0) {
    const resets = quota.resets_at ? new Date(quota.resets_at) : null;
    const when = resets ? resets.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'soon';
    body = <>You've used all <strong>{quota.cap}</strong> advisor replies for now — a slot frees up <strong>{when}</strong>.</>;
  } else if (count > quota.remaining) {
    // Tagged more advisors than they have replies left.
    body = <>You tagged <strong>{count}</strong> advisors but only have <strong>{quota.remaining}</strong> {quota.remaining === 1 ? 'reply' : 'replies'} left — only the first {quota.remaining} will answer.</>;
  } else {
    ok = true;
    body = <>✨ <strong>{nameList}</strong> will reply after you post · uses <strong>{count}</strong> of your {quota.remaining} remaining {quota.remaining === 1 ? 'reply' : 'replies'}.</>;
  }

  return (
    <div style={{
      fontSize: '0.78rem', lineHeight: 1.4, marginTop: '0.4rem', padding: '0.5rem 0.7rem',
      borderRadius: 8, border: `1px solid ${ok ? 'rgba(78,205,196,0.4)' : 'rgba(217,119,87,0.5)'}`,
      background: ok ? 'rgba(78,205,196,0.08)' : 'rgba(217,119,87,0.08)',
      color: 'var(--text-secondary, #94a3b8)',
    }}>
      {body}
    </div>
  );
};

// Repost — share an existing post as a new post with its link prefilled.
// Uses a window event so the button works from any of PostCard's many mount
// points without threading a prop through every call site. (buildPostShareUrl
// is defined above near the other share helpers.)
export const dispatchRepost = (post) => {
  window.dispatchEvent(new CustomEvent('prompted:repost', {
    detail: { id: post?.id, url: buildPostShareUrl(post), title: post?.title || '' },
  }));
};

// Refresh icon (per request) used for the Repost action.
export const RepostIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M21 21v-5h-5" />
  </svg>
);

// ============================================
// REPORT MODAL COMPONENT
// ============================================
export const ReportModal = ({ isOpen, onClose, contentType, contentId, userId, supabase }) => {
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleReport = async (reason) => {
    if (!userId) {
      addToast('You must be logged in to report content', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await reportContent(supabase, {
        reporterId: userId,
        contentType,
        contentId,
        reason
      });
      addToast('Report submitted. Thank you!', 'success');
      onClose();
    } catch (err) {
      addToast(err.message || 'Failed to submit report', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Report {contentType}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: '1rem' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>Why are you reporting this {contentType}?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {REPORT_REASONS.map(reason => (
              <button
                key={reason}
                className="report-reason-btn"
                onClick={() => handleReport(reason)}
                disabled={submitting}
                style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  textTransform: 'capitalize',
                  fontSize: '0.9rem',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.target.style.background = 'var(--bg-secondary)'}
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// REPOST BUTTON
// ============================================
// Counter-only re-share (the "retweet"): toggles a row in the reposts table via
// the toggle_repost RPC and reflects post.repost_count. The original then shows
// on the reposter's profile (get_user_posts_with_reposts). Feed cards stay cheap
// — they don't look up has_user_reposted on mount; pass fetchStatus on a single
// post view (FullPostView) where one lookup is fine.
export const RepostButton = ({ post, onAuthRequired, className = 'action-btn-mobile', size = 18, fetchStatus = false }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [reposted, setReposted] = useState(false);
  const [count, setCount] = useState(post?.repost_count || 0);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => { setCount(post?.repost_count || 0); }, [post?.repost_count]);

  useEffect(() => {
    if (!fetchStatus || !user?.id || !post?.id) return;
    let cancelled = false;
    supabase.rpc('has_user_reposted', { check_user_id: user.id, check_post_id: post.id })
      .then(({ data, error }) => { if (!cancelled && !error) setReposted(!!data); });
    return () => { cancelled = true; };
  }, [fetchStatus, user?.id, post?.id]);

  // Close the Repost/Quote menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  // Counter-only re-share (the "retweet"): toggles a reposts row + count.
  const doToggleRepost = async () => {
    setMenuOpen(false);
    if (busy) return;
    setBusy(true);
    const base = count;
    const next = !reposted;
    setReposted(next);
    setCount(Math.max(0, base + (next ? 1 : -1)));
    const { data, error } = await supabase.rpc('toggle_repost', { target_post_id: post.id });
    setBusy(false);
    if (error || !data?.success) {
      setReposted(!next);
      setCount(base);
      addToast && addToast(error?.message || data?.error || 'Could not repost.', 'error');
      return;
    }
    // Reconcile against server truth (covers a stale initial state).
    const finalReposted = !!data.reposted;
    setReposted(finalReposted);
    setCount(Math.max(0, base + (finalReposted ? 1 : -1)));
    addToast && addToast(finalReposted ? 'Reposted to your profile.' : 'Repost removed.', 'success');
    // Let the profile views refresh their Reposts tab without a full reload.
    window.dispatchEvent(new CustomEvent('prompted:reposted', {
      detail: { postId: post.id, reposted: finalReposted },
    }));
  };

  // Quote: open the compose modal embedding this post so you can add your own
  // take above it (fork_type='repost', renders "Reposted from @user").
  const doQuote = () => {
    setMenuOpen(false);
    dispatchRepost(post);
  };

  const onClick = (e) => {
    e.stopPropagation();
    if (!user) { onAuthRequired && onAuthRequired(); return; }
    setMenuOpen(o => !o);
  };

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className={`${className}${reposted ? ' reposted' : ''}`}
        onClick={onClick}
        title="Repost"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-pressed={reposted}
      >
        <RepostIcon size={size} />
        {count > 0 && <span>{count}</span>}
      </button>
      {menuOpen && (
        <div role="menu" onClick={(e) => e.stopPropagation()} style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 9999, minWidth: 170,
          background: 'var(--bg-secondary, #15171c)', border: '1px solid var(--border-color, #2a2f3a)',
          borderRadius: 10, padding: 4, boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <button role="menuitem" onClick={doToggleRepost} disabled={busy} style={{
            textAlign: 'left', padding: '8px 12px', borderRadius: 7, border: 'none',
            cursor: busy ? 'default' : 'pointer', background: 'transparent',
            color: reposted ? '#1a9c52' : 'var(--text-primary, #e2e8f0)', fontSize: 13, fontWeight: 600,
          }}>
            {reposted ? 'Undo repost' : 'Repost'}
          </button>
          <button role="menuitem" onClick={doQuote} style={{
            textAlign: 'left', padding: '8px 12px', borderRadius: 7, border: 'none',
            cursor: 'pointer', background: 'transparent',
            color: 'var(--text-primary, #e2e8f0)', fontSize: 13, fontWeight: 600,
          }}>
            Quote post
          </button>
        </div>
      )}
    </span>
  );
};

// ============================================
// POLL WIDGET
// ============================================
// Renders an interactive poll for any post whose poll_options is a non-empty
// jsonb array of { id, text }. Counts are hidden until the viewer votes (Twitter
// style); results then show as percentage bars. Voting and reads both go through
// SECURITY DEFINER RPCs (vote_on_poll / get_poll_results) — see migration
// 20260620000003_poll_posts.sql.
export const PollWidget = ({ post, onAuthRequired }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const options = Array.isArray(post?.poll_options) ? post.poll_options : [];
  const [results, setResults] = useState(null); // { total, counts: {id:n}, my_vote }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!post?.id || options.length === 0) return;
    supabase.rpc('get_poll_results', { p_post_id: post.id }).then(({ data, error }) => {
      if (!cancelled && !error && data) setResults(data);
    });
    return () => { cancelled = true; };
  }, [post?.id]);

  if (options.length === 0) return null;

  const myVote = results?.my_vote || null;
  const hasVoted = !!myVote;
  const total = results?.total || 0;
  const counts = results?.counts || {};

  const castVote = async (optionId) => {
    if (!user) { onAuthRequired && onAuthRequired(); return; }
    if (busy || optionId === myVote) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('vote_on_poll', { p_post_id: post.id, p_option_id: optionId });
    setBusy(false);
    if (error) { addToast(error.message || 'Could not record your vote.', 'error'); return; }
    if (data) setResults(data);
  };

  return (
    <div className="poll-widget" onClick={(e) => e.stopPropagation()}>
      <div className="poll-widget-head">📊 Poll</div>
      <div className="poll-widget-options">
        {options.map((opt) => {
          const n = counts[opt.id] || 0;
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          const mine = opt.id === myVote;
          return (
            <button
              key={opt.id}
              type="button"
              className={`poll-option ${hasVoted ? 'voted' : ''} ${mine ? 'mine' : ''}`}
              onClick={() => castVote(opt.id)}
              disabled={busy}
              aria-pressed={mine}
            >
              {hasVoted && <span className="poll-option-fill" style={{ width: `${pct}%` }} />}
              <span className="poll-option-label">
                {mine && <span className="poll-option-check">✓</span>}
                {opt.text}
              </span>
              {hasVoted && <span className="poll-option-pct">{pct}%</span>}
            </button>
          );
        })}
      </div>
      <div className="poll-widget-foot">
        {total} {total === 1 ? 'vote' : 'votes'}
        {!hasVoted && <span className="poll-widget-hint"> · tap an option to vote</span>}
      </div>
    </div>
  );
};
