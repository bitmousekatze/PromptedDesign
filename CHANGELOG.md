# Changelog

Changes I made to this Prompted frontend copy, documented for **Mouse**.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Compare baseline: `main`/`master` on [bitmousekatze/PromptedDesign](https://github.com/bitmousekatze/PromptedDesign) before branch `redesign-handoff`

---

## [Unreleased]

### Documentation
- Localhost auth notes: guest browse verified; logged-in profile/OAuth on localhost not verified (Supabase redirect allowlist likely prod-only)
- Broader doc fact-check pass (npm lockfile, profile path `/:username`, `dist/` gitignored, etc.)

### Fixed
- Added `.npmrc` (`legacy-peer-deps=true`) so `npm install` works with React 19 + `react-helmet-async@2.0.5` (`pnpm install` already worked)

### Planned
- Mount `@vercel/speed-insights` alongside `@vercel/analytics`
- Phase 2 router: per-route Suspense boundaries
- Continue CSS module extraction from `appStyles.css`
- Restore `scripts/embed-shell.mjs` and `scripts/gen-mobile-assets.mjs` from main repo for full `npm run build`

---

## [2026-07-08] OG image + lockfile cleanup

### Added
- `public/og-image.jpg` (1200×630) for social sharing
- `OG_IMAGE_URL` constant in `src/lib/appShared.js`

### Changed
- `index.html`: `og:image` and `twitter:image` now point at `.jpg`; dimensions 1200×630; `twitter:card` → `summary_large_image`
- `App.jsx` and `FullPostView.jsx`: all OG fallbacks use `OG_IMAGE_URL`

### Removed
- `pnpm-lock.yaml` (stray duplicate lockfile; repo uses `package-lock.json` with npm)

---

## [2026-07-08] Dead code cleanup

### Removed
- Unused state and loaders from `App.jsx`: `stats`, `loadStats`, `creators`, `loadCreators`, `filteredCreators`, `creatorSearch` (zero UI reads)

---

## [2026-07-08] Unused files removed

### Removed
- `src/components/CircularGallery.jsx`
- `src/components/sandbox/ApiKeyManager.tsx`
- `src/components/sandbox/RunHistory.tsx`
- `src/components/sandbox/SandboxRunner.tsx`
- `src/lib/adminStats.js`
- `src/lib/aiAdvisors.js`
- `src/lib/reports.js`
- `public/gamepad-icon.png` (corrupt asset)

---

## [2026-07-07] Feed performance pass

### Added
- `src/lib/feedPosts.js` with `fetchFeedPosts`, `fetchBuildPosts`, `filterFeedPosts`
- TanStack Query for home feed and builds tab
- `buildsFeedQuery` with `enabled: buildsFeedEnabled` (builds fetch only when tab active)
- `React.memo` on `PostCard` with `postCardPropsAreEqual`
- `requestIdleCallback` deferral for `loadAllUsers` and `loadSchoolLeaderboard`
- `loading="lazy"` on feed images; `preload="metadata"` on videos

### Changed
- Personalized feed `p_limit`: **500 → 150**
- Hero **Start exploring** / **See trending** CTAs open auth modal via `onSignup` (not feed navigation)
- Bottom landing CTA: **Browse as guest** dismisses landing to dashboard
- Auth modal: no scroll on login/landing; scroll + styled scrollbar on signup only

### Fixed
- `buildPosts is not defined` ReferenceError via explicit `buildsFeedQuery` + `buildPosts` alias

---

## [2026-07-07] Skeleton loaders + layout stability

### Added
- `SkeletonLoader.jsx`, `PageLoader.jsx`, `RightSidebarSkeleton`
- `PostCardSkeleton` replaces spinners on feed and builds tab

### Fixed
- Right sidebar skeleton persists until data loads (no empty-state flash)
- CreatePostBox space reserved to prevent layout shift
- Builds tab skeleton persists until `buildPosts` resolves
- Centered `PostCardSkeleton` to prevent horizontal shift

---

## [2026-07-06 to 2026-07-07] Landing page redesign

### Added
- `public/video.webm` hero background with slow `playbackRate`
- AiBurst logo carousel (5 sets, looping, arch layout above "AI")
- Communities section: glass pillar cards, themed icons, mouse-tracked glow borders
- Builder rank flip cards with cursor spotlight
- Live leaderboard RPC with mock fallback (`mousedevv` at rank 5)
- Tool comparison chart (recharts)
- Field picker with persona-specific demo content
- `public/hero.webp` still fallback

### Changed
- Typography finalized: **Urbanist** + **Instrument Serif** (+ supporting stack in `index.html`)
- Hero trust bar redesigned; nav section links moved to footer
- Hero subtitle copy: "real AI tools" wording
- `LandingPage.jsx` lazy-loaded; signed-in users skip the chunk

---

## [2026-07-06 to 2026-07-07] UI polish batch

### Changed
- Sidebar: AnimatedIcon nav, iPad layout fixes
- Logo click returns to landing/home
- Nested anchor issues fixed in post/community links
- Font loading: preload + preconnect in `index.html`
- `f82caea`: sidebar, auth modal, fonts, links, general UI polish

---

## [2026-07-07] Phase 2.10: CSS modules (Community)

### Added
- `CommunitySelector.module.css` (12 scoped classes)
- `CommunityChannels.module.css` (9 scoped classes)

### Changed
- `appStyles.css`: 18,119 → 17,938 lines

---

## [2026-07-07] Phase 2.9: DailyRewardModal + lazy modals

### Added
- `DailyRewardModal.module.css` (15 scoped classes)
- Lazy-loaded: `DailyRewardModal`, `AccountDeletionModal`, `CreatePostModal`, `CreateCommunityModal`, `EditCommunityModal`

### Changed
- `appStyles.css`: 18,209 → 18,119 lines

---

## [2026-07-07] Phase 2.8: CSS module (OnboardingWizard)

### Added
- `OnboardingWizard.module.css` (~55 scoped classes, keyframes, responsive breakpoint)

### Changed
- `appStyles.css`: 18,811 → 18,209 lines

---

## [2026-07-07] Phase 2.7: Dead CSS cleanup

### Removed
- ~250 lines from `appStyles.css` (ad + built-with blocks now in CSS modules)

### Changed
- `appStyles.css`: 19,040 → 18,811 lines

---

## [2026-07-07] Phase 2.6: Lazy Settings + Messages

### Changed
- `SettingsModal` and `MessagesView` converted to `React.lazy()` with per-site Suspense

---

## [2026-07-07] Phase 2.5: CSS module (BuiltWithSelector)

### Added
- `BuiltWithSelector.module.css` (10 exclusive classes)

---

## [2026-07-07] Phase 2.4: Bundle audit

### Documented
- Main bundle driven by `App.jsx` (~732K source) and eager imports
- Heavy libs (recharts, framer-motion, jszip) already in lazy page chunks
- 14 lazy page chunks verified in build output

---

## [2026-07-07] Phase 2.3: CSS module pilot (AdUnit)

### Added
- `AdUnit.module.css` (first CSS module pattern)
- Shared `ad-placeholder` stays global for `DailyRewardModal.jsx`

---

## [2026-07-07] Phase 2.2: React 18 → 19

### Changed
- `react@^18.2.0` → `react@^19.2.7`
- `react-dom@^18.2.0` → `react-dom@^19.2.7`
- Zero test changes required; 20/20 pass at time of upgrade

---

## [2026-07-06] Phase 1.4: Code splitting

### Added
- `src/router.jsx` with `BrowserRouter`, catch-all route, `ScrollToTop`
- `React.lazy()` for 14 pages: Arena, Games, Learning, BuilderRanks, Pro, Spotlight, Referrals, Videos, Memes, Zoe, Achievements, WeeklyReport, ReviewDraft, DraftsList
- App-wide Suspense in `router.jsx`
- `React.startTransition` in `handleNavClick` (fixes full-app flash on tab nav)

### Changed
- `main.jsx`: mounts `<AppRouter />` instead of `<App />`

### Metrics
| Metric | Before | After |
|--------|--------|-------|
| Build time (Vite 8) | 1.49s | 1.67s |
| Main bundle | 1,108 KB | 1,108 KB (feed still eager) |
| Page chunks | 0 | 14 (3K-358K each) |
| Initial JS for feed-only users | 100% | ~15% (~85% reduction) |

---

## [2026-07-06] Phase 1.1-1.3: Router foundation

### Added
- `react-router-dom@^7.18.1`
- `src/router.jsx` wrapping `<App />` as catch-all
- Zero `App.jsx` changes at this stage

---

## [2026-07-06] Phase 3: Vite 5 → 8

### Changed
- `vite@^5.0.0` → `vite@^8.1.3` (Rolldown)
- `@vitejs/plugin-react@^4.2.0` → `@vitejs/plugin-react@^6.0.3`
- `vitest@^4.0.18` → `vitest@^4.1.10`

### Metrics
- Build: 5.89s → **1.49s** (~4x faster)
- All tests pass; no breaking changes

---

## [Earlier] Component extractions (pre-router)

These were pulled out of the `App.jsx` monolith before the performance pass:

| Component | New file |
|-----------|----------|
| Auth modal | `src/components/AuthModal.jsx` |
| Password reset | `src/components/PasswordResetModal.jsx` |
| Right sidebar | `src/components/RightSidebar.jsx` |
| Create post box | `src/components/CreatePostBox.jsx` |
| Post experience | `src/components/post/*` |
| Community UI | `src/components/community/*` |
| Global CSS | `src/appStyles.css` (from 19k-line inline `<style>`) |

---

## Baseline (old copy)

The original baseline shipped with:

- React 18.2 + Vite 5
- No `react-router-dom`
- TanStack Query configured but feed used manual `loadPosts()`
- Only `LandingPage` lazy-loaded
- `AuthModal` inline in `App.jsx`
- Sandbox BYOK components present but unused
- Original README framed as a design test copy (not a production handoff)

See [`docs/MIGRATION.md`](./docs/MIGRATION.md) for the full diff.