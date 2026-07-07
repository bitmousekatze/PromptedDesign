import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { moderateContent } from '../lib/moderation.js';
import { sanitizeHtml } from '../lib/sanitize.js';
import CommentEditor from './CommentEditor.jsx';
import { CommentContent } from './post/postShared.jsx';
import { formatTimeAgo } from '../lib/appShared.js';

// Inline comment thread for the Lounge. Same "reply to a post" experience the
// full post view offers (fetch → list → rich composer → replies → likes), but
// mounted right under a meme card so tapping "comments" never navigates away.
// Formatting comes for free from CommentEditor (bold / italic / underline /
// color / emoji) and renders through the shared CommentContent renderer.

const htmlToPlain = (html) => (html || '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();

export default function LoungeComments({ postId, currentUser, onRequireAuth, onUserClick, onCountChange }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [likeCounts, setLikeCounts] = useState({}); // commentId -> count
  const [myLikes, setMyLikes] = useState(new Set()); // commentIds I've liked

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // top-level comment id being replied to
  const [replyDraft, setReplyDraft] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('comments')
      .select('*, profiles(username, display_name, avatar_url, name_color)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) { console.error('LoungeComments load', error); setLoading(false); return; }
    const rows = data || [];
    setComments(rows);

    const ids = rows.map(c => c.id);
    const counts = {};
    let mine = new Set();
    if (ids.length) {
      const { data: likeRows } = await supabase.from('comment_likes').select('comment_id, user_id').in('comment_id', ids);
      (likeRows || []).forEach(r => {
        counts[r.comment_id] = (counts[r.comment_id] || 0) + 1;
        if (currentUser?.id && r.user_id === currentUser.id) mine.add(r.comment_id);
      });
    }
    setLikeCounts(counts);
    setMyLikes(mine);
    setLoading(false);
  }, [postId, currentUser?.id]);

  useEffect(() => { load(); }, [load]);

  const topLevel = useMemo(() => comments.filter(c => !c.parent_comment_id), [comments]);
  const repliesOf = useCallback(
    (id) => comments.filter(c => c.parent_comment_id === id),
    [comments],
  );

  const insertComment = async (rawHtml, parentId) => {
    const plain = htmlToPlain(rawHtml);
    if (!plain) return false;
    const mod = await moderateContent(plain).catch(() => ({ approved: true }));
    if (!mod.approved) { throw new Error(mod.reason || 'That comment was not approved by moderation.'); }
    const { error } = await supabase.from('comments').insert({
      user_id: currentUser.id,
      post_id: postId,
      content: sanitizeHtml(rawHtml),
      parent_comment_id: parentId || null,
    });
    if (error) throw error;
    return true;
  };

  const submitTop = async () => {
    if (!currentUser?.id) { onRequireAuth?.(); return; }
    if (submitting || !htmlToPlain(draft)) return;
    setSubmitting(true);
    try {
      const ok = await insertComment(draft, null);
      if (ok) { setDraft(''); await load(); onCountChange?.(1); }
    } catch (e) {
      console.error('Lounge comment', e);
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async (parentId) => {
    if (!currentUser?.id) { onRequireAuth?.(); return; }
    if (replySubmitting || !htmlToPlain(replyDraft)) return;
    setReplySubmitting(true);
    try {
      const ok = await insertComment(replyDraft, parentId);
      if (ok) { setReplyDraft(''); setReplyTo(null); await load(); onCountChange?.(1); }
    } catch (e) {
      console.error('Lounge reply', e);
    } finally {
      setReplySubmitting(false);
    }
  };

  const toggleLike = async (commentId) => {
    if (!currentUser?.id) { onRequireAuth?.(); return; }
    const liked = myLikes.has(commentId);
    // Optimistic
    setMyLikes(prev => {
      const next = new Set(prev);
      if (liked) next.delete(commentId); else next.add(commentId);
      return next;
    });
    setLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 0) + (liked ? -1 : 1)) }));
    try {
      if (liked) await supabase.from('comment_likes').delete().eq('user_id', currentUser.id).eq('comment_id', commentId);
      else await supabase.from('comment_likes').insert({ user_id: currentUser.id, comment_id: commentId });
    } catch {
      // Revert on failure
      setMyLikes(prev => {
        const next = new Set(prev);
        if (liked) next.add(commentId); else next.delete(commentId);
        return next;
      });
      setLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 0) + (liked ? 1 : -1)) }));
    }
  };

  const renderComment = (c, isReply = false) => {
    const author = c.profiles || {};
    const liked = myLikes.has(c.id);
    return (
      <div key={c.id} style={isReply ? replyRowStyle : commentRowStyle}>
        <button type="button" style={avatarBtnStyle} onClick={() => author.username && onUserClick?.(c.user_id)} aria-label="View profile">
          {author.avatar_url
            ? <img src={author.avatar_url} alt="" style={avatarStyle} />
            : <span style={avatarFallbackStyle}>{(author.display_name || author.username || '?')[0]?.toUpperCase()}</span>}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={metaRowStyle}>
            <span style={{ ...nameStyle, color: author.name_color || '#e7ebf0' }}
              onClick={() => author.username && onUserClick?.(c.user_id)}>
              @{author.username || 'builder'}
            </span>
            <span style={timeStyle}>{formatTimeAgo(c.created_at)}</span>
          </div>
          <div style={bodyStyle}><CommentContent text={c.content} onUserClick={onUserClick} /></div>
          <div style={actionsStyle}>
            <button type="button" style={{ ...actionBtnStyle, color: liked ? '#ff3b5c' : '#7c8696' }} onClick={() => toggleLike(c.id)}>
              {liked ? '♥' : '♡'} {likeCounts[c.id] || 0}
            </button>
            {!isReply && (
              <button type="button" style={actionBtnStyle}
                onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyDraft(''); }}>
                Reply
              </button>
            )}
          </div>

          {!isReply && replyTo === c.id && (
            <div style={{ marginTop: 8 }}>
              <CommentEditor
                value={replyDraft}
                onChange={setReplyDraft}
                onSubmit={() => submitReply(c.id)}
                placeholder={`Reply to @${author.username || 'builder'}…`}
                className="lounge-comment-input"
              />
              <div style={composerActionsStyle}>
                <button type="button" style={ghostBtnStyle} onClick={() => { setReplyTo(null); setReplyDraft(''); }}>Cancel</button>
                <button type="button" style={{ ...sendBtnStyle, opacity: (replySubmitting || !htmlToPlain(replyDraft)) ? 0.5 : 1 }}
                  disabled={replySubmitting || !htmlToPlain(replyDraft)} onClick={() => submitReply(c.id)}>
                  {replySubmitting ? 'Replying…' : 'Reply'}
                </button>
              </div>
            </div>
          )}

          {!isReply && repliesOf(c.id).map(r => renderComment(r, true))}
        </div>
      </div>
    );
  };

  return (
    <div style={wrapStyle}>
      {/* Top-level composer */}
      {currentUser ? (
        <div style={composerStyle}>
          <CommentEditor
            value={draft}
            onChange={setDraft}
            onSubmit={submitTop}
            placeholder="Add a reply…"
            className="lounge-comment-input"
          />
          <div style={composerActionsStyle}>
            <button type="button" style={{ ...sendBtnStyle, opacity: (submitting || !htmlToPlain(draft)) ? 0.5 : 1 }}
              disabled={submitting || !htmlToPlain(draft)} onClick={submitTop}>
              {submitting ? 'Posting…' : 'Reply'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" style={signInBtnStyle} onClick={() => onRequireAuth?.()}>Sign in to reply</button>
      )}

      {/* Thread */}
      {loading ? (
        <div style={mutedStyle}>Loading replies…</div>
      ) : topLevel.length === 0 ? (
        <div style={mutedStyle}>No replies yet — start the thread.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          {topLevel.map(c => renderComment(c, false))}
        </div>
      )}
    </div>
  );
}

// ---- Styles ---------------------------------------------------------
const wrapStyle = { marginTop: 12, borderTop: '1px solid #1c2027', paddingTop: 12 };
const composerStyle = { display: 'flex', flexDirection: 'column', gap: 8 };
const composerActionsStyle = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 };
const sendBtnStyle = {
  background: 'var(--accent-primary, #4ECDC4)', color: '#04201d', border: 'none', borderRadius: 999,
  padding: '7px 18px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer',
};
const ghostBtnStyle = {
  background: 'transparent', border: '1px solid #262b34', color: '#9aa4b2', borderRadius: 999,
  padding: '7px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
};
const signInBtnStyle = {
  background: 'transparent', border: '1px solid #262b34', color: '#cbd5e1', borderRadius: 10,
  padding: '10px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%',
};
const commentRowStyle = { display: 'flex', gap: 10, alignItems: 'flex-start' };
const replyRowStyle = { display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, paddingLeft: 6, borderLeft: '2px solid #1c2027' };
const avatarBtnStyle = { padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 };
const avatarStyle = { width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', display: 'block' };
const avatarFallbackStyle = {
  width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: '#2a2f3a', color: '#cbd5e1', fontWeight: 700, fontSize: 13,
};
const metaRowStyle = { display: 'flex', alignItems: 'center', gap: 8 };
const nameStyle = { fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };
const timeStyle = { color: '#6b7480', fontSize: 12 };
const bodyStyle = { color: '#e7ebf0', fontSize: 14.5, lineHeight: 1.45, marginTop: 2, wordBreak: 'break-word' };
const actionsStyle = { display: 'flex', gap: 16, marginTop: 6 };
const actionBtnStyle = { background: 'transparent', border: 'none', color: '#7c8696', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 };
const mutedStyle = { color: '#7c8696', fontSize: 13.5, padding: '14px 2px' };

// Editor surface styling (matches the Lounge caption editor look).
if (typeof document !== 'undefined' && !document.getElementById('lounge-comment-styles')) {
  const tag = document.createElement('style');
  tag.id = 'lounge-comment-styles';
  tag.textContent = `
    .lounge-comment-input {
      background: #0e1014; border: 1px solid #262b34; border-radius: 12px; color: #fff;
      font-size: 14.5px; min-height: 44px; max-height: 220px; overflow-y: auto;
    }
    .lounge-comment-input:focus { border-color: #3a4150; }
  `;
  document.head.appendChild(tag);
}
