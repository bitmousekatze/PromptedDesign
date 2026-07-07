import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { uploadMultiplePostImages } from '../lib/storage.js';
import { moderateContent } from '../lib/moderation.js';
import { isEmbeddable } from '../lib/tweets.js';
import SocialEmbed from '../components/SocialEmbed.jsx';
import CommentEditor from '../components/CommentEditor.jsx';
import LoungeChat from '../components/LoungeChat.jsx';
import LoungeComments from '../components/LoungeComments.jsx';
import { sanitizeHtml, looksLikeHtml } from '../lib/sanitize.js';

// Box styling for the Lounge caption editor (CommentEditor applies this class to
// its editable surface; the toolbar styles ship with the component).
if (typeof document !== 'undefined' && !document.getElementById('lounge-styles')) {
  const tag = document.createElement('style');
  tag.id = 'lounge-styles';
  tag.textContent = `
    .lounge-caption-input {
      background: #0e1014; border: 1px solid #262b34; border-radius: 12px; color: #fff;
      font-size: 15px; min-height: 56px; overflow-y: auto; flex: 1;
    }
    .lounge-caption-input:focus { border-color: #3a4150; }
    /* Let the caption editor grow to fill the composer so it matches the chat height. */
    .lounge-caption-input-wrap { flex: 1; min-height: 0; }
  `;
  document.head.appendChild(tag);
}

// Strip tags/entities to get plain text from the rich caption (for moderation,
// the required NOT NULL title, and emptiness checks).
const htmlToPlain = (html) => (html || '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();

// Memes — the AI shitpost / meme tab. Memes are ordinary `posts` rows with
// post_type='meme' (so they get likes / comments / reposts for free), kept out
// of the main feed and shown only here. A meme can carry an image, an embedded
// X (Twitter) tweet, a caption, or any mix. Vertical card feed (one per row).

const FETCH_LIMIT = 60;

export default function MemesPage({ currentUser, profile, isAdmin = false, onUserClick, onBack, onOpenMenu, onRequireAuth, addToast }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [loungeView, setLoungeView] = useState('feed'); // 'feed' | 'reels'
  // Below this width the composer + chat stack and we don't pin a tall sticky
  // bar (it would eat the viewport); chat becomes a floating button instead.
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toast = useCallback((msg, type) => {
    if (addToast) addToast(msg, type);
    else if (type === 'error') console.warn(msg);
  }, [addToast]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('posts')
      .select('id, title, description, images, tweet_url, comment_count, created_at, user_id, profiles:user_id (username, avatar_url, display_name, is_suspended)')
      .eq('post_type', 'meme')
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT);
    if (error) { console.error('MemesPage load', error); setLoading(false); return; }

    // Drop posts from suspended (soft-removed) accounts.
    const rows = (data || []).filter(p => !p.profiles?.is_suspended);
    const ids = rows.map(p => p.id);
    const likeMap = {};
    let likedSet = new Set();
    if (ids.length) {
      const { data: likeRows } = await supabase.from('likes').select('post_id').in('post_id', ids);
      (likeRows || []).forEach(r => { likeMap[r.post_id] = (likeMap[r.post_id] || 0) + 1; });
      if (currentUser?.id) {
        const { data: mine } = await supabase.from('likes').select('post_id').eq('user_id', currentUser.id).in('post_id', ids);
        likedSet = new Set((mine || []).map(r => r.post_id));
      }
    }
    setPosts(rows.map(p => ({ ...p, _likes: likeMap[p.id] || 0, _liked: likedSet.has(p.id) })));
    setLoading(false);
  }, [currentUser?.id]);

  useEffect(() => { load(); }, [load]);

  // Optimistic like toggle — same shape as VideosPage.
  const toggleLike = useCallback(async (post) => {
    if (!currentUser?.id) { onRequireAuth?.(); return; }
    const liked = post._liked;
    setPosts(prev => prev.map(p => p.id === post.id
      ? { ...p, _liked: !liked, _likes: Math.max(0, (p._likes || 0) + (liked ? -1 : 1)) } : p));
    try {
      if (liked) await supabase.from('likes').delete().eq('user_id', currentUser.id).eq('post_id', post.id);
      else await supabase.from('likes').insert({ user_id: currentUser.id, post_id: post.id });
    } catch {
      setPosts(prev => prev.map(p => p.id === post.id
        ? { ...p, _liked: liked, _likes: Math.max(0, (p._likes || 0) + (liked ? 1 : -1)) } : p));
    }
  }, [currentUser?.id, onRequireAuth]);

  const onCreated = useCallback((post) => {
    setPosts(prev => [{ ...post, _likes: 0, _liked: false }, ...prev]);
  }, []);

  const composer = <MemeComposer currentUser={currentUser} onRequireAuth={onRequireAuth} toast={toast} onCreated={onCreated} />;
  const chat = (
    <LoungeChat
      currentUser={currentUser}
      profile={profile}
      isAdmin={isAdmin}
      onUserClick={onUserClick}
      expanded={false}
      onToggleExpand={(v) => setChatExpanded(v)}
      onRequireAuth={onRequireAuth}
    />
  );

  return (
    <div style={pageStyle}>
      {/* Header + the composer/chat bar are pinned together so both stay
          visible (the bar is the "sticky header under the Lounge header"). */}
      <div style={stickyTopStyle}>
        <div style={headerStyle}>
          {onBack && (
            <button type="button" onClick={onBack} style={iconBtnStyle} aria-label="Back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          )}
          {onOpenMenu && (
            <button type="button" onClick={onOpenMenu} style={{ ...iconBtnStyle, ...menuOnlyMobile }} aria-label="Open menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
          )}
          <div>
            <h1 style={titleStyle}>Lounge</h1>
            <div style={subtitleStyle}>Memes, hot takes & tweets — drop a pic or paste an X / Instagram link ✨</div>
          </div>

          {/* Feed / Reels toggle */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: '#13161c', border: '1px solid #20242c', borderRadius: 999, padding: 3 }}>
            <button type="button" onClick={() => setLoungeView('feed')}
              style={{ ...viewToggleBtnStyle, ...(loungeView === 'feed' ? viewToggleActiveStyle : {}) }}>Feed</button>
            <button type="button" onClick={() => setLoungeView('reels')}
              style={{ ...viewToggleBtnStyle, ...(loungeView === 'reels' ? viewToggleActiveStyle : {}) }}>▶ Reels</button>
          </div>
        </div>

        {/* The composer/chat bar only shows in Feed mode — Reels needs the
            full viewport for the vertical scroll. */}
        {loungeView === 'feed' && (
          isNarrow ? (
            <div style={barMobileStyle}>{composer}</div>
          ) : (
            <div style={barStyle}>
              <div style={barComposerColStyle}>{composer}</div>
              <div style={barChatColStyle}>{chat}</div>
            </div>
          )
        )}
      </div>

      {loungeView === 'reels' ? (
        <ReelsView posts={posts.filter(p => p.tweet_url)} loading={loading} onLike={toggleLike} onUserClick={onUserClick} />
      ) : (
        <div style={feedColumnStyle}>
          {loading ? (
            <div style={mutedStyle}>Loading the Lounge…</div>
          ) : posts.length === 0 ? (
            <div style={mutedStyle}>Nothing in the Lounge yet — be the one who starts it. 😏</div>
          ) : (
            <div style={masonryStyle}>
              {posts.map(p => (
                <MemeCard
                  key={p.id}
                  post={p}
                  onLike={() => toggleLike(p)}
                  currentUser={currentUser}
                  onRequireAuth={onRequireAuth}
                  onUserClick={onUserClick}
                  onCommentCountChange={(delta) => setPosts(prev => prev.map(x => x.id === p.id ? { ...x, comment_count: Math.max(0, (x.comment_count || 0) + delta) } : x))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mobile floating chat button */}
      {isNarrow && (
        <button type="button" style={fabStyle} onClick={() => setChatExpanded(true)} aria-label="Open live chat">💬</button>
      )}

      {/* Expanded "bigger Discord community" overlay */}
      {chatExpanded && (
        <LoungeChat
          currentUser={currentUser}
          profile={profile}
          isAdmin={isAdmin}
          onUserClick={onUserClick}
          expanded
          onToggleExpand={(v) => setChatExpanded(v)}
          onRequireAuth={onRequireAuth}
        />
      )}
    </div>
  );
}

// ---- Composer -------------------------------------------------------
function MemeComposer({ currentUser, onRequireAuth, toast, onCreated }) {
  const [caption, setCaption] = useState('');
  const [tweetUrl, setTweetUrl] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  const pickImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const clearImage = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const captionPlain = htmlToPlain(caption);
  const tweetValid = !tweetUrl.trim() || isEmbeddable(tweetUrl);
  const hasContent = !!captionPlain || !!file || isEmbeddable(tweetUrl);

  const submit = async () => {
    if (!currentUser?.id) { onRequireAuth?.(); return; }
    if (!hasContent) { toast('Add a caption, an image, or an X / Instagram link.', 'error'); return; }
    if (tweetUrl.trim() && !isEmbeddable(tweetUrl)) {
      toast("That doesn't look like an X or Instagram link.", 'error');
      return;
    }
    setSubmitting(true);
    try {
      // Moderate the plain text the user contributes (caption + the link).
      const text = [captionPlain, tweetUrl].filter(Boolean).join(' ').trim();
      if (text) {
        const mod = await moderateContent(text).catch(() => ({ approved: true }));
        if (!mod.approved) { toast(mod.reason || 'That post was not approved by moderation.', 'error'); setSubmitting(false); return; }
      }

      let imageUrls = [];
      if (file) {
        const { urls, errors } = await uploadMultiplePostImages(supabase, [file], currentUser.id);
        if (errors?.length) { toast(errors[0], 'error'); setSubmitting(false); return; }
        imageUrls = urls;
      }

      const insertData = {
        user_id: currentUser.id,
        title: captionPlain.slice(0, 120) || 'Meme',
        description: captionPlain ? sanitizeHtml(caption) : null,
        post_type: 'meme',
        is_question: false,
        images: imageUrls.length ? imageUrls : null,
        tweet_url: isEmbeddable(tweetUrl) ? tweetUrl.trim() : null,
      };

      const { data: post, error } = await supabase
        .from('posts')
        .insert(insertData)
        .select('id, title, description, images, tweet_url, comment_count, created_at, user_id, profiles:user_id (username, avatar_url, display_name)')
        .single();
      if (error) throw error;

      onCreated(post);
      setCaption(''); setTweetUrl(''); clearImage();
      toast('Posted! 🎉', 'success');
    } catch (err) {
      console.error('meme post', err);
      toast('Could not post that. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <div style={composerStyle}>
        <button type="button" onClick={() => onRequireAuth?.()} style={signInBtnStyle}>Sign in to post a meme</button>
      </div>
    );
  }

  return (
    <div style={composerStyle}>
      <CommentEditor
        value={caption}
        onChange={setCaption}
        placeholder="Drop a hot take, a caption, a shitpost… 🔥"
        className="lounge-caption-input"
      />

      {preview && (
        <div style={previewWrapStyle}>
          <img src={preview} alt="preview" style={previewImgStyle} />
          <button type="button" onClick={clearImage} style={removeImgBtnStyle} aria-label="Remove image">✕</button>
        </div>
      )}

      <input
        type="url"
        value={tweetUrl}
        onChange={(e) => setTweetUrl(e.target.value)}
        placeholder="Paste an X or Instagram link to embed it (optional)"
        style={{ ...tweetInputStyle, borderColor: tweetValid ? '#262b34' : '#e0245e' }}
      />
      {!tweetValid && <div style={tweetHintStyle}>That doesn't look like an X or Instagram link.</div>}

      <div style={composerActionsStyle}>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileRef.current?.click()} style={attachBtnStyle}>
          🖼 {file ? 'Change image' : 'Add image'}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !hasContent || !tweetValid}
          style={{ ...postBtnStyle, opacity: (submitting || !hasContent || !tweetValid) ? 0.5 : 1, cursor: (submitting || !hasContent) ? 'default' : 'pointer' }}
        >
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );
}

// ---- Card -----------------------------------------------------------
function MemeCard({ post, onLike, currentUser, onRequireAuth, onUserClick, onCommentCountChange }) {
  const author = post.profiles || {};
  const img = Array.isArray(post.images) && post.images[0];
  const [showComments, setShowComments] = useState(false);
  const goToPost = () => { window.location.assign(`/post/${post.id}`); };
  const repost = () => { window.dispatchEvent(new CustomEvent('prompted:repost', { detail: { id: post.id } })); };

  return (
    <div style={cardStyle}>
      <div style={cardHeadStyle}>
        <a href={author.username ? `/${author.username}` : '#'} style={authorLinkStyle}
          onClick={(e) => { if (!author.username) e.preventDefault(); }}>
          {author.avatar_url
            ? <img src={author.avatar_url} alt="" style={avatarStyle} />
            : <span style={avatarFallbackStyle}>{(author.display_name || author.username || '?')[0]?.toUpperCase()}</span>}
          <span style={authorNameStyle}>@{author.username || 'builder'}</span>
        </a>
        <span style={timeStyle}>{timeAgo(post.created_at)}</span>
      </div>

      {post.description && (
        looksLikeHtml(post.description)
          ? <div style={captionTextStyle} dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.description) }} />
          : <div style={captionTextStyle}>{post.description}</div>
      )}

      {img && (
        <button type="button" onClick={goToPost} style={imgBtnStyle} title="Open">
          <img src={img} alt={post.title || 'meme'} style={memeImgStyle} loading="lazy" />
        </button>
      )}

      {post.tweet_url && (
        <div style={{ marginTop: img || post.description ? 10 : 0 }}>
          <SocialEmbed url={post.tweet_url} />
        </div>
      )}

      <div style={railStyle}>
        <button type="button" onClick={onLike} style={railBtnStyle} aria-label="Like">
          <Heart filled={post._liked} /><span style={railCountStyle}>{post._likes || 0}</span>
        </button>
        <button type="button" onClick={() => setShowComments(s => !s)} style={railBtnStyle} aria-label="Comments"
          aria-expanded={showComments}>
          <Bubble /><span style={{ ...railCountStyle, color: showComments ? '#4ECDC4' : '#9aa4b2' }}>{post.comment_count || 0}</span>
        </button>
        <button type="button" onClick={repost} style={railBtnStyle} aria-label="Repost">
          <Loop /><span style={railCountStyle}>Repost</span>
        </button>
      </div>

      {showComments && (
        <LoungeComments
          postId={post.id}
          currentUser={currentUser}
          onRequireAuth={onRequireAuth}
          onUserClick={onUserClick}
          onCountChange={onCommentCountChange}
        />
      )}
    </div>
  );
}

// ---- Reels (vertical snap-scroll of embedded posts) -----------------
// Like the Videos tab, but for embedded social posts (X tweets + Instagram
// reels/posts). We only have the embed iframe — not the raw video — so each
// slide renders the embed; only slides near the active one mount their iframe.
function ReelsView({ posts, loading, onLike, onUserClick }) {
  const containerRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.intersectionRatio > 0.6) setActiveIdx(Number(e.target.getAttribute('data-idx')));
      });
    }, { root, threshold: [0, 0.6, 1] });
    root.querySelectorAll('[data-reel]').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [posts.length]);

  if (loading) return <div style={mutedStyle}>Loading…</div>;
  if (!posts.length) return <div style={{ ...mutedStyle, paddingTop: 60 }}>No embedded posts yet. Paste an X or Instagram link when posting and it'll show up here to scroll.</div>;

  return (
    <div ref={containerRef} style={reelsContainerStyle}>
      {posts.map((p, idx) => {
        const author = p.profiles || {};
        return (
          <div key={p.id} data-reel data-idx={idx} style={reelSlideStyle}>
            <div style={reelEmbedWrapStyle}>
              {Math.abs(idx - activeIdx) <= 1 ? <SocialEmbed url={p.tweet_url} /> : <div style={{ height: 460 }} />}
            </div>
            <div style={reelOverlayStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={reelAuthorStyle} onClick={() => author.username && onUserClick?.(p.user_id)}>@{author.username || 'builder'}</span>
                {p.description && (
                  looksLikeHtml(p.description)
                    ? <div style={reelCaptionStyle} dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.description) }} />
                    : <div style={reelCaptionStyle}>{p.description}</div>
                )}
              </div>
              <div style={reelRailStyle}>
                <button type="button" onClick={() => onLike(p)} style={railBtnStyle} aria-label="Like"><Heart filled={p._liked} /><span style={railCountStyle}>{p._likes || 0}</span></button>
                <button type="button" onClick={() => window.location.assign(`/post/${p.id}`)} style={railBtnStyle} aria-label="Comments"><Bubble /><span style={railCountStyle}>{p.comment_count || 0}</span></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

// ---- Icons ----------------------------------------------------------
const Heart = ({ filled }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? '#ff3b5c' : 'none'} stroke={filled ? '#ff3b5c' : '#9aa4b2'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20s-7-4.6-9-9.1C1.8 8 3.3 5 6.2 5 8 5 9.3 6 12 8.4 14.7 6 16 5 17.8 5c2.9 0 4.4 3 3.2 5.9C19 15.4 12 20 12 20z" />
  </svg>
);
const Bubble = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#9aa4b2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1-4.5A8.5 8.5 0 1 1 21 11.5z" />
  </svg>
);
const Loop = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#9aa4b2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

// ---- Styles ---------------------------------------------------------
const pageStyle = { minHeight: '100vh', background: 'var(--bg-primary, #0a0b0d)', paddingBottom: 80 };
// The header + composer/chat bar are pinned together.
const stickyTopStyle = {
  position: 'sticky', top: 0, zIndex: 6,
  background: 'rgba(10,11,13,0.92)', backdropFilter: 'blur(10px)',
  borderBottom: '1px solid #1a1d23',
};
const headerStyle = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
};
const barStyle = {
  display: 'flex', gap: 16, padding: '0 16px 14px', alignItems: 'stretch',
  maxWidth: 1100, width: '100%', boxSizing: 'border-box', // hugs the left (no auto margin)
};
const CHAT_H = 380;
const barComposerColStyle = { flex: '1 1 52%', minWidth: 0, height: CHAT_H }; // match chat height
const barChatColStyle = { flex: '1 1 48%', minWidth: 0, height: CHAT_H };
const barMobileStyle = { padding: '0 14px 14px', maxWidth: 600, margin: '0 auto', width: '100%', boxSizing: 'border-box' };
// Feed hugs the left (no auto margin) and spans the content area so cards can
// tile across. The inner masonry uses CSS columns so tweets, reels, and images
// of different heights puzzle together with no ragged gaps.
const feedColumnStyle = { width: '100%', maxWidth: 1400, margin: 0, padding: '16px 16px 16px 20px', boxSizing: 'border-box' };
const masonryStyle = { columnWidth: 340, columnGap: 16, width: '100%' };
const fabStyle = {
  position: 'fixed', left: 16, bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', zIndex: 40,
  width: 52, height: 52, borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 22,
  background: 'var(--accent-primary, #4ECDC4)', color: '#04201d', boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
};
const viewToggleBtnStyle = { padding: '6px 14px', borderRadius: 999, border: 'none', background: 'transparent', color: '#9aa4b2', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const viewToggleActiveStyle = { background: 'var(--accent-primary, #4ECDC4)', color: '#04201d' };
// Reels (vertical snap scroll) — leaves room for the Lounge header (top) and the
// app bottom nav (mobile).
const reelsContainerStyle = {
  height: 'calc(100dvh - 128px)', overflowY: 'auto', scrollSnapType: 'y mandatory',
  background: '#000', WebkitOverflowScrolling: 'touch',
};
const reelSlideStyle = {
  position: 'relative', height: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 12px 84px', boxSizing: 'border-box',
};
const reelEmbedWrapStyle = { width: '100%', maxWidth: 520, maxHeight: '100%', overflowY: 'auto', borderRadius: 14 };
const reelOverlayStyle = {
  position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'flex-end', gap: 12,
  padding: '20px 16px 26px', background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)', pointerEvents: 'none',
};
const reelAuthorStyle = { color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', pointerEvents: 'auto' };
const reelCaptionStyle = { color: '#e7ebf0', fontSize: 14, marginTop: 4, maxHeight: 80, overflow: 'hidden', pointerEvents: 'auto' };
const reelRailStyle = { display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', pointerEvents: 'auto' };
const iconBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38,
  borderRadius: 999, border: '1px solid #262b34', background: 'transparent', color: '#e2e8f0',
  cursor: 'pointer', flexShrink: 0,
};
const menuOnlyMobile = {}; // menu button shown on all widths; sidebar handles desktop nav
const titleStyle = { margin: 0, fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.1 };
const subtitleStyle = { fontSize: 12.5, color: '#7c8696', marginTop: 2 };
const columnStyle = { maxWidth: 600, margin: '0 auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 16 };
const mutedStyle = { textAlign: 'center', color: '#7c8696', padding: '36px 12px' };

const composerStyle = {
  background: 'var(--bg-secondary, #14161b)', border: '1px solid #20242c', borderRadius: 16,
  padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
  height: '100%', boxSizing: 'border-box', overflowY: 'auto', // fill the column (matches chat height)
};
const captionStyle = {
  width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 52, maxHeight: 220,
  background: '#0e1014', border: '1px solid #262b34', borderRadius: 12, color: '#fff',
  padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', outline: 'none',
};
const tweetInputStyle = {
  width: '100%', boxSizing: 'border-box', background: '#0e1014', border: '1px solid #262b34',
  borderRadius: 12, color: '#fff', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none',
};
const tweetHintStyle = { color: '#e0245e', fontSize: 12, marginTop: -4 };
const previewWrapStyle = { position: 'relative', alignSelf: 'flex-start', maxWidth: '100%' };
const previewImgStyle = { maxWidth: '100%', maxHeight: 320, borderRadius: 12, display: 'block', border: '1px solid #20242c' };
const removeImgBtnStyle = {
  position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 999, border: 'none',
  background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', fontSize: 13,
};
const composerActionsStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 };
const attachBtnStyle = {
  background: 'transparent', border: '1px solid #262b34', borderRadius: 999, color: '#cbd5e1',
  padding: '8px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const postBtnStyle = {
  background: 'var(--accent-primary, #4ECDC4)', color: '#04201d', border: 'none', borderRadius: 999,
  padding: '9px 22px', fontSize: 15, fontWeight: 800,
};
const signInBtnStyle = {
  background: 'var(--accent-primary, #4ECDC4)', color: '#04201d', border: 'none', borderRadius: 12,
  padding: '12px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%',
};

const cardStyle = {
  background: 'var(--bg-secondary, #14161b)', border: '1px solid #1c2027', borderRadius: 16, padding: 14,
  // Keep each card whole inside a masonry column and space rows vertically
  // (column-gap only handles the horizontal gutter).
  breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', marginBottom: 16, width: '100%', boxSizing: 'border-box',
};
const cardHeadStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 };
const authorLinkStyle = { display: 'inline-flex', alignItems: 'center', gap: 9, textDecoration: 'none' };
const avatarStyle = { width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' };
const avatarFallbackStyle = {
  width: 34, height: 34, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: '#2a2f3a', color: '#cbd5e1', fontWeight: 700, fontSize: 15,
};
const authorNameStyle = { color: '#fff', fontWeight: 700, fontSize: 14.5 };
const timeStyle = { color: '#6b7480', fontSize: 12.5 };
const captionTextStyle = { color: '#e7ebf0', fontSize: 15.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', marginBottom: 10 };
const imgBtnStyle = { display: 'block', width: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' };
const memeImgStyle = { width: '100%', borderRadius: 14, display: 'block', border: '1px solid #20242c' };
const railStyle = { display: 'flex', alignItems: 'center', gap: 22, marginTop: 12 };
const railBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none',
  cursor: 'pointer', padding: 0,
};
const railCountStyle = { color: '#9aa4b2', fontSize: 13, fontWeight: 700 };
