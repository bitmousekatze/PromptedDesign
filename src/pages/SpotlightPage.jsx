import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSiteSettings, onSiteSettings, refreshSiteSettings } from '../lib/readOnly';
import { ChatAvatar, SpotlightGem } from '../components/sharedUI.jsx';
// ============================================================
// Spotlight — monthly creator contest, with a flip-through
// archive of past winners (data pulled from the contest
// communities + winner announcement posts in Supabase).
//
// Restyle pass (July 2026): hall-of-fame winner slides with
// confetti + shine, tactile ticket-style timeline, slot-machine
// dice shuffle, podium prize cards, and a hype countdown teaser.
// All data, fetching, and click handlers are unchanged.
// ============================================================

const COMMUNITY_URL = 'https://www.prmpted.com/community/june-1000-creator-of-the-month';
const JUNE_COMMUNITY_ID = 'e3fd064c-cb06-4117-9aef-9739097d512c';

// Chronological. The "current" contest is the one the page opens on.
const CONTESTS = [
  {
    key: 'feb',
    pill: "Feb '26",
    kicker: 'Spotlight · February 2026',
    title: '$250 Creator of the Month Giveaway',
    status: 'past',
    winner: {
      userId: '9890c16c-6d99-44a7-b12a-33e506f88e82',
      username: 'arinzaay',
      project: 'North Eleven Labs',
      projectUrl: 'https://huggingface.co/spaces/Arinzaay007/Notelevenlabs',
      blurb:
        'An AI voice synthesizer that lets you use any voice to read a transcript — so well done the team used it themselves for Prompted ad reads.',
      announcementPostId: '3f9c1e15-a45e-4b1e-a242-dfefd733209f',
    },
    highlights: [
      { userId: '5c298a2a-b0b4-46bf-86a5-e99e29d2d6a3', username: 'uche', text: 'AI agents that enforce WCAG 2.1 AA in Claude Code automatically' },
      { userId: '9890c16c-6d99-44a7-b12a-33e506f88e82', username: 'arinzaay', text: 'The Hive Mind & AetherWatch — two more builds in one month' },
      { userId: 'cea3b363-dd88-44b5-93e1-4bcff36237f3', username: 'minerxx', text: 'NutriBudget — a budget-based healthy meal planner' },
    ],
    footnote: 'The contest that started it all — 28 builders competed in the first-ever Creator of the Month.',
  },
  {
    key: 'mar',
    pill: "Mar '26",
    kicker: 'Spotlight · March 2026',
    title: '$300 Creator of the Month Giveaway',
    status: 'past',
    winner: {
      userId: 'cea3b363-dd88-44b5-93e1-4bcff36237f3',
      username: 'minerxx',
      project: 'Dispatch',
      projectUrl: 'https://dispatch-psi.vercel.app/',
      blurb:
        'An AI news agent so useful the judges started running it daily — minerxx even taught the community how to build agents of their own.',
      announcementPostId: 'e1785ff8-565e-4ac1-8b89-6b9c7447f289',
    },
    highlights: [
      { userId: 'd79a97d2-8d4d-4f98-b5b4-43d55de879da', username: 'mollie', text: 'Dreamweaver, Safespace & D’Autos — three polished apps in one month' },
      { userId: '874ce826-b40d-4473-952f-8abeb4ad174d', username: 'lonerogue8', text: 'A whole series of AI mascot & motion-control videos' },
    ],
    footnote: 'A tough call between 36 members — the runner-up shoutouts were earned.',
  },
  {
    key: 'jun',
    pill: "June '26",
    kicker: 'Spotlight · June 2026',
    title: '$1,000 Build Challenge',
    // 'archive' keeps the full bespoke June page (winner reveal, Pro contest,
    // banners) alive in the timeline instead of the slim PastContest card.
    status: 'archive',
  },
  {
    key: 'jul',
    pill: "July '26",
    kicker: 'Spotlight · July 2026',
    title: '$1,000 Creator of the Month',
    status: 'current',
  },
];

// ── July 2026 contest ──
// Same $1,000 pot and split as June ($600/$300/$100). No banner prizes this
// round — the permanent Spotlight badge is the flex for the whole top 5.
// Community id (for entry fetching later, e.g. random builds / roulette):
// 4ee08169-2b16-4327-96fa-b8b448d400a8
const JULY_COMMUNITY_URL = 'https://www.prmpted.com/community/july-1000-creator-of-the-month';
// Close of July 31 at midnight US-Eastern, same pinned-offset trick as the
// sidebar countdown badge in App.jsx — one worldwide deadline.
const JULY_DEADLINE = new Date('2026-08-01T00:00:00-04:00');

const CURRENT_INDEX = CONTESTS.findIndex((c) => c.status === 'current');

// The five creators who showed up for the June spotlight shoutout thread.
const JUNE_SHOUTOUTS = [
  { userId: '2e5cd5da-e5c7-4147-866a-8946e557c006', name: 'Emily', username: 'emythedev' },
  { userId: '9056e7d1-07cf-40c3-9050-4dc72793a89f', name: 'Bassey', username: 'braindev' },
  { userId: '666187f6-f7ea-4329-a947-c6a72f421fa2', name: 'Joshua', username: 'josh1' },
  { userId: '873860da-0335-48bc-8c05-df7712431f27', name: 'Lateef', username: 'latieng' },
  { userId: 'a01ee86a-f064-4142-8638-84fe8a2fc523', name: 'Chloe', username: 'chlo' },
  { userId: '98c08c0b-26ba-4370-a431-654e410be504', name: 'Ken', username: 'kennethics' },
  { userId: '0e83abc4-fc9b-4e33-8335-99a0e623ae5f', name: 'TheGreenHoodLegend', username: 'cannamuffinman' },
  { userId: '75a55055-55b8-484c-a334-06f4cabb1f6b', name: 'viktor', username: 'vicdengineeer' },
  { userId: '185a3359-9f65-4b6a-8dad-45ad26497bad', name: 'anita', username: 'anitanft' },
  { userId: '78d8a974-e874-4fe0-bd4a-15c79adc3f52', name: 'Michael', username: 'm18ad' },
  { userId: '43dc6793-2441-4cb7-a8d1-16a75ff8888e', name: 'John Joseph Bassey', username: 'josephjbassey' },
  { userId: 'bb6a7f6b-73a0-4086-9897-81f305d8f7be', name: 'Zicsmartt', username: 'zicsmartt' },
  { userId: '4a763da6-b030-4e07-8caa-85adcf51e9cc', name: 'Adriel', username: 'vnua' },
];

// ── July 5 live announcement ──
// The real winners, pinned. Until the site-wide spotlight_hidden toggle is
// unchecked (admin control below the June hero), everyone except @devmouse
// still sees the slot-machine roulette — flip it off on stream and the cards
// lock to these as the permanent record within the 60s settings poll.
const JUNE_WINNERS = [
  { userId: 'a01ee86a-f064-4142-8638-84fe8a2fc523', username: 'chlo' },      // 1st — Chloe
  { userId: 'd79a97d2-8d4d-4f98-b5b4-43d55de879da', username: 'mollie' },    // 2nd — Mollie
  { userId: '9f3fa2ff-dab6-4bda-8e0a-a1a30a1750a5', username: 'vision' },    // 3rd — Vision
];
const JUNE_FINALISTS = [
  { userId: '0e83abc4-fc9b-4e33-8335-99a0e623ae5f', username: 'cannamuffinman' },  // TheGreenHoodLegend
  { userId: '76e5a888-de45-4ab5-be3f-3c2bdb11ee4a', username: 'minddefinitive' },  // MindDefinitive
  { userId: '43dc6793-2441-4cb7-a8d1-16a75ff8888e', username: 'josephjbassey' },   // John Joseph Bassey
  { userId: '3ccd3793-5c81-4605-809d-eac6ef76cf5f', username: 'netskrip' },        // netskrip
  { userId: '78d8a974-e874-4fe0-bd4a-15c79adc3f52', username: 'm18ad' },           // Michael
];

// June's separate Pro-tier contest — shouted out alongside the main podium.
const JUNE_PRO_WINNERS = [
  { userId: 'c25b2ed7-a47a-424a-9cc9-18b1afb7c651', username: 'thebuilderx', name: 'Arqon', medal: '🥇', place: '1st place' },
  { userId: '83f54b33-ff77-493c-864a-c3c9f8c07c4b', username: 'sasam', name: 'onad', medal: '🥈', place: '2nd place' },
];

// The one account that sees the pinned results while spotlight_hidden is on.
const SPOTLIGHT_PREVIEW_USERNAME = 'devmouse';

// Quick-try colors for the Spotlight badge demo (any color works — there's a
// full picker next to them, same as the Gem color setting in Settings → Profile).
const GEM_SWATCHES = ['#FFD700', '#ff4d4d', '#ff5ec8', '#a970ff', '#7cc3ff', '#4ade80', '#ffffff'];

// Exclusive profile banners for the top 5, hand-made for this contest by
// Doggo (@hartgallerydoggo). These previews are watermarked — winners get
// the clean versions. Files live in public/contest-banners/june-2026/
// (docs/Banners/watermarked/ is the gitignored master copy).
const DOGGO = { username: 'hartgallerydoggo' };
const CONTEST_BANNERS = [
  { name: 'Glitch Terminal', src: '/contest-banners/june-2026/glitch-terminal.png' },
  { name: 'Prompted Rain', src: '/contest-banners/june-2026/prompted-rain.png' },
  { name: 'WireBored', src: '/contest-banners/june-2026/wirebored.png' },
  { name: 'Syntax Puzzle', src: '/contest-banners/june-2026/syntax-puzzle.png' },
  { name: 'Syntax Puzzle — Noir', src: '/contest-banners/june-2026/syntax-puzzle-noir.png' },
  { name: 'Syntax Puzzle — Midnight', src: '/contest-banners/june-2026/syntax-puzzle-midnight.png' },
  { name: "Desktop '95 — Grok", src: '/contest-banners/june-2026/desktop-95-grok.png' },
  { name: "Desktop '95 — Claude Code", src: '/contest-banners/june-2026/desktop-95-claude-code.png' },
  { name: "Desktop '95 — ChatGPT", src: '/contest-banners/june-2026/desktop-95-chatgpt.png' },
  { name: "Desktop '95 — Ship It", src: '/contest-banners/june-2026/desktop-95-ship-it.png' },
  { name: "Desktop '95 — Lovable", src: '/contest-banners/june-2026/desktop-95-lovable.png' },
];

// ────────────────────────────────────────────────────────────
// Presentational FX — keyframes + hover/press states only.
// (Inline style objects can't express :hover/:active/keyframes,
// same pattern as SpotlightGem's scoped <style> in sharedUI.)
// ────────────────────────────────────────────────────────────
const GOLD = '#ffd75e';
const PINK = '#ff5ec8';

const FX_CSS = `
@keyframes spx-confetti {
  0%   { transform: translateY(-12px) rotate(0deg); opacity: 0; }
  6%   { opacity: 0.95; }
  100% { transform: translateY(380px) rotate(640deg); opacity: 0; }
}
@keyframes spx-shine {
  0%, 55%   { transform: translateX(-140%) skewX(-18deg); }
  90%, 100% { transform: translateX(260%) skewX(-18deg); }
}
@keyframes spx-float {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50%      { transform: translateY(-8px) rotate(3deg); }
}
@keyframes spx-pop {
  0%   { opacity: 0; transform: translateY(18px) scale(0.9); }
  70%  { opacity: 1; transform: translateY(-3px) scale(1.02); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes spx-slidein {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes spx-shimmer {
  from { background-position: 200% center; }
  to   { background-position: -200% center; }
}
@keyframes spx-dice {
  0%   { transform: rotate(0deg) scale(1); }
  25%  { transform: rotate(-28deg) scale(1.3) translateY(-3px); }
  50%  { transform: rotate(20deg) scale(1.15); }
  75%  { transform: rotate(-14deg) scale(1.25) translateY(-2px); }
  100% { transform: rotate(0deg) scale(1); }
}
@keyframes spx-pulse-ring {
  0%   { box-shadow: 0 0 0 0 rgba(74,222,128,0.55); }
  100% { box-shadow: 0 0 0 9px rgba(74,222,128,0); }
}
@keyframes spx-slot {
  0%   { transform: translateY(45%) scale(1.05); opacity: 0; filter: blur(5px); }
  60%  { opacity: 1; }
  100% { transform: translateY(0) scale(1); opacity: 1; filter: blur(0); }
}
.spx-pill { transition: transform .15s ease, box-shadow .15s ease, filter .15s ease; }
.spx-pill:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.15); }
.spx-pill:active:not(:disabled) { transform: translateY(1px) scale(0.95); }
.spx-lift { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
.spx-lift:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,215,94,0.28); }
.spx-cta { transition: transform .15s ease, filter .15s ease, box-shadow .15s ease; }
.spx-cta:hover { filter: brightness(1.08); transform: translateY(-1px); }
.spx-cta:active { transform: scale(0.96); }
@media (prefers-reduced-motion: reduce) {
  .spx-anim, .spx-anim * { animation: none !important; }
}
`;

const FxStyles = () => <style>{FX_CSS}</style>;

// Gentle looping confetti inside the hall-of-fame hero.
const CONFETTI_COLORS = [GOLD, PINK, '#7cc3ff', '#ffffff', '#ffb347'];
function Confetti({ count = 22 }) {
  return (
    <div aria-hidden="true" className="spx-anim" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 'inherit' }}>
      {Array.from({ length: count }).map((_, i) => {
        const left = (i * 47.3 + 13) % 100;
        const delay = (i * 0.53) % 4.2;
        const dur = 3.4 + ((i * 0.79) % 2.6);
        const size = 5 + (i % 4) * 2;
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              top: -14,
              left: `${left}%`,
              width: size,
              height: Math.max(4, Math.round(size * 0.5)),
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              borderRadius: i % 3 === 0 ? '50%' : 2,
              opacity: 0,
              animation: `spx-confetti ${dur}s linear ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Spotify iFrame Embed API (loaded once, on demand) ──
let spotifyApiPromise = null;
const loadSpotifyIframeApi = () => {
  if (spotifyApiPromise) return spotifyApiPromise;
  spotifyApiPromise = new Promise((resolve) => {
    window.onSpotifyIframeApiReady = (IFrameAPI) => resolve(IFrameAPI);
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    document.body.appendChild(s);
  });
  return spotifyApiPromise;
};

// Accepts share links (incl. /intl-xx/) and spotify:track: URIs.
const parseSpotifyTrackId = (raw) => {
  const s = String(raw || '').trim();
  const m =
    s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/i) ||
    s.match(/^spotify:track:([A-Za-z0-9]{22})$/i);
  return m ? m[1] : null;
};

export default function SpotlightPage({ onBack, onUserClick, profile }) {
  const [index, setIndex] = useState(CURRENT_INDEX === -1 ? 0 : CURRENT_INDEX);
  const contest = CONTESTS[index];

  // Winner-reveal gate: while site_settings.spotlight_hidden is on, only
  // @devmouse sees the pinned June results — everyone else keeps the roulette.
  const [site, setSite] = useState(getSiteSettings());
  useEffect(() => onSiteSettings(setSite), []);
  const revealed = !site.spotlight_hidden || profile?.username === SPOTLIGHT_PREVIEW_USERNAME;

  // Party mode: community Spotify jukebox + fallback chiptune house mix
  // (public/spotlight-party.mp3), with confetti while either is playing.
  const [jukeboxOpen, setJukeboxOpen] = useState(false);
  const [spotifyPlaying, setSpotifyPlaying] = useState(false);
  const [partyOn, setPartyOn] = useState(false);
  const partyAudioRef = useRef(null);
  const toggleParty = () => {
    if (!partyAudioRef.current) {
      const a = new Audio('/spotlight-party.mp3');
      a.loop = true;
      a.volume = 0.45;
      partyAudioRef.current = a;
    }
    if (partyOn) {
      partyAudioRef.current.pause();
      setPartyOn(false);
    } else {
      partyAudioRef.current.play().catch(() => {});
      setPartyOn(true);
    }
  };
  // Jukebox and house mix don't talk over each other.
  const handleSpotifyPlaying = (playing) => {
    setSpotifyPlaying(playing);
    if (playing && partyAudioRef.current && !partyAudioRef.current.paused) {
      partyAudioRef.current.pause();
      setPartyOn(false);
    }
  };
  // Stop the music when the user leaves the Spotlight tab.
  useEffect(() => () => { partyAudioRef.current?.pause(); }, []);

  const openUser = (u) => {
    if (onUserClick && u.userId) onUserClick(u.userId);
    else window.location.href = `/${u.username}`;
  };

  const UserLink = ({ user, style, children }) => (
    <button onClick={() => openUser(user)} style={style || userLinkStyle}>
      {children || `@${user.username}`}
    </button>
  );

  return (
    <div className="spotlight-page" style={pageStyle}>
      <FxStyles />
      {onBack && (
        <button
          className="community-back-btn"
          onClick={onBack}
          // Sticky + safe-area offset so Back stays reachable on this long page
          // (it used to scroll out of view) and sits above the content.
          style={{
            position: 'sticky',
            top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
            zIndex: 20,
            padding: '10px 16px',
            fontSize: 15,
            background: 'rgba(10,10,15,0.6)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span aria-hidden="true">←</span> Back
        </button>
      )}

      {/* ── Contest timeline: flip through past → present → next ── */}
      <nav style={timelineStyle} aria-label="Contest timeline">
        <button
          className="spx-pill"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          style={{ ...arrowStyle, opacity: index === 0 ? 0.3 : 1 }}
          aria-label="Previous contest"
        >
          ←
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {CONTESTS.map((c, i) => (
            <button
              key={c.key}
              className="spx-pill"
              onClick={() => setIndex(i)}
              style={{
                ...timelinePillStyle,
                ...(i === index ? timelinePillActive : null),
              }}
            >
              {(c.status === 'past' || c.status === 'archive') && <span aria-hidden="true" style={{ fontSize: 12 }}>🏆</span>}
              {c.pill}
              {c.status === 'current' && <span className="spx-anim" style={nowDotStyle} aria-hidden="true" />}
            </button>
          ))}
        </div>
        <button
          className="spx-pill"
          onClick={() => setIndex((i) => Math.min(CONTESTS.length - 1, i + 1))}
          disabled={index === CONTESTS.length - 1}
          style={{ ...arrowStyle, opacity: index === CONTESTS.length - 1 ? 0.3 : 1 }}
          aria-label="Next contest"
        >
          →
        </button>
      </nav>

      {/* ── Party mode ── */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', margin: '-12px 0 24px' }}>
        <button
          className="spx-cta"
          onClick={() => setJukeboxOpen((v) => !v)}
          style={{ ...partyBtnStyle, ...(jukeboxOpen ? partyBtnOnStyle : null) }}
        >
          <span
            aria-hidden="true"
            className="spx-anim"
            style={{ display: 'inline-block', animation: spotifyPlaying ? 'spx-dice 0.6s ease-in-out infinite' : 'none' }}
          >
            🎶
          </span>
          {jukeboxOpen ? 'Close the jukebox' : 'Party jukebox'}
        </button>
        <button
          className="spx-cta"
          onClick={toggleParty}
          style={{ ...partyBtnStyle, ...(partyOn ? partyBtnOnStyle : null) }}
        >
          <span
            aria-hidden="true"
            className="spx-anim"
            style={{ display: 'inline-block', animation: partyOn ? 'spx-dice 0.6s ease-in-out infinite' : 'none' }}
          >
            {partyOn ? '🔊' : '🎉'}
          </span>
          {partyOn ? 'Stop the mix' : 'Play house mix'}
        </button>
      </div>
      {jukeboxOpen && <PartyJukebox onPlayingChange={handleSpotifyPlaying} />}
      {(partyOn || spotifyPlaying) && (
        <div aria-hidden="true" style={partyOverlayStyle}>
          <Confetti count={44} />
        </div>
      )}

      {/* Keyed so each contest slides in when flipped to. */}
      <div key={contest.key} className="spx-anim" style={{ animation: 'spx-slidein .4s cubic-bezier(.22,1,.36,1) both' }}>
        {contest.status === 'past' && (
          <PastContest contest={contest} UserLink={UserLink} />
        )}
        {contest.status === 'archive' && (
          <JuneContest
            UserLink={UserLink}
            openUser={openUser}
            revealed={revealed}
            isAdmin={!!profile?.is_admin}
            spotlightHidden={!!site.spotlight_hidden}
          />
        )}
        {contest.status === 'current' && <JulyContest />}
      </div>
    </div>
  );
}

// ── Party jukebox: community Spotify queue ──
// Tracks live in spotlight_party_tracks (RLS: public read, 3 adds per user
// per 30 days, own/admin delete). Playback via Spotify's iFrame Embed API —
// full songs for visitors signed into Spotify Premium, 30s previews otherwise.
function PartyJukebox({ onPlayingChange }) {
  const [tracks, setTracks] = useState(null);
  const [queuePos, setQueuePos] = useState(0);
  const [me, setMe] = useState(null); // { id, is_admin }
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const playerHostRef = useRef(null);
  const controllerRef = useRef(null);
  const advanceLockRef = useRef(false);
  const queueRef = useRef({ tracks: [], pos: 0 });

  const loadTracks = async () => {
    const { data } = await supabase
      .from('spotlight_party_tracks')
      .select('id, spotify_track_id, title, created_at, user_id, profiles:user_id(username)')
      .order('created_at', { ascending: true });
    setTracks(data || []);
    return data || [];
  };

  useEffect(() => {
    loadTracks();
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data?.user?.id;
      if (!uid) return;
      const { data: prof } = await supabase
        .from('profiles').select('id, is_admin').eq('id', uid).maybeSingle();
      if (prof) setMe(prof);
    });
  }, []);

  // The playback listener is registered once — read the queue through a ref.
  useEffect(() => { queueRef.current = { tracks: tracks || [], pos: queuePos }; }, [tracks, queuePos]);

  const playAt = (i) => {
    const q = queueRef.current.tracks;
    if (!q.length) return;
    const idx = ((i % q.length) + q.length) % q.length;
    setQueuePos(idx);
    const c = controllerRef.current;
    if (c) {
      c.loadUri(`spotify:track:${q[idx].spotify_track_id}`);
      c.play();
    }
  };

  // Boot the Spotify player once we have at least one track.
  useEffect(() => {
    if (!tracks || !tracks.length || controllerRef.current || !playerHostRef.current) return;
    let disposed = false;
    loadSpotifyIframeApi().then((IFrameAPI) => {
      if (disposed || controllerRef.current || !playerHostRef.current) return;
      IFrameAPI.createController(
        playerHostRef.current,
        { uri: `spotify:track:${tracks[0].spotify_track_id}`, width: '100%', height: 152 },
        (controller) => {
          controllerRef.current = controller;
          controller.addListener('playback_update', (e) => {
            const d = e?.data || {};
            onPlayingChange?.(!d.isPaused);
            // Track finished → jukebox advances itself.
            if (d.duration > 0 && d.position >= d.duration - 400 && !advanceLockRef.current) {
              advanceLockRef.current = true;
              const { tracks: q, pos } = queueRef.current;
              if (q.length > 1) playAt(pos + 1);
              setTimeout(() => { advanceLockRef.current = false; }, 2000);
            }
          });
        },
      );
    });
    return () => { disposed = true; };
  }, [tracks]);

  // Closing the jukebox stops the music.
  useEffect(() => () => {
    controllerRef.current?.destroy?.();
    controllerRef.current = null;
    onPlayingChange?.(false);
  }, []);

  const submit = async () => {
    const trackId = parseSpotifyTrackId(link);
    if (!trackId) {
      setNotice('Paste a Spotify track link — e.g. https://open.spotify.com/track/…');
      return;
    }
    if (!me?.id) {
      setNotice('Sign in to add a song.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      // Grab the "Song · Artist" title from Spotify's public oEmbed (optional).
      let title = null;
      try {
        const r = await fetch(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${trackId}`)}`,
        );
        if (r.ok) title = (await r.json())?.title || null;
      } catch { /* title is a nice-to-have */ }

      const { error } = await supabase
        .from('spotlight_party_tracks')
        .insert({ user_id: me.id, spotify_track_id: trackId, title });
      if (error) {
        if (error.code === '23505') setNotice('That song is already in the jukebox!');
        else if (error.code === '42501') setNotice('Could not add it — you may have hit the 3 songs per month limit.');
        else setNotice(error.message || 'Could not add the song.');
        return;
      }
      setLink('');
      setNotice('Added! 🎶');
      await loadTracks();
    } finally {
      setBusy(false);
    }
  };

  const removeTrack = async (t) => {
    const { error } = await supabase.from('spotlight_party_tracks').delete().eq('id', t.id);
    if (error) { setNotice(error.message); return; }
    const q = await loadTracks();
    if (queuePos >= q.length) setQueuePos(0);
  };

  const current = tracks?.[queuePos];

  return (
    <section className="spx-anim" style={{ ...jukeboxPanelStyle, animation: 'spx-slidein .35s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...h2Style, margin: 0 }}>🎶 Party jukebox</h2>
        <span style={{ fontSize: 13, opacity: 0.6 }}>
          community picks · full songs need Spotify Premium in this browser, everyone else gets previews
        </span>
      </div>

      {tracks === null && <p style={{ ...pStyle, marginTop: 14 }}>Loading the queue…</p>}

      {tracks !== null && tracks.length === 0 && (
        <p style={{ ...pStyle, marginTop: 14 }}>
          Nothing in the jukebox yet — drop the first song below, or hit the house mix. 🕺
        </p>
      )}

      {tracks !== null && tracks.length > 0 && (
        <>
          {/* Spotify replaces this div with its iframe */}
          <div style={{ marginTop: 14 }}>
            <div ref={playerHostRef} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="spx-pill" style={arrowStyle} onClick={() => playAt(queuePos - 1)} aria-label="Previous song">⏮</button>
            <button className="spx-pill" style={arrowStyle} onClick={() => playAt(queuePos + 1)} aria-label="Next song">⏭</button>
            {current && (
              <span style={{ fontSize: 13, opacity: 0.7 }}>
                {queuePos + 1}/{tracks.length}
                {current.profiles?.username && <> · added by @{current.profiles.username}</>}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
            {tracks.map((t, i) => (
              <div key={t.id} style={{ ...queueRowStyle, ...(i === queuePos ? queueRowActiveStyle : null) }}>
                <button onClick={() => playAt(i)} style={queuePlayBtnStyle} aria-label={`Play ${t.title || 'song'}`}>
                  {i === queuePos ? '▶' : i + 1}
                </button>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {t.title || `Track ${t.spotify_track_id.slice(0, 6)}…`}
                  {t.profiles?.username && (
                    <span style={{ opacity: 0.55, fontSize: 12 }}> · @{t.profiles.username}</span>
                  )}
                </span>
                {(me?.is_admin || me?.id === t.user_id) && (
                  <button onClick={() => removeTrack(t)} style={queueDeleteBtnStyle} aria-label="Remove song">✕</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Paste a Spotify track link…"
          style={jukeboxInputStyle}
        />
        <button className="spx-cta" onClick={submit} disabled={busy} style={{ ...partyBtnStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Adding…' : '➕ Add a song'}
        </button>
      </div>
      {notice && <p style={{ ...pStyle, marginTop: 10, fontSize: 14, opacity: 0.85 }}>{notice}</p>}
      <p style={{ fontSize: 12, opacity: 0.5, marginTop: 8, marginBottom: 0 }}>
        3 songs per person per month · your own songs show a ✕ so you can swap them out
      </p>
    </section>
  );
}

// ── Past contest slide: hall-of-fame winner card + honorable mentions ──
function PastContest({ contest, UserLink }) {
  const { winner } = contest;
  return (
    <>
      <header style={hofHeroStyle}>
        <Confetti />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={kickerStyle}>{contest.kicker}</div>
          <div style={hofRibbonStyle}>🏛️ Hall of Fame</div>
        </div>
        <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: '8px 0 12px', fontWeight: 800 }}>
          {contest.title}
        </h1>

        {/* Gradient-framed winner card with a slow shine sweep */}
        <div style={winnerFrameStyle}>
          <div style={winnerCardStyle}>
            <div aria-hidden="true" className="spx-anim" style={shineOverlayStyle} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                aria-hidden="true"
                className="spx-anim"
                style={{
                  fontSize: 38,
                  lineHeight: 1,
                  animation: 'spx-float 3.2s ease-in-out infinite',
                  filter: 'drop-shadow(0 0 14px rgba(255,215,94,0.55))',
                }}
              >
                🏆
              </span>
              <div style={{ fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', color: GOLD, fontWeight: 800 }}>
                Winner
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 4px' }}>
              <UserLink user={winner} /> · {winner.project}
            </div>
            <p style={{ ...pStyle, marginBottom: 16 }}>{winner.blurb}</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a className="spx-cta" href={winner.projectUrl} target="_blank" rel="noreferrer" style={ctaPrimary}>
                Try {winner.project}
              </a>
              <a className="spx-cta" href={`/post/${winner.announcementPostId}`} style={ctaSecondary}>
                Read the announcement
              </a>
            </div>
          </div>
        </div>
      </header>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Honorable mentions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 0 14px' }}>
          {contest.highlights.map((h) => (
            <div key={h.username + h.text} className="spx-lift" style={mentionRowStyle}>
              <span aria-hidden="true" style={{ fontSize: 20, flexShrink: 0 }}>🎖️</span>
              <span style={{ lineHeight: 1.5 }}>
                <UserLink user={h} /> — {h.text}
              </span>
            </div>
          ))}
        </div>
        <p style={{ ...pStyle, opacity: 0.7, fontSize: 14 }}>{contest.footnote}</p>
      </section>
    </>
  );
}

// ── June 2026 (archive): winners announced July 5, kept as the full record ──
function JuneContest({ UserLink, openUser, revealed, isAdmin, spotlightHidden }) {
  // Until revealed, render as if no winners are pinned — the roulette keeps
  // rolling and the Pro winners section stays off the page entirely.
  const winners = revealed ? JUNE_WINNERS : [null, null, null];
  const finalists = revealed ? JUNE_FINALISTS : [null, null, null, null, null];

  // Live avatar + bio for the shoutout + Pro winner cards (so they stay
  // current with the creators' profiles instead of hardcoding storage URLs).
  const [shoutoutProfiles, setShoutoutProfiles] = useState({});
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, avatar_url, avatar_emoji, bio')
      .in('id', [...JUNE_SHOUTOUTS, ...JUNE_PRO_WINNERS].map((u) => u.userId))
      .then(({ data }) => {
        if (cancelled || !data) return;
        setShoutoutProfiles(Object.fromEntries(data.map((p) => [p.id, p])));
      });
    return () => { cancelled = true; };
  }, []);

  // Admin: flip the site-wide reveal toggle (set_spotlight_hidden RPC checks
  // is_admin server-side; the checkbox is just hidden from non-admins).
  const [gateBusy, setGateBusy] = useState(false);
  const toggleGate = async (hide) => {
    setGateBusy(true);
    const { error } = await supabase.rpc('set_spotlight_hidden', { p_hidden: hide });
    if (!error) await refreshSiteSettings();
    setGateBusy(false);
  };

  // "Random builds" — 3 random entries from the June contest community, with
  // 3 DIFFERENT authors per press (one post per person; authors can repeat on
  // the next press). Entries are fetched once and shuffled client-side.
  const [randomPosts, setRandomPosts] = useState(null);
  const [shuffling, setShuffling] = useState(false);
  const [entries, setEntries] = useState(null);

  // Entries load on mount (not just on the first shuffle) because the prize
  // podium + finalist slots roll through the entrants' profiles below.
  const fetchEntries = async () => {
    const { data: links } = await supabase
      .from('community_posts')
      .select('post_id')
      .eq('community_id', JUNE_COMMUNITY_ID);
    const ids = (links || []).map((r) => r.post_id);
    if (!ids.length) return [];
    const { data: posts } = await supabase
      .from('posts_with_stats')
      .select('id, user_id, title, images, username, display_name, avatar_url, likes_count, comments_count')
      .in('id', ids);
    return posts || [];
  };
  useEffect(() => {
    let cancelled = false;
    fetchEntries().then((all) => { if (!cancelled) setEntries(all); });
    return () => { cancelled = true; };
  }, []);

  // ── Winner roulette: who's it gonna be? ──
  // One entrant profile per author (needs an avatar to be a card background);
  // the podium + finalist cards flash through them until JUNE_WINNERS /
  // JUNE_FINALISTS pin the real ones.
  const entrants = useMemo(() => {
    const seen = new Map();
    for (const p of entries || []) {
      if (p.avatar_url && !seen.has(p.user_id)) {
        seen.set(p.user_id, { userId: p.user_id, username: p.username, avatar_url: p.avatar_url });
      }
    }
    return [...seen.values()];
  }, [entries]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (entrants.length < 2) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 2200);
    return () => clearInterval(id);
  }, [entrants.length]);

  // Live demo color for the Spotlight badge showcase.
  const [gemColor, setGemColor] = useState('#FFD700');

  // Pinned winners/finalists may not be in the entrant pool (or we want their
  // freshest avatar) — fetch their profiles directly once slots are filled.
  const pinned = [...winners, ...finalists].filter(Boolean);
  const [pinnedProfiles, setPinnedProfiles] = useState({});
  useEffect(() => {
    if (!pinned.length) return undefined;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', pinned.map((w) => w.userId))
      .then(({ data }) => {
        if (cancelled || !data) return;
        setPinnedProfiles(Object.fromEntries(data.map((p) => [p.id, p])));
      });
    return () => { cancelled = true; };
  }, [revealed]);

  // The profile a slot shows right now. Slots 0-2 = podium, 3-7 = finalists;
  // spreading them `step` apart keeps neighbouring cards on different people.
  const slotStep = Math.max(1, Math.floor(entrants.length / 8));
  const faceFor = (slot, pin) => {
    if (pin) {
      const p = pinnedProfiles[pin.userId];
      return { userId: pin.userId, username: p?.username || pin.username, avatar_url: p?.avatar_url || null };
    }
    if (!entrants.length) return null;
    return entrants[(tick + slot * slotStep) % entrants.length];
  };

  const shuffleBuilds = async () => {
    setShuffling(true);
    // Re-shuffles hit the cached entry list and would finish in the same
    // frame — hold the result long enough for the dice to visibly roll.
    const minRoll = new Promise((resolve) => setTimeout(resolve, 700));
    try {
      let all = entries;
      if (!all) {
        all = await fetchEntries();
        setEntries(all);
        if (!all.length) { setRandomPosts([]); return; }
      }

      // One random post per author, then 3 random authors.
      const byAuthor = new Map();
      for (const p of [...all].sort(() => Math.random() - 0.5)) {
        if (!byAuthor.has(p.user_id)) byAuthor.set(p.user_id, p);
      }
      const picked = [...byAuthor.values()].sort(() => Math.random() - 0.5).slice(0, 3);
      // Fewer than 3 people with entries → fill the empty spots with other posts.
      if (picked.length < 3) {
        const chosen = new Set(picked.map((p) => p.id));
        for (const p of [...all].sort(() => Math.random() - 0.5)) {
          if (picked.length >= 3) break;
          if (!chosen.has(p.id)) { picked.push(p); chosen.add(p.id); }
        }
      }
      await minRoll;
      setRandomPosts(picked);
    } finally {
      setShuffling(false);
    }
  };

  return (
    <>
      <header style={heroStyle}>
        <Confetti count={16} />
        <div aria-hidden="true" style={heroGlowStyle} />
        <div style={kickerStyle}>Spotlight · June 2026</div>
        <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: '8px 0 12px', fontWeight: 800, position: 'relative' }}>
          <span className="spx-anim" style={moneyShimmerStyle}>$1,000</span> Build Challenge
        </h1>
        <p style={{ fontSize: 18, opacity: 0.85, maxWidth: 720, margin: 0, position: 'relative' }}>
          A <strong>$1,000 prize pool</strong> split across the top 3 builds of June —{' '}
          <strong>$600</strong> for 1st, <strong>$300</strong> for 2nd, and <strong>$100</strong> for 3rd.
          The top 5 finalists get an exclusive profile banner and a permanent Spotlight badge on their account.
        </p>
        <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', position: 'relative' }}>
          <span style={judgingPill}>
            <span className="spx-anim" style={liveDotStyle} aria-hidden="true" />
            {revealed ? (
              <>Winners crowned <strong>&nbsp;July 5, LIVE&nbsp;</strong> on Twitch + Prmpted Zeo — congrats to the top 3 &amp; top 5! 🏆</>
            ) : (
              <>Submissions closed · Winners announced <strong>&nbsp;July 5, LIVE&nbsp;</strong> on Twitch + Prmpted Zeo 🎥</>
            )}
          </span>
        </div>
      </header>

      {/* Admin-only reveal gate. Checked = results visible only to @devmouse;
          uncheck on stream to pin the winners for everyone (≤60s to propagate
          to open tabs; new loads see it immediately). */}
      {isAdmin && (
        <div style={gatePanelStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={spotlightHidden}
              disabled={gateBusy}
              onChange={(e) => toggleGate(e.target.checked)}
              style={{ accentColor: GOLD, cursor: 'pointer' }}
            />
            <span>
              <strong>Hide final results</strong> — only @{SPOTLIGHT_PREVIEW_USERNAME} sees the
              winners while this is checked. Uncheck to announce. {gateBusy ? '⏳' : spotlightHidden ? '🔒' : '🌍 Live for everyone'}
            </span>
          </label>
        </div>
      )}

      <section style={sectionStyle}>
        <h2 style={h2Style}>📣 Creator shoutouts</h2>
        <p style={pStyle}>
          The shoutout gang checked in and we heard you. Big love to these creators for showing up
          all month — keep an eye on them:
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
          {JUNE_SHOUTOUTS.map((u, i) => {
            const p = shoutoutProfiles[u.userId] || {};
            const bio = (p.bio || '').trim();
            return (
              <button
                key={u.username}
                onClick={() => openUser(u)}
                className="spx-lift spx-anim"
                style={{ ...shoutoutCardStyle, animation: `spx-pop .45s ease ${Math.min(i * 0.05, 0.6)}s both` }}
              >
                <ChatAvatar profile={{ ...p, username: u.username }} size={44} />
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
                  <span>
                    <strong>{u.name}</strong>{' '}
                    <span style={{ opacity: 0.65, fontSize: 13 }}>@{u.username}</span>
                  </span>
                  {bio && <span style={shoutoutBioStyle}>{bio}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>🎲 Random builds</h2>
        <p style={pStyle}>
          Feeling lucky? Pull 3 random entries from the June contest — a different builder in
          every spot.
        </p>
        <button
          onClick={shuffleBuilds}
          disabled={shuffling}
          className="spx-cta"
          style={{ ...shuffleBtnStyle, opacity: shuffling ? 0.75 : 1 }}
        >
          <span
            aria-hidden="true"
            className="spx-anim"
            style={{
              display: 'inline-block',
              fontSize: 19,
              lineHeight: 1,
              animation: shuffling ? 'spx-dice .45s ease-in-out infinite' : 'none',
            }}
          >
            🎲
          </span>
          {shuffling ? 'Rolling…' : randomPosts ? 'Shuffle again' : 'Random posts'}
        </button>
        {randomPosts && randomPosts.length === 0 && (
          <p style={{ ...pStyle, marginTop: 14, opacity: 0.7 }}>No entries found.</p>
        )}
        {randomPosts && randomPosts.length > 0 && (
          // Keyed on the picked ids so every roll re-plays the staggered
          // pop-in — cards land one by one like a slot machine payout.
          <div key={randomPosts.map((p) => p.id).join('·')} style={miniGridStyle}>
            {randomPosts.map((p, i) => (
              <a
                key={p.id}
                href={`/post/${p.id}`}
                target="_blank"
                rel="noreferrer"
                className="spx-lift spx-anim"
                style={{ ...miniCardStyle, animation: `spx-pop .5s cubic-bezier(.22,1,.36,1) ${i * 0.14}s both` }}
              >
                {Array.isArray(p.images) && p.images[0] ? (
                  <img src={p.images[0]} alt="" style={miniThumbStyle} loading="lazy" />
                ) : (
                  <div style={{ ...miniThumbStyle, ...miniThumbFallbackStyle }}>✨</div>
                )}
                <div style={{ padding: '10px 12px 12px' }}>
                  <div style={miniTitleStyle}>{p.title}</div>
                  <div style={miniMetaStyle}>
                    {p.avatar_url && <img src={p.avatar_url} alt="" style={miniAvatarStyle} loading="lazy" />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      @{p.username}
                    </span>
                    <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
                      ❤️ {p.likes_count ?? 0} · 💬 {p.comments_count ?? 0}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>What is this?</h2>
        <p style={pStyle}>
          Spotlight is prmpted's monthly creator contest. Every month we celebrate the builders
          pushing the platform forward — sharing the best AI-built tools, games, sites, and
          experiments. June was our biggest prize pool yet: <strong>$1,000 split across the top 3
          builds</strong>, plus banners and badges for the top 5.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>How it's judged</h2>
        <p style={pStyle}>
          A panel of <strong>3 judges</strong> picks the top 3 winners and the top 5. Community votes
          (likes, comments, shares on your entry posts) factor into our shortlist, but the final
          call is on overall quality.
        </p>
        <ul style={ulStyle}>
          <li><strong>Quality over quantity.</strong> One great build beats ten shallow ones.</li>
          <li><strong>Craft.</strong> Does it actually work? Is it polished? Does it feel finished?</li>
          <li><strong>Originality.</strong> Are you solving something interesting or doing it in a new way?</li>
          <li><strong>Community signal.</strong> Likes, comments, and shares show what's resonating.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Prizes</h2>
        {/* Podium cards roll through the June entrants' profiles until the
            winners are pinned in JUNE_WINNERS — then each card locks to its
            winner as the permanent record. */}
        <div style={podiumGridStyle}>
          {[
            { medal: '🥇', place: '1st place', cash: '$600', cashColor: GOLD, extra: podiumFirstStyle, medalSize: 34 },
            { medal: '🥈', place: '2nd place', cash: '$300', medalSize: 30 },
            { medal: '🥉', place: '3rd place', cash: '$100', medalSize: 30 },
          ].map((c, i) => {
            const locked = !!winners[i];
            const face = faceFor(i, winners[i]);
            return (
              <div key={c.place} className="spx-lift" style={{ ...podiumCardStyle, ...(c.extra || null) }}>
                {face?.avatar_url && (
                  <div
                    key={locked ? face.userId : `${tick}-${face.userId}`}
                    className="spx-anim"
                    aria-hidden="true"
                    style={rouletteBgStyle}
                  >
                    <img src={face.avatar_url} alt="" style={rouletteImgStyle} loading="lazy" />
                    <div style={rouletteShadeStyle} />
                  </div>
                )}
                {i === 0 && <div aria-hidden="true" className="spx-anim" style={shineOverlayStyle} />}
                <div style={podiumContentStyle}>
                  <div style={{ fontSize: c.medalSize, lineHeight: 1 }} aria-hidden="true">{c.medal}</div>
                  <div style={podiumPlaceStyle}>{c.place}</div>
                  <div style={{ ...podiumCashStyle, ...(c.cashColor ? { color: c.cashColor } : null) }}>{c.cash}</div>
                  <div style={podiumPerksStyle}>cash + exclusive banner + Spotlight badge</div>
                  {face && (
                    <button onClick={() => openUser(face)} style={rouletteNameStyle}>
                      {locked ? '👑 ' : ''}@{face.username}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={finalistRowStyle}>
          <span aria-hidden="true">✨</span>
          <span><strong>Top 5 finalists:</strong> exclusive banner + Spotlight badge</span>
        </div>
        {/* Same slot-machine roll for the five banner-winning finalists. */}
        <div style={finalistGridStyle}>
          {finalists.map((fin, i) => {
            const locked = !!fin;
            const face = faceFor(3 + i, fin);
            return (
              <div key={i} className="spx-lift" style={finalistCardStyle}>
                {face?.avatar_url ? (
                  <div
                    key={locked ? face.userId : `${tick}-${face.userId}`}
                    className="spx-anim"
                    aria-hidden="true"
                    style={rouletteBgStyle}
                  >
                    <img src={face.avatar_url} alt="" style={rouletteImgStyle} loading="lazy" />
                    <div style={finalistShadeStyle} />
                  </div>
                ) : (
                  <div style={finalistEmptyStyle} aria-hidden="true">?</div>
                )}
                <span style={finalistBadgeStyle}>✨ Top 5</span>
                {face && (
                  <button onClick={() => openUser(face)} style={finalistNameStyle}>
                    {locked ? '👑 ' : ''}@{face.username}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 24 }}>
          <a className="spx-cta" href={COMMUNITY_URL} style={ctaPrimary}>Browse the entries</a>
        </div>
      </section>

      {/* Pro contest winners — only on the page once the results are revealed. */}
      {revealed && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>👑 Pro contest winners</h2>
          <p style={pStyle}>
            June also ran a separate contest for our <strong>Pro</strong> members — and these two
            builders took it. A huge shoutout to our Pro contest winners for June! 🎉
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
            {JUNE_PRO_WINNERS.map((u, i) => {
              const p = shoutoutProfiles[u.userId] || {};
              return (
                <button
                  key={u.username}
                  onClick={() => openUser(u)}
                  className="spx-lift spx-anim"
                  style={{ ...proWinnerCardStyle, animation: `spx-pop .45s ease ${i * 0.08}s both` }}
                >
                  <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">{u.medal}</span>
                  <ChatAvatar profile={{ ...p, username: u.username }} size={44} />
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
                    <span>
                      <strong>{u.name}</strong>{' '}
                      <span style={{ opacity: 0.65, fontSize: 13 }}>@{u.username}</span>
                    </span>
                    <span style={{ fontSize: 13, color: GOLD, fontWeight: 700 }}>{u.place} · Pro contest</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section style={sectionStyle}>
        <h2 style={h2Style}>🖼️ Pick your banner</h2>
        <p style={pStyle}>
          Finish top 5 and you choose one of these exclusive profile banners — hand-made for
          this contest by <UserLink user={DOGGO} /> and never available again. Huge shoutout
          to Doggo for the artwork! 🎨
        </p>
        <div style={bannerGridStyle}>
          {CONTEST_BANNERS.map((b) => (
            <figure key={b.src} className="spx-lift" style={bannerCardStyle}>
              <img src={b.src} alt={`${b.name} profile banner, made by Doggo`} style={bannerImgStyle} loading="lazy" />
              <figcaption style={bannerNameStyle}>{b.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>💎 The Spotlight badge</h2>
        <div style={gemShowcaseStyle}>
          <div style={gemStageStyle} title="Hover me!">
            <span style={{ display: 'inline-flex', filter: `drop-shadow(0 0 16px ${gemColor})` }}>
              <SpotlightGem size={56} color={gemColor} label="June Winner 2026" tipColor={gemColor} />
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ ...pStyle, marginBottom: 8 }}>
              Win or make the top 5 and the Spotlight gem sits next to your name{' '}
              <strong>everywhere on Prompted, forever</strong>. It&apos;s yours to style, too —
              recolor it to literally whatever you want from the Profile tab in your Settings.
              Try it:
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {GEM_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setGemColor(c)}
                  style={gemSwatchStyle(c, c === gemColor)}
                  aria-label={`Preview the badge in ${c}`}
                />
              ))}
              <label style={gemCustomStyle}>
                <input
                  type="color"
                  value={gemColor}
                  onChange={(e) => setGemColor(e.target.value)}
                  style={{ width: 26, height: 26, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                  aria-label="Pick any badge color"
                />
                or pick your own 🎨
              </label>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ── July 2026 (current): $1,000 Creator of the Month — submissions open ──
function JulyContest() {
  // Live countdown to the July 31 submission deadline.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, JULY_DEADLINE.getTime() - now);
  const units = [
    [Math.floor(diff / 86400000), 'days'],
    [Math.floor(diff / 3600000) % 24, 'hrs'],
    [Math.floor(diff / 60000) % 60, 'min'],
    [Math.floor(diff / 1000) % 60, 'sec'],
  ];

  // Live demo color for the Spotlight badge showcase.
  const [gemColor, setGemColor] = useState('#FFD700');

  return (
    <>
      <header style={heroStyle}>
        <Confetti count={16} />
        <div aria-hidden="true" style={heroGlowStyle} />
        <div style={kickerStyle}>Spotlight · July 2026</div>
        <h1 style={{ fontSize: 44, lineHeight: 1.1, margin: '8px 0 12px', fontWeight: 800, position: 'relative' }}>
          <span className="spx-anim" style={moneyShimmerStyle}>$1,000</span> Creator of the Month
        </h1>
        <p style={{ fontSize: 18, opacity: 0.85, maxWidth: 720, margin: 0, position: 'relative' }}>
          A <strong>$1,000 prize pool</strong> split across the top 3 builds of July —{' '}
          <strong>$600</strong> for 1st, <strong>$300</strong> for 2nd, and <strong>$100</strong> for 3rd.
          The top 5 finalists all take home the permanent Spotlight badge on their account.
        </p>
        <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', position: 'relative' }}>
          <span style={judgingPill}>
            <span className="spx-anim" style={liveDotStyle} aria-hidden="true" />
            Submissions open all July · Winners crowned <strong>&nbsp;LIVE in early August&nbsp;</strong> on Twitch + Prmpted Zeo 🎥
          </span>
        </div>
        {/* Deadline countdown */}
        <div
          style={{ ...countdownRowStyle, justifyContent: 'flex-start', position: 'relative' }}
          role="timer"
          aria-label="Time left to enter the July contest"
        >
          {units.map(([n, label]) => (
            <div key={label} style={countdownCellStyle}>
              <div style={countdownNumStyle}>{String(n).padStart(2, '0')}</div>
              <div style={countdownLabelStyle}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6, position: 'relative' }}>
          until submissions close · July 31
        </div>
      </header>

      <section style={sectionStyle}>
        <h2 style={h2Style}>What is this?</h2>
        <p style={pStyle}>
          Spotlight is prmpted's monthly creator contest. Every month we celebrate the builders
          pushing the platform forward — sharing the best AI-built tools, games, sites, and
          experiments. July matches June's biggest-ever prize pool: <strong>$1,000 split across
          the top 3 builds</strong>, plus the permanent Spotlight badge for the whole top 5.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>How to enter</h2>
        <ul style={ulStyle}>
          <li><strong>Build something with AI</strong> — a tool, a game, a site, an agent, anything you ship in July.</li>
          <li><strong>Post it to the July contest community</strong> with a title, screenshots or a demo video, and a link to try it.</li>
          <li><strong>Enter as many builds as you like</strong> — one post per build. Quality beats quantity with the judges, though.</li>
        </ul>
        {JULY_COMMUNITY_URL ? (
          <a className="spx-cta" href={JULY_COMMUNITY_URL} style={ctaPrimary}>Enter the contest</a>
        ) : (
          <p style={{ ...pStyle, opacity: 0.7, fontSize: 14 }}>
            The July contest community link drops here the moment it's live — hang tight. 👀
          </p>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>How it's judged</h2>
        <p style={pStyle}>
          A panel of <strong>3 judges</strong> picks the top 3 winners and the top 5. Community votes
          (likes, comments, shares on your entry posts) factor into our shortlist, but the final
          call is on overall quality.
        </p>
        <ul style={ulStyle}>
          <li><strong>Quality over quantity.</strong> One great build beats ten shallow ones.</li>
          <li><strong>Craft.</strong> Does it actually work? Is it polished? Does it feel finished?</li>
          <li><strong>Originality.</strong> Are you solving something interesting or doing it in a new way?</li>
          <li><strong>Community signal.</strong> Likes, comments, and shares show what's resonating.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Prizes</h2>
        <div style={podiumGridStyle}>
          {[
            { medal: '🥇', place: '1st place', cash: '$600', cashColor: GOLD, extra: podiumFirstStyle, medalSize: 34 },
            { medal: '🥈', place: '2nd place', cash: '$300', medalSize: 30 },
            { medal: '🥉', place: '3rd place', cash: '$100', medalSize: 30 },
          ].map((c, i) => (
            <div key={c.place} className="spx-lift" style={{ ...podiumCardStyle, ...(c.extra || null) }}>
              {i === 0 && <div aria-hidden="true" className="spx-anim" style={shineOverlayStyle} />}
              <div style={podiumContentStyle}>
                <div style={{ fontSize: c.medalSize, lineHeight: 1 }} aria-hidden="true">{c.medal}</div>
                <div style={podiumPlaceStyle}>{c.place}</div>
                <div style={{ ...podiumCashStyle, ...(c.cashColor ? { color: c.cashColor } : null) }}>{c.cash}</div>
                <div style={podiumPerksStyle}>cash + permanent Spotlight badge</div>
              </div>
            </div>
          ))}
        </div>
        <div style={finalistRowStyle}>
          <span aria-hidden="true">✨</span>
          <span><strong>Top 5 finalists:</strong> the permanent Spotlight badge, next to your name everywhere</span>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>💎 The Spotlight badge</h2>
        <div style={gemShowcaseStyle}>
          <div style={gemStageStyle} title="Hover me!">
            <span style={{ display: 'inline-flex', filter: `drop-shadow(0 0 16px ${gemColor})` }}>
              <SpotlightGem size={56} color={gemColor} label="July Winner 2026" tipColor={gemColor} />
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ ...pStyle, marginBottom: 8 }}>
              Win or make the top 5 and the Spotlight gem sits next to your name{' '}
              <strong>everywhere on Prompted, forever</strong>. It&apos;s yours to style, too —
              recolor it to literally whatever you want from the Profile tab in your Settings.
              Try it:
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {GEM_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setGemColor(c)}
                  style={gemSwatchStyle(c, c === gemColor)}
                  aria-label={`Preview the badge in ${c}`}
                />
              ))}
              <label style={gemCustomStyle}>
                <input
                  type="color"
                  value={gemColor}
                  onChange={(e) => setGemColor(e.target.value)}
                  style={{ width: 26, height: 26, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                  aria-label="Pick any badge color"
                />
                or pick your own 🎨
              </label>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────
const pageStyle = { maxWidth: 880, margin: '0 auto', padding: '32px 20px 120px' };

const heroStyle = {
  position: 'relative',
  overflow: 'hidden',
  padding: '32px 28px',
  borderRadius: 16,
  background: 'linear-gradient(135deg, rgba(255,200,0,0.12), rgba(255,80,200,0.08))',
  border: '1px solid rgba(255,255,255,0.08)',
  marginBottom: 32,
};
const heroGlowStyle = {
  position: 'absolute',
  top: -120,
  right: -80,
  width: 320,
  height: 320,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(255,215,94,0.22), transparent 65%)',
  pointerEvents: 'none',
};
// Hall-of-fame variant: deeper gold, confetti lives inside.
const hofHeroStyle = {
  ...heroStyle,
  background:
    'radial-gradient(120% 140% at 50% -20%, rgba(255,215,94,0.2), rgba(255,80,200,0.07) 55%, rgba(0,0,0,0) 100%), linear-gradient(180deg, rgba(255,200,0,0.08), rgba(10,10,15,0.2))',
  border: '1px solid rgba(255,215,94,0.28)',
};
const hofRibbonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 12px',
  borderRadius: 999,
  background: 'rgba(255,215,94,0.12)',
  border: '1px solid rgba(255,215,94,0.4)',
  color: GOLD,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
};
const kickerStyle = { fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.7 };
const sectionStyle = { marginTop: 36 };
const h2Style = { fontSize: 24, fontWeight: 700, margin: '0 0 12px' };
const pStyle = { fontSize: 16, lineHeight: 1.6, margin: '0 0 12px', opacity: 0.9 };
const ulStyle = { fontSize: 16, lineHeight: 1.7, paddingLeft: 22, margin: '0 0 12px', opacity: 0.9 };

const ctaPrimary = {
  display: 'inline-block',
  padding: '12px 22px',
  borderRadius: 999,
  background: `linear-gradient(135deg, #fff, ${GOLD})`,
  color: '#111',
  fontWeight: 700,
  textDecoration: 'none',
  fontSize: 15,
  boxShadow: '0 4px 18px rgba(255,215,94,0.25)',
};
const ctaSecondary = {
  display: 'inline-block',
  padding: '12px 22px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.16)',
  color: '#fff',
  fontWeight: 600,
  textDecoration: 'none',
  fontSize: 15,
};
const shuffleBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '13px 24px',
  borderRadius: 999,
  background: `linear-gradient(135deg, rgba(255,215,94,0.18), rgba(255,94,200,0.14))`,
  border: '1px solid rgba(255,215,94,0.45)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
  boxShadow: '0 4px 20px rgba(255,94,200,0.12)',
};
const partyBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 9,
  padding: '10px 20px',
  borderRadius: 999,
  background: 'rgba(255,94,200,0.1)',
  border: '1px solid rgba(255,94,200,0.35)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};
const partyBtnOnStyle = {
  background: `linear-gradient(135deg, rgba(255,94,200,0.3), rgba(255,215,94,0.25))`,
  border: '1px solid rgba(255,94,200,0.8)',
  boxShadow: '0 4px 24px rgba(255,94,200,0.3)',
};
// Full-viewport confetti rain while the party music plays.
const partyOverlayStyle = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 30,
};
const jukeboxPanelStyle = {
  margin: '0 0 32px',
  padding: '20px 22px',
  borderRadius: 16,
  background: 'linear-gradient(135deg, rgba(255,94,200,0.08), rgba(124,195,255,0.05))',
  border: '1px solid rgba(255,94,200,0.3)',
};
const queueRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 14,
};
const queueRowActiveStyle = {
  background: 'rgba(255,94,200,0.1)',
  border: '1px solid rgba(255,94,200,0.4)',
};
const queuePlayBtnStyle = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  flexShrink: 0,
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const queueDeleteBtnStyle = {
  flexShrink: 0,
  background: 'none',
  border: 'none',
  color: 'rgba(255,120,120,0.8)',
  fontSize: 14,
  cursor: 'pointer',
  padding: '2px 6px',
};
const jukeboxInputStyle = {
  flex: 1,
  minWidth: 220,
  padding: '11px 16px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#fff',
  fontSize: 14,
  outline: 'none',
};
const judgingPill = {
  display: 'inline-flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  padding: '12px 18px',
  borderRadius: 999,
  background: 'rgba(255,215,94,0.1)',
  border: '1px solid rgba(255,215,94,0.35)',
  fontSize: 14,
};
const liveDotStyle = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#4ade80',
  display: 'inline-block',
  flexShrink: 0,
  animation: 'spx-pulse-ring 1.6s ease-out infinite',
};
const moneyShimmerStyle = {
  background: `linear-gradient(90deg, ${GOLD} 25%, #fff 45%, ${PINK} 60%, ${GOLD} 80%)`,
  backgroundSize: '200% auto',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  animation: 'spx-shimmer 3.5s linear infinite',
};

const timelineStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  margin: '20px 0 28px',
};
const timelinePillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '9px 16px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderBottom: '3px solid rgba(255,255,255,0.14)',
  color: 'rgba(255,255,255,0.75)',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};
const timelinePillActive = {
  background: `linear-gradient(135deg, rgba(255,215,94,0.95), rgba(255,180,80,0.9))`,
  border: '1px solid rgba(255,215,94,0.9)',
  borderBottom: '3px solid rgba(200,150,30,0.95)',
  color: '#1a1405',
  boxShadow: '0 4px 20px rgba(255,215,94,0.3)',
};
const nowDotStyle = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: '#4ade80',
  display: 'inline-block',
  animation: 'spx-pulse-ring 1.6s ease-out infinite',
};
const arrowStyle = {
  padding: '8px 14px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderBottom: '3px solid rgba(255,255,255,0.14)',
  color: '#fff',
  fontSize: 16,
  cursor: 'pointer',
};

// Winner card: gold→pink gradient frame around a dark card + shine sweep.
const winnerFrameStyle = {
  marginTop: 20,
  padding: 1.5,
  borderRadius: 15,
  background: `linear-gradient(135deg, rgba(255,215,94,0.85), rgba(255,94,200,0.5), rgba(255,215,94,0.35))`,
  boxShadow: '0 8px 40px rgba(255,215,94,0.12)',
};
const winnerCardStyle = {
  position: 'relative',
  overflow: 'hidden',
  padding: '22px 24px',
  borderRadius: 14,
  background: 'rgba(12,10,8,0.92)',
};
const shineOverlayStyle = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
  width: '45%',
  background: 'linear-gradient(105deg, transparent, rgba(255,255,255,0.09) 45%, rgba(255,215,94,0.14) 55%, transparent)',
  animation: 'spx-shine 4.5s ease-in-out infinite',
  pointerEvents: 'none',
};
const mentionRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,215,94,0.18)',
  fontSize: 16,
};

const userLinkStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#7cc3ff',
  fontSize: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
  textDecoration: 'underline',
};
const shoutoutCardStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 18px 10px 10px',
  borderRadius: 999,
  background: 'rgba(124,195,255,0.08)',
  border: '1px solid rgba(124,195,255,0.25)',
  color: '#fff',
  fontSize: 15,
  cursor: 'pointer',
  textAlign: 'left',
  maxWidth: 320,
};
// Pro contest winner cards — shoutout pills with a gold medal treatment.
const proWinnerCardStyle = {
  ...shoutoutCardStyle,
  gap: 10,
  background: 'rgba(255,215,94,0.08)',
  border: '1px solid rgba(255,215,94,0.35)',
};
// Admin-only reveal gate panel under the June hero.
const gatePanelStyle = {
  margin: '0 0 24px',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'rgba(255,215,94,0.06)',
  border: '1px dashed rgba(255,215,94,0.45)',
};
const miniGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 14,
  marginTop: 18,
};
const miniCardStyle = {
  display: 'block',
  borderRadius: 12,
  overflow: 'hidden',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
  textDecoration: 'none',
};
const miniThumbStyle = {
  width: '100%',
  height: 120,
  objectFit: 'cover',
  display: 'block',
};
const miniThumbFallbackStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 32,
  background: 'linear-gradient(135deg, rgba(255,200,0,0.15), rgba(255,80,200,0.12))',
};
const miniTitleStyle = {
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.35,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  minHeight: 38,
};
const miniMetaStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 8,
  fontSize: 12,
  opacity: 0.75,
};
const miniAvatarStyle = {
  width: 18,
  height: 18,
  borderRadius: '50%',
  objectFit: 'cover',
  flexShrink: 0,
};
const shoutoutBioStyle = {
  fontSize: 13,
  opacity: 0.7,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 230,
};

// Prize podium
const podiumGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: 14,
  alignItems: 'stretch',
};
const podiumCardStyle = {
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 6,
  padding: '22px 16px 18px',
  borderRadius: 14,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
};
const podiumFirstStyle = {
  background: 'linear-gradient(180deg, rgba(255,215,94,0.14), rgba(255,94,200,0.06))',
  border: '1px solid rgba(255,215,94,0.5)',
  boxShadow: '0 6px 30px rgba(255,215,94,0.14)',
};
const podiumPlaceStyle = {
  fontSize: 12,
  letterSpacing: 2,
  textTransform: 'uppercase',
  fontWeight: 800,
  opacity: 0.75,
};
const podiumCashStyle = { fontSize: 32, fontWeight: 800, lineHeight: 1 };
const podiumPerksStyle = { fontSize: 13, opacity: 0.7, lineHeight: 1.45 };
// Keeps the prize copy above the rolling profile background.
const podiumContentStyle = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
};

// Winner roulette — entrant profiles flashing behind the prize cards.
const rouletteBgStyle = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  borderRadius: 'inherit',
  animation: 'spx-slot .45s ease both',
};
const rouletteImgStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
const rouletteShadeStyle = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(180deg, rgba(8,8,12,0.82), rgba(8,8,12,0.6) 45%, rgba(8,8,12,0.88))',
};
const rouletteNameStyle = {
  marginTop: 4,
  padding: '3px 10px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.45)',
  border: '1px solid rgba(255,255,255,0.22)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const finalistRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginTop: 14,
  padding: '12px 16px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.04)',
  border: '1px dashed rgba(255,215,94,0.35)',
  fontSize: 15,
};
const finalistGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 12,
  marginTop: 14,
};
const finalistCardStyle = {
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-end',
  height: 140,
  padding: 10,
  borderRadius: 12,
  background: 'rgba(255,255,255,0.03)',
  border: '1px dashed rgba(255,215,94,0.4)',
};
// Lighter shade than the podium — here the profile IS the card.
const finalistShadeStyle = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(180deg, rgba(8,8,12,0.15), rgba(8,8,12,0.75))',
};
const finalistEmptyStyle = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 36,
  fontWeight: 800,
  color: 'rgba(255,215,94,0.4)',
};
const finalistBadgeStyle = {
  position: 'absolute',
  top: 8,
  left: 8,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,215,94,0.45)',
  color: GOLD,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: 'uppercase',
};
const finalistNameStyle = { ...rouletteNameStyle, position: 'relative', marginTop: 0 };

// Spotlight badge showcase — live recolorable gem demo.
const gemShowcaseStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 20,
  flexWrap: 'wrap',
  padding: '20px 22px',
  borderRadius: 14,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,215,94,0.25)',
};
const gemStageStyle = {
  flexShrink: 0,
  width: 110,
  height: 110,
  borderRadius: 16,
  display: 'grid',
  placeItems: 'center',
  background: 'radial-gradient(circle at 50% 38%, rgba(255,255,255,0.09), rgba(0,0,0,0.3))',
  border: '1px solid rgba(255,255,255,0.12)',
};
const gemSwatchStyle = (c, active) => ({
  width: 26,
  height: 26,
  borderRadius: '50%',
  background: c,
  border: active ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)',
  cursor: 'pointer',
  boxShadow: active ? `0 0 10px ${c}` : 'none',
});
const gemCustomStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  marginLeft: 4,
  fontSize: 13,
  opacity: 0.8,
  cursor: 'pointer',
};

// Banner gallery — Doggo's exclusive top-5 banners (watermarked previews).
const bannerGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
  gap: 14,
  marginTop: 16,
};
const bannerCardStyle = {
  position: 'relative',
  margin: 0,
  borderRadius: 12,
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.03)',
};
const bannerImgStyle = {
  width: '100%',
  aspectRatio: '16 / 5',
  objectFit: 'cover',
  display: 'block',
};
const bannerNameStyle = {
  position: 'absolute',
  left: 10,
  bottom: 8,
  padding: '3px 10px',
  borderRadius: 8,
  background: 'rgba(0,0,0,0.55)',
  fontSize: 13,
  fontWeight: 700,
  color: '#fff',
};

// Deadline countdown (July hero)
const countdownRowStyle = {
  display: 'flex',
  gap: 10,
  justifyContent: 'center',
  flexWrap: 'wrap',
  marginTop: 28,
};
const countdownCellStyle = {
  minWidth: 72,
  padding: '14px 10px 10px',
  borderRadius: 12,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(255,215,94,0.3)',
  borderBottom: '3px solid rgba(255,215,94,0.45)',
};
const countdownNumStyle = {
  fontSize: 32,
  fontWeight: 800,
  lineHeight: 1,
  color: GOLD,
  fontVariantNumeric: 'tabular-nums',
  textShadow: '0 0 18px rgba(255,215,94,0.35)',
};
const countdownLabelStyle = {
  marginTop: 6,
  fontSize: 11,
  letterSpacing: 2,
  textTransform: 'uppercase',
  opacity: 0.6,
};


