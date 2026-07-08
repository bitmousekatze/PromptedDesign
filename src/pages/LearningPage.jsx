import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { uploadPostImage } from '../lib/storage.js';
import { moderateContent } from '../lib/moderation.js';
import { ListItemSkeleton, SkeletonBlock } from '../components/SkeletonLoader.jsx';
import PageLoader from '../components/PageLoader.jsx';
import {
  fetchTracks, fetchProjects, fetchMyProgress, fetchMySubmissions, fetchMyAttempts,
  getProjectQuiz, submitQuiz, submitProject, fetchSubmissionFull, fetchSubmissionsToGrade,
  gradeProject, likeGradeComment, gpaToLetter, gradeDistribution, LETTER_MEANING,
  fetchLearningLeaderboards, modelsForTrack,
  getCommunityProjects, createCommunityProject, listPendingCommunityProjects,
  approveCommunityProject, rejectCommunityProject,
} from '../lib/learning.js';
const CafeteriaChat = React.lazy(() => import('../components/CafeteriaChat.jsx'));

// Mirror App.jsx's platform-admin check (is_admin flag OR known admin usernames) so
// admins can manage Cafeteria channels even before the profiles.is_admin flag is set.
const LEARN_ADMIN_USERNAMES = ['herz', 'mouse', 'devmouse'];

// ── theme ────────────────────────────────────────────────────────────────────
const C = {
  bg: '#0b0e14', panel: '#141a24', panel2: '#1b2331', line: '#26303f',
  text: '#e6edf3', muted: '#94a3b8', accent: '#4ECDC4', gold: '#C9A227',
  good: '#34d399', warn: '#fbbf24', mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
};
const subst = (text, track) => (text || '').split('{model}').join(track?.title || 'the AI');

// Lightweight router: /learn, /learn/community, /learn/s/<uuid>, /learn/<toolId>
function parseRoute() {
  const m = window.location.pathname.match(/^\/learn(?:\/(s\/[0-9a-f-]{36}|[a-z0-9-]+))?\/?$/i);
  if (!m || !m[1]) return { view: 'tracks' };
  if (m[1].startsWith('s/')) return { view: 'submission', submissionId: m[1].slice(2) };
  if (m[1].toLowerCase() === 'community') return { view: 'community' };
  return { view: 'track', tool: m[1] };
}

export default function LearningPage({ currentUser, profile, onRequireAuth, addToast }) {
  const isAdmin = !!profile?.is_admin || LEARN_ADMIN_USERNAMES.includes(profile?.username);
  const toast = addToast || ((m) => console.log('[learn]', m));
  const [route, setRoute] = useState(parseRoute());
  const [tracks, setTracks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);

  const reloadProgress = async () => {
    if (currentUser?.id) setProgress(await fetchMyProgress(currentUser.id));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, p] = await Promise.all([fetchTracks(), fetchProjects()]);
        if (cancelled) return;
        setTracks(t);
        setProjects(p);
        if (currentUser?.id) setProgress(await fetchMyProgress(currentUser.id));
      } catch (e) {
        console.error('Learning load failed', e);
        toast('Could not load Learning.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    const onHome = () => { window.history.replaceState({}, '', '/learn'); setRoute({ view: 'tracks' }); window.scrollTo({ top: 0 }); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('prmpted:learn-home', onHome);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('prmpted:learn-home', onHome); };
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(parseRoute());
    window.scrollTo({ top: 0 });
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '120px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
          {[1,2,3,4,5,6].map(i => <SkeletonBlock key={i} height={120} style={{ borderRadius: 12 }} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 120px', color: C.text }}>
      <LearnStyles />
      {route.view === 'tracks' && (
        <TrackPicker tracks={tracks} progress={progress} currentUser={currentUser} profile={profile} isAdmin={isAdmin} totalProjects={projects.length} onOpen={(t) => navigate(`/learn/${t.tool_id}`)} onOpenCommunity={() => navigate('/learn/community')} />
      )}
      {route.view === 'community' && (
        <CommunityView
          tracks={tracks}
          currentUser={currentUser}
          profile={profile}
          isAdmin={isAdmin}
          toast={toast}
          onRequireAuth={onRequireAuth}
          onBack={() => navigate('/learn')}
          onOpenSubmission={(id) => navigate(`/learn/s/${id}`)}
        />
      )}
      {route.view === 'track' && (() => {
        const track = tracks.find((t) => t.tool_id === route.tool);
        return (
          <TrackView
            track={track}
            progressRow={track ? progress[track.id] : null}
            projects={projects}
            currentUser={currentUser}
            onRequireAuth={onRequireAuth}
            toast={toast}
            onBack={() => navigate('/learn')}
            onProgressChange={reloadProgress}
            onOpenSubmission={(id) => navigate(`/learn/s/${id}`)}
          />
        );
      })()}
      {route.view === 'submission' && (
        <SubmissionView
          submissionId={route.submissionId}
          tracks={tracks}
          projects={projects}
          currentUser={currentUser}
          onRequireAuth={onRequireAuth}
          toast={toast}
          onBack={() => window.history.length > 1 ? window.history.back() : navigate('/learn')}
        />
      )}
    </div>
  );
}

// ── track picker ───────────────────────────────────────────────────────────
function TrackPicker({ tracks, progress, currentUser, profile, isAdmin, totalProjects, onOpen, onOpenCommunity }) {
  const total = totalProjects || 10;
  const [cafeOpen, setCafeOpen] = useState(false);
  const [cafeUnread, setCafeUnread] = useState(false);
  const cafeOpenRef = useRef(false);
  const seenKey = currentUser?.id ? `cafe_seen_${currentUser.id}` : 'cafe_seen';
  useEffect(() => { cafeOpenRef.current = cafeOpen; }, [cafeOpen]);

  const markSeen = () => { try { localStorage.setItem(seenKey, new Date().toISOString()); } catch {} setCafeUnread(false); };
  const openCafe = () => { setCafeOpen(true); markSeen(); };
  const closeCafe = () => { setCafeOpen(false); markSeen(); };

  // Unread dot: are there messages newer than the last time this user opened the Cafeteria?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from('cafeteria_messages').select('created_at').order('created_at', { ascending: false }).limit(1);
        const latest = data?.[0]?.created_at;
        const seen = (() => { try { return localStorage.getItem(seenKey); } catch { return null; } })();
        if (!cancelled && latest && (!seen || new Date(latest) > new Date(seen))) setCafeUnread(true);
      } catch {}
    })();
    const sub = supabase.channel('cafeteria-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cafeteria_messages' }, (payload) => {
        if (!cafeOpenRef.current && payload.new?.user_id !== currentUser?.id) setCafeUnread(true);
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(sub); };
  }, [currentUser?.id, seenKey]);

  return (
    <>
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 640 }}>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: '-0.02em' }}>
            Learn <span style={{ background: `linear-gradient(90deg,${C.accent},${C.gold})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>by building</span>
          </h1>
          <p style={{ color: C.muted, margin: '8px 0 0' }}>
            Pick an AI model and build {total} small projects with it - from a single web page up to a real little app, and on to MCP.
            You build it yourself with the model's help, post your result, and the community grades it and helps you improve.
          </p>
        </div>
        <button className="lrn-cafeteria-btn" onClick={openCafe} title="Open the Cafeteria - live chat">
          🍽️ Cafeteria
          {cafeUnread && <span className="lrn-cafe-dot" />}
        </button>
      </header>

      {cafeOpen && (
        <div className="lrn-cafe-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeCafe(); }}>
          <div className="lrn-cafe-panel">
            <div className="lrn-cafe-panel-head">
              <span>🍽️ Cafeteria <small>- grab a seat, chat, ask questions</small></span>
              <button className="lrn-x" onClick={closeCafe} aria-label="Close">✕</button>
            </div>
          <div className="lrn-cafe-panel-body">
            <React.Suspense fallback={null}>
              <CafeteriaChat user={currentUser} profile={profile} isAdmin={isAdmin} onActivity={markSeen} />
            </React.Suspense>
          </div>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
        {tracks.map((t) => {
          const pr = progress[t.id];
          const done = pr?.completed_projects || 0;
          const letter = gpaToLetter(pr?.avg_grade);
          return (
            <button key={t.id} onClick={() => onOpen(t)} className="lrn-card lrn-model-card" style={{ '--accent': t.accent_color }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{t.title}</div>
                  <div style={{ color: C.muted, fontSize: 13, fontFamily: C.mono }}>
                    {t.is_local ? 'local · no API key' : (t.model_label || '')}
                  </div>
                </div>
                <ProgressRing value={done} max={total} color={t.accent_color} />
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: t.accent_color, boxShadow: `0 0 0 3px ${t.accent_color}33` }} />
                <span style={{ color: C.muted, fontSize: 13 }}>
                  {done >= total ? 'Certified 🎓' : `${done} / ${total} projects`}
                </span>
                {letter && (
                  <span style={{ marginLeft: 'auto', fontFamily: C.mono, fontWeight: 700, color: t.accent_color }}>{letter}</span>
                )}
              </div>
              <span className="lrn-card-cta">{done >= total ? 'Review build' : (done > 0 ? 'Keep building' : 'Start building')} <i>→</i></span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onOpenCommunity}
        className="lrn-card lrn-model-card"
        style={{ '--accent': C.gold, width: '100%', marginTop: 16, display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}
      >
        <span style={{ fontSize: 30 }}>🛠️</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 18, fontWeight: 700 }}>Community Projects</span>
          <span style={{ display: 'block', color: C.muted, fontSize: 13, marginTop: 2 }}>
            Projects made by other builders - or write your own and teach the community. Pick any model to build them with.
          </span>
        </span>
        <span className="lrn-card-go" style={{ color: C.gold, fontWeight: 700 }}>Explore <i>→</i></span>
      </button>

      <LearningLeaderboards currentUser={currentUser} />
    </>
  );
}

// ── leaderboards (separate from Builder Points) ──────────────────────────────
// One board at a time, switched by pill tabs, shown as a polished ranked list.
const LB_TABS = [
  { key: 'teachers', label: 'Top Teachers', icon: '🧑‍🏫', blurb: 'Most builds graded for the community' },
  { key: 'students', label: 'Top Students', icon: '🚀', blurb: 'Most projects completed across tracks' },
  { key: 'gpa',      label: 'Best GPA',     icon: '🏅', blurb: 'Highest average grade on their builds' },
];

// Right-hand metric for a row on the given board.
function lbMetric(key, r) {
  if (key === 'teachers') return { main: `${r.grades_cast}`, unit: r.grades_cast === 1 ? 'grade given' : 'grades given', sub: r.helpful_count > 0 ? `${r.helpful_count} helpful` : null };
  if (key === 'students') return { main: `${r.completed_projects}`, unit: r.completed_projects === 1 ? 'project' : 'projects', sub: r.certifications > 0 ? `${r.certifications} certified 🎓` : null };
  const letter = gpaToLetter(r.gpa);
  if (r.gpa == null) return { main: '-', unit: 'no grade yet', sub: null, dim: true };
  return { main: letter || Number(r.gpa).toFixed(2), unit: `${Number(r.gpa).toFixed(2)} GPA`, sub: `${r.graded_submissions} graded` };
}

function LearningLeaderboards({ currentUser }) {
  const [tab, setTab] = useState('teachers');
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [info, setInfo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLearningLeaderboards(50)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { console.error('Leaderboards load failed', e); if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  const active = LB_TABS.find((t) => t.key === tab);
  const rows = data ? (data[tab] || []) : null;

  return (
    <section style={{ marginTop: 44 }}>
      <div className="lrn-lb-head">
        <h2 className="lrn-h-game" style={{ fontSize: 26, margin: 0 }}>Leaderboards</h2>
        <button
          className={`lrn-lb-info ${info ? 'on' : ''}`}
          onClick={() => setInfo((v) => !v)}
          aria-expanded={info}
          title="How scoring works"
        >
          <span aria-hidden>ⓘ</span> How it works
        </button>
      </div>
      <p style={{ color: C.muted, margin: '4px 0 16px', fontSize: 13 }}>
        The Learn tab's own ranking - separate from Builder Points. Climb it by teaching and learning.
      </p>

      {info && (
        <div className="lrn-lb-explain">
          <ul>
            <li>
              <b>🧑‍🏫 Top Teachers</b> - grade other people's builds. Every project you grade with real
              feedback moves you up. <i>Tiebreak: grades the builder marked helpful.</i>
            </li>
            <li>
              <b>🚀 Top Students</b> - finish projects. Each build you submit across any track counts.
              <i> Tiebreak: tracks you've certified 🎓.</i>
            </li>
            <li>
              <b>🏅 Best GPA</b> - your average grade across builds peers have graded. Needs{' '}
              {data?.gpaMinGraded ?? 2}+ graded build{(data?.gpaMinGraded ?? 2) === 1 ? '' : 's'} to qualify,
              so one lucky A can't top it.
            </li>
          </ul>
          <div className="lrn-lb-scale">
            <span className="lrn-lb-scale-label">GPA scale</span>
            <span><b className="A">A</b> = 4.0</span>
            <span><b className="B">B</b> = 3.0</span>
            <span><b className="C">C</b> = 2.0</span>
            <span><b className="D">D</b> = 1.0</span>
          </div>
          <p className="lrn-lb-sep">
            Scored only from Learn activity - climbing here never touches your Builder Points, and BP
            never inflates your grades.
          </p>
        </div>
      )}

      <div className="lrn-lb-tabs">
        {LB_TABS.map((t) => (
          <button key={t.key} className={`lrn-lb-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
            <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      <div className="lrn-lb-blurb">
        {active?.blurb}
        {tab === 'gpa' && data?.gpaMinGraded ? ` · needs ${data.gpaMinGraded}+ graded build${data.gpaMinGraded === 1 ? '' : 's'} to qualify` : ''}
      </div>

      <div className="lrn-lb-board">
        {error ? (
          <div className="lrn-lb-msg">Couldn't load the leaderboard.</div>
        ) : !rows ? (
          <div className="lrn-lb-msg"><PageLoader size={20} text="" /></div>
        ) : rows.length === 0 ? (
          <div className="lrn-lb-msg">Nobody on the board yet - be the first.</div>
        ) : rows.map((r, i) => {
          const m = lbMetric(tab, r);
          const me = currentUser?.id === r.user_id;
          const rank = i + 1;
          return (
            <div key={r.user_id} className={`lrn-lb-row ${me ? 'me' : ''}`}>
              <span className={`lrn-lb-rank ${rank <= 3 ? `top${rank}` : ''}`}>
                {rank <= 3 ? ['🥇', '🥈', '🥉'][i] : rank}
              </span>
              <Avatar p={r} />
              <span className="lrn-lb-id">
                <span className="lrn-lb-name">@{r.username || 'someone'}{me && <span className="lrn-lb-you"> · you</span>}</span>
                <span className="lrn-lb-bp">{Number(r.builder_points || 0).toLocaleString()} BP</span>
              </span>
              <span className={`lrn-lb-metric ${m.dim ? 'dim' : ''}`}>
                <span className="lrn-lb-main">{m.main}</span>
                <span className="lrn-lb-unit">{m.sub || m.unit}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── track view: the build-path + report card ─────────────────────────────────
function TrackView({ track, progressRow, projects, currentUser, onRequireAuth, toast, onBack, onProgressChange, onOpenSubmission }) {
  const [subs, setSubs] = useState({});
  const [openProject, setOpenProject] = useState(null);
  const [grading, setGrading] = useState(false);
  const trackModels = modelsForTrack(track?.tool_id);
  const [model, setModel] = useState(() => trackModels[0] || '');

  const reloadSubs = async () => {
    if (currentUser?.id && track?.id) setSubs(await fetchMySubmissions(currentUser.id, track.id));
  };
  useEffect(() => { reloadSubs(); /* eslint-disable-next-line */ }, [currentUser?.id, track?.id]);
  // Reset the chosen model when switching tracks.
  useEffect(() => { setModel(modelsForTrack(track?.tool_id)[0] || ''); }, [track?.tool_id]);

  if (!track) return <div style={{ color: C.muted }}>Track not found. <button className="lrn-link" onClick={onBack}>Back</button></div>;

  // A project unlocks when the previous one has a submission (project 1 always open).
  const completedNumbers = new Set();
  projects.forEach((p) => { if (subs[p.id]) completedNumbers.add(p.project_number); });
  const isUnlocked = (n) => n === 1 || completedNumbers.has(n - 1);
  // The single "do this next" node: lowest unlocked project without a submission.
  const currentNumber = projects
    .filter((p) => isUnlocked(p.project_number) && !subs[p.id])
    .reduce((min, p) => Math.min(min, p.project_number), Infinity);

  const onNodeClick = (p) => {
    if (!currentUser) return onRequireAuth?.();
    if (!isUnlocked(p.project_number)) return toast(`Finish project ${p.project_number - 1} to unlock this one.`);
    setOpenProject(p);
  };

  return (
    <>
      <button className="lrn-link" onClick={onBack} style={{ marginBottom: 12 }}>← All tracks</button>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: track.accent_color, boxShadow: `0 0 0 4px ${track.accent_color}33` }} />
        <h1 className="lrn-h-game" style={{ margin: 0, fontSize: 32 }}>{track.title}</h1>
        {trackModels.length > 1 ? (
          <select className="lrn-model-select" value={model} onChange={(e) => setModel(e.target.value)}
            style={{ borderColor: track.accent_color, color: track.accent_color }} aria-label="Model to build with">
            {trackModels.map((m) => <option key={m} value={m} style={{ color: C.text }}>{m}</option>)}
          </select>
        ) : (
          <span style={{ color: C.muted, fontFamily: C.mono, fontSize: 13 }}>
            {track.is_local ? 'local / open-source' : (trackModels[0] || track.model_label)}
          </span>
        )}
        <button className="lrn-btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setGrading(true)}>🧑‍🏫 Grade others' builds</button>
      </header>
      <p style={{ color: C.muted, marginTop: 0 }}>
        Build all {projects.length} with {track.title}. Each one unlocks the next. Finish them all to earn the “Certified in {track.title}” badge.
      </p>

      <div className="lrn-track-grid">
        <BuildPath
          track={track} projects={projects} subs={subs}
          isUnlocked={isUnlocked} currentNumber={currentNumber} onNodeClick={onNodeClick}
        />
        <ReportCard
          track={track} projects={projects} subs={subs} progressRow={progressRow}
          onOpenNotes={onOpenSubmission}
        />
      </div>

      {openProject && (
        <ProjectPanel
          track={track}
          project={openProject}
          existingSub={subs[openProject.id] || null}
          currentUser={currentUser}
          trackModel={model}
          toast={toast}
          onClose={() => setOpenProject(null)}
          onChanged={async () => { await reloadSubs(); await onProgressChange?.(); }}
          onOpenSubmission={onOpenSubmission}
        />
      )}
      {grading && (
        <GradeBrowser
          track={track}
          projects={projects}
          currentUser={currentUser}
          onClose={() => setGrading(false)}
          onOpenSubmission={(id) => { setGrading(false); onOpenSubmission(id); }}
        />
      )}
    </>
  );
}

// ── the winding build-path (the Candy-Crush-style "game board") ───────────────
// Chunky candy nodes zig-zag down a winding dashed road. The road fills in bright
// as you clear levels, each finished level earns 1–3 stars from its community
// grade, and a bouncing pin marks the level you're on. Node state - done /
// current / locked - comes from the learner's submissions.
// Serpentine offsets: two rightward bulges that read as a snaking trail and never
// clip the left edge (the array cycles if the project count ever changes).
// Board geometry - a fixed-width scene centered in the column so the trail runs
// down the MIDDLE with forest framing both sides. All scene coords live in this
// 0..BOARD_W space; node titles sit centered BELOW each node (not beside it) to
// keep both flanks clear for the woods.
const BOARD_W = 480, BOARD_CX = 240, BOARD_AMP = 92;
const NODE_SIZE = 62, NODE_PITCH = 120, PATH_PAD = 40;
// Serpentine wave (-1..1, cycled if a track has more nodes): a gentle double-S so
// the trail weaves between the left and right woods instead of hugging one edge.
const TRAIL_WAVE = [-0.15, 0.5, 0.95, 0.55, -0.1, -0.65, -0.95, -0.55, 0.1, 0.6];

// 1–3 stars from a build's average community grade (A/B/C → 3/2/1).
function gradeStars(avg) {
  if (avg == null) return 0;
  if (avg >= 3.5) return 3;
  if (avg >= 2.5) return 2;
  return 1;
}

// Smooth S-curve through the node centers - vertical tangents at each node so the
// zig-zag reads as one continuous winding candy trail.
function roadPath(points) {
  if (!points.length) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], my = (a.y + b.y) / 2;
    d += ` C ${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`;
  }
  return d;
}

function BuildPath({ track, projects, subs, isUnlocked, currentNumber, onNodeClick }) {
  const accent = track.accent_color;
  // Node centers: x weaves around the board's center line, y steps down at a fixed
  // pitch (the wave cycles if the project count ever changes).
  const xAt = (i) => BOARD_CX + BOARD_AMP * TRAIL_WAVE[i % TRAIL_WAVE.length];
  const yAt = (i) => PATH_PAD + i * NODE_PITCH + NODE_SIZE / 2;
  const points = projects.map((p, i) => ({ x: xAt(i), y: yAt(i) }));
  // Completion is sequential (a level unlocks only once the previous is submitted),
  // so cleared levels are always a leading run - the lit trail reaches the current
  // node by drawing through the first (doneCount + 1) points.
  const doneCount = projects.filter((p) => subs[p.id]).length;
  const totalH = projects.length * NODE_PITCH;
  const height = PATH_PAD + totalH + 40;
  const endIdx = projects.length - 1;

  return (
    <div className="lrn-path" role="list" style={{ height }}>
      <svg className="lrn-path-road" width={BOARD_W} height={height} viewBox={`0 0 ${BOARD_W} ${height}`} aria-hidden>
        <path d={roadPath(points)} className="lrn-road-bed" />
        <path d={roadPath(points)} className="lrn-road-base" />
        <path d={roadPath(points.slice(0, Math.min(doneCount + 1, points.length)))} className="lrn-road-done" stroke={accent} />
      </svg>
      {projects.map((p, i) => {
        const sub = subs[p.id];
        const unlocked = isUnlocked(p.project_number);
        const state = sub ? 'done' : !unlocked ? 'locked' : p.project_number === currentNumber ? 'current' : 'open';
        return (
          <PathNode
            key={p.id} project={p} track={track} sub={sub} state={state}
            cx={xAt(i)} cy={yAt(i)}
            onClick={() => onNodeClick(p)}
          />
        );
      })}
      <div className="lrn-path-end" style={{ left: xAt(endIdx), top: yAt(endIdx) + 64, color: accent, borderColor: `${accent}66` }}>Trail's end · Certified</div>
    </div>
  );
}

function PathNode({ project, track, sub, state, cx, cy, onClick }) {
  const accent = track.accent_color;
  const letter = gpaToLetter(sub?.avg_grade);
  const stars = sub ? gradeStars(sub.avg_grade) : 0;
  const face = sub ? '✓' : state === 'locked' ? '🔒' : project.project_number;
  // Done & current nodes wear the track color; locked/open stay muted until reached.
  const lit = state === 'done' || state === 'current';
  return (
    <div className={`lrn-node-row ${state}`} role="listitem" style={{ left: cx, top: cy - NODE_SIZE / 2 }}>
      <button
        className={`lrn-node ${state}`}
        onClick={onClick}
        aria-label={`Project ${project.project_number}: ${project.title} (${state})`}
        style={lit
          ? { background: accent, color: '#04201d', boxShadow: `0 6px 0 ${shade(accent)}, 0 0 0 6px ${accent}22` }
          : {}}
      >
        <span className="lrn-node-face">{face}</span>
        {state === 'current' && <span className="lrn-node-ping" style={{ borderColor: accent }} />}
        {state === 'current' && <span className="lrn-node-pin" style={{ color: accent }} aria-hidden />}
        {sub && sub.avg_grade != null && (
          <span className="lrn-node-stars" aria-hidden>
            {[0, 1, 2].map((s) => <span key={s} className={`lrn-node-star ${s < stars ? 'on' : ''}`}>★</span>)}
          </span>
        )}
      </button>
      <div className="lrn-node-label">
        <div className="lrn-node-title">
          {project.title}
          {letter && <span className="lrn-node-grade" style={{ color: accent }}>{letter}</span>}
        </div>
        <div className="lrn-node-sub">
          {state === 'current' ? 'Start here →' : state === 'locked' ? 'Locked · hover to preview' : sub ? 'Done · tap to revisit' : 'Ready'}
        </div>
        {project.brief && (
          <div className="lrn-node-brief">
            <p>{subst(project.brief, track)}</p>
            {state === 'locked' && (
              <span className="lrn-node-brief-lock">🔒 Finish project {project.project_number - 1} to unlock</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Darken a hex color for the 3D button's bottom edge.
function shade(hex) {
  const h = (hex || '#4ECDC4').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = Math.max(0, ((n >> 16) & 255) - 60), g = Math.max(0, ((n >> 8) & 255) - 60), b = Math.max(0, (n & 255) - 60);
  return `rgb(${r},${g},${b})`;
}

// ── the report card (right rail) ─────────────────────────────────────────────
// The learner's own grades for this track: GPA + per-project letters, each with a
// button to read the teachers' grades and notes. Real data only.
function ReportCard({ track, projects, subs, progressRow, onOpenNotes }) {
  const graded = projects.map((p) => subs[p.id]).filter((s) => s && s.avg_grade != null);
  const gpa = graded.length ? graded.reduce((a, s) => a + Number(s.avg_grade), 0) / graded.length : null;
  const doneCount = projects.filter((p) => subs[p.id]).length;
  const total = projects.length;
  const certified = !!progressRow?.certified_at || doneCount >= total;
  // Learn XP - a light, honest score from real activity (10 per build + 5 per graded).
  const xp = doneCount * 10 + graded.length * 5;
  const gpaLetter = gpaToLetter(gpa);

  return (
    <aside className="lrn-report">
      <div className="lrn-report-head">
        <span className="lrn-report-emoji">📑</span>
        <div>
          <div className="lrn-report-title">Report card</div>
          <div className="lrn-report-track">{track.title}</div>
        </div>
      </div>

      <div className="lrn-report-stats">
        <div className="lrn-stat">
          <div className="lrn-stat-num" style={{ color: gpaLetter ? track.accent_color : C.muted }}>{gpaLetter || '-'}</div>
          <div className="lrn-stat-lbl">{gpa ? `${gpa.toFixed(2)} GPA` : 'GPA'}</div>
        </div>
        <div className="lrn-stat">
          <div className="lrn-stat-num">{doneCount}<span style={{ color: C.muted, fontSize: 16 }}>/{total}</span></div>
          <div className="lrn-stat-lbl">projects</div>
        </div>
        <div className="lrn-stat">
          <div className="lrn-stat-num" style={{ color: C.gold }}>{xp}</div>
          <div className="lrn-stat-lbl">Learn XP</div>
        </div>
      </div>

      <div className={`lrn-cert ${certified ? 'on' : ''}`} style={certified ? { borderColor: track.accent_color, color: track.accent_color } : {}}>
        {certified ? '🎓 Certified in ' + track.title : `🎓 ${total - doneCount} to certify`}
      </div>

      <div className="lrn-report-list">
        {projects.map((p) => {
          const sub = subs[p.id];
          const letter = gpaToLetter(sub?.avg_grade);
          return (
            <div key={p.id} className="lrn-report-row">
              <span className="lrn-report-pnum">{p.project_number}</span>
              <span className="lrn-report-pname">{p.title}</span>
              {sub?.model_used && <span className="lrn-report-model">{sub.model_used}</span>}
              {sub
                ? <span className="lrn-report-chip" style={{ borderColor: track.accent_color, color: letter ? track.accent_color : C.muted }}>{letter || '· · ·'}</span>
                : <span className="lrn-report-chip muted">-</span>}
              {sub && (
                <button className="lrn-report-notes" onClick={() => onOpenNotes(sub.id)} title="See grades & teacher notes">
                  Notes
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="lrn-report-foot">“Notes” opens the grades and feedback teachers left on that build.</p>
    </aside>
  );
}

// ── one project: the 5-beat loop ─────────────────────────────────────────────
function ProjectPanel({ track, project, existingSub, currentUser, trackModel, toast, onClose, onChanged, onOpenSubmission }) {
  const [attempts, setAttempts] = useState(null);
  const [stage, setStage] = useState('overview'); // overview | prequiz | build | afterquiz | done
  const [submission, setSubmission] = useState(existingSub || null);

  const reloadAttempts = async () => setAttempts(await fetchMyAttempts(currentUser.id, project.id));
  useEffect(() => { reloadAttempts(); /* eslint-disable-next-line */ }, [project.id]);

  // Decide the starting stage once attempts load.
  useEffect(() => {
    if (!attempts) return;
    if (submission) setStage(attempts.hasAfter ? 'done' : 'afterquiz');
    else if (!attempts.hasPre) setStage('overview');
    else setStage('build');
    // eslint-disable-next-line
  }, [attempts]);

  const close = () => onClose();

  return (
    <div className="lrn-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="lrn-modal" role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontFamily: C.mono, color: track.accent_color, fontWeight: 700 }}>
            {project.is_community ? 'Community' : `Project ${project.project_number}`}
          </span>
          <h2 style={{ margin: 0, fontSize: 22 }}>{project.title}</h2>
          <button className="lrn-x" onClick={close} aria-label="Close">✕</button>
        </div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 14 }}>
          {project.is_community ? `Building with ${track.title}` : `${track.title} track`}
        </div>

        {!attempts ? <div><PageLoader size={20} text="" /></div> : (
          <>
            {stage === 'overview' && (
              <Overview project={project} track={track} onStart={() => setStage('prequiz')} />
            )}
            {stage === 'prequiz' && (
              <Quiz
                project={project} track={track} phase="pre"
                onDone={async () => { await reloadAttempts(); setStage('build'); }}
                toast={toast}
              />
            )}
            {stage === 'build' && (
              <BuildAndPost
                project={project} track={track} currentUser={currentUser} existingSub={submission} trackModel={trackModel} toast={toast}
                onPosted={async (subId, isPublic) => {
                  await onChanged?.();
                  setSubmission({
                    ...(submission || {}),
                    id: subId, project_id: project.id, project_number: project.project_number,
                    status: isPublic ? 'posted' : 'private',
                    post_id: isPublic ? (submission?.post_id || subId) : null,
                  });
                  await reloadAttempts();
                  setStage('afterquiz');
                }}
              />
            )}
            {stage === 'afterquiz' && (
              <Quiz
                project={project} track={track} phase="after"
                onDone={async (result) => { await reloadAttempts(); setStage('done'); }}
                toast={toast}
              />
            )}
            {stage === 'done' && (
              <DoneCard
                project={project} track={track} attempts={attempts} submission={submission}
                onViewSubmission={() => submission && onOpenSubmission(submission.id)}
                onEdit={() => setStage('build')}
                onClose={close}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Overview({ project, track, onStart }) {
  return (
    <div>
      <p style={{ marginTop: 0 }}>{subst(project.brief, track)}</p>
      {project.instructions && (
        <div className="lrn-box">
          <div className="lrn-box-label">How to do it</div>
          <pre className="lrn-pre-soft">{subst(project.instructions, track)}</pre>
        </div>
      )}
      <div className="lrn-box">
        <div className="lrn-box-label">The community grades you on</div>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {(project.rubric || []).map((r) => (
            <li key={r.key} style={{ marginBottom: 4 }}><b>{r.label}.</b> <span style={{ color: C.muted }}>{subst(r.desc, track)}</span></li>
          ))}
        </ul>
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="lrn-btn" style={{ background: track.accent_color, color: '#04201d' }} onClick={onStart}>
          Take the 5-question pre-quiz →
        </button>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>It can't be failed - it just primes you and records a baseline so you can see your improvement later.</p>
      </div>
    </div>
  );
}

function Quiz({ project, track, phase, onDone, toast }) {
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const q = await getProjectQuiz(project.id, phase);
        if (!c) { setQuestions(q); setAnswers(new Array(q.length).fill(-1)); }
      } catch (e) { console.error(e); toast('Could not load the quiz.'); }
    })();
    return () => { c = true; };
    // eslint-disable-next-line
  }, [project.id, phase]);

  const allAnswered = questions && answers.every((a) => a >= 0);

  const submit = async () => {
    if (!allAnswered) return;
    setSubmitting(true);
    try {
      const r = await submitQuiz(project.id, phase, answers);
      setResult(r);
    } catch (e) {
      console.error(e); toast(e.message || 'Could not submit the quiz.');
      setSubmitting(false);
    }
  };

  if (!questions) return <div style={{ maxWidth: 800, margin: '0 auto' }}>{[1,2,3].map(i => <ListItemSkeleton key={i} />)}</div>;

  if (result) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>{phase === 'pre' ? 'Baseline recorded' : 'Nice work!'}</h3>
        {phase === 'pre' ? (
          <p>You scored <b>{result.score}/5</b>. That's your starting point - now go build it.</p>
        ) : (
          <div className="lrn-box" style={{ borderColor: track.accent_color }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              pre {result.pre_score ?? 0}/5 → after {result.after_score}/5
            </div>
            <p style={{ color: C.muted, margin: '6px 0 0' }}>
              {result.delta > 0 ? `You improved by ${result.delta}. ${result.bonus_awarded ? '+2 BP for growing! 🎉' : ''}`
                : 'You held steady - solid.'}
            </p>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <button className="lrn-btn" style={{ background: track.accent_color, color: '#04201d' }} onClick={() => onDone(result)}>
            {phase === 'pre' ? 'Start building →' : 'Done →'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{phase === 'pre' ? 'Pre-quiz' : 'After-action quiz'} · 5 questions</h3>
      {questions.map((q, qi) => (
        <div key={q.id} className="lrn-box" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{qi + 1}. {q.question}</div>
          {(q.options || []).map((opt, oi) => (
            <label key={oi} className={`lrn-opt ${answers[qi] === oi ? 'sel' : ''}`} style={answers[qi] === oi ? { borderColor: track.accent_color } : {}}>
              <input type="radio" name={`q-${q.id}`} checked={answers[qi] === oi}
                onChange={() => setAnswers((a) => { const n = [...a]; n[qi] = oi; return n; })} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      ))}
      <button className="lrn-btn" disabled={!allAnswered || submitting}
        style={{ background: allAnswered ? track.accent_color : C.line, color: allAnswered ? '#04201d' : C.muted }}
        onClick={submit}>
        {submitting ? 'Submitting…' : 'Submit answers'}
      </button>
    </div>
  );
}

function BuildAndPost({ project, track, currentUser, existingSub, trackModel, toast, onPosted }) {
  const [prompts, setPrompts] = useState(existingSub?.prompts_used || '');
  const [code, setCode] = useState(existingSub?.final_code || '');
  const [liveUrl, setLiveUrl] = useState(existingSub?.live_url || '');
  const [question, setQuestion] = useState(existingSub?.question_for_community || '');
  const [screenshotUrl, setScreenshotUrl] = useState(existingSub?.screenshot_url || '');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef(null);

  // Posting for peer grading is optional. Once a build is public it stays public
  // (the post + its grades live on), so the toggle locks on for already-posted
  // builds. New or still-private builds default to posting on.
  const alreadyPublic = !!existingSub?.post_id;
  const [isPublic, setIsPublic] = useState(alreadyPublic || existingSub?.status !== 'private');

  // The model is chosen at the track level (the header dropdown); the build files under it.
  const model = existingSub?.model_used || trackModel || modelsForTrack(track.tool_id)[0] || '';

  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch { toast('Copy failed'); } };

  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const { url, error } = await uploadPostImage(supabase, f, currentUser.id);
      if (error) throw new Error(error);
      setScreenshotUrl(url);
    } catch (err) { toast(err.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const post = async () => {
    // Posting publicly needs something to grade; finishing privately can be empty.
    if (isPublic && prompts.trim().length < 5 && code.trim().length < 5) {
      return toast('Add at least your prompts or your final code to post.');
    }
    setPosting(true);
    try {
      if (isPublic) {
        const mod = await moderateContent([prompts, code, question].filter(Boolean).join(' '));
        if (!mod.approved) { toast(mod.reason || 'Content not approved.'); setPosting(false); return; }
      }
      const subId = await submitProject({
        projectId: project.id, trackId: track.id, prompts, finalCode: code,
        screenshotUrl, liveUrl, question, model, isPublic,
      });
      toast(isPublic ? 'Posted! 🎉' : 'Project finished ✓');
      await onPosted(subId, isPublic);
    } catch (err) { console.error(err); toast(err.message || 'Could not finish.'); setPosting(false); }
  };

  return (
    <div>
      <div className="lrn-box" style={{ borderColor: track.accent_color }}>
        <div className="lrn-box-label">Step 1 - build it with {track.title}</div>
        {track.is_local ? (
          <p style={{ margin: '4px 0 8px' }}>
            Ollama runs on <b>your own machine</b> - no API key, no cost. Install it, pull a model, and build right on your computer.
          </p>
        ) : (
          <p style={{ margin: '4px 0 8px' }}>Open {track.title} in a new tab and work through the build there. You write and run the code yourself - {track.title} is your pair-programmer, not a vending machine.</p>
        )}
        {track.build_url && (
          <a className="lrn-btn" href={track.build_url} target="_blank" rel="noopener noreferrer"
            style={{ background: track.accent_color, color: '#04201d', textDecoration: 'none', display: 'inline-block' }}>
            {track.is_local ? 'Get Ollama ↗' : `Open ${track.title} ↗`}
          </a>
        )}
        {project.starter_prompt && (
          <div style={{ marginTop: 12 }}>
            <div className="lrn-box-label">A good first prompt to send {track.title}</div>
            <pre className="lrn-pre">{subst(project.starter_prompt, track)}</pre>
            <button className="lrn-btn-ghost" onClick={() => copy(subst(project.starter_prompt, track))}>Copy prompt</button>
          </div>
        )}
        {project.starter_file != null && project.starter_file !== '' && (
          <div style={{ marginTop: 12 }}>
            <div className="lrn-box-label">Your starting file {project.builds_on ? `(from Project ${project.builds_on})` : ''}</div>
            <pre className="lrn-pre">{project.starter_file}</pre>
            <button className="lrn-btn-ghost" onClick={() => copy(project.starter_file)}>Copy file</button>
          </div>
        )}
      </div>

      <div className="lrn-box">
        <div className="lrn-box-label">Step 2 - {isPublic ? 'post your result' : 'save your result'}</div>
        {model && (
          <p className="lrn-model-hint" style={{ marginTop: 0 }}>
            Filed under <b style={{ color: track.accent_color }}>{model}</b> - change the model from the dropdown at the top.
          </p>
        )}
        <label className="lrn-field-label">The prompts you used</label>
        <textarea className="lrn-input" rows={4} value={prompts} onChange={(e) => setPrompts(e.target.value)}
          placeholder={`Paste the messages you sent ${track.title}…`} />
        <label className="lrn-field-label">Your final code</label>
        <textarea className="lrn-input" style={{ fontFamily: C.mono, fontSize: 13 }} rows={6} value={code}
          onChange={(e) => setCode(e.target.value)} placeholder="Paste the code you ended up with…" />
        <label className="lrn-field-label">Screenshot of it running</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="lrn-btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : screenshotUrl ? 'Replace screenshot' : 'Upload screenshot'}
          </button>
          {screenshotUrl && <img src={screenshotUrl} alt="" style={{ height: 40, borderRadius: 6, border: `1px solid ${C.line}` }} />}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
        </div>
        {project.project_number >= 8 && (
          <>
            <label className="lrn-field-label">Live link {project.project_number === 10 ? '(required to ship!)' : '(optional)'}</label>
            <input className="lrn-input" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://your-app.example.com" />
          </>
        )}
        <label className="lrn-field-label">A question for the community (optional)</label>
        <textarea className="lrn-input" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. is there a cleaner way to do this?" />

        {/* Posting for peer grading is optional - finish privately and publish later. */}
        <label className="lrn-toggle" style={{ opacity: alreadyPublic ? 0.6 : 1 }}>
          <input type="checkbox" checked={isPublic} disabled={alreadyPublic}
            onChange={(e) => setIsPublic(e.target.checked)} />
          <span>
            Post publicly so the community can grade it
            <span className="lrn-toggle-sub">
              {alreadyPublic
                ? 'Already posted - your build stays public.'
                : isPublic
                  ? 'Your build appears in the grading queue for peer feedback.'
                  : 'Finishes the project privately. You can edit and post it later.'}
            </span>
          </span>
        </label>
      </div>

      <button className="lrn-btn" disabled={posting || uploading}
        style={{ background: track.accent_color, color: '#04201d' }} onClick={post}>
        {posting ? 'Saving…' : uploading ? 'Wait for upload…'
          : isPublic
            ? (alreadyPublic ? 'Repost my updated build' : 'Post & continue →')
            : 'Finish without posting →'}
      </button>
    </div>
  );
}

function DoneCard({ project, track, attempts, submission, onViewSubmission, onEdit, onClose }) {
  const isPrivate = !submission?.post_id;
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{project.is_community ? `${project.title} complete ✓` : `Project ${project.project_number} complete ✓`}</h3>
      {attempts?.hasAfter && (
        <div className="lrn-box" style={{ borderColor: track.accent_color }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>pre {attempts.preScore ?? 0}/5 → after {attempts.afterScore ?? 0}/5</div>
          <p style={{ color: C.muted, margin: '4px 0 0' }}>Your own proof of what you learned by building it.</p>
        </div>
      )}
      <p style={{ color: C.muted }}>
        {isPrivate
          ? 'Finished privately - this build isn’t posted for grading. Edit it and turn on “Post publicly” to share it with the community anytime.'
          : 'Your build is posted. The community can now grade it and leave feedback. Edit and repost anytime to act on their notes.'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {submission?.id && !isPrivate && <button className="lrn-btn" style={{ background: track.accent_color, color: '#04201d' }} onClick={onViewSubmission}>View my build & comments</button>}
        <button className="lrn-btn-ghost" onClick={onEdit}>{isPrivate ? 'Edit / post it' : 'Edit / repost'}</button>
        <button className="lrn-btn-ghost" onClick={onClose}>Back to track</button>
      </div>
    </div>
  );
}

// ── submission view + grading ─────────────────────────────────────────────────
function SubmissionView({ submissionId, tracks, projects, currentUser, onRequireAuth, toast, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [letter, setLetter] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try { setData(await fetchSubmissionFull(submissionId)); }
    catch (e) { console.error(e); toast('Could not load this build.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); reload(); /* eslint-disable-next-line */ }, [submissionId]);

  if (loading) return <div><PageLoader size={24} text="" /></div>;
  if (!data?.submission) return <div style={{ color: C.muted }}>Build not found. <button className="lrn-link" onClick={onBack}>Back</button></div>;

  const { submission: s, author, votes, comments } = data;
  const track = tracks.find((t) => t.id === s.track_id);
  const project = projects.find((p) => p.id === s.project_id) || data.project;
  const isOwner = currentUser?.id === s.user_id;
  const myVote = votes.find((v) => v.voter_id === currentUser?.id);
  const accent = track?.accent_color || C.accent;
  const avgLetter = gpaToLetter(s.avg_grade);

  const submitGrade = async () => {
    if (!currentUser) return onRequireAuth?.();
    if (!letter) return toast('Pick a grade (A, B, C or D).');
    setBusy(true);
    try {
      const mod = await moderateContent(feedback);
      if (!mod.approved) { toast(mod.reason || 'Feedback not approved.'); setBusy(false); return; }
      const r = await gradeProject(s.id, letter, feedback);
      toast(r?.awarded ? 'Graded - +3 BP!' : 'Grade saved.');
      setFeedback('');
      await reload();
    } catch (e) { console.error(e); toast(e.message || 'Could not grade.'); }
    finally { setBusy(false); }
  };

  const like = async (voterId) => {
    setBusy(true);
    try { const awarded = await likeGradeComment(s.id, voterId); toast(awarded ? 'Thanks - +1 BP to them' : 'Already liked'); await reload(); }
    catch (e) { toast(e.message || 'Could not like.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button className="lrn-link" onClick={onBack} style={{ marginBottom: 12 }}>← Back</button>
      <div className="lrn-box" style={{ borderColor: accent }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {track && <span style={{ width: 12, height: 12, borderRadius: '50%', background: accent }} />}
          <h1 style={{ margin: 0, fontSize: 24 }}>{project?.title || 'Project'}</h1>
          <span style={{ color: C.muted, fontFamily: C.mono, fontSize: 13 }}>{track?.title} track</span>
          {avgLetter && (
            <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <span style={{ fontFamily: C.mono, fontWeight: 700, fontSize: 20, color: accent }}>{avgLetter}</span>
              <span style={{ color: C.muted, fontSize: 12, display: 'block' }}>{gradeDistribution(votes)} · {s.grade_count} vote{s.grade_count === 1 ? '' : 's'}</span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: C.muted, fontSize: 13 }}>
          <Avatar p={author} /> <span>@{author?.username || 'someone'}</span>
          {s.model_used && <span className="lrn-report-model" style={{ marginLeft: 'auto' }}>Built with {s.model_used}</span>}
        </div>
      </div>

      {s.screenshot_url && <img src={s.screenshot_url} alt="" style={{ maxWidth: '100%', borderRadius: 12, border: `1px solid ${C.line}`, margin: '12px 0' }} />}
      {s.question_for_community && (
        <div className="lrn-box"><div className="lrn-box-label">Their question</div><p style={{ margin: 0 }}>{s.question_for_community}</p></div>
      )}
      {s.prompts_used && (
        <div className="lrn-box"><div className="lrn-box-label">Prompts they used</div><pre className="lrn-pre-soft">{s.prompts_used}</pre></div>
      )}
      {s.final_code && (
        <div className="lrn-box"><div className="lrn-box-label">Their final code</div><pre className="lrn-pre">{s.final_code}</pre></div>
      )}
      {s.live_url && (
        <p><a className="lrn-link" href={s.live_url} target="_blank" rel="noopener noreferrer">View it live ↗</a></p>
      )}

      {/* Grade box */}
      {!isOwner && (
        <div className="lrn-box" style={{ marginTop: 18 }}>
          <div className="lrn-box-label">Grade this build</div>
          <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
            {['A', 'B', 'C', 'D'].map((L) => (
              <button key={L} onClick={() => setLetter(L)} title={LETTER_MEANING[L]}
                className="lrn-grade" style={letter === L ? { borderColor: accent, color: accent } : {}}>
                {L}
              </button>
            ))}
            <span style={{ color: C.muted, fontSize: 12, alignSelf: 'center' }}>{letter ? LETTER_MEANING[letter] : 'Pick a letter, then leave helpful feedback.'}</span>
          </div>
          <textarea className="lrn-input" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)}
            placeholder="What worked, what to try next… (real feedback earns +3 BP)" />
          <button className="lrn-btn" disabled={busy} style={{ background: accent, color: '#04201d', marginTop: 8 }} onClick={submitGrade}>
            {myVote ? 'Update my grade' : 'Submit grade'}
          </button>
        </div>
      )}

      {/* Comments / grades thread */}
      <h3 style={{ marginTop: 24 }}>Feedback & grades ({comments.length})</h3>
      {comments.length === 0 && <p style={{ color: C.muted }}>No feedback yet. {isOwner ? 'Hang tight - the community will grade it soon.' : 'Be the first to help!'}</p>}
      {comments.map((c) => (
        <div key={c.id} className="lrn-box" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar p={c.profile} />
            <span style={{ fontWeight: 600 }}>@{c.profile?.username || 'user'}</span>
            {c.vote && <span className="lrn-chip" style={{ borderColor: accent, color: accent }}>{c.vote.letter}</span>}
            <span style={{ color: C.muted, fontSize: 12 }}>{new Date(c.created_at).toLocaleDateString()}</span>
            {isOwner && c.vote && c.user_id !== currentUser?.id && (
              <button className="lrn-btn-ghost" style={{ marginLeft: 'auto' }} disabled={busy}
                onClick={() => like(c.user_id)}>
                {c.vote.liked_by_uploader ? '♥ liked' : '♡ helpful (+1 BP)'}
              </button>
            )}
          </div>
          <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{c.content}</p>
        </div>
      ))}
    </>
  );
}

// ── browse builds to grade ─────────────────────────────────────────────────
function GradeBrowser({ track, projects, currentUser, onClose, onOpenSubmission }) {
  const [items, setItems] = useState(null);
  const [projectFilter, setProjectFilter] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const data = await fetchSubmissionsToGrade(track.id, {
          projectId: projectFilter || null, excludeUserId: currentUser?.id || null,
        });
        if (!c) setItems(data);
      } catch (e) { console.error(e); if (!c) setItems([]); }
    })();
    return () => { c = true; };
    // eslint-disable-next-line
  }, [track.id, projectFilter]);

  return (
    <div className="lrn-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lrn-modal" role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Grade {track.title} builds</h2>
          <button className="lrn-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p style={{ color: C.muted, fontSize: 13 }}>Help others, sharpen your own eye - and earn +3 BP per graded build (+1 more if they like it).</p>
        <select className="lrn-input" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={{ maxWidth: 280 }}>
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.project_number}. {p.title}</option>)}
        </select>
        <div style={{ marginTop: 12 }}>
          {!items ? <div>{[1,2,3].map(i => <ListItemSkeleton key={i} />)}</div> : items.length === 0 ? (
            <p style={{ color: C.muted }}>No builds to grade yet. Check back soon!</p>
          ) : items.map((s) => (
            <button key={s.id} className="lrn-row" onClick={() => onOpenSubmission(s.id)}>
              <Avatar p={s.author} />
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>{projects.find((p) => p.id === s.project_id)?.title || 'Project'}</div>
                <div style={{ color: C.muted, fontSize: 12 }}>@{s.author?.username || 'someone'} · {s.grade_count} grade{s.grade_count === 1 ? '' : 's'}</div>
              </div>
              {gpaToLetter(s.avg_grade) && <span style={{ fontFamily: C.mono, fontWeight: 700, color: track.accent_color }}>{gpaToLetter(s.avg_grade)}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── community projects (user-authored) ───────────────────────────────────────
function CommunityView({ tracks, currentUser, profile, isAdmin, toast, onRequireAuth, onBack, onOpenSubmission }) {
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [picking, setPicking] = useState(null);  // community project awaiting a model choice
  const [open, setOpen] = useState(null);         // { project, track, model, existingSub }
  const [pendingCount, setPendingCount] = useState(0);

  const reload = async () => {
    try { setList(await getCommunityProjects()); }
    catch (e) { console.error(e); toast('Could not load community projects.'); setList([]); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  // Admin: badge the review button with the queue size.
  useEffect(() => {
    if (!isAdmin) return;
    listPendingCommunityProjects().then((p) => setPendingCount(p.length)).catch(() => {});
  }, [isAdmin, reviewing]);

  const startBuild = (proj) => {
    if (!currentUser) return onRequireAuth?.();
    setPicking(proj);
  };

  const onPicked = async (track, model) => {
    const proj = picking;
    setPicking(null);
    let existingSub = null;
    try { const subs = await fetchMySubmissions(currentUser.id, track.id); existingSub = subs[proj.id] || null; } catch {}
    setOpen({ project: { ...proj, is_community: true }, track, model, existingSub });
  };

  return (
    <>
      <button className="lrn-link" onClick={onBack} style={{ marginBottom: 12 }}>← All tracks</button>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="lrn-h-game" style={{ margin: 0, fontSize: 30 }}>🛠️ Community Projects</h1>
          <p style={{ color: C.muted, margin: '6px 0 0' }}>
            Projects written by builders like you. Take one with any AI model, post your build, and get peer-graded -
            or create your own to teach the community. New projects are reviewed before they go live.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && (
            <button className="lrn-btn-ghost" onClick={() => setReviewing(true)}>
              🛡️ Review queue{pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          )}
          <button className="lrn-btn" style={{ background: C.gold, color: '#04201d' }}
            onClick={() => (currentUser ? setCreating(true) : onRequireAuth?.())}>
            + Create a project
          </button>
        </div>
      </header>

      {list === null ? (
        <div><PageLoader size={20} text="" /></div>
      ) : list.length === 0 ? (
        <div className="lrn-box" style={{ textAlign: 'center', padding: 28 }}>
          <p style={{ margin: 0, color: C.muted }}>No community projects yet. Be the first to create one!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
          {list.map((p) => (
            <button key={p.id} className="lrn-card" onClick={() => startBuild(p)} style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{p.title}</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.brief}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: C.muted, fontSize: 12 }}>
                <Avatar p={{ avatar_url: p.author_avatar, avatar_emoji: p.author_emoji }} />
                <span>@{p.author_username || 'someone'}</span>
                <span style={{ marginLeft: 'auto' }}>{p.submission_count || 0} build{p.submission_count === 1 ? '' : 's'}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {picking && (
        <BuildWithPicker project={picking} tracks={tracks} onCancel={() => setPicking(null)} onPick={onPicked} />
      )}
      {open && (
        <ProjectPanel
          track={open.track}
          project={open.project}
          existingSub={open.existingSub}
          currentUser={currentUser}
          trackModel={open.model}
          toast={toast}
          onClose={() => setOpen(null)}
          onChanged={async () => {}}
          onOpenSubmission={onOpenSubmission}
        />
      )}
      {creating && (
        <CreateCommunityProject
          toast={toast}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); toast('Submitted for review! It goes live once an admin approves it.'); }}
        />
      )}
      {reviewing && isAdmin && (
        <CommunityReviewQueue toast={toast} onClose={() => setReviewing(false)} onChanged={reload} />
      )}
    </>
  );
}

// Choose which AI track/model to build a community project with (they're model-agnostic).
function BuildWithPicker({ project, tracks, onCancel, onPick }) {
  const active = tracks || [];
  const [trackId, setTrackId] = useState(active[0]?.id || '');
  const track = active.find((t) => t.id === trackId);
  const models = modelsForTrack(track?.tool_id);
  const [model, setModel] = useState(models[0] || '');
  useEffect(() => { setModel(modelsForTrack(track?.tool_id)[0] || ''); /* eslint-disable-next-line */ }, [trackId]);

  return (
    <div className="lrn-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="lrn-modal" role="dialog" aria-modal="true" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Build “{project.title}”</h2>
          <button className="lrn-x" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <p style={{ color: C.muted, marginTop: 0 }}>Pick which AI you'll build it with - your build is filed under that model.</p>
        <label className="lrn-field-label">AI track</label>
        <select className="lrn-input" value={trackId} onChange={(e) => setTrackId(e.target.value)}>
          {active.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
        {models.length > 1 && (
          <>
            <label className="lrn-field-label">Model</label>
            <select className="lrn-input" value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </>
        )}
        <button className="lrn-btn" style={{ background: track?.accent_color || C.accent, color: '#04201d', marginTop: 14 }}
          disabled={!track} onClick={() => onPick(track, model)}>
          Start building →
        </button>
      </div>
    </div>
  );
}

// A single quiz-question row in the authoring form.
const blankQ = () => ({ question: '', options: ['', '', '', ''], correct: -1 });
const blankQuiz = () => Array.from({ length: 5 }, blankQ);

function QuestionEditor({ phaseLabel, q, index, onChange }) {
  const set = (patch) => onChange({ ...q, ...patch });
  const setOpt = (i, v) => { const o = [...q.options]; o[i] = v; set({ options: o }); };
  const addOpt = () => { if (q.options.length < 6) set({ options: [...q.options, ''] }); };
  const removeOpt = (i) => {
    if (q.options.length <= 2) return;
    const o = q.options.filter((_, j) => j !== i);
    let correct = q.correct;
    if (q.correct === i) correct = -1; else if (q.correct > i) correct -= 1;
    set({ options: o, correct });
  };
  return (
    <div className="lrn-box" style={{ marginBottom: 10 }}>
      <label className="lrn-field-label">{phaseLabel} question {index + 1}</label>
      <input className="lrn-input" value={q.question} placeholder="Question text"
        onChange={(e) => set({ question: e.target.value })} />
      <div style={{ marginTop: 8 }}>
        {q.options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input type="radio" name={`${phaseLabel}-${index}-correct`} checked={q.correct === i}
              onChange={() => set({ correct: i })} title="Mark as the correct answer" />
            <input className="lrn-input" style={{ flex: 1, margin: 0 }} value={opt}
              placeholder={`Option ${i + 1}`} onChange={(e) => setOpt(i, e.target.value)} />
            {q.options.length > 2 && (
              <button className="lrn-btn-ghost" style={{ padding: '4px 8px' }} onClick={() => removeOpt(i)} aria-label="Remove option">✕</button>
            )}
          </div>
        ))}
        {q.options.length < 6 && (
          <button className="lrn-btn-ghost" style={{ padding: '4px 10px' }} onClick={addOpt}>+ Add option</button>
        )}
        <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Select the radio next to the correct answer.</div>
      </div>
    </div>
  );
}

function CreateCommunityProject({ toast, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [instructions, setInstructions] = useState('');
  const [starterPrompt, setStarterPrompt] = useState('');
  const [rubric, setRubric] = useState([{ label: '', desc: '' }]);
  const [pre, setPre] = useState(blankQuiz);
  const [after, setAfter] = useState(blankQuiz);
  const [busy, setBusy] = useState(false);

  const setQ = (phase, i, q) => {
    if (phase === 'pre') setPre((arr) => arr.map((x, j) => (j === i ? q : x)));
    else setAfter((arr) => arr.map((x, j) => (j === i ? q : x)));
  };

  const validatePhase = (arr, label) => {
    for (let i = 0; i < arr.length; i++) {
      const q = arr[i];
      if (!q.question.trim()) return `${label} question ${i + 1}: add the question text.`;
      const opts = q.options.map((o) => o.trim());
      if (opts.length < 2) return `${label} question ${i + 1}: needs at least 2 options.`;
      if (opts.some((o) => !o)) return `${label} question ${i + 1}: every option needs text (or remove it).`;
      if (q.correct < 0 || q.correct >= opts.length) return `${label} question ${i + 1}: mark the correct answer.`;
    }
    return null;
  };

  const submit = async () => {
    if (title.trim().length < 3) return toast('Give your project a title (3+ characters).');
    if (brief.trim().length < 10) return toast('Add a longer brief so builders know what to make.');
    const err = validatePhase(pre, 'Pre-quiz') || validatePhase(after, 'After-quiz');
    if (err) return toast(err);
    const toPayloadQ = (q) => ({ question: q.question.trim(), options: q.options.map((o) => o.trim()), correct_index: q.correct });
    const cleanRubric = rubric
      .filter((r) => r.label.trim())
      .map((r) => ({
        key: (r.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) || 'item',
        label: r.label.trim(), desc: r.desc.trim(),
      }));
    setBusy(true);
    try {
      await createCommunityProject({
        title: title.trim(), brief: brief.trim(), instructions: instructions.trim() || null,
        starterPrompt: starterPrompt.trim() || null, rubric: cleanRubric,
        pre: pre.map(toPayloadQ), after: after.map(toPayloadQ),
      });
      onCreated();
    } catch (e) { console.error(e); toast(e.message || 'Could not create the project.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="lrn-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lrn-modal" role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>Create a community project</h2>
          <button className="lrn-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p style={{ color: C.muted, marginTop: 0, fontSize: 13 }}>
          Design a small build others can do with any AI: a 5-question pre-quiz, the project itself, then a 5-question
          after-quiz. An admin reviews it before it goes live.
        </p>

        <label className="lrn-field-label">Title</label>
        <input className="lrn-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build a tip calculator" />
        <label className="lrn-field-label">Brief - what they'll build & why</label>
        <textarea className="lrn-input" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="A short pitch for the project…" />
        <label className="lrn-field-label">Instructions (optional)</label>
        <textarea className="lrn-input" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Step-by-step guidance. Write {model} where the learner's chosen AI should appear." />
        <label className="lrn-field-label">A good first prompt (optional)</label>
        <textarea className="lrn-input" rows={2} value={starterPrompt} onChange={(e) => setStarterPrompt(e.target.value)} placeholder="A starter prompt builders can copy. {model} is substituted." />

        <label className="lrn-field-label">Grading rubric (optional) - what the community grades</label>
        {rubric.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input className="lrn-input" style={{ flex: '0 0 32%', margin: 0 }} value={r.label} placeholder="Label (e.g. It works)"
              onChange={(e) => setRubric((a) => a.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input className="lrn-input" style={{ flex: 1, margin: 0 }} value={r.desc} placeholder="What earns it"
              onChange={(e) => setRubric((a) => a.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))} />
            {rubric.length > 1 && <button className="lrn-btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setRubric((a) => a.filter((_, j) => j !== i))} aria-label="Remove rubric item">✕</button>}
          </div>
        ))}
        {rubric.length < 5 && <button className="lrn-btn-ghost" onClick={() => setRubric((a) => [...a, { label: '', desc: '' }])}>+ Add rubric item</button>}

        <h3 style={{ marginBottom: 6, marginTop: 18 }}>Pre-quiz · 5 questions</h3>
        {pre.map((q, i) => <QuestionEditor key={i} phaseLabel="Pre-quiz" q={q} index={i} onChange={(nq) => setQ('pre', i, nq)} />)}

        <h3 style={{ marginBottom: 6, marginTop: 12 }}>After-quiz · 5 questions</h3>
        {after.map((q, i) => <QuestionEditor key={i} phaseLabel="After-quiz" q={q} index={i} onChange={(nq) => setQ('after', i, nq)} />)}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="lrn-btn" style={{ background: C.gold, color: '#04201d' }} disabled={busy} onClick={submit}>
            {busy ? 'Submitting…' : 'Submit for review'}
          </button>
          <button className="lrn-btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function CommunityReviewQueue({ toast, onClose, onChanged }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try { setItems(await listPendingCommunityProjects()); }
    catch (e) { console.error(e); toast(e.message || 'Could not load the queue.'); setItems([]); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const approve = async (id) => {
    setBusy(true);
    try { await approveCommunityProject(id); toast('Approved - it is now live.'); await reload(); await onChanged?.(); }
    catch (e) { toast(e.message || 'Could not approve.'); }
    finally { setBusy(false); }
  };
  const reject = async (id) => {
    const reason = window.prompt('Reason for rejecting (optional, shown to the author):');
    if (reason === null) return;
    setBusy(true);
    try { await rejectCommunityProject(id, reason); toast('Rejected.'); await reload(); }
    catch (e) { toast(e.message || 'Could not reject.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="lrn-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lrn-modal" role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>🛡️ Review queue</h2>
          <button className="lrn-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {items === null ? <div>{[1,2,3].map(i => <ListItemSkeleton key={i} />)}</div>
          : items.length === 0 ? <p style={{ color: C.muted }}>Nothing waiting for review. 🎉</p>
          : items.map((p) => (
            <div key={p.id} className="lrn-box" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>{p.title}</h3>
                <span style={{ color: C.muted, fontSize: 13 }}>by @{p.author_username || 'someone'}</span>
              </div>
              <p style={{ color: C.muted, margin: '6px 0' }}>{p.brief}</p>
              {p.instructions && <pre className="lrn-pre-soft">{p.instructions}</pre>}
              {(p.rubric || []).length > 0 && (
                <div style={{ margin: '6px 0' }}>
                  <div className="lrn-box-label">Rubric</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {(p.rubric || []).map((r, i) => <li key={i}><b>{r.label}.</b> <span style={{ color: C.muted }}>{r.desc}</span></li>)}
                  </ul>
                </div>
              )}
              <div className="lrn-box-label" style={{ marginTop: 8 }}>Quiz (✓ marks the correct answer)</div>
              {(p.questions || []).map((q, i) => (
                <div key={i} style={{ margin: '6px 0', fontSize: 13 }}>
                  <div><b>[{q.phase}] {q.position}.</b> {q.question}</div>
                  <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                    {(q.options || []).map((o, oi) => (
                      <li key={oi} style={{ color: oi === q.correct_index ? C.good : C.muted }}>
                        {oi === q.correct_index ? '✓ ' : ''}{o}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="lrn-btn" style={{ background: C.good, color: '#04201d' }} disabled={busy} onClick={() => approve(p.id)}>Approve</button>
                <button className="lrn-btn-ghost" disabled={busy} onClick={() => reject(p.id)}>Reject</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── tiny shared bits ─────────────────────────────────────────────────────────
function Avatar({ p }) {
  if (p?.avatar_url) return <img src={p.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />;
  return <span style={{ width: 24, height: 24, borderRadius: '50%', background: C.panel2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{p?.avatar_emoji || '🧑‍💻'}</span>;
}

function ProgressRing({ value, max, color }) {
  const r = 16, circ = 2 * Math.PI * r, pct = Math.min(value / max, 1);
  return (
    <svg width="42" height="42" viewBox="0 0 42 42">
      <circle cx="21" cy="21" r={r} fill="none" stroke={C.line} strokeWidth="4" />
      <circle cx="21" cy="21" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} transform="rotate(-90 21 21)" />
      <text x="21" y="25" textAnchor="middle" fontSize="11" fill={C.text} fontFamily={C.mono}>{value}</text>
    </svg>
  );
}

function LearnStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&display=swap');
      .lrn-h-game{ font-family:'Baloo 2', ui-rounded, 'Nunito', system-ui, sans-serif; font-weight:800; letter-spacing:-0.01em; }
      .lrn-card{ position:relative; overflow:hidden; text-align:left; cursor:pointer; background:${C.panel}; border:1.5px solid ${C.line}; border-radius:14px; padding:18px; color:${C.text}; transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
      .lrn-card:hover{ transform:translateY(-3px); border-color:${C.accent}; box-shadow:0 10px 26px rgba(0,0,0,.35); }
      .lrn-card:active{ transform:translateY(-1px); }
      /* Solid, vivid model cards - full-weight accent border, chunky bottom ledge, accent glow on hover */
      .lrn-model-card{ border:2px solid var(--accent); background:linear-gradient(165deg, color-mix(in srgb, var(--accent) 14%, ${C.panel}) 0%, ${C.panel} 58%); box-shadow:0 3px 0 0 color-mix(in srgb, var(--accent) 55%, ${C.bg}); }
      .lrn-model-card::before{ content:''; position:absolute; inset:0; border-radius:inherit; background:radial-gradient(130% 90% at 100% 0%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 60%); opacity:0; transition:opacity .18s ease; pointer-events:none; }
      .lrn-model-card:hover{ transform:translateY(-4px); border-color:var(--accent); box-shadow:0 14px 32px color-mix(in srgb, var(--accent) 30%, rgba(0,0,0,.45)), 0 3px 0 0 color-mix(in srgb, var(--accent) 75%, ${C.bg}); }
      .lrn-model-card:hover::before{ opacity:1; }
      .lrn-model-card:active{ transform:translateY(-1px); box-shadow:0 4px 14px rgba(0,0,0,.4), 0 1px 0 0 color-mix(in srgb, var(--accent) 70%, ${C.bg}); }
      .lrn-card-cta{ position:relative; display:inline-flex; align-items:center; gap:6px; margin-top:14px; font-family:${C.mono}; font-size:12px; font-weight:700; letter-spacing:.02em; color:var(--accent); opacity:.9; }
      .lrn-card-cta i, .lrn-card-go i{ display:inline-block; font-style:normal; transition:transform .18s ease; }
      .lrn-model-card:hover .lrn-card-cta i, .lrn-model-card:hover .lrn-card-go i{ transform:translateX(5px); }
      .lrn-stepper{ list-style:none; padding:0; margin:18px 0 0; }
      .lrn-step{ display:flex; align-items:center; gap:14px; padding:14px; border:1px solid ${C.line}; border-radius:12px; margin-bottom:8px; background:${C.panel}; }
      .lrn-step.locked{ opacity:.55; }
      .lrn-step.open{ border-color:${C.accent}66; }
      .lrn-step-num{ width:30px; height:30px; border-radius:50%; background:${C.panel2}; color:${C.text}; display:flex; align-items:center; justify-content:center; font-weight:700; font-family:${C.mono}; flex-shrink:0; }
      .lrn-btn{ border:none; border-radius:10px; padding:9px 16px; font-weight:700; cursor:pointer; font-size:14px; }
      .lrn-btn:disabled{ cursor:not-allowed; }
      .lrn-btn-ghost{ background:transparent; border:1px solid ${C.line}; color:${C.text}; border-radius:10px; padding:7px 12px; cursor:pointer; font-size:13px; }
      .lrn-btn-ghost:hover{ border-color:${C.accent}; }
      .lrn-link{ background:none; border:none; color:${C.accent}; cursor:pointer; padding:0; font-size:14px; }
      .lrn-box{ background:${C.panel}; border:1px solid ${C.line}; border-radius:12px; padding:16px; margin:12px 0; }
      .lrn-box-label{ font:600 11px/1 ${C.mono}; letter-spacing:.08em; text-transform:uppercase; color:${C.muted}; margin-bottom:6px; }
      .lrn-pre{ background:#0d1117; border:1px solid ${C.line}; border-radius:8px; padding:12px; overflow:auto; font-family:${C.mono}; font-size:13px; color:#cbd5e1; white-space:pre-wrap; margin:0; max-height:320px; }
      .lrn-pre-soft{ white-space:pre-wrap; font-family:inherit; color:#d4dde7; margin:0; }
      .lrn-input{ width:100%; box-sizing:border-box; background:#0d1117; border:1px solid ${C.line}; border-radius:8px; padding:10px; color:${C.text}; font-family:inherit; font-size:14px; margin-bottom:8px; }
      .lrn-input:focus{ outline:none; border-color:${C.accent}; }
      .lrn-field-label{ display:block; font-size:13px; color:${C.muted}; margin:6px 0 4px; }
      .lrn-toggle{ display:flex; align-items:flex-start; gap:10px; margin-top:12px; cursor:pointer; font-size:14px; color:${C.text}; }
      .lrn-toggle input{ margin-top:3px; flex-shrink:0; accent-color:${C.accent}; }
      .lrn-toggle-sub{ display:block; font-size:12px; color:${C.muted}; margin-top:2px; }
      .lrn-opt{ display:flex; align-items:flex-start; gap:8px; padding:9px 11px; border:1px solid ${C.line}; border-radius:8px; margin-bottom:6px; cursor:pointer; }
      .lrn-opt.sel{ background:${C.panel2}; }
      .lrn-opt input{ margin-top:3px; }
      .lrn-grade{ width:44px; height:44px; border-radius:10px; border:2px solid ${C.line}; background:transparent; color:${C.text}; font-weight:800; font-size:18px; cursor:pointer; font-family:${C.mono}; }
      .lrn-model-select{ background:${C.panel2}; border:2px solid ${C.line}; border-radius:999px; padding:6px 14px; font-family:${C.mono}; font-size:13px; font-weight:700; cursor:pointer; -webkit-appearance:none; appearance:none; background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%); background-position:calc(100% - 16px) 52%,calc(100% - 11px) 52%; background-size:5px 5px,5px 5px; background-repeat:no-repeat; padding-right:32px; }
      .lrn-model-select:hover{ filter:brightness(1.1); }
      .lrn-model-hint{ color:${C.muted}; font-size:12px; margin:6px 0 2px; }
      .lrn-report-model{ flex-shrink:0; font-family:${C.mono}; font-size:11px; color:${C.muted}; background:${C.panel2}; border-radius:5px; padding:1px 6px; }
      .lrn-chip{ border:1px solid ${C.line}; border-radius:6px; padding:1px 7px; font-family:${C.mono}; font-weight:700; font-size:12px; }
      .lrn-row{ display:flex; align-items:center; gap:10px; width:100%; background:${C.panel}; border:1px solid ${C.line}; border-radius:10px; padding:10px 12px; margin-bottom:6px; cursor:pointer; color:${C.text}; }
      .lrn-row:hover{ border-color:${C.accent}; }
      .lrn-lb-tabs{ display:flex; gap:8px; flex-wrap:wrap; }
      .lrn-lb-tab{ background:${C.panel}; border:1px solid ${C.line}; color:${C.muted}; border-radius:999px; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:700; transition:transform .1s, border-color .15s, color .15s; }
      .lrn-lb-tab:hover{ border-color:${C.accent}; color:${C.text}; transform:translateY(-1px); }
      .lrn-lb-tab.on{ background:${C.accent}; border-color:${C.accent}; color:#04201d; }
      .lrn-lb-blurb{ color:${C.muted}; font-size:12px; margin:10px 2px 12px; }
      .lrn-lb-head{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
      .lrn-lb-info{ display:inline-flex; align-items:center; gap:6px; background:transparent; border:1px solid ${C.line}; color:${C.muted}; border-radius:999px; padding:5px 12px; font-size:12px; font-weight:700; cursor:pointer; transition:transform .1s, border-color .15s, color .15s, background .15s; }
      .lrn-lb-info:hover{ border-color:${C.accent}; color:${C.text}; transform:translateY(-1px); }
      .lrn-lb-info.on{ border-color:${C.accent}; color:${C.accent}; background:${C.accent}12; }
      .lrn-lb-info span[aria-hidden]{ font-size:14px; }
      .lrn-lb-explain{ background:${C.panel}; border:1px solid ${C.line}; border-radius:16px; padding:14px 18px; margin:0 0 16px; }
      .lrn-lb-explain ul{ margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:9px; }
      .lrn-lb-explain li{ font-size:13px; line-height:1.5; color:${C.text}; }
      .lrn-lb-explain li i{ color:${C.muted}; font-style:normal; opacity:.85; }
      .lrn-lb-scale{ display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-top:14px; padding-top:12px; border-top:1px solid ${C.line}; font-family:${C.mono}; font-size:12px; color:${C.muted}; }
      .lrn-lb-scale-label{ text-transform:uppercase; letter-spacing:.08em; font-size:10px; }
      .lrn-lb-scale b{ font-family:'Baloo 2', ui-rounded, sans-serif; font-size:14px; }
      .lrn-lb-scale b.A{ color:${C.good}; } .lrn-lb-scale b.B{ color:${C.accent}; } .lrn-lb-scale b.C{ color:${C.warn}; } .lrn-lb-scale b.D{ color:#f08a6c; }
      .lrn-lb-sep{ margin:12px 0 0; font-size:12px; color:${C.muted}; line-height:1.5; }
      .lrn-lb-board{ background:${C.panel}; border:1px solid ${C.line}; border-radius:16px; padding:6px; overscroll-behavior:contain; }
      .lrn-lb-row{ display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:12px; }
      .lrn-lb-row + .lrn-lb-row{ border-top:1px solid ${C.line}66; }
      .lrn-lb-row:hover{ background:${C.panel2}; }
      .lrn-lb-row.me{ background:${C.accent}14; box-shadow:inset 0 0 0 1px ${C.accent}55; }
      .lrn-lb-rank{ width:30px; text-align:center; flex-shrink:0; font-family:${C.mono}; font-weight:800; font-size:15px; color:${C.muted}; }
      .lrn-lb-rank.top1, .lrn-lb-rank.top2, .lrn-lb-rank.top3{ font-size:20px; }
      .lrn-lb-id{ flex:1; min-width:0; display:flex; flex-direction:column; line-height:1.25; }
      .lrn-lb-name{ font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .lrn-lb-you{ color:${C.muted}; font-weight:400; }
      .lrn-lb-bp{ font-family:${C.mono}; font-size:11px; color:${C.muted}; }
      .lrn-lb-metric{ flex-shrink:0; text-align:right; display:flex; flex-direction:column; line-height:1.2; }
      .lrn-lb-metric.dim{ opacity:.5; }
      .lrn-lb-main{ font-family:${C.mono}; font-weight:800; font-size:17px; color:${C.text}; }
      .lrn-lb-unit{ font-size:11px; color:${C.muted}; }
      .lrn-lb-msg{ color:${C.muted}; padding:18px 12px; text-align:center; }
      /* track view: winding path + report card */
      .lrn-track-grid{ display:grid; grid-template-columns:1fr 300px; gap:24px; margin-top:18px; align-items:start; }
      @media (max-width:820px){ .lrn-track-grid{ grid-template-columns:1fr; } }
      .lrn-path{ position:relative; width:${BOARD_W}px; max-width:100%; margin:18px auto 0; overflow:visible; }
      .lrn-path-road{ position:absolute; top:0; left:0; pointer-events:none; z-index:0; overflow:visible; }
      /* forest trail: a dirt path with sandy stepping-stones; the cleared stretch lights up in the track color */
      .lrn-road-bed{ fill:none; stroke:#5c4733; stroke-width:18; stroke-linecap:round; stroke-linejoin:round; opacity:.5; }
      .lrn-road-base{ fill:none; stroke:#d8c39a; stroke-width:5; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:0.1 13; opacity:.6; }
      .lrn-road-done{ fill:none; stroke-width:13; stroke-linecap:round; stroke-linejoin:round; opacity:.92; }
      /* each level: a candy node with its title centered BELOW it, placed absolutely on the board */
      .lrn-node-row{ position:absolute; z-index:1; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; width:154px; }
      .lrn-node-row:hover, .lrn-node-row:focus-within{ z-index:7; }
      .lrn-node-row.locked .lrn-node-title{ color:${C.muted}; }
      .lrn-node{ position:relative; width:62px; height:62px; flex-shrink:0; border-radius:50%; border:none; cursor:pointer; background:${C.panel2}; color:${C.muted}; font-family:'Baloo 2', ui-rounded, system-ui, sans-serif; font-weight:800; font-size:22px; box-shadow:0 6px 0 ${C.bg}; transition:transform .08s ease, filter .15s ease; }
      .lrn-node::after{ content:''; position:absolute; inset:0; border-radius:50%; background:radial-gradient(circle at 33% 26%, rgba(255,255,255,.5), rgba(255,255,255,0) 46%); pointer-events:none; }
      .lrn-node:hover{ filter:brightness(1.08); }
      .lrn-node:active{ transform:translateY(4px); box-shadow:0 2px 0 ${C.bg}; }
      .lrn-node.open{ color:${C.text}; box-shadow:0 6px 0 ${C.line}; }
      .lrn-node.locked{ cursor:not-allowed; box-shadow:0 6px 0 #0a0d14; opacity:.6; }
      .lrn-node.locked::after{ opacity:.25; }
      .lrn-node-face{ position:relative; z-index:1; }
      .lrn-node-ping{ position:absolute; inset:-6px; border-radius:50%; border:3px solid; animation:lrnPing 1.6s ease-out infinite; }
      @keyframes lrnPing{ 0%{ transform:scale(1); opacity:.7; } 100%{ transform:scale(1.4); opacity:0; } }
      /* bouncing "you are here" map pin, tinted with the track color via currentColor */
      .lrn-node-pin{ position:absolute; left:50%; top:-22px; width:18px; height:18px; transform:translateX(-50%) rotate(45deg); border-radius:50% 50% 50% 0; background:currentColor; box-shadow:0 3px 6px rgba(0,0,0,.45); animation:lrnBob 1.25s ease-in-out infinite; z-index:3; }
      .lrn-node-pin::after{ content:''; position:absolute; inset:5px; border-radius:50%; background:#fff; }
      @keyframes lrnBob{ 0%,100%{ transform:translateX(-50%) translateY(0) rotate(45deg); } 50%{ transform:translateX(-50%) translateY(-5px) rotate(45deg); } }
      /* 1–3 earned stars, hugging the bottom of a cleared candy node */
      .lrn-node-stars{ position:absolute; left:50%; bottom:-8px; transform:translateX(-50%); display:flex; gap:1px; z-index:2; font-size:13px; line-height:1; filter:drop-shadow(0 1px 1px rgba(0,0,0,.6)); }
      .lrn-node-star{ color:#39414f; }
      .lrn-node-star.on{ color:${C.gold}; }
      .lrn-node-label{ margin-top:9px; text-align:center; width:100%; }
      .lrn-node-title{ font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; font-size:14px; line-height:1.2; }
      .lrn-node-grade{ font-family:${C.mono}; font-weight:800; }
      .lrn-node-sub{ color:${C.muted}; font-size:12px; }
      /* the brief is a hover popover now, so it never reflows the fixed board geometry */
      .lrn-node-brief{ position:absolute; top:calc(100% + 8px); left:50%; transform:translateX(-50%); width:230px; background:${C.panel}; border:1px solid ${C.line}; border-radius:10px; padding:9px 11px; opacity:0; pointer-events:none; transition:opacity .18s ease; z-index:8; box-shadow:0 10px 26px rgba(0,0,0,.45); }
      .lrn-node-row:hover .lrn-node-brief, .lrn-node-row:focus-within .lrn-node-brief{ opacity:1; }
      .lrn-node-brief p{ margin:0; font-size:12.5px; line-height:1.45; color:${C.text}; }
      .lrn-node-brief-lock{ display:inline-block; margin-top:5px; font-size:11px; color:${C.muted}; font-family:${C.mono}; }
      .lrn-path-end{ position:absolute; transform:translate(-50%,-50%); display:inline-flex; align-items:center; gap:7px; white-space:nowrap; font-family:'Baloo 2', ui-rounded, system-ui, sans-serif; font-weight:800; font-size:15px; padding:8px 16px; border:2px dashed; border-radius:999px; background:${C.bg}; z-index:1; }
      .lrn-report{ position:sticky; top:16px; background:${C.panel}; border:1px solid ${C.line}; border-radius:16px; padding:16px; }
      .lrn-report-head{ display:flex; align-items:center; gap:10px; margin-bottom:14px; }
      .lrn-report-emoji{ font-size:26px; }
      .lrn-report-title{ font-family:'Baloo 2', ui-rounded, system-ui, sans-serif; font-weight:800; font-size:17px; }
      .lrn-report-track{ color:${C.muted}; font-size:12px; }
      .lrn-report-stats{ display:flex; gap:8px; margin-bottom:12px; }
      .lrn-stat{ flex:1; background:${C.bg}; border:1px solid ${C.line}; border-radius:12px; padding:10px 6px; text-align:center; }
      .lrn-stat-num{ font-family:'Baloo 2', ui-rounded, system-ui, sans-serif; font-weight:800; font-size:22px; }
      .lrn-stat-lbl{ color:${C.muted}; font-size:10px; text-transform:uppercase; letter-spacing:.06em; margin-top:2px; }
      .lrn-cert{ text-align:center; border:1px dashed ${C.line}; color:${C.muted}; border-radius:10px; padding:7px; font-size:13px; font-weight:700; margin-bottom:12px; }
      .lrn-cert.on{ border-style:solid; }
      .lrn-report-list{ display:flex; flex-direction:column; }
      .lrn-report-row{ display:flex; align-items:center; gap:8px; padding:7px 2px; border-top:1px solid ${C.line}66; }
      .lrn-report-row:first-child{ border-top:none; }
      .lrn-report-pnum{ width:18px; flex-shrink:0; font-family:${C.mono}; font-size:12px; color:${C.muted}; }
      .lrn-report-pname{ flex:1; min-width:0; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .lrn-report-chip{ flex-shrink:0; min-width:30px; text-align:center; border:1px solid ${C.line}; border-radius:6px; padding:1px 6px; font-family:${C.mono}; font-weight:700; font-size:12px; }
      .lrn-report-chip.muted{ color:${C.muted}; }
      .lrn-report-notes{ flex-shrink:0; background:transparent; border:1px solid ${C.line}; color:${C.text}; border-radius:8px; padding:3px 9px; font-size:12px; cursor:pointer; }
      .lrn-report-notes:hover{ border-color:${C.accent}; color:${C.accent}; }
      .lrn-report-foot{ color:${C.muted}; font-size:11px; margin:12px 2px 0; }
      .lrn-cafeteria-btn{ position:relative; display:inline-flex; align-items:center; gap:8px; background:${C.panel}; border:1px solid ${C.line}; color:${C.text}; border-radius:14px; padding:12px 20px; font-weight:800; font-family:'Baloo 2', ui-rounded, system-ui, sans-serif; font-size:16px; cursor:pointer; transition:transform .1s ease, border-color .15s, background .15s; box-shadow:0 4px 0 ${C.bg}; }
      .lrn-cafeteria-btn:hover{ border-color:${C.accent}; transform:translateY(-1px); }
      .lrn-cafeteria-btn:active{ transform:translateY(2px); box-shadow:0 2px 0 ${C.bg}; }
      .lrn-cafe-dot{ position:absolute; top:-5px; right:-5px; width:15px; height:15px; border-radius:50%; background:#ef4444; border:2px solid ${C.bg}; animation:cafePulse 1.8s infinite; }
      @keyframes cafePulse{ 0%{ box-shadow:0 0 0 0 rgba(239,68,68,.55);} 70%{ box-shadow:0 0 0 8px rgba(239,68,68,0);} 100%{ box-shadow:0 0 0 0 rgba(239,68,68,0);} }
      .lrn-cafe-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.62); z-index:6000; display:flex; align-items:center; justify-content:center; padding:24px; }
      .lrn-cafe-panel{ background:${C.bg}; border:1px solid ${C.line}; border-radius:18px; width:100%; max-width:1040px; height:min(82vh,780px); display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 90px rgba(0,0,0,.6); }
      .lrn-cafe-panel-head{ display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid ${C.line}; font-family:'Baloo 2', ui-rounded, system-ui, sans-serif; font-weight:800; font-size:18px; }
      .lrn-cafe-panel-head small{ color:${C.muted}; font-weight:400; font-size:13px; }
      .lrn-cafe-panel-body{ flex:1; min-height:0; display:flex; }
      .lrn-cafe-panel-body .community-channels-container{ flex:1; min-height:0; height:100%; max-height:none; width:100%; margin-top:0; border:none; border-radius:0; }
      .lrn-modal-wrap{ position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:5000; display:flex; align-items:flex-start; justify-content:center; overflow-y:auto; padding:32px 16px; }
      .lrn-modal{ background:${C.bg}; border:1px solid ${C.line}; border-radius:16px; padding:24px; width:100%; max-width:680px; position:relative; }
      .lrn-x{ margin-left:auto; background:none; border:none; color:${C.muted}; font-size:18px; cursor:pointer; }
    `}</style>
  );
}
