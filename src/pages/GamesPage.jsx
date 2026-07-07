import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, SUPABASE_URL } from '../lib/supabase.js';
import UploadGameModal from '../components/games/UploadGameModal.jsx';
import AdminGamesQueue from '../components/games/AdminGamesQueue.jsx';

// Lightweight router: /games -> browse; /games/<slug> -> detail
function parseRoute() {
  const m = window.location.pathname.match(/^\/games(?:\/([a-z0-9-]+))?\/?$/i);
  if (!m) return { view: 'browse', slug: null };
  return { view: m[1] ? 'detail' : 'browse', slug: m[1] || null };
}

const STORAGE_PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/games/`;
// HTML files are force-downgraded to text/plain by Supabase Storage's anti-hosting
// safeguard. Serve game entries through our `play` edge function which proxies
// the storage object with the correct Content-Type.
const PLAY_PREFIX = `${SUPABASE_URL}/functions/v1/play/`;

export default function GamesPage({ currentUser, onRequireAuth, onUserClick }) {
  const [route, setRoute] = useState(parseRoute());

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    // Sidebar "Games" re-click fires this to bounce a game detail back to the
    // browse grid — an extra path home alongside the in-page back button.
    const onHome = () => { setRoute({ view: 'browse', slug: null }); window.scrollTo({ top: 0 }); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('prmpted:games-home', onHome);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('prmpted:games-home', onHome);
    };
  }, []);

  const navigate = (slug) => {
    const path = slug ? `/games/${slug}` : '/games';
    window.history.pushState({}, '', path);
    setRoute(parseRoute());
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="games-page" style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 120px' }}>
      {route.view === 'browse' ? (
        <GamesBrowse onOpen={navigate} currentUser={currentUser} onRequireAuth={onRequireAuth} />
      ) : (
        <GameDetail
          slug={route.slug}
          currentUser={currentUser}
          onRequireAuth={onRequireAuth}
          onBack={() => navigate(null)}
          onUserClick={onUserClick}
        />
      )}
    </div>
  );
}

// ============================================================
// Browse — grid (M1)
// ============================================================
function GamesBrowse({ onOpen, currentUser, onRequireAuth }) {
  const [games, setGames] = useState([]);
  const [myGames, setMyGames] = useState([]);
  const [tags, setTags] = useState([]);
  const [activeTag, setActiveTag] = useState(null);
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState('browse'); // 'browse' | 'library'

  useEffect(() => {
    if (!currentUser) { setIsAdmin(false); return; }
    (async () => {
      const { data } = await supabase.from('admin_config').select('value').eq('key', 'games_admin_user_ids').maybeSingle();
      try {
        const ids = JSON.parse(data?.value || '[]');
        setIsAdmin(Array.isArray(ids) && ids.includes(currentUser.id));
      } catch { setIsAdmin(false); }
    })();
  }, [currentUser?.id]);

  const reload = async () => {
    setLoading(true);
    const [{ data: g }, { data: t }] = await Promise.all([
      supabase
        .from('games')
        .select('id,slug,title,pitch,thumbnail_url,play_count,like_count,created_at,creator:creator_id(id,username,avatar_url)')
        .eq('status', 'approved'),
      supabase.from('game_tags').select('*').order('namespace').order('display_order'),
    ]);
    setGames(g || []);
    setTags(t || []);
    if (currentUser) {
      const { data: mine } = await supabase
        .from('games')
        .select('id,slug,title,status,created_at')
        .eq('creator_id', currentUser.id)
        .order('created_at', { ascending: false });
      setMyGames(mine || []);
    } else {
      setMyGames([]);
    }
    setLoading(false);
  };

  useEffect(() => { reload(); }, [currentUser?.id]);

  const sorted = useMemo(() => {
    const arr = [...games];
    if (sort === 'most_played') arr.sort((a, b) => b.play_count - a.play_count);
    else if (sort === 'top_liked') arr.sort((a, b) => b.like_count - a.like_count);
    else arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return arr;
  }, [games, sort]);

  return (
    <>
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, letterSpacing: '-0.02em' }}>Games</h1>
          <p style={{ color: 'var(--text-secondary, #888)', margin: '6px 0 0' }}>
            Browser games built by humans using AI. New every week.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <GamesActionStyles />
          <button
            type="button"
            className="games-action-btn games-action-btn--ghost"
            onClick={() => setShowHowTo(true)}
          >
            <span className="games-action-emoji" aria-hidden="true">📖</span> How to upload
          </button>
          <button
            type="button"
            className="games-action-btn games-action-btn--solid"
            onClick={() => currentUser ? setShowUpload(true) : onRequireAuth?.()}
          >
            <span className="games-action-emoji" aria-hidden="true">🎮</span> Submit a Game
          </button>
        </div>
      </header>

      <div style={{ display: 'inline-flex', gap: 4, padding: 4, marginBottom: 20, borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {[['browse', '🎮 Browse'], ['library', '📚 My Library']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={segBtn(tab === key)}>{label}</button>
        ))}
      </div>

      {tab === 'library' ? (
        <GamesLibrary currentUser={currentUser} onOpen={onOpen} onRequireAuth={onRequireAuth} />
      ) : (
      <>
      <HowToUploadBanner onOpen={() => setShowHowTo(true)} />
      {showHowTo && <HowToUploadModal onClose={() => setShowHowTo(false)} />}

      {myGames.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={{ margin: '0 0 10px' }}>Your submissions</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {myGames.map(g => (
              <li key={g.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--card-bg, #161821)', border: '1px solid var(--border, #262a36)', borderRadius: 8 }}>
                <span><strong>{g.title}</strong> — <span style={{ color: '#888', fontSize: 13 }}>{g.status}</span></span>
                {g.status === 'approved' && <button onClick={() => onOpen(g.slug)} style={linkBtn}>Open →</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle}>
          <option value="newest">Newest</option>
          <option value="most_played">Most played</option>
          <option value="top_liked">Top liked</option>
        </select>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tags.filter(t => t.namespace === 'genre').slice(0, 12).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTag(activeTag === t.id ? null : t.id)}
              style={chipStyle(activeTag === t.id)}
            >
              {t.icon} {t.name}
            </button>
          ))}
        </div>
      </div>

      {isAdmin && <AdminGamesQueue />}

      {showUpload && currentUser && (
        <UploadGameModal
          user={currentUser}
          onClose={() => setShowUpload(false)}
          onSubmitted={() => { setShowUpload(false); reload(); }}
        />
      )}

      {loading ? <p>Loading…</p>
        : sorted.length === 0 ? (
          <div style={emptyStyle}>
            <p style={{ margin: 0 }}>No games yet. Approved submissions will appear here.</p>
          </div>
        ) : (
          <div style={gridStyle}>
            {sorted.map(g => (
              <button key={g.id} onClick={() => onOpen(g.slug)} style={cardStyle}>
                <div style={thumbWrap}>
                  {g.thumbnail_url
                    ? <img src={g.thumbnail_url} alt={g.title} style={thumbImg} />
                    : <div style={thumbPlaceholder}>🎮</div>}
                </div>
                <div style={{ padding: '10px 12px 14px' }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{g.title}</div>
                  <div style={{ color: '#888', fontSize: 13, marginTop: 2 }}>@{g.creator?.username || 'unknown'}</div>
                  <div style={{ color: '#666', fontSize: 12, marginTop: 6, display: 'flex', gap: 10 }}>
                    <span>▶ {g.play_count}</span>
                    <span>♥ {g.like_count}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </>
      )}
    </>
  );
}

// ============================================================
// My Library — games you've played, with playtime + achievement progress
// ============================================================
function GamesLibrary({ currentUser, onOpen, onRequireAuth }) {
  const [rows, setRows] = useState(null); // null = loading
  const [sort, setSort] = useState('recent');

  useEffect(() => {
    if (!currentUser) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      setRows(null);
      // Playtime rows are the spine of the library — one per game the user has played.
      const { data: pt } = await supabase
        .from('game_playtime')
        .select('game_id,total_seconds,last_played_at,game:game_id(id,slug,title,thumbnail_url,status,creator:creator_id(username))')
        .eq('user_id', currentUser.id);
      if (cancelled) return;
      const played = (pt || []).filter(r => r.game && r.game.status === 'approved');
      const gameIds = played.map(r => r.game_id);

      let unlockCounts = {};
      let totalCounts = {};
      if (gameIds.length) {
        const [{ data: unl }, { data: ach }] = await Promise.all([
          supabase.from('game_achievement_unlocks').select('game_id').eq('user_id', currentUser.id).in('game_id', gameIds),
          supabase.from('game_achievements').select('game_id').in('game_id', gameIds),
        ]);
        (unl || []).forEach(u => { unlockCounts[u.game_id] = (unlockCounts[u.game_id] || 0) + 1; });
        (ach || []).forEach(a => { totalCounts[a.game_id] = (totalCounts[a.game_id] || 0) + 1; });
      }
      if (cancelled) return;
      setRows(played.map(r => ({
        ...r,
        unlocked: unlockCounts[r.game_id] || 0,
        totalAchievements: totalCounts[r.game_id] || 0,
      })));
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const sorted = useMemo(() => {
    if (!rows) return rows;
    const arr = [...rows];
    if (sort === 'playtime') arr.sort((a, b) => b.total_seconds - a.total_seconds);
    else if (sort === 'completion') arr.sort((a, b) => (b.unlocked / (b.totalAchievements || 1)) - (a.unlocked / (a.totalAchievements || 1)));
    else arr.sort((a, b) => new Date(b.last_played_at) - new Date(a.last_played_at));
    return arr;
  }, [rows, sort]);

  if (!currentUser) {
    return (
      <div style={emptyStyle}>
        <p style={{ margin: 0 }}>
          <button onClick={onRequireAuth} style={linkBtn}>Sign in</button> to build your library — every game you play is tracked here with your playtime and achievements.
        </p>
      </div>
    );
  }
  if (rows === null) return <p>Loading your library…</p>;
  if (rows.length === 0) {
    return (
      <div style={emptyStyle}>
        <p style={{ margin: 0 }}>You haven't played anything yet. Hit <strong>Browse</strong> and jump into a game — it'll show up here.</p>
      </div>
    );
  }

  const totalSeconds = rows.reduce((s, r) => s + (r.total_seconds || 0), 0);
  const totalUnlocked = rows.reduce((s, r) => s + r.unlocked, 0);

  return (
    <>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18, color: '#cfcfcf', fontSize: 14 }}>
        <span>🎮 <strong>{rows.length}</strong> games played</span>
        <span>⏱️ <strong>{formatPlaytime(totalSeconds)}</strong> total playtime</span>
        <span>🏆 <strong>{totalUnlocked}</strong> achievements earned</span>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ ...selectStyle, marginLeft: 'auto' }}>
          <option value="recent">Recently played</option>
          <option value="playtime">Most played</option>
          <option value="completion">Completion %</option>
        </select>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {sorted.map(r => {
          const pct = r.totalAchievements ? Math.round((r.unlocked / r.totalAchievements) * 100) : null;
          return (
            <button key={r.game_id} onClick={() => onOpen(r.game.slug)} style={{
              display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
              background: 'var(--card-bg, #161821)', border: '1px solid var(--border, #262a36)',
              borderRadius: 12, padding: 10, cursor: 'pointer', color: 'inherit', width: '100%',
            }}>
              <div style={{ width: 96, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', background: '#0e0f13', flexShrink: 0 }}>
                {r.game.thumbnail_url
                  ? <img src={r.game.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ ...thumbPlaceholder, fontSize: 28 }}>🎮</div>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{r.game.title}</div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>@{r.game.creator?.username || 'unknown'}</div>
                <div style={{ display: 'flex', gap: 14, marginTop: 6, color: '#aaa', fontSize: 12, flexWrap: 'wrap' }}>
                  <span>⏱️ {formatPlaytime(r.total_seconds)}</span>
                  {r.totalAchievements > 0 && <span>🏆 {r.unlocked}/{r.totalAchievements} ({pct}%)</span>}
                  <span style={{ color: '#666' }}>Last played {timeAgo(r.last_played_at)}</span>
                </div>
                {r.totalAchievements > 0 && (
                  <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#ffd700' : 'var(--accent, #7c5cff)' }} />
                  </div>
                )}
              </div>
              <span style={{ color: 'var(--accent-2, #4ad6c4)', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                {r.total_seconds > 0 ? 'Continue →' : 'Play →'}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function segBtn(active) {
  return {
    border: 0, borderRadius: 999, padding: '7px 16px', cursor: 'pointer',
    fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
    background: active ? '#fff' : 'transparent',
    color: active ? '#0a0a0a' : '#cfcfcf',
    transition: 'background 0.15s ease, color 0.15s ease',
  };
}

// ============================================================
// Detail — iframe player + heartbeats + achievement listener (M2)
// ============================================================
function GameDetail({ slug, currentUser, onRequireAuth, onBack, onUserClick }) {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState([]);
  const [unlocked, setUnlocked] = useState(new Set());
  const [playtimeSeconds, setPlaytimeSeconds] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [toast, setToast] = useState(null);
  // Bumped whenever the player posts an improved score, so the leaderboard rail refetches.
  const [scoreVersion, setScoreVersion] = useState(0);
  const [srcDoc, setSrcDoc] = useState(null);
  const [srcDocError, setSrcDocError] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const saveStateRef = useRef({ local: {}, session: {} });
  const saveDebounceRef = useRef(null);

  const iframeRef = useRef(null);
  const playerWrapRef = useRef(null);

  // Load game + achievements + user-specific state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: g } = await supabase
        .from('games')
        .select('*, creator:creator_id(id,username,avatar_url), current_version:current_version_id(storage_path,manifest,version)')
        .eq('slug', slug)
        .maybeSingle();
      if (cancelled) return;
      setGame(g || null);
      setLikeCount(g?.like_count || 0);
      if (g?.id) {
        const { data: ach } = await supabase
          .from('game_achievements')
          .select('id,achievement_key,name,description,icon_url,display_order')
          .eq('game_id', g.id)
          .order('display_order');
        if (cancelled) return;
        setAchievements(ach || []);

        if (currentUser) {
          const [{ data: unl }, { data: pt }, { data: lk }] = await Promise.all([
            supabase.from('game_achievement_unlocks').select('achievement_id').eq('user_id', currentUser.id).eq('game_id', g.id),
            supabase.from('game_playtime').select('total_seconds').eq('user_id', currentUser.id).eq('game_id', g.id).maybeSingle(),
            supabase.from('game_likes').select('game_id').eq('user_id', currentUser.id).eq('game_id', g.id).maybeSingle(),
          ]);
          if (cancelled) return;
          setUnlocked(new Set((unl || []).map(u => u.achievement_id)));
          setPlaytimeSeconds(pt?.total_seconds || 0);
          setLiked(!!lk);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug, currentUser?.id]);

  // postMessage handler — receives heartbeats & achievement unlocks from the iframe
  useEffect(() => {
    if (!game?.id) return;
    const handler = async (e) => {
      // Only accept messages from our own iframe
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      const data = e.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'prmpted:heartbeat') {
        if (!currentUser) return; // logged-out: no tracking
        if (document.visibilityState !== 'visible') return;
        const { data: res } = await supabase.rpc('record_game_heartbeat', { p_game_id: game.id });
        if (res?.ok) setPlaytimeSeconds(s => s + 30);
        return;
      }

      if (data.type === 'prmpted:storage') {
        const kind = data.kind === 'session' ? 'session' : 'local';
        const next = data.data && typeof data.data === 'object' ? data.data : {};
        saveStateRef.current = { ...saveStateRef.current, [kind]: next };
        if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = setTimeout(() => {
          persistSaveState(currentUser, game.id, saveStateRef.current);
        }, 600);
        return;
      }

      if (data.type === 'prmpted:navigate') {
        const nextEntry = String(data.entry || '');
        if (!nextEntry || !/^[a-zA-Z0-9_\-./]+\.html?$/.test(nextEntry)) return;
        setSrcDoc(null);
        setSrcDocError(null);
        fetchGameDoc(baseHref, nextEntry, saveStateRef.current)
          .then(setSrcDoc)
          .catch(err => setSrcDocError(String(err)));
        return;
      }

      if (data.type === 'prmpted:score') {
        const rid = data.rid;
        const reply = (result) => {
          try { iframeRef.current?.contentWindow?.postMessage({ type: 'prmpted:score:result', rid, result }, '*'); } catch { /* sandboxed */ }
        };
        if (!currentUser) {
          setToast({ kind: 'info', text: 'Sign in to save your score to the leaderboard!' });
          reply({ ok: false, reason: 'unauthenticated' });
          return;
        }
        const score = Number(data.score);
        if (!isFinite(score)) { reply({ ok: false, reason: 'invalid_score' }); return; }
        const { data: res } = await supabase.rpc('submit_game_score', {
          p_game_id: game.id,
          p_board_key: typeof data.board === 'string' ? data.board : 'default',
          p_score: score,
          p_lower_is_better: !!data.lowerIsBetter,
          p_meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
        });
        reply(res || { ok: false });
        if (res?.ok) {
          setScoreVersion(v => v + 1);
          if (res.improved) {
            setToast({ kind: 'unlock', text: `New best: ${formatScore(score)} — rank #${res.rank} of ${res.total}` });
            setTimeout(() => setToast(null), 4500);
          }
        }
        return;
      }

      if (data.type === 'prmpted:achievement') {
        if (!currentUser) {
          // Stash a one-shot prompt so logged-out players see what they'd earn
          setToast({ kind: 'info', text: 'Sign in to claim this achievement!' });
          return;
        }
        const key = String(data.id || '');
        if (!key) return;
        const { data: res } = await supabase.rpc('unlock_game_achievement', {
          p_game_id: game.id, p_achievement_key: key,
        });
        if (res?.ok && res.achievement_id) {
          let wasNew = false;
          setUnlocked(prev => {
            if (prev.has(res.achievement_id)) return prev;
            wasNew = true;
            const next = new Set(prev);
            next.add(res.achievement_id);
            return next;
          });
          if (wasNew) {
            const a = achievements.find(x => x.id === res.achievement_id);
            setToast({ kind: 'unlock', text: `Achievement unlocked: ${a?.name || key} (+15 BP)` });
            setTimeout(() => setToast(null), 4500);
          }
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [game?.id, currentUser?.id, achievements]);

  const onToggleLike = async () => {
    if (!currentUser) { onRequireAuth?.(); return; }
    if (liked) {
      await supabase.from('game_likes').delete().eq('user_id', currentUser.id).eq('game_id', game.id);
      setLiked(false); setLikeCount(c => Math.max(0, c - 1));
    } else {
      await supabase.from('game_likes').insert({ user_id: currentUser.id, game_id: game.id });
      setLiked(true); setLikeCount(c => c + 1);
    }
  };

  const onFullscreen = () => {
    const el = playerWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  if (loading) return <p>Loading…</p>;
  if (!game) return (
    <div>
      <button onClick={onBack} className="games-detail-back" style={backBtn}>
        <BackArrow /> Games
      </button>
      <p>Game not found.</p>
    </div>
  );

  const version = game.current_version;
  const entry = version?.manifest?.entry || 'index.html';
  const externalUrl = game.external_url || null;
  const baseHref = !externalUrl && version?.storage_path
    ? `${STORAGE_PUBLIC_PREFIX}${version.storage_path.replace(/^\/+|\/+$/g, '')}/`
    : null;

  const isGameOwner = !!currentUser && currentUser.id === game?.creator?.id;

  const handleDeleteGame = async () => {
    if (!game || deleting || !isGameOwner) return;
    setDeleting(true);
    try {
      // Best-effort storage cleanup — never blocks the delete. The build +
      // initial covers live under `{slug}/`; edited covers live in `covers/`.
      // Storage RLS may reject these; that's fine, the DB row still goes.
      try {
        const bucket = 'games';
        const removeFolder = async (prefix) => {
          const stack = [prefix];
          const files = [];
          while (stack.length) {
            const dir = stack.pop();
            const { data: entries } = await supabase.storage.from(bucket).list(dir, { limit: 1000 });
            for (const e of entries || []) {
              const full = `${dir}/${e.name}`;
              if (e.id === null) stack.push(full); // a sub-folder
              else files.push(full);
            }
          }
          if (files.length) await supabase.storage.from(bucket).remove(files);
        };
        if (game.slug) await removeFolder(game.slug);
        const coverPaths = [game.thumbnail_url, game.splash_url]
          .filter(Boolean)
          .map((u) => { const i = u.indexOf('/games/'); return i >= 0 ? u.slice(i + '/games/'.length).split('?')[0] : null; })
          .filter((p) => p && p.startsWith('covers/'));
        if (coverPaths.length) await supabase.storage.from(bucket).remove(coverPaths);
      } catch (e) {
        console.warn('Game storage cleanup failed (non-fatal):', e);
      }

      // The delete itself — games_delete_creator RLS lets the owner through;
      // child rows (versions, likes, scores, achievements…) cascade.
      const { error } = await supabase.from('games').delete().eq('id', game.id);
      if (error) throw error;

      setShowDeleteConfirm(false);
      onBack();
    } catch (err) {
      console.error('Error deleting game:', err);
      setToast({ kind: 'error', text: 'Could not delete the game. Try again.' });
      setDeleting(false);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="games-detail-back" style={backBtn}>
        <BackArrow /> Games
      </button>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>{game.title}</h1>
        <span style={{ color: '#888' }}>by @{game.creator?.username || 'unknown'}</span>
        {isGameOwner && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => setShowEdit(true)} style={{
              background: 'transparent', border: '1px solid #2a2a2a',
              color: '#ccc', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13,
            }}>✏️ Edit</button>
            <button onClick={() => setShowDeleteConfirm(true)} style={{
              background: 'transparent', border: '1px solid #5a2330',
              color: '#ef4444', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13,
            }}>🗑️ Delete</button>
          </div>
        )}
      </div>
      {showDeleteConfirm && (
        <div
          onClick={() => !deleting && setShowDeleteConfirm(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100002, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 94vw)', background: '#15171c', border: '1px solid #2a2a2a', borderRadius: 14, padding: '1.4rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#fff' }}>Delete “{game.title}”?</h3>
            <p style={{ margin: '0 0 1.2rem', color: '#aaa', fontSize: 14, lineHeight: 1.5 }}>
              This permanently removes the game, its build, scores, likes, and achievements. This cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} style={{
                background: 'transparent', border: '1px solid #2a2a2a', color: '#ccc',
                borderRadius: 8, padding: '8px 16px', cursor: deleting ? 'default' : 'pointer', fontSize: 14,
              }}>Cancel</button>
              <button onClick={handleDeleteGame} disabled={deleting} style={{
                background: '#dc2626', border: 'none', color: '#fff', borderRadius: 8,
                padding: '8px 16px', cursor: deleting ? 'default' : 'pointer', fontSize: 14, fontWeight: 700, opacity: deleting ? 0.7 : 1,
              }}>{deleting ? 'Deleting…' : 'Delete game'}</button>
            </div>
          </div>
        </div>
      )}
      {showEdit && (
        <EditGameModal game={game} onClose={() => setShowEdit(false)} onSaved={(updated) => {
          setGame(g => ({ ...g, ...updated }));
          setShowEdit(false);
        }} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 20, marginTop: 16, alignItems: 'start' }}>
        {/* Player */}
        <div>
          <div
            ref={playerWrapRef}
            style={{ ...iframeWrap, aspectRatio: aspectToCss(game.aspect_ratio) }}
          >
            {!externalUrl && !baseHref ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                This game has no published build yet.
              </div>
            ) : !playing ? (
              <button onClick={async () => {
                setPlaying(true);
                if (externalUrl) return;
                try {
                  const initial = await loadSaveState(currentUser, game.id);
                  saveStateRef.current = initial;
                  const doc = await fetchGameDoc(baseHref, entry, initial);
                  setSrcDoc(doc);
                } catch (e) { setSrcDocError(String(e)); }
              }} style={playOverlay}>
                {game.splash_url && <img src={game.splash_url} alt="" style={splashImg} />}
                <span style={playBtnLabel}>▶ Play</span>
              </button>
            ) : externalUrl ? (
              <iframe
                ref={iframeRef}
                src={externalUrl}
                title={game.title}
                sandbox="allow-scripts allow-pointer-lock allow-same-origin allow-forms allow-popups"
                allow="gamepad; fullscreen; autoplay"
                referrerPolicy="no-referrer"
                loading="lazy"
                style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
              />
            ) : srcDocError ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#a04545', padding:20, textAlign:'center' }}>Failed to load game: {srcDocError}</div>
            ) : !srcDoc ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#888' }}>Loading game…</div>
            ) : (
              <iframe
                ref={iframeRef}
                srcDoc={srcDoc}
                title={game.title}
                sandbox="allow-scripts allow-pointer-lock"
                allow="gamepad; fullscreen"
                referrerPolicy="no-referrer"
                loading="lazy"
                style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={onToggleLike} style={iconBtn(liked)}>
              {liked ? '♥' : '♡'} {likeCount}
            </button>
            <button onClick={onFullscreen} style={iconBtn(false)}>⛶ Fullscreen</button>
            {currentUser && <span style={{ color: '#888', fontSize: 13 }}>Your playtime: {formatPlaytime(playtimeSeconds)}</span>}
          </div>

          {game.description && (
            <>
              <h3 style={{ marginTop: 24 }}>About</h3>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{game.description}</p>
            </>
          )}
          {game.controls && (
            <>
              <h3 style={{ marginTop: 18 }}>Controls</h3>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{game.controls}</p>
            </>
          )}
          {game.tool_disclosure && (
            <>
              <h3 style={{ marginTop: 18 }}>Made with</h3>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#aaa' }}>{game.tool_disclosure}</p>
            </>
          )}
        </div>

        {/* Achievements rail */}
        <aside>
          <h3 style={{ marginTop: 0 }}>Achievements</h3>
          {achievements.length === 0 ? (
            <p style={{ color: '#888', fontSize: 13 }}>No achievements declared for this game.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {achievements.map(a => {
                const got = unlocked.has(a.id);
                return (
                  <li key={a.id} style={{
                    border: '1px solid var(--border, #262a36)', borderRadius: 8, padding: 10,
                    opacity: got ? 1 : 0.55,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{got ? '🏆' : '🔒'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{a.name}</div>
                        {a.description && <div style={{ color: '#888', fontSize: 12 }}>{a.description}</div>}
                      </div>
                      {got && <span style={{ fontSize: 11, color: 'var(--accent-2, #4ad6c4)' }}>+15 BP</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {!currentUser && (
            <p style={{ color: '#888', fontSize: 12, marginTop: 12 }}>
              <button onClick={onRequireAuth} style={linkBtn}>Sign in</button> to earn achievements and track playtime.
            </p>
          )}

          <LeaderboardRail gameId={game.id} refreshKey={scoreVersion} currentUser={currentUser} onUserClick={onUserClick} />
        </aside>
      </div>

      {toast && (
        <div style={toastStyle(toast.kind)} onClick={() => setToast(null)}>{toast.text}</div>
      )}
    </div>
  );
}

// ============================================================
// Leaderboard rail — top scores for a game's board (Steam layer M2)
// ============================================================
function LeaderboardRail({ gameId, refreshKey, currentUser, onUserClick }) {
  const [rows, setRows] = useState(null); // null = loading, [] = empty
  const [boards, setBoards] = useState([]);
  const [board, setBoard] = useState('default');

  // Discover which boards this game has (a game declares them lazily on first score).
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('game_leaderboards')
        .select('board_key,label')
        .eq('game_id', gameId);
      if (cancelled) return;
      const list = data || [];
      setBoards(list);
      // Keep current selection if still valid, else default to first/known.
      if (list.length && !list.some(b => b.board_key === board)) {
        setBoard(list[0].board_key);
      }
    })();
    return () => { cancelled = true; };
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    (async () => {
      setRows(null);
      const { data } = await supabase.rpc('get_game_leaderboard', {
        p_game_id: gameId, p_board_key: board, p_limit: 10,
      });
      if (!cancelled) setRows(data || []);
    })();
    return () => { cancelled = true; };
  }, [gameId, board, refreshKey]);

  const boardLabel = (b) => b.label || (b.board_key === 'default' ? 'Leaderboard' : b.board_key);

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0 }}>🏆 Leaderboard</h3>
        {boards.length > 1 && (
          <select value={board} onChange={(e) => setBoard(e.target.value)} style={{ ...selectStyle, padding: '4px 10px', fontSize: 12 }}>
            {boards.map(b => <option key={b.board_key} value={b.board_key}>{boardLabel(b)}</option>)}
          </select>
        )}
      </div>

      {rows === null ? (
        <p style={{ color: '#888', fontSize: 13, marginTop: 10 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#888', fontSize: 13, marginTop: 10 }}>
          No scores yet. {currentUser ? 'Be the first to post one!' : 'Sign in and play to claim #1.'}
        </p>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 4 }}>
          {rows.map((r) => (
            <li key={r.user_id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
              background: r.is_me ? 'rgba(124,92,255,0.18)' : 'transparent',
              border: r.is_me ? '1px solid rgba(124,92,255,0.5)' : '1px solid transparent',
            }}>
              <span style={{ width: 28, textAlign: 'center', fontWeight: 700, color: rankColor(r.rank) }}>
                {medal(r.rank)}
              </span>
              {(() => {
                const clickable = onUserClick && r.user_id;
                return (
                  <div
                    onClick={clickable ? () => onUserClick(r.user_id) : undefined}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onUserClick(r.user_id); } } : undefined}
                    title={clickable ? `View @${r.username || 'player'}'s profile` : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: clickable ? 'pointer' : 'default' }}
                  >
                    {r.avatar_url
                      ? <img src={r.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                      : <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2a2e3a', display: 'inline-block' }} />}
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                      @{r.username || 'player'}{r.is_me ? ' (you)' : ''}
                    </span>
                  </div>
                );
              })()}
              <span style={{ fontWeight: 600, fontSize: 13 }}>{formatScore(r.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function medal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return rank;
}
function rankColor(rank) {
  if (rank === 1) return '#ffd700';
  if (rank === 2) return '#c0c0c0';
  if (rank === 3) return '#cd7f32';
  return '#888';
}
function formatScore(s) {
  const n = Number(s);
  if (!isFinite(n)) return String(s);
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ============================================================
// How to upload — slim banner + full modal
// ============================================================
function EditGameModal({ game, onClose, onSaved }) {
  const FIELDS = [
    { key: 'title',           label: 'Title',                  type: 'text' },
    { key: 'pitch',           label: 'Pitch (one-liner)',      type: 'text' },
    { key: 'description',     label: 'Description',            type: 'textarea' },
    { key: 'controls',        label: 'Controls',               type: 'textarea' },
    { key: 'tool_disclosure', label: 'Tool disclosure',        type: 'textarea' },
    { key: 'thumbnail_url',   label: 'Thumbnail URL',          type: 'url' },
    { key: 'splash_url',      label: 'Splash image URL',       type: 'url' },
    { key: 'external_url',    label: 'External game URL',      type: 'url' },
  ];
  const [form, setForm] = useState(() =>
    Object.fromEntries(FIELDS.map(f => [f.key, game[f.key] ?? '']))
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [uploading, setUploading] = useState(null); // 'thumbnail_url' | 'splash_url' | null

  const uploadImage = async (file, fieldKey) => {
    if (!file) return;
    setUploading(fieldKey); setErr(null);
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `covers/${game.id}-${fieldKey}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('games').upload(path, file, {
      cacheControl: '3600', upsert: false, contentType: file.type || `image/${ext}`,
    });
    if (upErr) { setErr(upErr.message); setUploading(null); return; }
    const { data } = supabase.storage.from('games').getPublicUrl(path);
    setForm(s => ({ ...s, [fieldKey]: data.publicUrl }));
    setUploading(null);
  };

  const save = async () => {
    setSaving(true); setErr(null);
    const patch = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v])
    );
    const { data, error } = await supabase
      .from('games').update(patch).eq('id', game.id).select().maybeSingle();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved(data || patch);
  };

  const fieldStyle = {
    width: '100%', background: '#0f1018', border: '1px solid #262a36',
    color: '#eee', borderRadius: 6, padding: '8px 10px', fontSize: 14,
    fontFamily: 'inherit',
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9998,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#161821', border: '1px solid #262a36', borderRadius: 12,
        maxWidth: 720, width: '100%', padding: '24px 28px', color: 'inherit',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Edit game</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, color: '#888', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>
        {FIELDS.map(f => {
          const isImage = f.key === 'thumbnail_url' || f.key === 'splash_url';
          return (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {f.label}
              </label>
              {f.type === 'textarea' ? (
                <textarea value={form[f.key] || ''} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} rows={3} style={fieldStyle} />
              ) : (
                <input type={f.type} value={form[f.key] || ''} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))} style={fieldStyle} placeholder={isImage ? 'Paste a URL, or upload a file below' : ''} />
              )}
              {isImage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <label style={{
                    background: '#0f1018', border: '1px solid #2a2a2a', color: '#bbb',
                    borderRadius: 6, padding: '6px 12px', cursor: uploading === f.key ? 'wait' : 'pointer', fontSize: 13,
                  }}>
                    {uploading === f.key ? 'Uploading…' : '📁 Upload image'}
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => uploadImage(e.target.files?.[0], f.key)} />
                  </label>
                  {form[f.key] && (
                    <img src={form[f.key]} alt="" style={{ height: 36, borderRadius: 4, border: '1px solid #2a2a2a' }} />
                  )}
                </div>
              )}
            </div>
          );
        })}
        {err && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#ccc', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{
            background: 'var(--accent, #7c5cff)', color: '#fff', border: 0,
            borderRadius: 8, padding: '9px 22px', cursor: saving ? 'wait' : 'pointer', fontWeight: 600,
          }}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

// Shared styles + playful hover animation for the two header action buttons.
// Both buttons share the same shape/size; only the fill differs. On hover they
// lift, glow, and the leading emoji does a little bounce-wiggle.
function GamesActionStyles() {
  return (
    <style>{`
      .games-action-btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border-radius: 10px;
        padding: 10px 18px;
        cursor: pointer;
        font-weight: 700;
        font-size: 14px;
        line-height: 1;
        transition: transform 0.18s ease, box-shadow 0.18s ease,
                    background 0.18s ease, border-color 0.18s ease;
      }
      .games-action-btn--ghost {
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.14);
      }
      .games-action-btn--solid {
        background: #ffffff;
        color: #0a0a0a;
        border: 1px solid #ffffff;
      }
      .games-action-btn:hover {
        transform: translateY(-2px) scale(1.04);
      }
      .games-action-btn--ghost:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.32);
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
      }
      .games-action-btn--solid:hover {
        box-shadow: 0 8px 26px rgba(255, 255, 255, 0.35);
      }
      .games-action-btn:active {
        transform: translateY(0) scale(0.97);
      }
      .games-action-btn:focus-visible {
        outline: 2px solid #7aa2ff;
        outline-offset: 2px;
      }
      .games-action-emoji {
        display: inline-block;
        transform-origin: 70% 70%;
      }
      .games-action-btn:hover .games-action-emoji {
        animation: gamesEmojiWiggle 0.5s ease;
      }
      @keyframes gamesEmojiWiggle {
        0%   { transform: rotate(0deg) scale(1); }
        25%  { transform: rotate(-14deg) scale(1.25); }
        50%  { transform: rotate(12deg) scale(1.25); }
        75%  { transform: rotate(-6deg) scale(1.15); }
        100% { transform: rotate(0deg) scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .games-action-btn { transition: background 0.18s ease, border-color 0.18s ease; }
        .games-action-btn:hover { transform: none; }
        .games-action-btn:active { transform: none; }
        .games-action-btn:hover .games-action-emoji { animation: none; }
      }
    `}</style>
  );
}

function HowToUploadBanner({ onOpen }) {
  return (
    <div style={{
      marginBottom: 20, padding: '14px 18px',
      background: 'linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 14, color: '#cfcfcf' }}>
        <strong style={{ color: '#fff' }}>First time uploading?</strong> Read this before you build — most failed submissions are fixable in 30 seconds at config time, not after.
      </span>
      <button onClick={onOpen} style={{
        background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 999, padding: '7px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
      }}>Open guide</button>
    </div>
  );
}

function HowToUploadModal({ onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9998,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--card-bg, #161821)', border: '1px solid var(--border, #262a36)',
        borderRadius: 12, maxWidth: 820, width: '100%', padding: '28px 32px', color: 'inherit',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>📖 How to upload your game</h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 0, color: '#888', fontSize: 24, cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>
        <p style={{ color: '#aaa', marginTop: 6 }}>
          prmpted Games runs your build inside a sandboxed iframe served from Supabase Storage. Follow these rules so it works on day one.
        </p>

        <div style={{
          marginTop: 16, padding: '14px 16px', background: 'rgba(124,92,255,0.08)',
          border: '1px solid rgba(124,92,255,0.3)', borderRadius: 10,
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>📦 Grab the Game Kit</div>
            <div style={{ fontSize: 13, color: '#bbb' }}>
              A zip with a human-readable guide and <code>prmpted.md</code> — drop the <code>.md</code> into Claude / Cursor / Lovable and say <em>"integrate prmpted per the instructions"</em>.
            </div>
          </div>
          <a href="/prmpted-game-kit.zip" download style={{
            background: 'var(--accent, #7c5cff)', color: '#fff', textDecoration: 'none',
            padding: '9px 16px', borderRadius: 8, fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap',
          }}>Download kit (.zip)</a>
        </div>

        <h3 style={howH3}>1. Your game must be 100% client-side</h3>
        <ul style={howUl}>
          <li>No backend, no Node server, no <code>/api/*</code> calls to your own domain.</li>
          <li>If your project has <code>server.js</code> or <code>express</code>, only the <strong>built static output</strong> can be uploaded.</li>
          <li>External CDNs / APIs are fine if they support CORS (Firebase, public REST APIs, etc.).</li>
        </ul>

        <h3 style={howH3}>2. Use relative asset paths (most common gotcha)</h3>
        <p style={{ margin: '6px 0' }}>Your <code>index.html</code> must reference assets with <strong>relative</strong> paths, not absolute (<code>/</code>-rooted).</p>
        <pre style={howPre}>{`✅ <script src="./assets/index.js"></script>
✅ <script src="assets/index.js"></script>
❌ <script src="/assets/index.js"></script>
❌ <script src="/my-game/assets/index.js"></script>`}</pre>
        <p style={{ margin: '6px 0' }}>Framework fixes:</p>
        <ul style={howUl}>
          <li><strong>Vite:</strong> add <code>base: './'</code> to <code>vite.config.ts</code>, then <code>npm run build</code>.</li>
          <li><strong>Create React App:</strong> set <code>"homepage": "."</code> in <code>package.json</code>, then <code>npm run build</code>.</li>
          <li><strong>Next.js:</strong> not supported (needs a server). Use <code>next export</code> on a static-only project.</li>
          <li><strong>Plain HTML/JS/Phaser/PixiJS:</strong> already relative — you're fine.</li>
        </ul>

        <h3 style={howH3}>3. Zip the contents, not the folder</h3>
        <p style={{ margin: '6px 0' }}>
          The zip's root must contain <code>index.html</code>. Don't zip a folder that contains the build — zip its contents.
        </p>
        <pre style={howPre}>{`✅ my-game.zip
   ├── index.html
   ├── assets/
   └── ...

⚠️ Tolerated (auto-stripped):
   my-game.zip
   └── dist/
       ├── index.html
       └── ...

❌ Multiple top-level folders:
   my-game.zip
   ├── src/
   └── dist/`}</pre>
        <p style={{ margin: '6px 0', fontSize: 13, color: '#aaa' }}>
          PowerShell: <code>Compress-Archive -Path .\dist\* -DestinationPath my-game.zip</code>
        </p>

        <h3 style={howH3}>4. Size & file limits</h3>
        <ul style={howUl}>
          <li><strong>200 MB max</strong> per zip. Compress images (WebP), trim unused audio, drop sourcemaps.</li>
          <li>Keep your build under ~20 MB if you can — players on mobile data will thank you.</li>
        </ul>

        <h3 style={howH3}>5. Sandbox limitations</h3>
        <p style={{ margin: '6px 0' }}>Your game runs inside a sandboxed iframe. What works:</p>
        <ul style={howUl}>
          <li>✅ <strong><code>localStorage</code> / <code>sessionStorage</code> work and persist</strong> — prmpted bridges them to a per-user save (Supabase if signed in, browser cache if anon). No code required.</li>
          <li>✅ Canvas, WebGL, WebAudio, Gamepad API, fullscreen, pointer lock, fetch to CORS-friendly URLs.</li>
          <li>⚠️ <code>IndexedDB</code> is not bridged — migrate large state to <code>localStorage</code> if you want it to persist for signed-in players.</li>
          <li>❌ Cookies, top-level navigation, popups to non-game URLs, direct access to the parent prmpted page.</li>
        </ul>

        <h3 style={howH3}>6. Awarding achievements (optional, recommended)</h3>
        <p style={{ margin: '6px 0' }}>
          The platform auto-injects a tiny SDK into your <code>index.html</code> at upload time. From your game code, call:
        </p>
        <pre style={howPre}>{`window.prmpted.unlock('first_blood');
window.prmpted.unlock('level_10_complete');`}</pre>
        <p style={{ margin: '6px 0' }}>
          Each unique <code>achievement_key</code> you defined in Step 4 of the submission form awards the player <strong>+15 Builder Points</strong>.
          Unlocks are idempotent — calling twice is safe. Heartbeats (playtime tracking) are automatic; no code needed.
        </p>

        <h3 style={howH3}>7. Required tags & disclosure</h3>
        <ul style={howUl}>
          <li>You must pick at least <strong>one genre</strong> and <strong>one AI tool</strong> tag (Claude, Lovable, Cursor, etc.).</li>
          <li>The "tool disclosure" field is public — be honest. Example: <em>"Built with Claude Sonnet for code, Suno for music, Photoshop for art."</em></li>
        </ul>

        <h3 style={howH3}>8. Review process</h3>
        <ul style={howUl}>
          <li>Submissions go to <code>in_review</code>. A human approves or requests changes.</li>
          <li>Approved games appear in the public grid. Likes earn <strong>you</strong> +1 BP each (self-likes don't count).</li>
          <li>Need to update? Re-upload from your submission card — version bumps to <code>v2</code>, etc.</li>
        </ul>

        <h3 style={howH3}>9. Quick pre-flight checklist</h3>
        <ul style={howUl}>
          <li>☐ Built with <code>base: './'</code> (or framework equivalent)</li>
          <li>☐ Opens <code>dist/index.html</code> by double-click and it works locally</li>
          <li>☐ Zip root contains <code>index.html</code>, not a wrapping folder</li>
          <li>☐ Under 200 MB</li>
          <li>☐ Thumbnail ready (1280×720 PNG/JPG)</li>
          <li>☐ Uses <code>localStorage</code> for saves (not IndexedDB)</li>
        </ul>

        <div style={{ marginTop: 20, padding: 12, background: 'rgba(124,92,255,0.1)', borderRadius: 8, fontSize: 13, color: '#ccc' }}>
          <strong>Stuck?</strong> Open your built <code>index.html</code> in a browser via <code>file://</code> — if it loads with broken images / blank screen, you have absolute paths. Fix that first.
        </div>

        <button onClick={onClose} style={{
          marginTop: 18, background: 'var(--accent, #7c5cff)', color: '#fff', border: 0,
          borderRadius: 8, padding: '10px 22px', cursor: 'pointer', fontWeight: 600,
        }}>Got it</button>
      </div>
    </div>
  );
}

const howH3 = { marginTop: 22, marginBottom: 6 };
const howUl = { margin: '6px 0', paddingLeft: 22, lineHeight: 1.7 };
const howPre = {
  background: '#0e0f13', border: '1px solid var(--border, #262a36)',
  borderRadius: 6, padding: 12, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre',
  color: '#ccc',
};

// Fetch the game's HTML entry from storage, inject a <base> tag so relative
// asset paths (./assets/foo.js) resolve against the storage URL. Returned
// string is fed to <iframe srcDoc>. We do this instead of loading the URL
// directly because Supabase Storage force-serves .html as text/plain.
async function fetchGameDoc(baseHref, entry, initialState) {
  if (!baseHref) throw new Error('no baseHref');
  const res = await fetch(baseHref + entry);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  let html = await res.text();
  // <base> isn't reliably honored across browsers for srcdoc iframes, so we
  // rewrite every relative src=/href= to an absolute storage URL directly.
  html = html.replace(/((?:src|href)\s*=\s*["'])(?!https?:|\/\/|data:|blob:|#|mailto:|javascript:)([^"']+)(["'])/gi,
    (_m, p1, p2, p3) => `${p1}${new URL(p2, baseHref).href}${p3}`);
  // <base> makes all relative asset URLs resolve to storage so JS/CSS load.
  // Nav interceptor catches clicks on internal .html links and bounces them
  // to the parent so we can re-fetch and swap srcdoc (browsers would otherwise
  // navigate the iframe directly to a Supabase Storage URL, which returns the
  // file as text/plain).
  const base = baseHref.replace(/\/+$/, '/');
  // localStorage / sessionStorage polyfill: opaque-origin sandboxes block real
  // Web Storage with a SecurityError. We seed an in-memory store from the
  // hydrated state and post every mutation back to the parent for persistence
  // (DB for logged-in users, parent localStorage for logged-out).
  const stateScript = `<script>(function(){
    var seed = ${JSON.stringify(initialState || {})};
    function makeStorage(kind){
      var store = Object.assign({}, seed[kind] || {});
      function flush(){
        try { parent.postMessage({ type:'prmpted:storage', kind:kind, data:store }, '*'); } catch(_) {}
      }
      var api = {
        getItem: function(k){ return Object.prototype.hasOwnProperty.call(store,k) ? String(store[k]) : null; },
        setItem: function(k,v){ store[String(k)] = String(v); flush(); },
        removeItem: function(k){ delete store[String(k)]; flush(); },
        clear: function(){ store = {}; flush(); },
        key: function(i){ return Object.keys(store)[i] || null; },
      };
      Object.defineProperty(api, 'length', { get: function(){ return Object.keys(store).length; } });
      return api;
    }
    try {
      Object.defineProperty(window, 'localStorage', { value: makeStorage('local'), configurable: true });
      Object.defineProperty(window, 'sessionStorage', { value: makeStorage('session'), configurable: true });
    } catch(e) { /* already real storage exists, leave it */ }
  })();</script>`;
  const navScript = `<script>(function(){
    var BASE = ${JSON.stringify(base)};
    function isInternalHtml(href){
      try { var u = new URL(href, BASE); return u.href.indexOf(BASE) === 0 && /\\.html?($|[?#])/i.test(u.pathname); }
      catch(_) { return false; }
    }
    document.addEventListener('click', function(e){
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href[0] === '#') return;
      if (isInternalHtml(href)) {
        e.preventDefault();
        var u = new URL(href, BASE);
        var entry = u.href.slice(BASE.length);
        parent.postMessage({ type: 'prmpted:navigate', entry: entry }, '*');
      }
    }, true);
  })();</script>`;
  const baseTag = `<base href="${baseHref}">`;
  // stateScript MUST come before any game scripts run.
  const inject = baseTag + stateScript + navScript;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${inject}`);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (m) => `${m}<head>${inject}</head>`);
  } else {
    html = `<head>${inject}</head>${html}`;
  }
  return html;
}

// ---- save-state helpers ----
function localStorageKey(gameId) { return `prmpted_game_save_${gameId}`; }

async function loadSaveState(user, gameId) {
  if (user) {
    const { data } = await supabase
      .from('game_save_states')
      .select('data')
      .eq('user_id', user.id).eq('game_id', gameId)
      .maybeSingle();
    return (data?.data && typeof data.data === 'object') ? data.data : { local: {}, session: {} };
  }
  try {
    const raw = window.localStorage.getItem(localStorageKey(gameId));
    if (!raw) return { local: {}, session: {} };
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : { local: {}, session: {} };
  } catch { return { local: {}, session: {} }; }
}

async function persistSaveState(user, gameId, state) {
  if (user) {
    await supabase.from('game_save_states').upsert({
      user_id: user.id, game_id: gameId, data: state, updated_at: new Date().toISOString(),
    });
    return;
  }
  try { window.localStorage.setItem(localStorageKey(gameId), JSON.stringify(state)); } catch { /* quota */ }
}

// ---- helpers + styles ----
function formatPlaytime(s) {
  if (!s) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function aspectToCss(r) {
  switch (r) {
    case '4:3': return '4 / 3';
    case '1:1': return '1 / 1';
    case '9:16': return '9 / 16';
    default: return '16 / 9';
  }
}

const gridStyle = { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' };
const cardStyle = {
  textAlign: 'left', background: 'var(--card-bg, #161821)', border: '1px solid var(--border, #262a36)',
  borderRadius: 10, overflow: 'hidden', cursor: 'pointer', color: 'inherit', padding: 0,
};
const thumbWrap = { aspectRatio: '16/9', background: '#0e0f13', display: 'block' };
const thumbImg = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
const thumbPlaceholder = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 40 };
const selectStyle = {
  background: '#141414', color: '#fff',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '7px 14px',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const chipStyle = (active) => ({
  display: 'inline-block',
  background: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)',
  color: active ? '#ffffff' : '#d0d0d0',
  border: active ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
  borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  lineHeight: 1.4, transition: 'background 0.18s ease, border-color 0.18s ease, color 0.18s ease',
});
const emptyStyle = {
  border: '1px dashed var(--border, #262a36)', borderRadius: 10, padding: 40, textAlign: 'center', color: '#888',
};
const iframeWrap = {
  width: '100%', background: '#0e0f13',
  border: '1px solid var(--border, #262a36)', borderRadius: 10, overflow: 'hidden', position: 'relative',
};
const playOverlay = {
  position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, padding: 0,
  background: '#0e0f13', cursor: 'pointer', color: '#fff',
};
const splashImg = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 };
const playBtnLabel = {
  position: 'relative', display: 'inline-block', padding: '12px 22px',
  background: 'rgba(0,0,0,0.55)', borderRadius: 999, fontSize: 18, fontWeight: 600,
};
const linkBtn = {
  background: 'transparent', border: 0, color: 'var(--accent-2, #4ad6c4)', cursor: 'pointer', padding: 0,
};
// Clean boxed back button — mirrors the tool detail page's ".back-button" so
// players always have an obvious way out of a game (incl. on desktop).
const backBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '8px 14px',
  background: 'var(--bg-tertiary, rgba(255,255,255,0.05))',
  border: '1px solid var(--border, #262a36)',
  borderRadius: 8,
  color: 'var(--text-primary, #fff)',
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
function BackArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
const iconBtn = (active) => ({
  background: active ? 'var(--accent, #7c5cff)' : 'var(--card-bg, #161821)',
  color: active ? '#fff' : 'inherit',
  border: '1px solid var(--border, #262a36)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
});
const toastStyle = (kind) => ({
  position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
  background: kind === 'unlock' ? 'var(--accent, #7c5cff)' : 'var(--card-bg, #161821)',
  color: '#fff', padding: '12px 20px', borderRadius: 999, cursor: 'pointer',
  boxShadow: '0 4px 20px rgba(0,0,0,0.4)', zIndex: 9999, fontSize: 14, fontWeight: 600,
});
