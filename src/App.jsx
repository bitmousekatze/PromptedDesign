import React, { useState, useEffect, createContext, useContext, useRef, useCallback, useMemo } from 'react';
import { supabase } from './lib/supabase.js';
import { isNativeApp, OAUTH_REDIRECT } from './lib/platform.js';
import { captureReferralFromUrl, attributePendingReferral } from './lib/referrals.js';
import { getSavedAccounts, saveAccount, removeAccount, switchToAccount, signOutKeepingSaved, MAX_ACCOUNTS } from './lib/accountStore.js';
import { showDesktopNotif, enableDesktopNotifications, disableDesktopNotifications, desktopNotifsEnabled, notificationsSupported, notificationPermission, initWebPush, routeFromData } from './lib/desktopNotifications.js';
import { Helmet } from 'react-helmet-async';
import { deleteImage, isVideoBannerUrl } from './lib/storage.js';
import { validateUsername, validateDisplayName } from './utils/bannedWords.js';
import { Analytics } from '@vercel/analytics/react';

import OnboardingWizard from './components/OnboardingWizard.jsx';
// AnimatedIcon: vanilla-JS animated SVGs used in the left sidebar nav.
// Each icon has its own hover animation (home roof lifts, bell rings,
// trophy bursts confetti, etc.) — replaces the previous static SVG icons.
import AnimatedIcon from './components/AnimatedIcon.jsx';
import { toPlainText } from './lib/sanitize.js';
import { AuthContext, useAuth, ToastContext, useToast, AI_TOOL_NAMES, AI_TOOL_ID_TO_NAME, AI_TOOLS, AI_TOOL_NAME_TO_ID, setAiToolData, normalizeToolKey, getModelsForTool, getModelForTool, getToolDisplayName, parseToolString, ADMIN_USERNAMES, getRankForPoints, getNextRank, ensureAbsoluteUrl, SITE_ORIGIN, isReservedTopLevelSegment } from './lib/appShared.js';
import { CheckIcon, CommunityIcon, HeartIcon, CommentIcon, UserIcon, QuestionIcon, EyeIcon, CopyIcon, BookmarkIcon, ChevronLeftIcon, UsersIcon, SearchIcon, PlusIcon, ClockIcon, XIcon, InboxIcon } from './components/icons.jsx';
import { VerifiedBadge, UserBadge, BuilderRankBadge, PostGrid, ProfileShareButton } from './components/sharedUI.jsx';
import CreatePostModal from './components/post/CreatePostModal.jsx';
import PostCard from './components/post/PostCard.jsx';
import FullPostView from './components/post/FullPostView.jsx';
import CreateCommunityModal from './components/community/CreateCommunityModal.jsx';
import EditCommunityModal from './components/community/EditCommunityModal.jsx';
import CommunitiesView from './components/community/CommunitiesView.jsx';
import UserProfileView from './components/UserProfileView.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import AccountDeletionModal from './components/AccountDeletionModal.jsx';
import { deleteMyAccountNow, scheduleMyAccountDeletion, cancelMyAccountDeletion } from './lib/accountDeletion.js';
import MessagesView from './components/MessagesView.jsx';
// Landing page is lazy: signed-in users never download it (it's only shown
// logged-out). Global stylesheet became a real CSS file in July 2026 — it was
// a 19k-line template literal here, injected via <style>{styles}</style>.
import './appStyles.css';
const LandingPageDesign = React.lazy(() => import('./components/LandingPage.jsx'));
import { getGlossaryEntry } from './lib/glossary.js';
import { searchAll } from './lib/searchService.js';
import { buildPostPath, extractPostId } from './lib/postUrl.js';
import { loadDisplayedBadges, badgesLoaded } from './lib/badges.js';
import { touchLoginStreak } from './lib/profileBadges.js';
import { useDebounce } from './hooks/useDebounce.js';
import WorkflowCard from './components/WorkflowCard.jsx';
import CreateWorkflow from './components/CreateWorkflow.jsx';
import WorkflowDetail from './components/WorkflowDetail.jsx';
import { SidebarAd } from './components/AdUnit.jsx';
import MaintenanceBanner from './components/MaintenanceBanner.jsx';
import DailyRewardModal from './components/DailyRewardModal.jsx';
import NotificationFx from './components/NotificationFx.jsx';
import ProfileChannels from './components/ProfileChannels.jsx';
import BadgeSVG, { getBadgeForPoints } from './components/BadgeSVG.jsx';
import BuilderRanksPage from './pages/BuilderRanksPage.jsx';
import ArenaPage from './pages/ArenaPage.jsx';
import GamesPage from './pages/GamesPage.jsx';
import LearningPage from './pages/LearningPage.jsx';
import SpotlightPage from './pages/SpotlightPage.jsx';
import ProPage from './pages/ProPage.jsx';
import ZoePage from './pages/ZoePage.jsx';
import LiveBanner from './components/LiveBanner.jsx';
import ReferralsPage from './pages/ReferralsPage.jsx';
import VideosPage from './pages/VideosPage.jsx';
import MemesPage from './pages/MemesPage.jsx';
import AchievementsPage from './pages/AchievementsPage.jsx';
import WeeklyReportPage from './pages/WeeklyReportPage.jsx';
import ReviewDraftPage from './pages/ReviewDraftPage.jsx';
import DraftsListPage from './pages/DraftsListPage.jsx';
import AchievementsRealtimeProvider from './components/achievements/AchievementsRealtimeProvider.jsx';
import ToolArenaRankings from './components/ToolArenaRankings.jsx';
import CategoryArenaLeaders from './components/CategoryArenaLeaders.jsx';
import {
  getWorkflows,
  getUserWorkflows,
  likeWorkflow,
  unlikeWorkflow,
  saveWorkflow,
  unsaveWorkflow,
  getUserWorkflowLikes,
  getUserWorkflowSaves,
} from './lib/workflows.js';

// Prompted Pro is now public — everyone sees the Pro tab + /pro route so they
// can browse features and upgrade. (Previously gated to a PRO_PREVIEW_USERS
// allowlist during development.)
const canSeePro = () => true;

// The Lounge (memes/chat) is currently hidden for everyone — admins and users
// alike. Kept as a gate function (rather than deleting the code) so the sidebar
// tab, header tab, page render, and deep-link guard all read from a single
// switch — flip this back to `true` (or an admin check) to bring it back.
const canSeeLounge = (_profile) => false;

// Small sidebar badge: counts down to the July Spotlight contest deadline so
// users have a reason to click into /spotlight. Hides itself once expired.
// The contest ends at MIDNIGHT US-EASTERN (not the viewer's local time): the
// close of July 31 = August 1, 00:00 EDT. Eastern is on daylight time in summer
// (UTC-4), so we pin an explicit offset — that way every viewer worldwide sees
// the same deadline instead of midnight in their own zone.
const SPOTLIGHT_DEADLINE_MS = new Date('2026-08-01T00:00:00-04:00').getTime();
function SpotlightCountdownBadge() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const ms = SPOTLIGHT_DEADLINE_MS - now;
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const label = days >= 1 ? `${days}d` : hours >= 1 ? `${hours}h` : `${Math.max(1, Math.floor(ms / 60_000))}m`;
  return (
    <span
      title={`Spotlight ends in ${days}d ${hours}h`}
      style={{
        marginLeft: 'auto',
        fontSize: '0.68rem',
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: 999,
        background: 'linear-gradient(135deg,#ffb800,#ff4fa3)',
        color: '#1a1024',
        letterSpacing: '0.02em',
        lineHeight: 1.4,
        flexShrink: 0,
      }}
    >
      {label} left
    </span>
  );
}

// Curated "AI for X" audience collections shown on the Explore page. Each one
// points at an existing row in the `categories` table (seeded by
// 20260417000001_seed_field_categories.sql) so clicking a collection reuses
// the normal category page flow via setViewingCategoryId. Gradients are used
// for both the card and the banner on the landing page so a collection feels
// like a branded destination instead of just another tiled category.
const EXPLORE_COLLECTIONS = [
  // ── Work (warm / saturated family) ──
  { id: 'field_work_marketers',      title: 'AI for Marketers',     emoji: '📣',    description: 'Campaigns, copy, and content that actually converts.',             gradient: 'linear-gradient(135deg, #E5448C 0%, #8B2D5E 100%)' },
  { id: 'field_work_teachers',       title: 'AI for Teachers',      emoji: '🧑‍🏫', description: 'Lesson plans, grading, and student feedback in minutes.',          gradient: 'linear-gradient(135deg, #34C77B 0%, #1E6F47 100%)' },
  { id: 'field_work_developers',     title: 'AI for Developers',    emoji: '💻',    description: 'Ship faster with AI woven through your workflow.',                 gradient: 'linear-gradient(135deg, #4796E3 0%, #1E528A 100%)' },
  { id: 'field_work_designers',      title: 'AI for Designers',     emoji: '🎨',    description: 'From mood boards to polished, finished assets.',                   gradient: 'linear-gradient(135deg, #A855F7 0%, #5E2E9C 100%)' },
  { id: 'field_work_writers',        title: 'AI for Writers',       emoji: '✍️',   description: 'Drafting, editing, and research without the block.',               gradient: 'linear-gradient(135deg, #F59E0B 0%, #8B5A0A 100%)' },
  { id: 'field_work_small_business', title: 'AI for Small Business',emoji: '🏪',    description: 'Ops, copy, and customer work without the overhead.',               gradient: 'linear-gradient(135deg, #F97316 0%, #9C3F0D 100%)' },
  { id: 'field_work_researchers',    title: 'AI for Researchers',   emoji: '🔬',    description: 'Synthesize sources and accelerate discovery.',                     gradient: 'linear-gradient(135deg, #6366F1 0%, #312E81 100%)' },
  { id: 'field_work_healthcare',     title: 'AI for Healthcare',    emoji: '🩺',    description: 'Patient communication, documentation, and clinical research.',     gradient: 'linear-gradient(135deg, #F43F5E 0%, #881337 100%)' },
  { id: 'field_work_sales',          title: 'AI for Sales',         emoji: '💼',    description: 'Outreach, pipeline, and call prep that closes deals.',             gradient: 'linear-gradient(135deg, #10B981 0%, #064E3B 100%)' },
  { id: 'field_work_managers',       title: 'AI for Managers',      emoji: '🧭',    description: 'Status updates, meeting notes, and team operations.',              gradient: 'linear-gradient(135deg, #64748B 0%, #1E293B 100%)' },
  { id: 'field_work_legal',          title: 'AI for Legal',         emoji: '⚖️',   description: 'Contract review, case research, and client communication.',        gradient: 'linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%)' },
  { id: 'field_work_finance',        title: 'AI for Finance',       emoji: '📈',    description: 'Spreadsheets, modeling, and reports without the grind.',           gradient: 'linear-gradient(135deg, #84CC16 0%, #365314 100%)' },
  // ── School (blue-violet family) ──
  { id: 'field_school_college',      title: 'College & Grad',       emoji: '🎓',    description: 'Papers, lab reports, research, and grad-school prep.',             gradient: 'linear-gradient(135deg, #8B5CF6 0%, #4C1D95 100%)' },
  { id: 'field_school_highschool',   title: 'High School',          emoji: '🏫',    description: 'Homework help, study guides, and college prep.',                   gradient: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)' },
  { id: 'field_school_study',        title: 'Study & Homework',     emoji: '📚',    description: 'Study smarter — from messy notes to test-day ready.',              gradient: 'linear-gradient(135deg, #14B8A6 0%, #0A5E56 100%)' },
  { id: 'field_school_essays',       title: 'Essays & Writing',     emoji: '📝',    description: 'Drafts, feedback, and polished final papers.',                     gradient: 'linear-gradient(135deg, #EA580C 0%, #7C2D12 100%)' },
  { id: 'field_school_testprep',     title: 'Test Prep',            emoji: '🧪',    description: 'SAT, GMAT, MCAT — practice and strategy that sticks.',             gradient: 'linear-gradient(135deg, #DC2626 0%, #7F1D1D 100%)' },
  // ── Life (warm / everyday family) ──
  { id: 'field_life_everyday',       title: 'Everyday AI',          emoji: '🌱',    description: 'The small wins — emails, reminders, plans, errands.',              gradient: 'linear-gradient(135deg, #22C55E 0%, #14532D 100%)' },
  { id: 'field_life_parenting',      title: 'Parenting',            emoji: '👨‍👩‍👧', description: 'Homework help, meal plans, and bedtime stories on demand.',       gradient: 'linear-gradient(135deg, #FB7185 0%, #9F1239 100%)' },
  { id: 'field_life_hobbies',        title: 'Creative Hobbies',     emoji: '🎭',    description: 'Music, crafts, and creative projects powered by AI.',              gradient: 'linear-gradient(135deg, #D946EF 0%, #701A75 100%)' },
  { id: 'field_life_travel',         title: 'Travel',               emoji: '✈️',   description: 'Itineraries, bookings, and local tips tailored to you.',           gradient: 'linear-gradient(135deg, #0EA5E9 0%, #075985 100%)' },
  { id: 'field_life_cooking',        title: 'Cooking',              emoji: '🍳',    description: 'Recipe ideas, meal planning, and technique on demand.',            gradient: 'linear-gradient(135deg, #FB923C 0%, #7C2D12 100%)' },
  { id: 'field_life_health',         title: 'Health & Wellness',    emoji: '🧘',    description: 'Workouts, nutrition, and habits that actually stick.',             gradient: 'linear-gradient(135deg, #2DD4BF 0%, #134E4A 100%)' },
  { id: 'field_life_money',          title: 'Personal Finance',     emoji: '💰',    description: 'Budgeting, investing, and everyday money decisions.',              gradient: 'linear-gradient(135deg, #EAB308 0%, #713F12 100%)' },
];







// Gift icon — header button for the daily Builder Points reward.
const GiftIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13" />
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
  </svg>
);


// ============================================
// FEED SORT — Recent / Top / Unliked / Random
// ============================================
// Shared across every feed surface (home, following, communities, tools,
// categories, profiles, saved). "Random" only shows posts older than this
// many days so the feed surfaces buried content rather than rerolling
// the same recent posts.
const RANDOM_FEED_MIN_AGE_DAYS = 35;

export const FEED_SORTS = ['recent', 'top', 'unliked', 'random'];

// Apply a sort mode to an in-memory post list. Operates on whatever array
// the caller hands in (the 500-newest cap on the source feeds is fine for
// early-scale; if we outgrow that, swap to per-mode fetches without
// changing this signature).
export function applyFeedSort(posts, mode, userLikes = []) {
  if (!Array.isArray(posts) || posts.length === 0) return [];
  if (mode === 'top') {
    return [...posts].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
  }
  if (mode === 'unliked') {
    const liked = new Set(userLikes);
    return posts.filter(p => !liked.has(p.id));
  }
  if (mode === 'random') {
    const cutoff = Date.now() - RANDOM_FEED_MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
    const eligible = posts.filter(p => new Date(p.created_at).getTime() < cutoff);
    // Fisher-Yates so the shuffle is uniform; the default Array.sort hack
    // is biased on V8 / SpiderMonkey for length > a handful.
    const out = eligible.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  // recent: leave the caller's existing chronological order untouched.
  return posts;
}

// Reusable sort-bar UI. Renders one button per allowed mode; the caller
// decides which subset to surface (e.g. Home adds 'foryou' / 'following'
// as scopes alongside, while other surfaces just expose the 4 sorts).
export function FeedSortBar({ value, onChange, modes = FEED_SORTS, extraButtons = null, sticky = true }) {
  const LABELS = { recent: 'Recent', top: 'Most Liked', unliked: 'Unliked', random: 'Random' };
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen(o => !o);
  };

  const currentLabel = LABELS[value] || 'Sort';

  return (
    <div className={`feed-tab-switcher${sticky ? '' : ' feed-tab-switcher-flat'}`}>
      {extraButtons}
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          ref={btnRef}
          className={`feed-tab-btn ${modes.includes(value) ? 'active' : ''}`}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {currentLabel} <span style={{ fontSize: '0.7em', opacity: 0.8 }}>▾</span>
        </button>
        {open && coords && (
          <div role="menu" style={{
            position: 'fixed', top: coords.top, right: coords.right, zIndex: 9999, minWidth: 160,
            background: 'var(--bg-secondary, #15171c)', border: '1px solid var(--border-color, #2a2f3a)',
            borderRadius: 10, padding: 4, boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {modes.map(mode => (
              <button
                key={mode}
                role="menuitem"
                onClick={() => { onChange(mode); setOpen(false); }}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: value === mode ? 'rgba(78,205,196,0.15)' : 'transparent',
                  color: value === mode ? '#4ECDC4' : 'var(--text-primary, #e2e8f0)',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {value === mode ? '✓ ' : ''}{LABELS[mode]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Home-feed sort dropdown — keeps Home/Following as tabs and tucks the sort
// variants (Most Liked / Unliked / Random) behind a single button + menu.
function HomeSortDropdown({ value, onSelect, showUnliked }) {
  const SORTS = [
    ['foryou', 'Default'],
    ['top', 'Most Liked'],
    ...(showUnliked ? [['unliked', 'Unliked']] : []),
    ['random', 'Random'],
  ];
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const ref = useRef(null);
  const btnRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen(o => !o);
  };

  const active = SORTS.find(([k]) => k === value);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        className={`feed-tab-btn ${active ? 'active' : ''}`}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {active ? active[1] : 'Sort'} <span style={{ fontSize: '0.7em', opacity: 0.8 }}>▾</span>
      </button>
      {open && coords && (
        <div role="menu" style={{
          position: 'fixed', top: coords.top, right: coords.right, zIndex: 9999, minWidth: 160,
          background: 'var(--bg-secondary, #15171c)', border: '1px solid var(--border-color, #2a2f3a)',
          borderRadius: 10, padding: 4, boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {SORTS.map(([k, l]) => (
            <button
              key={k}
              role="menuitem"
              onClick={() => { onSelect(k); setOpen(false); }}
              style={{
                textAlign: 'left', padding: '8px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: value === k ? 'rgba(78,205,196,0.15)' : 'transparent',
                color: value === k ? '#4ECDC4' : 'var(--text-primary, #e2e8f0)',
                fontSize: 13, fontWeight: 600,
              }}
            >
              {value === k ? '✓ ' : ''}{l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// JARGON TERM — hover/tap definition for AI words
// ============================================
// Wraps a word like "build", "prompt", "fork" with a dotted underline. On hover
// (or tap on touch devices) a small tooltip shows the plain-English definition
// from src/lib/glossary.js. Used to help AI-newcomers without renaming the
// platform's core terminology.
const JargonTerm = ({ termKey, children }) => {
  const entry = getGlossaryEntry(termKey);
  const [open, setOpen] = useState(false);
  if (!entry) return <>{children}</>;
  return (
    <span
      style={{
        position: 'relative',
        borderBottom: '1px dotted rgba(255,255,255,0.35)',
        cursor: 'help',
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
      tabIndex={0}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-label={`${entry.term}: ${entry.definition}`}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '6px',
            padding: '8px 12px',
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            fontSize: '0.8rem',
            lineHeight: 1.4,
            color: '#e5e5e5',
            width: 'max-content',
            maxWidth: '260px',
            zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            whiteSpace: 'normal',
            textAlign: 'left',
          }}
        >
          <strong style={{ color: '#4ECDC4', display: 'block', marginBottom: '2px' }}>{entry.term}</strong>
          {entry.definition}
        </span>
      )}
    </span>
  );
};

// ============================================
// LANDING PAGE — logged-out root experience
// ============================================
const LandingPage = ({ onSignUp, onLogin, onBrowseAsGuest, onStartExploring, onSeeTrending, onPillarClick, onFooterLink }) => (
  <React.Suspense fallback={null}>
    <LandingPageDesign
      onLogin={onLogin}
      onSignup={onSignUp}
      onStartExploring={onStartExploring}
      onSeeTrending={onSeeTrending}
      onPillarClick={onPillarClick}
      onFooterLink={onFooterLink}
    />
  </React.Suspense>
);

// ============================================
// ICONS
// ============================================
const ForkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="18" r="3"></circle>
    <circle cx="6" cy="6" r="3"></circle>
    <circle cx="18" cy="6" r="3"></circle>
    <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path>
    <path d="M12 12v3"></path>
  </svg>
);


const CodeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6"></polyline>
    <polyline points="8 6 2 12 8 18"></polyline>
  </svg>
);

const HomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>
);

const BellIcon = (props) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
  </svg>
);

// Rank icon for sidebar navigation (trophy)
const RankIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2" />
    <path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
    <path d="M6 3h12v7a6 6 0 0 1-12 0V3z" />
    <path d="M9 21h6" />
    <path d="M12 16v5" />
  </svg>
);

// Arena icon — two crossed swords (blades + perpendicular cross-guards)
const ArenaIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* Sword 1: handle bottom-left, blade to top-right */}
    <path d="M4 20 L20 4" />
    <path d="M2.5 18.5 L5.5 21.5" />
    {/* Sword 2: handle bottom-right, blade to top-left */}
    <path d="M4 4 L20 20" />
    <path d="M18.5 21.5 L21.5 18.5" />
  </svg>
);

// Leaderboard icon for navigation
const LeaderboardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="14" width="4" height="7" rx="1" />
    <rect x="10" y="8" width="4" height="13" rx="1" />
    <rect x="16" y="11" width="4" height="10" rx="1" />
    <path d="M12 2l1.5 3 3.5.5-2.5 2.5.5 3.5L12 9.5 9 11.5l.5-3.5L7 5.5l3.5-.5z" />
  </svg>
);


const ImageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
);

const LinkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
  </svg>
);

const ZapIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
  </svg>
);



const SparklesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"></path>
    <path d="M5 19l.5 1.5L7 21l-1.5.5L5 23l-.5-1.5L3 21l1.5-.5L5 19z"></path>
    <path d="M19 11l.5 1.5L21 13l-1.5.5L19 15l-.5-1.5L17 13l1.5-.5L19 11z"></path>
  </svg>
);

const TrendingIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
    <polyline points="17 6 23 6 23 12"></polyline>
  </svg>
);

const CpuIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
    <rect x="9" y="9" width="6" height="6"></rect>
    <line x1="9" y1="1" x2="9" y2="4"></line>
    <line x1="15" y1="1" x2="15" y2="4"></line>
    <line x1="9" y1="20" x2="9" y2="23"></line>
    <line x1="15" y1="20" x2="15" y2="23"></line>
    <line x1="20" y1="9" x2="23" y2="9"></line>
    <line x1="20" y1="14" x2="23" y2="14"></line>
    <line x1="1" y1="9" x2="4" y2="9"></line>
    <line x1="1" y1="14" x2="4" y2="14"></line>
  </svg>
);




const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);

const LogoutIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);





const PinIcon = ({ filled }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 17v5"></path>
    <path d="M9 2h6l-1.5 5H10.5L9 2z"></path>
    <path d="M6 7h12l-1 5H7L6 7z"></path>
    <path d="M7 12l1 5h8l1-5"></path>
  </svg>
);

const GridIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"></rect>
    <rect x="14" y="3" width="7" height="7"></rect>
    <rect x="3" y="14" width="7" height="7"></rect>
    <rect x="14" y="14" width="7" height="7"></rect>
  </svg>
);

const ListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"></line>
    <line x1="8" y1="12" x2="21" y2="12"></line>
    <line x1="8" y1="18" x2="21" y2="18"></line>
    <line x1="3" y1="6" x2="3.01" y2="6"></line>
    <line x1="3" y1="12" x2="3.01" y2="12"></line>
    <line x1="3" y1="18" x2="3.01" y2="18"></line>
  </svg>
);

const TrendingUpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
    <polyline points="17 6 23 6 23 12"></polyline>
  </svg>
);







// ============================================
// TOAST COMPONENT
// ============================================
const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type === 'points' ? 'points-toast' : toast.type}`}>
            {toast.type === 'success' ? <CheckIcon /> : toast.type === 'points' ? null : <XIcon />} {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// ============================================
// ONBOARDING WIZARD WRAPPER (uses ToastContext)
// ============================================
const OnboardingWizardWrapper = ({ user, profile, supabase, onComplete }) => {
  const { addToast } = useToast();

  return (
    <OnboardingWizard
      user={user}
      profile={profile}
      supabase={supabase}
      onComplete={onComplete}
      addToast={addToast}
    />
  );
};

// ============================================
// WORKFLOW COMPONENT WRAPPERS (provide toast context)
// ============================================
const CreateWorkflowWrapper = (props) => {
  const { addToast } = useToast();
  return <CreateWorkflow {...props} addToast={addToast} />;
};

const WorkflowDetailWrapper = (props) => {
  const { addToast } = useToast();
  return <WorkflowDetail {...props} addToast={addToast} />;
};

const AchievementsPageWrapper = (props) => {
  const { addToast } = useToast();
  return <AchievementsPage {...props} addToast={addToast} />;
};


// ============================================
// AUTH MODAL COMPONENT
// ============================================
const AuthModal = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const { addToast } = useToast();

  // Username validation state
  const [usernameStatus, setUsernameStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  const [usernameError, setUsernameError] = useState('');
  const usernameCheckTimeoutRef = useRef(null);

  // Username format validation: 3-15 chars, only letters, numbers, underscores
  const validateUsernameFormat = (value) => {
    if (!value) {
      return { valid: false, error: '' };
    }
    if (value.length < 3) {
      return { valid: false, error: 'Username must be at least 3 characters' };
    }
    if (value.length > 15) {
      return { valid: false, error: 'Username must be 15 characters or less' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }
    return { valid: true, error: '' };
  };

  // Debounced username availability check
  const checkUsernameAvailability = async (value) => {
    const trimmedValue = value.trim().toLowerCase();

    // First validate format
    const formatCheck = validateUsernameFormat(trimmedValue);
    if (!formatCheck.valid) {
      setUsernameStatus('invalid');
      setUsernameError(formatCheck.error);
      return;
    }

    // Check for banned words before hitting the database
    const bannedError = validateUsername(trimmedValue);
    if (bannedError) {
      setUsernameStatus('invalid');
      setUsernameError(bannedError);
      return;
    }

    // Reject names that collide with app routes or could impersonate the platform
    if (isReservedTopLevelSegment(trimmedValue)) {
      setUsernameStatus('invalid');
      setUsernameError('That username is reserved. Try another.');
      return;
    }

    setUsernameStatus('checking');
    setUsernameError('');

    try {
      const { data, error } = await supabase.rpc('is_username_available', {
        check_username: trimmedValue
      });

      if (error) throw error;

      if (data === true) {
        setUsernameStatus('available');
        setUsernameError('');
      } else {
        setUsernameStatus('taken');
        setUsernameError('Username already taken');
      }
    } catch (err) {
      // Fallback to direct query if RPC doesn't exist
      try {
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', trimmedValue)
          .single();

        if (existingUser) {
          setUsernameStatus('taken');
          setUsernameError('Username already taken');
        } else {
          setUsernameStatus('available');
          setUsernameError('');
        }
      } catch {
        // No user found means username is available
        setUsernameStatus('available');
        setUsernameError('');
      }
    }
  };

  // Handle username change with debounce
  const handleUsernameChange = (e) => {
    const value = e.target.value;
    setUsername(value);

    // Clear previous timeout
    if (usernameCheckTimeoutRef.current) {
      clearTimeout(usernameCheckTimeoutRef.current);
    }

    // Reset status if empty
    if (!value.trim()) {
      setUsernameStatus('idle');
      setUsernameError('');
      return;
    }

    // Quick format validation for immediate feedback
    const formatCheck = validateUsernameFormat(value.trim().toLowerCase());
    if (!formatCheck.valid) {
      setUsernameStatus('invalid');
      setUsernameError(formatCheck.error);
      return;
    }

    // Set to checking and debounce the availability check
    setUsernameStatus('checking');
    usernameCheckTimeoutRef.current = setTimeout(() => {
      checkUsernameAvailability(value);
    }, 400);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (usernameCheckTimeoutRef.current) {
        clearTimeout(usernameCheckTimeoutRef.current);
      }
    };
  }, []);

  // Reset username validation when switching modes
  useEffect(() => {
    setUsernameStatus('idle');
    setUsernameError('');
    setUsername('');
    setError('');
    setResetSent(false);
  }, [mode]);

  if (!isOpen) return null;

  // Check if username is valid for form submission
  const isUsernameValid = usernameStatus === 'available';

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Forgot-password flow: email a reset link and bail out before the
    // sign-in / sign-up logic below.
    if (mode === 'forgot') {
      setLoading(true);
      setError('');
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/?recovery=1`
        });
        if (error) throw error;
        setResetSent(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Block submission if username is not validated (for signup mode)
    if (mode === 'signup') {
      // Check for banned words in username and display name
      const usernameBanned = validateUsername(username);
      if (usernameBanned) {
        setError(usernameBanned);
        return;
      }
      if (isReservedTopLevelSegment(username.trim().toLowerCase())) {
        setError('That username is reserved. Try another.');
        return;
      }
      const displayNameBanned = validateDisplayName(displayName);
      if (displayNameBanned) {
        setError(displayNameBanned);
        return;
      }

      if (!isUsernameValid) {
        if (usernameStatus === 'checking') {
          setError('Please wait while we verify username availability');
          return;
        }
        if (usernameStatus === 'taken') {
          setError('This username is already taken. Please choose another one.');
          return;
        }
        if (usernameStatus === 'invalid' || usernameStatus === 'idle') {
          setError(usernameError || 'Please enter a valid username');
          return;
        }
      }
    }

    setLoading(true);
    setError('');

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: username.toLowerCase().trim(), display_name: displayName || username }
          }
        });
        if (error) throw error;
        if (data.session) {
          // Email confirmation not required or auto-confirmed — user is fully signed in
          addToast('Account created!', 'success');
          onSuccess(data.user);
        } else {
          // Email confirmation required — don't sign the user in yet
          addToast('Account created! Check your email to verify, then sign in.', 'success');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        addToast('Welcome back!', 'success');
        onSuccess(data.user);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // In the native Capacitor app, Google blocks OAuth inside an embedded WebView
  // ("disallowed_useragent"). Instead we open the provider in the system browser
  // (Custom Tab) and return via the com.prmpted.app://auth-callback deep link,
  // which nativeBootstrap exchanges for a session.
  const handleOAuthLogin = async (provider, promptParam) => {
    if (isNativeApp()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
      });
      if (error) { setError(error.message); return; }
      if (data?.url) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: data.url });
      }
      return;
    }

    // Web (and PWA): standard redirect flow.
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
        ...(isStandalone && promptParam ? { queryParams: { prompt: promptParam } } : {}),
      }
    });
    if (error) setError(error.message);
  };

  const handleGoogleLogin = () => handleOAuthLogin('google', 'select_account');
  const handleGitHubLogin = () => handleOAuthLogin('github', 'consent');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
        <div className="auth-logo-container">
          <img src="/logo-icon.svg" alt="Prompted" className="auth-logo" />
        </div>
        <div className="modal-header">
          <h2 className="modal-title">{mode === 'login' ? 'Welcome Back' : mode === 'forgot' ? 'Reset Password' : 'Sign Up for Prompted'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {mode === 'forgot' ? (
            resetSent ? (
              <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
                <p style={{ color: '#ddd', fontSize: '0.95rem', lineHeight: 1.6 }}>
                  If an account exists for <strong>{email}</strong>, we've sent a password
                  reset link. Check your inbox — and your spam folder — then follow the link to
                  choose a new password.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: '1.25rem', justifyContent: 'center' }}
                  onClick={() => setMode('login')}
                >
                  Back to Log In
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p style={{ textAlign: 'center', color: '#aaa', fontSize: '0.9rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                  Enter the email you signed up with and we'll send you a link to reset your password.
                </p>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className={`form-input ${error ? 'error' : ''}`}
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="form-error">{error}</p>}
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button
                  type="button"
                  style={{ width: '100%', marginTop: '0.75rem', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.85rem' }}
                  onClick={() => setMode('login')}
                >
                  Back to Log In
                </button>
              </form>
            )
          ) : (
          <>
          {mode === 'signup' && (
            <p style={{ textAlign: 'center', color: '#aaa', fontSize: '0.9rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
              A community for learning AI — real prompts, real builds, real people. Free to join. No spam.
            </p>
          )}
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => setMode('login')}
            >
              Log In
            </button>
            <button
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => setMode('signup')}
            >
              Sign Up
            </button>
          </div>

          <div className="social-login">
            <button className="social-btn" onClick={handleGoogleLogin}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px' }}>
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z" fill="#34A853"/>
                <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            <button className="social-btn" onClick={handleGitHubLogin}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px' }}>
                <path fillRule="evenodd" clipRule="evenodd" d="M9 0C4.0275 0 0 4.13211 0 9.22838C0 13.3065 2.5785 16.7648 6.15375 17.9841C6.60375 18.0709 6.76875 17.7853 6.76875 17.5403C6.76875 17.3212 6.76125 16.7405 6.7575 15.9712C4.254 16.5277 3.726 14.7332 3.726 14.7332C3.3165 13.6681 2.72475 13.3832 2.72475 13.3832C1.9095 12.8111 2.78775 12.8229 2.78775 12.8229C3.69 12.8871 4.16625 13.7737 4.16625 13.7737C4.96875 15.1847 6.273 14.777 6.7875 14.5414C6.8685 13.9443 7.10025 13.5381 7.3575 13.3073C5.35875 13.0764 3.258 12.2829 3.258 8.74709C3.258 7.73988 3.60825 6.91659 4.18425 6.27095C4.083 6.03774 3.77925 5.0994 4.263 3.82846C4.263 3.82846 5.01675 3.58116 6.738 4.77462C7.458 4.56958 8.223 4.46785 8.988 4.46315C9.753 4.46785 10.518 4.56958 11.238 4.77462C12.948 3.58116 13.7017 3.82846 13.7017 3.82846C14.1855 5.0994 13.8818 6.03774 13.7917 6.27095C14.3655 6.91659 14.7142 7.73988 14.7142 8.74709C14.7142 12.2923 12.6105 13.0725 10.608 13.2995C10.923 13.5765 11.2155 14.1423 11.2155 15.0071C11.2155 16.242 11.2043 17.2344 11.2043 17.5341C11.2043 17.7759 11.3617 18.0647 11.8267 17.9723C15.4207 16.7609 18 13.3002 18 9.22838C18 4.13211 13.9703 0 9 0Z"/>
              </svg>
              GitHub
            </button>
          </div>

          <div className="auth-divider">or continue with email</div>

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <>
                <div className="form-group">
                  <label className="form-label">Display Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Your Name"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <div className="username-input-wrapper">
                    <input
                      type="text"
                      className={`form-input ${usernameStatus === 'available' ? 'input-success' : ''} ${usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'input-error' : ''}`}
                      placeholder="your_cool_name"
                      value={username}
                      onChange={handleUsernameChange}
                      required
                    />
                    {usernameStatus === 'checking' && (
                      <span className="username-status username-checking">
                        <span className="spinner-small"></span>
                      </span>
                    )}
                    {usernameStatus === 'available' && (
                      <span className="username-status username-available">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </span>
                    )}
                    {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                      <span className="username-status username-error">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </span>
                    )}
                  </div>
                  {usernameStatus === 'available' && (
                    <p className="username-feedback feedback-success">Username available</p>
                  )}
                  {usernameError && (
                    <p className="username-feedback feedback-error">{usernameError}</p>
                  )}
                  <p className="form-hint">3-15 characters, letters, numbers, and underscores only</p>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className={`form-input ${error ? 'error' : ''}`}
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className={`form-input ${error ? 'error' : ''}`}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {mode === 'login' && (
              <div style={{ textAlign: 'right', marginTop: '-0.25rem', marginBottom: '0.25rem' }}>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                  onClick={() => setMode('forgot')}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && <p className="form-error">{error}</p>}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}
              disabled={loading || (mode === 'signup' && !isUsernameValid)}
            >
              {loading ? 'Loading...' : mode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>
          </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// PASSWORD RESET MODAL
// Shown after a user follows the reset link from their email (?recovery=1).
// At that point Supabase has already established a recovery session, so we
// just collect a new password and call updateUser().
// ============================================
const PasswordResetModal = ({ isOpen, onClose }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const { addToast } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      addToast('Password updated! You are now signed in.', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
        <div className="auth-logo-container">
          <img src="/logo-icon.svg" alt="Prompted" className="auth-logo" />
        </div>
        <div className="modal-header">
          <h2 className="modal-title">{done ? 'Password Updated' : 'Choose a New Password'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {done ? (
            <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
              <p style={{ color: '#ddd', fontSize: '0.95rem', lineHeight: 1.6 }}>
                Your password has been changed and you're signed in. You can close this window.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1.25rem', justifyContent: 'center' }}
                onClick={onClose}
              >
                Continue
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p style={{ textAlign: 'center', color: '#aaa', fontSize: '0.9rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                Enter a new password for your account.
              </p>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className={`form-input ${error ? 'error' : ''}`}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className={`form-input ${error ? 'error' : ''}`}
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}
                disabled={loading}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};



// ============================================
// CREATE POST BOX COMPONENT (Twitter-style)
// ============================================
const CreatePostBox = ({ onCreateClick, onAuthRequired, theme = 'prompted' }) => {
  const { user, profile } = useAuth();
  const tabsKey = user ? `postBoxTabs:${user.id}` : null;
  const newTab = () => ({ id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, content: '' });

  const [tabs, setTabs] = useState(() => {
    if (!tabsKey || typeof localStorage === 'undefined') return [newTab()];
    try {
      const raw = localStorage.getItem(tabsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [newTab()];
  });
  const [activeTabId, setActiveTabId] = useState(() => {
    if (!tabsKey || typeof localStorage === 'undefined') return null;
    try {
      const saved = localStorage.getItem(`${tabsKey}:active`);
      if (saved) return saved;
    } catch {}
    return null;
  });

  // Ensure activeTabId always points to a real tab
  useEffect(() => {
    if (tabs.length === 0) return;
    if (!activeTabId || !tabs.find(t => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  // Persist tabs + active id
  useEffect(() => {
    if (!tabsKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(tabsKey, JSON.stringify(tabs));
      if (activeTabId) localStorage.setItem(`${tabsKey}:active`, activeTabId);
    } catch {}
  }, [tabs, activeTabId, tabsKey]);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0] || { content: '' };
  const draft = activeTab.content;

  const updateActiveContent = (val) => {
    setTabs(prev => prev.map(t => t.id === activeTab.id ? { ...t, content: val } : t));
  };

  const addTab = () => {
    const t = newTab();
    setTabs(prev => [...prev, t]);
    setActiveTabId(t.id);
  };

  const closeTab = (id) => {
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== id);
      if (remaining.length === 0) return [newTab()];
      return remaining;
    });
    if (id === activeTabId) {
      const idx = tabs.findIndex(t => t.id === id);
      const fallback = tabs[idx - 1] || tabs[idx + 1];
      if (fallback) setActiveTabId(fallback.id);
    }
  };

  const handleOpen = (text) => {
    if (!user) {
      onAuthRequired();
    } else {
      onCreateClick(text || '');
      updateActiveContent('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim()) handleOpen(draft.trim());
    }
  };

  const userHandle = profile?.username || user?.user_metadata?.username || 'user';
  const placeholders = {
    prompted: 'What are you sharing?',
    mac: `$ ./post --what-are-you-sharing`,
    windows: `C:\\Users\\${userHandle}> new-post`,
    linux: `➜ ~ post "what are you sharing?"`,
    retro: '> COMPOSE NEW TRANSMISSION_',
  };

  const tabLabel = (t) => {
    if (t.name) return t.name;
    const first = (t.content || '').trim().split('\n')[0];
    if (!first) return 'Untitled';
    return first.length > 22 ? first.slice(0, 22) + '…' : first;
  };

  const [editingTabId, setEditingTabId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const startRename = (t) => {
    setEditingTabId(t.id);
    setEditingName(t.name || '');
  };
  const commitRename = () => {
    if (!editingTabId) return;
    const name = editingName.trim();
    setTabs(prev => prev.map(t => t.id === editingTabId ? { ...t, name: name || null } : t));
    setEditingTabId(null);
    setEditingName('');
  };

  const isTerminal = theme && theme !== 'prompted';

  const renderTabs = () => (
    <div className="post-tabs-strip">
      {tabs.map(t => (
        <div
          key={t.id}
          className={`post-tab ${t.id === activeTabId ? 'active' : ''}`}
          onClick={() => {
            if (t.id === activeTabId && editingTabId !== t.id) {
              startRename(t);
            } else {
              setActiveTabId(t.id);
            }
          }}
          onDoubleClick={(e) => { e.stopPropagation(); startRename(t); }}
          title={t.name || t.content || 'Empty note · click active tab to rename'}
        >
          <span className="post-tab-icon">▮</span>
          {editingTabId === t.id ? (
            <input
              autoFocus
              className="post-tab-rename-input"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') { e.preventDefault(); setEditingTabId(null); setEditingName(''); }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="post-tab-title">{tabLabel(t)}</span>
          )}
          <span
            className="post-tab-close"
            onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
            title="Close note"
          >✕</span>
        </div>
      ))}
      <button className="post-tab-add" onClick={addTab} title="New note">+</button>
    </div>
  );

  return (
    <div className={`create-post-box ${isTerminal ? `terminal-themed terminal-theme-${theme}` : ''}`}>
      {isTerminal && (theme === 'windows' ? (
        <div className="create-post-titlebar windows-tabs">
          {renderTabs()}
          <div className="terminal-titlebar-spacer" />
          <div className="create-post-win-controls">
            <span>—</span><span>▢</span><span className="close">✕</span>
          </div>
        </div>
      ) : (
        <div className="create-post-titlebar">
          <div className="create-post-dots">
            <span className="create-post-dot close" />
            <span className="create-post-dot min" />
            <span className="create-post-dot max" />
          </div>
          <span className="create-post-titlebar-title">
            prompted — {theme === 'linux' ? 'bash' : theme === 'retro' ? 'tty1' : 'zsh'}
          </span>
          <div style={{ width: 42 }} />
        </div>
      ))}
      {isTerminal && theme !== 'windows' && (
        <div className="post-tabs-strip-row">{renderTabs()}</div>
      )}
      {!isTerminal && tabs.length > 1 && (
        <div className="post-tabs-strip-row prompted">{renderTabs()}</div>
      )}
      <div className="create-post-input-wrapper">
        <div className="create-post-avatar">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" />
          ) : profile?.avatar_emoji ? (
            <span>{profile.avatar_emoji}</span>
          ) : (
            <UserIcon />
          )}
        </div>
        <div className="create-post-input-container">
          <textarea
            className="create-post-textarea"
            placeholder={placeholders[theme] || placeholders.prompted}
            value={draft}
            onChange={(e) => updateActiveContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (!user) { onAuthRequired(); } }}
          />
          <div className="create-post-actions">
            {!isTerminal && tabs.length === 1 && (
              <button
                className="create-post-submit-btn"
                style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                onClick={addTab}
                title="Save another draft"
              >
                + Note
              </button>
            )}
            <button className="create-post-submit-btn" onClick={() => handleOpen(draft.trim())}>
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// USER PROFILE SIDEBAR CARD
// ============================================
const formatPromptedAge = (dateString) => {
  if (!dateString) return 'New';
  const created = new Date(dateString);
  if (Number.isNaN(created.getTime())) return 'New';
  const ms = Date.now() - created.getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return 'Today';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
};

const UserProfileSidebarCard = ({ userId, builderRanks = [], onShowRanks, onCommunityClick, isOwnProfile = false, onEditProfile, onToolClick }) => {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ builds: 0, questionsAnswered: 0, followers: 0 });
  const [communities, setCommunities] = useState([]);
  const [topTools, setTopTools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, buildsRes, answersRes, followersRes, membershipsRes, toolPostsRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_question', false),
          // Top-level comments by this user on question posts. We dedupe by
          // post_id below so a user who left multiple answers on the same
          // question is only counted once.
          supabase
            .from('comments')
            .select('post_id, posts!inner(is_question)')
            .eq('user_id', userId)
            .is('parent_comment_id', null)
            .eq('posts.is_question', true),
          supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
          supabase.from('community_members').select('community_id').eq('user_id', userId),
          supabase.from('posts').select('ai_tool, tool_ids').eq('user_id', userId).eq('is_question', false),
        ]);

        if (cancelled) return;

        setProfile(profileRes.data || null);
        const answeredQuestionIds = new Set((answersRes.data || []).map(c => c.post_id));
        setStats({
          builds: buildsRes.count || 0,
          questionsAnswered: answeredQuestionIds.size,
          followers: followersRes.count || 0,
        });

        const toolCounts = new Map();
        (toolPostsRes.data || []).forEach(p => {
          const names = [];
          if (p.tool_ids && p.tool_ids.length > 0) {
            p.tool_ids.forEach(tid => {
              const name = getToolDisplayName(tid);
              if (name) names.push(name);
            });
          } else if (p.ai_tool) {
            parseToolString(p.ai_tool).forEach(name => names.push(name));
          }
          const seen = new Set();
          names.forEach(name => {
            const key = name.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            const entry = toolCounts.get(key);
            if (entry) entry.count += 1;
            else toolCounts.set(key, { name, count: 1 });
          });
        });
        const top3 = Array.from(toolCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
        setTopTools(top3);

        const ids = (membershipsRes.data || []).map(m => m.community_id);
        if (ids.length > 0) {
          const { data: commsData } = await supabase
            .from('communities_with_stats')
            .select('id, name, slug, icon, icon_url, member_count, is_public')
            .in('id', ids)
            .eq('is_public', true)
            .order('member_count', { ascending: false })
            .limit(6);
          if (!cancelled) setCommunities(commsData || []);
        } else if (!cancelled) {
          setCommunities([]);
        }
      } catch (err) {
        console.error('UserProfileSidebarCard load error', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading || !profile) {
    return (
      <aside className="right-sidebar">
        <div className="sidebar-content sidebar-sticky">
          <div className="profile-card-sidebar">
            <div className="profile-card-skeleton" />
          </div>
        </div>
      </aside>
    );
  }

  const badge = getBadgeForPoints(profile.builder_points || 0);
  const ageLabel = formatPromptedAge(profile.created_at);

  const isSpacious = communities.length === 0;

  return (
    <aside className="right-sidebar">
      <div className="sidebar-content sidebar-sticky">
        <div className={`profile-card-sidebar${isSpacious ? ' profile-card-sidebar--spacious' : ''}`}>
          <div className="profile-card-name-block">
            <div
              className="profile-card-display-name"
              style={profile.name_color ? { color: profile.name_color } : undefined}
            >
              <span>{profile.display_name || profile.username}</span>
              <BuilderRankBadge points={profile.builder_points} ranks={builderRanks} onClick={onShowRanks} />
              <UserBadge username={profile.username} size={16} />
            </div>
            <div className="profile-card-username">@{profile.username}</div>
          </div>

          {isOwnProfile && onEditProfile && (
            <button
              type="button"
              className="profile-card-edit-btn"
              onClick={onEditProfile}
            >
              Settings
            </button>
          )}

          {profile.bio && <div className="profile-card-bio">{profile.bio}</div>}

          <div className="profile-card-stats-grid">
            <div className="profile-card-stat">
              <div className="profile-card-stat-value" title={profile.builder_points_display != null ? `Real score: ${(profile.builder_points || 0).toLocaleString()}` : undefined}>{(profile.builder_points_display ?? profile.builder_points ?? 0).toLocaleString()}</div>
              <div className="profile-card-stat-label">Builder Points</div>
            </div>
            <div className="profile-card-stat">
              <div className="profile-card-stat-value">{stats.builds.toLocaleString()}</div>
              <div className="profile-card-stat-label">{stats.builds === 1 ? 'Build' : 'Builds'}</div>
            </div>
            <div className="profile-card-stat">
              <div className="profile-card-stat-value">{ageLabel}</div>
              <div className="profile-card-stat-label">On Prompted</div>
            </div>
            <div className="profile-card-stat">
              <div className="profile-card-stat-value">{stats.followers.toLocaleString()}</div>
              <div className="profile-card-stat-label">{stats.followers === 1 ? 'Follower' : 'Followers'}</div>
            </div>
          </div>

          <div
            className="profile-card-rank"
            onClick={onShowRanks}
            style={{ cursor: onShowRanks ? 'pointer' : 'default' }}
            title={`${badge.name} — ${(profile.builder_points_display ?? profile.builder_points ?? 0).toLocaleString()} Builder Points`}
          >
            <span className="profile-card-rank-icon"><BadgeSVG badge={badge} size={48} /></span>
            <div className="profile-card-rank-info">
              <div className="profile-card-rank-label">Builder Rank</div>
              <div className="profile-card-rank-name" style={{ color: badge.color }}>{badge.name}</div>
            </div>
          </div>

          {topTools.length > 0 && (
            <div className="profile-card-section">
              <div className="profile-card-section-title">TOP AI TOOLS</div>
              <div className="profile-card-top-tools">
                {topTools.map((tool, idx) => {
                  const max = topTools[0].count || 1;
                  const pct = Math.max(18, Math.round((tool.count / max) * 100));
                  const clickable = typeof onToolClick === 'function';
                  return (
                    <div
                      key={tool.name}
                      className={`profile-card-top-tool rank-${idx + 1}${clickable ? ' profile-card-top-tool--clickable' : ''}`}
                      onClick={clickable ? () => onToolClick(tool.name) : undefined}
                      role={clickable ? 'button' : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToolClick(tool.name); } } : undefined}
                    >
                      <span className="profile-card-top-tool-rank">{idx + 1}</span>
                      <div className="profile-card-top-tool-body">
                        <div className="profile-card-top-tool-row">
                          <span className="profile-card-top-tool-name" title={tool.name}>{tool.name}</span>
                          <span className="profile-card-top-tool-count">{tool.count}</span>
                        </div>
                        <div className="profile-card-top-tool-bar">
                          <div className="profile-card-top-tool-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="profile-card-section">
            <div className="profile-card-section-title">ACTIVITY</div>
            <div className="profile-card-activity">
              <div className="profile-card-activity-item">
                <span className="profile-card-activity-icon"><QuestionIcon /></span>
                <span className="profile-card-activity-label">Questions Answered</span>
                <span className="profile-card-activity-value">{stats.questionsAnswered.toLocaleString()}</span>
              </div>
              <div className="profile-card-activity-item">
                <span className="profile-card-activity-icon"><CommunityIcon /></span>
                <span className="profile-card-activity-label">Communities</span>
                <span className="profile-card-activity-value">{communities.length}</span>
              </div>
            </div>
          </div>

          {communities.length > 0 && (
            <div className="profile-card-section">
              <div className="profile-card-section-title">COMMUNITIES</div>
              <div className="profile-card-communities">
                {communities.map(c => (
                  <div
                    key={c.id}
                    className="profile-card-community"
                    onClick={() => onCommunityClick && onCommunityClick(c)}
                  >
                    <span className="profile-card-community-icon">
                      {c.icon_url ? (
                        <img src={c.icon_url} alt="" />
                      ) : (
                        <span>{c.icon || '🌟'}</span>
                      )}
                    </span>
                    <div className="profile-card-community-info">
                      <div className="profile-card-community-name">{c.name}</div>
                      <div className="profile-card-community-meta">
                        {(c.member_count || 0).toLocaleString()} {c.member_count === 1 ? 'member' : 'members'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <a href="/privacypolicy">Privacy Policy</a>
          <span className="sidebar-footer-sep">·</span>
          <a href="/termsandconditions">Terms of Service</a>
          <span className="sidebar-footer-copy">© 2026 Prompted</span>
        </div>
      </div>
    </aside>
  );
};

// ============================================
// RIGHT SIDEBAR COMPONENT
// ============================================
const RightSidebar = ({ topBuilds, topQuestions = [], topDiscussions = [], recommendedAccounts = [], onUserClick, onPostClick, onQuestionClick, onDiscussionClick, onExploreClick, categories, posts, allUsers, onCategoryClick, postCommunities = {}, userFollowedCategories = [], builderRanks = [], onFollowUser, currentUserFollows = [], currentUserId = null, communityMode = false, communityRandomPosts = [], onShuffleCommunityRandom = null, isAdmin = false, isPro = false }) => {
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const [sidebarSearchFocused, setSidebarSearchFocused] = useState(false);
  const [showMoreAccounts, setShowMoreAccounts] = useState(false);

  // Recommended Accounts cycling state.
  // Why: when the user hits "Follow" on a card, the followed account should
  // slide out and be replaced with the next un-shown user from the pool — so
  // the sidebar always offers fresh suggestions rather than a static list.
  // `displayedIds` is the ordered list of account IDs currently visible;
  // `slidingOutId` drives the slide-out CSS animation before swap-in.
  const [displayedIds, setDisplayedIds] = useState([]);
  const [slidingOutId, setSlidingOutId] = useState(null);

  // Seed / re-seed displayedIds whenever the underlying pool changes (e.g.
  // recommendations finish loading) or whenever the user expands "Show more".
  // We pick the first N IDs that the current user is NOT already following
  // and is NOT themselves — no point recommending people you already follow.
  // Track the in-flight follow target via a ref so the seeding effect can
  // see it synchronously and keep that card in displayedIds until our
  // slide-out animation finishes. Without this, the parent's optimistic
  // setUserFollows fires before our timeout, the seeding effect strips the
  // followed id from displayedIds *immediately*, the swap teleports with no
  // animation, and worse the slot can come back empty — which is the
  // "follow does nothing" symptom the user reported.
  const pendingFollowRef = useRef(null);

  useEffect(() => {
    const slotCount = showMoreAccounts ? 9 : 5;
    const pendingId = pendingFollowRef.current;
    const pool = recommendedAccounts.filter(a =>
      a.id !== currentUserId &&
      // Keep the currently-sliding-out account in the pool so it isn't
      // yanked from displayedIds the moment the optimistic follow lands.
      (a.id === pendingId || !currentUserFollows.includes(a.id))
    );
    setDisplayedIds(prev => {
      const kept = prev.filter(id => pool.some(p => p.id === id));
      const need = slotCount - kept.length;
      if (need <= 0) return kept.slice(0, slotCount);
      const taken = new Set(kept);
      const fillers = pool.filter(p => !taken.has(p.id)).slice(0, need).map(p => p.id);
      return [...kept, ...fillers];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendedAccounts, showMoreAccounts, currentUserFollows, currentUserId]);

  // Handle Follow click: trigger the real follow mutation, animate slide-out,
  // then replace the followed slot with the next unused pool entry.
  const handleFollowClick = (account) => {
    if (!onFollowUser) return;
    const isFollowing = currentUserFollows.includes(account.id);
    if (isFollowing) {
      onFollowUser(account.id, true); // unfollow path: just trigger DB write
      return;
    }
    // Mark this id as pending BEFORE calling onFollowUser so the seeding
    // effect (which fires synchronously on parent state update) keeps it.
    pendingFollowRef.current = account.id;
    setSlidingOutId(account.id);
    onFollowUser(account.id, false); // real DB write via parent
    setTimeout(() => {
      setDisplayedIds(prev => {
        const used = new Set(prev);
        const next = recommendedAccounts.find(a =>
          a.id !== currentUserId &&
          a.id !== account.id &&
          !currentUserFollows.includes(a.id) &&
          !used.has(a.id)
        );
        if (!next) return prev.filter(id => id !== account.id);
        return prev.map(id => (id === account.id ? next.id : id));
      });
      setSlidingOutId(null);
      pendingFollowRef.current = null;
    }, 280); // matches the .follow-card slide-out transition duration
  };

  // Get search suggestions for sidebar
  const getSidebarSearchSuggestions = () => {
    if (!sidebarSearchQuery.trim()) return { categories: [], users: [] };

    const query = sidebarSearchQuery.toLowerCase().trim();

    // Search categories
    const matchingCategories = (categories || []).filter(cat =>
      cat.name.toLowerCase().includes(query)
    ).slice(0, 3);

    // Search all users from profiles (not just those with posts)
    const matchingUsers = (allUsers || []).filter(u =>
      u.username?.toLowerCase().includes(query) ||
      u.display_name?.toLowerCase().includes(query)
    ).slice(0, 3);

    return { categories: matchingCategories, users: matchingUsers };
  };

  const sidebarSuggestions = getSidebarSearchSuggestions();

  return (
    <aside className="right-sidebar">
      <div className="sidebar-content sidebar-sticky">
        {/* Top Builds of the Day */}
        <div className="sidebar-section">
          <h3 className="sidebar-title">Builds of the Day</h3>
          {topBuilds.length > 0 ? (
            topBuilds.map((post, index) => {
              const communities = postCommunities[post.id] || [];
              return (
                <div
                  key={post.id}
                  className="mini-post-card"
                  onClick={() => onPostClick && onPostClick(post.id, post.user_id)}
                >
                  {/* Rank number removed per design: the section heading
                      "Builds of the Day" plus visual ordering already conveys
                      ranking — leading digits made cards feel like a list
                      rather than a feed, and were inconsistent with the
                      Discussions/Questions sections which never showed them. */}
                  <div className="mini-post-content">
                    <div className="mini-post-title">{post.title}</div>
                    <div className="mini-post-meta">
                      <span
                        className="mini-post-author"
                        style={post.name_color ? { color: post.name_color } : {}}
                        onClick={(e) => { e.stopPropagation(); onUserClick && onUserClick(post.user_id); }}
                        title={`View @${post.username}'s profile`}
                      >
                        {post.display_name || post.username}
                        <BuilderRankBadge points={post.builder_points} ranks={builderRanks} />
                        <UserBadge username={post.username} size={16} />
                      </span>
                      <span className="mini-post-likes">
                        <HeartIcon filled={false} />
                        {post.likes_count}
                      </span>
                    </div>
                    <div className="mini-post-badges">
                      {(() => {
                        // Get post categories - prefer category_ids array, fall back to single category_id
                        const postCategoryIds = post.category_ids && post.category_ids.length > 0
                          ? post.category_ids
                          : (post.category_id ? [post.category_id] : []);

                        // Look up full category objects
                        const postCategories = postCategoryIds
                          .map(catId => categories.find(c => c.id === catId))
                          .filter(Boolean);

                        // Sort to prefer followed categories first
                        const sortedCategories = [...postCategories].sort((a, b) => {
                          const aFollowed = userFollowedCategories.includes(a.id);
                          const bFollowed = userFollowedCategories.includes(b.id);
                          if (aFollowed && !bFollowed) return -1;
                          if (!aFollowed && bFollowed) return 1;
                          return 0;
                        });

                        // Show top 2 categories
                        const displayCategories = sortedCategories.slice(0, 2);

                        return displayCategories.length > 0 ? (
                          displayCategories.map(cat => {
                            return (
                              <span
                                key={cat.id}
                                className="mini-post-category"
                                style={{
                                  background: 'rgba(255, 255, 255, 0.1)',
                                  color: '#ffffff'
                                }}
                              >
                                {cat.name}
                              </span>
                            );
                          })
                        ) : (post.category_name && post.category_name !== '-' && post.category_name.trim() !== '') ? (
                          <span
                            className="mini-post-category"
                            style={{
                              background: 'rgba(255, 255, 255, 0.1)',
                              color: '#ffffff'
                            }}
                          >
                            {post.category_name}
                          </span>
                        ) : null;
                      })()}
                      {communities.length > 0 && (
                        <span
                          className="mini-post-community"
                          style={{
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                            fontSize: '0.7rem',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            marginLeft: '0.25rem'
                          }}
                        >
                          <CommunityIcon style={{ width: '10px', height: '10px' }} />
                          {communities[0].name}
                        </span>
                      )}
                    </div>
                    {/* Hover-expand preview: shows a short snippet of the post's
                        description on hover so users can scan the sidebar without
                        clicking through. Truncated to 200 chars to keep the
                        sidebar card compact. Falls back through description /
                        prompt / body so the snippet shows whichever field the
                        post happens to store its content in. */}
                    {(() => {
                      // Strip HTML tags before rendering — some posts store
                      // their description as rich-text HTML (<p>, <br>, etc.).
                      // Rendering that raw shows literal tags to the user, so
                      // we flatten to plain text first and collapse whitespace.
                      const raw = post.description || post.prompt || post.body || '';
                      const body = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                      if (!body) return null;
                      return (
                        <div className="mini-post-desc">
                          {body.length > 200 ? `${body.slice(0, 200)}...` : body}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="sidebar-empty">
              <div className="sidebar-empty-icon"><TrendingIcon /></div>
              <p>No builds yet</p>
            </div>
          )}
        </div>

        {/* Discussions of the Day
            Why: gives discussion-type posts a dedicated surface in the right
            sidebar, sandwiched between Builds (above) and Questions (below)
            so the three content pillars of the platform are all represented.
            Hidden entirely when there are no discussions yet to avoid an
            awkward empty section on a fresh feed. No rank numbers — the
            section title plus visual ordering is enough; rank digits add
            noise without information. */}
        {topDiscussions.length > 0 && (
          <div className="sidebar-section">
            <h3 className="sidebar-title">Discussions of the Day</h3>
            {topDiscussions.map((discussion) => (
              <div
                key={discussion.id}
                className="mini-post-card mini-discussion-card"
                onClick={() => onDiscussionClick && onDiscussionClick(discussion.id, discussion.user_id)}
              >
                <div className="mini-post-content">
                  <div className="mini-post-title">{discussion.title}</div>
                  <div className="mini-post-meta">
                    <span
                      className="mini-post-author"
                      style={discussion.name_color ? { color: discussion.name_color } : {}}
                      onClick={(e) => { e.stopPropagation(); onUserClick && onUserClick(discussion.user_id); }}
                      title={`View @${discussion.username}'s profile`}
                    >
                      {discussion.display_name || discussion.username}
                      <BuilderRankBadge points={discussion.builder_points} ranks={builderRanks} />
                      <UserBadge username={discussion.username} size={16} />
                    </span>
                    <span className="mini-post-comments">
                      💬 {discussion.comments_count || 0}
                    </span>
                  </div>
                  {/* Hover-preview snippet — see .mini-post-desc CSS. Same
                      pattern repeated on Builds and Questions cards so all
                      three card types behave consistently on hover. */}
                  {/* Hover-preview — falls back through description/prompt/body
                      so cards always have something to reveal on hover. */}
                  {(() => {
                    // Strip HTML tags so rich-text bodies render as plain text
                    // in the hover preview (avoids showing literal <p>/<br>).
                    const raw = discussion.description || discussion.prompt || discussion.body || '';
                    const body = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    if (!body) return null;
                    return (
                      <div className="mini-post-desc">
                        {body.length > 200 ? `${body.slice(0, 200)}...` : body}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Questions of the Day */}
        <div className="sidebar-section">
          <h3 className="sidebar-title">Questions of the Day</h3>
          {topQuestions.length > 0 ? (
            topQuestions.map((question, index) => (
              <div
                key={question.id}
                className="mini-post-card mini-question-card"
                onClick={() => onQuestionClick && onQuestionClick(question.id, question.user_id)}
              >
                {/* Question icon removed by design — the section heading
                    "Questions of the Day" plus the white left border on the
                    card is enough context; the leading glyph was redundant
                    and made these cards look heavier than Builds/Discussions. */}
                <div className="mini-post-content">
                  <div className="mini-post-title">{question.title}</div>
                  <div className="mini-post-meta">
                    <span
                      className="mini-post-author"
                      style={question.name_color ? { color: question.name_color } : {}}
                      onClick={(e) => { e.stopPropagation(); onUserClick && onUserClick(question.user_id); }}
                      title={`View @${question.username}'s profile`}
                    >
                      {question.display_name || question.username}
                      <BuilderRankBadge points={question.builder_points} ranks={builderRanks} />
                      <UserBadge username={question.username} size={16} />
                    </span>
                    <span className="mini-post-comments" style={{ color: '#ffffff' }}>
                      {question.comments_count || 0} answers
                    </span>
                  </div>
                  {/* Hover-preview snippet for questions.
                      Why fall through multiple fields: questions on Prompted
                      can store their body in several places depending on how
                      they were authored — `description` (rich-text body),
                      `prompt` (when the question itself reads like a prompt),
                      or `body` (legacy). We use whichever is populated so the
                      hover-expand actually has something to show on most
                      cards, not just the few with a description. */}
                  {(() => {
                    // Strip HTML so rich-text question bodies show as plain
                    // text in the hover preview rather than literal tags.
                    const raw = question.description || question.prompt || question.body || '';
                    const body = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    if (!body) return null;
                    return (
                      <div className="mini-post-desc">
                        {body.length > 200 ? `${body.slice(0, 200)}...` : body}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))
          ) : (
            <div className="sidebar-empty">
              <div className="sidebar-empty-icon"><QuestionIcon /></div>
              <p>No questions yet</p>
            </div>
          )}
        </div>

        {communityMode && (
          <div className="sidebar-section">
            <h3 className="sidebar-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Random Posts</span>
              <button
                type="button"
                onClick={() => onShuffleCommunityRandom && onShuffleCommunityRandom()}
                title="Shuffle"
                aria-label="Shuffle random posts"
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 8, padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                🔀
              </button>
            </h3>
            {communityRandomPosts.length > 0 ? (
              communityRandomPosts.map(post => (
                <div
                  key={post.id}
                  className="mini-post-card"
                  onClick={() => {
                    if (post.is_question) onQuestionClick && onQuestionClick(post.id, post.user_id);
                    else if (post.post_type === 'post') onDiscussionClick && onDiscussionClick(post.id, post.user_id);
                    else onPostClick && onPostClick(post.id, post.user_id);
                  }}
                >
                  <div className="mini-post-content">
                    <div className="mini-post-title">{post.title}</div>
                    <div className="mini-post-meta">
                      <span
                        className="mini-post-author"
                        style={post.name_color ? { color: post.name_color } : {}}
                        onClick={(e) => { e.stopPropagation(); onUserClick && onUserClick(post.user_id); }}
                        title={`View @${post.username}'s profile`}
                      >
                        {post.display_name || post.username}
                        <BuilderRankBadge points={post.builder_points} ranks={builderRanks} />
                        <UserBadge username={post.username} size={16} />
                      </span>
                      <span className="mini-post-comments">💬 {post.comments_count || 0}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="sidebar-empty"><p>No community posts yet</p></div>
            )}
          </div>
        )}

        {/* Recommended Accounts — hidden in community sidebar mode */}
        {!communityMode && (
        <div className="sidebar-section">
          <h3 className="sidebar-title">Recommended Accounts</h3>
          {recommendedAccounts.length > 0 ? (
            <>
              {/* Render the cycled `displayedIds` list rather than slicing
                  recommendedAccounts directly — this lets us swap individual
                  slots in/out as the user follows people, instead of
                  reflowing the whole list. */}
              {displayedIds.map(id => recommendedAccounts.find(a => a.id === id)).filter(Boolean).map(account => (
                <div
                  key={account.id}
                  className={`follow-card ${slidingOutId === account.id ? 'follow-card-out' : ''}`}
                  onClick={() => onUserClick && onUserClick(account.id)}
                >
                  <div className="follow-avatar">
                    {account.avatar_url ? (
                      <img src={account.avatar_url} alt="" />
                    ) : account.avatar_emoji ? (
                      <span>{account.avatar_emoji}</span>
                    ) : (
                      <UserIcon />
                    )}
                  </div>
                  <div className="follow-info">
                    <div
                      className="follow-name"
                      style={account.name_color ? { color: account.name_color } : {}}
                    >
                      {account.display_name || account.username}
                      <BuilderRankBadge points={account.builder_points} ranks={builderRanks} />
                      <UserBadge username={account.username} size={16} />
                    </div>
                    <div className="follow-username">@{account.username}</div>
                    {account.interests && (
                      <div className="follow-interests">{account.interests}</div>
                    )}
                  </div>
                  {/* Replaced the old "View" button with a real Follow button.
                      Why: a "View" CTA next to a recommendation is a weak ask
                      — the user can already click the card to view the profile.
                      A Follow button drives the actual social action this
                      section is for. After follow, the card slides out and is
                      replaced by the next unused recommendation from the pool. */}
                  <button
                    className={`follow-btn ${currentUserFollows.includes(account.id) ? 'follow-btn-following' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFollowClick(account);
                    }}
                  >
                    {currentUserFollows.includes(account.id) ? 'Following' : 'Follow'}
                  </button>
                </div>
              ))}
              {!showMoreAccounts && recommendedAccounts.length > 5 && (
                <button
                  className="sidebar-show-more-btn"
                  onClick={() => setShowMoreAccounts(true)}
                >
                  Show More Accounts
                </button>
              )}
            </>
          ) : (
            <div className="sidebar-empty">
              <div className="sidebar-empty-icon"><UsersIcon /></div>
              <p>No recommendations yet</p>
            </div>
          )}
        </div>
        )}

        <SidebarAd isAdmin={isAdmin} isPro={isPro} />

        <div className="sidebar-footer">
          <a href="/privacypolicy">Privacy Policy</a>
          <span className="sidebar-footer-sep">·</span>
          <a href="/termsandconditions">Terms of Service</a>
          <span className="sidebar-footer-copy">© 2026 Prompted</span>
        </div>

      </div>
    </aside>
  );
};

// ============================================
// LEFT SIDEBAR NAVIGATION COMPONENT
// ============================================
const LeftSidebar = ({
  isOpen,
  onToggleOpen,
  activeTab,
  setActiveTab,
  onCreateClick,
  onSettingsClick,
  onLogout,
  user,
  profile,
  onAuthRequired,
  notifications = [],
  feedSubTab,
  setFeedSubTab,
  onLoadNotifications,
  onMarkNotificationsAsRead,
  onClearSearchState,
  onShowLanding,
  unreadDmCount = 0,
  savedAccounts = [],
  onSwitchAccount,
  onAddAccount,
  onRemoveSavedAccount,
}) => {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  useEffect(() => {
    if (!switcherOpen) return;
    const close = (e) => {
      if (!e.target.closest('.account-switcher-popover') && !e.target.closest('.sidebar-user-info-clickable')) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [switcherOpen]);
  const handleNavClick = (tab) => {
    if (tab === activeTab) {
      // Already on this tab - scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Always scroll to top when navigating to explore so search bar is visible
    if (tab === 'explore') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setActiveTab(tab);
    // Reset feedSubTab to 'foryou' when navigating to home
    if (tab === 'foryou') {
      setFeedSubTab('foryou');
    }
    // Update URL to match the active tab so refresh returns to the correct page
    if (tab === 'foryou') {
      window.history.replaceState({}, '', '/');
    } else if (tab === 'explore') {
      window.history.replaceState({}, '', '/explore');
    } else if (tab === 'ranks') {
      window.history.replaceState({}, '', '/ranks');
    } else if (tab === 'arena') {
      window.history.replaceState({}, '', '/arena');
    } else if (tab === 'games') {
      window.history.replaceState({}, '', '/games');
      window.dispatchEvent(new Event('prmpted:games-home'));
    } else if (tab === 'learn') {
      window.history.replaceState({}, '', '/learn');
      window.dispatchEvent(new Event('prmpted:learn-home'));
    } else if (tab === 'videos') {
      window.history.replaceState({}, '', '/videos');
    } else if (tab === 'memes') {
      window.history.replaceState({}, '', '/lounge');
    } else if (tab === 'spotlight') {
      window.history.replaceState({}, '', '/spotlight');
    } else if (tab === 'pro') {
      window.history.replaceState({}, '', '/pro');
    } else if (tab === 'live') {
      window.history.replaceState({}, '', '/live');
    } else if (tab === 'referrals') {
      window.history.replaceState({}, '', '/referrals');
    } else if (tab === 'communities') {
      window.history.replaceState({}, '', '/communities');
    } else if (tab === 'questions') {
      window.history.replaceState({}, '', '/questions');
    } else if (tab === 'messages') {
      window.history.replaceState({}, '', '/messages');
    } else if (tab === 'saved') {
      window.history.replaceState({}, '', '/saved');
    } else if (tab === 'myprofile' && profile?.username) {
      window.history.replaceState({}, '', `/${profile.username}`);
    }
    // Clear any search state when switching tabs
    if (onClearSearchState) onClearSearchState(tab);
    // Close mobile sidebar when navigating
    if (window.innerWidth < 768) {
      onToggleOpen();
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={onToggleOpen}
      />

      {/* Sidebar */}
      <aside className={`left-sidebar ${isOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="sidebar-logo-text">Prompted</span>
        </div>
        <a
          className="sidebar-about-link"
          href="/?landing=1"
          onClick={(e) => {
            e.preventDefault();
            if (onShowLanding) onShowLanding();
            if (window.innerWidth < 768) onToggleOpen();
          }}
        >What is Prompted?</a>

        {/* Navigation */}
        <nav className="sidebar-nav">
        <div className="sidebar-nav-list">
          <button
            className={`sidebar-nav-item ${activeTab === 'foryou' && feedSubTab !== 'notifications' ? 'active' : ''}`}
            onClick={() => handleNavClick('foryou')}
            title="Home"
          >
            {/* Animated home icon: roof lifts, body pulses, door squashes. */}
            <span className="sidebar-nav-icon"><AnimatedIcon name="home" size={22} /></span>
            <span className="sidebar-nav-label">Home</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'explore' ? 'active' : ''}`}
            onClick={() => handleNavClick('explore')}
            title="Explore"
          >
            {/* Animated magnifier: nudges + tilts as if scanning. */}
            <span className="sidebar-nav-icon"><AnimatedIcon name="magnifier" size={22} /></span>
            <span className="sidebar-nav-label">Explore</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'communities' ? 'active' : ''}`}
            onClick={() => handleNavClick('communities')}
            title="Communities"
          >
            {/* Animated communities: three user heads bob in sequence. */}
            <span className="sidebar-nav-icon"><AnimatedIcon name="communities" size={22} /></span>
            <span className="sidebar-nav-label">Communities</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'questions' ? 'active' : ''}`}
            onClick={() => handleNavClick('questions')}
            title="Questions"
          >
            {/* Animated question: hook draws itself via dashoffset, dot bounces. */}
            <span className="sidebar-nav-icon"><AnimatedIcon name="questions" size={22} /></span>
            <span className="sidebar-nav-label">Questions</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'arena' ? 'active' : ''}`}
            onClick={() => handleNavClick('arena')}
            title="Arena"
          >
            {/* Animated arena: three slider knobs slide back-and-forth. */}
            <span className="sidebar-nav-icon"><AnimatedIcon name="arena" size={22} /></span>
            <span className="sidebar-nav-label">Arena</span>
          </button>

          {/* Games is web-only for now — hidden inside the Android app. */}
          {!isNativeApp() && (
          <button
            className={`sidebar-nav-item ${activeTab === 'games' ? 'active' : ''}`}
            onClick={() => handleNavClick('games')}
            title="Games"
          >
            <span className="sidebar-nav-icon"><AnimatedIcon name="gamepad" size={22} /></span>
            <span className="sidebar-nav-label">Games</span>
          </button>
          )}

          <button
            className={`sidebar-nav-item ${activeTab === 'spotlight' ? 'active' : ''}`}
            onClick={() => handleNavClick('spotlight')}
            title="Spotlight — July $1,000 Creator of the Month"
          >
            <span className="sidebar-nav-icon"><AnimatedIcon name="spotlight" size={22} /></span>
            <span className="sidebar-nav-label">Spotlight</span>
            <SpotlightCountdownBadge />
          </button>

          {/* Prompted Pro — public; everyone sees the tab and can upgrade. */}
          {canSeePro(profile) && (
          <button
            className={`sidebar-nav-item ${activeTab === 'pro' ? 'active' : ''}`}
            onClick={() => handleNavClick('pro')}
            title="Prompted Pro — upgrade for $0.99"
          >
            <span className="sidebar-nav-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7l4.5 4L12 5l4.5 6L21 7l-1.8 11H4.8L3 7z" />
              </svg>
            </span>
            <span className="sidebar-nav-label">Pro</span>
          </button>
          )}

          {/* Learn — hands-on, peer-graded prompting curriculum. Public (open posting). */}
          <button
            className={`sidebar-nav-item ${activeTab === 'learn' ? 'active' : ''}`}
            onClick={() => handleNavClick('learn')}
            title="Learn — build 10 projects with each AI model"
          >
            <span className="sidebar-nav-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10L12 5 2 10l10 5 10-5z" />
                <path d="M6 12v5c0 1 2.5 2.5 6 2.5s6-1.5 6-2.5v-5" />
              </svg>
            </span>
            <span className="sidebar-nav-label">Learn</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'videos' ? 'active' : ''}`}
            onClick={() => handleNavClick('videos')}
            title="Videos — scroll builder demos"
          >
            <span className="sidebar-nav-icon"><AnimatedIcon name="videos" size={22} /></span>
            <span className="sidebar-nav-label">Videos</span>
          </button>

          {/* Lounge is hidden for everyone right now (see canSeeLounge). */}
          {canSeeLounge(profile) && (
          <button
            className={`sidebar-nav-item ${activeTab === 'memes' ? 'active' : ''}`}
            onClick={() => handleNavClick('memes')}
            title="Lounge — AI memes, shitposts & tweets"
          >
            <span className="sidebar-nav-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </span>
            <span className="sidebar-nav-label">Lounge</span>
          </button>
          )}

          {/* Zeo (Zoetrope) — livestreaming. Public to watch (web + native app); hosting is Pro-gated inside. */}
          {(
          <button
            className={`sidebar-nav-item ${activeTab === 'live' ? 'active' : ''}`}
            onClick={() => handleNavClick('live')}
            title="Zeo — live builds & conversations"
          >
            <span className="sidebar-nav-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </span>
            <span className="sidebar-nav-label">Zeo</span>
          </button>
          )}

          {/* Referrals — invite friends, earn Pro. Admin-only for now (demo/preview). */}
          {(!!profile?.is_admin || ADMIN_USERNAMES.includes(profile?.username)) && (
          <button
            className={`sidebar-nav-item ${activeTab === 'referrals' ? 'active' : ''}`}
            onClick={() => handleNavClick('referrals')}
            title="Referrals — invite friends, earn Pro"
          >
            <span className="sidebar-nav-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6M22 11h-6" />
              </svg>
            </span>
            <span className="sidebar-nav-label">Referrals</span>
          </button>
          )}

          <button
            className={`sidebar-nav-item ${activeTab === 'ranks' ? 'active' : ''}`}
            onClick={() => handleNavClick('ranks')}
            title="Builder Rank"
          >
            {/* Animated builder rank: trophy shakes and bursts colored confetti. */}
            <span className="sidebar-nav-icon"><AnimatedIcon name="builderrank" size={22} /></span>
            <span className="sidebar-nav-label">Builder Rank</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => handleNavClick('messages')}
            title="Messages"
          >
            {/* Animated messages: paper plane flies off and reappears. */}
            <span className="sidebar-nav-icon"><AnimatedIcon name="messages" size={22} /></span>
            <span className="sidebar-nav-label">Messages</span>
            {unreadDmCount > 0 && (
              <span className="sidebar-nav-badge">{unreadDmCount > 9 ? '9+' : unreadDmCount}</span>
            )}
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'saved' ? 'active' : ''}`}
            onClick={() => handleNavClick('saved')}
            title="Saved"
          >
            {/* Animated saved-posts: star wobbles and fills in on hover. */}
            <span className="sidebar-nav-icon"><AnimatedIcon name="savedposts" size={22} /></span>
            <span className="sidebar-nav-label">Saved</span>
          </button>

          {/* Notifications and Settings are intentionally NOT rendered here:
              the bell sits in the top header (with the unread badge) and
              Settings lives inside the profile-edit screen. Removing the
              sidebar entries keeps the rail focused on tab navigation. */}

          {user && (
            <button
              className={`sidebar-nav-item ${activeTab === 'myprofile' ? 'active' : ''}`}
              onClick={() => handleNavClick('myprofile')}
              title="Profile"
            >
              {/* Animated profile: user silhouette gives a small bob on hover. */}
              <span className="sidebar-nav-icon"><AnimatedIcon name="profile" size={22} /></span>
              <span className="sidebar-nav-label">Profile</span>
            </button>
          )}

        </div>
        </nav>

        <div className="sidebar-nav-pinned">
          <button
            className="sidebar-nav-item create-btn"
            onClick={() => {
              if (user) {
                onCreateClick();
              } else {
                onAuthRequired();
              }
            }}
            title="Create"
          >
            {/* Animated terminal icon (itshover terminal-icon).
                The chevron `>` redraws on hover and the cursor blinks —
                reads as "open a prompt", which suits the Create action. */}
            <span className="sidebar-nav-icon"><AnimatedIcon name="terminal" size={22} /></span>
            <span className="sidebar-nav-label">Create</span>
          </button>
        </div>

        {/* User section */}
        <div className="sidebar-user-section">
          {user ? (
            <>
              <div className="sidebar-user-avatar" onClick={() => {
                setActiveTab('myprofile');
                if (profile?.username) {
                  window.history.replaceState({}, '', `/${profile.username}`);
                }
                if (window.innerWidth < 768) {
                  onToggleOpen();
                }
              }} title="View your profile">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" />
                ) : profile?.avatar_emoji ? (
                  <span>{profile.avatar_emoji}</span>
                ) : (
                  <UserIcon />
                )}
              </div>
              <div
                className="sidebar-user-info sidebar-user-info-clickable"
                onClick={() => setSwitcherOpen(v => !v)}
                style={{ cursor: 'pointer', flex: 1 }}
                title="Switch account"
              >
                <div
                  className="sidebar-user-name"
                  style={profile?.name_color ? { color: profile.name_color } : {}}
                >
                  {profile?.display_name || profile?.username || 'User'}
                </div>
                <div className="sidebar-user-username">@{profile?.username || 'user'}</div>
              </div>
              <button className="sidebar-logout-btn" onClick={onLogout} title="Logout">
                <LogoutIcon />
              </button>
              {switcherOpen && (
                <div
                  className="account-switcher-popover"
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 8,
                    right: 8,
                    marginBottom: 8,
                    background: '#0f1115',
                    border: '1px solid #2a2f3a',
                    borderRadius: 12,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                    padding: 6,
                    zIndex: 1000,
                    maxHeight: '60vh',
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ padding: '8px 10px 6px', fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Switch account
                  </div>
                  {savedAccounts.length === 0 && (
                    <div style={{ padding: '8px 10px', fontSize: '0.82rem', color: '#94a3b8' }}>
                      No other saved accounts yet.
                    </div>
                  )}
                  {savedAccounts.map(acc => {
                    const isActive = acc.user_id === user?.id;
                    return (
                      <div
                        key={acc.user_id}
                        onClick={() => { if (!isActive) { setSwitcherOpen(false); onSwitchAccount && onSwitchAccount(acc); } }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          borderRadius: 8,
                          cursor: isActive ? 'default' : 'pointer',
                          background: isActive ? 'rgba(99,91,255,0.12)' : 'transparent',
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', background: '#1a1d24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                          {acc.avatar_url ? (
                            <img src={acc.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : acc.avatar_emoji ? (
                            <span>{acc.avatar_emoji}</span>
                          ) : (
                            <UserIcon />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.86rem', color: acc.name_color || '#e6edf3', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {acc.display_name || acc.username || acc.email || 'User'}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            @{acc.username || '—'} {isActive && <span style={{ color: '#635bff', marginLeft: 4 }}>· Active</span>}
                          </div>
                        </div>
                        {!isActive && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onRemoveSavedAccount && onRemoveSavedAccount(acc.user_id); }}
                            title="Remove from saved accounts"
                            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem', padding: 4, lineHeight: 1 }}
                          >×</button>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ borderTop: '1px solid #1f242c', margin: '6px 0' }} />
                  <button
                    onClick={() => { setSwitcherOpen(false); onAddAccount && onAddAccount(); }}
                    disabled={savedAccounts.length >= MAX_ACCOUNTS && !savedAccounts.find(a => a.user_id === user?.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#e6edf3', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.86rem' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    + Add another account {savedAccounts.length >= MAX_ACCOUNTS && <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>(max {MAX_ACCOUNTS})</span>}
                  </button>
                  <button
                    onClick={() => { setSwitcherOpen(false); onLogout && onLogout(); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#fca5a5', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.86rem' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    Log out of @{profile?.username || 'this account'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <button className="sidebar-login-btn" onClick={onAuthRequired}>
              <UserIcon /> Login / Sign Up
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

// ============================================
// LEGAL PAGE COMPONENTS
// ============================================

// About Page Component
const AboutPage = ({ onBack }) => {
  return (
    <div className="about-page">
      <div className="about-page-header">
        <button className="legal-back-btn" onClick={onBack}>
          <ChevronLeftIcon /> Back
        </button>
        <h1 className="about-page-title">What is Prompted?</h1>
      </div>
      <div className="about-page-content">
        <p>
          Prompted is the social hub for anyone engaging with Al to discuss their work, share their techniques, and connect with other builders and thinkers. It's about sharing not just final products, but the ideas and dialogues that make them possible.
        </p>
        <p>
          Built to foster openness and collaboration, Prompted is the definitive central feed for an extensive ecosystem of Al discussions, shared knowledge, and groundbreaking builds. This is the singular place where the global conversation and library of Al-driven creation are shared and advanced.
        </p>
        <p>
          Think of it as a shared canvas for AI projects and the central stage for AI conversations. It's where you learn from others shared expertise and profound discussions, giving you the knowledge and inspiration to join the community and advance your own Al journey.
        </p>
      </div>
    </div>
  );
};

// Terms and Conditions Page Component
const TermsPage = ({ onBack }) => {
  return (
    <div className="legal-page">
      <div className="legal-page-header">
        <button className="legal-back-btn" onClick={onBack}>
          <ChevronLeftIcon /> Back to Settings
        </button>
        <h1 className="legal-page-title">Terms and Conditions</h1>
        <p className="legal-page-updated">Last updated: February 2026</p>
      </div>

      <div className="legal-page-content">
        <section className="legal-section">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using Prompted ("the Platform"), you agree to be bound by these Terms and Conditions.
            If you do not agree to these terms, please do not use the Platform. We reserve the right to modify
            these terms at any time, and your continued use of the Platform constitutes acceptance of any changes.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Description of Service</h2>
          <p>
            Prompted is a social platform designed for sharing creative projects, music, ideas, and engaging with
            a community of creators. Our services include:
          </p>
          <ul>
            <li>Creating and sharing posts, including builds and questions</li>
            <li>Joining and participating in public and private communities</li>
            <li>Following other users, categories, and AI tools</li>
            <li>Interacting through likes, comments, and bookmarks</li>
            <li>Uploading images and media content</li>
            <li>Customizing your profile with avatars, headers, and personal information</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. User Accounts</h2>
          <p>
            To access certain features of the Platform, you must create an account. You agree to:
          </p>
          <ul>
            <li>Provide accurate, current, and complete information during registration</li>
            <li>Maintain the security of your password and account</li>
            <li>Accept responsibility for all activities that occur under your account</li>
            <li>Notify us immediately of any unauthorized use of your account</li>
            <li>Not share your account credentials with others</li>
          </ul>
          <p>
            You must be at least 13 years old to create an account. If you are under 18, you represent that you
            have your parent or guardian's permission to use the Platform.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. User Content</h2>
          <p>
            You retain ownership of content you post on Prompted ("User Content"). By posting content, you grant
            us a non-exclusive, worldwide, royalty-free license to use, display, reproduce, and distribute your
            content in connection with the Platform's operation.
          </p>
          <p>You are solely responsible for your User Content and agree not to post content that:</p>
          <ul>
            <li>Infringes on intellectual property rights of others</li>
            <li>Contains illegal, harmful, threatening, abusive, or defamatory material</li>
            <li>Contains spam, malware, or deceptive content</li>
            <li>Violates the privacy rights of others</li>
            <li>Promotes violence, discrimination, or illegal activities</li>
            <li>Contains sexually explicit material or content inappropriate for minors</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. Community Guidelines</h2>
          <p>
            When participating in communities on Prompted, you agree to:
          </p>
          <ul>
            <li>Respect community-specific rules set by community creators</li>
            <li>Treat other users with respect and courtesy</li>
            <li>Not harass, bully, or intimidate other users</li>
            <li>Not share private community invite codes without permission</li>
            <li>Report violations of these terms or community rules</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>6. Intellectual Property</h2>
          <p>
            The Platform, including its design, features, and content (excluding User Content), is owned by
            Prompted and protected by copyright, trademark, and other intellectual property laws. You may not
            copy, modify, distribute, or create derivative works from any part of the Platform without our
            express written permission.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. AI Tools and Third-Party Services</h2>
          <p>
            The Platform allows users to tag and discuss AI tools used in their creative projects. We do not
            own, operate, or endorse any third-party AI tools mentioned on the Platform. Your use of such tools
            is governed by their respective terms and conditions.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your account at any time, with or without cause,
            including for violations of these Terms. You may delete your account at any time through the
            Settings menu. Upon termination, your right to use the Platform ceases immediately.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Disclaimers</h2>
          <p>
            THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT
            GUARANTEE THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE. WE ARE NOT RESPONSIBLE
            FOR USER CONTENT OR THE ACTIONS OF OTHER USERS.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, PROMPTED SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
            SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE PLATFORM.
          </p>
        </section>

        <section className="legal-section">
          <h2>11. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify users of significant changes through
            the Platform or via email. Your continued use after changes are posted constitutes acceptance of
            the revised Terms.
          </p>
        </section>

        <section className="legal-section">
          <h2>12. Contact Us</h2>
          <p>
            If you have questions about these Terms, please reach out through our community support channels
            or submit feedback through the Platform.
          </p>
        </section>
      </div>
    </div>
  );
};

// Privacy Policy Page Component
const PrivacyPage = ({ onBack }) => {
  return (
    <div className="legal-page">
      <div className="legal-page-header">
        <button className="legal-back-btn" onClick={onBack}>
          <ChevronLeftIcon /> Back to Settings
        </button>
        <h1 className="legal-page-title">Privacy Policy</h1>
        <p className="legal-page-updated">Last updated: February 2026</p>
      </div>

      <div className="legal-page-content">
        <section className="legal-section">
          <h2>1. Introduction</h2>
          <p>
            Welcome to Prompted. We are committed to protecting your privacy and ensuring you understand how
            we collect, use, and safeguard your personal information. This Privacy Policy explains our practices
            regarding the data we collect when you use our platform.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Information We Collect</h2>

          <h3>2.1 Information You Provide</h3>
          <ul>
            <li><strong>Account Information:</strong> Email address, username, display name, password, and optional profile details (bio, avatar, header image)</li>
            <li><strong>Profile Customization:</strong> Avatar images, header images, avatar emoji, name color preferences</li>
            <li><strong>User Content:</strong> Posts, comments, questions, and any media you upload</li>
            <li><strong>Community Data:</strong> Communities you create or join, community rules, and invite codes</li>
            <li><strong>Interaction Data:</strong> Likes, bookmarks, follows, and other engagement with content</li>
          </ul>

          <h3>2.2 Information Collected Automatically</h3>
          <ul>
            <li><strong>Usage Data:</strong> Pages viewed, features used, time spent on the platform</li>
            <li><strong>Device Information:</strong> Browser type, operating system, device type</li>
            <li><strong>Log Data:</strong> IP address, access times, referring URLs</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>Provide, maintain, and improve the Platform</li>
            <li>Create and manage your account</li>
            <li>Personalize your experience with recommendations and suggested content</li>
            <li>Enable social features like following, likes, and comments</li>
            <li>Display your profile to other users</li>
            <li>Send notifications about activity relevant to you</li>
            <li>Enforce our Terms and Conditions and community guidelines</li>
            <li>Detect and prevent fraud, abuse, and security issues</li>
            <li>Analyze usage patterns to improve our services</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Information Sharing</h2>

          <h3>4.1 Public Information</h3>
          <p>
            The following information is publicly visible to all users: your username, display name, avatar,
            header image, bio, posts, comments, likes count, follower/following counts, and communities you've joined (unless private).
          </p>

          <h3>4.2 We Do Not Sell Your Data</h3>
          <p>
            We do not sell, rent, or trade your personal information to third parties for marketing purposes.
          </p>

          <h3>4.3 Service Providers</h3>
          <p>
            We may share information with trusted service providers who assist in operating our platform,
            including hosting services, analytics providers, and content delivery networks. These providers
            are contractually obligated to protect your data.
          </p>

          <h3>4.4 Legal Requirements</h3>
          <p>
            We may disclose information if required by law, court order, or government request, or to protect
            the rights, property, or safety of Prompted, our users, or others.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Data Storage and Security</h2>
          <p>
            Your data is stored securely using industry-standard practices. We use Supabase for our database
            and storage infrastructure, which provides encryption at rest and in transit. However, no method
            of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Your Rights and Choices</h2>
          <p>You have the right to:</p>
          <ul>
            <li><strong>Access:</strong> View and download your personal data</li>
            <li><strong>Update:</strong> Edit your profile information at any time through Settings</li>
            <li><strong>Delete:</strong> Request deletion of your account and associated data</li>
            <li><strong>Control Visibility:</strong> Choose what information to include in your public profile</li>
            <li><strong>Manage Notifications:</strong> Control what notifications you receive</li>
            <li><strong>Unfollow:</strong> Stop following users, categories, or tools at any time</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>7. Cookies and Tracking</h2>
          <p>
            We use essential cookies and local storage to keep you logged in and remember your preferences.
            We may use analytics tools to understand how users interact with our platform. You can control
            cookie settings through your browser preferences.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Children's Privacy</h2>
          <p>
            Prompted is not intended for children under 13 years of age. We do not knowingly collect personal
            information from children under 13. If we become aware that we have collected data from a child
            under 13, we will take steps to delete that information.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. International Users</h2>
          <p>
            If you access Prompted from outside the United States, please be aware that your information may
            be transferred to, stored, and processed in the United States or other countries where our servers
            are located. By using the Platform, you consent to this transfer.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Data Retention</h2>
          <p>
            We retain your personal information for as long as your account is active or as needed to provide
            services. If you delete your account, we will delete or anonymize your data within a reasonable
            timeframe, except where retention is required by law.
          </p>
        </section>

        <section className="legal-section">
          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant changes
            through the Platform. The "Last updated" date at the top indicates when the policy was last revised.
          </p>
        </section>

        <section className="legal-section">
          <h2>12. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or our data practices, please reach out through
            our community support channels or submit feedback through the Platform.
          </p>
        </section>
      </div>
    </div>
  );
};

// Support Page Component
const SupportPage = ({ onBack }) => {
  return (
    <div className="legal-page">
      <div className="legal-page-header">
        <button className="legal-back-btn" onClick={onBack}>
          <ChevronLeftIcon /> Back
        </button>
        <h1 className="legal-page-title">Support</h1>
        <p className="legal-page-updated">Last updated: April 2026</p>
      </div>

      <div className="legal-page-content">
        <section className="legal-section">
          <h2>Contact Us</h2>
          <p>
            If you need help with your Prompted account or have questions about the platform,
            we're here to help. You can reach our support team at:
          </p>
          <ul>
            <li><strong>Email:</strong> support@prompted.so</li>
          </ul>
          <p>We aim to respond to all inquiries within 48 hours.</p>
        </section>

        <section className="legal-section">
          <h2>Account Issues</h2>
          <p>If you're having trouble with your account, here are some common solutions:</p>
          <ul>
            <li><strong>Can't log in:</strong> Try resetting your password using the "Forgot Password" option on the login screen.</li>
            <li><strong>Account locked:</strong> Contact us at support@prompted.so with your username and we'll help restore access.</li>
            <li><strong>Delete account:</strong> You can delete your account from Settings &gt; Account. This action is permanent and cannot be undone.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Content &amp; Community</h2>
          <p>
            If you encounter content that violates our community guidelines or Terms and Conditions,
            please report it using the report button on the post or comment. Our moderation team
            reviews all reports.
          </p>
          <p>
            For urgent content issues (e.g., harassment, threats, or illegal content), please email
            us directly at support@prompted.so with details and screenshots.
          </p>
        </section>

        <section className="legal-section">
          <h2>Bug Reports &amp; Feedback</h2>
          <p>
            Found a bug or have a feature suggestion? We'd love to hear from you. Send details
            to support@prompted.so, including:
          </p>
          <ul>
            <li>A description of the issue or suggestion</li>
            <li>Steps to reproduce (for bugs)</li>
            <li>Your device and browser information</li>
            <li>Screenshots, if applicable</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Platform Availability</h2>
          <p>
            Prompted is available as a web application and mobile app. We strive for 99.9% uptime,
            but occasional maintenance windows may occur. We'll notify users in advance of any
            planned downtime.
          </p>
        </section>
      </div>
    </div>
  );
};

// Copyright Page Component
const CopyrightPage = ({ onBack }) => {
  return (
    <div className="legal-page">
      <div className="legal-page-header">
        <button className="legal-back-btn" onClick={onBack}>
          <ChevronLeftIcon /> Back
        </button>
        <h1 className="legal-page-title">Copyright</h1>
        <p className="legal-page-updated">Last updated: April 2026</p>
      </div>

      <div className="legal-page-content">
        <section className="legal-section">
          <h2>Copyright Notice</h2>
          <p>
            &copy; 2025–2026 Prompted. All rights reserved.
          </p>
          <p>
            The Prompted name, logo, and all related marks, designs, and slogans are trademarks
            or registered trademarks of Prompted. You may not use these marks without our prior
            written permission.
          </p>
        </section>

        <section className="legal-section">
          <h2>Platform Content</h2>
          <p>
            All content on the Prompted platform, including but not limited to text, graphics,
            logos, icons, images, audio clips, software, and the compilation thereof, is the
            property of Prompted or its content suppliers and is protected by United States and
            international copyright laws.
          </p>
          <p>
            The design, layout, and look and feel of the Prompted platform are protected by
            trade dress, trademark, and copyright laws. Any unauthorized reproduction, modification,
            distribution, or use of the platform's proprietary elements is strictly prohibited.
          </p>
        </section>

        <section className="legal-section">
          <h2>User-Generated Content</h2>
          <p>
            Users retain copyright ownership of the content they create and post on Prompted.
            By posting content, users grant Prompted a non-exclusive, worldwide, royalty-free
            license to use, display, reproduce, and distribute that content in connection with
            operating and promoting the platform, as described in our Terms and Conditions.
          </p>
        </section>

        <section className="legal-section">
          <h2>Copyright Infringement (DMCA)</h2>
          <p>
            Prompted respects the intellectual property rights of others. If you believe that
            content on our platform infringes your copyright, please send a DMCA takedown notice
            to our designated copyright agent at:
          </p>
          <ul>
            <li><strong>Email:</strong> copyright@prompted.so</li>
          </ul>
          <p>Your notice must include:</p>
          <ul>
            <li>A description of the copyrighted work you claim has been infringed</li>
            <li>A description of where the allegedly infringing material is located on the platform</li>
            <li>Your contact information (name, address, phone number, email)</li>
            <li>A statement that you have a good-faith belief that the use is not authorized by the copyright owner</li>
            <li>A statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act on their behalf</li>
            <li>Your physical or electronic signature</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Counter-Notification</h2>
          <p>
            If you believe your content was removed due to a mistake or misidentification, you may
            submit a counter-notification to copyright@prompted.so. The counter-notification must include:
          </p>
          <ul>
            <li>Identification of the content that was removed and its former location</li>
            <li>A statement under penalty of perjury that you have a good-faith belief the content was removed by mistake</li>
            <li>Your name, address, phone number, and consent to the jurisdiction of the federal court in your district</li>
            <li>Your physical or electronic signature</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Repeat Infringers</h2>
          <p>
            Prompted will terminate the accounts of users who are determined to be repeat copyright
            infringers, in accordance with the Digital Millennium Copyright Act (DMCA) and other
            applicable laws.
          </p>
        </section>

        <section className="legal-section">
          <h2>Third-Party Content</h2>
          <p>
            Prompted may contain links to or references to third-party content, tools, and services.
            We do not claim ownership of any third-party intellectual property. All third-party
            trademarks, service marks, and logos referenced on the platform are the property of
            their respective owners.
          </p>
        </section>
      </div>
    </div>
  );
};

// ============================================
// COMMUNITY COMPONENTS
// ============================================

// Paid Community Join Modal — shows price + wallet addresses and submits a join request
const JoinPaidCommunityModal = ({ community, currentUser, onClose, onSubmitted, addToast }) => {
  const [method, setMethod] = useState('sol');
  const [note, setNote] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);

  if (!community) return null;
  const existing = community.existingRequest;
  const options = [
    community.stripe_payment_link && { id: 'stripe', label: 'Stripe (card)', value: community.stripe_payment_link, isLink: true },
    community.paypal_handle && { id: 'paypal', label: 'PayPal', value: community.paypal_handle, isLink: /^https?:\/\//i.test(community.paypal_handle) },
    community.sol_address && { id: 'sol', label: 'Solana (SOL)', value: community.sol_address },
    community.btc_address && { id: 'btc', label: 'Bitcoin (BTC)', value: community.btc_address },
    community.eth_address && { id: 'eth', label: 'Ethereum (ETH)', value: community.eth_address },
  ].filter(Boolean);

  const copyAddr = async (addr, id) => {
    try { await navigator.clipboard.writeText(addr); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch {}
  };

  const handleSubmit = async () => {
    if (!currentUser) return;
    if (method !== 'stripe' && !txHash.trim()) {
      addToast('Transaction hash is required so the owner can verify payment.', 'error');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('community_join_requests')
        .insert({
          community_id: community.id,
          user_id: currentUser.id,
          payment_method: method,
          tx_hash: txHash.trim() || null,
          payment_note: note.trim() || null,
        });
      if (error && error.code !== '23505') throw error;
      // Notify the community owner (RLS allows actor=auth.uid() != recipient)
      if (community.creator_id && community.creator_id !== currentUser.id) {
        await supabase.from('notifications').insert({
          user_id: community.creator_id,
          actor_id: currentUser.id,
          type: 'community_paid_request',
          community_id: community.id,
        });
      }
      addToast('Request submitted. The creator will approve once payment is verified.', 'success');
      onSubmitted && onSubmitted();
      onClose();
    } catch (e) {
      addToast(e.message || 'Failed to submit request', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2 className="modal-title">Join {community.name}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'rgba(99,91,255,0.08)', border: '1px solid rgba(99,91,255,0.25)', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, color: '#e6edf3', marginBottom: 4 }}>Paid community</div>
            <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>
              Monthly price: <strong>${Number(community.monthly_price_usd).toFixed(2)} USD</strong>
            </div>
            <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#94a3b8' }}>
              Send payment to one of the addresses below, then submit a request. The creator approves access once payment is confirmed.
            </div>
          </div>

          {existing?.status === 'pending' && (
            <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: '0.7rem 0.9rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#fde68a' }}>
              You already have a pending request for this community.
            </div>
          )}
          {existing?.status === 'denied' && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.7rem 0.9rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#fecaca' }}>
              Your previous request was denied. You can submit a new one.
            </div>
          )}

          {options.length === 0 ? (
            <div style={{ color: '#fca5a5', fontSize: '0.85rem' }}>The creator hasn't set up any payment methods yet.</div>
          ) : (
            <div className="form-group">
              <label className="form-label">Payment method</label>
              {options.map(a => (
                <div key={a.id} style={{ border: '1px solid #2a2f3a', borderRadius: 8, padding: '0.6rem 0.8rem', marginBottom: 8, background: method === a.id ? 'rgba(99,91,255,0.08)' : 'transparent' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem', color: '#e6edf3' }}>
                    <input type="radio" name="paymethod" checked={method === a.id} onChange={() => setMethod(a.id)} />
                    {a.label}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    {a.isLink ? (
                      <a href={a.value} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '5px 10px' }}>Open Stripe checkout ↗</a>
                    ) : (
                      <>
                        <code style={{ flex: 1, fontSize: '0.72rem', color: '#94a3b8', wordBreak: 'break-all' }}>{a.value}</code>
                        <button type="button" className="btn" style={{ fontSize: '0.72rem', padding: '4px 8px' }} onClick={() => copyAddr(a.value, a.id)}>{copied === a.id ? 'Copied' : 'Copy'}</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {method !== 'stripe' && (
            <div className="form-group">
              <label className="form-label">Transaction hash <span style={{ color: '#fca5a5', fontWeight: 400, fontSize: '0.8rem' }}>(required — used to verify your payment)</span></label>
              <input
                className="form-input"
                value={txHash}
                onChange={e => setTxHash(e.target.value)}
                placeholder="e.g. 5x9...abc"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Note to creator <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem' }}>(optional)</span></label>
            <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Anything else the creator should know" />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={loading || options.length === 0 || existing?.status === 'pending'}
              onClick={handleSubmit}
            >
              {loading ? 'Submitting...' : existing?.status === 'pending' ? 'Already pending' : 'Submit join request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Appeal Modal — denied subscriber can file an appeal with reason
const AppealModal = ({ request, currentUser, onClose, addToast }) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  if (!request) return null;
  const handleSubmit = async () => {
    if (!reason.trim()) { addToast('Please describe why you disagree with the denial', 'error'); return; }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('community_join_request_appeals')
        .insert({ request_id: request.id, user_id: currentUser.id, reason: reason.trim() });
      if (error) throw error;
      addToast('Appeal submitted. An admin will review it. Make sure your tx receipt is attached.', 'success');
      onClose();
    } catch (e) {
      addToast(e.message || 'Failed to submit appeal', 'error');
    } finally { setLoading(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2 className="modal-title">Appeal denial — {request.communityName}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {request.decision_note ? (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.7rem 0.9rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.78rem', color: '#fca5a5', marginBottom: 4, fontWeight: 600 }}>Owner's reason for denial</div>
              <div style={{ fontSize: '0.88rem', color: '#fecaca', wordBreak: 'break-all' }}>{request.decision_note}</div>
            </div>
          ) : (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.7rem 0.9rem', marginBottom: '1rem', fontSize: '0.85rem', color: '#fca5a5' }}>
              The owner denied your request without leaving a reason.
            </div>
          )}
          <div style={{ background: 'rgba(99,91,255,0.06)', border: '1px solid rgba(99,91,255,0.2)', borderRadius: 8, padding: '0.7rem 0.9rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#cbd5e1' }}>
            Explain why you believe the denial is wrong. <strong>Include your tx hash and the wallet you sent from.</strong> Without a payment receipt, admins won't be able to help.
          </div>
          <div className="form-group">
            <label className="form-label">Your explanation</label>
            <textarea className="form-input" rows={5} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. I sent 3 USDC via SOL on 2026-05-22, tx hash 5x9... from wallet ABC..." />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={loading} onClick={handleSubmit}>{loading ? 'Submitting…' : 'Submit appeal'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Creator Payments Modal — lists owner's paid communities with pending request counts
const CreatorPaymentsModal = ({ isOpen, onClose, currentUser, onManageCommunity }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentUser) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: comms } = await supabase
        .from('communities')
        .select('*')
        .eq('creator_id', currentUser.id)
        .eq('is_paid', true)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (!comms || comms.length === 0) { setItems([]); setLoading(false); return; }
      const ids = comms.map(c => c.id);
      const { data: reqs } = await supabase
        .from('community_join_requests')
        .select('community_id, status')
        .in('community_id', ids);
      const pendingByCommunity = new Map();
      (reqs || []).forEach(r => {
        if (r.status !== 'pending') return;
        pendingByCommunity.set(r.community_id, (pendingByCommunity.get(r.community_id) || 0) + 1);
      });
      setItems(comms.map(c => ({ ...c, pendingCount: pendingByCommunity.get(c.id) || 0 })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, currentUser?.id]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h2 className="modal-title">💰 Creator Payments</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Your paid communities and any pending subscriber requests. Click one to review.
          </p>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" /><p>Loading…</p></div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <p>You don't have any paid communities yet.</p>
              <p style={{ fontSize: '0.8rem', marginTop: 6 }}>Create one or open Manage on a community you own to enable paid access.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onManageCommunity(c); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 0.9rem', border: '1px solid var(--border-color)', borderRadius: 8, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {c.icon_url ? <img src={c.icon_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.3rem' }}>{c.icon || '🌟'}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      ${Number(c.monthly_price_usd || 0).toFixed(2)}/mo · {c.member_count || 0} members
                    </div>
                  </div>
                  {c.pendingCount > 0 && (
                    <span style={{ background: 'rgba(234,179,8,0.2)', border: '1px solid rgba(234,179,8,0.4)', color: '#fde68a', fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: 10 }}>
                      {c.pendingCount} pending
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Invite Code Modal Component
const InviteCodeModal = ({ isOpen, onClose, community, onJoin }) => {
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !community) return null;

  const handleSubmit = async () => {
    if (!inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }

    setLoading(true);
    setError('');

    const success = await onJoin(community.id, inviteCode.trim().toUpperCase());
    setLoading(false);

    if (success) {
      setInviteCode('');
      onClose();
    } else {
      setError('Invalid invite code. Please check and try again.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Join Private Community</h2>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>

        <div className="modal-body">
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            <strong>{community.name}</strong> is a private community. Enter the invite code to join.
          </p>

          <div className="form-group">
            <label className="form-label">Invite Code</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter invite code"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace' }}
              maxLength={8}
              autoFocus
            />
          </div>

          {error && (
            <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || !inviteCode.trim()}
          >
            {loading ? 'Joining...' : 'Join Community'}
          </button>
        </div>
      </div>
    </div>
  );
};
// ============================================
// SAVED POSTS VIEW COMPONENT
// ============================================
// Renders the user's saved prompts (the "Prompts" tab inside Saved). Each card
// shows the build's title/author with the prompt text, plus copy + remove.
const SavedPromptsList = ({ prompts, totalCount, onOpenFullPost, onUserClick, toggleSavePrompt }) => {
  const { addToast } = useToast();
  const [expanded, setExpanded] = useState({}); // postId -> bool

  const copy = (text) => {
    navigator.clipboard.writeText(text || '');
    addToast('Prompt copied!', 'success');
  };

  return (
      <div className="feed-container">
        {prompts.length > 0 ? prompts.map(post => {
          const isOpen = !!expanded[post.id];
          const text = post.prompt || '';
          const isLong = text.length > 280;
          const preview = isLong && !isOpen ? text.slice(0, 280) + '…' : text;
          return (
            <div
              key={post.id}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '1rem', marginBottom: '1rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <span
                    style={{ fontWeight: 700, color: 'var(--text-primary)', cursor: onOpenFullPost ? 'pointer' : 'default' }}
                    onClick={() => onOpenFullPost && onOpenFullPost(post)}
                  >
                    {post.title || 'Untitled build'}
                  </span>
                  <span
                    style={{ fontSize: '0.8rem', color: 'var(--text-muted)', cursor: onUserClick ? 'pointer' : 'default' }}
                    onClick={() => onUserClick && onUserClick(post.user_id)}
                  >
                    @{post.profiles?.username || post.username || 'unknown'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                  <button className="copy-prompt-btn" onClick={() => copy(text)} title="Copy prompt">
                    <CopyIcon /> Copy
                  </button>
                  <button
                    className="copy-prompt-btn"
                    onClick={() => toggleSavePrompt && toggleSavePrompt(post.id, true)}
                    title="Remove from saved prompts"
                  >
                    <BookmarkIcon filled={true} /> Remove
                  </button>
                </div>
              </div>
              <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{preview}</p>
              {isLong && (
                <button
                  className="expand-prompt-mobile"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => setExpanded(prev => ({ ...prev, [post.id]: !isOpen }))}
                >
                  {isOpen ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          );
        }) : (
          <div className="empty-state">
            <div className="empty-icon"><BookmarkIcon filled={false} /></div>
            <p className="empty-text">
              {totalCount === 0
                ? 'No saved prompts yet. Hit "Save" next to any build’s prompt to keep it here.'
                : 'No prompts match your search.'}
            </p>
          </div>
        )}
      </div>
  );
};

const SavedPostsView = ({ user, savedPosts, posts, onLike, userLikes, onCommentAdded, onUserClick, onSave, userSaves, onAuthRequired, categories = [], onDelete, onOpenFullPost = null, onQuestionClick = null, onAskQuestion = null, allPosts = [], forkedPostsMap = {}, schoolsData = [], onSchoolClick = null, onToolClick = null, builderRanks = [], userCommunities = [], onPostCommunitiesChange = null, postCommunities = {}, userCommunityIds = [], feedViewMode = 'list' }) => {
  const { savedPromptIds = [], toggleSavePrompt } = useAuth();
  const [savedFilter, setSavedFilter] = useState('builds'); // 'builds' | 'posts' | 'questions' | 'prompts'
  const [searchQuery, setSearchQuery] = useState('');
  const [promptSearchQuery, setPromptSearchQuery] = useState('');

  const savedPostsList = posts.filter(post => userSaves.includes(post.id));

  // Saved prompts: resolve the saved post ids against everything we have loaded
  // (the feed + allPosts), keeping only builds that actually carry a prompt.
  const promptPoolById = new Map();
  [...posts, ...(allPosts || [])].forEach(p => { if (p && p.id) promptPoolById.set(p.id, p); });

  // Apply search filter
  const searchFiltered = searchQuery.trim() ? savedPostsList.filter(post => {
    const q = searchQuery.toLowerCase();
    return (
      (post.title && post.title.toLowerCase().includes(q)) ||
      (post.description && post.description.toLowerCase().includes(q)) ||
      (post.profiles?.username && post.profiles.username.toLowerCase().includes(q)) ||
      (post.profiles?.display_name && post.profiles.display_name.toLowerCase().includes(q)) ||
      (post.ai_tool && post.ai_tool.toLowerCase().includes(q))
    );
  }) : savedPostsList;

  const savedBuilds = searchFiltered.filter(post => !post.is_question && post.post_type !== 'post');
  const savedCasualPosts = searchFiltered.filter(post => post.post_type === 'post');
  const savedQuestions = searchFiltered.filter(post => post.is_question);
  const filteredSavedPosts = savedFilter === 'builds' ? savedBuilds : savedFilter === 'posts' ? savedCasualPosts : savedQuestions;

  const savedPromptPosts = savedPromptIds
    .map(id => promptPoolById.get(id))
    .filter(p => p && p.prompt);
  const filteredSavedPrompts = promptSearchQuery.trim()
    ? savedPromptPosts.filter(p => {
        const q = promptSearchQuery.toLowerCase();
        return (
          (p.title && p.title.toLowerCase().includes(q)) ||
          (p.prompt && p.prompt.toLowerCase().includes(q)) ||
          (p.profiles?.username && p.profiles.username.toLowerCase().includes(q)) ||
          (p.username && p.username.toLowerCase().includes(q)) ||
          (p.ai_tool && p.ai_tool.toLowerCase().includes(q))
        );
      })
    : savedPromptPosts;

  if (!user) {
    return (
      <div className="saved-posts-tab">
        <div className="saved-posts-header">
          <BookmarkIcon filled={false} />
          <h1 className="saved-posts-title">Saved</h1>
        </div>
        <div className="login-prompt">
          <div className="login-prompt-icon"><BookmarkIcon filled={false} /></div>
          <div className="login-prompt-title">Login to Save Posts</div>
          <p className="login-prompt-text">Save your favorite builds to view them later.</p>
          <button className="btn btn-primary" onClick={onAuthRequired}>
            Login / Sign Up
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="saved-posts-tab">
      <div className="saved-posts-header">
        <BookmarkIcon filled={false} />
        <h1 className="saved-posts-title">Saved</h1>
        <span className="saved-posts-count">
          {savedFilter === 'prompts'
            ? `${savedPromptPosts.length} prompt${savedPromptPosts.length === 1 ? '' : 's'}`
            : `${savedPostsList.length} saved`}
        </span>
      </div>

      {/* Search — targets prompts or posts depending on the active tab */}
      <div className="saved-posts-search" style={{ marginBottom: '1rem' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="saved-posts-search-input"
            placeholder={savedFilter === 'prompts' ? 'Search through saved prompts' : 'Search through saved posts'}
            value={savedFilter === 'prompts' ? promptSearchQuery : searchQuery}
            onChange={(e) => (savedFilter === 'prompts' ? setPromptSearchQuery(e.target.value) : setSearchQuery(e.target.value))}
          />
          {(savedFilter === 'prompts' ? promptSearchQuery : searchQuery) && (
            <button
              className="saved-search-clear"
              onClick={() => (savedFilter === 'prompts' ? setPromptSearchQuery('') : setSearchQuery(''))}
            >
              ✕
            </button>
          )}
        </div>
        {(savedFilter === 'prompts' ? promptSearchQuery : searchQuery) && (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            {(savedFilter === 'prompts' ? filteredSavedPrompts.length : searchFiltered.length)} result{(savedFilter === 'prompts' ? filteredSavedPrompts.length : searchFiltered.length) !== 1 ? 's' : ''} found
          </div>
        )}
      </div>

      {/* All saved categories live on one row, including Prompts */}
      <div className="saved-posts-filter">
        <button
          className={`saved-filter-btn ${savedFilter === 'builds' ? 'active' : ''}`}
          onClick={() => setSavedFilter('builds')}
        >
          Builds
          <span className="filter-count">{savedBuilds.length}</span>
        </button>
        <button
          className={`saved-filter-btn ${savedFilter === 'posts' ? 'active' : ''}`}
          onClick={() => setSavedFilter('posts')}
        >
          Posts
          <span className="filter-count">{savedCasualPosts.length}</span>
        </button>
        <button
          className={`saved-filter-btn ${savedFilter === 'questions' ? 'active' : ''}`}
          onClick={() => setSavedFilter('questions')}
        >
          Questions
          <span className="filter-count">{savedQuestions.length}</span>
        </button>
        <button
          className={`saved-filter-btn ${savedFilter === 'prompts' ? 'active' : ''}`}
          onClick={() => setSavedFilter('prompts')}
        >
          Prompts
          <span className="filter-count">{savedPromptPosts.length}</span>
        </button>
      </div>

      {savedFilter === 'prompts' ? (
        <SavedPromptsList
          prompts={filteredSavedPrompts}
          totalCount={savedPromptPosts.length}
          onOpenFullPost={onOpenFullPost}
          onUserClick={onUserClick}
          toggleSavePrompt={toggleSavePrompt}
        />
      ) : (
      <div className="feed-container">
        {filteredSavedPosts.length > 0 ? (
          feedViewMode === 'grid' ? (
            <PostGrid posts={filteredSavedPosts} onOpenFullPost={onOpenFullPost} />
          ) : (
          filteredSavedPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onLike={onLike}
              userLikes={userLikes}
              onCommentAdded={onCommentAdded}
              onUserClick={onUserClick}
              onSave={onSave}
              userSaves={userSaves}
              onAuthRequired={onAuthRequired}
              categories={categories}
              onDelete={onDelete}
              onOpenFullPost={onOpenFullPost}
              onQuestionClick={onQuestionClick}
              onAskQuestion={onAskQuestion}
              allPosts={allPosts}
              forkedPostsMap={forkedPostsMap}
              schoolsData={schoolsData}
              builderRanks={builderRanks}
              onSchoolClick={onSchoolClick}
              onToolClick={onToolClick}
              userCommunities={userCommunities}
              onPostCommunitiesChange={onPostCommunitiesChange}
              postCommunities={postCommunities}
              userCommunityIds={userCommunityIds}
            />
          ))
          )
        ) : (
          <div className="empty-state">
            <div className="empty-icon"><BookmarkIcon filled={false} /></div>
            <p className="empty-text">
              {savedFilter === 'builds'
                ? 'No saved builds yet. Bookmark builds to save them here!'
                : savedFilter === 'posts'
                ? 'No saved posts yet. Bookmark posts to save them here!'
                : 'No saved questions yet. Bookmark questions to save them here!'}
            </p>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

// ============================================
// NOTIFICATION LISTENER COMPONENT
// ============================================
const NotificationListener = ({ user, setNotifications }) => {
  const { addToast } = useToast();

  useEffect(() => {
    if (!user) return;

    // If this user has opted into desktop notifications, make sure the service
    // worker is registered and their Web Push subscription is fresh in the DB.
    // No-op (and no prompt) when the feature is off. Runs per signed-in user.
    initWebPush();

    const notificationsSubscription = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          // Fetch the full notification with related data
          const { data: fullNotification, error } = await supabase
            .from('notifications')
            .select(`
              id,
              type,
              actor_id,
              post_id,
              comment_id,
              community_id,
              achievement_id,
              stream_id,
              is_read,
              created_at,
              profiles!notifications_actor_id_profiles_fkey (
                id,
                username,
                display_name,
                avatar_emoji,
                avatar_url,
                name_color
              ),
              posts!notifications_post_id_fkey (
                id,
                title
              ),
              comments!notifications_comment_id_fkey (
                id,
                content,
                post_id
              ),
              communities!notifications_community_id_fkey (
                id,
                name,
                slug
              ),
              achievement:achievements!achievement_id (
                id,
                name,
                icon,
                tier
              ),
              live_stream:live_streams!notifications_stream_id_fkey (
                id,
                title
              )
            `)
            .eq('id', payload.new.id)
            .single();

          if (error) {
            console.error('Error fetching notification:', error);
            return;
          }

          if (fullNotification) {
            // Add new notification to the beginning of the list
            setNotifications(prev => [fullNotification, ...prev]);

            // Achievement unlocks have their own celebratory in-app toast
            // rendered by AchievementsRealtimeProvider — skip the generic one.
            if (fullNotification.type === 'achievement_unlocked') {
              return;
            }

            // Show a toast for the new notification
            const actorName = fullNotification.profiles?.display_name || fullNotification.profiles?.username || 'Someone';
            let toastMessage = '';
            switch (fullNotification.type) {
              case 'follow':
                toastMessage = `${actorName} started following you`;
                break;
              case 'post_like':
                toastMessage = `${actorName} liked your post`;
                break;
              case 'comment':
                toastMessage = `${actorName} commented on your post`;
                break;
              case 'comment_like':
                toastMessage = `${actorName} liked your comment`;
                break;
              case 'community_join':
                toastMessage = `${actorName} joined your community`;
                break;
              case 'community_paid_request':
                toastMessage = `${actorName} requested to join your paid community`;
                break;
              case 'community_paid_approved':
                toastMessage = `${actorName} approved your subscription`;
                break;
              case 'community_paid_denied':
                toastMessage = `${actorName} denied your subscription request`;
                break;
              case 'linked_question':
                toastMessage = `${actorName} asked a question about your post`;
                break;
              case 'repost':
                toastMessage = `${actorName} reposted your post`;
                break;
              default:
                toastMessage = 'You have a new notification';
            }
            addToast(toastMessage, 'info');

            // Native OS / desktop notification (no-op unless the user opted in
            // and the tab is backgrounded). Reuses the toast copy verbatim and
            // carries enough data to deep-link on click.
            showDesktopNotif({
              title: 'Prompted',
              body: toastMessage,
              tag: fullNotification.id,
              data: {
                notification_id: fullNotification.id,
                type: fullNotification.type,
                post_id: fullNotification.post_id || '',
                comment_id: fullNotification.comment_id || '',
                stream_id: fullNotification.stream_id || '',
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationsSubscription);
    };
  }, [user, setNotifications, addToast]);

  return null; // This component doesn't render anything
};

// ============================================
// SEARCH PAGE COMPONENT
// ============================================
const SearchPage = ({ categories, onOpenFullPost, onUserClick, onCategoryClick, onToolClick, onAuthRequired }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('relevance');
  const [filterCategory, setFilterCategory] = useState(null);
  const [filterTool, setFilterTool] = useState(null);
  const [filterDifficulty, setFilterDifficulty] = useState(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showToolDropdown, setShowToolDropdown] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimerRef = useRef(null);
  const categoryDropdownRef = useRef(null);
  const toolDropdownRef = useRef(null);

  // Get initial query from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
      setQuery(q);
      performSearch(q, sortBy, filterCategory, filterTool, filterDifficulty);
    }
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) setShowCategoryDropdown(false);
      if (toolDropdownRef.current && !toolDropdownRef.current.contains(e.target)) setShowToolDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = async (searchQuery, sort, catFilter, toolFilter, diffFilter) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setLoading(true);
    setHasSearched(true);
    try {
      const { data, error } = await supabase.rpc('search_posts', {
        search_query: searchQuery.trim(),
        filter_category_ids: catFilter ? [catFilter] : null,
        filter_tool_ids: toolFilter ? [toolFilter] : null,
        filter_difficulty: diffFilter || null,
        sort_by: sort,
        page_limit: 30,
        page_offset: 0
      });
      if (error) {
        // Fallback to client-side search if RPC doesn't exist yet
        console.warn('search_posts RPC not available, using client-side fallback:', error.message);
        const { data: fallbackData } = await supabase
          .from('posts_with_stats')
          .select('*')
          .or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
          .neq('post_type', 'learning_submission')
        .neq('post_type', 'meme')
          .eq('moderation_status', 'approved')
          .order('created_at', { ascending: false })
          .limit(30);
        setResults(fallbackData || []);
      } else {
        setResults(data || []);
      }
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    }
    setLoading(false);
  };

  const handleQueryChange = (value) => {
    setQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      performSearch(value, sortBy, filterCategory, filterTool, filterDifficulty);
      // Update URL without reload
      const url = value.trim() ? `?q=${encodeURIComponent(value.trim())}` : window.location.pathname;
      window.history.replaceState({}, '', `/search${value.trim() ? url : ''}`);
    }, 300);
  };

  const handleSortChange = (sort) => {
    setSortBy(sort);
    if (query.trim()) performSearch(query, sort, filterCategory, filterTool, filterDifficulty);
  };

  const handleCategoryFilter = (catId) => {
    const newCat = filterCategory === catId ? null : catId;
    setFilterCategory(newCat);
    setShowCategoryDropdown(false);
    if (query.trim()) performSearch(query, sortBy, newCat, filterTool, filterDifficulty);
  };

  const handleToolFilter = (toolId) => {
    const newTool = filterTool === toolId ? null : toolId;
    setFilterTool(newTool);
    setShowToolDropdown(false);
    if (query.trim()) performSearch(query, sortBy, filterCategory, newTool, filterDifficulty);
  };

  const handleDifficultyFilter = (diff) => {
    const newDiff = filterDifficulty === diff ? null : diff;
    setFilterDifficulty(newDiff);
    if (query.trim()) performSearch(query, sortBy, filterCategory, filterTool, newDiff);
  };

  const exampleSearches = ['landing page', 'portfolio website', 'snake game', 'logo design', 'chatbot', 'mobile app'];

  return (
    <div className="search-page">
      <Helmet>
        <title>{query ? `"${query}" - Search | Prompted` : 'Search AI Builds & Prompts | Prompted'}</title>
        <meta name="description" content={query ? `Search results for "${query}" on Prompted - find AI builds, prompts, and workflows.` : 'Search thousands of AI builds and the exact prompts used to make them on Prompted.'} />
      </Helmet>
      <div className="search-hero">
        <h1>Search Builds</h1>
        <p>Find AI builds, prompts, and workflows</p>
        <div className="search-input-large">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="What do you want to build with AI?"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {/* Filters */}
      {(hasSearched || query.trim()) && (
        <div className="search-filters">
          <span className="search-filter-label">Sort:</span>
          <div className="search-filter-group">
            {['relevance', 'recent', 'popular'].map(s => (
              <button key={s} className={`search-filter-chip ${sortBy === s ? 'active' : ''}`} onClick={() => handleSortChange(s)}>
                {s === 'relevance' ? 'Relevant' : s === 'recent' ? 'Recent' : 'Popular'}
              </button>
            ))}
          </div>

          <span className="search-filter-label" style={{ marginLeft: '0.5rem' }}>Filter:</span>

          <div className="search-filter-dropdown" ref={categoryDropdownRef}>
            <button
              className={`search-filter-chip ${filterCategory ? 'active' : ''}`}
              onClick={() => { setShowCategoryDropdown(!showCategoryDropdown); setShowToolDropdown(false); }}
            >
              {filterCategory ? categories.find(c => c.id === filterCategory)?.name || 'Category' : 'Category'} ▾
            </button>
            {showCategoryDropdown && (
              <div className="search-filter-dropdown-menu">
                <button className={`search-filter-dropdown-item ${!filterCategory ? 'active' : ''}`} onClick={() => handleCategoryFilter(null)}>All Categories</button>
                {categories.map(cat => (
                  <button key={cat.id} className={`search-filter-dropdown-item ${filterCategory === cat.id ? 'active' : ''}`} onClick={() => handleCategoryFilter(cat.id)}>
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="search-filter-dropdown" ref={toolDropdownRef}>
            <button
              className={`search-filter-chip ${filterTool ? 'active' : ''}`}
              onClick={() => { setShowToolDropdown(!showToolDropdown); setShowCategoryDropdown(false); }}
            >
              {filterTool ? getToolDisplayName(filterTool) : 'AI Tool'} ▾
            </button>
            {showToolDropdown && (
              <div className="search-filter-dropdown-menu">
                <button className={`search-filter-dropdown-item ${!filterTool ? 'active' : ''}`} onClick={() => handleToolFilter(null)}>All Tools</button>
                {AI_TOOL_NAMES.slice(0, 20).map(tool => {
                  const id = tool.toLowerCase().replace(/\s+/g, '-');
                  return (
                    <button key={id} className={`search-filter-dropdown-item ${filterTool === id ? 'active' : ''}`} onClick={() => handleToolFilter(id)}>
                      {tool}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {['beginner', 'advanced'].map(d => (
            <button key={d} className={`search-filter-chip ${filterDifficulty === d ? 'active' : ''}`} onClick={() => handleDifficultyFilter(d)}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="search-loading"><div className="spinner"></div></div>
      ) : hasSearched && results.length > 0 ? (
        (() => {
          const getPostType = (post) => {
            if (post.is_question) return 'question';
            if (post.post_type === 'post') return 'post';
            return 'build';
          };
          const builds = results.filter(p => getPostType(p) === 'build');
          const posts = results.filter(p => getPostType(p) === 'post');
          const questions = results.filter(p => getPostType(p) === 'question');
          const sections = [
            { label: 'Builds', items: builds },
            { label: 'Posts', items: posts },
            { label: 'Questions', items: questions },
          ].filter(s => s.items.length > 0);

          const renderResultCard = (post) => {
            const cat = categories.find(c => c.id === post.category_id);
            return (
              <div key={post.id} className="search-result-card" onClick={() => {
                // Navigate immediately using search result data, mapping like_count -> likes_count for FullPostView
                onOpenFullPost({
                  ...post,
                  likes_count: post.like_count != null ? Number(post.like_count) : (post.likes_count || 0),
                  comments_count: post.comment_count != null ? post.comment_count : (post.comments_count || 0),
                  profiles: { id: post.user_id, username: post.username, display_name: post.display_name, avatar_emoji: post.avatar_emoji, avatar_url: post.avatar_url, name_color: post.name_color },
                });
              }}>
                {post.images && post.images[0] && (
                  <img className="search-result-image" src={post.images[0]} alt={post.title} loading="lazy" />
                )}
                <div className="search-result-content">
                  <div className="search-result-title">{post.title}</div>
                  {post.prompt && <div className="search-result-prompt">{post.prompt.slice(0, 150)}</div>}
                  <div className="search-result-meta">
                    <div className="search-result-user">
                      <div className="search-result-user-avatar">
                        {post.avatar_url ? <img src={post.avatar_url} alt="" /> : <span style={{ fontSize: '0.6rem' }}>{post.avatar_emoji || '👤'}</span>}
                      </div>
                      <span className="search-result-meta-item" style={post.name_color ? { color: post.name_color } : {}}>
                        {post.display_name || post.username}
                      </span>
                    </div>
                    {post.ai_tool && <span className="search-result-tool-badge">{post.ai_tool.split(',')[0].trim()}</span>}
                    {cat && <span className="search-result-category-badge">{cat.icon} {cat.name}</span>}
                    {post.difficulty && <span className={`difficulty-badge ${post.difficulty}`}>{post.difficulty}</span>}
                    <span className="search-result-meta-item">
                      <HeartIcon filled={false} /> {post.like_count || post.likes_count || 0}
                    </span>
                    <span className="search-result-meta-item">
                      <CommentIcon /> {post.comment_count || 0}
                    </span>
                    {(post.view_count > 0) && (
                      <span className="search-result-meta-item">
                        <EyeIcon /> {post.view_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          };

          return (
            <>
              <div className="search-results-count">{results.length} result{results.length !== 1 ? 's' : ''} found</div>
              {sections.map(section => (
                <div key={section.label} className="search-results-section">
                  <h3 className="search-results-section-title">{section.label} ({section.items.length})</h3>
                  <div className="search-results-list">
                    {section.items.map(renderResultCard)}
                  </div>
                </div>
              ))}
            </>
          );
        })()
      ) : hasSearched ? (
        <div className="search-empty-state">
          <h3>No results found for "{query}"</h3>
          <p>Try different keywords or browse categories below</p>
          <div className="search-suggestion-chips">
            {categories.slice(0, 8).map(cat => (
              <button key={cat.id} className="search-suggestion-chip" onClick={() => {
                if (onCategoryClick) onCategoryClick(cat.id);
              }}>
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="search-empty-state">
          <p>Try searching for something, or explore these popular topics:</p>
          <div className="search-suggestion-chips">
            {exampleSearches.map(term => (
              <button key={term} className="search-suggestion-chip" onClick={() => handleQueryChange(term)}>
                {term}
              </button>
            ))}
          </div>
          <div style={{ marginTop: '1.5rem' }}>
            <div className="search-suggestion-chips">
              {categories.slice(0, 8).map(cat => (
                <button key={cat.id} className="search-suggestion-chip" onClick={() => {
                  if (onCategoryClick) onCategoryClick(cat.id);
                }}>
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ============================================
// MESSAGES — DM and group chat MVP
// ============================================

// Hook: total unread DM/group conversations for the signed-in user.
// "Unread" = the conversation's last_message_at is newer than the participant's
// last_read_at AND the latest message wasn't sent by the user themselves.
const useUnreadConversationCount = (userId) => {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) { setCount(0); return; }
    const { data, error } = await supabase
      .from('conversation_participants')
      .select('conversation_id, last_read_at, conversations!inner(last_message_at)')
      .eq('user_id', userId);
    if (error || !data) return;
    let unread = 0;
    for (const row of data) {
      const lastMsgAt = row.conversations?.last_message_at;
      if (lastMsgAt && new Date(lastMsgAt).getTime() > new Date(row.last_read_at).getTime()) {
        unread += 1;
      }
    }
    setCount(unread);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return undefined;
    // Re-check on any new message in any conversation the user is in.
    // RLS scopes the SELECT to messages the user can see, but realtime payloads
    // for INSERTs still arrive globally on the `messages` table — so we filter
    // client-side and just call refresh() (which respects RLS) to update.
    const channel = supabase
      .channel(`unread-msgs-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${userId}` }, () => refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${userId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refresh]);

  return { count, refresh };
};

// ============================================
// MAIN APP COMPONENT
// ============================================
function VibeShareAppInner() {
  const { addToast } = useToast();
  // Easter egg: flip "devmouse" upside down anywhere it appears (Minecraft "Grumm").
  useEffect(() => {
    const TARGET = /devmouse/i;
    const flipInNode = (root) => {
      if (!root || root.nodeType !== 1) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement && !n.parentElement.classList.contains('grumm-flip') && TARGET.test(n.nodeValue))
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
      });
      const hits = [];
      let n;
      while ((n = walker.nextNode())) hits.push(n);
      for (const tn of hits) {
        const parent = tn.parentElement;
        if (!parent) continue;
        const parts = tn.nodeValue.split(/(devmouse)/gi);
        const frag = document.createDocumentFragment();
        for (const p of parts) {
          if (/^devmouse$/i.test(p)) {
            const s = document.createElement('span');
            s.className = 'grumm-flip';
            s.textContent = p;
            frag.appendChild(s);
          } else if (p) {
            frag.appendChild(document.createTextNode(p));
          }
        }
        parent.replaceChild(frag, tn);
      }
    };
    flipInNode(document.body);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) flipInNode(node);
        if (m.type === 'characterData') flipInNode(m.target.parentElement);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, []);

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  // Flips true once the initial Supabase session check resolves. Used to avoid
  // acting on a not-yet-known auth state (e.g. bouncing admins off the Lounge
  // before getSession has confirmed who they are).
  const [authResolved, setAuthResolved] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(null); // null = loading, true/false
  const [posts, setPosts] = useState([]);
  const [buildPosts, setBuildPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('foryou'); // 'foryou', 'explore', 'accounts', 'saved', 'settings', 'trending', 'messages'
  const [messagesInitialConv, setMessagesInitialConv] = useState(null);
  // Daily Builder Points reward (gift button in the header)
  const [showDailyReward, setShowDailyReward] = useState(false);
  const [dailyRewardClaimable, setDailyRewardClaimable] = useState(false);
  const { count: unreadDmCount, refresh: refreshUnreadDm } = useUnreadConversationCount(user?.id);
  // Sticky home-feed tabs. 'foryou' / 'following' are scopes (chronological);
  // 'top' / 'unliked' / 'random' are sort modes applied to the same data.
  // 'notifications' is the in-feed notifications view. Persisted across reloads.
  const [feedSubTab, setFeedSubTab] = useState(() => {
    if (typeof localStorage === 'undefined') return 'foryou';
    const saved = localStorage.getItem('feedSubTab:home');
    return ['foryou', 'following', 'top', 'unliked', 'random'].includes(saved) ? saved : 'foryou';
  });
  useEffect(() => {
    if (typeof localStorage !== 'undefined' && feedSubTab !== 'notifications') {
      localStorage.setItem('feedSubTab:home', feedSubTab);
    }
  }, [feedSubTab]);
  const [feedViewMode, setFeedViewMode] = useState(() => {
    if (typeof localStorage === 'undefined') return 'list';
    const saved = localStorage.getItem('feedViewMode');
    return saved === 'grid' ? 'grid' : 'list';
  });
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('feedViewMode', feedViewMode);
    }
  }, [feedViewMode]);
  const [rememberPostBoxTheme, setRememberPostBoxTheme] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('postBoxThemeRemember') === '1';
  });
  const [postBoxTheme, setPostBoxTheme] = useState(() => {
    if (typeof localStorage === 'undefined') return 'prompted';
    const remember = localStorage.getItem('postBoxThemeRemember') === '1';
    if (!remember) return 'prompted';
    const saved = localStorage.getItem('postBoxTheme');
    return ['prompted', 'mac', 'windows', 'linux', 'retro'].includes(saved) ? saved : 'prompted';
  });
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('postBoxTheme', postBoxTheme);
    }
  }, [postBoxTheme]);
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('postBoxThemeRemember', rememberPostBoxTheme ? '1' : '0');
    }
  }, [rememberPostBoxTheme]);
  const [homeContentTab, setHomeContentTab] = useState('builds'); // 'posts' | 'builds'
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTag, setActiveTag] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [creatorSearch, setCreatorSearch] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createInitialDraft, setCreateInitialDraft] = useState('');
  const [createDefaultPostType, setCreateDefaultPostType] = useState(null);
  const [createRepostSource, setCreateRepostSource] = useState(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  // Logged-out landing page gate. Only shown at root (/) — deep links like
  // /post/:id, /category/:slug, /@user, etc. bypass the landing so shared
  // links still resolve. State is intentionally in-memory only so that a
  // refresh returns guests to the landing page until they sign up or log in.
  const [landingDismissed, setLandingDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Local dev: skip the landing page entirely so we can iterate on the
    // logged-in feed UI without auth getting in the way (Supabase OAuth
    // redirects to the prod Site URL, which kicks us off localhost).
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return true;
    const path = window.location.pathname;
    if (path && path !== '/' && path !== '') return true;
    return false;
  });
  const [userLikes, setUserLikes] = useState([]);
  const [userSaves, setUserSaves] = useState([]);
  const [userSavedPrompts, setUserSavedPrompts] = useState([]);
  const [userFollows, setUserFollows] = useState([]);
  const [stats, setStats] = useState({ posts: 0, users: 0 });
  const [creators, setCreators] = useState([]);
  const [viewingUserId, setViewingUserId] = useState(null);
  // When the feed live banner is tapped, stash the stream id so the Zoe tab opens it directly.
  const [zoeOpenStreamId, setZoeOpenStreamId] = useState(null);
  const [previousActiveTab, setPreviousActiveTab] = useState(null);
  const [profileScrollToPostId, setProfileScrollToPostId] = useState(null);
  const [profileInitialTab, setProfileInitialTab] = useState(null);
  const [scrolledPastHero, setScrolledPastHero] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false); // swipe-left quick-actions drawer
  const [lastFeedRefreshTime, setLastFeedRefreshTime] = useState(Date.now());
  const [forkedPostsMap, setForkedPostsMap] = useState({}); // Map of post ID -> original post data for forked posts

  // Android Back (hardware button AND the left-edge swipe gesture, which the OS
  // delivers as Back): instead of letting it exit the app, route it through the
  // UI. Reads the latest state from backStateRef (assigned each render below) so
  // a single stable listener never goes stale. See the backButton effect later.
  const backStateRef = useRef(null);

  // Communities state
  const [communities, setCommunities] = useState([]);
  const [userCommunities, setUserCommunities] = useState([]);
  const [activeCommunity, setActiveCommunity] = useState(null);
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityPostSort, setCommunityPostSort] = useState('new');
  const [showCreateCommunityModal, setShowCreateCommunityModal] = useState(false);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [preSelectedCommunityId, setPreSelectedCommunityId] = useState(null);
  const [showInviteCodeModal, setShowInviteCodeModal] = useState(false);
  const userCommunityIds = userCommunities.map(c => c.id);
  const [inviteCodeCommunity, setInviteCodeCommunity] = useState(null);
  const [paidJoinCommunity, setPaidJoinCommunity] = useState(null);
  const [appealRequest, setAppealRequest] = useState(null);
  const [showCreatorPaymentsModal, setShowCreatorPaymentsModal] = useState(false);
  const [pendingPaidRequestCount, setPendingPaidRequestCount] = useState(0);
  const [paidRefreshTick, setPaidRefreshTick] = useState(0);

  useEffect(() => {
    const bump = () => setPaidRefreshTick(t => t + 1);
    window.addEventListener('paid-request-decided', bump);
    return () => window.removeEventListener('paid-request-decided', bump);
  }, []);

  useEffect(() => {
    if (!user) { setPendingPaidRequestCount(0); return; }
    let cancelled = false;
    (async () => {
      const { data: comms } = await supabase
        .from('communities')
        .select('id')
        .eq('creator_id', user.id)
        .eq('is_paid', true);
      if (cancelled) return;
      if (!comms || comms.length === 0) { setPendingPaidRequestCount(0); return; }
      const { count } = await supabase
        .from('community_join_requests')
        .select('id', { count: 'exact', head: true })
        .in('community_id', comms.map(c => c.id))
        .eq('status', 'pending');
      if (!cancelled) setPendingPaidRequestCount(count || 0);
    })();
    return () => { cancelled = true; };
  }, [user?.id, showCreatorPaymentsModal, paidRefreshTick]);
  const [showEditCommunityModal, setShowEditCommunityModal] = useState(false);
  // Community share-link flow: when a user arrives via /community/:slug while logged out,
  // we hold the target community here until they finish signing up / logging in.
  const [pendingShareCommunity, setPendingShareCommunity] = useState(null);
  const [communityRules, setCommunityRules] = useState([]);

  // Followed categories state
  const [userFollowedCategories, setUserFollowedCategories] = useState([]);

  // Schools state
  const [schoolLeaderboard, setSchoolLeaderboard] = useState([]);
  const [viewingSchoolSlug, setViewingSchoolSlug] = useState(null);
  const [schoolDetails, setSchoolDetails] = useState(null);
  const [schoolTopCreators, setSchoolTopCreators] = useState([]);
  const [schoolPosts, setSchoolPosts] = useState([]);
  const [schoolPostsLoading, setSchoolPostsLoading] = useState(false);
  const [userSchool, setUserSchool] = useState(null);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('');
  const [viewingSchoolTab, setViewingSchoolTab] = useState('trending'); // 'trending' | 'recent' | 'creators'
  const [schoolTrendingPosts, setSchoolTrendingPosts] = useState([]);
  const [schoolTrendingLoading, setSchoolTrendingLoading] = useState(false);
  const [schoolLeaderboardView, setSchoolLeaderboardView] = useState(false); // standalone leaderboard
  const [leaderboardSortBy, setLeaderboardSortBy] = useState('total_likes'); // 'total_likes' | 'post_count' | 'member_count' | 'active_creators'
  const [userSchoolsCache, setUserSchoolsCache] = useState({}); // cache userId -> school data
  // Bulk map of user_id -> school_id used as a fallback for post.school_id.
  // posts_with_stats doesn't include the school join, so the badge wouldn't
  // appear anywhere except tool pages (which hit an RPC that includes it).
  // Loading the whole user_schools table once and using it as a render-time
  // fallback gets the badge to show on all posts.
  const [userSchoolIdMap, setUserSchoolIdMap] = useState({});
  const [showSchoolMembersModal, setShowSchoolMembersModal] = useState(false);
  const [schoolMembers, setSchoolMembers] = useState([]);
  const [schoolMembersLoading, setSchoolMembersLoading] = useState(false);

  // Builder Rank state
  const [builderRanks, setBuilderRanks] = useState([]);
  const [builderLeaderboard, setBuilderLeaderboard] = useState([]);
  const [builderLeaderboardLoading, setBuilderLeaderboardLoading] = useState(false);
  const [showRanksPage, setShowRanksPage] = useState(false);

  // Achievements view state
  const [viewingAchievementsUserId, setViewingAchievementsUserId] = useState(null);
  const [achievementHighlightId, setAchievementHighlightId] = useState(null);
  // Weekly Social Media Report — read-only report id when opened via ?id= link.
  const [weeklyReportId, setWeeklyReportId] = useState(null);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  // Notifications view mode: 'list' (default) | 'grid' | 'bubble' | 'matrix'
  const [notifViewMode, setNotifViewMode] = useState('list');
  // Admin-only: panel listing the daily claims this admin has approved.
  const [showApprovedClaims, setShowApprovedClaims] = useState(false);
  const [approvedClaims, setApprovedClaims] = useState([]);
  const [approvedClaimsLoading, setApprovedClaimsLoading] = useState(false);

  // Post-community mappings state
  const [postCommunities, setPostCommunities] = useState({});

  const handlePostCommunitiesChange = useCallback((postId, updatedCommunities) => {
    setPostCommunities(prev => ({ ...prev, [postId]: updatedCommunities }));
  }, []);

  // Category view state
  const [viewingCategoryId, _setViewingCategoryId] = useState(null);
  const [categoryViewTab, setCategoryViewTab] = useState('most-liked'); // 'most-liked' or 'most-recent'
  const [categoryPosts, setCategoryPosts] = useState([]);
  const [categoryPostsLoading, setCategoryPostsLoading] = useState(false);
  // Tracks where the user came from when opening a category (e.g. a profile),
  // so the category page's back button can return them there instead of always
  // dumping them on Explore.
  const [categoryNavigationOrigin, setCategoryNavigationOrigin] = useState(null);

  // Wrapper that syncs URL with category selection
  const setViewingCategoryId = (categoryId, categorySlug = null) => {
    // Any direct category navigation (feed, search, in-category switches)
    // clears the saved origin; navigateToCategory re-sets it immediately after.
    setCategoryNavigationOrigin(null);
    _setViewingCategoryId(categoryId);
    if (categoryId) {
      // Use provided slug or find category name to create slug
      const slug = categorySlug || categories.find(c => c.id === categoryId)?.name?.toLowerCase().replace(/\s+/g, '-') || categoryId;
      window.history.pushState({ categoryId }, '', `/category/${slug}`);
    } else {
      // Only push state if we're on a /category/ URL (going back to home)
      if (window.location.pathname.startsWith('/category/')) {
        window.history.pushState({}, '', '/');
      }
    }
  };

  // Explore search state
  const [exploreSearchQuery, setExploreSearchQuery] = useState('');
  const [exploreSearchFocused, setExploreSearchFocused] = useState(false);
  const [exploreSubView, setExploreSubView] = useState(null); // 'allCategories' | 'allTools' | 'toolDetail' | null
  const [toolNavigatedFromAllTools, setToolNavigatedFromAllTools] = useState(false);
  const [toolNavigationOrigin, setToolNavigationOrigin] = useState(null); // tracks where user came from when clicking a tool
  const [viewingToolName, setViewingToolName] = useState(null);
  const [viewingToolId, setViewingToolId] = useState(null);
  // When the user opens the Arena from a tool page, pre-focus that tool and
  // (optionally) scroll to a specific category card once the Arena mounts.
  const [arenaInitialFocusedTool, setArenaInitialFocusedTool] = useState(null);
  const [arenaInitialJumpCategoryId, setArenaInitialJumpCategoryId] = useState(null);
  const [toolViewTab, setToolViewTab] = useState('trending');
  const [toolSearchQuery, setToolSearchQuery] = useState('');
  const [toolSearchResults, setToolSearchResults] = useState([]);
  const [toolSearchLoading, setToolSearchLoading] = useState(false);
  const [selectedToolModelFilter, setSelectedToolModelFilter] = useState('');
  const debouncedToolQuery = useDebounce(toolSearchQuery, 300);
  const [toolPosts, setToolPosts] = useState([]);
  const [toolPostsLoading, setToolPostsLoading] = useState(false);
  const [exploreRandomPosts, setExploreRandomPosts] = useState([]);
  const [loadingMoreExplorePosts, setLoadingMoreExplorePosts] = useState(false);
  const [exploreRandomOffset, setExploreRandomOffset] = useState(0);
  const [exploreScrollPosition, setExploreScrollPosition] = useState(0);

  // Unified explore search results state
  const [exploreSearchActive, setExploreSearchActive] = useState(false); // true when showing search results
  const [exploreSearchResults, setExploreSearchResults] = useState({ posts: [], builds: [], questions: [], communities: [], users: [], tools: [], categories: [] });
  const [exploreSearchLoading, setExploreSearchLoading] = useState(false);
  const exploreSearchTimerRef = useRef(null);
  // Debounced explore search for live dropdown preview
  const debouncedExploreQuery = useDebounce(exploreSearchQuery, 300);
  const [exploreDropdownResults, setExploreDropdownResults] = useState({ posts: [], builds: [], questions: [], communities: [], users: [] });
  const [exploreDropdownLoading, setExploreDropdownLoading] = useState(false);

  // All users state (for search)
  const [allUsers, setAllUsers] = useState([]);

  // My Profile state
  const [myProfileFollowerCount, setMyProfileFollowerCount] = useState(0);
  const [myProfileFollowingCount, setMyProfileFollowingCount] = useState(0);
  const [myProfileShowFollowModal, setMyProfileShowFollowModal] = useState(null); // 'followers' or 'following'
  const [myProfileFollowList, setMyProfileFollowList] = useState([]);
  const [myProfileLoadingFollowList, setMyProfileLoadingFollowList] = useState(false);
  const [myProfileFollowSearchQuery, setMyProfileFollowSearchQuery] = useState('');
  const [myProfileAvatarLightbox, setMyProfileAvatarLightbox] = useState(null);
  const [myProfileBannerLightbox, setMyProfileBannerLightbox] = useState(null);
  const [myProfileSortFilter, setMyProfileSortFilter] = useState('recent'); // 'recent' or 'liked'
  const [myProfilePostsTab, setMyProfilePostsTab] = useState('builds'); // 'builds', 'questions', or 'communities'
  // myProfileViewMode replaced by global feedViewMode
  const [showAllProfileTools, setShowAllProfileTools] = useState(false);
  const [showAllProfileCats, setShowAllProfileCats] = useState(false);
  const [myProfilePinnedIds, setMyProfilePinnedIds] = useState([]);
  const [myProfileOwnedCommunities, setMyProfileOwnedCommunities] = useState([]);
  const [myProfilePosts, setMyProfilePosts] = useState([]);
  const [myProfilePostsLoading, setMyProfilePostsLoading] = useState(false);

  // Questions state
  const [questionsSearchQuery, setQuestionsSearchQuery] = useState('');
  const [questionsSearchFocused, setQuestionsSearchFocused] = useState(false);
  const [questionsSortBy, setQuestionsSortBy] = useState('recent'); // 'recent', 'most-answers', 'unanswered'
  const [questionsShowRelated, setQuestionsShowRelated] = useState(false); // Show related posts from search
  const [defaultIsQuestion, setDefaultIsQuestion] = useState(false);
  const [askAboutPostId, setAskAboutPostId] = useState(null); // ID of post to ask a question about
  const [scrollToQuestionId, setScrollToQuestionId] = useState(null); // ID of question to scroll to when navigating to questions tab

  // Global search state
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState({ posts: [], builds: [], questions: [], communities: [], users: [] });
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const globalSearchRef = useRef(null);
  const debouncedGlobalQuery = useDebounce(globalSearchQuery, 300);

  // Search page state
  const [showSearchPage, setShowSearchPage] = useState(false);
  const [searchPageQuery, setSearchPageQuery] = useState('');

  // View tracking state (debounce per post)
  const viewedPostsRef = useRef(new Set());

  // Workflow state
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  // Agent Posting (MCP): /review/:id loads an agent draft for review + publish.
  const [reviewDraftId, setReviewDraftId] = useState(null);
  // Agent Posting (MCP): "Drafts" overlay listing the user's pending drafts.
  const [showDraftsList, setShowDraftsList] = useState(false);
  const [exploreWorkflows, setExploreWorkflows] = useState([]);
  const [exploreWorkflowsLoading, setExploreWorkflowsLoading] = useState(false);
  const [userWorkflowLikes, setUserWorkflowLikes] = useState([]);
  const [userWorkflowSaves, setUserWorkflowSaves] = useState([]);
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);
  const [profileWorkflows, setProfileWorkflows] = useState([]);
  const [profileWorkflowsLoading, setProfileWorkflowsLoading] = useState(false);
  const [myProfileWorkflows, setMyProfileWorkflows] = useState([]);

  // Full post view state
  const [selectedFullPost, _setSelectedFullPost] = useState(null);

  // Wrapper that syncs URL with post selection
  const setSelectedFullPost = (post) => {
    _setSelectedFullPost(post);
    if (post && post.id) {
      const postUrl = buildPostPath(post);
      window.history.pushState({ postId: post.id }, '', postUrl);
      // Update OG meta tags dynamically for client-side sharing
      const title = post.title || 'Post on Prompted';
      const desc = post.description || post.prompt || 'Check out this post on Prompted';
      const image = (post.images && post.images.length > 0) ? post.images[0] : 'https://prmpted.com/og-image.png';
      document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
      document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc);
      document.querySelector('meta[property="og:image"]')?.setAttribute('content', image);
      document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
      document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', desc);
      document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', image);
    } else {
      // Only push state if we're on a /post/ URL (going back to home)
      if (window.location.pathname.startsWith('/post/') || window.location.pathname.match(/^\/[^/]+\/post\//)) {
        window.history.pushState({}, '', '/');
      }
      // Reset meta tags
      document.querySelector('meta[property="og:title"]')?.setAttribute('content', 'Prompted — Stay Current on Everything Happening in AI');
      document.querySelector('meta[property="og:description"]')?.setAttribute('content', 'See what tools people are using, the prompts that actually get results, and how to apply AI to your own work. Updated daily by the community.');
      document.querySelector('meta[property="og:image"]')?.setAttribute('content', 'https://prmpted.com/og-image.png');
      document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', 'Prompted — Stay Current on Everything Happening in AI');
      document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', 'See what tools people are using, the prompts that actually get results, and how to apply AI to your own work. Updated daily by the community.');
      document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', 'https://prmpted.com/og-image.png');
    }
  };

  // Keep the latest state available to the stable Android Back listener.
  backStateRef.current = {
    sidebarOpen, setSidebarOpen,
    rightSidebarOpen, setRightSidebarOpen,
    activeTab, setActiveTab,
    viewingUserId, setViewingUserId,
    selectedFullPost, setSelectedFullPost,
    showCreateModal, setShowCreateModal,
    showSettingsModal, setShowSettingsModal,
    showAuthModal, setShowAuthModal,
  };

  // Android hardware/gesture Back handler. On gesture-nav phones (Pixel), the
  // left-edge swipe-right IS the system Back, so this is what fires when the
  // user "swipes right." Priority, top-most layer first: close an open modal →
  // close the full-post view → close the drawer → exit a profile → drop a
  // sub-tab back to Home → and finally, on Home with nothing open, OPEN the
  // tabs drawer (what the user is reaching for) instead of closing the app.
  // A single stable listener (empty deps) reading backStateRef avoids both
  // stale closures and the listener-leak race of re-binding on every change.
  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let handle;
    let removed = false;
    import('@capacitor/app').then(async ({ App }) => {
      handle = await App.addListener('backButton', () => {
        const s = backStateRef.current;
        if (!s) return;
        if (s.showCreateModal) { s.setShowCreateModal(false); return; }
        if (s.showSettingsModal) { s.setShowSettingsModal(false); return; }
        if (s.showAuthModal) { s.setShowAuthModal(false); return; }
        if (s.selectedFullPost) { s.setSelectedFullPost(null); return; }
        if (s.rightSidebarOpen) { s.setRightSidebarOpen(false); return; }
        if (s.sidebarOpen) { s.setSidebarOpen(false); return; }
        if (s.viewingUserId) { s.setViewingUserId(null); return; }
        if (s.activeTab !== 'foryou') { s.setActiveTab('foryou'); return; }
        s.setSidebarOpen(true);
      });
      if (removed) handle.remove();
    });
    return () => { removed = true; if (handle) handle.remove(); };
  }, []);

  // Mid-screen horizontal swipes open the drawers. The screen EDGES are left
  // alone (that's Android's system Back gesture), so we only act on swipes that
  // start away from both edges: swipe right → tabs drawer, swipe left →
  // quick-actions drawer. Swiping the opposite way closes an open drawer.
  useEffect(() => {
    if (typeof window === 'undefined' || !isNativeApp()) return undefined;
    let x0 = 0, y0 = 0, ok = false;
    const EDGE = 40;   // keep clear of the system Back gesture zones
    const DIST = 70;   // horizontal travel needed to trigger
    // A swipe that starts inside a horizontally-scrollable element (e.g. the Pro
    // tab's feature cards) is a scroll, not a drawer gesture — walk up and bail.
    const isInHorizontalScroller = (el) => {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        if (node.scrollWidth > node.clientWidth + 4) {
          const ox = getComputedStyle(node).overflowX;
          if (ox === 'auto' || ox === 'scroll') return true;
        }
      }
      return false;
    };
    const onStart = (e) => {
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY;
      ok = x0 > EDGE && x0 < window.innerWidth - EDGE;
      // Don't hijack touches on editable fields (the composer textarea drags the
      // page otherwise), opt-out zones, or horizontal scrollers.
      if (ok && e.target && e.target.closest) {
        if (e.target.closest('input, textarea, select, [contenteditable="true"], .no-drawer-swipe, [data-no-swipe]')) ok = false;
        else if (isInHorizontalScroller(e.target)) ok = false;
      }
    };
    const onEnd = (e) => {
      if (!ok) return;
      ok = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < DIST || Math.abs(dx) < Math.abs(dy) * 1.8) return; // deliberate horizontal only
      const s = backStateRef.current;
      if (!s) return;
      if (dx < 0) {
        if (s.sidebarOpen) s.setSidebarOpen(false);
        else s.setRightSidebarOpen(true);
      } else {
        if (s.rightSidebarOpen) s.setRightSidebarOpen(false);
        else s.setSidebarOpen(true);
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, []);

  // While a drawer is open, lock the feed so it can't scroll behind the overlay.
  // The document element (<html>) is the real scroll container on mobile, so
  // lock it as well as <body>.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const locked = sidebarOpen || rightSidebarOpen;
    document.documentElement.classList.toggle('drawer-locked', locked);
    document.body.classList.toggle('drawer-locked', locked);
    return () => {
      document.documentElement.classList.remove('drawer-locked');
      document.body.classList.remove('drawer-locked');
    };
  }, [sidebarOpen, rightSidebarOpen]);

  // Open a post in the full-post view by id alone. Sidebar mini-cards only
  // carry the id, and the post may not be in the loaded feed (e.g. community
  // top builds) — fall back to fetching it, same as the /post/:id URL path.
  const openPostById = async (postId) => {
    const existing = posts.find(p => p.id === postId);
    if (existing) {
      setSelectedFullPost(existing);
      return;
    }
    const { data: post } = await supabase
      .from('posts_with_stats')
      .select('*')
      .eq('id', postId)
      .single();
    if (post) setSelectedFullPost(post);
  };

  // Highlighted post for trending/recommended navigation (post to show at top)
  const [highlightedPostId, setHighlightedPostId] = useState(null);

  // Mobile header show/hide on scroll
  // The mobile header (profile pic + Builds/Discussion/Questions tabs) is now
  // pinned at all times — it no longer auto-hides on scroll-down, so the tabs
  // stay reachable whether you're scrolling up or down. mobileHeaderHidden is
  // kept (always false) so the header's className logic below is unchanged.
  const [mobileHeaderHidden] = useState(false);

  useEffect(() => {
    // Load the custom-badge display map once at startup so badges render
    // synchronously across the app. Refreshed when a user changes their badge.
    if (!badgesLoaded()) loadDisplayedBadges();
  }, []);

  // Admin tooling has moved out of the web app into an offline HTML console
  // (Desktop/prompted admin_v1.html). isPlatformAdmin is still used below for
  // ad gating and other admin-only affordances.
  const isPlatformAdmin = !!profile?.is_admin || ADMIN_USERNAMES.includes(profile?.username);

  // Lounge (memes tab) is hidden for everyone for now (see canSeeLounge). Bounce
  // anyone who lands on it (deep link or otherwise) back to the home feed.
  // Guards against premature ejection: we wait until the session check resolves,
  // and for signed-in users until their profile loads, so nobody is bounced in
  // the gap between getSession and loadProfile. Anonymous visitors (no user) are
  // bounced as soon as auth resolves.
  useEffect(() => {
    if (!authResolved) return;            // don't act before we know who they are
    if (user && !profile) return;         // signed in but profile still loading
    if (activeTab === 'memes' && !canSeeLounge(profile)) {
      setActiveTab('foryou');
      if (window.location.pathname === '/lounge' || window.location.pathname === '/memes') {
        window.history.replaceState({}, '', '/');
      }
    }
  }, [activeTab, isPlatformAdmin, authResolved, user, profile]);

  // Repost: open the create-post modal as a 'post' with the original link prefilled.
  useEffect(() => {
    const onRepost = (e) => {
      if (!user) { setShowAuthModal(true); return; }
      const { id } = e.detail || {};
      setAskAboutPostId(null);
      setDefaultIsQuestion(false);
      setCreateDefaultPostType('post');
      setCreateInitialDraft('');
      // Fills remix_source_url → forked_from_post_id, so the new post renders on
      // the feed as a repost of the original (same path as Remix attribution).
      setCreateRepostSource(id ? { id } : null);
      setShowCreateModal(true);
    };
    window.addEventListener('prompted:repost', onRepost);
    return () => window.removeEventListener('prompted:repost', onRepost);
  }, [user]);

  // A counter-only repost (toggle_repost) doesn't reload the profile on its own,
  // so the Reposts tab would look empty until a full refresh. Re-pull the current
  // user's profile posts whenever a repost is toggled anywhere in the app.
  useEffect(() => {
    if (!user) return;
    const onReposted = () => { loadMyProfilePosts(); };
    window.addEventListener('prompted:reposted', onReposted);
    return () => window.removeEventListener('prompted:reposted', onReposted);
  }, [user]);

  // Advance the daily login streak once per session when signed in, and
  // check whether today's daily reward is still unclaimed (drives the dot
  // on the header gift button).
  useEffect(() => {
    if (!user?.id) return;
    touchLoginStreak().catch(() => {});
    supabase.rpc('daily_reward_status')
      .then(({ data }) => {
        if (data?.signed_in) setDailyRewardClaimable(!data.today_claimed);
      })
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    // Handle PKCE OAuth code exchange on page load (for mobile redirect back)
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    // Password-reset links land here with ?recovery=1 (set as redirectTo when we
    // emailed the link). Once the session is established we pop the reset modal.
    const isRecovery = url.searchParams.get('recovery') === '1';
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (!error && data?.session) {
          setUser(data.session.user);
          loadProfile(data.session.user);
          if (isRecovery) setShowPasswordResetModal(true);
        }
        setAuthResolved(true);
        // Clean up the URL
        url.searchParams.delete('code');
        url.searchParams.delete('recovery');
        window.history.replaceState({}, '', url.pathname + url.search);
      });
    } else {
      if (isRecovery) {
        setShowPasswordResetModal(true);
        url.searchParams.delete('recovery');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
      supabase.auth.getSession().then(({ data: { session } }) => {
        setUser(session?.user || null);
        if (session?.user) loadProfile(session.user);
        setAuthResolved(true);
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      // Backstop for the email reset link: Supabase fires PASSWORD_RECOVERY once
      // it detects the recovery session in the URL.
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordResetModal(true);
      }
      if (session?.user) {
        loadProfile(session.user);
        // Capture tokens for the account switcher. Profile fields get filled in
        // by a separate effect once loadProfile resolves.
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          saveAccount({ session, profile: null });
        }
        // Close the auth modal on a fresh login — the native OAuth deep-link
        // path establishes the session here and never closed it otherwise.
        if (event === 'SIGNED_IN') {
          setShowAuthModal(false);
          // Backstop for the native Google/GitHub flow: when sign-in completes
          // the system browser Custom Tab sometimes stays on top of the app
          // (Browser.close() in the deep-link handler can no-op on Android).
          // Closing it here too — keyed off the reliable SIGNED_IN event —
          // makes sure the user lands back in the app, not a dead login page.
          if (isNativeApp()) {
            import('@capacitor/browser')
              .then(({ Browser }) => Browser.close())
              .catch(() => { /* no browser open — ignore */ });
          }
        }
      }
      setSavedAccounts(getSavedAccounts());
    });

    // Re-check session when app comes back to foreground (mobile). Only
    // refetch the profile if the signed-in user actually changed — refocusing
    // a tab used to refire the profiles select every time (269k seq scans on
    // a 344-row table).
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            setUser(session.user);
            if (profileLoadRef.current.loadedId !== session.user.id) {
              loadProfile(session.user);
            }
          }
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Right sidebar stays sticky and visible at all times — the previous
  // "scroll past to collapse" behavior was disabled because it hid the
  // Builds/Discussions/Questions/Recommended lists after only a little
  // scrolling. The sidebar is position: sticky (see .right-sidebar CSS), so it
  // simply follows the viewport as you scroll. No scroll listener needed.

  // Handle /onboarding URL: redirect completed users to home, set URL for incomplete users
  useEffect(() => {
    if (window.location.pathname === '/onboarding') {
      if (onboardingCompleted === true) {
        // User already completed onboarding — redirect to home
        window.history.replaceState({}, '', '/');
      }
      // If onboardingCompleted === false, the routing guard handles display
    }
  }, [onboardingCompleted]);

  // Set /onboarding URL when onboarding guard is active
  useEffect(() => {
    if (user && onboardingCompleted === false && window.location.pathname !== '/onboarding') {
      window.history.replaceState({}, '', '/onboarding');
    }
  }, [user, onboardingCompleted]);

  // Deep-link: open /search URL on initial load
  useEffect(() => {
    if (window.location.pathname === '/search') {
      setShowSearchPage(true);
    }
    // Deep-link: /weekly-report (Weekly Social Media Report). Optional ?id= opens
    // a saved report in read-only download mode.
    if (window.location.pathname === '/weekly-report') {
      setActiveTab('weeklyreport');
      const rid = new URLSearchParams(window.location.search).get('id');
      if (rid) setWeeklyReportId(rid);
    }
    // Deep-link: open /explore URL (with optional ?q= search param)
    if (window.location.pathname === '/explore') {
      setActiveTab('explore');
      const urlParams = new URLSearchParams(window.location.search);
      const q = urlParams.get('q');
      if (q) {
        setExploreSearchQuery(q);
        // Delay search until component is ready
        setTimeout(() => performExploreSearch(q), 100);
      }
    }
    // Deep-link: open /explore/category/:id
    const catExploreMatch = window.location.pathname.match(/^\/explore\/category\/([a-z0-9-]+)$/i);
    if (catExploreMatch) {
      setActiveTab('explore');
      const slug = catExploreMatch[1].toLowerCase();
      // Will be resolved after categories load
    }
    // Deep-link: open /tool/:id or /explore/tool/:id
    const toolExploreMatch = window.location.pathname.match(/^(?:\/explore)?\/tool\/([a-z0-9-]+)$/i);
    if (toolExploreMatch) {
      setActiveTab('explore');
      const toolId = toolExploreMatch[1];
      const toolName = getToolDisplayName(toolId);
      const urlParams = new URLSearchParams(window.location.search);
      const model = urlParams.get('model') || '';
      setViewingToolName(toolName);
      setViewingToolId(toolId);
      setExploreSubView('toolDetail');
      setToolViewTab('trending');
      setSelectedToolModelFilter(model);
    }
    // Deep-link: open /workflow/:id
    const workflowMatch = window.location.pathname.match(/^\/workflow\/([a-f0-9-]+)$/i);
    if (workflowMatch) {
      setSelectedWorkflowId(workflowMatch[1]);
    }
    // Deep-link: open /new/workflow or /create/workflow
    if (window.location.pathname === '/new/workflow' || window.location.pathname === '/create/workflow') {
      setShowCreateWorkflow(true);
    }
    // Deep-link: open /review/:id (Agent Posting — review an agent draft)
    const reviewMatch = window.location.pathname.match(/^\/review\/([0-9a-f-]+)$/i);
    if (reviewMatch) {
      setReviewDraftId(reviewMatch[1]);
    }
    // Deep-link: open /termsandconditions or /privacypolicy (+ short aliases)
    if (window.location.pathname === '/termsandconditions' || window.location.pathname === '/terms') {
      setActiveTab('terms');
    }
    if (window.location.pathname === '/privacypolicy' || window.location.pathname === '/privacy') {
      setActiveTab('privacy');
    }
    if (window.location.pathname === '/support') {
      setActiveTab('support');
    }
    if (window.location.pathname === '/copyright') {
      setActiveTab('copyright');
    }
    // Deep-link: open /about
    if (window.location.pathname === '/about') {
      setActiveTab('about');
    }
    // Deep-link: main sidebar tabs so refresh restores the tab the user
    // was on. /communities is intercepted by the community deep-link effect
    // only when the path is /community/:slug, so /communities (plural) is
    // safe to handle here as the bare tab URL.
    if (window.location.pathname === '/communities') {
      setActiveTab('communities');
    }
    if (window.location.pathname === '/questions') {
      setActiveTab('questions');
    }
    if (window.location.pathname === '/messages') {
      setActiveTab('messages');
    }
    if (window.location.pathname === '/saved') {
      setActiveTab('saved');
    }
    // /games and /games/:slug both render the Games tab; GamesPage handles its own sub-routing.
    if (window.location.pathname === '/games' || window.location.pathname.startsWith('/games/')) {
      setActiveTab('games');
    }
    // /learn and its sub-paths (/learn/:tool, /learn/s/:id) render the Learn tab; LearningPage routes internally.
    if (window.location.pathname === '/learn' || window.location.pathname.startsWith('/learn/')) {
      setActiveTab('learn');
    }
    if (window.location.pathname === '/videos') {
      setActiveTab('videos');
    }
    if (window.location.pathname === '/lounge' || window.location.pathname === '/memes') {
      // Lounge is hidden for everyone for now (see canSeeLounge). We still set
      // the tab here, but the render guard keeps it from showing and a dedicated
      // effect below bounces the visitor to home once auth resolves.
      setActiveTab('memes');
    }
    if (window.location.pathname === '/spotlight') {
      setActiveTab('spotlight');
    }
    if (window.location.pathname === '/pro') {
      setActiveTab('pro');
    }
    if (window.location.pathname === '/live' || window.location.pathname.startsWith('/live/')) {
      setActiveTab('live');
    }
    if (window.location.pathname === '/referrals') {
      setActiveTab('referrals');
    }
    // Stash any ?ref=<code> from the invite link before the URL gets cleaned up.
    captureReferralFromUrl();
  }, []);

  // Once signed in, bind any captured referral to this account (idempotent).
  useEffect(() => {
    if (user?.id) {
      attributePendingReferral();
    }
  }, [user?.id]);

  // Deep-link: /community/:slug. Fires once on mount, independent of auth
  // state (which resolves asynchronously via getSession). A separate effect
  // below watches (user + pendingShareCommunity) and drops the visitor into
  // the community once we know they're signed in.
  const communityDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (communityDeepLinkHandled.current) return;
    const match = window.location.pathname.match(/^\/community\/([a-z0-9-]+)$/i);
    if (!match) return;
    communityDeepLinkHandled.current = true;
    const slug = match[1].toLowerCase();
    (async () => {
      const { data: community } = await supabase
        .from('communities_with_stats')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (!community) return;
      setPendingShareCommunity(community);
      setActiveTab('communities');
    })();
  }, []);

  // When auth resolves and we have a pending share target, drop the user
  // into that community. Covers both "logged-in visitor opens share link"
  // and "logged-out visitor signs up via auth modal".
  useEffect(() => {
    if (user && pendingShareCommunity) {
      selectCommunity(pendingShareCommunity);
      setPendingShareCommunity(null);
    }
  }, [user, pendingShareCommunity]);

  // Deep-link: open post from /:username/post/:id or /post/:id URL on initial load
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const match = window.location.pathname.match(/^\/(?:[a-zA-Z0-9_-]+\/)?post\/(.+)$/i);
    if (!match) return;
    const postId = extractPostId(match[1]);
    if (!postId) return;
    deepLinkHandled.current = true;
    const loadDeepLinkedPost = async (retries = 2) => {
      try {
        const { data: post, error } = await supabase
          .from('posts_with_stats')
          .select('*')
          .eq('id', postId)
          .single();
        if (error && retries > 0) {
          setTimeout(() => loadDeepLinkedPost(retries - 1), 1000);
          return;
        }
        if (post) {
          _setSelectedFullPost(post);
          const title = post.title || 'Post on Prompted';
          const desc = post.description || post.prompt || 'Check out this post on Prompted';
          const image = (post.images && post.images.length > 0) ? post.images[0] : 'https://prmpted.com/og-image.png';
          document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
          document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc);
          document.querySelector('meta[property="og:image"]')?.setAttribute('content', image);
          document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
          document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', desc);
          document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', image);
        }
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => loadDeepLinkedPost(retries - 1), 1000);
        }
      }
    };
    loadDeepLinkedPost();
  }, []);

  // Deep-link: open profile from /:username URL on initial load.
  // Must run AFTER the post deep-link, since /:username/post/:id is also a
  // single-username segment but should resolve as a post, not a profile.
  //
  // We force profileInitialTab back to null here so a shared profile link
  // always opens on the default "Builds" tab, even if the user previously
  // clicked a question post earlier in the session and left the tab state
  // pinned to 'questions'.
  const profileDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (profileDeepLinkHandled.current) return;
    const path = window.location.pathname;
    const match = path.match(/^\/([a-zA-Z0-9_-]+)$/);
    if (!match) return;
    const segment = match[1];
    if (isReservedTopLevelSegment(segment)) return;
    profileDeepLinkHandled.current = true;
    (async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username')
          .ilike('username', segment)
          .maybeSingle();
        if (profile?.id) {
          setProfileInitialTab(null);
          setProfileScrollToPostId(null);
          setViewingUserId(profile.id);
        }
      } catch (err) {
        // Silent: invalid username just falls through to the home feed.
      }
    })();
  }, []);

  // Reflect the currently-viewed profile in the URL so it can be shared.
  // Skips when a post modal is open (the post URL takes precedence).
  //
  // The "profile closed" branch only reverts the URL if WE were the ones who
  // pushed the /:username we're sitting on. That guard matters on initial
  // mount: when a user lands on a deep-link URL like /herz, viewingUserId is
  // still null until the deep-link effect's async lookup resolves, and a
  // naive "if we're on a /:username URL, go home" rule would clobber the
  // deep-link before it ever sets viewingUserId — leaving the user on /
  // staring at the home feed instead of the profile.
  const lastSyncedProfileUrlRef = useRef(null);
  useEffect(() => {
    if (selectedFullPost) return;
    let cancelled = false;
    if (viewingUserId) {
      (async () => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', viewingUserId)
            .maybeSingle();
          if (cancelled) return;
          const username = profile?.username;
          if (!username) return;
          const target = `/${username}`;
          if (window.location.pathname !== target) {
            window.history.pushState({ profileUserId: viewingUserId }, '', target);
          }
          // Mark this URL as ours either way — including the deep-link case
          // where we landed on it directly — so closing the profile reverts.
          lastSyncedProfileUrlRef.current = target;
        } catch {
          // Ignore — keeps URL out of sync, but profile still renders.
        }
      })();
    } else if (
      lastSyncedProfileUrlRef.current &&
      window.location.pathname === lastSyncedProfileUrlRef.current
    ) {
      // Profile closed and we're still on the URL we tracked: revert.
      window.history.pushState({}, '', '/');
      lastSyncedProfileUrlRef.current = null;
    } else {
      // Either we never pushed a profile URL (initial mount before deep-link
      // resolves), or the user has already navigated somewhere else — leave
      // the URL alone.
      lastSyncedProfileUrlRef.current = null;
    }
    return () => { cancelled = true; };
  }, [viewingUserId, selectedFullPost]);

  // Deep-link: open category from /category/:slug URL on initial load
  const categoryDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (categoryDeepLinkHandled.current || categories.length === 0) return;
    const match = window.location.pathname.match(/^\/category\/([a-z0-9-]+)$/i);
    if (!match) return;
    categoryDeepLinkHandled.current = true;
    const slug = match[1].toLowerCase();
    // Find category by slug (name converted to lowercase with hyphens)
    const category = categories.find(c =>
      c.name.toLowerCase().replace(/\s+/g, '-') === slug ||
      c.id === slug
    );
    if (category) {
      _setViewingCategoryId(category.id);
      setActiveTab('explore');
      setCategoryViewTab('most-liked');
    }
  }, [categories]);

  // Deep-link: open school from /schools/:slug URL on initial load
  const schoolDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (schoolDeepLinkHandled.current) return;
    // Achievements deep links
    const achievementsMatch = window.location.pathname.match(/^\/achievements(?:\/([0-9a-f-]+))?$/i);
    if (achievementsMatch) {
      const url = new URL(window.location.href);
      const highlight = url.searchParams.get('highlight');
      setActiveTab('achievements');
      setViewingAchievementsUserId(achievementsMatch[1] || null);
      if (highlight) setAchievementHighlightId(highlight);
      return;
    }
    // Builder ranks deep link
    if (window.location.pathname === '/ranks') {
      setActiveTab('ranks');
      return;
    }
    // Arena deep link
    if (window.location.pathname === '/arena') {
      setActiveTab('arena');
      return;
    }
    // Builder leaderboard deep link -> redirect to ranks
    if (window.location.pathname === '/leaderboard') {
      setActiveTab('ranks');
      loadBuilderLeaderboard();
      window.history.replaceState({}, '', '/ranks');
      return;
    }

    const leaderboardMatch = window.location.pathname.match(/^\/schools\/leaderboard$/i);
    if (leaderboardMatch) {
      schoolDeepLinkHandled.current = true;
      setSchoolLeaderboardView(true);
      setActiveTab('explore');
      return;
    }
    const schoolMatch = window.location.pathname.match(/^\/schools\/([a-z0-9-]+)$/i);
    if (schoolMatch) {
      schoolDeepLinkHandled.current = true;
      const slug = schoolMatch[1];
      setViewingSchoolSlug(slug);
      setActiveTab('explore');
      loadSchoolDetails(slug);
    }
  }, []);

  // Handle browser back/forward for post, category, and school URLs
  useEffect(() => {
    const handlePopState = async (e) => {
      // Check for search page
      if (window.location.pathname === '/search') {
        setShowSearchPage(true);
        return;
      } else {
        setShowSearchPage(false);
      }

      // Check for legal page URLs (short aliases included)
      if (window.location.pathname === '/termsandconditions' || window.location.pathname === '/terms') {
        setActiveTab('terms');
        return;
      }
      if (window.location.pathname === '/privacypolicy' || window.location.pathname === '/privacy') {
        setActiveTab('privacy');
        return;
      }
      if (window.location.pathname === '/support') {
        setActiveTab('support');
        return;
      }
      if (window.location.pathname === '/copyright') {
        setActiveTab('copyright');
        return;
      }

      // Check for school URLs
      const schoolLeaderboardMatch = window.location.pathname.match(/^\/schools\/leaderboard$/i);
      if (schoolLeaderboardMatch) {
        setSchoolLeaderboardView(true);
        setViewingSchoolSlug(null);
        setActiveTab('explore');
        _setSelectedFullPost(null);
        _setViewingCategoryId(null);
        return;
      }

      const schoolMatch = window.location.pathname.match(/^\/schools\/([a-z0-9-]+)$/i);
      if (schoolMatch) {
        const slug = schoolMatch[1];
        setViewingSchoolSlug(slug);
        setSchoolLeaderboardView(false);
        setActiveTab('explore');
        loadSchoolDetails(slug);
        _setSelectedFullPost(null);
        _setViewingCategoryId(null);
        return;
      }

      // Check for post URL (/:username/post/:id or /post/:id)
      const postMatch = window.location.pathname.match(/^\/(?:[a-zA-Z0-9_-]+\/)?post\/(.+)$/i);
      if (postMatch && extractPostId(postMatch[1])) {
        const postId = extractPostId(postMatch[1]);
        const existing = posts.find(p => p.id === postId);
        if (existing) {
          _setSelectedFullPost(existing);
        } else {
          const { data: post } = await supabase
            .from('posts_with_stats')
            .select('*')
            .eq('id', postId)
            .single();
          if (post) _setSelectedFullPost(post);
        }
        _setViewingCategoryId(null);
        setViewingSchoolSlug(null);
        setSchoolLeaderboardView(false);
        return;
      }

      // Check for tool URL
      const toolMatch = window.location.pathname.match(/^\/tool\/([a-z0-9-]+)$/i);
      if (toolMatch) {
        const toolId = toolMatch[1];
        const toolName = getToolDisplayName(toolId);
        const urlParams = new URLSearchParams(window.location.search);
        const model = urlParams.get('model') || '';
        setViewingToolName(toolName);
        setViewingToolId(toolId);
        setExploreSubView('toolDetail');
        setToolViewTab('trending');
        setSelectedToolModelFilter(model);
        setActiveTab('explore');
        _setSelectedFullPost(null);
        _setViewingCategoryId(null);
        setViewingSchoolSlug(null);
        setSchoolLeaderboardView(false);
        return;
      }

      // Check for achievements URL
      const achievementsPopMatch = window.location.pathname.match(/^\/achievements(?:\/([0-9a-f-]+))?$/i);
      if (achievementsPopMatch) {
        const url = new URL(window.location.href);
        const highlight = url.searchParams.get('highlight');
        setActiveTab('achievements');
        setViewingAchievementsUserId(achievementsPopMatch[1] || null);
        setAchievementHighlightId(highlight || null);
        _setSelectedFullPost(null);
        return;
      }

      // Check for ranks URL
      if (window.location.pathname === '/ranks') {
        setActiveTab('ranks');
        _setSelectedFullPost(null);
        return;
      }

      // Check for arena URL
      if (window.location.pathname === '/arena') {
        setActiveTab('arena');
        _setSelectedFullPost(null);
        return;
      }

      // Check for leaderboard URL -> redirect to ranks
      if (window.location.pathname === '/leaderboard') {
        setActiveTab('ranks');
        _setSelectedFullPost(null);
        window.history.replaceState({}, '', '/ranks');
        return;
      }

      // Check for category URL
      const categoryMatch = window.location.pathname.match(/^\/category\/([a-z0-9-]+)$/i);
      if (categoryMatch) {
        const slug = categoryMatch[1].toLowerCase();
        const category = categories.find(c =>
          c.name.toLowerCase().replace(/\s+/g, '-') === slug ||
          c.id === slug
        );
        if (category) {
          _setViewingCategoryId(category.id);
          setActiveTab('explore');
          setCategoryViewTab('most-liked');
        }
        _setSelectedFullPost(null);
        setViewingUserId(null);
        setCategoryNavigationOrigin(null);
        setViewingSchoolSlug(null);
        setSchoolLeaderboardView(false);
        return;
      }

      // Main sidebar tabs (back/forward to a tab URL the user was on).
      if (window.location.pathname === '/communities') {
        setActiveTab('communities');
        _setSelectedFullPost(null);
        return;
      }
      if (window.location.pathname === '/questions') {
        setActiveTab('questions');
        _setSelectedFullPost(null);
        return;
      }
      if (window.location.pathname === '/messages') {
        setActiveTab('messages');
        _setSelectedFullPost(null);
        return;
      }
      if (window.location.pathname === '/saved') {
        setActiveTab('saved');
        _setSelectedFullPost(null);
        return;
      }

      // Handle workflow URLs
      const workflowMatch = window.location.pathname.match(/^\/workflow\/([a-f0-9-]+)$/i);
      if (workflowMatch) {
        setSelectedWorkflowId(workflowMatch[1]);
        _setSelectedFullPost(null);
        return;
      }

      // Handle /:username profile URL. Always reset profileInitialTab and
      // profileScrollToPostId so back/forward into a shared profile link
      // lands on the default Builds tab instead of inheriting whatever tab
      // was last pinned by an in-app question or post click.
      const usernameMatch = window.location.pathname.match(/^\/([a-zA-Z0-9_-]+)$/);
      if (usernameMatch && !isReservedTopLevelSegment(usernameMatch[1])) {
        const username = usernameMatch[1];
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .ilike('username', username)
            .maybeSingle();
          if (profile?.id) {
            setProfileInitialTab(null);
            setProfileScrollToPostId(null);
            setViewingUserId(profile.id);
            _setSelectedFullPost(null);
            _setViewingCategoryId(null);
            setViewingSchoolSlug(null);
            setSchoolLeaderboardView(false);
            return;
          }
        } catch {
          // Fall through to default clear
        }
      }

      // Default: clear all
      _setSelectedFullPost(null);
      _setViewingCategoryId(null);
      setViewingSchoolSlug(null);
      setSchoolLeaderboardView(false);
      setSelectedWorkflowId(null);
      setShowCreateWorkflow(false);
      setViewingUserId(null);
      if (activeTab === 'terms' || activeTab === 'privacy' || activeTab === 'about' || activeTab === 'support' || activeTab === 'copyright') {
        setActiveTab('foryou');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [posts, categories]);

  // Close create dropdown when clicking outside
  useEffect(() => {
    if (!showCreateDropdown) return;
    const handleClickAway = () => setShowCreateDropdown(false);
    const timer = setTimeout(() => document.addEventListener('click', handleClickAway), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handleClickAway); };
  }, [showCreateDropdown]);

  // Close global search when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (globalSearchRef.current && !globalSearchRef.current.contains(e.target)) {
        setGlobalSearchOpen(false);
      }
    };
    if (globalSearchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [globalSearchOpen]);

  // Debounced global search: call search_all when the debounced query changes
  useEffect(() => {
    if (!debouncedGlobalQuery.trim()) {
      setGlobalSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [] });
      setGlobalSearchLoading(false);
      return;
    }
    let cancelled = false;
    setGlobalSearchLoading(true);
    searchAll(debouncedGlobalQuery, 10).then((results) => {
      if (!cancelled) {
        setGlobalSearchResults(results);
        setGlobalSearchLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setGlobalSearchLoading(false);
    });
    return () => { cancelled = true; };
  }, [debouncedGlobalQuery]);

  // Debounced explore dropdown search: show live preview while typing
  useEffect(() => {
    if (!debouncedExploreQuery.trim() || exploreSearchActive) {
      setExploreDropdownResults({ posts: [], builds: [], questions: [], communities: [], users: [] });
      setExploreDropdownLoading(false);
      return;
    }
    let cancelled = false;
    setExploreDropdownLoading(true);
    searchAll(debouncedExploreQuery, 8).then((results) => {
      if (!cancelled) {
        setExploreDropdownResults(results);
        setExploreDropdownLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setExploreDropdownLoading(false);
    });
    return () => { cancelled = true; };
  }, [debouncedExploreQuery, exploreSearchActive]);

  // Load tool posts when viewingToolId or toolViewTab changes
  useEffect(() => {
    if (viewingToolId && exploreSubView === 'toolDetail') {
      loadToolPosts(viewingToolId, toolViewTab === 'trending' ? 'trending' : 'recent');
    }
  }, [viewingToolId, toolViewTab]);

  useEffect(() => {
    const searchToolPosts = async () => {
      if (!debouncedToolQuery.trim() || !viewingToolId || exploreSubView !== 'toolDetail') {
        setToolSearchResults([]);
        setToolSearchLoading(false);
        return;
      }

      setToolSearchLoading(true);
      const normalizedQuery = debouncedToolQuery.trim().toLowerCase();
      const localToolMatches = (toolPosts || []).filter(post => {
        const searchableText = [
          post.title,
          post.description,
          post.caption,
          post.prompt,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(normalizedQuery);
      });

      try {
        const { data, error } = await supabase.rpc('search_posts', {
          search_query: debouncedToolQuery.trim(),
          filter_category_ids: null,
          filter_tool_ids: [viewingToolId],
          filter_difficulty: null,
          sort_by: 'relevance',
          page_limit: 15,
          page_offset: 0
        });

        if (!error) {
          const rpcMatches = data || [];
          const mergedMatches = [...rpcMatches, ...localToolMatches].filter((post, index, arr) =>
            arr.findIndex(candidate => candidate.id === post.id) === index
          );

          setToolSearchResults(mergedMatches);
        } else {
          // Fallback for environments where search_posts RPC is unavailable
          const { data: fallbackData } = await supabase
            .from('posts_with_stats')
            .select('*')
            .contains('tool_ids', [viewingToolId])
            .neq('post_type', 'learning_submission')
        .neq('post_type', 'meme')
            .or(`title.ilike.%${debouncedToolQuery}%,description.ilike.%${debouncedToolQuery}%,caption.ilike.%${debouncedToolQuery}%,prompt.ilike.%${debouncedToolQuery}%`)
            .eq('moderation_status', 'approved')
            .order('likes_count', { ascending: false })
            .limit(15);

          const mergedMatches = [...(fallbackData || []), ...localToolMatches].filter((post, index, arr) =>
            arr.findIndex(candidate => candidate.id === post.id) === index
          );

          setToolSearchResults(mergedMatches);
        }
      } catch (err) {
        console.error('Error searching tool posts:', err);
        setToolSearchResults(localToolMatches);
      } finally {
        setToolSearchLoading(false);
      }
    };

    searchToolPosts();
  }, [debouncedToolQuery, viewingToolId, exploreSubView, toolPosts]);

  // Load category posts when viewingCategoryId or categoryViewTab changes
  useEffect(() => {
    if (viewingCategoryId) {
      loadCategoryPosts(viewingCategoryId, categoryViewTab === 'most-liked' ? 'trending' : 'recent');
    }
  }, [viewingCategoryId, categoryViewTab]);

  // Scroll to top of questions page when navigating to questions tab
  useEffect(() => {
    if (activeTab === 'questions' && scrollToQuestionId) {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setScrollToQuestionId(null);
      }, 100);
    }
  }, [activeTab, scrollToQuestionId]);

  // Scroll to top when navigating to trending or recommended tabs
  useEffect(() => {
    if ((activeTab === 'trending' || activeTab === 'recommended') && highlightedPostId) {
      // Scroll to top so user can see the highlighted post
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);
    }
  }, [activeTab, highlightedPostId]);

  // Dedupe guard for loadProfile: auth init fires getSession + INITIAL_SESSION
  // nearly simultaneously (and tab refocus used to add a third fetch). All
  // concurrent callers for the same user share one in-flight request;
  // deliberate later calls (profile edits, account switches) still refetch.
  const profileLoadRef = useRef({ inFlight: null, inFlightUserId: null, loadedId: null });

  const loadProfile = async (userObj) => {
    const userId = typeof userObj === 'string' ? userObj : userObj.id;
    const guard = profileLoadRef.current;
    if (guard.inFlight && guard.inFlightUserId === userId) return guard.inFlight;
    const run = loadProfileImpl(userId);
    guard.inFlight = run;
    guard.inFlightUserId = userId;
    try {
      return await run;
    } finally {
      guard.inFlight = null;
      guard.loadedId = userId;
    }
  };

  const loadProfileImpl = async (userId) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

    if (data) {
      setProfile(data);
      setOnboardingCompleted(data.onboarding_completed !== false); // true or null → completed
      if (data.pinned_post_ids && Array.isArray(data.pinned_post_ids)) {
        setMyProfilePinnedIds(data.pinned_post_ids);
      }
      return data;
    }

    // Profile doesn't exist - create one from auth metadata
    if (error && error.code === 'PGRST116') {
      // Get user metadata for initial profile values
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const metadata = currentUser?.user_metadata || {};

      const newProfile = {
        id: userId,
        username: metadata.username || metadata.email?.split('@')[0] || `user_${userId.slice(0, 8)}`,
        display_name: metadata.display_name || metadata.full_name || metadata.name || metadata.username || 'New User',
        bio: '',
        avatar_emoji: '😀',
        avatar_url: metadata.avatar_url || null,
        created_at: new Date().toISOString()
      };

      const { data: createdProfile, error: createError } = await supabase
        .from('profiles')
        .insert(newProfile)
        .select()
        .single();

      if (createError) {
        console.error('Error creating profile:', createError);
        // If it's a unique constraint error, the profile might already exist - try to fetch it with retries
        if (createError.code === '23505') {
          // Retry fetching up to 3 times with small delays (race condition with concurrent creates)
          for (let attempt = 0; attempt < 3; attempt++) {
            const { data: existingProfile } = await supabase.from('profiles').select('*').eq('id', userId).single();
            if (existingProfile) {
              setProfile(existingProfile);
              setOnboardingCompleted(existingProfile.onboarding_completed !== false);
              return existingProfile;
            }
            // Small delay before retry
            if (attempt < 2) await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
          }
        }
        // Don't set a fake profile that's not in DB - this causes state/DB mismatch
        // Return null so callers know profile creation actually failed
        console.error('Profile creation failed and could not recover:', createError);
        return null;
      } else {
        setProfile(createdProfile);
        setOnboardingCompleted(createdProfile.onboarding_completed !== false);
        return createdProfile;
      }
    } else if (error) {
      console.error('Error loading profile:', error);
    }
    return null;
  };

  // Load my profile follower/following counts
  const loadMyProfileFollowCounts = async (userId) => {
    // Get follower count (people who follow me)
    const { count: followers } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);
    setMyProfileFollowerCount(followers || 0);

    // Get following count (people I follow)
    const { count: following } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId);
    setMyProfileFollowingCount(following || 0);
  };

  const loadMyProfileOwnedCommunities = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('communities_with_stats')
        .select('*')
        .eq('creator_id', userId)
        .order('member_count', { ascending: false });
      if (!error && data) {
        setMyProfileOwnedCommunities(data);
      }
    } catch (err) {
      console.error('Error loading owned communities:', err);
    }
  };

  // Load my profile followers list
  const loadMyProfileFollowers = async (userId) => {
    setMyProfileLoadingFollowList(true);
    try {
      const { data: followsData, error: followsError } = await supabase
        .from('follows')
        .select('follower_id, created_at')
        .eq('following_id', userId)
        .order('created_at', { ascending: false });

      if (followsError) {
        setMyProfileFollowList([]);
        setMyProfileLoadingFollowList(false);
        return;
      }

      if (!followsData || followsData.length === 0) {
        setMyProfileFollowList([]);
        setMyProfileLoadingFollowList(false);
        return;
      }

      const followerIds = followsData.map(f => f.follower_id);
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_emoji, avatar_url, bio, builder_points')
        .in('id', followerIds);

      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
      const combinedData = followsData.map(follow => ({
        follower_id: follow.follower_id,
        created_at: follow.created_at,
        profiles: profilesMap.get(follow.follower_id) || null
      }));

      setMyProfileFollowList(combinedData);
    } catch (err) {
      setMyProfileFollowList([]);
    }
    setMyProfileLoadingFollowList(false);
  };

  // Load my profile following list
  const loadMyProfileFollowing = async (userId) => {
    setMyProfileLoadingFollowList(true);
    try {
      const { data: followsData, error: followsError } = await supabase
        .from('follows')
        .select('following_id, created_at')
        .eq('follower_id', userId)
        .order('created_at', { ascending: false });

      if (followsError) {
        setMyProfileFollowList([]);
        setMyProfileLoadingFollowList(false);
        return;
      }

      if (!followsData || followsData.length === 0) {
        setMyProfileFollowList([]);
        setMyProfileLoadingFollowList(false);
        return;
      }

      const followingIds = followsData.map(f => f.following_id);
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_emoji, avatar_url, bio, builder_points')
        .in('id', followingIds);

      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
      const combinedData = followsData.map(follow => ({
        following_id: follow.following_id,
        created_at: follow.created_at,
        profiles: profilesMap.get(follow.following_id) || null
      }));

      setMyProfileFollowList(combinedData);
    } catch (err) {
      setMyProfileFollowList([]);
    }
    setMyProfileLoadingFollowList(false);
  };

  useEffect(() => {
    loadAiTools();
    loadCategories();
    loadUserSchoolIdMap();
    loadPosts();
    loadBuilds();
    loadStats();
    loadCreators();
    loadCommunities();
    loadAllUsers();
    loadSchoolLeaderboard();
    loadExploreWorkflows();
    loadBuilderRanks();
  }, []);

  useEffect(() => {
    if (user) {
      // Re-fetch the public communities list too: on native the mount-time
      // fetch can race session/network readiness and come back empty, and it's
      // otherwise never retried — which left the Communities tab blank in the
      // Android app. Re-running it once the session settles repairs that.
      loadCommunities();
      loadUserLikes();
      loadUserSaves();
      loadUserSavedPrompts();
      loadUserFollows();
      loadUserCommunities();
      loadUserFollowedCategories();
      loadNotifications();
      loadMyProfileFollowCounts(user.id);
      loadMyProfileOwnedCommunities(user.id);
      loadCurrentUserSchool();
      loadUserWorkflowInteractions();
      loadMyProfileWorkflows();
      loadMyProfilePosts();
    } else {
      setUserLikes([]);
      setUserSaves([]);
      setUserSavedPrompts([]);
      setUserFollows([]);
      setUserCommunities([]);
      setUserFollowedCategories([]);
      setNotifications([]);
      setMyProfileFollowerCount(0);
      setMyProfileFollowingCount(0);
      setMyProfileOwnedCommunities([]);
      setUserSchool(null);
    }
  }, [user]);

  // (Removed July 2026: the global posts INSERT subscription. The posts table
  // was dropped from the Realtime publication — it drove ~80% of DB exec time
  // via WAL decoding — so the subscription would never fire anyway. Feeds
  // refresh on navigation/mount, which was already the dominant path.)

  // Scroll detection for sidebar switching
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;
      setScrolledPastHero(scrollY > viewportHeight * 0.8);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Get 3 most recent builds (exclude questions and regular posts)
  const getTopBuildsOfDay = () => {
    return posts
      .filter(post => !post.is_question && post.post_type !== 'post')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 3);
  };

  // Get suggested users to follow (users with posts, excluding current user)
  const getSuggestedUsers = () => {
    const userPostCounts = {};
    const userCategories = {};

    posts.forEach(post => {
      if (!userPostCounts[post.user_id]) {
        userPostCounts[post.user_id] = {
          id: post.user_id,
          username: post.username,
          display_name: post.display_name,
          avatar_url: post.avatar_url,
          avatar_emoji: post.avatar_emoji,
          name_color: post.name_color,
          count: 0,
          categories: new Set()
        };
      }
      userPostCounts[post.user_id].count++;
      if (post.category_name) {
        userPostCounts[post.user_id].categories.add(post.category_name);
      }
    });

    return Object.values(userPostCounts)
      .filter(u => u.id !== user?.id)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(u => ({
        ...u,
        interests: Array.from(u.categories).slice(0, 3).join(', ')
      }));
  };

  const topBuilds = getTopBuildsOfDay();
  const suggestedUsers = getSuggestedUsers();

  // Get 3 most recent questions
  const getTopQuestionsOfDay = () => {
    return posts
      .filter(post => post.is_question)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 3);
  };

  // Get 3 most recent discussion posts (post_type === 'post', not questions).
  // Why: the right sidebar previously only surfaced Builds and Questions, which
  // made discussions invisible from the home feed. Discussions are casual
  // text-only posts (post_type 'post') — distinct from builds (which have a
  // prompt + tools) and questions (is_question = true). Sorting by recency
  // mirrors getTopQuestionsOfDay so all three "of the Day" lists behave the same.
  const getTopDiscussionsOfDay = () => {
    return posts
      .filter(post => post.post_type === 'post' && !post.is_question)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 3);
  };

  // Get recommended accounts based on user's communities and followed categories
  const getRecommendedAccounts = () => {
    const userPostCounts = {};

    posts.forEach(post => {
      if (!userPostCounts[post.user_id]) {
        userPostCounts[post.user_id] = {
          id: post.user_id,
          username: post.username,
          display_name: post.display_name,
          avatar_url: post.avatar_url,
          avatar_emoji: post.avatar_emoji,
          name_color: post.name_color,
          count: 0,
          categories: new Set(),
          categoryIds: new Set()
        };
      }
      userPostCounts[post.user_id].count++;
      if (post.category_name) {
        userPostCounts[post.user_id].categories.add(post.category_name);
      }
      if (post.category_id) {
        userPostCounts[post.user_id].categoryIds.add(post.category_id);
      }
    });

    // Get all users except current user and users they already follow
    let potentialUsers = Object.values(userPostCounts)
      .filter(u => u.id !== user?.id && !userFollows.includes(u.id));

    // Check if user follows any categories or users
    const hasFollowedCategories = user && userFollowedCategories.length > 0;
    const hasFollowedUsers = user && userFollows.length > 0;
    const hasFollowedAnything = hasFollowedCategories || hasFollowedUsers;

    // If user doesn't follow anyone or any categories, just return popular accounts
    if (!hasFollowedAnything) {
      return potentialUsers
        .sort((a, b) => b.count - a.count)
        .slice(0, 9)
        .map(u => ({
          ...u,
          interests: Array.from(u.categories).slice(0, 3).join(', ')
        }));
    }

    // Score users based on shared categories and communities
    potentialUsers = potentialUsers.map(u => {
      let score = u.count; // Base score is post count

      // Big bonus for posting in followed categories
      if (hasFollowedCategories) {
        const matchingCategories = Array.from(u.categoryIds).filter(catId =>
          userFollowedCategories.includes(catId)
        );
        score += matchingCategories.length * 20;
      }

      // Bonus for being in same communities
      if (user && userCommunities.length > 0) {
        const userCommunityCreatorIds = userCommunities.map(c => c.creator_id);
        if (userCommunityCreatorIds.includes(u.id)) {
          score += 10;
        }
      }

      return { ...u, score, interests: Array.from(u.categories).slice(0, 3).join(', ') };
    });

    // Filter to only show users who have some connection (posted in followed categories or same communities)
    const connectedUsers = potentialUsers.filter(u => {
      if (hasFollowedCategories) {
        const hasMatchingCategory = Array.from(u.categoryIds).some(catId =>
          userFollowedCategories.includes(catId)
        );
        if (hasMatchingCategory) return true;
      }
      if (user && userCommunities.length > 0) {
        const userCommunityCreatorIds = userCommunities.map(c => c.creator_id);
        if (userCommunityCreatorIds.includes(u.id)) return true;
      }
      return false;
    });

    // If we have connected users, prioritize them; otherwise fall back to popular accounts
    const usersToShow = connectedUsers.length > 0 ? connectedUsers : potentialUsers;

    return usersToShow
      .sort((a, b) => b.score - a.score)
      .slice(0, 9);
  };

  const topQuestions = getTopQuestionsOfDay();
  const topDiscussions = getTopDiscussionsOfDay();

  // Community-scoped variants for the sidebar on the Communities tab.
  // Only includes posts attached to at least one FREE community.
  const isInFreeCommunity = (postId) => {
    const list = postCommunities[postId] || [];
    return list.some(c => c && !c.is_paid);
  };
  const communityTopBuilds = posts
    .filter(p => !p.is_question && p.post_type !== 'post' && isInFreeCommunity(p.id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3);
  const communityTopQuestions = posts
    .filter(p => p.is_question && isInFreeCommunity(p.id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3);
  const communityTopDiscussions = posts
    .filter(p => p.post_type === 'post' && !p.is_question && isInFreeCommunity(p.id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3);

  const [communityRandomSeed, setCommunityRandomSeed] = useState(0);
  const communityRandomPosts = useMemo(() => {
    const pool = posts.filter(p => isInFreeCommunity(p.id));
    const out = [];
    const used = new Set();
    while (out.length < 3 && used.size < pool.length) {
      const idx = Math.floor(Math.random() * pool.length);
      if (used.has(idx)) continue;
      used.add(idx);
      out.push(pool[idx]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityRandomSeed, posts, postCommunities]);
  const recommendedAccounts = getRecommendedAccounts();

  // Small list of creators for the Explore hero suggestions (pfp + name +
  // a few mixed category/tool tags). Derived from posts so it reflects who
  // actually publishes, not just who recently signed up.
  const exploreSuggestionUsers = useMemo(() => {
    const byUser = new Map();
    for (const p of posts) {
      if (!p.user_id || p.user_id === user?.id) continue;
      if (!byUser.has(p.user_id)) {
        byUser.set(p.user_id, {
          id: p.user_id,
          username: p.username,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          avatar_emoji: p.avatar_emoji,
          name_color: p.name_color,
          count: 0,
          categories: [],
          tools: [],
        });
      }
      const u = byUser.get(p.user_id);
      u.count++;
      if (p.category_name && !u.categories.includes(p.category_name)) {
        u.categories.push(p.category_name);
      }
      if (Array.isArray(p.tool_ids)) {
        for (const tid of p.tool_ids) {
          const name = AI_TOOL_ID_TO_NAME[tid];
          if (name && !u.tools.includes(name)) u.tools.push(name);
        }
      } else if (p.ai_tool && !u.tools.includes(p.ai_tool)) {
        u.tools.push(p.ai_tool);
      }
    }
    return Array.from(byUser.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [posts, user?.id]);

  // Get explore search suggestions (categories and users)
  // Unified explore search using search_all RPC + tool search
  const performExploreSearch = async (searchQuery) => {
    if (!searchQuery || !searchQuery.trim()) {
      setExploreSearchActive(false);
      setExploreSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [], tools: [], categories: [] });
      return;
    }
    setExploreSearchLoading(true);
    setExploreSearchActive(true);
    setExploreSearchFocused(false);

    try {
      const results = await searchAll(searchQuery, 30);
      // Also search tools locally
      const matchingTools = AI_TOOLS.filter(t =>
        t.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      );
      // Also search categories locally
      const matchingCategories = categories.filter(c =>
        c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      );
      setExploreSearchResults({ ...results, tools: matchingTools, categories: matchingCategories });
    } catch (err) {
      console.error('Explore search error:', err);
      setExploreSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [], tools: [], categories: [] });
    }
    setExploreSearchLoading(false);
  };

  // Clear explore search and return to browse view
  const clearExploreSearch = () => {
    setExploreSearchQuery('');
    setExploreSearchActive(false);
    setExploreSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [], tools: [], categories: [] });
    setExploreDropdownResults({ posts: [], builds: [], questions: [], communities: [], users: [] });
    setExploreSearchFocused(false);
    window.history.replaceState({}, '', '/explore');
  };

  const loadCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('display_order');
    setCategories(data || []);
  };

  const loadAiTools = async () => {
    const { data } = await supabase
      .from('ai_tools')
      .select('id, name')
      .order('name', { ascending: true });
    if (data) {
      setAiToolData(data);
    }
  };

  // ============================================
  // WORKFLOW FUNCTIONS
  // ============================================
  const loadExploreWorkflows = async () => {
    setExploreWorkflowsLoading(true);
    const { data } = await getWorkflows(supabase, { sortBy: 'recent', limit: 20 });
    setExploreWorkflows(data || []);
    setExploreWorkflowsLoading(false);
  };

  const loadUserWorkflowInteractions = async () => {
    if (!user) return;
    const [likesResult, savesResult] = await Promise.all([
      getUserWorkflowLikes(supabase, user.id),
      getUserWorkflowSaves(supabase, user.id),
    ]);
    setUserWorkflowLikes(likesResult.data || []);
    setUserWorkflowSaves(savesResult.data || []);
  };

  const loadProfileWorkflows = async (userId) => {
    setProfileWorkflowsLoading(true);
    const { data } = await getUserWorkflows(supabase, userId);
    setProfileWorkflows(data || []);
    setProfileWorkflowsLoading(false);
  };

  const loadMyProfileWorkflows = async () => {
    if (!user) return;
    const { data } = await getUserWorkflows(supabase, user.id);
    setMyProfileWorkflows(data || []);
  };

  const loadMyProfilePosts = async () => {
    if (!user) return;
    setMyProfilePostsLoading(true);
    try {
      const rpcParamsToTry = [
        // Correct signature: get_user_posts_with_reposts(target_user_id, requesting_user_id).
        // The older guessed names below never matched, so this always fell back to
        // a plain posts query that omits reposts entirely.
        { target_user_id: user.id, requesting_user_id: user.id },
        { p_user_id: user.id, p_viewer_id: user.id },
        { user_id: user.id, viewer_id: user.id },
        { target_user_id: user.id, viewer_user_id: user.id },
        { user_id: user.id }
      ];

      for (const params of rpcParamsToTry) {
        const { data, error } = await supabase.rpc('get_user_posts_with_reposts', params);
        if (!error && Array.isArray(data)) {
          const normalized = data.map(post => {
            if (post.post_type) return post;
            if (post.is_question) return { ...post, post_type: 'question' };
            return post;
          });
          setMyProfilePosts(normalized);
          setMyProfilePostsLoading(false);
          return;
        }
        if (error?.code === '42883') break;
      }

      // Fallback: query posts directly
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('posts_with_stats')
        .select('*')
        .eq('user_id', user.id)
        .neq('post_type', 'learning_submission')
        .neq('post_type', 'meme')
        .order('created_at', { ascending: false });

      if (fallbackError) {
        console.error('Error loading my profile posts fallback:', fallbackError);
        setMyProfilePosts([]);
      } else {
        setMyProfilePosts(fallbackData || []);
      }
    } catch (err) {
      console.error('Error loading my profile posts:', err);
      setMyProfilePosts([]);
    } finally {
      setMyProfilePostsLoading(false);
    }
  };

  const handleWorkflowLike = async (workflowId, isCurrentlyLiked) => {
    if (!user) { setShowAuthModal(true); return; }

    const likeDelta = isCurrentlyLiked ? -1 : 1;
    const previousLikes = [...userWorkflowLikes];

    // Optimistic update
    setExploreWorkflows(prev => prev.map(w =>
      w.id === workflowId ? { ...w, like_count: (w.like_count || 0) + likeDelta } : w
    ));
    setProfileWorkflows(prev => prev.map(w =>
      w.id === workflowId ? { ...w, like_count: (w.like_count || 0) + likeDelta } : w
    ));
    setMyProfileWorkflows(prev => prev.map(w =>
      w.id === workflowId ? { ...w, like_count: (w.like_count || 0) + likeDelta } : w
    ));

    try {
      if (isCurrentlyLiked) {
        setUserWorkflowLikes(prev => prev.filter(id => id !== workflowId));
        const { error } = await unlikeWorkflow(supabase, user.id, workflowId);
        if (error) throw error;
      } else {
        setUserWorkflowLikes(prev => [...prev, workflowId]);
        const { error } = await likeWorkflow(supabase, user.id, workflowId);
        if (error) {
          if (error.code === '23505') return;
          throw error;
        }
      }
    } catch (err) {
      console.error('Workflow like error:', err);
      setUserWorkflowLikes(previousLikes);
      setExploreWorkflows(prev => prev.map(w =>
        w.id === workflowId ? { ...w, like_count: (w.like_count || 0) - likeDelta } : w
      ));
    }
  };

  const handleWorkflowSave = async (workflowId, isCurrentlySaved) => {
    if (!user) { setShowAuthModal(true); return; }

    const previousSaves = [...userWorkflowSaves];

    try {
      if (isCurrentlySaved) {
        setUserWorkflowSaves(prev => prev.filter(id => id !== workflowId));
        const { error } = await unsaveWorkflow(supabase, user.id, workflowId);
        if (error) throw error;
      } else {
        setUserWorkflowSaves(prev => [...prev, workflowId]);
        const { error } = await saveWorkflow(supabase, user.id, workflowId);
        if (error) throw error;
      }
    } catch (err) {
      console.error('Workflow save error:', err);
      setUserWorkflowSaves(previousSaves);
    }
  };

  // Filter out moderation-removed posts
  const filterRemovedPosts = (postsArray) => {
    if (!postsArray) return [];
    return postsArray.filter(p => {
      const username = p.username || p.profiles?.username || '';
      const title = (p.title || '').toLowerCase();
      if (username === 'patotomastoledo000' && title === 'son todos putos?') return false;
      // Memes live only in the Memes tab — never in the general feeds. The
      // posts_with_stats view (and get_personalized_feed RPC) don't carry
      // tweet_url, so a tweet-meme would render blank as a normal post card.
      if (p.post_type === 'meme') return false;
      return true;
    });
  };

  const loadPosts = async () => {
    setLoading(true);

    // For logged-in users, try personalized feed with retry logic
    if (user) {
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const { data: feedData, error: feedError } = await supabase
            .rpc('get_personalized_feed', {
              p_user_id: user.id,
              p_limit: 500,
              p_offset: 0
            });

          if (!feedError && feedData && feedData.length > 0) {
            const filtered = filterRemovedPosts(feedData);
            setPosts(filtered);
            setLoading(false);
            loadPostCommunities();
            loadForkedPostOriginals(filtered);
            return;
          }

          // If RPC doesn't exist (42883) or returns empty, don't retry - fall through to standard feed
          if (feedError?.code === '42883' || (feedData && feedData.length === 0)) {
            break;
          }

          // For other errors, retry after a short delay
          if (feedError && attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }
        } catch (err) {
          // Network/transient errors - retry if attempts remaining
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }
          console.error('Personalized feed error after retries, falling back:', err);
        }
        break;
      }
    }

    // Fallback: standard chronological feed
    const { data } = await supabase
      .from('posts_with_stats')
      .select('*')
      .neq('post_type', 'learning_submission')
        .neq('post_type', 'meme')
      .order('created_at', { ascending: false })
      // 150 (was 500): nobody scrolls 500 posts deep in one page load, and the
      // over-fetch tripled feed payload + query time. Keyset pagination is the
      // real fix (redesign doc §B3) — this is the safe interim cap.
      .limit(150);

    // Enrich posts that have forked_from_post_id with original_post data
    // (posts_with_stats view now includes fork columns after migration)
    const filteredData = filterRemovedPosts(data);
    setPosts(filteredData);
    setLoading(false);
    loadPostCommunities();
    loadForkedPostOriginals(filteredData);
  };

  // Fetch builds separately so they aren't limited by the general feed cap
  const loadBuilds = async () => {
    const { data } = await supabase
      .from('posts_with_stats')
      .select('*')
      .neq('post_type', 'post')
      .neq('post_type', 'learning_submission')
        .neq('post_type', 'meme')
      .eq('is_question', false)
      .order('created_at', { ascending: false })
      .limit(150);

    if (data) {
      const filtered = filterRemovedPosts(data);
      setBuildPosts(filtered);
    }
  };

  // Fetch original post data for any forked/remixed posts in the feed
  const loadForkedPostOriginals = async (feedPosts) => {
    const forkedIds = feedPosts
      .filter(p => p.forked_from_post_id)
      .map(p => p.forked_from_post_id);

    if (forkedIds.length === 0) return;

    // Remove duplicates and IDs already in the feed
    const feedPostIds = new Set(feedPosts.map(p => p.id));
    const uniqueIds = [...new Set(forkedIds)].filter(id => !feedPostIds.has(id));

    if (uniqueIds.length === 0) {
      // All originals are already in the feed - build map from feed data
      const map = {};
      forkedIds.forEach(id => {
        const orig = feedPosts.find(p => p.id === id);
        if (orig) map[id] = orig;
      });
      setForkedPostsMap(prev => ({ ...prev, ...map }));
      return;
    }

    // Fetch missing original posts with profile data
    const { data: originals } = await supabase
      .from('posts')
      .select('*, profiles:user_id (id, username, display_name, avatar_emoji, avatar_url, name_color, builder_points), original_post:posts!posts_forked_from_post_id_fkey(id, title, description, prompt, prompt_steps, images, videos, ai_tool, tool_ids, created_at, user:profiles!posts_user_id_fkey(id, username, display_name, avatar_url, avatar_emoji))')
      .in('id', uniqueIds);

    if (originals) {
      const map = {};
      // Add posts from feed that are already available
      forkedIds.forEach(id => {
        const orig = feedPosts.find(p => p.id === id);
        if (orig) map[id] = orig;
      });
      // Add fetched originals (normalize profile data to flat format)
      originals.forEach(p => {
        map[p.id] = {
          ...p,
          username: p.profiles?.username || p.username,
          display_name: p.profiles?.display_name || p.display_name,
          avatar_emoji: p.profiles?.avatar_emoji || p.avatar_emoji,
          avatar_url: p.profiles?.avatar_url || p.avatar_url,
          name_color: p.profiles?.name_color || p.name_color
        };
      });
      setForkedPostsMap(prev => ({ ...prev, ...map }));
    }
  };

  const loadPostCommunities = async () => {
    // Load all community_posts mappings with community details
    const { data } = await supabase
      .from('community_posts')
      .select(`
        post_id,
        communities:community_id (
          id,
          name,
          slug,
          icon,
          is_paid
        )
      `);

    if (data) {
      // Create a map of post_id -> array of communities
      const mappings = {};
      data.forEach(cp => {
        if (!mappings[cp.post_id]) {
          mappings[cp.post_id] = [];
        }
        if (cp.communities) {
          mappings[cp.post_id].push(cp.communities);
        }
      });
      setPostCommunities(mappings);
    }
  };

  // Handler for header tab clicks - scrolls to top and conditionally refreshes
  const handleHeaderTabClick = (tab, subTab = null, isCurrentTab = false) => {
    // Scroll to top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // If clicking on the tab we're already on
    if (isCurrentTab) {
      const minutesSinceRefresh = (Date.now() - lastFeedRefreshTime) / (1000 * 60);
      // Only refresh if it's been more than 40 minutes
      if (minutesSinceRefresh >= 40) {
        loadPosts();
        loadBuilds();
        setLastFeedRefreshTime(Date.now());
      }
      // If less than 30 minutes, just scroll to top (no refresh)
      // Between 30-40 minutes, also just scroll to top (no refresh)
      return;
    }

    // Switching to a different tab
    setActiveTab(tab);
    if (subTab) {
      setFeedSubTab(subTab);
    }
    setSearchQuery('');
    setViewingUserId(null);
    // Clear search page so it doesn't persist across tabs
    setShowSearchPage(false);
    setSearchPageQuery('');
    // Clear explore search state when leaving explore
    if (tab !== 'explore') {
      setExploreSearchQuery('');
      setExploreSearchFocused(false);
      setExploreSearchActive(false);
      setExploreSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [], tools: [], categories: [] });
    }
    if (tab === 'communities') {
      setActiveCommunity(null);
    }
    // Update refresh time when switching tabs
    setLastFeedRefreshTime(Date.now());
  };

  const handleHomeContentTabClick = (contentTab) => {
    const isCurrentHomeTab = activeTab === 'foryou' && homeContentTab === contentTab && feedSubTab !== 'notifications';
    setHomeContentTab(contentTab);
    if (feedSubTab === 'notifications') {
      setFeedSubTab('foryou');
    }
    handleHeaderTabClick('foryou', null, isCurrentHomeTab);
  };

  // Navigate to search page
  const navigateToSearch = (query = '') => {
    setShowSearchPage(true);
    setSearchPageQuery(query);
    window.history.pushState({ searchPage: true }, '', `/search${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  };

  // Record a post view (debounced per post - won't double-count within session)
  const recordPostView = useCallback(async (postId, referrer = 'direct') => {
    if (!postId || viewedPostsRef.current.has(postId)) return;
    viewedPostsRef.current.add(postId);
    try {
      await supabase.rpc('record_post_view', { p_post_id: postId, p_referrer: referrer });
    } catch (err) {
      // Silently fail - view tracking is non-critical
      console.debug('View tracking:', err.message);
    }
  }, []);

  const loadStats = async () => {
    const { count: postCount } = await supabase.from('posts').select('*', { count: 'exact', head: true });
    const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    setStats({ posts: postCount || 0, users: userCount || 0 });
  };

  const loadAllUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_emoji, avatar_url, name_color, builder_points')
      .eq('is_suspended', false) // suspended accounts drop out of mentions/directory
      .order('created_at', { ascending: false });
    setAllUsers(data || []);
  };

  const loadUserLikes = async () => {
    if (!user) return;
    const { data } = await supabase.from('likes').select('post_id').eq('user_id', user.id);
    setUserLikes(data?.map(l => l.post_id) || []);
  };

  const loadUserSaves = async () => {
    if (!user) return;
    const { data } = await supabase.from('saved_posts').select('post_id').eq('user_id', user.id);
    setUserSaves(data?.map(s => s.post_id) || []);
  };

  const loadUserSavedPrompts = async () => {
    if (!user) return;
    const { data } = await supabase.from('saved_prompts').select('post_id').eq('user_id', user.id);
    setUserSavedPrompts(data?.map(s => s.post_id) || []);
  };

  // Schools data loading functions
  const loadSchoolLeaderboard = async () => {
    try {
      const { data, error } = await supabase.rpc('get_school_leaderboard');
      if (error) throw error;
      setSchoolLeaderboard(data || []);
    } catch (err) {
      console.error('Error loading school leaderboard:', err);
    }
  };

  // Builder Rank data loading
  const loadBuilderRanks = async () => {
    try {
      const { data, error } = await supabase
        .from('builder_ranks')
        .select('*')
        .order('min_points');
      if (!error && data) {
        setBuilderRanks(data);
      }
    } catch (err) {
      console.error('Error loading builder ranks:', err);
    }
  };

  const loadBuilderLeaderboard = async () => {
    setBuilderLeaderboardLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_builder_leaderboard', { p_limit: 50 });
      if (!error && data) {
        setBuilderLeaderboard(data);
      }
    } catch (err) {
      console.error('Error loading builder leaderboard:', err);
    }
    setBuilderLeaderboardLoading(false);
  };

  const loadSchoolDetails = async (slug) => {
    try {
      setSchoolsLoading(true);
      const { data, error } = await supabase.rpc('get_school_details', { school_slug: slug });
      if (error) throw error;
      if (data && data.length > 0) {
        setSchoolDetails(data[0]);
        // Load top creators (by builder rank points)
        try {
          const { data: schoolUsers } = await supabase
            .from('user_schools')
            .select('user_id')
            .eq('school_id', data[0].id);
          if (schoolUsers && schoolUsers.length > 0) {
            const userIds = schoolUsers.map(u => u.user_id);
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url, avatar_emoji, name_color, builder_points')
              .in('id', userIds);
            if (profiles && profiles.length > 0) {
              const creatorsWithPoints = profiles.map(p => ({
                ...p,
                user_id: p.id,
                builder_points: p.builder_points || 0
              }));
              creatorsWithPoints.sort((a, b) => b.builder_points - a.builder_points);
              setSchoolTopCreators(creatorsWithPoints.slice(0, 10));
            } else {
              setSchoolTopCreators([]);
            }
          } else {
            setSchoolTopCreators([]);
          }
        } catch (e) {
          console.error('Error loading top creators:', e);
          setSchoolTopCreators([]);
        }
        // Load school posts (recent and trending)
        loadSchoolPosts(data[0].id);
        loadSchoolTrendingPosts(data[0].id);
      }
    } catch (err) {
      console.error('Error loading school details:', err);
    } finally {
      setSchoolsLoading(false);
    }
  };

  const loadSchoolPosts = async (schoolId) => {
    setSchoolPostsLoading(true);
    try {
      // Get user IDs belonging to this school
      const { data: schoolUsers, error: usersError } = await supabase
        .from('user_schools')
        .select('user_id')
        .eq('school_id', schoolId);
      if (usersError) throw usersError;
      const userIds = (schoolUsers || []).map(u => u.user_id);
      if (userIds.length === 0) { setSchoolPosts([]); return; }
      const { data, error } = await supabase
        .from('posts_with_stats')
        .select('*')
        .in('user_id', userIds)
        .neq('post_type', 'learning_submission')
        .neq('post_type', 'meme')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error) {
        setSchoolPosts(data || []);
        loadForkedPostOriginals(data || []);
      }
    } catch (err) {
      console.error('Error loading school posts:', err);
    } finally {
      setSchoolPostsLoading(false);
    }
  };

  const loadSchoolTrendingPosts = async (schoolId) => {
    setSchoolTrendingLoading(true);
    try {
      // Get user IDs belonging to this school
      const { data: schoolUsers, error: usersError } = await supabase
        .from('user_schools')
        .select('user_id')
        .eq('school_id', schoolId);
      if (usersError) throw usersError;
      const userIds = (schoolUsers || []).map(u => u.user_id);
      if (userIds.length === 0) { setSchoolTrendingPosts([]); return; }
      const { data, error } = await supabase
        .from('posts_with_stats')
        .select('*')
        .in('user_id', userIds)
        .neq('post_type', 'learning_submission')
        .neq('post_type', 'meme')
        .gte('likes_count', 1)
        .order('likes_count', { ascending: false })
        .limit(50);
      if (!error) {
        setSchoolTrendingPosts(data || []);
        loadForkedPostOriginals(data || []);
      }
    } catch (err) {
      console.error('Error loading school trending posts:', err);
    } finally {
      setSchoolTrendingLoading(false);
    }
  };

  const loadSchoolMembers = async (schoolId) => {
    setSchoolMembersLoading(true);
    setShowSchoolMembersModal(true);
    try {
      const { data: members, error } = await supabase.rpc('get_school_members', {
        target_school_id: schoolId,
        lim: 50,
        off_set: 0
      });
      if (error) throw error;
      setSchoolMembers(members || []);
    } catch (err) {
      console.error('Error loading school members:', err);
      setSchoolMembers([]);
    } finally {
      setSchoolMembersLoading(false);
    }
  };

  const loadUserSchoolIdMap = async () => {
    const { data, error } = await supabase
      .from('user_schools')
      .select('user_id, school_id');
    if (error || !data) return;
    const map = {};
    for (const row of data) {
      if (row.user_id && row.school_id) map[row.user_id] = row.school_id;
    }
    setUserSchoolIdMap(map);
  };

  const loadUserSchool = async (userId) => {
    try {
      const { data, error } = await supabase.rpc('get_user_school', { target_user_id: userId });
      if (error) throw error;
      if (data && data.length > 0) {
        return data[0];
      }
      return null;
    } catch (err) {
      console.error('Error loading user school:', err);
      return null;
    }
  };

  const loadCurrentUserSchool = async () => {
    if (!user) return;
    const school = await loadUserSchool(user.id);
    setUserSchool(school);
  };

  const handleJoinSchool = async (schoolId) => {
    if (!user) { setShowAuthModal(true); return; }
    try {
      const { error } = await supabase
        .from('user_schools')
        .upsert({ user_id: user.id, school_id: schoolId }, { onConflict: 'user_id' });
      if (error) throw error;
      await loadCurrentUserSchool();
      if (viewingSchoolSlug) loadSchoolDetails(viewingSchoolSlug);
      loadSchoolLeaderboard();
    } catch (err) {
      console.error('Error joining school:', err);
    }
  };

  const handleLeaveSchool = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('user_schools')
        .delete()
        .eq('user_id', user.id);
      if (error) throw error;
      setUserSchool(null);
      if (viewingSchoolSlug) loadSchoolDetails(viewingSchoolSlug);
      loadSchoolLeaderboard();
    } catch (err) {
      console.error('Error leaving school:', err);
    }
  };

  const getUserSchoolCached = async (userId) => {
    if (userSchoolsCache[userId] !== undefined) return userSchoolsCache[userId];
    const school = await loadUserSchool(userId);
    setUserSchoolsCache(prev => ({ ...prev, [userId]: school }));
    return school;
  };

  const navigateToSchool = (slug) => {
    setViewingUserId(null);
    setActiveTab('explore');
    setViewingSchoolSlug(slug);
    setSchoolLeaderboardView(false);
    setViewingSchoolTab('trending');
    setSelectedFullPost(null);
    window.history.pushState({ schoolSlug: slug }, '', `/schools/${slug}`);
    window.scrollTo({ top: 0 });
    loadSchoolDetails(slug);
  };

  const loadToolPosts = async (toolId, sort = 'recent') => {
    setToolPostsLoading(true);
    const toolName = AI_TOOL_ID_TO_NAME[toolId] || viewingToolName || getToolDisplayName(toolId);

    const mergeUniquePosts = (...groups) => {
      const merged = groups.flat().filter(Boolean);
      return merged.filter((post, index, arr) => arr.findIndex(candidate => candidate.id === post.id) === index);
    };

    try {
      const { data, error } = await supabase.rpc('get_posts_by_tool', {
        p_tool_id: toolId,
        p_limit: 50,
        p_offset: 0,
        p_sort: sort
      });

      // Supplemental fallback: include legacy posts where ai_tool is populated but tool_ids is empty,
      // and handle environments where the RPC lags behind schema/data changes.
      const [toolIdMatches, aiToolMatches] = await Promise.all([
        supabase
          .from('posts_with_stats')
          .select('*')
          .contains('tool_ids', [toolId])
          .neq('post_type', 'learning_submission')
        .neq('post_type', 'meme')
          .eq('moderation_status', 'approved')
          .order(sort === 'trending' ? 'likes_count' : 'created_at', { ascending: false })
          .limit(50),
        supabase
          .from('posts_with_stats')
          .select('*')
          .ilike('ai_tool', `%${toolName}%`)
          .neq('post_type', 'learning_submission')
        .neq('post_type', 'meme')
          .eq('moderation_status', 'approved')
          .order(sort === 'trending' ? 'likes_count' : 'created_at', { ascending: false })
          .limit(50)
      ]);

      const mergedToolPosts = mergeUniquePosts(
        !error ? (data || []) : [],
        toolIdMatches.data || [],
        aiToolMatches.data || []
      );

      setToolPosts(mergedToolPosts);

      if (mergedToolPosts.length > 0) {
        loadForkedPostOriginals(mergedToolPosts);
      }
    } catch (err) {
      console.error('Error loading tool posts:', err);
      setToolPosts([]);
    }
    setToolPostsLoading(false);
  };

  const loadCategoryPosts = async (categoryId, sort = 'recent') => {
    setCategoryPostsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_posts_by_category', {
        p_category_id: categoryId,
        p_limit: 50,
        p_offset: 0,
        p_sort: sort
      });
      if (!error && data) {
        setCategoryPosts(data);
        loadForkedPostOriginals(data);
      } else {
        setCategoryPosts([]);
      }
    } catch (err) {
      console.error('Error loading category posts:', err);
      setCategoryPosts([]);
    }
    setCategoryPostsLoading(false);
  };

  const toolModelOptions = getModelsForTool(viewingToolId || viewingToolName);

  const matchesSelectedToolModel = (post) => {
    if (!selectedToolModelFilter) return true;
    const toolId = viewingToolId || AI_TOOL_NAME_TO_ID[viewingToolName] || normalizeToolKey(viewingToolName || '');
    const model = getModelForTool(post, toolId, viewingToolName);
    return model === selectedToolModelFilter;
  };

  const filteredToolPosts = (toolPosts || []).filter(matchesSelectedToolModel);
  const filteredToolSearchResults = (toolSearchResults || []).filter(matchesSelectedToolModel);
  const isToolQuestionsTab = toolViewTab === 'questions';
  const toolPostTypeFilter = (post) => isToolQuestionsTab ? post.is_question : !post.is_question;
  const displayedToolPosts = filteredToolPosts.filter(toolPostTypeFilter);
  const displayedToolSearchResults = filteredToolSearchResults.filter(toolPostTypeFilter);

  const navigateToTool = (toolName, model = '') => {
    const toolId = AI_TOOL_NAME_TO_ID[toolName] || toolName.toLowerCase().replace(/\s+/g, '-');
    const normalizedModel = model || '';
    const toolUrl = normalizedModel
      ? `/tool/${toolId}?model=${encodeURIComponent(normalizedModel)}`
      : `/tool/${toolId}`;

    // Save navigation origin so the back button returns the user to where they were
    setToolNavigationOrigin({
      activeTab,
      selectedFullPost: selectedFullPost,
      viewingUserId,
      url: window.location.pathname,
      scrollY: window.scrollY,
    });
    setActiveTab('explore');
    setViewingToolName(toolName);
    setViewingToolId(toolId);
    setExploreSubView('toolDetail');
    setToolViewTab('trending');
    setToolSearchQuery('');
    setToolSearchResults([]);
    setSelectedToolModelFilter(normalizedModel);
    setSelectedFullPost(null);
    setViewingUserId(null);
    setViewingSchoolSlug(null);
    setSchoolLeaderboardView(false);
    window.history.pushState({ toolId, model: normalizedModel }, '', toolUrl);
    window.scrollTo({ top: 0 });
  };

  const navigateToCategory = (categoryId) => {
    // Save navigation origin so the back button returns the user to where they
    // were (e.g. the profile they clicked from) rather than to Explore.
    const origin = {
      activeTab,
      viewingUserId,
      url: window.location.pathname,
      scrollY: window.scrollY,
    };
    setViewingUserId(null);
    setViewingSchoolSlug(null);
    setSchoolLeaderboardView(false);
    setSelectedFullPost(null);
    setExploreSubView(null);
    setActiveTab('explore');
    setCategoryViewTab('most-liked');
    setViewingCategoryId(categoryId);
    setCategoryNavigationOrigin(origin);
    window.scrollTo({ top: 0 });
  };

  const navigateToSchoolLeaderboard = () => {
    setSchoolLeaderboardView(true);
    setViewingSchoolSlug(null);
    window.history.pushState({ schoolLeaderboard: true }, '', `/schools/leaderboard`);
    window.scrollTo({ top: 0 });
  };

  const navigateToAchievements = (userId = null, highlightId = null) => {
    setActiveTab('achievements');
    setViewingAchievementsUserId(userId);
    setAchievementHighlightId(highlightId);
    _setSelectedFullPost(null);
    setViewingUserId(null);
    const path = userId ? `/achievements/${userId}` : '/achievements';
    const search = highlightId ? `?highlight=${encodeURIComponent(highlightId)}` : '';
    window.history.pushState({ achievementsUserId: userId }, '', `${path}${search}`);
    window.scrollTo({ top: 0 });
  };

  const loadExploreRandomPosts = async (reset = false) => {
    if (loadingMoreExplorePosts) return;
    setLoadingMoreExplorePosts(true);
    try {
      const offset = reset ? 0 : exploreRandomOffset;
      let query = supabase
        .from('posts_with_stats')
        .select('*')
        .neq('post_type', 'learning_submission')
        .neq('post_type', 'meme')
        .order('created_at', { ascending: false });
      if (user) {
        query = query.neq('user_id', user.id);
      }
      const { data, error } = await query.range(offset, offset + 9);
      if (!error && data) {
        const mapped = filterRemovedPosts(data);
        if (reset) {
          setExploreRandomPosts(mapped);
          setExploreRandomOffset(10);
        } else {
          setExploreRandomPosts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = mapped.filter(p => !existingIds.has(p.id));
            return [...prev, ...newPosts];
          });
          setExploreRandomOffset(prev => prev + 10);
        }
        loadForkedPostOriginals(mapped);
      }
    } catch (err) {
      console.error('Error loading explore posts:', err);
    } finally {
      setLoadingMoreExplorePosts(false);
    }
  };

  // Load explore random posts when explore tab is active
  useEffect(() => {
    if (activeTab === 'explore' && exploreRandomPosts.length === 0) {
      loadExploreRandomPosts(true);
    }
    if (activeTab === 'ranks') {
      if (builderLeaderboard.length === 0) loadBuilderLeaderboard();
    }
  }, [activeTab]);

  const loadUserFollows = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', user.id);
    if (error) {
      console.error('Error loading user follows:', error);
      return;
    }
    setUserFollows(data?.map(f => f.following_id) || []);
  };

  const loadNotifications = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        id,
        type,
        actor_id,
        post_id,
        comment_id,
        community_id,
        achievement_id,
        stream_id,
        data,
        is_read,
        created_at,
        profiles!notifications_actor_id_profiles_fkey (
          id,
          username,
          display_name,
          avatar_emoji,
          avatar_url,
          name_color
        ),
        posts!notifications_post_id_fkey (
          id,
          title
        ),
        comments!notifications_comment_id_fkey (
          id,
          content,
          post_id
        ),
        communities!notifications_community_id_fkey (
          id,
          name,
          slug
        ),
        achievement:achievements!achievement_id (
          id,
          name,
          icon,
          tier
        ),
        live_stream:live_streams!notifications_stream_id_fkey (
          id,
          title
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error loading notifications:', error);
    }
    setNotifications(data || []);
  };

  // Admin/mod action on a pending daily-reward claim from the notification feed.
  // Confirm awards the points server-side; deny rejects. Either way the server
  // clears the review notification from every admin, so we drop it locally too.
  const handleReviewDailyReward = async (notification, action) => {
    const claimUserId = notification?.data?.claim_user_id;
    const claimDate = notification?.data?.claim_date;
    if (!claimUserId || !claimDate) return;
    // Optimistically remove it from this admin's list.
    setNotifications(prev => prev.filter(n => n.id !== notification.id));
    try {
      const { data, error } = await supabase.rpc('review_daily_reward', {
        p_claim_user_id: claimUserId,
        p_claim_date: claimDate,
        p_action: action,
      });
      if (error) throw error;
      if (!data?.ok) {
        if (data?.error === 'already_reviewed') {
          addToast('Another mod already handled that one.', 'info');
        } else if (data?.error === 'not_authorized') {
          addToast('Only admins can review daily rewards.', 'error');
        } else {
          addToast('Could not process that review. Try again.', 'error');
        }
        return;
      }
      addToast(action === 'confirm' ? 'Reward confirmed — points awarded.' : 'Claim denied.', 'success');
    } catch (err) {
      console.error('review_daily_reward failed:', err);
      addToast('Could not process that review. Try again.', 'error');
      loadNotifications();
    }
  };

  // Admin-only: load the daily claims this admin personally approved.
  const loadApprovedClaims = async () => {
    setApprovedClaimsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_approved_daily_claims', { p_limit: 200 });
      if (error) throw error;
      setApprovedClaims(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('get_my_approved_daily_claims failed:', err);
      addToast('Could not load approved claims.', 'error');
    }
    setApprovedClaimsLoading(false);
  };

  const openApprovedClaims = () => {
    setShowApprovedClaims(true);
    loadApprovedClaims();
  };

  const markNotificationsAsRead = async () => {
    if (!user) return;
    // Update by user_id directly rather than the local `notifications` array —
    // this is called right after the async loadNotifications(), so the local
    // array is stale/empty and an id-based update would silently no-op. Flip
    // local state too so unread highlights clear immediately on open.
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  // Open the notifications view: load the list FIRST, then mark all read, so the
  // mark's all-read local state wins (avoids a race where load's setState lands
  // last and re-shows unread highlights).
  const openNotifications = async () => {
    await loadNotifications();
    await markNotificationsAsRead();
  };

  // A native push tap for a non-post notification dispatches this event
  // (src/lib/push.js). Open the in-feed notifications view, mirroring the bell.
  useEffect(() => {
    const open = () => {
      setActiveTab('foryou');
      setFeedSubTab('notifications');
      openNotifications();
    };
    window.addEventListener('prompted:open-notifications', open);
    return () => window.removeEventListener('prompted:open-notifications', open);
  }, [openNotifications]);

  // A native push tap for a go-live notification opens the Zeo tab on that stream.
  useEffect(() => {
    const openStream = (e) => {
      setActiveTab('live');
      const id = e?.detail?.streamId;
      if (id) setZoeOpenStreamId(id);
    };
    window.addEventListener('prompted:open-stream', openStream);
    return () => window.removeEventListener('prompted:open-stream', openStream);
  }, []);

  // Web Push (desktop): when the service worker handles a notification click on an
  // already-open tab, it postMessages here so we can deep-link inside the SPA. Also
  // handle the query params a freshly-opened tab lands on (sw.js openWindow).
  useEffect(() => {
    const onSwMessage = (event) => {
      if (event?.data?.type === 'prompted:notification-click') {
        routeFromData(event.data.data);
      }
    };
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }
    // Fresh-tab deep links from sw.js openWindow (/?notifications=1, /?stream=ID).
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('notifications') === '1') {
        window.dispatchEvent(new CustomEvent('prompted:open-notifications'));
        params.delete('notifications');
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      } else if (params.get('stream')) {
        window.dispatchEvent(new CustomEvent('prompted:open-stream', { detail: { streamId: params.get('stream') } }));
        params.delete('stream');
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      }
    } catch {
      /* ignore malformed URL */
    }
    return () => {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
    };
  }, []);

  const markSingleNotificationAsRead = async (notificationId) => {
    if (!user) return;

    // Optimistically update local state
    setNotifications(prev => prev.map(n =>
      n.id === notificationId ? { ...n, is_read: true } : n
    ));

    // Update in database
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
  };

  const handleNotificationClick = async (notification) => {
    // Mark as read
    if (!notification.is_read) {
      markSingleNotificationAsRead(notification.id);
    }

    // Navigate based on notification type
    switch (notification.type) {
      case 'follow':
        // Go to the actor's profile
        setViewingUserId(notification.actor_id);
        break;

      case 'post_like':
      case 'comment':
      case 'reply':
      case 'post_save':
      case 'repost':
        // Open the post - first try to find it in existing posts
        if (notification.post_id) {
          const existingPost = posts.find(p => p.id === notification.post_id);
          if (existingPost) {
            setSelectedFullPost(existingPost);
          } else {
            // Fetch the post from database with stats (likes_count, comments_count)
            const { data: post } = await supabase
              .from('posts_with_stats')
              .select('*')
              .eq('id', notification.post_id)
              .single();
            if (post) {
              setSelectedFullPost(post);
            }
          }
        }
        break;

      case 'comment_like':
        // For comment likes, navigate to the post where the comment is
        const postId = notification.comments?.post_id || notification.post_id;
        if (postId) {
          const existingPost = posts.find(p => p.id === postId);
          if (existingPost) {
            setSelectedFullPost(existingPost);
          } else {
            // Fetch the post from database with stats (likes_count, comments_count)
            const { data: post } = await supabase
              .from('posts_with_stats')
              .select('*')
              .eq('id', postId)
              .single();
            if (post) {
              setSelectedFullPost(post);
            }
          }
        }
        break;

      case 'community_join':
      case 'community_paid_request':
      case 'community_paid_approved':
        // Navigate to the community
        if (notification.communities) {
          setActiveTab('communities');
          selectCommunity(notification.communities);
        }
        break;

      case 'community_paid_denied':
        // Open appeal flow for the denied request
        if (notification.community_id) {
          (async () => {
            const { data: req } = await supabase
              .from('community_join_requests')
              .select('id, decision_note, community_id, communities:community_id ( name )')
              .eq('community_id', notification.community_id)
              .eq('user_id', user.id)
              .eq('status', 'denied')
              .order('decided_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (req) setAppealRequest({ ...req, communityName: req.communities?.name || 'this community' });
          })();
        }
        break;

      case 'linked_question':
        // Open the linked question post
        if (notification.post_id) {
          const existingPost = posts.find(p => p.id === notification.post_id);
          if (existingPost) {
            setSelectedFullPost(existingPost);
          } else {
            const { data: post } = await supabase
              .from('posts_with_stats')
              .select('*')
              .eq('id', notification.post_id)
              .single();
            if (post) {
              setSelectedFullPost(post);
            }
          }
        }
        break;

      case 'stream_live':
        // Open the Zeo tab and deep-link straight into the live stream.
        setActiveTab('live');
        if (notification.stream_id) setZoeOpenStreamId(notification.stream_id);
        break;

      case 'achievement_unlocked':
        navigateToAchievements(null, notification.achievement_id || null);
        break;

      case 'skills_feature_launch':
        // System announcement from Prompted. Open the user's own profile on
        // the Skills tab so they can tap "Add Skill". feedSubTab is left as
        // 'notifications' so Back/X from the profile returns here.
        if (user?.id) {
          setProfileInitialTab('skills');
          setViewingUserId(user.id);
        }
        break;

      default:
        // Default: go to actor's profile
        setViewingUserId(notification.actor_id);
    }
  };

  const loadUserFollowedCategories = async () => {
    if (!user) return;
    const { data } = await supabase.from('followed_categories').select('category_id').eq('user_id', user.id);
    setUserFollowedCategories(data?.map(f => f.category_id) || []);
  };

  // Read-only (soft-suspended) accounts can browse and DM but not create
  // content or interactions. This is a client-side courtesy gate — their
  // content is already hidden server-side — so we can show clear feedback
  // rather than a silent failure.
  const isReadOnlyAccount = !!profile?.is_suspended;
  const blockIfReadOnly = () => {
    if (isReadOnlyAccount) {
      addToast('Your account is read-only right now. Reach out to support if you think this is a mistake.', 'error');
      return true;
    }
    return false;
  };
  // Any of the ~15 compose entry points can flip showCreateModal on; catch a
  // read-only account here rather than gating each call site.
  useEffect(() => {
    if (showCreateModal && isReadOnlyAccount) {
      setShowCreateModal(false);
      addToast('Your account is read-only right now. Reach out to support if you think this is a mistake.', 'error');
    }
  }, [showCreateModal, isReadOnlyAccount]);

  // Self-serve account deletion (opened from Settings → Danger Zone).
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const handleSelfDeleteConfirm = async ({ contentMode, timing }) => {
    if (timing === 'immediate') {
      await deleteMyAccountNow({ mode: contentMode });
      addToast('Your account has been deleted.', 'success');
      setShowDeleteAccountModal(false);
      await handleLogout();
    } else {
      await scheduleMyAccountDeletion({ mode: contentMode });
      addToast('Account scheduled for deletion in 30 days. You can cancel from Settings.', 'success');
      setShowDeleteAccountModal(false);
      if (user) await loadProfile(user); // reflect the pending-deletion lock
    }
  };
  const handleCancelDeletion = async () => {
    await cancelMyAccountDeletion();
    if (user) await loadProfile(user);
  };

  const handleFollowCategory = async (categoryId, isCurrentlyFollowing) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (blockIfReadOnly()) return;

    // Store previous state for rollback
    const previousFollowedCategories = [...userFollowedCategories];

    try {
      if (isCurrentlyFollowing) {
        setUserFollowedCategories(prev => prev.filter(id => id !== categoryId));
        const { error } = await supabase.from('followed_categories').delete().eq('user_id', user.id).eq('category_id', categoryId);
        if (error) throw error;
      } else {
        setUserFollowedCategories(prev => [...prev, categoryId]);
        const { error } = await supabase.from('followed_categories').insert({ user_id: user.id, category_id: categoryId });
        if (error) throw error;
      }
    } catch (err) {
      console.error('Error updating category follow:', err);
      // Rollback on error
      setUserFollowedCategories(previousFollowedCategories);
    }
  };

  const handleFollow = async (targetUserId, isCurrentlyFollowing) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (blockIfReadOnly()) return;

    // Prevent following yourself
    if (targetUserId === user.id) {
      return;
    }

    // CRITICAL: Always verify profile exists in database before following
    // Don't trust local state - check DB directly to handle race conditions
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!existingProfile || profileCheckError) {
      // Profile doesn't exist in database - create it now
      const createdProfile = await loadProfile(user);
      if (!createdProfile) {
        console.error('Cannot follow: failed to create profile');
        addToast('Setting up your profile... Please try again in a moment.', 'error');
        return;
      }
    }

    // Store previous state for rollback
    const previousFollows = [...userFollows];

    try {
      if (isCurrentlyFollowing) {
        setUserFollows(prev => prev.filter(id => id !== targetUserId));
        const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetUserId);
        if (error) throw error;
        // Delete the follow notification
        await supabase.from('notifications').delete()
          .eq('user_id', targetUserId)
          .eq('actor_id', user.id)
          .eq('type', 'follow');
        // Sync state with database after successful unfollow
        await loadUserFollows();
      } else {
        // Check if already following to prevent duplicate
        if (userFollows.includes(targetUserId)) {
          return; // Already following, no action needed
        }
        setUserFollows(prev => [...prev, targetUserId]);
        const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: targetUserId });
        if (error) {
          // Check if error is due to unique constraint (already following)
          if (error.code === '23505') {
            // Already following - don't roll back, just reload follows to sync
            await loadUserFollows();
            return;
          }
          // Check if error is due to foreign key constraint (profile doesn't exist)
          if (error.code === '23503') {
            console.error('Foreign key error - profile may not exist:', error);
            // Try to create profile and retry
            const createdProfile = await loadProfile(user);
            if (createdProfile) {
              // Retry the follow
              const { error: retryError } = await supabase.from('follows').insert({ follower_id: user.id, following_id: targetUserId });
              if (!retryError) {
                await loadUserFollows();
                await supabase.from('notifications').insert({
                  user_id: targetUserId,
                  actor_id: user.id,
                  type: 'follow'
                });
                loadMyProfileFollowCounts(user.id);
                return;
              }
            }
          }
          throw error;
        }
        // Create a follow notification for the target user
        await supabase.from('notifications').insert({
          user_id: targetUserId,
          actor_id: user.id,
          type: 'follow'
        });
        // Sync state with database after successful follow
        await loadUserFollows();
      }
      // Refresh my profile follow counts
      loadMyProfileFollowCounts(user.id);
    } catch (err) {
      console.error('Error updating follow:', err);
      // Rollback on error
      setUserFollows(previousFollows);
      // Sync with database to ensure consistency
      await loadUserFollows();
    }
  };

  const loadCreators = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_emoji, bio, builder_points')
      .order('created_at', { ascending: false })
      .limit(20);
    setCreators(data || []);
  };

  // ============================================
  // COMMUNITIES API FUNCTIONS
  // ============================================
  const loadCommunities = async () => {
    const { data, error } = await supabase
      .from('communities_with_stats')
      .select('*')
      .eq('is_public', true)
      .order('member_count', { ascending: false });
    // On native cold-start the very first fetch can race the WebView's
    // network/session readiness and fail. Don't clobber a good list with an
    // empty one on error — just log and bail; the user-effect re-fetch (once
    // the session settles) will populate it. Swallowing this silently is what
    // made Communities show "No communities yet" in the Android app.
    if (error) {
      console.error('[Prompted] loadCommunities failed:', error.message || error);
      return;
    }
    const REMOVED_COMMUNITIES = ['eijrbi', 'name', 'community'];
    const filtered = (data || []).filter(c => !REMOVED_COMMUNITIES.includes(c.name?.toLowerCase()));
    setCommunities(filtered);
  };

  const loadUserCommunities = async () => {
    if (!user) return;
    try {
      const { data: memberships, error: membershipsError } = await supabase
        .from('community_members')
        .select('community_id')
        .eq('user_id', user.id);

      if (membershipsError) {
        console.error('Error loading user community memberships:', membershipsError);
        return;
      }

      if (memberships && memberships.length > 0) {
        const communityIds = memberships.map(m => m.community_id);
        const { data: userComms, error: commsError } = await supabase
          .from('communities_with_stats')
          .select('*')
          .in('id', communityIds);

        if (commsError) {
          console.error('Error loading user communities:', commsError);
          return;
        }
        const REMOVED_COMMUNITIES = ['eijrbi', 'name', 'community'];
        setUserCommunities((userComms || []).filter(c => !REMOVED_COMMUNITIES.includes(c.name?.toLowerCase())));
      } else {
        setUserCommunities([]);
      }
    } catch (err) {
      console.error('Error in loadUserCommunities:', err);
    }
  };

  const loadCommunityPosts = async (communityId, sort = 'hot') => {
    setCommunityLoading(true);
    try {
      // Get post IDs for this community
      const { data: communityPostLinks } = await supabase
        .from('community_posts')
        .select('post_id')
        .eq('community_id', communityId);

      if (!communityPostLinks || communityPostLinks.length === 0) {
        setCommunityPosts([]);
        return;
      }

      const postIds = communityPostLinks.map(cp => cp.post_id);

      // Get the full post data
      let query = supabase
        .from('posts_with_stats')
        .select('*')
        .in('id', postIds);

      // Apply sorting
      if (sort === 'hot') {
        query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data: postsData } = await query;
      setCommunityPosts(postsData || []);
      loadForkedPostOriginals(postsData || []);
    } catch (err) {
      console.error('Error loading community posts:', err);
      setCommunityPosts([]);
    } finally {
      setCommunityLoading(false);
    }
  };

  const joinCommunity = async (communityId, inviteCode = null) => {
    if (!user) {
      setShowAuthModal(true);
      return false;
    }

    try {
      // CRITICAL: Always ensure profile exists in database before joining
      // This handles race conditions where profile state exists but database row doesn't
      // This affects email/password users especially since their profile creation is async
      let profileData = profile;

      // Check if profile exists in database (don't just trust state)
      const { data: existingProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!existingProfile || profileCheckError) {
        // Profile doesn't exist in database - create it now
        const createdProfile = await loadProfile(user);
        if (!createdProfile) {
          console.error('Cannot join community: failed to create profile');
          addToast('Setting up your profile... Please try again in a moment.', 'error');
          return false;
        }
        profileData = createdProfile;
      }

      // First check if community is private/paid and get creator_id for notification
      const { data: community, error: communityFetchError } = await supabase
        .from('communities')
        .select('*')
        .eq('id', communityId)
        .maybeSingle();
      console.log('[joinCommunity] fetched community', { communityId, community, communityFetchError });

      // If community is private, validate invite code
      if (community?.is_private) {
        if (!inviteCode) {
          return false;
        }
        if (inviteCode.toUpperCase() !== community.invite_code) {
          return false;
        }
      }

      // If community is paid, open the paid-join modal instead of inserting membership
      if (community?.is_paid) {
        const { data: existingReq } = await supabase
          .from('community_join_requests')
          .select('id, status')
          .eq('community_id', communityId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (existingReq?.status === 'approved') {
          // Approval already happened — but only fall through if the member row still exists.
          // If the user left, the member row is gone and a direct INSERT would hit RLS (42501).
          // In that case treat it as a fresh subscription and open the paid-join modal.
          const { data: memberRow } = await supabase
            .from('community_members')
            .select('id')
            .eq('community_id', communityId)
            .eq('user_id', user.id)
            .maybeSingle();
          if (!memberRow) {
            setPaidJoinCommunity({ ...community, existingRequest: null });
            return false;
          }
        } else {
          setPaidJoinCommunity({ ...community, existingRequest: existingReq || null });
          return false;
        }
      }

      // Check if already a member to prevent duplicates
      const { data: existingMember } = await supabase
        .from('community_members')
        .select('id')
        .eq('community_id', communityId)
        .eq('user_id', user.id)
        .single();

      if (existingMember) {
        // Already a member, just reload to sync state
        await loadUserCommunities();
        addToast('You are already a member of this community!', 'info');
        return true;
      }

      const { error } = await supabase
        .from('community_members')
        .insert({
          community_id: communityId,
          user_id: user.id,
          role: 'member'
        });

      if (error) {
        // Handle duplicate membership error
        if (error.code === '23505') {
          await loadUserCommunities();
          addToast('You are already a member of this community!', 'info');
          return true;
        }
        // Handle foreign key error - try to create profile and retry
        if (error.code === '23503') {
          console.log('Foreign key error - attempting to create profile and retry');
          const createdProfile = await loadProfile(user);
          if (createdProfile) {
            const { error: retryError } = await supabase
              .from('community_members')
              .insert({
                community_id: communityId,
                user_id: user.id,
                role: 'member'
              });
            if (!retryError) {
              await loadCommunities();
              await loadUserCommunities();
              addToast('Welcome to the community!', 'success');
              return true;
            }
          }
          addToast('Please try again in a moment while your profile is being set up.', 'error');
          return false;
        }
        throw error;
      }

      // Create a community join notification for the community creator (don't notify yourself)
      if (community?.creator_id && community.creator_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: community.creator_id,
          actor_id: user.id,
          type: 'community_join',
          community_id: communityId
        });
      }

      // Reload communities
      await loadCommunities();
      await loadUserCommunities();

      // Update active community if viewing one
      if (activeCommunity?.id === communityId) {
        const { data: updatedCommunity } = await supabase
          .from('communities_with_stats')
          .select('*')
          .eq('id', communityId)
          .single();
        if (updatedCommunity) setActiveCommunity(updatedCommunity);
      }

      addToast('Welcome to the community!', 'success');
      return true;
    } catch (err) {
      console.error('Error joining community:', err);
      addToast('Failed to join community. Please try again.', 'error');
      // Ensure state is synced with database
      await loadUserCommunities();
      return false;
    }
  };

  const openInviteCodeModal = (community) => {
    setInviteCodeCommunity(community);
    setShowInviteCodeModal(true);
  };

  const leaveCommunity = async (communityId) => {
    if (!user) return;

    try {
      // Check if user is the creator
      const { data: community } = await supabase
        .from('communities')
        .select('creator_id')
        .eq('id', communityId)
        .single();

      const isCreator = community && community.creator_id === user.id;

      if (isCreator) {
        // If creator is leaving, transfer ownership to the second member (oldest join date after creator)
        const { data: members } = await supabase
          .from('community_members')
          .select('user_id, joined_at')
          .eq('community_id', communityId)
          .neq('user_id', user.id)
          .order('joined_at', { ascending: true })
          .limit(1);

        if (members && members.length > 0) {
          // Transfer ownership to the second oldest member
          const newOwnerId = members[0].user_id;
          const { error: transferError } = await supabase.rpc('transfer_community_ownership', {
            p_community_id: communityId,
            p_new_owner_id: newOwnerId,
          });

          if (transferError) throw transferError;
        } else {
          // No other members, delete the community instead
          await handleDeleteCommunity(communityId);
          return;
        }
      }

      // Remove user from community
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', communityId)
        .eq('user_id', user.id);

      if (error) throw error;

      // For paid communities, clear prior join requests so re-joining requires a new payment.
      // Why: leaving without this leaves an orphan approved request, which then makes
      // joinCommunity fall through to a direct INSERT that RLS rejects (42501).
      await supabase
        .from('community_join_requests')
        .delete()
        .eq('community_id', communityId)
        .eq('user_id', user.id);

      // Reload communities
      await loadCommunities();
      await loadUserCommunities();

      // Update active community if viewing one
      if (activeCommunity?.id === communityId) {
        const { data: updatedCommunity } = await supabase
          .from('communities_with_stats')
          .select('*')
          .eq('id', communityId)
          .single();
        if (updatedCommunity) setActiveCommunity(updatedCommunity);
      }
    } catch (err) {
      console.error('Error leaving community:', err);
    }
  };

  const loadCommunityRules = async (communityId) => {
    const { data } = await supabase
      .from('community_rules')
      .select('*')
      .eq('community_id', communityId)
      .order('rule_number');
    setCommunityRules(data || []);
  };

  const selectCommunity = async (community) => {
    // Always fetch full community data with stats to ensure correct member/post counts
    const { data: fullCommunity } = await supabase
      .from('communities_with_stats')
      .select('*')
      .eq('id', community.id)
      .single();
    const resolved = fullCommunity || community;
    setActiveCommunity(resolved);
    // Reflect the community in the URL so it's shareable and refresh-safe.
    if (resolved.slug) {
      const target = `/community/${resolved.slug}`;
      if (window.location.pathname !== target) {
        window.history.pushState({ communitySlug: resolved.slug }, '', target);
      }
    }
    // Scroll to top so user sees community header first with channels tab pre-selected
    window.scrollTo({ top: 0, behavior: 'instant' });
    await loadCommunityPosts(community.id, communityPostSort);
    await loadCommunityRules(community.id);
  };

  const removePostFromCommunity = async (post) => {
    if (!user || !activeCommunity) return;

    // Verify user is the community creator
    if (user.id !== activeCommunity.creator_id) return;

    try {
      const { error } = await supabase
        .from('community_posts')
        .delete()
        .eq('community_id', activeCommunity.id)
        .eq('post_id', post.id);

      if (error) throw error;

      // Update local state
      setCommunityPosts(prev => prev.filter(p => p.id !== post.id));

      // Reload communities to update post counts
      await loadCommunities();
      await loadUserCommunities();

      // Update active community
      const { data: updatedCommunity } = await supabase
        .from('communities_with_stats')
        .select('*')
        .eq('id', activeCommunity.id)
        .single();
      if (updatedCommunity) setActiveCommunity(updatedCommunity);
    } catch (err) {
      console.error('Error removing post from community:', err);
    }
  };

  // Load community posts when sort changes
  useEffect(() => {
    if (activeCommunity) {
      loadCommunityPosts(activeCommunity.id, communityPostSort);
    }
  }, [communityPostSort]);

  const handleDeletePost = async (post) => {
    const isAdmin = ADMIN_USERNAMES.includes(profile?.username);
    const isOwner = user && user.id === post.user_id;
    if (!user || (!isOwner && !isAdmin)) return;

    try {
      if (isOwner) {
        // Owner path: the `auth.uid() = user_id` RLS DELETE policy allows this.
        // (likes/comments/saved_posts/community_posts all cascade via FK, but the
        // explicit unlinks are kept as a harmless belt-and-suspenders.)
        await supabase.from('community_posts').delete().eq('post_id', post.id);
        await supabase.from('saved_posts').delete().eq('post_id', post.id);
        const { error } = await supabase.from('posts').delete().eq('id', post.id);
        if (error) throw error;
      } else {
        // Admin override: RLS blocks deleting another user's post, so the direct
        // delete silently removes 0 rows and the post reappears on refresh. Go
        // through the SECURITY DEFINER RPC, which checks is_admin() server-side.
        const { data: deletedId, error } = await supabase.rpc('admin_delete_post', { p_post_id: post.id });
        if (error) throw error;
        if (!deletedId) throw new Error('Post was not deleted (not found, or not permitted)');
      }

      // Delete images/videos from storage if they exist
      if (post.images && post.images.length > 0) {
        for (const imageUrl of post.images) {
          try {
            await deleteImage(supabase, imageUrl, 'post-images');
          } catch (imgErr) {
            console.error('Error deleting image:', imgErr);
          }
        }
      }
      if (post.videos && post.videos.length > 0) {
        for (const video of post.videos) {
          try {
            if (video?.url) await deleteImage(supabase, video.url, 'post-videos');
          } catch (videoErr) {
            console.error('Error deleting video:', videoErr);
          }
        }
      }

      // Builder-points deduction handled server-side by trg_builder_points_posts.
      // Refresh local profile so the UI reflects the trigger's update.
      const isBuild = !post.is_question && post.post_type !== 'post';
      if (isBuild && post.user_id === user.id) {
        try {
          const { data: updatedProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
          if (updatedProfile) setProfile(updatedProfile);
        } catch (refreshErr) {
          console.error('Error refreshing profile after build delete:', refreshErr);
        }
      }

      // Update local state
      setPosts(prev => prev.filter(p => p.id !== post.id));
      setCommunityPosts(prev => prev.filter(p => p.id !== post.id));
      setMyProfilePosts(prev => prev.filter(p => p.id !== post.id));
      setUserSaves(prev => prev.filter(id => id !== post.id));
      setUserLikes(prev => prev.filter(id => id !== post.id));

    } catch (err) {
      console.error('Error deleting post:', err);
    }
  };

  const handlePinPost = async (postId) => {
    if (!user) return;
    const isPinned = myProfilePinnedIds.includes(postId);
    const newPinnedIds = isPinned
      ? myProfilePinnedIds.filter(id => id !== postId)
      : [...myProfilePinnedIds, postId].slice(-5); // max 5 pinned
    setMyProfilePinnedIds(newPinnedIds);
    await supabase.from('profiles').update({ pinned_post_ids: newPinnedIds }).eq('id', user.id);
  };

  const handleDeleteCommunity = async (communityId) => {
    if (!user) return;

    try {
      // First verify the user is the creator
      const { data: community } = await supabase
        .from('communities')
        .select('creator_id')
        .eq('id', communityId)
        .single();

      if (!community || community.creator_id !== user.id) {
        console.error('Not authorized to delete this community');
        return;
      }

      // Delete community_posts (unlink posts from community)
      await supabase.from('community_posts').delete().eq('community_id', communityId);

      // Delete community_members
      await supabase.from('community_members').delete().eq('community_id', communityId);

      // Delete the community itself
      const { error } = await supabase.from('communities').delete().eq('id', communityId);
      if (error) throw error;

      // Update local state
      setCommunities(prev => prev.filter(c => c.id !== communityId));
      setUserCommunities(prev => prev.filter(c => c.id !== communityId));
      setActiveCommunity(null);
      setActiveTab('communities');

    } catch (err) {
      console.error('Error deleting community:', err);
    }
  };

  const handleLike = async (postId, isCurrentlyLiked) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (blockIfReadOnly()) return;

    // Check if already liked to prevent duplicate
    if (!isCurrentlyLiked && userLikes.includes(postId)) {
      return; // Already liked, no action needed
    }

    // Optimistic UI update - update posts state directly to avoid scroll jump
    const likeDelta = isCurrentlyLiked ? -1 : 1;
    setPosts(prev => prev.map(post =>
      post.id === postId
        ? { ...post, likes_count: post.likes_count + likeDelta }
        : post
    ));
    // Also update communityPosts state so likes reflect in community tab
    setCommunityPosts(prev => prev.map(post =>
      post.id === postId
        ? { ...post, likes_count: post.likes_count + likeDelta }
        : post
    ));
    // Also update exploreRandomPosts state so likes reflect in Discover More
    setExploreRandomPosts(prev => prev.map(post =>
      post.id === postId
        ? { ...post, likes_count: (post.likes_count || 0) + likeDelta }
        : post
    ));
    // Also update categoryPosts state so likes reflect in categories tab
    setCategoryPosts(prev => prev.map(post =>
      post.id === postId
        ? { ...post, likes_count: (post.likes_count || 0) + likeDelta }
        : post
    ));
    // Also update toolPosts state so likes reflect in tools tab
    setToolPosts(prev => prev.map(post =>
      post.id === postId
        ? { ...post, likes_count: (post.likes_count || 0) + likeDelta }
        : post
    ));
    // Also update selectedFullPost so likes reflect in full post view
    _setSelectedFullPost(prev => prev && prev.id === postId
      ? { ...prev, likes_count: (prev.likes_count || 0) + likeDelta }
      : prev
    );
    // Also update buildPosts state so likes reflect in builds tab
    setBuildPosts(prev => prev.map(post =>
      post.id === postId
        ? { ...post, likes_count: (post.likes_count || 0) + likeDelta }
        : post
    ));
    // Also update myProfilePosts state so likes reflect in own profile
    setMyProfilePosts(prev => prev.map(post =>
      post.id === postId
        ? { ...post, likes_count: (post.likes_count || 0) + likeDelta }
        : post
    ));

    // Store previous state for rollback
    const previousLikes = [...userLikes];

    // Find the post owner for notification (check all post lists)
    const post = posts.find(p => p.id === postId) || communityPosts.find(p => p.id === postId) || exploreRandomPosts.find(p => p.id === postId) || categoryPosts.find(p => p.id === postId) || toolPosts.find(p => p.id === postId) || buildPosts.find(p => p.id === postId);
    const postOwnerId = post?.user_id;

    try {
      if (isCurrentlyLiked) {
        setUserLikes(prev => prev.filter(id => id !== postId));
        const { error } = await supabase.from('likes').delete().eq('user_id', user.id).eq('post_id', postId);
        if (error) throw error;
        // Delete the like notification
        if (postOwnerId && postOwnerId !== user.id) {
          await supabase.from('notifications').delete()
            .eq('user_id', postOwnerId)
            .eq('actor_id', user.id)
            .eq('type', 'post_like')
            .eq('post_id', postId);
        }
      } else {
        setUserLikes(prev => [...prev, postId]);
        const { error } = await supabase.from('likes').insert({ user_id: user.id, post_id: postId });
        if (error) {
          // Check if error is due to unique constraint (already liked)
          if (error.code === '23505') {
            // Already liked - don't roll back, just reload likes to sync
            await loadUserLikes();
            return;
          }
          throw error;
        }
        // Create a like notification for the post owner (don't notify yourself)
        if (postOwnerId && postOwnerId !== user.id) {
          await supabase.from('notifications').insert({
            user_id: postOwnerId,
            actor_id: user.id,
            type: 'post_like',
            post_id: postId
          });
        }
      }
    } catch (err) {
      console.error('Error updating like:', err);
      // Rollback optimistic updates on error
      setUserLikes(previousLikes);
      setPosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, likes_count: post.likes_count - likeDelta }
          : post
      ));
      setCommunityPosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, likes_count: post.likes_count - likeDelta }
          : post
      ));
      setCategoryPosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, likes_count: post.likes_count - likeDelta }
          : post
      ));
      setToolPosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, likes_count: post.likes_count - likeDelta }
          : post
      ));
      // Rollback exploreRandomPosts
      setExploreRandomPosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, likes_count: (post.likes_count || 0) - likeDelta }
          : post
      ));
      // Rollback selectedFullPost
      _setSelectedFullPost(prev => prev && prev.id === postId
        ? { ...prev, likes_count: (prev.likes_count || 0) - likeDelta }
        : prev
      );
      // Rollback buildPosts
      setBuildPosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, likes_count: (post.likes_count || 0) - likeDelta }
          : post
      ));
      // Rollback myProfilePosts
      setMyProfilePosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, likes_count: (post.likes_count || 0) - likeDelta }
          : post
      ));
    }
  };

  const handleSave = async (postId, isCurrentlySaved) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    // Store previous state for rollback
    const previousSaves = [...userSaves];

    try {
      if (isCurrentlySaved) {
        setUserSaves(prev => prev.filter(id => id !== postId));
        const { error } = await supabase.from('saved_posts').delete().eq('user_id', user.id).eq('post_id', postId);
        if (error) throw error;
      } else {
        setUserSaves(prev => [...prev, postId]);
        const { error } = await supabase.from('saved_posts').insert({ user_id: user.id, post_id: postId });
        if (error) throw error;

        // Create notification for post owner
        const post = posts.find(p => p.id === postId) || exploreRandomPosts.find(p => p.id === postId);
        if (post && post.user_id !== user.id) {
          await supabase.from('notifications').insert({
            user_id: post.user_id,
            type: 'post_save',
            actor_id: user.id,
            post_id: postId,
            is_read: false
          });
        }
      }
    } catch (err) {
      console.error('Error updating save:', err);
      // Rollback on error
      setUserSaves(previousSaves);
    }
  };

  const handleSavePrompt = async (postId, isCurrentlySaved) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    const previousSaved = [...userSavedPrompts];

    try {
      if (isCurrentlySaved) {
        setUserSavedPrompts(prev => prev.filter(id => id !== postId));
        const { error } = await supabase.from('saved_prompts').delete().eq('user_id', user.id).eq('post_id', postId);
        if (error) throw error;
      } else {
        setUserSavedPrompts(prev => [...prev, postId]);
        const { error } = await supabase.from('saved_prompts').insert({ user_id: user.id, post_id: postId });
        if (error) throw error;
      }
    } catch (err) {
      console.error('Error updating saved prompt:', err);
      // Rollback on error
      setUserSavedPrompts(previousSaved);
    }
  };

  const handleCommentAdded = (postId) => {
    // Update comment count locally without reloading all posts
    // This prevents the UI from resetting and collapsing comments
    setPosts(prevPosts =>
      prevPosts.map(post =>
        post.id === postId
          ? { ...post, comments_count: (post.comments_count || 0) + 1 }
          : post
      )
    );
    // Also update exploreRandomPosts state
    setExploreRandomPosts(prev =>
      prev.map(post =>
        post.id === postId
          ? { ...post, comments_count: (post.comments_count || 0) + 1 }
          : post
      )
    );
  };

  const handleLogout = async () => {
    if (user?.id) removeAccount(user.id);
    // Clear UI state FIRST so logout is instant and reliable even if the auth
    // lock is contended or signOut stalls on the network — previously we awaited
    // signOut() before clearing state, so a stuck lock made Log Out do nothing.
    setUser(null);
    setProfile(null);
    setOnboardingCompleted(null);
    setUserLikes([]);
    setSavedAccounts(getSavedAccounts());
    // scope:'local' clears the stored session without a server round-trip; race
    // it with a short timeout so a hang can't block us.
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch (e) {
      console.warn('signOut failed; clearing stored session directly', e);
    }
    // Belt-and-suspenders: make sure the persisted session is gone so a refresh
    // can't silently restore the account.
    try { localStorage.removeItem('prompted-auth'); } catch {}
  };

  // Account switcher (X-style) — see src/lib/accountStore.js
  const [savedAccounts, setSavedAccounts] = useState(() => getSavedAccounts());
  const handleSwitchAccount = async (account) => {
    if (account.user_id === user?.id) return;
    const res = await switchToAccount(account);
    if (!res.ok) {
      addToast(res.error || 'Could not switch — please log in again', 'error');
      setSavedAccounts(getSavedAccounts());
      setShowAuthModal(true);
    }
  };
  const handleAddAccount = async () => {
    await signOutKeepingSaved();
    setUser(null);
    setProfile(null);
    setSavedAccounts(getSavedAccounts());
    setShowAuthModal(true);
  };
  const handleRemoveSavedAccount = (userId) => {
    removeAccount(userId);
    setSavedAccounts(getSavedAccounts());
  };

  // Re-save the active account whenever the profile updates, so display name /
  // avatar in the switcher stay fresh.
  useEffect(() => {
    if (!user || !profile) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id === user.id) {
        saveAccount({ session, profile });
        setSavedAccounts(getSavedAccounts());
      }
    });
  }, [user?.id, profile?.username, profile?.display_name, profile?.avatar_url, profile?.avatar_emoji, profile?.name_color]);

  const filteredPosts = posts.filter(post => {
    // Support both single category_id and multi-category category_ids
    const postCategoryIds = post.category_ids || [post.category_id];
    const matchesCategory = activeCategory === 'all' || postCategoryIds.includes(activeCategory);
    const matchesSearch = !searchQuery ||
      post.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.ai_tool?.toLowerCase().includes(searchQuery.toLowerCase());

    if (activeTab === 'foryou') {
      // For You feed: Include posts from followed users, followed categories, and user's communities
      if (user) {
        // Check if post is from a followed user
        const isFromFollowedUser = userFollows.includes(post.user_id);
        if (isFromFollowedUser) return matchesSearch;

        // Check if post is from a followed category
        const matchesFollowedCategory = userFollowedCategories.length > 0 &&
          postCategoryIds.some(catId => userFollowedCategories.includes(catId));
        if (matchesFollowedCategory) return matchesSearch;

        // Check if post is from a community the user is in
        const userCommunityIds = userCommunities.map(c => c.id);
        const postCommunitiesList = postCommunities[post.id] || [];
        const isFromUserCommunity = postCommunitiesList.some(pc => userCommunityIds.includes(pc.id));
        if (isFromUserCommunity) return matchesSearch;

        // If user has preferences but post doesn't match any, still include for discovery
        if (userFollows.length === 0 && userFollowedCategories.length === 0 && userCommunities.length === 0) {
          return matchesSearch;
        }

        // Include some recommended posts from other creators for discovery
        return matchesSearch;
      }
      return matchesSearch;
    }
    if (activeTab === 'explore') {
      return matchesCategory && matchesSearch;
    }
    return matchesSearch;
  });

  // Sort all posts for the For You feed in pure chronological order (newest first)
  const sortedPosts = activeTab === 'foryou'
    ? [...filteredPosts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    : filteredPosts;

  // Re-shuffle counter for the Random tab — bumping this in onClick gives
  // the user a "shuffle again" without changing data sources.
  const [randomReshuffle, setRandomReshuffle] = useState(0);
  // Cached shuffled list. Held in state (not derived) so pagination /
  // realtime updates to the post pool don't reshuffle on every scroll —
  // it only refreshes when the user explicitly rerolls or re-enters the tab.
  const [randomFeed, setRandomFeed] = useState([]);

  // Chronological pool — the data source before sort modes are applied.
  const homeFeedBase = useMemo(() => {
    if (homeContentTab === 'builds') {
      // Use dedicated builds feed so builds aren't limited by the general feed cap
      const searchFiltered = searchQuery
        ? buildPosts.filter(post =>
            post.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            post.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            post.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            post.ai_tool?.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : buildPosts;
      return [...searchFiltered].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    const basePosts = sortedPosts.filter(post => !post.is_question);
    return homeContentTab === 'posts'
      ? basePosts.filter(post => post.post_type === 'post')
      : basePosts;
  }, [sortedPosts, homeContentTab, buildPosts, searchQuery]);

  // Reroll the random feed only when the user enters the tab or clicks shuffle.
  // Deliberately NOT depending on homeFeedBase / userLikes — those change on
  // scroll-pagination and like-toggles, and we don't want either to reshuffle.
  useEffect(() => {
    if (feedSubTab === 'random') {
      setRandomFeed(applyFeedSort(homeFeedBase, 'random', userLikes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedSubTab, randomReshuffle]);

  const homeFeedPosts = useMemo(() => {
    if (feedSubTab === 'top' || feedSubTab === 'unliked') {
      return applyFeedSort(homeFeedBase, feedSubTab, userLikes);
    }
    if (feedSubTab === 'random') return randomFeed;
    return homeFeedBase;
  }, [homeFeedBase, feedSubTab, userLikes, randomFeed]);

  const followingFeedPosts = useMemo(() => {
    if (!user) return [];

    if (homeContentTab === 'builds') {
      // Use dedicated builds feed for following tab too
      return buildPosts
        .filter(post => userFollows.includes(post.user_id))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    return posts
      .filter(post => userFollows.includes(post.user_id) && !post.is_question)
      .filter(post => {
        if (homeContentTab === 'posts') return post.post_type === 'post';
        return true;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [posts, buildPosts, userFollows, user, homeContentTab]);

  const filteredCreators = creators.filter(creator =>
    !creatorSearch || creator.username?.toLowerCase().includes(creatorSearch.toLowerCase())
  );

  return (
    <AuthContext.Provider value={{ user, profile, onboardingCompleted, userSchoolIdMap, savedPromptIds: userSavedPrompts, toggleSavePrompt: handleSavePrompt }}>
        <NotificationListener user={user} setNotifications={setNotifications} />
        <AchievementsRealtimeProvider
          user={user}
          onNavigateToAchievements={() => navigateToAchievements(null)}
        >
        {/* Global styles now load via src/appStyles.css (imported at top) */}
        {/* Onboarding Guard: block all routes for new users */}
        {user && onboardingCompleted === false ? (
          <OnboardingWizardWrapper
            user={user}
            profile={profile}
            supabase={supabase}
            onComplete={async () => {
              setOnboardingCompleted(true);
              await loadProfile(user.id);
              window.history.replaceState({}, '', '/');
            }}
          />
        ) : (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('landing') === '1') || (!user && !landingDismissed) ? (
          <>
            {pendingShareCommunity && (
              <div className="community-invite-banner">
                <div className="community-invite-banner-inner">
                  <div className="community-invite-banner-icon">
                    {pendingShareCommunity.icon_url ? (
                      <img src={pendingShareCommunity.icon_url} alt="" />
                    ) : (
                      <span>{pendingShareCommunity.icon || '🌟'}</span>
                    )}
                  </div>
                  <div className="community-invite-banner-text">
                    <div className="community-invite-banner-label">You're invited to join</div>
                    <div className="community-invite-banner-name">{pendingShareCommunity.name}</div>
                  </div>
                  <button
                    className="btn-join-community"
                    onClick={() => setShowAuthModal(true)}
                  >
                    Sign up to join
                  </button>
                </div>
              </div>
            )}
            <LandingPage
              onSignUp={() => setShowAuthModal(true)}
              onLogin={() => setShowAuthModal(true)}
              onBrowseAsGuest={() => {
                setLandingDismissed(true);
              }}
              onStartExploring={() => {
                setActiveTab('foryou');
                setHomeContentTab('builds');
                setLandingDismissed(true);
              }}
              onSeeTrending={() => {
                setActiveTab('explore');
                setLandingDismissed(true);
                const tryScroll = (attempts) => {
                  const el = document.getElementById('explore-trending');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  } else if (attempts < 25) {
                    setTimeout(() => tryScroll(attempts + 1), 200);
                  }
                };
                setTimeout(() => tryScroll(0), 100);
              }}
              onPillarClick={(key) => {
                if (key === 'builds') {
                  setActiveTab('foryou');
                  setHomeContentTab('builds');
                } else if (key === 'discussion') {
                  setActiveTab('foryou');
                  setHomeContentTab('posts');
                } else if (key === 'questions') {
                  setActiveTab('questions');
                } else if (key === 'communities') {
                  setActiveTab('communities');
                }
                setLandingDismissed(true);
              }}
              onFooterLink={(target) => {
                if (target === 'about' || target === 'privacy' || target === 'terms') {
                  setActiveTab(target);
                  setLandingDismissed(true);
                  window.scrollTo({ top: 0, behavior: 'auto' });
                }
              }}
            />
            <AuthModal
              isOpen={showAuthModal}
              onClose={() => setShowAuthModal(false)}
              onSuccess={(newUser) => {
                setUser(newUser);
                loadProfile(newUser.id);
                setLandingDismissed(true);
              }}
            />
          </>
        ) : (
        <div className={`app-container app-with-sidebar`}>
          <div className="bg-gradient" />

          {/* July 2 migration notice — big sticky bottom banner, dismissible
              with a persistent "don't show again" toggle. Auto-retires after
              the maintenance window. */}
          <MaintenanceBanner currentUser={user} addToast={addToast} isAdmin={isPlatformAdmin} />

          {/* Left Sidebar Navigation */}
          <LeftSidebar
            isOpen={sidebarOpen}
            onToggleOpen={() => setSidebarOpen(!sidebarOpen)}
            activeTab={activeTab}
            setActiveTab={(tab) => {
              // Route own-profile clicks through UserProfileView so the
              // Skills tab (and any other UserProfileView features) work
              // the same as viewing another user's profile.
              if (tab === 'myprofile' && user) {
                setViewingUserId(user.id);
                setSearchQuery('');
                setCreatorSearch('');
                return;
              }
              setActiveTab(tab);
              setViewingUserId(null);
              setSearchQuery('');
              setCreatorSearch('');
            }}
            onCreateClick={() => {
              // Auto-select the community if user is currently viewing one
              if (activeTab === 'communities' && activeCommunity?.id) {
                setPreSelectedCommunityId(activeCommunity.id);
              }
              setShowCreateModal(true);
            }}
            onSettingsClick={() => setShowSettingsModal(true)}
            onLogout={handleLogout}
            user={user}
            profile={profile}
            onAuthRequired={() => setShowAuthModal(true)}
            savedAccounts={savedAccounts}
            onSwitchAccount={handleSwitchAccount}
            onAddAccount={handleAddAccount}
            onRemoveSavedAccount={handleRemoveSavedAccount}
            notifications={notifications}
            feedSubTab={feedSubTab}
            setFeedSubTab={setFeedSubTab}
            onLoadNotifications={loadNotifications}
            onMarkNotificationsAsRead={markNotificationsAsRead}
            unreadDmCount={unreadDmCount}
            onClearSearchState={(tab) => {
              setShowSearchPage(false);
              setSearchPageQuery('');
              if (tab !== 'explore') {
                setExploreSearchQuery('');
                setExploreSearchFocused(false);
                setExploreSearchActive(false);
                setExploreSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [], tools: [], categories: [] });
              }
            }}
            onShowLanding={() => {
              setLandingDismissed(false);
              window.history.pushState({}, '', '/?landing=1');
              window.scrollTo({ top: 0, behavior: 'auto' });
            }}
          />

          {/* Right quick-actions drawer (swipe left): notifications, daily
              reward, messages, and the feed view toggle. Mobile affordance. */}
          <div
            className={`right-drawer-overlay ${rightSidebarOpen ? 'visible' : ''}`}
            onClick={() => setRightSidebarOpen(false)}
          />
          <aside className={`right-drawer ${rightSidebarOpen ? 'open' : ''}`}>
            <div className="right-drawer-header">
              <span className="right-drawer-title">Quick actions</span>
              <button className="right-drawer-close" onClick={() => setRightSidebarOpen(false)} aria-label="Close">✕</button>
            </div>

            <button
              className="right-drawer-item"
              onClick={() => {
                setRightSidebarOpen(false);
                if (!user) { setShowAuthModal(true); return; }
                setShowDailyReward(true);
              }}
            >
              <span className="right-drawer-item-icon"><GiftIcon size={20} /></span>
              <span className="right-drawer-item-label">Daily reward</span>
              {dailyRewardClaimable && <span className="right-drawer-badge-dot" />}
            </button>

            <button
              className="right-drawer-item"
              onClick={() => {
                setRightSidebarOpen(false);
                if (!user) { setShowAuthModal(true); return; }
                setViewingUserId(null);
                setSelectedFullPost(null);
                setActiveTab('foryou');
                setFeedSubTab('notifications');
                openNotifications();
                window.scrollTo({ top: 0, behavior: 'instant' });
              }}
            >
              <span className="right-drawer-item-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </span>
              <span className="right-drawer-item-label">Notifications</span>
              {Array.isArray(notifications) && notifications.some(n => !n.is_read) && <span className="right-drawer-badge-dot" />}
            </button>

            <button
              className="right-drawer-item"
              onClick={() => {
                setRightSidebarOpen(false);
                if (!user) { setShowAuthModal(true); return; }
                setMessagesInitialConv(null);
                setSelectedFullPost(null);
                setViewingUserId(null);
                setShowSearchPage(false);
                setActiveTab('messages');
                window.scrollTo({ top: 0, behavior: 'instant' });
              }}
            >
              <span className="right-drawer-item-icon"><AnimatedIcon name="messagecircle" size={20} /></span>
              <span className="right-drawer-item-label">Messages</span>
              {unreadDmCount > 0 && <span className="right-drawer-count">{unreadDmCount > 9 ? '9+' : unreadDmCount}</span>}
            </button>

            <div className="right-drawer-divider" />

            <div className="right-drawer-section-label">Feed view</div>
            <div className="right-drawer-viewtoggle">
              <button
                className={`right-drawer-viewbtn ${feedViewMode === 'list' ? 'active' : ''}`}
                onClick={() => setFeedViewMode('list')}
              >
                <ListIcon /> List
              </button>
              <button
                className={`right-drawer-viewbtn ${feedViewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setFeedViewMode('grid')}
              >
                <GridIcon /> Grid
              </button>
            </div>

            <div className="right-drawer-divider" />

            {/* Builds / Discussions / Questions of the Day — reuses the same
                RightSidebar that desktop shows (hidden on mobile via CSS), so
                the curated daily lists are now reachable by swiping left. Each
                tap closes the drawer before navigating. */}
            <div className="right-drawer-ofday">
              <RightSidebar
                isAdmin={isPlatformAdmin}
                isPro={!!profile?.is_pro}
                topBuilds={topBuilds}
                topQuestions={topQuestions}
                topDiscussions={topDiscussions}
                recommendedAccounts={recommendedAccounts}
                categories={categories}
                posts={posts}
                allUsers={allUsers}
                postCommunities={postCommunities}
                userFollowedCategories={userFollowedCategories}
                builderRanks={builderRanks}
                onFollowUser={handleFollow}
                currentUserFollows={userFollows}
                currentUserId={user?.id}
                onPostClick={(postId) => { setRightSidebarOpen(false); openPostById(postId); }}
                onQuestionClick={(postId) => { setRightSidebarOpen(false); openPostById(postId); }}
                onDiscussionClick={(postId) => { setRightSidebarOpen(false); openPostById(postId); }}
                onUserClick={(userId) => { setRightSidebarOpen(false); setViewingUserId(userId); setActiveTab('foryou'); }}
                onCategoryClick={(categoryId) => { setRightSidebarOpen(false); setViewingCategoryId(categoryId); setCategoryViewTab('most-liked'); setActiveTab('explore'); }}
                onExploreClick={() => { setRightSidebarOpen(false); setActiveTab('explore'); }}
              />
            </div>
          </aside>

          {/* Mobile Header with Tabs - only on home page */}
          {(activeTab === 'foryou' || activeTab === 'questions' || (activeTab === 'communities' && !activeCommunity)) && !viewingUserId && !selectedFullPost && (
          <header className={`mobile-header${mobileHeaderHidden ? ' header-hidden' : ''}`}>
            <div className="mobile-header-content">
              <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                <div className="mobile-user-pfp">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" />
                  ) : profile?.avatar_emoji ? (
                    <span className="mobile-user-pfp-emoji">{profile.avatar_emoji}</span>
                  ) : (
                    <UserIcon />
                  )}
                </div>
              </button>
              <div className="header-tabs">
                <button
                  className={`header-tab-btn ${activeTab === 'foryou' && homeContentTab === 'builds' ? 'active' : ''}`}
                  onClick={() => handleHomeContentTabClick('builds')}
                >
                  Builds
                </button>
                <button
                  className={`header-tab-btn ${activeTab === 'foryou' && homeContentTab === 'posts' ? 'active' : ''}`}
                  onClick={() => handleHomeContentTabClick('posts')}
                >
                  Discussion
                </button>
                {canSeeLounge(profile) && (
                  <button
                    className={`header-tab-btn ${activeTab === 'memes' ? 'active' : ''}`}
                    onClick={() => handleHeaderTabClick('memes', null, activeTab === 'memes')}
                  >
                    Lounge
                  </button>
                )}
                <button
                  className={`header-tab-btn ${activeTab === 'questions' ? 'active' : ''}`}
                  onClick={() => handleHeaderTabClick('questions', null, activeTab === 'questions')}
                >
                  Questions
                </button>
              </div>
              <div className="header-actions">
                {/* Feed view-mode toggle moved to the swipe-left quick-actions
                    drawer to declutter the header on phones. */}
                {/* Daily reward gift */}
                <button
                  className="header-msg-btn header-gift-btn"
                  onClick={() => {
                    if (!user) { setShowAuthModal(true); return; }
                    setShowDailyReward(true);
                  }}
                  aria-label="Daily reward"
                  title="Daily reward — claim free Builder Points"
                >
                  <GiftIcon size={20} />
                  {dailyRewardClaimable && <span className="header-gift-dot" />}
                </button>
                {/* Messages */}
                <button
                  className={`header-msg-btn ${activeTab === 'messages' ? 'active' : ''}`}
                  onClick={() => {
                    if (!user) { setShowAuthModal(true); return; }
                    setMessagesInitialConv(null);
                    setSelectedFullPost(null);
                    setViewingUserId(null);
                    setShowSearchPage(false);
                    setActiveTab('messages');
                    window.scrollTo({ top: 0, behavior: 'instant' });
                  }}
                  aria-label="Messages"
                  title="Messages"
                >
                  {/* Animated message-circle icon: draws itself in on hover. */}
                  <AnimatedIcon name="messagecircle" size={22} />
                  {unreadDmCount > 0 && (
                    <span className="header-msg-badge">{unreadDmCount > 9 ? '9+' : unreadDmCount}</span>
                  )}
                </button>
                {/* Global Search */}
                <div className="global-search-container" ref={globalSearchRef}>
                  <button
                    className="global-search-btn"
                    onClick={() => setGlobalSearchOpen(!globalSearchOpen)}
                    title="Search"
                  >
                    {/* Animated magnifier: nudges + tilts as if scanning. */}
                    <AnimatedIcon name="magnifier" size={22} />
                  </button>
                  {globalSearchOpen && (
                    <div className="global-search-dropdown">
                      <div className="global-search-input-wrapper">
                        <input
                          type="text"
                          className="global-search-input"
                          placeholder="Search posts, users, communities..."
                          value={globalSearchQuery}
                          onChange={(e) => setGlobalSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && globalSearchQuery.trim() && globalSearchQuery.trim().toLowerCase() !== '/cmd') {
                              // Navigate to /explore?q=... on Enter
                              setGlobalSearchOpen(false);
                              setActiveTab('explore');
                              setExploreSubView(null);
                              const q = globalSearchQuery.trim();
                              setExploreSearchQuery(q);
                              performExploreSearch(q);
                              window.history.pushState({}, '', `/explore?q=${encodeURIComponent(q)}`);
                              setGlobalSearchQuery('');
                              setGlobalSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [] });
                            }
                          }}
                          autoFocus
                        />
                      </div>
                      <div className="global-search-results">
                        {globalSearchQuery.trim().toLowerCase() === '/cmd' ? (
                          <>
                            <div className="cmd-hint">Pick a terminal theme for the post box:</div>
                            <label className="cmd-remember">
                              <input
                                type="checkbox"
                                checked={rememberPostBoxTheme}
                                onChange={(e) => setRememberPostBoxTheme(e.target.checked)}
                              />
                              <span>Remember my theme across reloads</span>
                            </label>
                            <div className="cmd-theme-picker">
                              {[
                                { id: 'prompted', label: 'Prompted', sub: 'default · no terminal chrome' },
                                { id: 'mac', label: 'macOS', sub: 'zsh · traffic lights' },
                                { id: 'windows', label: 'Windows', sub: 'Command Prompt · tabs' },
                                { id: 'linux', label: 'Linux', sub: 'bash · ➜ ~ prompt' },
                                { id: 'retro', label: 'Retro', sub: 'green-on-black · tty1' },
                              ].map(t => (
                                <button
                                  key={t.id}
                                  className={`cmd-theme-btn ${postBoxTheme === t.id ? 'active' : ''}`}
                                  onClick={() => setPostBoxTheme(t.id)}
                                >
                                  <span className="cmd-theme-label">{t.label}</span>
                                  <span className="cmd-theme-sub">{t.sub}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        ) : globalSearchQuery.trim() ? (
                          <>
                            {globalSearchLoading && (
                              <div className="global-search-loading">
                                <div className="spinner" style={{ width: 16, height: 16 }}></div>
                                Searching...
                              </div>
                            )}

                            {/* Posts, Builds, Questions from search_all */}
                            {[
                              { key: 'posts', label: 'Posts', badge: 'Post' },
                              { key: 'builds', label: 'Builds', badge: 'Build' },
                              { key: 'questions', label: 'Questions', badge: 'Question' },
                            ].map(({ key, label, badge }) =>
                              globalSearchResults[key] && globalSearchResults[key].length > 0 && (
                              <div className="global-search-section" key={key}>
                                <div className="global-search-section-title">{label}</div>
                                {globalSearchResults[key].slice(0, 5).map(p => (
                                  <div
                                    key={p.id}
                                    className="global-search-item"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setGlobalSearchOpen(false);
                                      setGlobalSearchQuery('');
                                      setGlobalSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [] });
                                      // Navigate immediately using search result data
                                      setSelectedFullPost({
                                        ...p,
                                        profiles: { id: p.user_id, username: p.username, display_name: p.display_name, avatar_emoji: p.avatar_emoji, avatar_url: p.avatar_url, name_color: p.name_color },
                                      });
                                      // Fetch full post data in background for complete details (with likes_count)
                                      (async () => {
                                        const { data } = await supabase
                                          .from('posts_with_stats')
                                          .select('*')
                                          .eq('id', p.id)
                                          .single();
                                        if (data) _setSelectedFullPost(data);
                                      })();
                                    }}
                                  >
                                    <div className="global-search-item-icon">
                                      <ImageIcon />
                                    </div>
                                    <div className="global-search-item-content">
                                      <div className="global-search-item-title">
                                        {p.title}
                                        <span className="search-result-type-badge" style={{ marginLeft: '0.4rem', fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontWeight: 500, verticalAlign: 'middle' }}>{p.result_type || badge}</span>
                                      </div>
                                      <div className="global-search-item-meta">by <span style={p.name_color ? { color: p.name_color } : {}}>{p.display_name || p.username}</span>{p.ai_tool ? ` · ${p.ai_tool}` : ''}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ))}

                            {/* Communities from search_all */}
                            {globalSearchResults.communities.length > 0 && (
                              <div className="global-search-section">
                                <div className="global-search-section-title">Communities</div>
                                {globalSearchResults.communities.slice(0, 3).map(c => (
                                  <div
                                    key={c.id}
                                    className="global-search-item"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setGlobalSearchOpen(false);
                                      setGlobalSearchQuery('');
                                      setGlobalSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [] });
                                      setActiveTab('communities');
                                      const fullCommunity = communities.find(fc => fc.id === c.id) || c;
                                      setActiveCommunity(fullCommunity);
                                      loadCommunityPosts(c.id, communityPostSort);
                                      window.scrollTo({ top: 0, behavior: 'instant' });
                                    }}
                                  >
                                    <div className="global-search-item-icon">
                                      {c.icon_url ? (
                                        <img src={c.icon_url} alt="" />
                                      ) : c.icon ? (
                                        <span style={{ fontSize: '1rem' }}>{c.icon}</span>
                                      ) : (
                                        <CommunityIcon />
                                      )}
                                    </div>
                                    <div className="global-search-item-content">
                                      <div className="global-search-item-title">{c.name}</div>
                                      <div className="global-search-item-meta">{c.member_count || 0} members</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Users from search_all */}
                            {globalSearchResults.users.length > 0 && (
                              <div className="global-search-section">
                                <div className="global-search-section-title">Users</div>
                                {globalSearchResults.users.slice(0, 5).map(u => (
                                  <div
                                    key={u.id}
                                    className="global-search-item"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setGlobalSearchOpen(false);
                                      setGlobalSearchQuery('');
                                      setGlobalSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [] });
                                      setViewingUserId(u.id);
                                    }}
                                  >
                                    <div className="global-search-item-icon">
                                      {u.avatar_url ? (
                                        <img src={u.avatar_url} alt="" />
                                      ) : u.avatar_emoji ? (
                                        <span style={{ fontSize: '1rem' }}>{u.avatar_emoji}</span>
                                      ) : (
                                        <UserIcon />
                                      )}
                                    </div>
                                    <div className="global-search-item-content">
                                      <div
                                        className="global-search-item-title"
                                        style={{ color: u.name_color || 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                      >
                                        {u.display_name || u.username}
                                        <BuilderRankBadge points={u.builder_points} ranks={builderRanks} />
                                        <UserBadge username={u.username} size={15} />
                                      </div>
                                      <div className="global-search-item-meta">@{u.username}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Categories (local filter) */}
                            {(() => {
                              const q = debouncedGlobalQuery.trim().toLowerCase();
                              const matchingCategories = q ? categories.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5) : [];
                              return matchingCategories.length > 0 ? (
                                <div className="global-search-section">
                                  <div className="global-search-section-title">Categories</div>
                                  {matchingCategories.map(cat => (
                                    <div
                                      key={cat.id}
                                      className="global-search-item"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setGlobalSearchOpen(false);
                                        setGlobalSearchQuery('');
                                        setGlobalSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [] });
                                        setActiveTab('explore');
                                        setExploreSubView(null);
                                        setViewingCategoryId(cat.id);
                                        setCategoryViewTab('most-liked');
                                      }}
                                    >
                                      <div className="global-search-item-icon">
                                        {cat.icon ? (
                                          <span style={{ fontSize: '1rem' }}>{cat.icon}</span>
                                        ) : (
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                        )}
                                      </div>
                                      <div className="global-search-item-content">
                                        <div className="global-search-item-title">{cat.name}</div>
                                        <div className="global-search-item-meta">Category</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null;
                            })()}

                            {/* No results */}
                            {!globalSearchLoading && globalSearchResults.posts.length === 0 && globalSearchResults.communities.length === 0 && globalSearchResults.users.length === 0 && !(debouncedGlobalQuery.trim() && categories.some(c => c.name.toLowerCase().includes(debouncedGlobalQuery.trim().toLowerCase()))) && debouncedGlobalQuery.trim() && (
                              <div className="global-search-empty">
                                No results found for "{globalSearchQuery}"
                              </div>
                            )}

                            {/* See all results link */}
                            {(globalSearchResults.posts.length > 0 || globalSearchResults.communities.length > 0 || globalSearchResults.users.length > 0 || (debouncedGlobalQuery.trim() && categories.some(c => c.name.toLowerCase().includes(debouncedGlobalQuery.trim().toLowerCase())))) && (
                              <div
                                className="global-search-see-all"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const q = globalSearchQuery.trim();
                                  setGlobalSearchOpen(false);
                                  setActiveTab('explore');
                                  setExploreSubView(null);
                                  setExploreSearchQuery(q);
                                  performExploreSearch(q);
                                  window.history.pushState({}, '', `/explore?q=${encodeURIComponent(q)}`);
                                  setGlobalSearchQuery('');
                                  setGlobalSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [] });
                                }}
                              >
                                See all results for "{globalSearchQuery}"
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="global-search-empty">
                            Start typing to search...
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {user && (
                  <button
                    className="header-notification-btn"
                    onClick={() => { setActiveTab('foryou'); setFeedSubTab('notifications'); openNotifications(); }}
                    title="Notifications"
                  >
                    {/* Animated bell: rings/swings on hover. */}
                    <AnimatedIcon name="bell" size={22} />
                    {notifications.filter(n => !n.is_read).length > 0 && (
                      <span className="header-notification-badge">
                        {notifications.filter(n => !n.is_read).length}
                      </span>
                    )}
                  </button>
                )}
                <button
                  className="header-home-btn"
                  onClick={() => { setActiveTab('foryou'); setFeedSubTab('foryou'); setViewingUserId(null); window.history.replaceState({}, '', '/'); }}
                  title="Home"
                >
                  {/* Animated home: roof lifts, body pulses, door squashes. */}
                  <AnimatedIcon name="home" size={22} />
                </button>
                {!user && (
                  <button className="btn-join-small" onClick={() => setShowAuthModal(true)}>
                    Login / Sign Up
                  </button>
                )}
              </div>
            </div>
          </header>
          )}

          {/* Main Content Area */}
          <main className={`mobile-main${((activeTab === 'foryou' || activeTab === 'questions' || (activeTab === 'communities' && !activeCommunity)) && !viewingUserId && !selectedFullPost) ? '' : ' no-header'}`}>
            <div className={`main-layout${((activeTab === 'foryou' && feedSubTab !== 'notifications') || (activeTab === 'explore' && !exploreSubView)) ? ' has-sidebar' : ''}`}>
              <div className="main-feed">
                {/* SEARCH PAGE (only when explicitly on /search URL) */}
                {showSearchPage && activeTab === 'explore' && (
                  <SearchPage
                    categories={categories}
                    onOpenFullPost={setSelectedFullPost}
                    onUserClick={setViewingUserId}
                    onCategoryClick={(categoryId) => {
                      setShowSearchPage(false);
                      setViewingCategoryId(categoryId);
                      setCategoryViewTab('most-liked');
                      setActiveTab('explore');
                      window.history.pushState({}, '', '/');
                    }}
                    onToolClick={(toolName) => {
                      setShowSearchPage(false);
                      setViewingToolName(toolName);
                      setExploreSubView('toolDetail');
                      setToolViewTab('trending');
                      setActiveTab('explore');
                      window.history.pushState({}, '', '/');
                    }}
                    onAuthRequired={() => setShowAuthModal(true)}
                  />
                )}

                {/* TAB 1: FOR YOU / FOLLOWING FEED */}
                {activeTab === 'foryou' && !viewingUserId && (
                  <div className="for-you-tab">
                    <Helmet>
                      <title>Prompted - See What People Are Building With AI</title>
                      <meta name="description" content="The open library of AI builds, prompts, and workflows. See what people are building with AI and learn exactly how they did it." />
                    </Helmet>

                    {feedSubTab !== 'notifications' && (
                    <div className="feed-tab-switcher feed-tab-switcher-scroll">
                      <button
                        className={`feed-tab-btn ${feedSubTab === 'foryou' ? 'active' : ''}`}
                        onClick={() => setFeedSubTab('foryou')}
                      >
                        Home
                      </button>
                      <button
                        className={`feed-tab-btn ${feedSubTab === 'following' ? 'active' : ''}`}
                        onClick={() => setFeedSubTab('following')}
                      >
                        Following
                      </button>
                      <HomeSortDropdown
                        value={feedSubTab}
                        showUnliked={!!user}
                        onSelect={(m) => { setFeedSubTab(m); if (m === 'random') setRandomReshuffle(n => n + 1); }}
                      />
                    </div>
                    )}
                    {/* Create Post Box (Twitter-style) - only show on foryou and following tabs */}
                    {feedSubTab !== 'notifications' && (
                      <CreatePostBox
                        onCreateClick={(draft) => { setCreateInitialDraft(draft || ''); setShowCreateModal(true); }}
                        onAuthRequired={() => setShowAuthModal(true)}
                        theme={postBoxTheme}
                      />
                    )}

                    {/* Zeo "Live Now" banner — public now that Zeo is open to everyone. */}
                    {feedSubTab !== 'notifications' && (
                      <LiveBanner onOpenStream={(s) => {
                        setZoeOpenStreamId(s.id);
                        setActiveTab('live');
                        window.history.replaceState({}, '', '/live');
                        window.scrollTo({ top: 0 });
                      }} />
                    )}

                    {/* Feed Content - For You / Most Liked / Unliked / Random
                        All four share the same data source (homeFeedPosts);
                        the sort is applied inside the memo based on feedSubTab. */}
                    {(feedSubTab === 'foryou' || feedSubTab === 'top' || feedSubTab === 'unliked' || feedSubTab === 'random') && (
                      <div className="feed-container">
                        {feedSubTab === 'random' && (
                          <div className="feed-random-bar">
                            <span className="feed-random-note">
                              Random posts from {RANDOM_FEED_MIN_AGE_DAYS}+ days ago — surfacing buried builds.
                            </span>
                            <button
                              type="button"
                              className="feed-random-reshuffle"
                              onClick={() => setRandomReshuffle(n => n + 1)}
                            >
                              Shuffle again
                            </button>
                          </div>
                        )}
                        {loading ? (
                          <div className="loading-state">
                            <div className="spinner"></div>
                            <p>Loading builds...</p>
                          </div>
                        ) : homeFeedPosts.length > 0 ? (
                          feedViewMode === 'grid' ? (
                            <PostGrid posts={homeFeedPosts} onOpenFullPost={setSelectedFullPost} />
                          ) : (
                          homeFeedPosts.map(post => (
                            <PostCard
                              key={post.id}
                              post={post}
                              onLike={handleLike}
                              userLikes={userLikes}
                              onCommentAdded={handleCommentAdded}
                              onUserClick={setViewingUserId}
                              onSave={handleSave}
                              userSaves={userSaves}
                              onAuthRequired={() => setShowAuthModal(true)}
                              categories={categories}
                              onDelete={handleDeletePost}
                              onOpenFullPost={setSelectedFullPost}
                              onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                              onCategoryClick={(categoryId) => {
                                setViewingCategoryId(categoryId);
                                setCategoryViewTab('most-liked');
                                setActiveTab('explore');
                              }}
                              postCommunities={postCommunities}
                              userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                              onCommunityClick={(community) => {
                                setActiveTab('communities');
                                selectCommunity(community);
                              }}
                              allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                              schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                              onSchoolClick={navigateToSchool}
                              onToolClick={navigateToTool}
                            />
                          ))
                          )
                        ) : (
                          <div className="empty-state">
                            <div className="empty-icon"><SearchIcon /></div>
                            <p className="empty-text">New here? Start by browsing posts in your field.</p>
                            <button
                              className="btn btn-primary"
                              style={{ marginTop: '0.75rem' }}
                              onClick={() => { setActiveTab('explore'); setViewingCategoryId(null); }}
                            >
                              Explore fields →
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Feed Content - Following */}
                    {feedSubTab === 'following' && (
                      <div className="feed-container">
                        {!user ? (
                          <div className="login-prompt">
                            <div className="login-prompt-icon"><UsersIcon /></div>
                            <div className="login-prompt-title">Login to See Who You Follow</div>
                            <p className="login-prompt-text">Follow creators to see their posts here.</p>
                            <button className="btn btn-primary" onClick={() => setShowAuthModal(true)}>
                              Login / Sign Up
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* Posts from followed users */}
                            {userFollows.length === 0 ? (
                              <div className="following-tab-empty">
                                <div className="following-tab-empty-icon"><UsersIcon /></div>
                                <div className="following-tab-empty-title">You're not following anyone yet</div>
                                <p className="following-tab-empty-text">
                                  Explore and find creators to follow! Their posts will appear here.
                                </p>
                              </div>
                            ) : (
                              <>
                                {(() => {
                                  return followingFeedPosts.length > 0 ? (
                                    feedViewMode === 'grid' ? (
                                      <PostGrid posts={followingFeedPosts} onOpenFullPost={setSelectedFullPost} />
                                    ) : followingFeedPosts.map(post => (
                                    <PostCard
                                      key={post.id}
                                      post={post}
                                      onLike={handleLike}
                                      userLikes={userLikes}
                                      onCommentAdded={handleCommentAdded}
                                      onUserClick={setViewingUserId}
                                      onSave={handleSave}
                                      userSaves={userSaves}
                                      onAuthRequired={() => setShowAuthModal(true)}
                                      categories={categories}
                                      onDelete={handleDeletePost}
                                      onOpenFullPost={setSelectedFullPost}
                                      onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                                      onCategoryClick={(categoryId) => {
                                        setViewingCategoryId(categoryId);
                                        setCategoryViewTab('most-liked');
                                        setActiveTab('explore');
                                      }}
                                      postCommunities={postCommunities}
                                      userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                                      onCommunityClick={(community) => {
                                        setActiveTab('communities');
                                        selectCommunity(community);
                                      }}
                                      allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                                      schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                                      onSchoolClick={navigateToSchool}
                                      onToolClick={navigateToTool}
                                    />
                                  ))
                                  ) : (
                                    <div className="empty-state">
                                      <div className="empty-icon"><InboxIcon /></div>
                                      <p className="empty-text">No posts yet from people you follow</p>
                                    </div>
                                  );
                                })()}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Feed Content - Notifications */}
                    {feedSubTab === 'notifications' && (
                      <div className="feed-container">
                        {!user ? (
                          <div className="login-prompt">
                            <div className="login-prompt-icon"><BellIcon /></div>
                            <div className="login-prompt-title">Login to See Notifications</div>
                            <p className="login-prompt-text">Sign in to see who followed you, liked your posts, and more.</p>
                            <button className="btn btn-primary" onClick={() => setShowAuthModal(true)}>
                              Login / Sign Up
                            </button>
                          </div>
                        ) : (
                          <div style={{
                            background: 'var(--bg-secondary)',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              padding: '0.75rem 1rem',
                              borderBottom: '1px solid var(--border-color)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}>
                              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                                Notifications
                                {notifications.filter(n => !n.is_read).length > 0 && (
                                  <span style={{
                                    marginLeft: '0.5rem',
                                    background: '#ff4444',
                                    color: 'white',
                                    fontSize: '0.75rem',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '10px'
                                  }}>
                                    {notifications.filter(n => !n.is_read).length} new
                                  </span>
                                )}
                              </div>
                              {/* View-mode toolbar — top-row buttons, no dropdown */}
                              <div style={{ display: 'flex', gap: '0.3rem' }}>
                                {isPlatformAdmin && (
                                  <button
                                    onClick={openApprovedClaims}
                                    title="See every daily claim you approved"
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                                      padding: '0.3rem 0.6rem', borderRadius: '8px', cursor: 'pointer',
                                      fontSize: '0.78rem', fontWeight: 600,
                                      border: '1px solid var(--border-color)', background: 'transparent',
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    <span aria-hidden="true">✅</span>
                                    <span>Approved claims</span>
                                  </button>
                                )}
                                {[
                                  { key: 'list', label: 'List', icon: '≡' },
                                  { key: 'grid', label: 'Grid', icon: '▦' },
                                  { key: 'bubble', label: 'Bubble', icon: '◯' },
                                  { key: 'matrix', label: 'Matrix', icon: '⠿' },
                                ].map(m => {
                                  const active = notifViewMode === m.key;
                                  return (
                                    <button
                                      key={m.key}
                                      onClick={() => setNotifViewMode(m.key)}
                                      title={`${m.label} view`}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                                        padding: '0.3rem 0.6rem', borderRadius: '8px', cursor: 'pointer',
                                        fontSize: '0.78rem', fontWeight: 600,
                                        border: `1px solid ${active ? (m.key === 'matrix' ? '#00ff41' : 'var(--accent-primary, #ff4444)') : 'var(--border-color)'}`,
                                        background: active ? (m.key === 'matrix' ? 'rgba(0,255,65,0.12)' : 'rgba(255,68,68,0.12)') : 'transparent',
                                        color: active ? (m.key === 'matrix' ? '#00ff41' : 'var(--text-primary)') : 'var(--text-secondary)',
                                      }}
                                    >
                                      <span aria-hidden="true">{m.icon}</span>
                                      <span style={{ display: 'inline' }}>{m.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            {showApprovedClaims && (
                              <div
                                onClick={() => setShowApprovedClaims(false)}
                                style={{ position: 'fixed', inset: 0, zIndex: 100002, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                              >
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ width: 'min(560px, 96vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary, #15171c)', border: '1px solid var(--border-color)', borderRadius: '14px', overflow: 'hidden' }}
                                >
                                  <div style={{ padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <span aria-hidden="true">✅</span> Claims you approved
                                      {!approvedClaimsLoading && <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.85rem' }}>({approvedClaims.length})</span>}
                                    </div>
                                    <button onClick={() => setShowApprovedClaims(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
                                  </div>
                                  <div style={{ overflowY: 'auto', padding: '0.5rem' }}>
                                    {approvedClaimsLoading ? (
                                      <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
                                    ) : approvedClaims.length === 0 ? (
                                      <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>You haven't approved any daily claims yet.</div>
                                    ) : (
                                      approvedClaims.map((c, i) => (
                                        <div key={`${c.user_id}-${c.claim_date}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.7rem', borderRadius: '10px', borderBottom: i < approvedClaims.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                                          <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'var(--bg-tertiary, #1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem' }}>
                                            {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (c.avatar_emoji || '👤')}
                                          </div>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                              {c.display_name || c.username} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>@{c.username}</span>
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                              +{c.points} BP · day {c.streak_day} · {c.reviewed_at ? new Date(c.reviewed_at).toLocaleDateString() : c.claim_date}
                                            </div>
                                          </div>
                                          {c.tweet_url && (
                                            <button
                                              onClick={() => window.open(c.tweet_url, '_blank', 'noopener,noreferrer')}
                                              style={{ flexShrink: 0, padding: '0.35rem 0.7rem', background: 'transparent', color: 'var(--text-primary)', border: '1.5px solid var(--border-color)', borderRadius: '16px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                              Tweet
                                            </button>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            {notifications.length > 0 && notifViewMode !== 'list' ? (
                              <NotificationFx
                                mode={notifViewMode}
                                notifications={notifications}
                                onOpen={handleNotificationClick}
                                onDismiss={async (n) => {
                                  setNotifications(prev => prev.filter(x => x.id !== n.id));
                                  if (!n.is_read) markSingleNotificationAsRead(n.id);
                                }}
                              />
                            ) : notifications.length > 0 ? (
                              <div>
                                {notifications.map(notification => {
                                  // Comments now ship as sanitized HTML (B/I/U/color via CommentEditor).
                                  // Strip tags before showing a preview so the notification doesn't
                                  // surface raw <span style="color: …"> markup.
                                  const previewComment = (raw, max) => {
                                    if (!raw) return '';
                                    const text = String(raw).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                                    return text.length > max ? text.substring(0, max) + '...' : text;
                                  };
                                  const getNotificationMessage = () => {
                                    switch (notification.type) {
                                      case 'follow':
                                        return ' followed you';
                                      case 'post_like':
                                        return notification.posts?.title
                                          ? <> liked your post <span style={{ fontWeight: '500' }}>"{notification.posts.title.length > 30 ? notification.posts.title.substring(0, 30) + '...' : notification.posts.title}"</span></>
                                          : ' liked your post';
                                      case 'comment_like': {
                                        const preview = previewComment(notification.comments?.content, 25);
                                        return preview
                                          ? <> liked your comment <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>"{preview}"</span></>
                                          : ' liked your comment';
                                      }
                                      case 'comment':
                                        return notification.posts?.title
                                          ? <> commented on your post <span style={{ fontWeight: '500' }}>"{notification.posts.title.length > 30 ? notification.posts.title.substring(0, 30) + '...' : notification.posts.title}"</span></>
                                          : ' commented on your post';
                                      case 'reply': {
                                        const preview = previewComment(notification.comments?.content, 25);
                                        return preview
                                          ? <> replied to your comment <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>"{preview}"</span></>
                                          : ' replied to your comment';
                                      }
                                      case 'post_save':
                                        return notification.posts?.title
                                          ? <> saved your post <span style={{ fontWeight: '500' }}>"{notification.posts.title.length > 30 ? notification.posts.title.substring(0, 30) + '...' : notification.posts.title}"</span></>
                                          : ' saved your post';
                                      case 'community_join':
                                        return notification.communities?.name
                                          ? <> joined your community <span style={{ fontWeight: '500' }}>{notification.communities.name}</span></>
                                          : ' joined your community';
                                      case 'community_paid_request':
                                        return notification.communities?.name
                                          ? <> requested to join your paid community <span style={{ fontWeight: '500' }}>{notification.communities.name}</span> — verify and approve</>
                                          : ' requested to join your paid community';
                                      case 'community_paid_approved':
                                        return notification.communities?.name
                                          ? <> approved your subscription to <span style={{ fontWeight: '500' }}>{notification.communities.name}</span> — you're in!</>
                                          : ' approved your subscription';
                                      case 'community_paid_denied':
                                        return notification.communities?.name
                                          ? <> denied your subscription to <span style={{ fontWeight: '500' }}>{notification.communities.name}</span> — tap for details / appeal</>
                                          : ' denied your subscription — tap for details / appeal';
                                      case 'linked_question':
                                        return notification.posts?.title
                                          ? <> asked a question about your post <span style={{ fontWeight: '500' }}>"{notification.posts.title.length > 30 ? notification.posts.title.substring(0, 30) + '...' : notification.posts.title}"</span></>
                                          : ' asked a question about your post';
                                      case 'repost':
                                        return notification.posts?.title
                                          ? <> reposted your post <span style={{ fontWeight: '500' }}>"{notification.posts.title.length > 30 ? notification.posts.title.substring(0, 30) + '...' : notification.posts.title}"</span></>
                                          : ' reposted your post';
                                      case 'achievement_unlocked':
                                        return notification.achievement?.name
                                          ? <> You unlocked <span style={{ fontWeight: '600' }}>{notification.achievement.name}</span></>
                                          : ' You unlocked a new achievement';
                                      case 'skills_feature_launch':
                                        return <> launched a new <span style={{ fontWeight: '600' }}>Skills</span> feature — share your Claude Skills, ChatGPT GPTs, Gemini Gems, or prompts on your profile. Tap to add yours.</>;
                                      case 'stream_live':
                                        return notification.live_stream?.title
                                          ? <> is <span style={{ fontWeight: '600', color: '#F5C518' }}>live</span> now: <span style={{ fontWeight: '600' }}>"{notification.live_stream.title.length > 60 ? notification.live_stream.title.substring(0, 60) + '...' : notification.live_stream.title}"</span> — tap to watch</>
                                          : <> is <span style={{ fontWeight: '600', color: '#F5C518' }}>live</span> now — tap to watch</>;
                                      case 'daily_reward_review':
                                        return <> posted on X to claim a <span style={{ fontWeight: '600' }}>daily reward</span> (+{notification.data?.points} BP) — verify the tweet, then confirm or deny</>;
                                      case 'daily_reward_confirmed':
                                        return <> Your daily reward was approved — <span style={{ fontWeight: '600' }}>+{notification.data?.points} Builder Points</span>{notification.data?.free_pro_granted ? ' + a free Pro week 👑' : ''}</>;
                                      case 'daily_reward_denied':
                                        return ' Your daily reward claim was denied — post about your build or about Prompted, and link your own tweet';
                                      default:
                                        return ' interacted with you';
                                    }
                                  };

                                  const getNotificationIcon = () => {
                                    switch (notification.type) {
                                      case 'post_like':
                                      case 'comment_like':
                                        return <HeartIcon style={{ width: '12px', height: '12px', color: '#ff6b6b' }} />;
                                      case 'comment':
                                      case 'reply':
                                        return <CommentIcon style={{ width: '12px', height: '12px', color: 'var(--accent-primary)' }} />;
                                      case 'post_save':
                                        return <BookmarkIcon style={{ width: '12px', height: '12px', color: 'var(--accent-primary)' }} />;
                                      case 'follow':
                                        return <UserIcon style={{ width: '12px', height: '12px', color: 'var(--accent-primary)' }} />;
                                      case 'community_join':
                                        return <UsersIcon style={{ width: '12px', height: '12px', color: 'var(--accent-primary)' }} />;
                                      case 'community_paid_request':
                                        return <span style={{ fontSize: '11px', lineHeight: 1 }}>💰</span>;
                                      case 'community_paid_approved':
                                        return <span style={{ fontSize: '11px', lineHeight: 1 }}>✅</span>;
                                      case 'community_paid_denied':
                                        return <span style={{ fontSize: '11px', lineHeight: 1 }}>❌</span>;
                                      case 'linked_question':
                                        return <span style={{ fontSize: '10px', lineHeight: 1 }}>❓</span>;
                                      case 'repost':
                                        return <span style={{ fontSize: '11px', lineHeight: 1 }}>🔁</span>;
                                      case 'achievement_unlocked':
                                        return <span style={{ fontSize: '11px', lineHeight: 1 }}>🏆</span>;
                                      case 'skills_feature_launch':
                                        return <span style={{ fontSize: '11px', lineHeight: 1 }}>✨</span>;
                                      case 'stream_live':
                                        return <span style={{ fontSize: '11px', lineHeight: 1 }}>🔴</span>;
                                      case 'daily_reward_review':
                                        return <span style={{ fontSize: '11px', lineHeight: 1 }}>🎁</span>;
                                      case 'daily_reward_confirmed':
                                        return <span style={{ fontSize: '11px', lineHeight: 1 }}>✅</span>;
                                      case 'daily_reward_denied':
                                        return <span style={{ fontSize: '11px', lineHeight: 1 }}>❌</span>;
                                      default:
                                        return null;
                                    }
                                  };

                                  return (
                                    <div
                                      key={notification.id}
                                      onClick={() => handleNotificationClick(notification)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        padding: '0.75rem 1rem',
                                        cursor: 'pointer',
                                        background: notification.is_read ? 'transparent' : 'rgba(255, 68, 68, 0.08)',
                                        transition: 'background 0.2s'
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                      onMouseLeave={(e) => e.currentTarget.style.background = notification.is_read ? 'transparent' : 'rgba(255, 68, 68, 0.08)'}
                                    >
                                      <div style={{ position: 'relative' }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!notification.is_read) {
                                            markSingleNotificationAsRead(notification.id);
                                          }
                                          if (notification.type === 'achievement_unlocked') {
                                            navigateToAchievements(null, notification.achievement_id || null);
                                          } else if (notification.type === 'skills_feature_launch') {
                                            if (user?.id) {
                                              setProfileInitialTab('skills');
                                              setViewingUserId(user.id);
                                            }
                                          } else if (notification.actor_id) {
                                            setViewingUserId(notification.actor_id);
                                          }
                                        }}
                                      >
                                        <div style={{
                                          width: '44px',
                                          height: '44px',
                                          borderRadius: '50%',
                                          background: 'var(--bg-tertiary)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          overflow: 'hidden',
                                          flexShrink: 0
                                        }}>
                                          {notification.type === 'skills_feature_launch' ? (
                                            <img src="/logo-icon.svg" alt="Prompted" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
                                          ) : notification.type === 'achievement_unlocked' && notification.achievement?.icon ? (
                                            <span style={{ fontSize: '1.6rem' }}>{notification.achievement.icon}</span>
                                          ) : notification.profiles?.avatar_url ? (
                                            <img src={notification.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                          ) : notification.profiles?.avatar_emoji ? (
                                            <span style={{ fontSize: '1.4rem' }}>{notification.profiles.avatar_emoji}</span>
                                          ) : (
                                            <UserIcon />
                                          )}
                                        </div>
                                        {getNotificationIcon() && (
                                          <div style={{
                                            position: 'absolute',
                                            bottom: '-2px',
                                            right: '-2px',
                                            width: '20px',
                                            height: '20px',
                                            borderRadius: '50%',
                                            background: 'var(--bg-secondary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: '2px solid var(--bg-secondary)'
                                          }}>
                                            {getNotificationIcon()}
                                          </div>
                                        )}
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ color: 'var(--text-primary)', lineHeight: '1.4' }}>
                                          {notification.type !== 'achievement_unlocked' && (
                                            <span style={{ fontWeight: '600', color: notification.profiles?.name_color || 'inherit', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                              {notification.type === 'skills_feature_launch'
                                                ? <>Prompted <VerifiedBadge size={15} /></>
                                                : <>{notification.profiles?.display_name || notification.profiles?.username}<UserBadge username={notification.profiles?.username} size={15} /></>}
                                            </span>
                                          )}
                                          <span style={{ color: 'var(--text-secondary)' }}>{getNotificationMessage()}</span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                          {notification.type === 'achievement_unlocked' || notification.type === 'skills_feature_launch'
                                            ? new Date(notification.created_at).toLocaleDateString()
                                            : <>@{notification.profiles?.username} · {new Date(notification.created_at).toLocaleDateString()}</>}
                                        </div>
                                      </div>
                                      {notification.type === 'daily_reward_review' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); window.open(notification.data?.tweet_url, '_blank', 'noopener,noreferrer'); }}
                                            disabled={!notification.data?.tweet_url}
                                            style={{ padding: '0.45rem 0.8rem', background: 'transparent', color: 'var(--text-primary)', border: '1.5px solid var(--border-color, #333)', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                                            title="View the tweet on X"
                                          >
                                            View tweet
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleReviewDailyReward(notification, 'confirm'); }}
                                            style={{ padding: '0.45rem 0.9rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                                          >
                                            Confirm
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleReviewDailyReward(notification, 'deny'); }}
                                            style={{ padding: '0.45rem 0.9rem', background: 'transparent', color: '#ef4444', border: '1.5px solid #ef4444', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                                          >
                                            Deny
                                          </button>
                                        </div>
                                      )}
                                      {notification.type === 'follow' && notification.actor_id && !userFollows.includes(notification.actor_id) && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleFollow(notification.actor_id, false);
                                            }}
                                            style={{
                                              padding: '0.5rem 1.2rem',
                                              background: '#ffffff',
                                              color: '#000000',
                                              border: '1.5px solid #e0e0e0',
                                              borderRadius: '20px',
                                              fontSize: '0.9rem',
                                              fontWeight: '600',
                                              cursor: 'pointer',
                                              flexShrink: 0
                                            }}
                                          >
                                            Follow back
                                          </button>
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              // Remove the follower and dismiss notification
                                              await supabase.from('follows').delete()
                                                .eq('follower_id', notification.actor_id)
                                                .eq('following_id', user.id);
                                              await supabase.from('notifications').delete()
                                                .eq('id', notification.id);
                                              setNotifications(prev => prev.filter(n => n.id !== notification.id));
                                            }}
                                            style={{
                                              width: '24px',
                                              height: '24px',
                                              borderRadius: '50%',
                                              background: 'none',
                                              border: 'none',
                                              color: '#ff4444',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              padding: 0,
                                              flexShrink: 0
                                            }}
                                            title="Decline follow"
                                          >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M18 6L6 18M6 6l12 12"/>
                                            </svg>
                                          </button>
                                        </div>
                                      )}
                                      {notification.type === 'follow' && notification.actor_id && userFollows.includes(notification.actor_id) && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm(`Unfollow ${notification.profiles?.display_name || notification.profiles?.username}?`)) {
                                              handleFollow(notification.actor_id, true);
                                            }
                                          }}
                                          style={{
                                            padding: '0.5rem 1.2rem',
                                            background: '#000000',
                                            color: '#ffffff',
                                            border: 'none',
                                            borderRadius: '20px',
                                            fontSize: '0.9rem',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            flexShrink: 0
                                          }}
                                        >
                                          Following
                                        </button>
                                      )}
                                      {!notification.is_read && notification.type !== 'follow' && (
                                        <div style={{
                                          width: '8px',
                                          height: '8px',
                                          borderRadius: '50%',
                                          background: '#ff4444',
                                          flexShrink: 0
                                        }} />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div style={{
                                textAlign: 'center',
                                padding: '3rem 2rem',
                                color: 'var(--text-muted)'
                              }}>
                                <BellIcon style={{ width: '48px', height: '48px', opacity: 0.5, marginBottom: '1rem' }} />
                                <p style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No notifications yet</p>
                                <p style={{ fontSize: '0.85rem' }}>When someone follows you, likes your posts, or comments on your content, you'll see it here.</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* User Profile View */}
                {viewingUserId && (
                  <UserProfileView
                    key={`${viewingUserId}-${profileScrollToPostId}`}
                    userId={viewingUserId}
                    onBack={() => {
                      setViewingUserId(null);
                      setProfileScrollToPostId(null);
                      setProfileInitialTab(null);
                      if (previousActiveTab) {
                        setActiveTab(previousActiveTab);
                        setPreviousActiveTab(null);
                      }
                    }}
                    posts={posts}
                    onLike={handleLike}
                    userLikes={userLikes}
                    onCommentAdded={handleCommentAdded}
                    onSave={handleSave}
                    userSaves={userSaves}
                    currentUser={user}
                    viewerIsAdmin={isPlatformAdmin}
                    userFollows={userFollows}
                    onFollow={handleFollow}
                    onEditProfile={() => setShowSettingsModal(true)}
                    onOpenCreatorPayments={() => setShowCreatorPaymentsModal(true)}
                    onOpenDrafts={() => setShowDraftsList(true)}
                    creatorPendingCount={pendingPaidRequestCount}
                    onAuthRequired={() => setShowAuthModal(true)}
                    categories={categories}
                    onDelete={handleDeletePost}
                    onViewUser={(userId) => {
                      setProfileScrollToPostId(null);
                      setProfileInitialTab(null);
                      setViewingUserId(userId);
                    }}
                    onOpenFullPost={setSelectedFullPost}
                    onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                    initialTab={profileInitialTab}
                    scrollToPostId={profileScrollToPostId}
                    allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                    onSchoolClick={navigateToSchool}
                    onToolClick={navigateToTool}
                    onCategoryClick={navigateToCategory}
                    schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                    onShowRanks={() => { setActiveTab('ranks'); window.history.pushState({}, '', '/ranks'); }}
                    onCommunityClick={(community) => {
                      selectCommunity(community);
                      setActiveTab('communities');
                      setViewingUserId(null);
                    }}
                    userCommunities={userCommunities}
                    onPostCommunitiesChange={handlePostCommunitiesChange}
                    postCommunities={postCommunities}
                    userCommunityIds={userCommunityIds}
                    onOpenMessages={(convId) => {
                      setMessagesInitialConv(convId);
                      setActiveTab('messages');
                      setViewingUserId(null);
                    }}
                    feedViewMode={feedViewMode}
                  />
                )}

                {/* CREATE WORKFLOW VIEW */}
                {showCreateWorkflow && (
                  <CreateWorkflowWrapper
                    supabase={supabase}
                    user={user}
                    categories={categories}
                    aiTools={AI_TOOLS}
                    getToolDisplayName={getToolDisplayName}
                    onSuccess={(workflow) => {
                      setShowCreateWorkflow(false);
                      loadExploreWorkflows();
                      loadMyProfileWorkflows();
                      if (workflow && workflow.id) {
                        setSelectedWorkflowId(workflow.id);
                      }
                    }}
                    onClose={() => {
                      setShowCreateWorkflow(false);
                      if (window.location.pathname === '/new/workflow' || window.location.pathname === '/create/workflow') {
                        window.history.pushState({}, '', '/');
                      }
                    }}
                  />
                )}

                {/* WORKFLOW DETAIL VIEW */}
                {selectedWorkflowId && !showCreateWorkflow && (
                  <WorkflowDetailWrapper
                    workflowId={selectedWorkflowId}
                    supabase={supabase}
                    currentUser={user}
                    onClose={() => {
                      setSelectedWorkflowId(null);
                      if (window.location.pathname.startsWith('/workflow/')) {
                        window.history.pushState({}, '', '/');
                      }
                    }}
                    onUserClick={(userId) => {
                      setSelectedWorkflowId(null);
                      setViewingUserId(userId);
                    }}
                    onAuthRequired={() => setShowAuthModal(true)}
                    categories={categories}
                    getToolDisplayName={getToolDisplayName}
                    onWorkflowDeleted={(id) => {
                      setExploreWorkflows(prev => prev.filter(w => w.id !== id));
                      setMyProfileWorkflows(prev => prev.filter(w => w.id !== id));
                    }}
                    onWorkflowForked={(forkedWorkflow) => {
                      if (forkedWorkflow && forkedWorkflow.id) {
                        setSelectedWorkflowId(forkedWorkflow.id);
                        loadExploreWorkflows();
                        loadMyProfileWorkflows();
                      }
                    }}
                  />
                )}

                {/* TAB 2: EXPLORE */}
                {activeTab === 'explore' && !viewingUserId && !showCreateWorkflow && !selectedWorkflowId && (
                  <div className="explore-tab">
                    <Helmet>
                      <title>{viewingCategoryId ? `${categories.find(c => c.id === viewingCategoryId)?.name || 'Category'} - AI Builds & Prompts | Prompted` : viewingToolName ? `${viewingToolName} AI Builds & Prompts | Prompted` : 'Explore AI Builds & Prompts | Prompted'}</title>
                      <meta name="description" content={viewingCategoryId ? `Browse AI ${categories.find(c => c.id === viewingCategoryId)?.name || ''} builds and prompts on Prompted.` : viewingToolName ? `See what people are building with ${viewingToolName} on Prompted.` : 'Explore AI builds, prompts, and workflows. Browse by category, AI tool, or search for inspiration.'} />
                      <meta property="og:title" content={viewingToolName ? `${viewingToolName} AI Builds | Prompted` : 'Explore AI Builds | Prompted'} />
                      <meta property="og:description" content="Discover AI builds and the prompts used to make them." />
                    </Helmet>
                    {/* School Leaderboard Page */}
                    {schoolLeaderboardView ? (
                      <div className="schools-leaderboard-page">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                          <button
                            onClick={() => { setSchoolLeaderboardView(false); window.history.pushState({}, '', '/'); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                          </button>
                          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', fontFamily: "'Fraunces', serif" }}>School Leaderboard</h3>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table className="leaderboard-table">
                            <thead>
                              <tr>
                                <th style={{ width: '40px' }}>#</th>
                                <th
                                  className={leaderboardSortBy === 'name' ? 'sorted' : ''}
                                  onClick={() => setLeaderboardSortBy('name')}
                                >School</th>
                                <th
                                  className={leaderboardSortBy === 'member_count' ? 'sorted' : ''}
                                  onClick={() => setLeaderboardSortBy('member_count')}
                                >Members{leaderboardSortBy === 'member_count' && <span className="sort-arrow">▼</span>}</th>
                                <th
                                  className={leaderboardSortBy === 'post_count' ? 'sorted' : ''}
                                  onClick={() => setLeaderboardSortBy('post_count')}
                                >Posts{leaderboardSortBy === 'post_count' && <span className="sort-arrow">▼</span>}</th>
                                <th
                                  className={leaderboardSortBy === 'total_likes' ? 'sorted' : ''}
                                  onClick={() => setLeaderboardSortBy('total_likes')}
                                >Likes{leaderboardSortBy === 'total_likes' && <span className="sort-arrow">▼</span>}</th>
                                <th
                                  className={leaderboardSortBy === 'active_creators' ? 'sorted' : ''}
                                  onClick={() => setLeaderboardSortBy('active_creators')}
                                >Active{leaderboardSortBy === 'active_creators' && <span className="sort-arrow">▼</span>}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...schoolLeaderboard].sort((a, b) => {
                                if (leaderboardSortBy === 'name') return a.name.localeCompare(b.name);
                                return (b[leaderboardSortBy] || 0) - (a[leaderboardSortBy] || 0);
                              }).map((school, idx) => (
                                <tr
                                  key={school.id}
                                  className={`leaderboard-row ${idx < 3 ? `rank-top-${idx + 1}` : ''}`}
                                  onClick={() => navigateToSchool(school.slug)}
                                >
                                  <td className={`leaderboard-rank-cell ${idx < 3 ? `rank-${idx + 1}` : ''}`}>
                                    {idx + 1}
                                  </td>
                                  <td>
                                    <div className="leaderboard-school-cell">
                                      <div>
                                        <div className="leaderboard-school-name" style={{ color: school.color || 'var(--text-primary)' }}>{school.name}</div>
                                        <div className="leaderboard-school-location">{school.location}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="leaderboard-stat-cell">{school.member_count || 0}</td>
                                  <td className="leaderboard-stat-cell">{school.post_count || 0}</td>
                                  <td className="leaderboard-stat-cell" style={{ color: idx < 3 ? (idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#CD7F32') : 'var(--text-primary)' }}>{school.total_likes || 0}</td>
                                  <td className="leaderboard-stat-cell">{school.active_creators || 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                    ) : viewingSchoolSlug ? (
                      /* Individual School Page */
                      <div className="school-page">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                          <button
                            onClick={() => { setViewingSchoolSlug(null); setSchoolDetails(null); setSchoolPosts([]); setSchoolTopCreators([]); window.history.pushState({}, '', '/'); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                          </button>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Back</span>
                        </div>

                        {schoolsLoading ? (
                          <div className="loading-state"><div className="spinner"></div><p>Loading school...</p></div>
                        ) : schoolDetails ? (
                          <>
                            {/* Hero Section */}
                            <div className="school-hero-clean">
                              <div className="school-hero-clean-top">
                                <div className="school-hero-clean-info">
                                  <div className="school-hero-clean-name" style={{ color: schoolDetails.color || 'var(--text-primary)' }}>
                                    {schoolDetails.name}
                                    {schoolDetails.is_verified && (
                                      <span className="school-verified-badge">✓ Verified</span>
                                    )}
                                  </div>
                                  {schoolDetails.location && <div className="school-hero-clean-location">{schoolDetails.location}</div>}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  {user && (
                                    userSchool && userSchool.school_id === schoolDetails.id ? (
                                      <button
                                        className="school-join-btn joined"
                                        onClick={handleLeaveSchool}
                                      >
                                        Leave School
                                      </button>
                                    ) : (
                                      <button
                                        className="school-join-btn"
                                        style={{ background: schoolDetails.color || '#fff', color: '#fff' }}
                                        onClick={() => handleJoinSchool(schoolDetails.id)}
                                      >
                                        Join School
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Stats Bar */}
                            <div className="school-stats-bar">
                              <div className="school-stat-item school-stat-clickable" onClick={() => loadSchoolMembers(schoolDetails.id)}>
                                <span className="school-stat-value">{schoolDetails.member_count || 0}</span>
                                <span className="school-stat-label">Members</span>
                              </div>
                              <div className="school-stat-item">
                                <span className="school-stat-value">{schoolDetails.post_count || 0}</span>
                                <span className="school-stat-label">Posts</span>
                              </div>
                              <div className="school-stat-item">
                                <span className="school-stat-value">{schoolDetails.total_likes || 0}</span>
                                <span className="school-stat-label">Likes</span>
                              </div>
                              <div className="school-stat-item">
                                <span className="school-stat-value">{schoolDetails.active_creators || 0}</span>
                                <span className="school-stat-label">Active</span>
                              </div>
                            </div>

                            {/* Tabs: Trending Now / Recent / Top Creators */}
                            <div className="school-feed-tabs">
                              <button
                                className={`school-feed-tab ${viewingSchoolTab === 'trending' ? 'active' : ''}`}
                                onClick={() => setViewingSchoolTab('trending')}
                              >Trending Now</button>
                              <button
                                className={`school-feed-tab ${viewingSchoolTab === 'recent' ? 'active' : ''}`}
                                onClick={() => setViewingSchoolTab('recent')}
                              >Recent</button>
                              <button
                                className={`school-feed-tab ${viewingSchoolTab === 'creators' ? 'active' : ''}`}
                                onClick={() => setViewingSchoolTab('creators')}
                              >Top Creators</button>
                            </div>

                            {viewingSchoolTab === 'creators' ? (
                              <div className="school-creators-section">
                                {schoolTopCreators.length > 0 ? (
                                  <div className="school-creators-grid">
                                    {schoolTopCreators.map((creator, idx) => (
                                      <div
                                        key={creator.user_id}
                                        className="school-creator-item"
                                        onClick={() => { setPreviousActiveTab('explore'); setViewingUserId(creator.user_id); }}
                                      >
                                        <div className="school-creator-avatar">
                                          {creator.avatar_url ? (
                                            <img src={creator.avatar_url} alt="" />
                                          ) : creator.avatar_emoji ? (
                                            <span>{creator.avatar_emoji}</span>
                                          ) : (
                                            <UserIcon />
                                          )}
                                        </div>
                                        <div className="school-creator-info">
                                          <div className="school-creator-name" style={creator.name_color ? { color: creator.name_color } : {}}>
                                            {creator.display_name || creator.username}
                                            <BuilderRankBadge points={creator.builder_points} ranks={builderRanks} />
                                            <UserBadge username={creator.username} size={15} />
                                          </div>
                                          <div className="school-creator-username">@{creator.username}</div>
                                        </div>
                                        <div className="school-creator-stats">
                                          <span>{creator.builder_points || 0} pts</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="empty-state">
                                    <p className="empty-text">No creators yet</p>
                                  </div>
                                )}
                              </div>
                            ) : viewingSchoolTab === 'trending' ? (
                              /* Trending Now - posts sorted by likes (must have at least 1) */
                              <div>
                                {schoolTrendingLoading ? (
                                  <div className="loading-state"><div className="spinner"></div></div>
                                ) : schoolTrendingPosts.length > 0 ? (
                                  feedViewMode === 'grid' ? (
                                    <PostGrid posts={schoolTrendingPosts} onOpenFullPost={setSelectedFullPost} />
                                  ) : (
                                  schoolTrendingPosts.map(post => (
                                    <PostCard
                                      key={post.id}
                                      post={post}
                                      onLike={handleLike}
                                      userLikes={userLikes}
                                      onCommentAdded={handleCommentAdded}
                                      onUserClick={setViewingUserId}
                                      onSave={handleSave}
                                      userSaves={userSaves}
                                      onAuthRequired={() => setShowAuthModal(true)}
                                      categories={categories}
                                      onDelete={handleDeletePost}
                                      onOpenFullPost={setSelectedFullPost}
                                      onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                                      onCategoryClick={(categoryId) => {
                                        setViewingCategoryId(categoryId);
                                        setCategoryViewTab('most-liked');
                                      }}
                                      postCommunities={postCommunities}
                                      userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                                      onCommunityClick={(community) => {
                                        setActiveTab('communities');
                                        selectCommunity(community);
                                      }}
                                      allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                                      schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                                      onSchoolClick={navigateToSchool}
                                      onToolClick={navigateToTool}
                                    />
                                  ))
                                  )
                                ) : (
                                  <div className="empty-state">
                                    <p className="empty-text">There are no posts trending yet</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* Recent - school feed sorted by newest */
                              <div>
                                {schoolPostsLoading ? (
                                  <div className="loading-state"><div className="spinner"></div></div>
                                ) : schoolPosts.length > 0 ? (
                                  feedViewMode === 'grid' ? (
                                    <PostGrid posts={schoolPosts} onOpenFullPost={setSelectedFullPost} />
                                  ) : (
                                  schoolPosts.map(post => (
                                    <PostCard
                                      key={post.id}
                                      post={post}
                                      onLike={handleLike}
                                      userLikes={userLikes}
                                      onCommentAdded={handleCommentAdded}
                                      onUserClick={setViewingUserId}
                                      onSave={handleSave}
                                      userSaves={userSaves}
                                      onAuthRequired={() => setShowAuthModal(true)}
                                      categories={categories}
                                      onDelete={handleDeletePost}
                                      onOpenFullPost={setSelectedFullPost}
                                      onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                                      onCategoryClick={(categoryId) => {
                                        setViewingCategoryId(categoryId);
                                        setCategoryViewTab('most-liked');
                                      }}
                                      postCommunities={postCommunities}
                                      userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                                      onCommunityClick={(community) => {
                                        setActiveTab('communities');
                                        selectCommunity(community);
                                      }}
                                      allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                                      schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                                      onSchoolClick={navigateToSchool}
                                      onToolClick={navigateToTool}
                                    />
                                  ))
                                  )
                                ) : (
                                  <div className="empty-state">
                                    <div className="empty-icon">🎓</div>
                                    <p className="empty-text">No posts from this school yet</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="empty-state">
                            <p className="empty-text">School not found</p>
                          </div>
                        )}
                      </div>

                    ) : viewingCategoryId ? (
                      <div className="category-view">
                        {(() => {
                          const collection = EXPLORE_COLLECTIONS.find(c => c.id === viewingCategoryId);
                          if (!collection) return null;
                          return (
                            <div
                              style={{
                                background: collection.gradient,
                                borderRadius: 16,
                                padding: '1.75rem 1.5rem 1.5rem',
                                marginBottom: '1rem',
                                color: '#fff',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                              }}
                            >
                              <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>{collection.emoji}</span>
                              <div style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.015em' }}>
                                {collection.title}
                              </div>
                              <div style={{ fontSize: '0.95rem', opacity: 0.92, lineHeight: 1.5, maxWidth: 640 }}>
                                {collection.description} Posts below come from people building in this space.
                              </div>
                            </div>
                          );
                        })()}
                        <div className="category-view-header">
                          <button
                            className="back-button"
                            onClick={() => {
                              if (categoryNavigationOrigin) {
                                // Return the user to where they came from (e.g. the profile).
                                const origin = categoryNavigationOrigin;
                                _setViewingCategoryId(null);
                                setCategoryNavigationOrigin(null);
                                setActiveTab(origin.activeTab);
                                if (origin.viewingUserId) {
                                  setViewingUserId(origin.viewingUserId);
                                }
                                window.history.pushState({}, '', origin.url);
                                if (origin.scrollY != null) {
                                  setTimeout(() => window.scrollTo({ top: origin.scrollY }), 100);
                                }
                              } else {
                                setViewingCategoryId(null);
                                window.history.pushState({}, '', '/explore');
                              }
                            }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 12H5M12 19l-7-7 7-7"/>
                            </svg>
                            {categoryNavigationOrigin ? 'Back' : 'Back to Explore'}
                          </button>
                          <div className="category-view-title-section">
                            <h2 className="category-view-title">
                              {(() => {
                                const cat = categories.find(c => c.id === viewingCategoryId);
                                if (cat) return cat.name;
                                const collection = EXPLORE_COLLECTIONS.find(c => c.id === viewingCategoryId);
                                return collection ? collection.title : 'Category';
                              })()}
                            </h2>
                            {(() => {
                              const isFollowed = userFollowedCategories.includes(viewingCategoryId);
                              return (
                                <button
                                  className={`category-follow-btn ${isFollowed ? 'following' : ''}`}
                                  onClick={() => handleFollowCategory(viewingCategoryId, isFollowed)}
                                >
                                  {isFollowed ? (
                                    <>
                                      <CheckIcon />
                                      Following
                                    </>
                                  ) : (
                                    <>
                                      <PlusIcon />
                                      Follow
                                    </>
                                  )}
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                        <CategoryArenaLeaders
                          communityCategoryId={viewingCategoryId}
                          onJumpToArena={(arenaCategoryId) => {
                            setArenaInitialJumpCategoryId(arenaCategoryId || null);
                            setActiveTab('arena');
                            setViewingCategoryId(null);
                            window.history.pushState({}, '', '/arena');
                            window.scrollTo({ top: 0 });
                          }}
                        />
                        <div className="category-view-tabs">
                          <button
                            className={`category-view-tab ${categoryViewTab === 'most-liked' ? 'active' : ''}`}
                            onClick={() => setCategoryViewTab('most-liked')}
                          >
                            Most Liked
                          </button>
                          <button
                            className={`category-view-tab ${categoryViewTab === 'most-recent' ? 'active' : ''}`}
                            onClick={() => setCategoryViewTab('most-recent')}
                          >
                            Most Recent
                          </button>
                        </div>
                        <div className="category-view-posts">
                          {categoryPostsLoading ? (
                            <div className="loading-state"><div className="spinner"></div><p>Loading posts...</p></div>
                          ) : categoryPosts.length > 0 ? (
                            feedViewMode === 'grid' ? (
                              <PostGrid posts={categoryPosts} onOpenFullPost={setSelectedFullPost} />
                            ) : (
                            categoryPosts.map(post => (
                              <PostCard
                                key={post.id}
                                post={post}
                                onLike={handleLike}
                                userLikes={userLikes}
                                onCommentAdded={handleCommentAdded}
                                onUserClick={setViewingUserId}
                                onSave={handleSave}
                                userSaves={userSaves}
                                onAuthRequired={() => setShowAuthModal(true)}
                                categories={categories}
                                onDelete={handleDeletePost}
                                onOpenFullPost={setSelectedFullPost}
                                onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                                onCategoryClick={(categoryId) => {
                                  setViewingCategoryId(categoryId);
                                  setCategoryViewTab('most-liked');
                                }}
                                postCommunities={postCommunities}
                                userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                                onCommunityClick={(community) => {
                                  setActiveTab('communities');
                                  selectCommunity(community);
                                }}
                                allPosts={posts}
                                forkedPostsMap={forkedPostsMap}
                                schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                                onSchoolClick={navigateToSchool}
                                onToolClick={navigateToTool}
                              />
                            ))
                            )
                          ) : (
                            <div className="empty-state">
                              <div className="empty-icon"><InboxIcon /></div>
                              <p className="empty-text">No posts in this category yet</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : exploreSubView === 'workflows' ? (
                      <div style={{ padding: '0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', padding: '0 0.5rem' }}>
                          <button
                            onClick={() => setExploreSubView(null)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: '0.25rem',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 12H5M12 19l-7-7 7-7"/>
                            </svg>
                          </button>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>All Workflows</h3>
                        </div>
                        {exploreWorkflowsLoading ? (
                          <div className="loading-state"><div className="spinner"></div><p>Loading workflows...</p></div>
                        ) : exploreWorkflows.length > 0 ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                            {exploreWorkflows.map(wf => (
                              <WorkflowCard
                                key={wf.id}
                                workflow={wf}
                                onLike={handleWorkflowLike}
                                onSave={handleWorkflowSave}
                                isLiked={userWorkflowLikes.includes(wf.id)}
                                isSaved={userWorkflowSaves.includes(wf.id)}
                                onUserClick={setViewingUserId}
                                onOpenWorkflow={(w) => setSelectedWorkflowId(w.id)}
                                onAuthRequired={() => setShowAuthModal(true)}
                                currentUser={user}
                                categories={categories}
                                getToolDisplayName={getToolDisplayName}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="empty-state">
                            <div className="empty-icon">
                              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                                <polyline points="9,11 12,14 22,4"/>
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                              </svg>
                            </div>
                            <p className="empty-text">No workflows yet. Be the first to create one!</p>
                            <button
                              onClick={() => { setExploreSubView(null); setShowCreateWorkflow(true); }}
                              style={{
                                marginTop: '0.75rem',
                                background: 'rgba(139, 92, 246, 0.15)',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                color: '#a78bfa',
                                padding: '0.5rem 1rem',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                fontWeight: '600',
                                fontSize: '0.85rem',
                              }}
                            >
                              Create Workflow
                            </button>
                          </div>
                        )}
                      </div>
                    ) : exploreSubView === 'allCategories' ? (
                      <div style={{ padding: '0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', padding: '0 0.5rem' }}>
                          <button
                            onClick={() => setExploreSubView(null)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: '0.25rem',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 12H5M12 19l-7-7 7-7"/>
                            </svg>
                          </button>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>All Categories</h3>
                        </div>
                        <div className="categories-follow-grid">
                          {categories.filter(cat => cat.name.toLowerCase() !== 'other').map(cat => {
                            const isFollowed = userFollowedCategories.includes(cat.id);
                            return (
                              <div
                                key={cat.id}
                                className={`category-bubble ${isFollowed ? 'followed' : ''}`}
                                style={{ cursor: 'pointer' }}
                              >
                                <span
                                  className="category-bubble-name"
                                  onClick={() => { setViewingCategoryId(cat.id); setCategoryViewTab('most-liked'); }}
                                  style={{ cursor: 'pointer', flex: 1 }}
                                >
                                  {cat.name}
                                </span>
                                <button
                                  className="category-bubble-btn"
                                  onClick={(e) => { e.stopPropagation(); handleFollowCategory(cat.id, isFollowed); }}
                                  title={isFollowed ? 'Unfollow' : 'Follow'}
                                >
                                  {isFollowed ? <CheckIcon /> : <PlusIcon />}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : exploreSubView === 'toolDetail' && viewingToolName ? (
                      <div style={{ padding: '0' }}>
                        <div className="category-view-header">
                          <button
                            className="back-button"
                            onClick={() => {
                              if (toolNavigatedFromAllTools) {
                                setExploreSubView('allTools');
                                setViewingToolName(null);
                                setViewingToolId(null);
                                setToolPosts([]);
                                setToolSearchQuery('');
                                setToolSearchResults([]);
                                setToolNavigatedFromAllTools(false);
                                setToolNavigationOrigin(null);
                                window.history.pushState({}, '', '/explore');
                              } else if (toolNavigationOrigin) {
                                // Return user to where they came from
                                const origin = toolNavigationOrigin;
                                setExploreSubView(null);
                                setViewingToolName(null);
                                setViewingToolId(null);
                                setToolPosts([]);
                                setToolSearchQuery('');
                                setToolSearchResults([]);
                                setToolNavigationOrigin(null);
                                setActiveTab(origin.activeTab);
                                if (origin.viewingUserId) {
                                  setViewingUserId(origin.viewingUserId);
                                }
                                if (origin.selectedFullPost) {
                                  setSelectedFullPost(origin.selectedFullPost);
                                }
                                window.history.pushState({}, '', origin.url);
                                if (origin.scrollY != null) {
                                  setTimeout(() => window.scrollTo({ top: origin.scrollY }), 100);
                                }
                              } else {
                                setExploreSubView(null);
                                setViewingToolName(null);
                                setViewingToolId(null);
                                setToolPosts([]);
                                setToolSearchQuery('');
                                setToolSearchResults([]);
                                window.history.pushState({}, '', '/explore');
                              }
                            }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 12H5M12 19l-7-7 7-7"/>
                            </svg>
                            {toolNavigatedFromAllTools ? 'Back to All Tools' : toolNavigationOrigin ? 'Back' : 'Back to Explore'}
                          </button>
                          <div className="category-view-title-section">
                            <h2 className="category-view-title">{viewingToolName}</h2>
                          </div>
                        </div>
                        <ToolArenaRankings
                          toolId={viewingToolId}
                          toolName={viewingToolName}
                          onGoToArena={(categoryId) => {
                            setArenaInitialFocusedTool({ id: viewingToolId, name: viewingToolName });
                            setArenaInitialJumpCategoryId(categoryId || null);
                            setActiveTab('arena');
                            setExploreSubView(null);
                            setViewingToolName(null);
                            setViewingToolId(null);
                            setToolPosts([]);
                            setToolSearchQuery('');
                            setToolSearchResults([]);
                            setToolNavigationOrigin(null);
                            setToolNavigatedFromAllTools(false);
                            window.history.pushState({}, '', '/arena');
                            window.scrollTo({ top: 0 });
                          }}
                        />
                        <div className="category-view-tabs">
                          <button
                            className={`category-view-tab ${toolViewTab === 'trending' ? 'active' : ''}`}
                            onClick={() => setToolViewTab('trending')}
                          >
                            Trending
                          </button>
                          <button
                            className={`category-view-tab ${toolViewTab === 'recent' ? 'active' : ''}`}
                            onClick={() => setToolViewTab('recent')}
                          >
                            Recent
                          </button>
                          <button
                            className={`category-view-tab ${toolViewTab === 'questions' ? 'active' : ''}`}
                            onClick={() => setToolViewTab('questions')}
                          >
                            Questions
                          </button>
                        </div>
                        <div style={{ padding: '0 1.5rem 1rem', display: 'grid', gap: '0.75rem' }}>
                          <div className="explore-search" style={{ marginBottom: 0 }}>
                            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                            </svg>
                            <input
                              type="text"
                              placeholder={`Search ${viewingToolName} ${isToolQuestionsTab ? 'questions' : 'posts'}...`}
                              value={toolSearchQuery}
                              onChange={(e) => setToolSearchQuery(e.target.value)}
                            />
                            {toolSearchQuery && (
                              <button
                                className="search-clear-btn"
                                onClick={() => {
                                  setToolSearchQuery('');
                                  setToolSearchResults([]);
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          {toolModelOptions.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Model</span>
                              <select
                                className="form-input"
                                value={selectedToolModelFilter}
                                onChange={(e) => setSelectedToolModelFilter(e.target.value)}
                                style={{ minHeight: '2.1rem', fontSize: '0.85rem', padding: '0.45rem 0.65rem' }}
                              >
                                <option value="">All models</option>
                                {toolModelOptions.map(model => (
                                  <option key={`tool-model-filter-${model}`} value={model}>{model}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        <div className="category-view-posts">
                          {toolSearchQuery.trim() ? (
                            toolSearchLoading ? (
                              <div className="loading-state"><div className="spinner"></div><p>Searching {viewingToolName} {isToolQuestionsTab ? 'questions' : 'posts'}...</p></div>
                            ) : displayedToolSearchResults.length > 0 ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setSelectedFullPost(displayedToolSearchResults[0])}
                                  style={{
                                  marginBottom: '1rem',
                                  padding: '0.75rem 1rem',
                                  borderRadius: '10px',
                                  background: 'var(--card-bg)',
                                  border: '1px solid var(--border-color)',
                                  color: 'var(--text-secondary)',
                                  fontSize: '0.9rem',
                                  width: '100%',
                                  textAlign: 'left',
                                  cursor: 'pointer'
                                }}>
                                  Best match: <strong style={{ color: 'var(--text-primary)' }}>{displayedToolSearchResults[0]?.title}</strong>
                                </button>
                                {feedViewMode === 'grid' ? (
                                  <PostGrid posts={displayedToolSearchResults} onOpenFullPost={setSelectedFullPost} />
                                ) : displayedToolSearchResults.map(post => (
                                  <PostCard
                                    key={post.id}
                                    post={post}
                                    onLike={handleLike}
                                    userLikes={userLikes}
                                    onCommentAdded={handleCommentAdded}
                                    onUserClick={setViewingUserId}
                                    onSave={handleSave}
                                    userSaves={userSaves}
                                    onAuthRequired={() => setShowAuthModal(true)}
                                    categories={categories}
                                    onDelete={handleDeletePost}
                                    onOpenFullPost={setSelectedFullPost}
                                    onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                                    onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                                    onCategoryClick={(categoryId) => {
                                      setViewingCategoryId(categoryId);
                                      setCategoryViewTab('most-liked');
                                    }}
                                    postCommunities={postCommunities}
                                    userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                                    onCommunityClick={(community) => {
                                      setActiveTab('communities');
                                      selectCommunity(community);
                                    }}
                                    allPosts={posts}
                                    forkedPostsMap={forkedPostsMap}
                                    schoolsData={schoolLeaderboard}
                                    builderRanks={builderRanks}
                                    onSchoolClick={navigateToSchool}
                                    onToolClick={navigateToTool}
                                  />
                                ))}
                              </>
                            ) : (
                              <div className="empty-state">
                                <div className="empty-icon"><InboxIcon /></div>
                                <p className="empty-text">No {viewingToolName} {isToolQuestionsTab ? 'questions' : 'posts'} matched "{toolSearchQuery.trim()}"{selectedToolModelFilter ? ` for model ${selectedToolModelFilter}` : ''}</p>
                              </div>
                            ) /* end displayedToolSearchResults */
                          ) : toolPostsLoading ? (
                            <div className="loading-state"><div className="spinner"></div><p>Loading posts...</p></div>
                          ) : displayedToolPosts.length > 0 ? (
                            feedViewMode === 'grid' ? (
                              <PostGrid posts={displayedToolPosts} onOpenFullPost={setSelectedFullPost} />
                            ) : (
                            displayedToolPosts.map(post => (
                              <PostCard
                                key={post.id}
                                post={post}
                                onLike={handleLike}
                                userLikes={userLikes}
                                onCommentAdded={handleCommentAdded}
                                onUserClick={setViewingUserId}
                                onSave={handleSave}
                                userSaves={userSaves}
                                onAuthRequired={() => setShowAuthModal(true)}
                                categories={categories}
                                onDelete={handleDeletePost}
                                onOpenFullPost={setSelectedFullPost}
                                onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                                onCategoryClick={(categoryId) => {
                                  setViewingCategoryId(categoryId);
                                  setCategoryViewTab('most-liked');
                                }}
                                postCommunities={postCommunities}
                                userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                                onCommunityClick={(community) => {
                                  setActiveTab('communities');
                                  selectCommunity(community);
                                }}
                                allPosts={posts}
                                forkedPostsMap={forkedPostsMap}
                                schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                                onSchoolClick={navigateToSchool}
                                onToolClick={navigateToTool}
                              />
                            ))
                            )
                          ) : (
                            <div className="empty-state">
                              <div className="empty-icon"><InboxIcon /></div>
                              <p className="empty-text">No {isToolQuestionsTab ? 'questions' : 'posts'} found for {viewingToolName}{selectedToolModelFilter ? ` (${selectedToolModelFilter})` : ''} yet</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : exploreSubView === 'allTools' ? (
                      <div style={{ padding: '0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', padding: '0 0.5rem' }}>
                          <button
                            onClick={() => { setExploreSubView(null); setToolSearchQuery(''); }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: '0.25rem',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 12H5M12 19l-7-7 7-7"/>
                            </svg>
                          </button>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>All Tools</h3>
                        </div>
                        <div style={{ padding: '0 0.5rem', marginBottom: '1rem' }}>
                          <div className="explore-search" style={{ marginBottom: 0 }}>
                            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="11" cy="11" r="8"/>
                              <path d="m21 21-4.35-4.35"/>
                            </svg>
                            <input
                              type="text"
                              placeholder="Search tools..."
                              value={toolSearchQuery}
                              onChange={(e) => setToolSearchQuery(e.target.value)}
                            />
                            {toolSearchQuery && (
                              <button onClick={() => setToolSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="categories-follow-grid">
                          {AI_TOOL_NAMES.filter(tool => !toolSearchQuery || tool.toLowerCase().includes(toolSearchQuery.toLowerCase())).map(tool => (
                              <div
                                key={tool}
                                className="category-bubble"
                                style={{ cursor: 'pointer' }}
                                onClick={() => { setToolNavigatedFromAllTools(true); navigateToTool(tool); }}
                              >
                                <span
                                  className="category-bubble-name"
                                  style={{ cursor: 'pointer', flex: 1 }}
                                >{tool}</span>
                              </div>
                          ))}
                          {AI_TOOL_NAMES.filter(tool => !toolSearchQuery || tool.toLowerCase().includes(toolSearchQuery.toLowerCase())).length === 0 && (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No tools matching "{toolSearchQuery}"</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                    {/* Mobile-only back button — leaves Explore for Home. On
                       mobile the bottom nav is hidden (app-with-sidebar), so
                       this gives a clear way out of the Explore page. */}
                    <button
                      className="explore-mobile-back"
                      onClick={() => {
                        setActiveTab('foryou');
                        setSearchQuery('');
                        setCreatorSearch('');
                        setActiveCommunity(null);
                        setShowSearchPage(false);
                        clearExploreSearch();
                        window.history.replaceState({}, '', '/');
                        window.scrollTo({ top: 0, behavior: 'instant' });
                      }}
                      aria-label="Back to Home"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                      Back to Home
                    </button>
                    {/* Unified Search Bar */}
                    <div className="explore-search-container">
                      <div className="explore-search">
                        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8"/>
                          <path d="m21 21-4.35-4.35"/>
                        </svg>
                        <input
                          type="text"
                          placeholder="Search posts, users, communities, tools..."
                          value={exploreSearchQuery}
                          onChange={(e) => {
                            setExploreSearchQuery(e.target.value);
                            if (!e.target.value.trim()) {
                              setExploreSearchActive(false);
                              setExploreSearchResults({ posts: [], builds: [], questions: [], communities: [], users: [], tools: [], categories: [] });
                              setExploreDropdownResults({ posts: [], builds: [], questions: [], communities: [], users: [] });
                              window.history.replaceState({}, '', '/explore');
                            }
                          }}
                          onFocus={() => setExploreSearchFocused(true)}
                          onBlur={() => setTimeout(() => setExploreSearchFocused(false), 200)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && exploreSearchQuery.trim()) {
                              e.preventDefault();
                              setExploreSearchFocused(false);
                              const q = exploreSearchQuery.trim();
                              performExploreSearch(q);
                              window.history.replaceState({}, '', `/explore?q=${encodeURIComponent(q)}`);
                            }
                          }}
                        />
                        {exploreSearchQuery && (
                          <button
                            onClick={() => clearExploreSearch()}
                            style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', zIndex: 1 }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                          </button>
                        )}
                      </div>
                      {/* Autocomplete Dropdown (while typing, before pressing Enter) - powered by search_all */}
                      {exploreSearchFocused && exploreSearchQuery.trim() && !exploreSearchActive && (
                        <div className="explore-autocomplete-dropdown">

                          {exploreDropdownLoading && (
                            <div style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              Searching...
                            </div>
                          )}

                          {/* Posts, Builds, Questions preview */}
                          {[
                            { key: 'posts', label: 'Posts', badge: 'Post' },
                            { key: 'builds', label: 'Builds', badge: 'Build' },
                            { key: 'questions', label: 'Questions', badge: 'Question' },
                          ].map(({ key, label, badge }) =>
                            exploreDropdownResults[key] && exploreDropdownResults[key].length > 0 && (
                            <div className="autocomplete-section" key={key}>
                              <div className="autocomplete-section-title">{label}</div>
                              {exploreDropdownResults[key].slice(0, 4).map(p => (
                                <div
                                  key={p.id}
                                  className="autocomplete-item user-item"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    clearExploreSearch();
                                    // Navigate immediately using search result data
                                    setSelectedFullPost({
                                      ...p,
                                      profiles: { id: p.user_id, username: p.username, display_name: p.display_name, avatar_emoji: p.avatar_emoji, avatar_url: p.avatar_url, name_color: p.name_color },
                                    });
                                    // Fetch full post data in background for complete details (with likes_count)
                                    (async () => {
                                      try {
                                        const { data } = await supabase
                                          .from('posts_with_stats')
                                          .select('*')
                                          .eq('id', p.id)
                                          .single();
                                        if (data) _setSelectedFullPost(data);
                                      } catch (err) {
                                        console.error('Failed to fetch full post data:', err);
                                      }
                                    })();
                                  }}
                                >
                                  <div className="autocomplete-user-avatar" style={{ borderRadius: '6px' }}>
                                    {p.images && p.images[0] ? (
                                      <img src={p.images[0]} alt="" style={{ borderRadius: '6px' }} />
                                    ) : (
                                      <ImageIcon />
                                    )}
                                  </div>
                                  <div className="autocomplete-user-info">
                                    <span className="autocomplete-item-name">
                                      {p.title}
                                      <span style={{ marginLeft: '0.4rem', fontSize: '0.6rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontWeight: 500 }}>{p.result_type || badge}</span>
                                    </span>
                                    <span className="autocomplete-username">by {p.display_name || p.username}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}

                          {/* Communities preview */}
                          {exploreDropdownResults.communities.length > 0 && (
                            <div className="autocomplete-section">
                              <div className="autocomplete-section-title">Communities</div>
                              {exploreDropdownResults.communities.slice(0, 3).map(c => (
                                <div
                                  key={c.id}
                                  className="autocomplete-item user-item"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setExploreSearchFocused(false);
                                    setActiveTab('communities');
                                    const fullCommunity = communities.find(fc => fc.id === c.id) || c;
                                    setActiveCommunity(fullCommunity);
                                    loadCommunityPosts(c.id, communityPostSort);
                                    window.scrollTo({ top: 0, behavior: 'instant' });
                                  }}
                                >
                                  <div className="autocomplete-user-avatar">
                                    {c.icon_url ? (
                                      <img src={c.icon_url} alt="" />
                                    ) : c.icon ? (
                                      <span>{c.icon}</span>
                                    ) : (
                                      <CommunityIcon />
                                    )}
                                  </div>
                                  <div className="autocomplete-user-info">
                                    <span className="autocomplete-item-name">{c.name}</span>
                                    <span className="autocomplete-username">{c.member_count || 0} members</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Users preview */}
                          {exploreDropdownResults.users.length > 0 && (
                            <div className="autocomplete-section">
                              <div className="autocomplete-section-title">Users</div>
                              {exploreDropdownResults.users.slice(0, 4).map(u => (
                                <div
                                  key={u.id}
                                  className="autocomplete-item user-item"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setPreviousActiveTab('explore');
                                    setViewingUserId(u.id);
                                    setExploreSearchFocused(false);
                                  }}
                                >
                                  <div className="autocomplete-user-avatar">
                                    {u.avatar_url ? (
                                      <img src={u.avatar_url} alt="" />
                                    ) : u.avatar_emoji ? (
                                      <span>{u.avatar_emoji}</span>
                                    ) : (
                                      <UserIcon />
                                    )}
                                  </div>
                                  <div className="autocomplete-user-info">
                                    <span
                                      className="autocomplete-item-name"
                                      style={u.name_color ? { color: u.name_color, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' } : { display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                    >
                                      {u.display_name || u.username}
                                      <UserBadge username={u.username} size={15} />
                                    </span>
                                    <span className="autocomplete-username">@{u.username}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Tools preview */}
                          {(() => {
                            const q = exploreSearchQuery.trim().toLowerCase();
                            const matchingTools = q ? AI_TOOLS.filter(t => t.name.toLowerCase().includes(q)).slice(0, 3) : [];
                            return matchingTools.length > 0 ? (
                              <div className="autocomplete-section">
                                <div className="autocomplete-section-title">Tools</div>
                                {matchingTools.map(tool => (
                                  <div
                                    key={tool.id}
                                    className="autocomplete-item user-item"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setExploreSearchFocused(false);
                                      navigateToTool(tool.name);
                                    }}
                                  >
                                    <div className="autocomplete-user-avatar" style={{ borderRadius: '6px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                                    </div>
                                    <div className="autocomplete-user-info">
                                      <span className="autocomplete-item-name">{tool.name}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null;
                          })()}

                          {/* Categories preview */}
                          {(() => {
                            const q = exploreSearchQuery.trim().toLowerCase();
                            const matchingCategories = q ? categories.filter(c => c.name.toLowerCase().includes(q)).slice(0, 3) : [];
                            return matchingCategories.length > 0 ? (
                              <div className="autocomplete-section">
                                <div className="autocomplete-section-title">Categories</div>
                                {matchingCategories.map(cat => (
                                  <div
                                    key={cat.id}
                                    className="autocomplete-item user-item"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setExploreSearchFocused(false);
                                      setViewingCategoryId(cat.id);
                                      setCategoryViewTab('most-liked');
                                    }}
                                  >
                                    <div className="autocomplete-user-avatar" style={{ borderRadius: '6px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      {cat.icon ? (
                                        <span style={{ fontSize: '1rem' }}>{cat.icon}</span>
                                      ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                      )}
                                    </div>
                                    <div className="autocomplete-user-info">
                                      <span className="autocomplete-item-name">{cat.name}</span>
                                      <span className="autocomplete-username">Category</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null;
                          })()}

                          {/* See all results */}
                          {(exploreDropdownResults.posts.length > 0 || exploreDropdownResults.communities.length > 0 || exploreDropdownResults.users.length > 0 || (exploreSearchQuery.trim() && AI_TOOLS.some(t => t.name.toLowerCase().includes(exploreSearchQuery.trim().toLowerCase()))) || (exploreSearchQuery.trim() && categories.some(c => c.name.toLowerCase().includes(exploreSearchQuery.trim().toLowerCase())))) && (
                            <div
                              className="autocomplete-section"
                              style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', textAlign: 'center' }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const q = exploreSearchQuery.trim();
                                setExploreSearchFocused(false);
                                performExploreSearch(q);
                                window.history.replaceState({}, '', `/explore?q=${encodeURIComponent(q)}`);
                              }}
                            >
                              <div style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 500 }}>
                                See all results for "{exploreSearchQuery}"
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Preset example search chips (only when not showing search results) */}
                    {!exploreSearchActive && (
                      <div className="explore-hero-search">
                        <p style={{ color: '#FFD700', fontSize: '1rem', margin: '0 0 0.75rem 0', fontWeight: 700, letterSpacing: '0.01em' }}>Try searching for something:</p>
                        <div className="explore-hero-examples">
                          {(categories || []).slice(0, 5).map(c => (
                            <button
                              key={`cat-${c.id}`}
                              className="explore-hero-example"
                              onClick={() => {
                                setViewingCategoryId(c.id);
                                setCategoryViewTab('most-liked');
                              }}
                            >
                              {c.name}
                            </button>
                          ))}
                          {(AI_TOOLS || []).slice(0, 4).map(t => (
                            <button
                              key={`tool-${t.id}`}
                              className="explore-hero-example"
                              onClick={() => navigateToTool(t.name)}
                            >
                              {t.name}
                            </button>
                          ))}
                        </div>
                        {exploreSuggestionUsers.length > 0 && (
                          <div className="explore-suggest-creators">
                            <div className="explore-suggest-label">Or look for creators to follow</div>
                            <div className="explore-suggest-creator-row">
                              {exploreSuggestionUsers.map(u => (
                                <button
                                  key={u.id}
                                  className="explore-suggest-creator"
                                  onClick={() => setViewingUserId(u.id)}
                                  title={`View @${u.username}`}
                                >
                                  <span className="explore-suggest-avatar">
                                    {u.avatar_url
                                      ? <img src={u.avatar_url} alt="" />
                                      : <span>{u.avatar_emoji || '👤'}</span>}
                                  </span>
                                  <div className="explore-suggest-creator-body">
                                    <div
                                      className="explore-suggest-creator-name"
                                      style={u.name_color ? { color: u.name_color } : undefined}
                                    >
                                      {u.display_name || u.username}
                                    </div>
                                    {(u.categories.length > 0 || u.tools.length > 0) && (
                                      <div className="explore-suggest-tags">
                                        {u.tools.slice(0, 1).map(t => (
                                          <span key={`t-${t}`} className="explore-suggest-tag tool">{t}</span>
                                        ))}
                                        {u.categories.slice(0, 2).map(c => (
                                          <span key={`c-${c}`} className="explore-suggest-tag">{c}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inline Search Results */}
                    {exploreSearchActive ? (
                      <div className="explore-search-results-container">
                        <button
                          onClick={clearExploreSearch}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-primary)',
                            cursor: 'pointer',
                            padding: '0.5rem 0',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                            marginBottom: '0.75rem'
                          }}
                        >
                          ← Back to Explore
                        </button>
                        {exploreSearchLoading ? (
                          <div className="loading-state"><div className="spinner"></div><p>Searching...</p></div>
                        ) : (
                          <>
                            {/* Posts, Builds, Questions results */}
                            {[
                              { key: 'posts', label: 'Posts', badge: 'Post' },
                              { key: 'builds', label: 'Builds', badge: 'Build' },
                              { key: 'questions', label: 'Questions', badge: 'Question' },
                            ].map(({ key, label, badge }) =>
                              exploreSearchResults[key] && exploreSearchResults[key].length > 0 && (
                              <div className="explore-search-results-section" key={key}>
                                <h3 className="explore-section-title" style={{ fontSize: '0.95rem' }}>{label} ({exploreSearchResults[key].length})</h3>
                                <div className="search-results-list">
                                  {exploreSearchResults[key].map(post => {
                                    const cat = categories.find(c => c.id === post.category_id);
                                    return (
                                      <div key={post.id} className="search-result-card" onClick={() => {
                                        clearExploreSearch();
                                        // Navigate immediately using search result data
                                        setSelectedFullPost({
                                          ...post,
                                          profiles: { id: post.user_id, username: post.username, display_name: post.display_name, avatar_emoji: post.avatar_emoji, avatar_url: post.avatar_url, name_color: post.name_color },
                                        });
                                        // Fetch full post data in background for complete details (with likes_count)
                                        (async () => {
                                          const { data } = await supabase
                                            .from('posts_with_stats')
                                            .select('*')
                                            .eq('id', post.id)
                                            .single();
                                          if (data) _setSelectedFullPost(data);
                                        })();
                                      }}>
                                        {post.images && post.images[0] && (
                                          <img className="search-result-image" src={post.images[0]} alt={post.title} loading="lazy" />
                                        )}
                                        <div className="search-result-content">
                                          <div className="search-result-title">
                                            {post.title}
                                            <span className="search-result-type-badge" style={{ marginLeft: '0.5rem', fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontWeight: 500, verticalAlign: 'middle' }}>{post.result_type || badge}</span>
                                          </div>
                                          {post.description && <div className="search-result-prompt">{post.description.slice(0, 150)}</div>}
                                          <div className="search-result-meta">
                                            <div className="search-result-user">
                                              <div className="search-result-user-avatar">
                                                {post.avatar_url ? <img src={post.avatar_url} alt="" /> : <span style={{ fontSize: '0.6rem' }}>{post.avatar_emoji || '👤'}</span>}
                                              </div>
                                              <span className="search-result-meta-item" style={post.name_color ? { color: post.name_color } : {}}>
                                                {post.display_name || post.username}
                                              </span>
                                            </div>
                                            {post.ai_tool && <span className="search-result-tool-badge">{post.ai_tool.split(',')[0].trim()}</span>}
                                            {cat && <span className="search-result-category-badge">{cat.icon} {cat.name}</span>}
                                            <span className="search-result-meta-item">
                                              <CommentIcon /> {post.comment_count || 0}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}

                            {/* Communities results */}
                            {exploreSearchResults.communities.length > 0 && (
                              <div className="explore-search-results-section">
                                <h3 className="explore-section-title" style={{ fontSize: '0.95rem' }}>Communities ({exploreSearchResults.communities.length})</h3>
                                <div className="explore-communities-grid">
                                  {exploreSearchResults.communities.map(c => (
                                    <div
                                      key={c.id}
                                      className="explore-community-card"
                                      onClick={() => {
                                        setActiveTab('communities');
                                        const fullCommunity = communities.find(fc => fc.id === c.id) || c;
                                        setActiveCommunity(fullCommunity);
                                        loadCommunityPosts(c.id, communityPostSort);
                                        window.scrollTo({ top: 0, behavior: 'instant' });
                                      }}
                                    >
                                      <div className="explore-community-icon">
                                        {c.icon_url ? (
                                          <img src={c.icon_url} alt="" />
                                        ) : c.icon ? (
                                          <span>{c.icon}</span>
                                        ) : (
                                          <CommunityIcon />
                                        )}
                                      </div>
                                      <div className="explore-community-info">
                                        <div className="explore-community-name">{c.name}</div>
                                        {c.description && <div className="explore-community-desc">{c.description}</div>}
                                        <div className="explore-community-meta">
                                          <span>{c.member_count || 0} members</span>
                                          <span>{c.post_count || 0} posts</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Users results */}
                            {exploreSearchResults.users.length > 0 && (
                              <div className="explore-search-results-section">
                                <h3 className="explore-section-title" style={{ fontSize: '0.95rem' }}>Users ({exploreSearchResults.users.length})</h3>
                                <div className="explore-people-grid">
                                  {exploreSearchResults.users.map(u => (
                                    <div
                                      key={u.id}
                                      className="explore-person-card"
                                      onClick={() => {
                                        setPreviousActiveTab('explore');
                                        setViewingUserId(u.id);
                                      }}
                                    >
                                      <div className="explore-person-avatar">
                                        {u.avatar_url ? (
                                          <img src={u.avatar_url} alt="" />
                                        ) : u.avatar_emoji ? (
                                          <span>{u.avatar_emoji}</span>
                                        ) : (
                                          <UserIcon />
                                        )}
                                      </div>
                                      <div className="explore-person-info">
                                        <div
                                          className="explore-person-name"
                                          style={u.name_color ? { color: u.name_color, display: 'flex', alignItems: 'center', gap: '0.3rem' } : { display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                        >
                                          {u.display_name || u.username}
                                          <BuilderRankBadge points={u.builder_points} ranks={builderRanks} />
                                          <UserBadge username={u.username} size={15} />
                                        </div>
                                        <div className="explore-person-username">@{u.username}</div>
                                        {u.bio && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.bio}</div>}
                                      </div>
                                      <button
                                        className="explore-follow-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviousActiveTab('explore');
                                          setViewingUserId(u.id);
                                        }}
                                      >
                                        View
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Tools results */}
                            {exploreSearchResults.tools && exploreSearchResults.tools.length > 0 && (
                              <div className="explore-search-results-section">
                                <h3 className="explore-section-title" style={{ fontSize: '0.95rem' }}>Tools ({exploreSearchResults.tools.length})</h3>
                                <div className="categories-follow-grid">
                                  {exploreSearchResults.tools.map(tool => (
                                    <div
                                      key={tool.id}
                                      className="category-bubble"
                                      style={{ cursor: 'pointer' }}
                                      onClick={() => navigateToTool(tool.name)}
                                    >
                                      <span className="category-bubble-name" style={{ flex: 1 }}>{tool.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Categories results */}
                            {exploreSearchResults.categories && exploreSearchResults.categories.length > 0 && (
                              <div className="explore-search-results-section">
                                <h3 className="explore-section-title" style={{ fontSize: '0.95rem' }}>Categories ({exploreSearchResults.categories.length})</h3>
                                <div className="categories-follow-grid">
                                  {exploreSearchResults.categories.map(cat => (
                                    <div
                                      key={cat.id}
                                      className="category-bubble"
                                      style={{ cursor: 'pointer' }}
                                      onClick={() => { setViewingCategoryId(cat.id); setCategoryViewTab('most-liked'); }}
                                    >
                                      {cat.icon && <span style={{ marginRight: '0.35rem' }}>{cat.icon}</span>}
                                      <span className="category-bubble-name" style={{ flex: 1 }}>{cat.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* No results */}
                            {exploreSearchResults.posts.length === 0 && exploreSearchResults.builds.length === 0 && exploreSearchResults.questions.length === 0 && exploreSearchResults.users.length === 0 && exploreSearchResults.communities.length === 0 && (!exploreSearchResults.tools || exploreSearchResults.tools.length === 0) && (!exploreSearchResults.categories || exploreSearchResults.categories.length === 0) && (
                              <div className="search-empty-state">
                                <h3>No results found for "{exploreSearchQuery}"</h3>
                                <p>Try different keywords!</p>
                                <button
                                  onClick={() => clearExploreSearch()}
                                  style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '0.5rem 1.25rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
                                >
                                  Back to Explore
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                    <>
                    {/* Curated for your field — the single unified audience grid.
                        Every EXPLORE_COLLECTIONS card points at a field_* row seeded
                        by 20260417000001_seed_field_categories.sql. Rendered
                        unconditionally: if that migration hasn't run, the cards
                        still appear — the category page falls back to the
                        collection's own title, and posts list comes back empty. */}
                    <div className="explore-section">
                      <div>
                        <h3 className="explore-section-title">Curated for your field</h3>
                        <p className="explore-section-subtitle">
                          New to AI? Start with how people in your world actually use it.
                        </p>
                      </div>
                      <div className="explore-collections-grid">
                        {EXPLORE_COLLECTIONS.map(col => (
                          <button
                            key={col.id}
                            className="explore-collection-card"
                            onClick={() => { setViewingCategoryId(col.id); setCategoryViewTab('most-liked'); }}
                            style={{ background: col.gradient }}
                          >
                            <span className="explore-collection-emoji">{col.emoji}</span>
                            <div className="explore-collection-title">{col.title}</div>
                            <div className="explore-collection-description">{col.description}</div>
                            <div className="explore-collection-cta">
                              Browse <span className="arrow">→</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Follow Categories - Preview */}
                    <div className="explore-section">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h3 className="explore-section-title">Follow Categories</h3>
                          <p className="explore-section-subtitle">Follow categories to see their top posts</p>
                        </div>
                        <button
                          onClick={() => setExploreSubView('allCategories')}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ffffff',
                            padding: '0.4rem 0',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            fontWeight: '600',
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          View More →
                        </button>
                      </div>
                      <div className="categories-follow-grid">
                        {categories.filter(cat => cat.name.toLowerCase() !== 'other').slice(0, 5).map(cat => {
                          const isFollowed = userFollowedCategories.includes(cat.id);
                          return (
                            <div
                              key={cat.id}
                              className={`category-bubble ${isFollowed ? 'followed' : ''}`}
                              style={{ cursor: 'pointer' }}
                            >
                              <span
                                className="category-bubble-name"
                                onClick={() => { setViewingCategoryId(cat.id); setCategoryViewTab('most-liked'); }}
                                style={{ cursor: 'pointer', flex: 1 }}
                              >
                                {cat.name}
                              </span>
                              <button
                                className="category-bubble-btn"
                                onClick={(e) => { e.stopPropagation(); handleFollowCategory(cat.id, isFollowed); }}
                                title={isFollowed ? 'Unfollow' : 'Follow'}
                              >
                                {isFollowed ? <CheckIcon /> : <PlusIcon />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Browse by Tool */}
                    <div className="explore-section">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h3 className="explore-section-title">Browse by Tool</h3>
                          <p className="explore-section-subtitle">Explore posts built with popular AI tools</p>
                        </div>
                        <button
                          onClick={() => setExploreSubView('allTools')}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ffffff',
                            padding: '0.4rem 0',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            fontWeight: '600',
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          View All →
                        </button>
                      </div>
                      <div className="categories-follow-grid">
                        {AI_TOOL_NAMES.slice(0, 8).map(tool => (
                            <div
                              key={tool}
                              className="category-bubble"
                              style={{ cursor: 'pointer' }}
                              onClick={() => navigateToTool(tool)}
                            >
                              <span className="category-bubble-name" style={{ flex: 1 }}>{tool}</span>
                            </div>
                        ))}
                      </div>
                    </div>

                    {/* Trending Posts Section */}
                    {(() => {
                      const now = new Date();
                      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                      const trendingPosts = posts
                        .filter(p => !p.is_question && p.post_type !== 'post' && p.images && p.images.length > 0 && new Date(p.created_at) >= sevenDaysAgo)
                        .sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0))
                        .slice(0, 6);
                      return trendingPosts.length > 0 ? (
                        <div id="explore-trending" className="explore-section explore-trending-section">
                          <h3 className="explore-section-title">Trending This Week</h3>
                          <p className="explore-section-subtitle">Most liked posts from the past 7 days</p>
                          <div className="explore-trending-grid">
                            {trendingPosts.map(post => (
                              <div key={post.id} className="explore-trending-card" onClick={() => {
                                setExploreScrollPosition(window.scrollY);
                                setHighlightedPostId(post.id);
                                setActiveTab('trending');
                              }}>
                                <img className="explore-trending-card-image" src={post.images[0]} alt={post.title} loading="lazy" />
                                <div className="explore-trending-card-body">
                                  <div className="explore-trending-card-title">{post.title}</div>
                                  <div className="explore-trending-card-meta">
                                    <span style={post.name_color ? { color: post.name_color } : {}}>{post.display_name || post.username}</span>
                                    <span>· {post.likes_count || 0} likes</span>
                                    {post.ai_tool && <span>· {post.ai_tool.split(',')[0].trim()}</span>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}

                    {/* Schools Leaderboard - Preview */}
                    {schoolLeaderboard.length > 0 && (
                      <div className="explore-section">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <h3 className="explore-section-title" style={{ fontFamily: "'Fraunces', serif" }}>Schools</h3>
                            <p className="explore-section-subtitle">Compete with your school</p>
                          </div>
                          <button
                            onClick={navigateToSchoolLeaderboard}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ffffff',
                              padding: '0.4rem 0',
                              cursor: 'pointer',
                              fontSize: '0.95rem',
                              fontWeight: '600',
                              letterSpacing: '0.02em',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Full Leaderboard →
                          </button>
                        </div>
                        <div className="schools-leaderboard-preview">
                          <div className="leaderboard-list">
                            {[...schoolLeaderboard].sort((a, b) => (b.member_count || 0) - (a.member_count || 0)).slice(0, 5).map((school, idx) => (
                              <div
                                key={school.id}
                                className="school-leaderboard-item"
                                onClick={() => navigateToSchool(school.slug)}
                                style={{ borderLeftColor: school.color || 'var(--border-color)', borderLeftWidth: '3px' }}
                              >
                                <div className={`school-leaderboard-rank ${idx < 3 ? `rank-${idx + 1}` : ''}`}>
                                  #{idx + 1}
                                </div>
                                <div className="school-leaderboard-info">
                                  <div className="school-leaderboard-name" style={{ color: school.color || 'var(--text-primary)' }}>{school.name}</div>
                                  <div className="school-leaderboard-meta">{school.member_count || 0} members · {school.post_count || 0} posts</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* School Search & Grid */}
                        <div style={{ marginTop: '1rem' }}>
                          <div className="explore-search" style={{ marginBottom: '0.75rem' }}>
                            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="11" cy="11" r="8"/>
                              <path d="m21 21-4.35-4.35"/>
                            </svg>
                            <input
                              type="text"
                              placeholder="Search schools..."
                              value={schoolSearchQuery}
                              onChange={(e) => setSchoolSearchQuery(e.target.value)}
                            />
                            {schoolSearchQuery && (
                              <button onClick={() => setSchoolSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            )}
                          </div>
                          {schoolSearchQuery && (
                            <div className="schools-grid">
                              {schoolLeaderboard
                                .filter(s => s.name.toLowerCase().includes(schoolSearchQuery.toLowerCase()) || (s.short_name && s.short_name.toLowerCase().includes(schoolSearchQuery.toLowerCase())))
                                .map(school => (
                                  <div
                                    key={school.id}
                                    className="school-card"
                                    onClick={() => navigateToSchool(school.slug)}
                                  >
                                    <div className="school-card-name" style={{ color: school.color || 'var(--text-primary)' }}>{school.name}</div>
                                    <div className="school-card-location">{school.location}</div>
                                    <div className="school-card-stats">
                                      <span className="school-card-stat"><strong>{school.member_count || 0}</strong> members</span>
                                      <span className="school-card-stat"><strong>{school.total_likes || 0}</strong> likes</span>
                                    </div>
                                  </div>
                                ))}
                              {schoolLeaderboard.filter(s => s.name.toLowerCase().includes(schoolSearchQuery.toLowerCase()) || (s.short_name && s.short_name.toLowerCase().includes(schoolSearchQuery.toLowerCase()))).length === 0 && (
                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>No schools matching "{schoolSearchQuery}"</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Workflows Section */}
                    {exploreWorkflows.length > 0 && (
                      <div className="explore-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div>
                            <h3 className="explore-section-title" style={{ marginBottom: '0.15rem' }}>Workflows</h3>
                            <p className="explore-section-subtitle">Multi-step prompt sequences to achieve specific outcomes</p>
                          </div>
                          <button
                            onClick={() => setExploreSubView('workflows')}
                            style={{
                              background: 'none', border: 'none', color: 'var(--accent-primary)',
                              cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', fontFamily: 'inherit',
                            }}
                          >
                            See all
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                          {exploreWorkflows.slice(0, 4).map(wf => (
                            <WorkflowCard
                              key={wf.id}
                              workflow={wf}
                              onLike={handleWorkflowLike}
                              onSave={handleWorkflowSave}
                              isLiked={userWorkflowLikes.includes(wf.id)}
                              isSaved={userWorkflowSaves.includes(wf.id)}
                              onUserClick={setViewingUserId}
                              onOpenWorkflow={(w) => setSelectedWorkflowId(w.id)}
                              onAuthRequired={() => setShowAuthModal(true)}
                              currentUser={user}
                              categories={categories}
                              getToolDisplayName={getToolDisplayName}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Staff Picks */}
                    {(() => {
                      const staffPicks = posts.filter(p => p.is_trending && p.images && p.images.length > 0).slice(0, 4);
                      return staffPicks.length > 0 ? (
                        <div className="explore-section explore-staff-picks">
                          <h3 className="explore-section-title">Staff Picks</h3>
                          <p className="explore-section-subtitle">Hand-picked builds by the Prompted team</p>
                          <div className="explore-trending-grid">
                            {staffPicks.map(post => (
                              <div key={post.id} className="explore-trending-card" onClick={() => {
                                (async () => {
                                  const { data } = await supabase
                                    .from('posts_with_stats')
                                    .select('*')
                                    .eq('id', post.id)
                                    .single();
                                  if (data) setSelectedFullPost(data);
                                })();
                              }}>
                                <img className="explore-trending-card-image" src={post.images[0]} alt={post.title} loading="lazy" />
                                <div className="explore-trending-card-body">
                                  <div className="explore-trending-card-title">{post.title}</div>
                                  <div className="explore-trending-card-meta">
                                    <span style={post.name_color ? { color: post.name_color } : {}}>{post.display_name || post.username}</span>
                                    <span>· {post.likes_count || 0} likes</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}

                    {/* People to Follow */}
                    {suggestedUsers.length > 0 && (
                      <div className="explore-section">
                        <h3 className="explore-section-title">People to Follow</h3>
                        <p className="explore-section-subtitle">Discover creators on Prompted</p>
                        <div className="explore-people-grid">
                          {suggestedUsers.map(suggestedUser => (
                            <div
                              key={suggestedUser.id}
                              className="explore-person-card"
                              onClick={() => {
                                setPreviousActiveTab('explore');
                                setViewingUserId(suggestedUser.id);
                              }}
                            >
                              <div className="explore-person-avatar">
                                {suggestedUser.avatar_url ? (
                                  <img src={suggestedUser.avatar_url} alt="" />
                                ) : suggestedUser.avatar_emoji ? (
                                  <span>{suggestedUser.avatar_emoji}</span>
                                ) : (
                                  <UserIcon />
                                )}
                              </div>
                              <div className="explore-person-info">
                                <div
                                  className="explore-person-name"
                                  style={suggestedUser.name_color ? { color: suggestedUser.name_color, display: 'flex', alignItems: 'center', gap: '0.3rem' } : { display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                >
                                  {suggestedUser.display_name || suggestedUser.username}
                                  <BuilderRankBadge points={suggestedUser.builder_points} ranks={builderRanks} />
                                  <UserBadge username={suggestedUser.username} size={15} />
                                </div>
                                <div className="explore-person-username">@{suggestedUser.username}</div>
                                {suggestedUser.interests && (
                                  <div className="explore-person-interests">{suggestedUser.interests}</div>
                                )}
                              </div>
                              <button
                                className="explore-follow-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviousActiveTab('explore');
                                  setViewingUserId(suggestedUser.id);
                                }}
                              >
                                View
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommended Posts - From categories user hasn't followed */}
                    {posts.length > 0 && (
                      <div className="explore-section">
                        <h3 className="explore-section-title">Recommended Posts</h3>
                        <p className="explore-section-subtitle">Popular posts you might like</p>
                        <div className="recommended-posts-list">
                          {posts
                            .filter(post => {
                              // Show posts from any category, prioritize ones user hasn't followed
                              if (!user) return true;
                              // Don't show user's own posts in recommendations
                              if (post.user_id === user.id) return false;
                              return !userFollowedCategories.includes(post.category_id);
                            })
                            .sort((a, b) => b.likes_count - a.likes_count)
                            .slice(0, 5)
                            .map(post => {
                              const cat = categories.find(c => c.id === post.category_id);
                              return (
                                <div
                                  key={post.id}
                                  className="recommended-post-item"
                                  onClick={() => {
                                    setExploreScrollPosition(window.scrollY);
                                    setHighlightedPostId(post.id);
                                    setActiveTab('recommended');
                                  }}
                                >
                                  <div className="recommended-post-content">
                                    <div className="recommended-post-title">{post.title}</div>
                                    <div className="recommended-post-meta">
                                      <span
                                        className="recommended-post-author"
                                        style={post.name_color ? { color: post.name_color, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' } : { display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                      >
                                        {post.display_name || post.username}
                                        <BuilderRankBadge points={post.builder_points} ranks={builderRanks} />
                                        <UserBadge username={post.username} size={15} />
                                      </span>
                                      <span className="recommended-post-stats">
                                        <HeartIcon /> {post.likes_count} · <CommentIcon /> {post.comments_count || 0}
                                      </span>
                                    </div>
                                    {cat && (
                                      <span
                                        className="recommended-post-category"
                                        style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff' }}
                                      >
                                        {cat.name}
                                      </span>
                                    )}
                                  </div>
                                  {post.images && post.images.length > 0 && (
                                    <img src={post.images[0]} alt="" className="recommended-post-image" />
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* Discover More Posts - Infinite Scroll */}
                    <div className="explore-section">
                      <h3 className="explore-section-title">Discover More</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        {feedViewMode === 'grid' ? (
                          <PostGrid posts={exploreRandomPosts} onOpenFullPost={setSelectedFullPost} />
                        ) : exploreRandomPosts.map(post => (
                          <PostCard
                            key={`explore-random-${post.id}`}
                            post={post}
                            onLike={handleLike}
                            userLikes={userLikes}
                            onCommentAdded={handleCommentAdded}
                            onUserClick={setViewingUserId}
                            onSave={handleSave}
                            userSaves={userSaves}
                            onAuthRequired={() => setShowAuthModal(true)}
                            categories={categories}
                            onDelete={handleDeletePost}
                            currentUser={user}
                            onOpenFullPost={setSelectedFullPost}
                            allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                            schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                            onSchoolClick={navigateToSchool}
                            onToolClick={navigateToTool}
                            userCommunities={userCommunities}
                            onPostCommunitiesChange={handlePostCommunitiesChange}
                            postCommunities={postCommunities}
                            userCommunityIds={userCommunityIds}
                          />
                        ))}
                      </div>
                      {exploreRandomPosts.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0' }}>
                          <button
                            onClick={() => loadExploreRandomPosts()}
                            disabled={loadingMoreExplorePosts}
                            style={{
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: 'var(--text-secondary)',
                              padding: '0.6rem 1.5rem',
                              borderRadius: '10px',
                              cursor: loadingMoreExplorePosts ? 'not-allowed' : 'pointer',
                              fontSize: '0.85rem',
                              opacity: loadingMoreExplorePosts ? 0.5 : 1
                            }}
                          >
                            {loadingMoreExplorePosts ? 'Loading...' : 'Load More Posts'}
                          </button>
                        </div>
                      )}
                    </div>
                    </>
                    )}
                      </>
                    )}
                  </div>
                )}

                {/* TAB: COMMUNITIES */}
                {activeTab === 'communities' && !viewingUserId && (
                  <CommunitiesView
                    user={user}
                    communities={communities}
                    userCommunities={userCommunities}
                    activeCommunity={activeCommunity}
                    communityPosts={communityPosts}
                    communityPostSort={communityPostSort}
                    setCommunityPostSort={setCommunityPostSort}
                    onJoinCommunity={joinCommunity}
                    onLeaveCommunity={leaveCommunity}
                    onSelectCommunity={selectCommunity}
                    onBackToCommunities={() => {
                      setActiveCommunity(null);
                      setCommunityRules([]);
                      if (window.location.pathname.startsWith('/community/')) {
                        window.history.pushState({}, '', '/');
                      }
                    }}
                    onCreateCommunity={() => setShowCreateCommunityModal(true)}
                    onPostToCommunity={() => {
                      setPreSelectedCommunityId(activeCommunity?.id || null);
                      setShowCreateModal(true);
                    }}
                    onLike={handleLike}
                    userLikes={userLikes}
                    onCommentAdded={handleCommentAdded}
                    onUserClick={setViewingUserId}
                    onSave={handleSave}
                    userSaves={userSaves}
                    onAuthRequired={() => setShowAuthModal(true)}
                    loading={communityLoading}
                    categories={categories}
                    onDeletePost={handleDeletePost}
                    onDeleteCommunity={handleDeleteCommunity}
                    onJoinWithCode={openInviteCodeModal}
                    onEditCommunity={() => setShowEditCommunityModal(true)}
                    communityRules={communityRules}
                    onRemovePostFromCommunity={removePostFromCommunity}
                    onOpenFullPost={setSelectedFullPost}
                    onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                    userFollows={userFollows}
                    onFollow={handleFollow}
                    allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                    schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                    onSchoolClick={navigateToSchool}
                    onToolClick={navigateToTool}
                    onPostCommunitiesChange={handlePostCommunitiesChange}
                    postCommunities={postCommunities}
                    userCommunityIds={userCommunityIds}
                    feedViewMode={feedViewMode}
                  />
                )}

                {/* TAB: TRENDING */}
                {activeTab === 'trending' && (
                  <div className="trending-tab">
                    <div className="trending-header">
                      <button
                        className="back-btn"
                        onClick={() => {
                          setHighlightedPostId(null);
                          setActiveTab('explore');
                          setTimeout(() => window.scrollTo(0, exploreScrollPosition), 50);
                        }}
                      >
                        ← Back to Explore
                      </button>
                      <h1 className="trending-page-title">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="23,6 13.5,15.5 8.5,10.5 1,18" />
                          <polyline points="17,6 23,6 23,12" />
                        </svg>
                        Trending This Week
                      </h1>
                      <p className="trending-page-subtitle">Most liked posts from the past 7 days</p>
                    </div>
                    <div className="trending-posts-list">
                      {(() => {
                        const now = new Date();
                        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        const trendingPosts = posts
                          .filter(post => {
                            const postDate = new Date(post.created_at);
                            const hasImages = post.images && post.images.length > 0;
                            return !post.is_question && post.post_type !== 'post' && hasImages && postDate >= sevenDaysAgo;
                          })
                          // Sort by most liked
                          .sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0))
                          .slice(0, 20);

                        let sortedPosts = trendingPosts;
                        if (highlightedPostId) {
                          const highlightedPost = trendingPosts.find(p => p.id === highlightedPostId);
                          if (highlightedPost) {
                            sortedPosts = [highlightedPost, ...trendingPosts.filter(p => p.id !== highlightedPostId)];
                          }
                        }

                        if (feedViewMode === 'grid') {
                          return <PostGrid posts={sortedPosts} onOpenFullPost={setSelectedFullPost} />;
                        }
                        return sortedPosts.map((post, idx) => (
                          <PostCard
                            key={post.id}
                            post={post}
                            categories={categories}
                            user={user}
                            userLikes={userLikes}
                            userSaves={userSaves}
                            onLike={handleLike}
                            onSave={handleSave}
                            onCommentAdded={handleCommentAdded}
                            onUserClick={setViewingUserId}
                            onAuthRequired={() => setShowAuthModal(true)}
                            onDeletePost={handleDeletePost}
                            isOwner={user && user.id === post.user_id}
                            trendingRank={idx + 1}
                            onOpenFullPost={setSelectedFullPost}
                            onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                            onCategoryClick={(categoryId) => {
                              setViewingCategoryId(categoryId);
                              setCategoryViewTab('most-liked');
                              setActiveTab('explore');
                            }}
                            postCommunities={postCommunities}
                            userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                            onCommunityClick={(community) => {
                              setActiveTab('communities');
                              selectCommunity(community);
                            }}

                            allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                            schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                            onSchoolClick={navigateToSchool}
                            onToolClick={navigateToTool}
                          />
                        ));
                      })()}
                      {posts.filter(post => {
                        const postDate = new Date(post.created_at);
                        const now = new Date();
                        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        const hasImages = post.images && post.images.length > 0;
                        return !post.is_question && post.post_type !== 'post' && hasImages && postDate >= sevenDaysAgo;
                      }).length === 0 && (
                        <div className="empty-state">
                          <p>No trending posts with images in the last 7 days.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: RECOMMENDED */}
                {activeTab === 'recommended' && (
                  <div className="trending-tab">
                    <div className="trending-header">
                      <button
                        className="back-btn"
                        onClick={() => {
                          setHighlightedPostId(null);
                          setActiveTab('explore');
                          setTimeout(() => window.scrollTo(0, exploreScrollPosition), 50);
                        }}
                      >
                        ← Back to Explore
                      </button>
                      <h1 className="trending-page-title">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                        Recommended Posts
                      </h1>
                      <p className="trending-page-subtitle">Popular posts you might like</p>
                    </div>
                    <div className="trending-posts-list">
                      {(() => {
                        const recommendedPosts = posts
                          .filter(post => {
                            if (!user) return true;
                            // Don't show user's own posts in recommendations
                            if (post.user_id === user.id) return false;
                            return !userFollowedCategories.includes(post.category_id);
                          })
                          .sort((a, b) => b.likes_count - a.likes_count);

                        // If there's a highlighted post, move it to the top
                        let sortedPosts = recommendedPosts;
                        if (highlightedPostId) {
                          const highlightedPost = recommendedPosts.find(p => p.id === highlightedPostId);
                          if (highlightedPost) {
                            sortedPosts = [highlightedPost, ...recommendedPosts.filter(p => p.id !== highlightedPostId)];
                          }
                        }

                        if (feedViewMode === 'grid') {
                          return <PostGrid posts={sortedPosts} onOpenFullPost={setSelectedFullPost} />;
                        }
                        return sortedPosts.map((post, idx) => (
                          <PostCard
                            key={post.id}
                            post={post}
                            categories={categories}
                            user={user}
                            userLikes={userLikes}
                            userSaves={userSaves}
                            onLike={handleLike}
                            onSave={handleSave}
                            onCommentAdded={handleCommentAdded}
                            onUserClick={setViewingUserId}
                            onAuthRequired={() => setShowAuthModal(true)}
                            onDeletePost={handleDeletePost}
                            isOwner={user && user.id === post.user_id}
                            onOpenFullPost={setSelectedFullPost}
                            onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                            onCategoryClick={(categoryId) => {
                              setViewingCategoryId(categoryId);
                              setCategoryViewTab('most-liked');
                              setActiveTab('explore');
                            }}
                            postCommunities={postCommunities}
                            userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                            onCommunityClick={(community) => {
                              setActiveTab('communities');
                              selectCommunity(community);
                            }}

                            allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                            schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                            onSchoolClick={navigateToSchool}
                            onToolClick={navigateToTool}
                          />
                        ));
                      })()}
                      {posts.filter(post => {
                        if (!user) return true;
                        if (post.user_id === user.id) return false;
                        return !userFollowedCategories.includes(post.category_id);
                      }).length === 0 && (
                        <div className="empty-state">
                          <p>No recommended posts available.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: MESSAGES — DM + group chats */}
                {activeTab === 'messages' && !viewingUserId && (
                  <div className="messages-tab">
                    <MessagesView
                      user={user}
                      profile={profile}
                      onUserClick={setViewingUserId}
                      onOpenSharedPost={(post) => setSelectedFullPost(post)}
                      onOpenSharedProfile={(p) => { setViewingUserId(p.id); setActiveTab('myprofile'); }}
                      onOpenSharedCommunity={(c) => { selectCommunity(c); setActiveTab('communities'); }}
                      initialConversationId={messagesInitialConv}
                      onRead={refreshUnreadDm}
                    />
                  </div>
                )}

                {/* TAB: QUESTIONS */}
                {activeTab === 'questions' && !viewingUserId && (
                  <div className="questions-tab">
                    <div className="questions-header">
                      <p className="questions-subtitle">Have a question? Get help with something you're working on or that you're curious about!</p>
                      <button
                        className="btn btn-primary ask-question-btn"
                        onClick={() => {
                          if (user) {
                            setDefaultIsQuestion(true);
                            setShowCreateModal(true);
                          } else {
                            setShowAuthModal(true);
                          }
                        }}
                      >
                        <PlusIcon /> Ask Question
                      </button>
                    </div>

                    {/* Search Bar with Autocomplete */}
                    <div className="questions-search-container">
                      <div className="questions-search">
                        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8"/>
                          <path d="m21 21-4.35-4.35"/>
                        </svg>
                        <input
                          type="text"
                          placeholder="Search questions..."
                          value={questionsSearchQuery}
                          onChange={(e) => {
                            setQuestionsSearchQuery(e.target.value);
                            if (!e.target.value.trim()) {
                              setQuestionsShowRelated(false);
                            }
                          }}
                          onFocus={() => setQuestionsSearchFocused(true)}
                          onBlur={() => setTimeout(() => setQuestionsSearchFocused(false), 200)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && questionsSearchQuery.trim()) {
                              setQuestionsShowRelated(true);
                              setQuestionsSearchFocused(false);
                            }
                          }}
                        />
                        {questionsSearchQuery && (
                          <button
                            className="search-clear-btn"
                            onClick={() => {
                              setQuestionsSearchQuery('');
                              setQuestionsShowRelated(false);
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      {/* Autocomplete Dropdown */}
                      {questionsSearchFocused && questionsSearchQuery.trim() && (
                        (() => {
                          const questionPosts = posts.filter(p => p.is_question);
                          const matchingQuestions = questionPosts.filter(q =>
                            q.title.toLowerCase().includes(questionsSearchQuery.toLowerCase()) ||
                            (q.description && q.description.toLowerCase().includes(questionsSearchQuery.toLowerCase()))
                          ).slice(0, 5);

                          return matchingQuestions.length > 0 ? (
                            <div className="questions-autocomplete-dropdown">
                              <div className="autocomplete-section-title">Similar Questions</div>
                              {matchingQuestions.map(q => (
                                <div
                                  key={q.id}
                                  className="question-autocomplete-item"
                                  onClick={() => {
                                    setQuestionsSearchQuery('');
                                    // Scroll to the question
                                    const element = document.getElementById(`post-${q.id}`);
                                    if (element) {
                                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      element.classList.add('highlight-post');
                                      setTimeout(() => element.classList.remove('highlight-post'), 2000);
                                    }
                                  }}
                                >
                                  <QuestionIcon />
                                  <div className="question-autocomplete-content">
                                    <div className="question-autocomplete-title">{q.title}</div>
                                    <div className="question-autocomplete-meta">
                                      <span>@{q.username}</span>
                                      <span>{q.comments_count} {q.comments_count === 1 ? 'answer' : 'answers'}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null;
                        })()
                      )}
                    </div>

                    {/* Sort Tabs */}
                    <div className="questions-sort-tabs">
                      <button
                        className={`questions-sort-tab ${questionsSortBy === 'recent' ? 'active' : ''}`}
                        onClick={() => setQuestionsSortBy('recent')}
                      >
                        <ClockIcon /> Recent
                      </button>
                      <button
                        className={`questions-sort-tab ${questionsSortBy === 'following' ? 'active' : ''}`}
                        onClick={() => setQuestionsSortBy('following')}
                      >
                        <UsersIcon /> Following
                      </button>
                      <button
                        className={`questions-sort-tab ${questionsSortBy === 'unanswered' ? 'active' : ''}`}
                        onClick={() => setQuestionsSortBy('unanswered')}
                      >
                        Unanswered
                      </button>
                    </div>

                    {/* Questions List */}
                    <div className="questions-list">
                      {(() => {
                        // Helper function to get search words
                        const getSearchWords = (query) => {
                          return query.toLowerCase()
                            .split(/\s+/)
                            .filter(word => word.length > 2) // Only words with more than 2 chars
                            .filter(word => !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'with', 'they', 'this', 'that', 'from', 'what', 'how', 'why', 'when', 'who', 'which'].includes(word));
                        };

                        // Helper function to calculate relevance score
                        const getRelevanceScore = (post, searchWords) => {
                          const titleLower = post.title.toLowerCase();
                          const descLower = (post.description || '').toLowerCase();
                          const promptLower = (post.prompt || '').toLowerCase();
                          let score = 0;

                          searchWords.forEach(word => {
                            if (titleLower.includes(word)) score += 3;
                            if (descLower.includes(word)) score += 2;
                            if (promptLower.includes(word)) score += 1;
                          });

                          return score;
                        };

                        // If showing related posts after Enter search
                        if (questionsShowRelated && questionsSearchQuery.trim()) {
                          const searchWords = getSearchWords(questionsSearchQuery);

                          // Find all related posts (questions and regular posts)
                          const relatedPosts = posts
                            .map(post => ({
                              ...post,
                              relevanceScore: getRelevanceScore(post, searchWords)
                            }))
                            .filter(post => post.relevanceScore > 0)
                            .sort((a, b) => b.relevanceScore - a.relevanceScore)
                            .slice(0, 20);

                          // Separate questions and regular posts
                          const relatedQuestions = relatedPosts.filter(p => p.is_question);
                          const relatedRegularPosts = relatedPosts.filter(p => !p.is_question);

                          return (
                            <>
                              {relatedQuestions.length > 0 && (
                                <>
                                  <div className="related-section-header">
                                    <QuestionIcon /> Related Questions
                                  </div>
                                  {relatedQuestions.map(question => (
                                    <PostCard
                                      key={question.id}
                                      post={question}
                                      onLike={handleLike}
                                      userLikes={userLikes}
                                      onCommentAdded={handleCommentAdded}
                                      onUserClick={setViewingUserId}
                                      onSave={handleSave}
                                      userSaves={userSaves}
                                      onAuthRequired={() => setShowAuthModal(true)}
                                      categories={categories}
                                      onDelete={handleDeletePost}
                                      onOpenFullPost={setSelectedFullPost}
                                      onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                                      onCategoryClick={(categoryId) => {
                                        setViewingCategoryId(categoryId);
                                        setCategoryViewTab('most-liked');
                                        setActiveTab('explore');
                                      }}
                                      postCommunities={postCommunities}
                                      userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                                      onCommunityClick={(community) => {
                                        setActiveTab('communities');
                                        selectCommunity(community);
                                      }}

                                      allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                                      schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                                      onSchoolClick={navigateToSchool}
                                      onToolClick={navigateToTool}
                                    />
                                  ))}
                                </>
                              )}
                              {relatedRegularPosts.length > 0 && (
                                <>
                                  <div className="related-section-header">
                                    <SearchIcon /> Related Posts That May Help
                                  </div>
                                  {relatedRegularPosts.map(post => (
                                    <PostCard
                                      key={post.id}
                                      post={post}
                                      onLike={handleLike}
                                      userLikes={userLikes}
                                      onCommentAdded={handleCommentAdded}
                                      onUserClick={setViewingUserId}
                                      onSave={handleSave}
                                      userSaves={userSaves}
                                      onAuthRequired={() => setShowAuthModal(true)}
                                      categories={categories}
                                      onDelete={handleDeletePost}
                                      onOpenFullPost={setSelectedFullPost}
                                      onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                                      onCategoryClick={(categoryId) => {
                                        setViewingCategoryId(categoryId);
                                        setCategoryViewTab('most-liked');
                                        setActiveTab('explore');
                                      }}
                                      postCommunities={postCommunities}
                                      userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                                      onCommunityClick={(community) => {
                                        setActiveTab('communities');
                                        selectCommunity(community);
                                      }}

                                      allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                                      schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                                      onSchoolClick={navigateToSchool}
                                      onToolClick={navigateToTool}
                                    />
                                  ))}
                                </>
                              )}
                              {relatedQuestions.length === 0 && relatedRegularPosts.length === 0 && (
                                <div className="questions-empty">
                                  <div className="questions-empty-icon"><SearchIcon /></div>
                                  <h3 className="questions-empty-title">No related posts found</h3>
                                  <p className="questions-empty-text">
                                    Try different search terms or ask a new question!
                                  </p>
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                      if (user) {
                                        setDefaultIsQuestion(true);
                                        setShowCreateModal(true);
                                      } else {
                                        setShowAuthModal(true);
                                      }
                                    }}
                                  >
                                    <QuestionIcon /> Ask This Question
                                  </button>
                                </div>
                              )}
                            </>
                          );
                        }

                        // Filter questions from posts
                        let questionPosts = posts.filter(p => p.is_question);

                        // Apply search filter
                        if (questionsSearchQuery.trim()) {
                          questionPosts = questionPosts.filter(q =>
                            q.title.toLowerCase().includes(questionsSearchQuery.toLowerCase()) ||
                            (q.description && q.description.toLowerCase().includes(questionsSearchQuery.toLowerCase()))
                          );
                        }

                        // Apply sort/filter
                        switch (questionsSortBy) {
                          case 'following':
                            // Filter to questions from people the user follows
                            questionPosts = [...questionPosts]
                              .filter(q => userFollows.includes(q.user_id))
                              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                            break;
                          case 'unanswered':
                            questionPosts = questionPosts.filter(q => (q.comments_count || 0) === 0);
                            break;
                          case 'recent':
                          default:
                            questionPosts = [...questionPosts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                        }

                        return questionPosts.length > 0 ? (
                          feedViewMode === 'grid' ? (
                            <PostGrid posts={questionPosts} onOpenFullPost={setSelectedFullPost} />
                          ) : (
                          questionPosts.map(question => (
                            <PostCard
                              key={question.id}
                              post={question}
                              onLike={handleLike}
                              userLikes={userLikes}
                              onCommentAdded={handleCommentAdded}
                              onUserClick={setViewingUserId}
                              onSave={handleSave}
                              userSaves={userSaves}
                              onAuthRequired={() => setShowAuthModal(true)}
                              categories={categories}
                              onDelete={handleDeletePost}
                              onOpenFullPost={setSelectedFullPost}
                              onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                              onCategoryClick={(categoryId) => {
                                setViewingCategoryId(categoryId);
                                setCategoryViewTab('most-liked');
                                setActiveTab('explore');
                              }}
                              postCommunities={postCommunities}
                              userCommunityIds={userCommunityIds} userCommunities={userCommunities} onPostCommunitiesChange={handlePostCommunitiesChange}
                              onCommunityClick={(community) => {
                                setActiveTab('communities');
                                selectCommunity(community);
                              }}

                              allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                              schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                              onSchoolClick={navigateToSchool}
                              onToolClick={navigateToTool}
                            />
                          ))
                          )
                        ) : (
                          <div className="questions-empty">
                            <div className="questions-empty-icon"><QuestionIcon /></div>
                            <h3 className="questions-empty-title">
                              {questionsSearchQuery
                                ? 'No questions found'
                                : questionsSortBy === 'unanswered'
                                  ? 'No unanswered questions'
                                  : questionsSortBy === 'following'
                                    ? 'No questions from people you follow'
                                    : 'No questions yet'}
                            </h3>
                            <p className="questions-empty-text">
                              {questionsSearchQuery
                                ? 'Try a different search term or ask a new question.'
                                : questionsSortBy === 'following'
                                  ? 'Follow more people to see their questions here!'
                                  : 'Be the first to ask a question!'}
                            </p>
                            {!questionsSearchQuery && (
                              <button
                                className="btn btn-primary"
                                onClick={() => {
                                  if (user) {
                                    setDefaultIsQuestion(true);
                                    setShowCreateModal(true);
                                  } else {
                                    setShowAuthModal(true);
                                  }
                                }}
                              >
                                <QuestionIcon /> Ask a Question
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* TAB 3: SAVED POSTS */}
                {activeTab === 'saved' && (
                  <SavedPostsView
                    user={user}
                    posts={posts}
                    onLike={handleLike}
                    userLikes={userLikes}
                    onCommentAdded={handleCommentAdded}
                    onUserClick={setViewingUserId}
                    onSave={handleSave}
                    userSaves={userSaves}
                    onAuthRequired={() => setShowAuthModal(true)}
                    categories={categories}
                    onDelete={handleDeletePost}
                    onOpenFullPost={setSelectedFullPost}
                    onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                    allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                    schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                    onSchoolClick={navigateToSchool}
                    onToolClick={navigateToTool}
                    userCommunities={userCommunities}
                    onPostCommunitiesChange={handlePostCommunitiesChange}
                    postCommunities={postCommunities}
                    userCommunityIds={userCommunityIds}
                    feedViewMode={feedViewMode}
                  />
                )}

                {/* TAB: BUILDER RANKS (with Leaderboard below) */}
                {activeTab === 'ranks' && !viewingUserId && (
                  <>
                    <BuilderRanksPage
                      currentUser={profile}
                      onShowAchievements={() => navigateToAchievements(null)}
                    />
                    <div className="builder-leaderboard-page" style={{ marginTop: '0', paddingTop: '0' }}>
                      <div className="builder-leaderboard-header">
                        <LeaderboardIcon />
                        <h2>Builder Leaderboard</h2>
                      </div>
                      <div style={{ textAlign: 'center', padding: '0.5rem 1rem 1rem', color: '#FFD700', fontSize: '0.9rem', lineHeight: '1.4' }}>
                        Who will be the first to reach Legend builder rank? Whoever achieves this first will get a special prize!
                      </div>
                      {builderLeaderboardLoading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading leaderboard...</div>
                      ) : builderLeaderboard.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No builders ranked yet. Start posting builds to earn points!</div>
                      ) : (
                        <div className="builder-leaderboard-list">
                          {builderLeaderboard.map((entry, idx) => {
                            const rank = getRankForPoints(entry.points || entry.builder_points || 0, builderRanks);
                            return (
                              <div
                                key={entry.user_id || entry.id || idx}
                                className={`builder-leaderboard-row ${idx === 0 ? 'top-1' : idx === 1 ? 'top-2' : idx === 2 ? 'top-3' : ''}`}
                                onClick={() => {
                                  setPreviousActiveTab('ranks');
                                  setViewingUserId(entry.user_id || entry.id);
                                }}
                              >
                                <div className="builder-leaderboard-position">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                </div>
                                <div className="builder-leaderboard-avatar">
                                  {entry.avatar_url ? (
                                    <img src={entry.avatar_url} alt="" />
                                  ) : entry.avatar_emoji ? (
                                    <span>{entry.avatar_emoji}</span>
                                  ) : (
                                    <UserIcon />
                                  )}
                                </div>
                                <div className="builder-leaderboard-info">
                                  <div className="builder-leaderboard-name" style={entry.name_color ? { color: entry.name_color } : {}}>
                                    {entry.display_name || entry.username}
                                    <UserBadge username={entry.username} size={15} />
                                  </div>
                                  <div className="builder-leaderboard-username">@{entry.username}</div>
                                </div>
                                <div className="builder-leaderboard-points" title={entry.builder_points_display != null ? `Real score: ${(entry.points || entry.builder_points || 0).toLocaleString()} pts` : undefined}>
                                  {(entry.builder_points_display ?? entry.points ?? entry.builder_points ?? 0).toLocaleString()} pts
                                  <BuilderRankBadge points={entry.points || entry.builder_points || 0} ranks={builderRanks} size="leaderboard" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* TAB: ARENA — social AI benchmarking */}
                {activeTab === 'arena' && !viewingUserId && (
                  <ArenaPage
                    currentUser={user}
                    onToolClick={(toolName) => navigateToTool(toolName)}
                    onRequireAuth={() => setShowAuthModal(true)}
                    initialFocusedTool={arenaInitialFocusedTool}
                    initialJumpCategoryId={arenaInitialJumpCategoryId}
                    onInitialConsumed={() => {
                      setArenaInitialFocusedTool(null);
                      setArenaInitialJumpCategoryId(null);
                    }}
                  />
                )}

                {/* TAB: GAMES */}
                {activeTab === 'games' && !viewingUserId && (
                  <GamesPage
                    currentUser={user}
                    onRequireAuth={() => setShowAuthModal(true)}
                    onUserClick={setViewingUserId}
                  />
                )}

                {/* TAB: LEARN — public; open to everyone (incl. guests) */}
                {activeTab === 'learn' && !viewingUserId && (
                  <LearningPage
                    currentUser={user}
                    profile={profile}
                    onRequireAuth={() => setShowAuthModal(true)}
                    addToast={addToast}
                  />
                )}

                {/* TAB: VIDEOS */}
                {activeTab === 'videos' && !viewingUserId && (
                  <VideosPage
                    currentUser={user}
                    categories={categories}
                    onOpenMenu={() => setSidebarOpen(true)}
                    onBack={() => { setActiveTab('foryou'); window.history.replaceState({}, '', '/'); }}
                    onOpenExploreCategory={(cat) => {
                      setActiveTab('explore');
                      window.history.replaceState({}, '', `/explore?category=${encodeURIComponent(cat.slug || cat.name || cat.id)}`);
                    }}
                  />
                )}

                {/* TAB: MEMES (Lounge) — hidden for everyone right now (see canSeeLounge). */}
                {activeTab === 'memes' && !viewingUserId && canSeeLounge(profile) && (
                  <MemesPage
                    currentUser={user}
                    profile={profile}
                    isAdmin={isPlatformAdmin}
                    onUserClick={(uid) => { if (uid) setViewingUserId(uid); }}
                    onOpenMenu={() => setSidebarOpen(true)}
                    onBack={() => { setActiveTab('foryou'); window.history.replaceState({}, '', '/'); }}
                    onRequireAuth={() => setShowAuthModal(true)}
                    addToast={addToast}
                  />
                )}

                {/* TAB: SPOTLIGHT */}
                {activeTab === 'spotlight' && !viewingUserId && (
                  <SpotlightPage
                    onBack={() => handleNavClick('foryou')}
                    onUserClick={setViewingUserId}
                    profile={profile}
                  />
                )}

                {/* TAB: PRO — preview-only while we work on it (see PRO_PREVIEW_USERS) */}
                {activeTab === 'pro' && !viewingUserId && canSeePro(profile) && (
                  <ProPage
                    currentUser={user}
                    profile={profile}
                    isPlatformAdmin={isPlatformAdmin}
                    onBack={() => {
                      // Full home reset (mirrors the logo click) — clears any
                      // profile/feed state and restores the / URL.
                      setActiveTab('foryou');
                      setFeedSubTab('foryou');
                      setViewingUserId(null);
                      window.history.replaceState({}, '', '/');
                      window.scrollTo({ top: 0 });
                    }}
                    onRequireAuth={() => setShowAuthModal(true)}
                    addToast={addToast}
                    onOpenCommunity={(c) => { selectCommunity(c); setActiveTab('communities'); }}
                  />
                )}

                {/* TAB: ZOE (Zoetrope) — livestreaming. Public to watch; hosting Pro-gated. */}
                {activeTab === 'live' && !viewingUserId && (
                  <ZoePage
                    currentUser={user}
                    profile={profile}
                    initialStreamId={zoeOpenStreamId}
                    onConsumeInitial={() => setZoeOpenStreamId(null)}
                    onRequireAuth={() => setShowAuthModal(true)}
                    addToast={addToast}
                    onUserClick={setViewingUserId}
                  />
                )}

                {/* TAB: REFERRALS — invite friends, earn Pro (admin-only preview for now) */}
                {activeTab === 'referrals' && !viewingUserId && isPlatformAdmin && (
                  <ReferralsPage
                    currentUser={user}
                    profile={profile}
                    onRequireAuth={() => setShowAuthModal(true)}
                    addToast={addToast}
                    onBack={() => {
                      setActiveTab('foryou');
                      setFeedSubTab('foryou');
                      setViewingUserId(null);
                      window.history.replaceState({}, '', '/');
                      window.scrollTo({ top: 0 });
                    }}
                  />
                )}

                {/* TAB: ACHIEVEMENTS */}
                {activeTab === 'achievements' && !viewingUserId && (
                  <AchievementsPageWrapper
                    currentUser={user}
                    viewingUserId={viewingAchievementsUserId}
                    initialHighlightId={achievementHighlightId}
                    onAuthRequired={() => setShowAuthModal(true)}
                    onBack={() => {
                      setActiveTab('ranks');
                      setViewingAchievementsUserId(null);
                      setAchievementHighlightId(null);
                      window.history.pushState({}, '', '/ranks');
                      window.scrollTo({ top: 0 });
                    }}
                  />
                )}

                {/* TAB: WEEKLY SOCIAL MEDIA REPORT — marketing lead fills it out
                    (admin / SocialMarketer role / PIN-gated inside the page),
                    submits, and it DMs the team a downloadable report. The page
                    handles its own access gate; ?id= opens a saved report. */}
                {activeTab === 'weeklyreport' && !viewingUserId && (
                  <WeeklyReportPage
                    currentUser={user}
                    profile={profile}
                    isPlatformAdmin={isPlatformAdmin}
                    reportId={weeklyReportId}
                    onRequireAuth={() => setShowAuthModal(true)}
                    addToast={addToast}
                    onOpenMessages={() => { setWeeklyReportId(null); handleNavClick('messages'); }}
                    onBack={() => {
                      setWeeklyReportId(null);
                      setActiveTab('foryou');
                      setFeedSubTab('foryou');
                      window.history.replaceState({}, '', '/');
                      window.scrollTo({ top: 0 });
                    }}
                  />
                )}

                {/* TAB 4: FOLLOWING */}
                {activeTab === 'following' && (
                  <div className="following-tab">
                    {!user ? (
                      <div className="login-prompt">
                        <div className="login-prompt-icon"><UsersIcon /></div>
                        <div className="login-prompt-title">Login to See Who You Follow</div>
                        <p className="login-prompt-text">Follow creators to see their posts here.</p>
                        <button className="btn btn-primary" onClick={() => setShowAuthModal(true)}>
                          Login / Sign Up
                        </button>
                      </div>
                    ) : userFollows.length === 0 ? (
                      <div className="following-tab-empty">
                        <div className="following-tab-empty-icon"><UsersIcon /></div>
                        <div className="following-tab-empty-title">You're not following anyone yet</div>
                        <p className="following-tab-empty-text">
                          Explore and find creators to follow! Their posts will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="feed-container">
                        {(() => {
                          const followedPosts = posts
                            .filter(post => userFollows.includes(post.user_id))
                            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                          if (feedViewMode === 'grid') {
                            return <PostGrid posts={followedPosts} onOpenFullPost={setSelectedFullPost} />;
                          }
                          return followedPosts.map(post => (
                            <PostCard
                              key={post.id}
                              post={post}
                              onLike={handleLike}
                              userLikes={userLikes}
                              onCommentAdded={handleCommentAdded}
                              onUserClick={setViewingUserId}
                              onSave={handleSave}
                              userSaves={userSaves}
                              onAuthRequired={() => setShowAuthModal(true)}
                              categories={categories}
                              onDelete={handleDeletePost}
                              onOpenFullPost={setSelectedFullPost}
                              onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                              onCategoryClick={(categoryId) => {
                                setViewingCategoryId(categoryId);
                                setCategoryViewTab('most-liked');
                                setActiveTab('explore');
                              }}
                              allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                              schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                              onSchoolClick={navigateToSchool}
                              onToolClick={navigateToTool}
                            />
                          ));
                        })()}
                        {posts.filter(post => userFollows.includes(post.user_id)).length === 0 && (
                          <div className="empty-state">
                            <div className="empty-icon"><InboxIcon /></div>
                            <p className="empty-text">No posts yet from people you follow</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: MY PROFILE */}
                {activeTab === 'myprofile' && !viewingUserId && user && profile && (
                  <div className="user-profile-view my-profile-view">
                    {/* Header Banner - 3:1 aspect ratio (Twitter standard) */}
                    <div
                      className="profile-header-banner my-profile-banner"
                      onClick={() => {
                        if (profile.header_url) {
                          setMyProfileBannerLightbox({
                            imageUrl: profile.header_url,
                            username: profile.username
                          });
                        }
                      }}
                      style={{
                        width: '100%',
                        height: 0,
                        paddingBottom: '33.33%',
                        background: profile.header_url && !isVideoBannerUrl(profile.header_url)
                          ? `url(${profile.header_url}) center/cover no-repeat`
                          : profile.header_url
                            ? 'var(--bg-tertiary)'
                            : 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
                        borderRadius: 0,
                        position: 'relative',
                        overflow: 'hidden',
                        cursor: profile.header_url ? 'pointer' : 'default'
                      }}
                    >
                      {/* Animated banner (Pro / contest winners): looping muted video */}
                      {isVideoBannerUrl(profile.header_url) && (
                        <video
                          src={profile.header_url}
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="metadata"
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                    </div>

                    <div className="profile-header" style={{ borderRadius: 0, borderTop: 'none' }}>
                      <div className="profile-header-top">
                        <div
                          className="profile-avatar-large"
                          onClick={() => {
                            if (profile.avatar_url || profile.avatar_emoji) {
                              setMyProfileAvatarLightbox({
                                imageUrl: profile.avatar_url,
                                emoji: profile.avatar_emoji,
                                username: profile.username,
                                displayName: profile.display_name
                              });
                            }
                          }}
                        >
                          {profile.avatar_url ? (
                            <img src={profile.avatar_url} alt="" className="profile-avatar-img" />
                          ) : profile.avatar_emoji ? (
                            <span className="profile-avatar-emoji">{profile.avatar_emoji}</span>
                          ) : (
                            <UserIcon />
                          )}
                        </div>
                      </div>
                      <div className="profile-info">
                        <div className="profile-header-row">
                          <div className="profile-display-name" style={profile.name_color ? { color: profile.name_color } : {}}>
                            {profile.display_name || profile.username}
                            <BuilderRankBadge points={profile.builder_points} ranks={builderRanks} size="medium" onClick={() => { setActiveTab('ranks'); window.history.pushState({}, '', '/ranks'); }} />
                            <UserBadge username={profile.username} size={20} />
                            {userSchool && (
                              <span
                                className="school-badge"
                                style={{ background: userSchool.color, fontSize: '0.8rem', padding: '0.2rem 0.55rem' }}
                                onClick={() => navigateToSchool(userSchool.school_slug)}
                              >
                                {userSchool.short_name || userSchool.school_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="profile-username">@{profile.username}</div>
                        {profile.bio && <div className="profile-bio">{profile.bio}</div>}
                        <div className="profile-stats">
                          <div
                            className="profile-stat profile-stat-clickable"
                            onClick={() => {
                              setMyProfileShowFollowModal('followers');
                              loadMyProfileFollowers(user.id);
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <span className="profile-stat-value">{myProfileFollowerCount}</span>
                            <span className="profile-stat-label"> Follower{myProfileFollowerCount !== 1 ? 's' : ''}</span>
                          </div>
                          <div
                            className="profile-stat profile-stat-clickable"
                            onClick={() => {
                              setMyProfileShowFollowModal('following');
                              loadMyProfileFollowing(user.id);
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <span className="profile-stat-value">{myProfileFollowingCount}</span>
                            <span className="profile-stat-label"> Following</span>
                          </div>
                          <div className="profile-stat">
                            <span className="profile-stat-value">{myProfilePosts.length}</span>
                            <span className="profile-stat-label"> Post{myProfilePosts.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="profile-stat">
                            <span className="profile-stat-value">{myProfilePosts.reduce((sum, p) => sum + (p.likes_count || 0), 0)}</span>
                            <span className="profile-stat-label"> Like{myProfilePosts.reduce((sum, p) => sum + (p.likes_count || 0), 0) !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        {/* Combined Tools & Categories Badges + share button.
                            Mirrors the public profile layout so users see
                            the same chrome on their own My Profile tab. */}
                        {(() => {
                          const badges = [];
                          const toolCounts = {};
                          myProfilePosts.filter(p => p.tool_ids).forEach(p => {
                            (p.tool_ids || []).forEach(tid => {
                              toolCounts[tid] = (toolCounts[tid] || 0) + 1;
                            });
                          });
                          Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).forEach(([toolId, count]) => {
                            badges.push({ type: 'tool', id: toolId, name: getToolDisplayName(toolId), count, onClick: () => navigateToTool(getToolDisplayName(toolId)) });
                          });
                          const catCounts = {};
                          myProfilePosts.filter(p => p.category_ids).forEach(p => {
                            (p.category_ids || []).forEach(cid => {
                              catCounts[cid] = (catCounts[cid] || 0) + 1;
                            });
                          });
                          Object.entries(catCounts).sort((a, b) => b[1] - a[1]).forEach(([catId, count]) => {
                            const cat = categories.find(c => c.id === catId);
                            badges.push({ type: 'cat', id: catId, name: cat ? cat.name : catId, count, onClick: () => { setViewingCategoryId(catId); setCategoryViewTab('most-liked'); setActiveTab('explore'); } });
                          });
                          const displayBadges = showAllProfileTools ? badges : badges.slice(0, 6);
                          return (
                            <div className="profile-bio-footer">
                              {badges.length > 0 && (
                                <div className="profile-tools-badges">
                                  {displayBadges.map(badge => (
                                    <span key={`${badge.type}-${badge.id}`} className="profile-tool-badge" onClick={badge.onClick} style={{ cursor: 'pointer' }}>
                                      {badge.name} <span className="profile-tool-badge-count">({badge.count})</span>
                                    </span>
                                  ))}
                                  {badges.length > 6 && !showAllProfileTools && (
                                    <span className="profile-tool-badge" onClick={() => setShowAllProfileTools(true)} style={{ cursor: 'pointer', fontSize: '1rem', fontWeight: '700', letterSpacing: '1px' }}>
                                      &hellip;
                                    </span>
                                  )}
                                  {badges.length > 6 && showAllProfileTools && (
                                    <span className="profile-tool-badge" onClick={() => setShowAllProfileTools(false)} style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                      &#10005;
                                    </span>
                                  )}
                                </div>
                              )}
                              <ProfileShareButton username={profile.username} />
                            </div>
                          );
                        })()}

                        {/* Profile bio links — same chips as the public
                            profile, rendered here so users see their own
                            GitHub / personal-link entries on their own
                            Profile tab too. */}
                        {(profile.github_url || profile.website_url) && (
                          <div className="profile-links-row">
                            {profile.github_url && (
                              <a
                                className="profile-link-chip"
                                href={ensureAbsoluteUrl(profile.github_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                </svg>
                                GitHub
                              </a>
                            )}
                            {profile.website_url && (
                              <a
                                className="profile-link-chip"
                                href={ensureAbsoluteUrl(profile.website_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title={profile.website_url}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                                </svg>
                                {(() => {
                                  try { return new URL(ensureAbsoluteUrl(profile.website_url)).hostname.replace(/^www\./, ''); }
                                  catch { return 'Website'; }
                                })()}
                              </a>
                            )}
                          </div>
                        )}

                        {/* Builder Rank Section */}
                        {profile.builder_points !== undefined && (() => {
                          const badge = getBadgeForPoints(profile.builder_points || 0);
                          const rank = builderRanks.length > 0 ? getRankForPoints(profile.builder_points || 0, builderRanks) : null;
                          const next = rank ? getNextRank(rank, builderRanks) : null;
                          const isMaxRank = !next;
                          const progressPercent = isMaxRank ? 100 : (next ? Math.min(100, Math.round(((profile.builder_points || 0) - (rank?.min_points || 0)) / ((next?.min_points || 1) - (rank?.min_points || 0)) * 100)) : 0);
                          const pointsToNext = next ? next.min_points - (profile.builder_points || 0) : 0;
                          return (
                            <div className="profile-rank-section" onClick={() => { setActiveTab('ranks'); window.history.pushState({}, '', '/ranks'); }} style={{ cursor: 'pointer' }}>
                              <div className="profile-rank-header">
                                <span className="profile-rank-icon"><BadgeSVG badge={badge} size={64} /></span>
                                <div className="profile-rank-info">
                                  <div className="profile-rank-name" style={{ color: badge.color }}>
                                    {badge.name}
                                  </div>
                                  <div className="profile-rank-points" title={profile.builder_points_display != null ? `Real score: ${(profile.builder_points || 0).toLocaleString()} builder points` : undefined}>{(profile.builder_points_display ?? profile.builder_points ?? 0).toLocaleString()} builder points</div>
                                </div>
                              </div>
                              {rank && next && !isMaxRank ? (
                                <div className="profile-rank-progress">
                                  <div className="profile-rank-progress-bar">
                                    <div className="profile-rank-progress-fill" style={{ width: `${progressPercent}%`, background: next.color || badge.accent }} />
                                  </div>
                                  <div className="profile-rank-next">
                                    <span>{pointsToNext} points to {next.name}</span>
                                    <span>{progressPercent}%</span>
                                  </div>
                                </div>
                              ) : isMaxRank ? (
                                <div className="profile-rank-max">
                                  <span>&#10024;</span> Max rank achieved
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                        <button
                          className="profile-action-btn edit-btn profile-edit-btn-desktop"
                          onClick={() => setShowSettingsModal(true)}
                        >
                          Settings
                        </button>
                        <button
                          className="profile-action-btn edit-btn profile-edit-btn-mobile"
                          onClick={() => setShowSettingsModal(true)}
                        >
                          Settings
                        </button>
                        <button
                          className="profile-action-btn edit-btn"
                          onClick={() => setShowCreatorPaymentsModal(true)}
                          title="Manage paid communities and pending requests"
                        >
                          💰 Payments
                        </button>
                      </div>
                    </div>

                    <div className="profile-posts-section">
                      <div className="profile-posts-tabs" style={{
                        display: 'flex',
                        gap: '0.5rem',
                        marginBottom: '1rem',
                        borderBottom: '1px solid var(--border-color)',
                        paddingBottom: '0.5rem',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className={`profile-posts-tab ${myProfilePostsTab === 'builds' ? 'active' : ''}`}
                            onClick={() => setMyProfilePostsTab('builds')}
                            style={{
                              padding: '0.5rem 1rem',
                              background: myProfilePostsTab === 'builds' ? 'var(--accent-primary)' : 'transparent',
                              color: myProfilePostsTab === 'builds' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              fontSize: '0.9rem',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            Builds
                          </button>
                          <button
                            className={`profile-posts-tab ${myProfilePostsTab === 'posts' ? 'active' : ''}`}
                            onClick={() => setMyProfilePostsTab('posts')}
                            style={{
                              padding: '0.5rem 1rem',
                              background: myProfilePostsTab === 'posts' ? 'var(--accent-primary)' : 'transparent',
                              color: myProfilePostsTab === 'posts' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              fontSize: '0.9rem',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            Discussion
                          </button>
                          <button
                            className={`profile-posts-tab ${myProfilePostsTab === 'questions' ? 'active' : ''}`}
                            onClick={() => setMyProfilePostsTab('questions')}
                            style={{
                              padding: '0.5rem 1rem',
                              background: myProfilePostsTab === 'questions' ? 'var(--accent-primary)' : 'transparent',
                              color: myProfilePostsTab === 'questions' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              fontSize: '0.9rem',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            Questions
                          </button>
                          <button
                            className={`profile-posts-tab ${myProfilePostsTab === 'reposts' ? 'active' : ''}`}
                            onClick={() => setMyProfilePostsTab('reposts')}
                            style={{
                              padding: '0.5rem 1rem',
                              background: myProfilePostsTab === 'reposts' ? 'var(--accent-primary)' : 'transparent',
                              color: myProfilePostsTab === 'reposts' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              fontSize: '0.9rem',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            Reposts{(() => { const n = myProfilePosts.filter(p => p.is_repost).length; return n > 0 ? ` · ${n}` : ''; })()}
                          </button>
                          {myProfileWorkflows.length > 0 && (
                            <button
                              className={`profile-posts-tab ${myProfilePostsTab === 'workflows' ? 'active' : ''}`}
                              onClick={() => setMyProfilePostsTab('workflows')}
                              style={{
                                padding: '0.5rem 1rem',
                                background: myProfilePostsTab === 'workflows' ? 'var(--accent-primary)' : 'transparent',
                                color: myProfilePostsTab === 'workflows' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.9rem',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              Workflows
                            </button>
                          )}
                          <button
                            className={`profile-posts-tab ${myProfilePostsTab === 'channel' ? 'active' : ''}`}
                            onClick={() => setMyProfilePostsTab('channel')}
                            style={{
                              padding: '0.5rem 1rem',
                              background: myProfilePostsTab === 'channel' ? 'var(--accent-primary)' : 'transparent',
                              color: myProfilePostsTab === 'channel' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              fontSize: '0.9rem',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {(profile?.display_name || profile?.username || 'User')}'s Channel
                          </button>
                          {myProfileOwnedCommunities.length > 0 && (
                            <button
                              className={`profile-posts-tab ${myProfilePostsTab === 'communities' ? 'active' : ''}`}
                              onClick={() => setMyProfilePostsTab('communities')}
                              style={{
                                padding: '0.5rem 1rem',
                                background: myProfilePostsTab === 'communities' ? 'var(--accent-primary)' : 'transparent',
                                color: myProfilePostsTab === 'communities' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.9rem',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              Communities
                            </button>
                          )}
                        </div>
                        {myProfilePostsTab !== 'communities' && myProfilePostsTab !== 'workflows' && myProfilePostsTab !== 'channel' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <select
                            value={myProfileSortFilter}
                            onChange={(e) => setMyProfileSortFilter(e.target.value)}
                            style={{
                              padding: '0.4rem 0.75rem',
                              background: 'var(--bg-tertiary)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: '500',
                              outline: 'none'
                            }}
                          >
                            <option value="recent">Most Recent</option>
                            <option value="liked">Most Liked</option>
                          </select>
                          {/* Local my-profile toggle removed — global feedViewMode toggle in top nav */}
                        </div>
                        )}
                      </div>

                      {myProfilePostsTab === 'workflows' ? (
                        <div style={{ marginTop: '0.5rem' }}>
                          {myProfileWorkflows.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                              {myProfileWorkflows.map(wf => (
                                <WorkflowCard
                                  key={wf.id}
                                  workflow={wf}
                                  onLike={handleWorkflowLike}
                                  onSave={handleWorkflowSave}
                                  isLiked={userWorkflowLikes.includes(wf.id)}
                                  isSaved={userWorkflowSaves.includes(wf.id)}
                                  onUserClick={setViewingUserId}
                                  onOpenWorkflow={(w) => setSelectedWorkflowId(w.id)}
                                  onAuthRequired={() => setShowAuthModal(true)}
                                  currentUser={user}
                                  categories={categories}
                                  getToolDisplayName={getToolDisplayName}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="empty-state">
                              <p className="empty-text">No workflows yet</p>
                            </div>
                          )}
                        </div>
                      ) : myProfilePostsTab === 'channel' ? (
                        <div style={{ marginTop: '0.5rem' }}>
                          <ProfileChannels
                            profileUserId={user.id}
                            profileDisplayName={profile?.display_name || profile?.username || 'User'}
                            currentUser={user}
                            onUserClick={setViewingUserId}
                            profileNameColor={profile?.name_color}
                            isFollowingOwner={true}
                          />
                        </div>
                      ) : myProfilePostsTab === 'communities' ? (
                        <div className="profile-communities-grid" style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                          gap: '1rem',
                          marginTop: '0.5rem'
                        }}>
                          {myProfileOwnedCommunities.map(community => (
                            <div
                              key={community.id}
                              onClick={() => {
                                setActiveTab('communities');
                                selectCommunity(community);
                              }}
                              style={{
                                background: 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                padding: '1.25rem',
                                cursor: 'pointer',
                                border: '1px solid var(--border-color)',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>{community.name}</h3>
                              {community.description && (
                                <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{toPlainText(community.description)}</p>
                              )}
                              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <span>{community.member_count || 0} members</span>
                                <span>{community.post_count || 0} posts</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                      <>
                      {/* Pinned Posts */}
                      {myProfilePostsTab === 'builds' && (() => {
                        const pinnedPosts = myProfilePosts.filter(p => !p.is_question && p.post_type !== 'post' && myProfilePinnedIds.includes(p.id));
                        if (pinnedPosts.length === 0) return null;
                        return (
                          <div className="profile-pinned-section">
                            <div className="profile-pinned-label"><PinIcon filled={true} /> Pinned</div>
                            {feedViewMode === 'grid' ? (
                              <PostGrid posts={pinnedPosts} onOpenFullPost={setSelectedFullPost} />
                            ) : pinnedPosts.map(post => (
                              <PostCard
                                key={`pinned-${post.id}`}
                                post={post}
                                onLike={handleLike}
                                userLikes={userLikes}
                                onCommentAdded={handleCommentAdded}
                                onUserClick={setViewingUserId}
                                onSave={handleSave}
                                userSaves={userSaves}
                                onAuthRequired={() => setShowAuthModal(true)}
                                categories={categories}
                                onDelete={handleDeletePost}
                                onOpenFullPost={setSelectedFullPost}
                                allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                                schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                                onSchoolClick={navigateToSchool}
                                onToolClick={navigateToTool}
                                onPinPost={handlePinPost}
                                pinnedPostIds={myProfilePinnedIds}
                                userCommunities={userCommunities}
                                onPostCommunitiesChange={handlePostCommunitiesChange}
                                postCommunities={postCommunities}
                                userCommunityIds={userCommunityIds}
                              />
                            ))}
                          </div>
                        );
                      })()}

                      {(() => {
                        const myPosts = myProfilePosts
                          .filter(p => {
                            // Reposts (re-shared posts) only show in the Reposts tab.
                            if (myProfilePostsTab === 'reposts') return p.is_repost;
                            if (p.is_repost) return false;
                            if (myProfilePostsTab === 'questions') return p.is_question;
                            if (myProfilePostsTab === 'posts') return p.post_type === 'post';
                            return !p.is_question && p.post_type !== 'post';
                          })
                          .sort((a, b) => {
                            if (myProfileSortFilter === 'liked') {
                              return (b.likes_count || 0) - (a.likes_count || 0);
                            }
                            const aT = myProfilePostsTab === 'reposts' ? (a.reposted_at || a.created_at) : a.created_at;
                            const bT = myProfilePostsTab === 'reposts' ? (b.reposted_at || b.created_at) : b.created_at;
                            return new Date(bT) - new Date(aT);
                          });

                        if (myPosts.length === 0) {
                          return (
                            <div className="empty-state">
                              <div className="empty-icon"><InboxIcon /></div>
                              <p className="empty-text">
                                {myProfilePostsTab === 'questions' ? "You haven't asked any questions yet" : myProfilePostsTab === 'posts' ? "You haven't shared any posts yet" : myProfilePostsTab === 'reposts' ? "You haven't reposted anything yet" : "You haven't created any posts yet"}
                              </p>
                              {myProfilePostsTab !== 'reposts' && (
                                <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                                  {myProfilePostsTab === 'questions' ? 'Ask a Question' : myProfilePostsTab === 'posts' ? 'Share a Discussion Post' : 'Create Your First Post'}
                                </button>
                              )}
                            </div>
                          );
                        }

                        // Grid view honors global feedViewMode
                        if (feedViewMode === 'grid') {
                          return <PostGrid posts={myPosts} onOpenFullPost={setSelectedFullPost} />;
                        }

                        // List view
                        return myPosts.map(post => (
                          <PostCard
                            key={post.id}
                            post={post}
                            onLike={handleLike}
                            userLikes={userLikes}
                            onCommentAdded={handleCommentAdded}
                            onUserClick={setViewingUserId}
                            onSave={handleSave}
                            userSaves={userSaves}
                            onAuthRequired={() => setShowAuthModal(true)}
                            categories={categories}
                            onDelete={handleDeletePost}
                            onOpenFullPost={setSelectedFullPost}
                            onQuestionClick={() => { setActiveTab('questions'); setSelectedFullPost(null); setTimeout(() => window.scrollTo({ top: 0 }), 50); }}
                              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
                            onCategoryClick={(categoryId) => {
                              setViewingCategoryId(categoryId);
                              setCategoryViewTab('most-liked');
                              setActiveTab('explore');
                            }}
                            onPinPost={handlePinPost}
                            pinnedPostIds={myProfilePinnedIds}
                            allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
                            schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
                            onSchoolClick={navigateToSchool}
                            onToolClick={navigateToTool}
                            userCommunities={userCommunities}
                            onPostCommunitiesChange={handlePostCommunitiesChange}
                            postCommunities={postCommunities}
                            userCommunityIds={userCommunityIds}
                          />
                        ));
                      })()}
                      </>
                      )}
                    </div>

                    {/* Avatar Lightbox Modal */}
                    {myProfileAvatarLightbox && (
                      <div
                        className="avatar-lightbox-overlay"
                        onClick={() => setMyProfileAvatarLightbox(null)}
                      >
                        <div className="avatar-lightbox-content" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="avatar-lightbox-close"
                            onClick={() => setMyProfileAvatarLightbox(null)}
                          >
                            ×
                          </button>
                          {myProfileAvatarLightbox.imageUrl ? (
                            <img src={myProfileAvatarLightbox.imageUrl} alt="Profile" className="avatar-lightbox-image" />
                          ) : (
                            <div className="avatar-lightbox-emoji">{myProfileAvatarLightbox.emoji || '😀'}</div>
                          )}
                          {myProfileAvatarLightbox.username && (
                            <div className="avatar-lightbox-username">@{myProfileAvatarLightbox.username}</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Banner Lightbox Modal */}
                    {myProfileBannerLightbox && (
                      <div
                        className="banner-lightbox-overlay"
                        onClick={() => setMyProfileBannerLightbox(null)}
                      >
                        <div className="banner-lightbox-content" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="banner-lightbox-close"
                            onClick={() => setMyProfileBannerLightbox(null)}
                          >
                            ×
                          </button>
                          {myProfileBannerLightbox.imageUrl ? (
                            isVideoBannerUrl(myProfileBannerLightbox.imageUrl) ? (
                              <video
                                src={myProfileBannerLightbox.imageUrl}
                                className="banner-lightbox-image"
                                autoPlay
                                loop
                                muted
                                playsInline
                                controls
                              />
                            ) : (
                              <img src={myProfileBannerLightbox.imageUrl} alt="Banner" className="banner-lightbox-image" />
                            )
                          ) : (
                            <div
                              className="banner-lightbox-gradient"
                              style={{
                                background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)'
                              }}
                            />
                          )}
                          {myProfileBannerLightbox.username && (
                            <div className="banner-lightbox-username">@{myProfileBannerLightbox.username}'s banner</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Followers/Following Modal */}
                    {myProfileShowFollowModal && (
                      <div className="modal-overlay" onClick={() => { setMyProfileShowFollowModal(null); setMyProfileFollowSearchQuery(''); }}>
                        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                          <div className="modal-header">
                            <h2 className="modal-title">
                              {myProfileShowFollowModal === 'followers' ? 'Followers' : 'Following'}
                            </h2>
                            <button className="modal-close" onClick={() => { setMyProfileShowFollowModal(null); setMyProfileFollowSearchQuery(''); }}>×</button>
                          </div>

                          {/* Search Bar */}
                          <div style={{ padding: '0 1rem 0.75rem' }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.5rem 0.75rem',
                              background: 'var(--bg-tertiary)',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)'
                            }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                                <circle cx="11" cy="11" r="8"/>
                                <path d="m21 21-4.35-4.35"/>
                              </svg>
                              <input
                                type="text"
                                placeholder={`Search ${myProfileShowFollowModal === 'followers' ? 'followers' : 'following'}...`}
                                value={myProfileFollowSearchQuery}
                                onChange={(e) => setMyProfileFollowSearchQuery(e.target.value)}
                                style={{
                                  flex: 1,
                                  border: 'none',
                                  background: 'transparent',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.9rem',
                                  outline: 'none'
                                }}
                              />
                              {myProfileFollowSearchQuery && (
                                <button
                                  onClick={() => setMyProfileFollowSearchQuery('')}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '0',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    display: 'flex',
                                    alignItems: 'center'
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto', padding: '0' }}>
                            {myProfileLoadingFollowList ? (
                              <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <div className="spinner"></div>
                                <p>Loading...</p>
                              </div>
                            ) : myProfileFollowList.length > 0 ? (
                              (() => {
                                const filteredList = myProfileFollowSearchQuery.trim()
                                  ? myProfileFollowList.filter(item => {
                                      const profile = item.profiles;
                                      const query = myProfileFollowSearchQuery.toLowerCase();
                                      return (
                                        profile?.username?.toLowerCase().includes(query) ||
                                        profile?.display_name?.toLowerCase().includes(query)
                                      );
                                    })
                                  : myProfileFollowList;

                                if (filteredList.length === 0) {
                                  return (
                                    <div style={{
                                      textAlign: 'center',
                                      padding: '2rem',
                                      color: 'var(--text-muted)'
                                    }}>
                                      <p>No users found matching "{myProfileFollowSearchQuery}"</p>
                                    </div>
                                  );
                                }

                                return (
                                  <div>
                                    {filteredList.map((item, index) => {
                                      const userProfile = item.profiles;
                                      const itemUserId = myProfileShowFollowModal === 'followers' ? item.follower_id : item.following_id;
                                      return (
                                        <div
                                          key={itemUserId || index}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.75rem 1rem',
                                            borderBottom: '1px solid var(--border-color)',
                                            cursor: 'pointer',
                                            transition: 'background 0.2s'
                                          }}
                                          onClick={() => {
                                            setMyProfileShowFollowModal(null);
                                            setMyProfileFollowSearchQuery('');
                                            setViewingUserId(itemUserId);
                                          }}
                                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                          <div style={{
                                            width: '44px',
                                            height: '44px',
                                            borderRadius: '50%',
                                            background: 'var(--bg-tertiary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            overflow: 'hidden',
                                            flexShrink: 0
                                          }}>
                                            {userProfile?.avatar_url ? (
                                              <img src={userProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : userProfile?.avatar_emoji ? (
                                              <span style={{ fontSize: '1.4rem' }}>{userProfile.avatar_emoji}</span>
                                            ) : (
                                              <UserIcon />
                                            )}
                                          </div>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: '600', color: userProfile?.name_color || 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                              {userProfile?.display_name || userProfile?.username || 'Unknown'}
                                              <BuilderRankBadge points={userProfile?.builder_points} ranks={builderRanks} />
                                              <UserBadge username={userProfile?.username} size={16} />
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                              @{userProfile?.username || 'unknown'}
                                            </div>
                                            {userProfile?.bio && (
                                              <div style={{
                                                fontSize: '0.8rem',
                                                color: 'var(--text-secondary)',
                                                marginTop: '0.25rem',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                              }}>
                                                {userProfile.bio}
                                              </div>
                                            )}
                                          </div>
                                          {myProfileShowFollowModal === 'following' && userFollows?.includes(itemUserId) ? (
                                            <button
                                              className="profile-action-btn following-btn"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleFollow(itemUserId, true);
                                                setMyProfileFollowList(prev => prev.filter(i => i.following_id !== itemUserId));
                                                setMyProfileFollowingCount(prev => Math.max(0, prev - 1));
                                              }}
                                              onMouseEnter={(e) => { e.currentTarget.textContent = 'Unfollow'; }}
                                              onMouseLeave={(e) => { e.currentTarget.textContent = 'Following'; }}
                                            >
                                              Following
                                            </button>
                                          ) : myProfileShowFollowModal === 'followers' && itemUserId !== user?.id ? (
                                            userFollows?.includes(itemUserId) ? (
                                              <button
                                                className="profile-action-btn following-btn"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleFollow(itemUserId, true);
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.textContent = 'Unfollow'; }}
                                                onMouseLeave={(e) => { e.currentTarget.textContent = 'Following'; }}
                                              >
                                                Following
                                              </button>
                                            ) : (
                                              <button
                                                className="profile-action-btn follow-btn"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleFollow(itemUserId);
                                                }}
                                              >
                                                Follow
                                              </button>
                                            )
                                          ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                                              <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()
                            ) : (
                              <div style={{
                                textAlign: 'center',
                                padding: '2rem',
                                color: 'var(--text-muted)'
                              }}>
                                <p>
                                  {myProfileShowFollowModal === 'followers'
                                    ? 'No followers yet'
                                    : 'Not following anyone yet'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: TERMS AND CONDITIONS */}
                {activeTab === 'terms' && (
                  <TermsPage
                    onBack={() => {
                      setActiveTab('foryou');
                      setShowSettingsModal(true);
                      window.history.pushState({}, '', '/');
                    }}
                  />
                )}

                {/* TAB: PRIVACY POLICY */}
                {activeTab === 'privacy' && (
                  <PrivacyPage
                    onBack={() => {
                      setActiveTab('foryou');
                      setShowSettingsModal(true);
                      window.history.pushState({}, '', '/');
                    }}
                  />
                )}

                {/* TAB: ABOUT */}
                {activeTab === 'about' && (
                  <AboutPage
                    onBack={() => {
                      setActiveTab('foryou');
                      window.history.pushState({}, '', '/');
                    }}
                  />
                )}

                {/* TAB: SUPPORT */}
                {activeTab === 'support' && (
                  <SupportPage
                    onBack={() => {
                      setActiveTab('foryou');
                      setShowSettingsModal(true);
                      window.history.pushState({}, '', '/');
                    }}
                  />
                )}

                {/* TAB: COPYRIGHT */}
                {activeTab === 'copyright' && (
                  <CopyrightPage
                    onBack={() => {
                      setActiveTab('foryou');
                      setShowSettingsModal(true);
                      window.history.pushState({}, '', '/');
                    }}
                  />
                )}
              </div>

              {/* Right Sidebar - Desktop Only */}
              {viewingUserId ? (
                <UserProfileSidebarCard
                  key={viewingUserId}
                  userId={viewingUserId}
                  builderRanks={builderRanks}
                  onShowRanks={() => {
                    setActiveTab('ranks');
                    window.history.pushState({}, '', '/ranks');
                  }}
                  onCommunityClick={(community) => {
                    selectCommunity(community);
                    setActiveTab('communities');
                    setViewingUserId(null);
                  }}
                  onToolClick={navigateToTool}
                />
              ) : activeTab === 'myprofile' && user ? (
                <UserProfileSidebarCard
                  key={`own-${user.id}`}
                  userId={user.id}
                  isOwnProfile
                  onEditProfile={() => setShowSettingsModal(true)}
                  builderRanks={builderRanks}
                  onShowRanks={() => {
                    setActiveTab('ranks');
                    window.history.pushState({}, '', '/ranks');
                  }}
                  onCommunityClick={(community) => {
                    selectCommunity(community);
                    setActiveTab('communities');
                  }}
                  onToolClick={navigateToTool}
                />
              ) : (((activeTab === 'foryou' && feedSubTab !== 'notifications') || (activeTab === 'explore' && !exploreSubView) || (activeTab === 'communities' && !activeCommunity)) && (
                <RightSidebar
                  isAdmin={isPlatformAdmin}
                  isPro={!!profile?.is_pro}
                  communityMode={activeTab === 'communities'}
                  communityRandomPosts={communityRandomPosts}
                  onShuffleCommunityRandom={() => setCommunityRandomSeed(s => s + 1)}
                  topBuilds={activeTab === 'communities' ? communityTopBuilds : topBuilds}
                  topQuestions={activeTab === 'communities' ? communityTopQuestions : topQuestions}
                  topDiscussions={activeTab === 'communities' ? communityTopDiscussions : topDiscussions}
                  /* Clicking a sidebar mini-card opens the post itself in the
                     full-post view. Profile navigation only happens when the
                     author's name is clicked (onUserClick). */
                  onDiscussionClick={(postId) => openPostById(postId)}
                  recommendedAccounts={recommendedAccounts}
                  categories={categories}
                  posts={posts}
                  allUsers={allUsers}
                  postCommunities={postCommunities}
                  userFollowedCategories={userFollowedCategories}
                  onUserClick={(userId) => {
                    setViewingUserId(userId);
                    setActiveTab('foryou');
                  }}
                  onCategoryClick={(categoryId) => {
                    setViewingCategoryId(categoryId);
                    setCategoryViewTab('most-liked');
                    setActiveTab('explore');
                  }}
                  onPostClick={(postId) => openPostById(postId)}
                  onQuestionClick={(postId) => openPostById(postId)}
                  onExploreClick={() => {
                    setActiveTab('explore');
                  }}
                  builderRanks={builderRanks}
                  /* Follow wiring for the new Recommended Accounts Follow
                     button. handleFollow is the same handler used elsewhere
                     for profile follow/unfollow — reusing it keeps DB writes,
                     notifications and rollback behavior consistent. */
                  onFollowUser={handleFollow}
                  currentUserFollows={userFollows}
                  currentUserId={user?.id || null}
                />
              ))}
            </div>
          </main>

          {/* Bottom Tab Navigation */}
          <nav className="bottom-nav">
            <button
              className={`nav-item ${activeTab === 'foryou' ? 'active' : ''}`}
              onClick={() => { setActiveTab('foryou'); setSearchQuery(''); setCreatorSearch(''); setActiveCommunity(null); setShowSearchPage(false); clearExploreSearch(); window.history.replaceState({}, '', '/'); }}
            >
              <span className="nav-icon"><HomeIcon /></span>
              <span className="nav-label">Home</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'communities' ? 'active' : ''}`}
              onClick={() => { setActiveTab('communities'); setSearchQuery(''); setShowSearchPage(false); clearExploreSearch(); }}
            >
              <span className="nav-icon"><CommunityIcon /></span>
              <span className="nav-label">Communities</span>
            </button>
            <div style={{ position: 'relative' }}>
              <button
                className="nav-item nav-create"
                onClick={() => {
                  if (!user) { setShowAuthModal(true); return; }
                  setShowCreateDropdown(prev => !prev);
                }}
              >
                <span className="nav-icon-create"><PlusIcon /></span>
              </button>
              {showCreateDropdown && (
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: '0.5rem',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  minWidth: '160px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  zIndex: 200,
                }}>
                  <button
                    onClick={() => { setShowCreateDropdown(false); setShowCreateModal(true); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                      padding: '0.75rem 1rem', background: 'none', border: 'none',
                      color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: '0.85rem', fontWeight: '600', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <line x1="12" y1="8" x2="12" y2="16"/>
                      <line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    New Post
                  </button>
                  <div style={{ height: '1px', background: 'var(--border-color)' }} />
                  <button
                    onClick={() => { setShowCreateDropdown(false); setShowCreateWorkflow(true); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                      padding: '0.75rem 1rem', background: 'none', border: 'none',
                      color: '#a78bfa', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: '0.85rem', fontWeight: '600', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9,11 12,14 22,4"/>
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                    New Workflow
                  </button>
                </div>
              )}
            </div>
            <button
              className={`nav-item ${activeTab === 'explore' ? 'active' : ''}`}
              onClick={() => { setActiveTab('explore'); setCreatorSearch(''); setShowSearchPage(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            >
              <span className="nav-icon"><SearchIcon /></span>
              <span className="nav-label">Explore</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'ranks' ? 'active' : ''}`}
              onClick={() => { setActiveTab('ranks'); setSearchQuery(''); setCreatorSearch(''); setShowSearchPage(false); clearExploreSearch(); window.history.replaceState({}, '', '/ranks'); }}
            >
              <span className="nav-icon"><RankIcon /></span>
              <span className="nav-label">Ranks</span>
            </button>
          </nav>

          {/* Ranks page is now rendered as a tab via activeTab === 'ranks' */}

          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onSuccess={(newUser) => {
              setUser(newUser);
              loadProfile(newUser.id);
            }}
          />

          <PasswordResetModal
            isOpen={showPasswordResetModal}
            onClose={() => setShowPasswordResetModal(false)}
          />

          <DailyRewardModal
            isOpen={showDailyReward}
            user={user}
            onClose={() => setShowDailyReward(false)}
            onClaimed={(claim) => {
              // A 'today' claim clears the dot; recovering yesterday doesn't.
              if (!claim?.recovered) setDailyRewardClaimable(false);
              if (user?.id) loadProfile(user.id);
            }}
          />

          <CreatePostModal
            isOpen={showCreateModal && !isReadOnlyAccount}
            onClose={() => {
              setShowCreateModal(false);
              setPreSelectedCommunityId(null);
              setDefaultIsQuestion(false);
              setAskAboutPostId(null);
              setCreateInitialDraft('');
              setCreateDefaultPostType(null);
              setCreateRepostSource(null);
            }}
            theme={postBoxTheme}
            initialDraft={createInitialDraft}
            defaultPostType={createDefaultPostType}
            remixFromPost={createRepostSource}
            categories={categories}
            userCommunities={userCommunities}
            preSelectedCommunityId={preSelectedCommunityId}
            defaultIsQuestion={defaultIsQuestion}
            askAboutPostId={askAboutPostId}
            onSuccess={async (communityId, wasQuestion) => {
              loadPosts();
              loadBuilds();
              loadMyProfilePosts();
              loadStats();
              // Reload community posts if we posted to a community
              if (communityId && activeCommunity?.id === communityId) {
                loadCommunityPosts(communityId, communityPostSort);
              }
              // Reload communities to update post counts
              loadCommunities();
              loadUserCommunities();
              // Refresh profile so any builder_points awarded by the trigger show immediately
              if (user?.id) {
                try {
                  const { data: updatedProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
                  if (updatedProfile) setProfile(updatedProfile);
                } catch (refreshErr) {
                  console.error('Error refreshing profile after post create:', refreshErr);
                }
              }
              // If we posted a question and we're on the questions tab, stay there
              if (wasQuestion && activeTab !== 'questions') {
                setActiveTab('questions');
              } else if (!wasQuestion) {
                // Navigate to home so user sees their new post at top
                setActiveTab('foryou');
                setFeedSubTab('foryou');
              }
            }}
          />

          <CreateCommunityModal
            isOpen={showCreateCommunityModal}
            onClose={() => setShowCreateCommunityModal(false)}
            onSuccess={(community) => {
              loadCommunities();
              loadUserCommunities();
              // Navigate to the new community
              setActiveCommunity(community);
              loadCommunityPosts(community.id, communityPostSort);
            }}
          />

          <EditCommunityModal
            isOpen={showEditCommunityModal}
            onClose={() => setShowEditCommunityModal(false)}
            community={activeCommunity}
            onCreatePost={(communityId, kind) => {
              setPreSelectedCommunityId(communityId);
              if (kind === 'question') setDefaultIsQuestion(true);
              else setDefaultIsQuestion(false);
              setShowCreateModal(true);
            }}
            onSuccess={async () => {
              // Reload communities and rules
              await loadCommunities();
              await loadUserCommunities();
              if (activeCommunity) {
                await loadCommunityRules(activeCommunity.id);
                // Refresh active community data
                const { data: updatedCommunity } = await supabase
                  .from('communities_with_stats')
                  .select('*')
                  .eq('id', activeCommunity.id)
                  .single();
                if (updatedCommunity) setActiveCommunity(updatedCommunity);
              }
            }}
          />

          <CreatorPaymentsModal
            isOpen={showCreatorPaymentsModal}
            onClose={() => setShowCreatorPaymentsModal(false)}
            currentUser={user}
            onManageCommunity={(c) => {
              setShowCreatorPaymentsModal(false);
              setActiveCommunity(c);
              setActiveTab('communities');
              setTimeout(() => setShowEditCommunityModal(true), 50);
            }}
          />

          {appealRequest && (
            <AppealModal
              request={appealRequest}
              currentUser={user}
              onClose={() => setAppealRequest(null)}
              addToast={addToast}
            />
          )}

          {paidJoinCommunity && (
            <JoinPaidCommunityModal
              community={paidJoinCommunity}
              currentUser={user}
              onClose={() => setPaidJoinCommunity(null)}
              onSubmitted={() => setPaidJoinCommunity(null)}
              addToast={addToast}
            />
          )}

          <InviteCodeModal
            isOpen={showInviteCodeModal}
            onClose={() => {
              setShowInviteCodeModal(false);
              setInviteCodeCommunity(null);
            }}
            community={inviteCodeCommunity}
            onJoin={joinCommunity}
          />

          <SettingsModal
            isOpen={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
            user={user}
            profile={profile}
            onProfileUpdate={() => loadProfile(user.id)}
            onLogout={handleLogout}
            onDeleteAccount={() => { setShowSettingsModal(false); setShowDeleteAccountModal(true); }}
            onCancelDeletion={handleCancelDeletion}
            categories={categories}
            userFollowedCategories={userFollowedCategories}
            onFollowCategory={handleFollowCategory}
            userPostCount={user ? myProfilePosts.length : 0}
            onNavigateToLegal={(page) => {
              // Clear any active profile/post view so the legal page isn't
              // masked by UserProfileView (own-profile clicks set viewingUserId).
              setViewingUserId(null);
              setSelectedFullPost(null);
              setActiveTab(page);
              const urlMap = { terms: '/termsandconditions', privacy: '/privacypolicy', support: '/support', copyright: '/copyright' };
              window.history.pushState({}, '', urlMap[page] || '/');
            }}
            schoolLeaderboard={schoolLeaderboard}
            userSchool={userSchool}
            onJoinSchool={handleJoinSchool}
            onLeaveSchool={handleLeaveSchool}
          />

          <AccountDeletionModal
            isOpen={showDeleteAccountModal}
            onClose={() => setShowDeleteAccountModal(false)}
            username={profile?.username}
            variant="self"
            onConfirm={handleSelfDeleteConfirm}
          />

          {/* Agent Posting (MCP): full-screen draft review overlay (/review/:id) */}
          {reviewDraftId && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000, overflowY: 'auto', background: '#0a0a0a' }}>
              <ReviewDraftPage
                draftId={reviewDraftId}
                currentUser={user}
                onClose={() => {
                  setReviewDraftId(null);
                  window.history.pushState({}, '', '/');
                }}
              />
            </div>
          )}

          {/* Agent Posting (MCP): "Drafts" list overlay (opened from profile) */}
          {showDraftsList && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000, overflowY: 'auto', background: '#0a0a0a' }}>
              <DraftsListPage
                user={user}
                onClose={() => setShowDraftsList(false)}
                onOpenDraft={(id) => {
                  setShowDraftsList(false);
                  setReviewDraftId(id);
                  window.history.pushState({}, '', '/review/' + id);
                }}
              />
            </div>
          )}

          {/* School Members Modal */}
          {showSchoolMembersModal && (
            <div className="modal-overlay" onClick={() => setShowSchoolMembersModal(false)}>
              <div className="school-members-modal" onClick={e => e.stopPropagation()}>
                <div className="school-members-modal-header">
                  <h3>Members{schoolDetails ? ` of ${schoolDetails.name}` : ''}</h3>
                  <button onClick={() => setShowSchoolMembersModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                <div className="school-members-modal-body">
                  {schoolMembersLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}><div className="spinner"></div><p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Loading members...</p></div>
                  ) : schoolMembers.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No members yet</div>
                  ) : (
                    schoolMembers.map(member => (
                      <div
                        key={member.user_id}
                        className="school-member-item"
                        onClick={() => {
                          setShowSchoolMembersModal(false);
                          setViewingUserId(member.user_id);
                        }}
                      >
                        <div className="school-member-avatar">
                          {member.avatar_url ? (
                            <img src={member.avatar_url} alt="" />
                          ) : member.avatar_emoji ? (
                            <span>{member.avatar_emoji}</span>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          )}
                        </div>
                        <div className="school-member-info">
                          <div className="school-member-name" style={member.name_color ? { color: member.name_color } : {}}>
                            {member.display_name || member.username}
                          </div>
                          <div className="school-member-username">@{member.username}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Full Post View Modal */}
          {selectedFullPost && (
            <FullPostView
              post={selectedFullPost}
              onClose={() => setSelectedFullPost(null)}
              onLike={handleLike}
              userLikes={userLikes}
              onCommentAdded={handleCommentAdded}
              onUserClick={(userId) => {
                setSelectedFullPost(null);
                setViewingUserId(userId);
              }}
              onSave={handleSave}
              userSaves={userSaves}
              onAuthRequired={() => setShowAuthModal(true)}
              categories={categories}
              onCategoryClick={(categoryId) => {
                setSelectedFullPost(null);
                setViewingCategoryId(categoryId);
                setCategoryViewTab('most-liked');
                setActiveTab('explore');
              }}
              allPosts={posts}
                              forkedPostsMap={forkedPostsMap}
              schoolsData={schoolLeaderboard}
                              builderRanks={builderRanks}
              onSchoolClick={navigateToSchool}
              onToolClick={navigateToTool}
              onRecordView={recordPostView}
              onOpenFullPost={setSelectedFullPost}
              onAskQuestion={(postId) => { if (!user) { setShowAuthModal(true); return; } setSelectedFullPost(null); setAskAboutPostId(postId); setDefaultIsQuestion(true); setShowCreateModal(true); }}
            />
          )}
        </div>
        )}
        </AchievementsRealtimeProvider>
      <Analytics />
    </AuthContext.Provider>
  );
}

function VibeShareApp() {
  return (
    <ToastProvider>
      <VibeShareAppInner />
    </ToastProvider>
  );
}

export default VibeShareApp;
