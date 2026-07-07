import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { normalizePostVideoItem, getPlayablePostVideoUrl } from '../lib/storage.js';

// Video feed with two view modes:
//   • "shorts"  — full-screen vertical scroll (YouTube Shorts style). Only the
//                 cards near the active one mount a <video>, so the feed stays
//                 smooth even with many videos. Right-rail like / comment / repost.
//   • "grid"    — responsive grid of tiles; hover a tile to preview it muted.
// Sorting is applied to a stable id-order so actions (like) don't reshuffle.

const FETCH_LIMIT = 80;
const WINDOW = 2; // how many cards on each side of active keep a live <video>
const NOW = () => Date.now();

const VIDEO_SORTS = [
  ['foryou', 'For You'],
  ['top', 'Top'],
  ['random', 'Random'],
  ['unwatched', 'Unwatched'],
];

// "Watched" tracked locally (no per-user video-views table). A short counts as
// watched once it's been the active card.
const WATCHED_KEY = 'videosWatched';
const loadWatched = () => {
  try { return new Set(JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]')); } catch { return new Set(); }
};
const markWatched = (id) => {
  if (!id) return;
  try {
    const s = loadWatched();
    if (s.has(id)) return;
    s.add(id);
    localStorage.setItem(WATCHED_KEY, JSON.stringify([...s].slice(-800)));
  } catch { /* ignore */ }
};

function scorePost(post, followedSet) {
  const cats = Array.isArray(post.category_ids) ? post.category_ids : [];
  const matched = cats.reduce((n, id) => n + (followedSet.has(id) ? 1 : 0), 0);
  const engagement = Math.log1p(post.comment_count || 0);
  const ageDays = Math.max(0, (NOW() - new Date(post.created_at).getTime()) / 86_400_000);
  const recency = Math.exp(-ageDays / 14);
  const videoTypeBoost = post.post_type === 'video' ? 1.5 : 0;
  return matched * 3 + engagement * 1.2 + recency * 2 + videoTypeBoost;
}

export default function VideosPage({ currentUser, categories = [], onOpenExploreCategory, onOpenMenu, onBack }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followed, setFollowed] = useState(() => new Set());
  const [activeIdx, setActiveIdx] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [randomNonce, setRandomNonce] = useState(0);
  const [sort, setSort] = useState(() => {
    try { const s = localStorage.getItem('videosSort'); return VIDEO_SORTS.some(([k]) => k === s) ? s : 'foryou'; } catch { return 'foryou'; }
  });
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('videosView') === 'grid' ? 'grid' : 'shorts'; } catch { return 'shorts'; }
  });
  const [pendingScrollId, setPendingScrollId] = useState(null);
  const containerRef = useRef(null);

  const setViewMode = (v) => { setView(v); try { localStorage.setItem('videosView', v); } catch { /* ignore */ } };
  const handleSort = (s) => {
    setSort(s);
    try { localStorage.setItem('videosSort', s); } catch { /* ignore */ }
    if (s === 'random') setRandomNonce(n => n + 1);
  };

  const categoryById = useMemo(() => {
    const m = new Map();
    (categories || []).forEach(c => m.set(c.id, c));
    return m;
  }, [categories]);

  const postById = useMemo(() => new Map(posts.map(p => [p.id, p])), [posts]);

  // The ORDER of the feed. Deliberately does NOT depend on post contents — only
  // on sort/followed/count/nonce — so liking a video won't reshuffle the list.
  const orderedIds = useMemo(() => {
    let list = posts;
    if (sort === 'unwatched') {
      const w = loadWatched();
      list = list.filter(p => !w.has(p.id));
    }
    const arr = [...list];
    if (sort === 'top') {
      arr.sort((a, b) => (b._likes || 0) - (a._likes || 0));
    } else if (sort === 'random') {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    } else {
      arr.sort((a, b) => scorePost(b, followed) - scorePost(a, followed));
    }
    return arr.map(p => p.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, followed, posts.length, randomNonce]);

  const displayPosts = useMemo(
    () => orderedIds.map(id => postById.get(id)).filter(Boolean),
    [orderedIds, postById]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUser?.id) { setFollowed(new Set()); return; }
      const { data } = await supabase
        .from('followed_categories')
        .select('category_id')
        .eq('user_id', currentUser.id);
      if (!cancelled) setFollowed(new Set((data || []).map(r => r.category_id)));
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select('id, title, prompt, description, videos, images, category_ids, demo_url, github_repo_url, ai_tool, comment_count, created_at, post_type, user_id, profiles:user_id (username, avatar_url, display_name, is_suspended)')
        .not('videos', 'is', null)
        .eq('is_question', false)
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT);
      if (error) { console.error('VideosPage load', error); setLoading(false); return; }

      const withVideos = (data || []).filter(p => Array.isArray(p.videos) && p.videos.length > 0 && !p.profiles?.is_suspended);
      const resolved = await Promise.all(withVideos.map(async (p) => {
        const first = normalizePostVideoItem(p.videos[0]);
        if (!first) return null;
        const url = await getPlayablePostVideoUrl(supabase, first);
        if (!url) return null;
        return { ...p, _videoUrl: url, _poster: (Array.isArray(p.images) && p.images[0]) || undefined };
      }));
      const ready = resolved.filter(Boolean);

      const ids = ready.map(p => p.id);
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
      const readyFull = ready.map(p => ({ ...p, _likes: likeMap[p.id] || 0, _liked: likedSet.has(p.id) }));
      if (!cancelled) { setPosts(readyFull); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [followed, currentUser?.id]);

  // Reset to the top whenever the sort changes so the new order is actually seen.
  useEffect(() => {
    setActiveIdx(0);
    if (containerRef.current) containerRef.current.scrollTo({ top: 0 });
  }, [sort, randomNonce]);

  // IntersectionObserver: track which card is in view (the active card plays).
  useEffect(() => {
    if (view !== 'shorts') return;
    const root = containerRef.current;
    if (!root) return;
    const cards = root.querySelectorAll('[data-video-card]');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
          setActiveIdx(Number(e.target.getAttribute('data-idx')));
          markWatched(e.target.getAttribute('data-post-id'));
        }
      });
    }, { root, threshold: [0, 0.6, 1] });
    cards.forEach(c => io.observe(c));
    return () => io.disconnect();
  }, [displayPosts, view]);

  // After tapping a grid tile, jump to that video in the shorts feed.
  useEffect(() => {
    if (view !== 'shorts' || !pendingScrollId) return;
    const root = containerRef.current;
    const el = root?.querySelector(`[data-post-id="${pendingScrollId}"]`);
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    setPendingScrollId(null);
  }, [view, pendingScrollId, displayPosts]);

  const openCategory = useCallback((cat) => {
    if (onOpenExploreCategory) onOpenExploreCategory(cat);
    else window.location.assign(`/explore?category=${encodeURIComponent(cat.slug || cat.name || cat.id)}`);
  }, [onOpenExploreCategory]);

  const openInShorts = useCallback((post) => {
    setPendingScrollId(post.id);
    setViewMode('shorts');
  }, []);

  // Like toggle — optimistic, writes to the likes table.
  const toggleLike = useCallback(async (post) => {
    if (!currentUser?.id) { window.location.assign(`/post/${post.id}`); return; }
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
  }, [currentUser?.id]);

  const repost = useCallback((post) => {
    window.dispatchEvent(new CustomEvent('prompted:repost', { detail: { id: post.id } }));
  }, []);

  const Controls = (
    <div style={toggleWrapStyle}>
      <div style={controlGroupStyle}>
        {onBack && (
          <button type="button" onClick={onBack} style={menuBtnStyle} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {onOpenMenu && (
          <button type="button" onClick={onOpenMenu} style={menuBtnStyle} aria-label="Open menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}
        <SortDropdown sort={sort} onChange={handleSort} />
        <button type="button" onClick={() => setViewMode('shorts')}
          style={{ ...toggleBtnStyle, ...(view === 'shorts' ? toggleActiveStyle : {}) }}>▶ Shorts</button>
        <button type="button" onClick={() => setViewMode('grid')}
          style={{ ...toggleBtnStyle, ...(view === 'grid' ? toggleActiveStyle : {}) }}>▦ Grid</button>
      </div>
    </div>
  );

  if (loading) return <div style={loadingStyle}>Loading videos…</div>;
  if (posts.length === 0) return <div style={loadingStyle}>No videos yet. Be the first to post one.</div>;

  const emptyForSort = displayPosts.length === 0;

  if (view === 'grid') {
    return (
      <div style={gridPageStyle}>
        {Controls}
        {emptyForSort ? (
          <div style={loadingStyle}>{sort === 'unwatched' ? "🎉 You've watched them all! Try another sort." : 'Nothing here.'}</div>
        ) : (
          <div style={gridStyle}>
            {displayPosts.map((p) => (
              <VideoGridTile key={p.id} post={p} onOpen={() => openInShorts(p)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    // Controls float as an ABSOLUTE overlay so the sort/Shorts/Grid bar no
    // longer pushes the feed down (which was clipping the bottom caption).
    <div style={{ position: 'relative' }}>
      <div style={controlsOverlayStyle}>{Controls}</div>
      {emptyForSort && (
        <div style={loadingStyle}>{sort === 'unwatched' ? "🎉 You've watched them all! Try another sort." : 'Nothing here.'}</div>
      )}
      <div ref={containerRef} className="videos-feed" style={feedStyle}>
        {displayPosts.map((p, idx) => (
          <VideoCard
            key={p.id}
            idx={idx}
            post={p}
            active={idx === activeIdx}
            nearby={Math.abs(idx - activeIdx) <= WINDOW}
            categoryById={categoryById}
            onOpenCategory={openCategory}
            soundOn={soundOn}
            onToggleSound={() => setSoundOn(s => !s)}
            onLike={() => toggleLike(p)}
            onRepost={() => repost(p)}
          />
        ))}
      </div>
    </div>
  );
}

// Positions the shorts Controls bar over the top of the video instead of in
// normal flow (so it doesn't consume layout height).
const controlsOverlayStyle = { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 };

// ---- Icons ----------------------------------------------------------
const Heart = ({ filled }) => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill={filled ? '#ff3b5c' : 'none'} stroke={filled ? '#ff3b5c' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20s-7-4.6-9-9.1C1.8 8 3.3 5 6.2 5 8 5 9.3 6 12 8.4 14.7 6 16 5 17.8 5c2.9 0 4.4 3 3.2 5.9C19 15.4 12 20 12 20z" />
  </svg>
);
const Bubble = () => (
  <svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1-4.5A8.5 8.5 0 1 1 21 11.5z" />
  </svg>
);
const Loop = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

// ---- Grid tile: muted mini-preview that plays on hover --------------
function VideoGridTile({ post, onOpen }) {
  const ref = useRef(null);
  const author = post.profiles || {};
  const onEnter = () => { const v = ref.current; if (v) v.play().catch(() => {}); };
  const onLeave = () => { const v = ref.current; if (v) { v.pause(); try { v.currentTime = 0; } catch { /* ignore */ } } };

  return (
    <div style={tileStyle} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onOpen} title={post.title || 'Video'}>
      <video ref={ref} src={post._videoUrl} poster={post._poster} muted loop playsInline preload="metadata" style={tileVideoStyle} />
      <div style={tilePlayBadge}>▶</div>
      <div style={tileOverlayStyle}>
        <div style={tileTitleStyle}>{post.title || 'Untitled'}</div>
        <div style={tileAuthorStyle}>@{author.username || 'builder'} · ♥ {post._likes || 0}</div>
      </div>
    </div>
  );
}

function VideoCard({ idx, post, active, nearby, categoryById, onOpenCategory, soundOn, onToggleSound, onLike, onRepost }) {
  const muted = !soundOn;
  const videoRef = useRef(null);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted, nearby]);

  // Play only the active card; pause others. Video only exists when nearby.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) v.play().catch(() => {});
    else v.pause();
  }, [active, nearby]);

  const author = post.profiles || {};
  const cats = (post.category_ids || []).map(id => categoryById.get(id)).filter(Boolean);
  const goToPost = () => { window.location.assign(`/post/${post.id}`); };

  return (
    <div data-video-card data-idx={idx} data-post-id={post.id} style={cardStyle}>
      {nearby ? (
        <video
          ref={videoRef}
          src={post._videoUrl}
          poster={post._poster || undefined}
          muted={muted}
          loop
          playsInline
          preload={active ? 'auto' : 'metadata'}
          onClick={() => { const v = videoRef.current; if (!v) return; if (v.paused) v.play(); else v.pause(); }}
          style={videoStyle}
        />
      ) : (
        <div style={{ ...videoStyle, background: post._poster ? `#000 url(${post._poster}) center/contain no-repeat` : '#000' }} />
      )}

      <button type="button" onClick={onToggleSound} style={muteBtnStyle} aria-label={muted ? 'Unmute' : 'Mute'}>
        {muted ? '🔇' : '🔊'}
      </button>

      {/* Right action rail */}
      <div style={railStyle}>
        <button type="button" onClick={onLike} style={railBtnStyle} aria-label="Like">
          <Heart filled={post._liked} />
          <span style={railCountStyle}>{post._likes || 0}</span>
        </button>
        <button type="button" onClick={goToPost} style={railBtnStyle} aria-label="Comments">
          <Bubble />
          <span style={railCountStyle}>{post.comment_count || 0}</span>
        </button>
        <button type="button" onClick={onRepost} style={railBtnStyle} aria-label="Repost">
          <Loop />
          <span style={railCountStyle}>Repost</span>
        </button>
      </div>

      <div style={overlayStyle}>
        <div style={authorRowStyle}>
          {author.avatar_url && <img src={author.avatar_url} alt="" style={avatarStyle} />}
          <a href={author.username ? `/${author.username}` : '#'} style={authorLinkStyle}
            onClick={(e) => { if (!author.username) e.preventDefault(); }}>@{author.username || 'builder'}</a>
        </div>

        <button type="button" onClick={goToPost} style={titleBtnStyle}>{post.title || 'Untitled build'}</button>

        {cats.length > 0 && (
          <div style={chipsRowStyle}>
            {cats.slice(0, 4).map(cat => (
              <button key={cat.id} type="button" onClick={() => onOpenCategory(cat)} style={chipStyle} title={`Browse ${cat.name}`}>#{cat.name}</button>
            ))}
          </div>
        )}

        <div style={linkRowStyle}>
          {post.demo_url && <a href={post.demo_url} target="_blank" rel="noopener noreferrer" style={linkBtnStyle}>▶ Try it</a>}
          {post.github_repo_url && <a href={post.github_repo_url} target="_blank" rel="noopener noreferrer" style={linkBtnStyle}>⌘ Code</a>}
        </div>
      </div>
    </div>
  );
}

// ---- Sort dropdown --------------------------------------------------
function SortDropdown({ sort, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const label = (VIDEO_SORTS.find(([k]) => k === sort) || ['', 'Sort'])[1];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ ...toggleBtnStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {label} <span style={{ fontSize: 10, opacity: 0.8 }}>▾</span>
      </button>
      {open && (
        <div style={dropMenuStyle} role="menu">
          {VIDEO_SORTS.map(([key, lbl]) => (
            <button key={key} type="button" role="menuitem"
              onClick={() => { onChange(key); setOpen(false); }}
              style={{ ...dropItemStyle, ...(sort === key ? dropItemActiveStyle : {}) }}>
              {sort === key ? '✓ ' : ''}{lbl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const dropMenuStyle = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, minWidth: 150,
  background: '#15171c', border: '1px solid #2a2f3a', borderRadius: 10, padding: 4,
  boxShadow: '0 12px 36px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 2,
};
const dropItemStyle = {
  textAlign: 'left', padding: '8px 12px', borderRadius: 7, border: 'none',
  background: 'transparent', color: '#e2e8f0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const dropItemActiveStyle = { background: 'rgba(78,205,196,0.15)', color: '#4ECDC4' };

// The videos feed lives in `.mobile-main.no-header` (top = safe-area inset) with
// the app's ~64px bottom nav fixed below it. Sizing each card to the *visible*
// area between those two — using dvh, not vh — keeps the video from being pushed
// under the nav and cut off at the bottom.
const VIDEO_VIEWPORT_HEIGHT = 'calc(100dvh - env(safe-area-inset-top, 0px) - 64px)';
const feedStyle = {
  height: VIDEO_VIEWPORT_HEIGHT, overflowY: 'auto', scrollSnapType: 'y mandatory',
  background: '#000', margin: 0, WebkitOverflowScrolling: 'touch',
};
const cardStyle = {
  position: 'relative', height: VIDEO_VIEWPORT_HEIGHT, width: '100%', scrollSnapAlign: 'start',
  scrollSnapStop: 'always', display: 'flex', alignItems: 'center', justifyContent: 'center',
  overflow: 'hidden', background: '#000',
};
const videoStyle = { width: '100%', height: '100%', objectFit: 'contain', background: '#000', cursor: 'pointer' };
const overlayStyle = {
  position: 'absolute', left: 0, right: 70, bottom: 0, padding: '20px 18px 28px',
  background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.78) 90%)', color: '#fff', pointerEvents: 'none',
};
const authorRowStyle = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, pointerEvents: 'auto' };
const avatarStyle = { width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff' };
const authorLinkStyle = { color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 15 };
const titleBtnStyle = {
  display: 'block', textAlign: 'left', background: 'transparent', border: 'none', color: '#fff',
  fontSize: 18, fontWeight: 700, padding: 0, marginBottom: 10, cursor: 'pointer', pointerEvents: 'auto',
};
const chipsRowStyle = { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, pointerEvents: 'auto' };
const chipStyle = {
  background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)',
  color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const linkRowStyle = { display: 'flex', gap: 8, flexWrap: 'wrap', pointerEvents: 'auto' };
const linkBtnStyle = {
  background: 'rgba(255,255,255,0.95)', color: '#111', textDecoration: 'none', border: 'none',
  borderRadius: 999, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
const muteBtnStyle = {
  // The fixed app header (~60px tall, sitting at the safe-area inset) overlays the
  // top of the feed, so offset the button below it instead of tucking it under.
  position: 'absolute', top: 72, right: 16, zIndex: 2, background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 999, width: 40, height: 40,
  fontSize: 18, cursor: 'pointer',
};
const railStyle = {
  position: 'absolute', right: 10, bottom: 24, zIndex: 3, display: 'flex', flexDirection: 'column',
  gap: 18, alignItems: 'center',
};
const railBtnStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'transparent',
  border: 'none', cursor: 'pointer', padding: 0,
};
const railCountStyle = { color: '#fff', fontSize: 12, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.8)' };
const loadingStyle = { padding: 40, textAlign: 'center', color: '#888', minHeight: '60vh' };

const toggleWrapStyle = {
  position: 'sticky', top: 0, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 8,
  alignItems: 'center', padding: '10px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
};
const controlGroupStyle = { display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' };
const toggleBtnStyle = {
  padding: '7px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.25)',
  background: 'transparent', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
const toggleActiveStyle = { background: '#fff', color: '#111', borderColor: '#fff' };
const menuBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38,
  borderRadius: 999, border: '1px solid rgba(255,255,255,0.25)', background: 'transparent',
  color: '#fff', cursor: 'pointer', flexShrink: 0,
};

const gridPageStyle = { background: '#0a0a0a', minHeight: '100vh' };
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, padding: 12 };
const tileStyle = {
  position: 'relative', aspectRatio: '9 / 16', borderRadius: 12, overflow: 'hidden',
  background: '#000', cursor: 'pointer', border: '1px solid #1c1f26',
};
const tileVideoStyle = { width: '100%', height: '100%', objectFit: 'cover', background: '#000', display: 'block' };
const tilePlayBadge = {
  position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%',
  background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 12, display: 'flex',
  alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
};
const tileOverlayStyle = {
  position: 'absolute', left: 0, right: 0, bottom: 0, padding: '20px 10px 10px',
  background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 100%)', pointerEvents: 'none',
};
const tileTitleStyle = {
  color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1.25,
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
};
const tileAuthorStyle = { color: '#cbd5e1', fontSize: 11, marginTop: 3 };
