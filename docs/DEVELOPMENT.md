# Development Guide

Day-to-day notes for **Mouse** working in this Prompted frontend copy.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ recommended |
| pnpm | 8+ recommended (`corepack enable`) |
| npm | 9+ (ships with Node; uses repo `.npmrc`) |

```bash
pnpm install
pnpm dev
```

Or with npm:

```bash
npm install
npm run dev
```

> [!NOTE]
> `react-helmet-async@2.0.5` peer-dep caps at React 18 while this branch runs React 19. **pnpm install** works without flags. **npm install** needs the committed `.npmrc` (`legacy-peer-deps=true`) or you will hit `ERESOLVE`. The repo keeps `package-lock.json` for npm; `pnpm-lock.yaml` is not committed.

---

## Environment and backend

This copy has **no local Supabase**. It uses the production project baked into `src/lib/supabase.js`.

| Works locally | Unreliable or broken locally |
|---------------|------------------------------|
| Guest dashboard, anonymous feed, landing shell | OAuth login round-trip back to localhost |
| Read-only browsing (posts, profiles as guest) | Logged-in profile/session (not verified in handoff) |
| Email/password login (direct API; may work, test yourself) | Stripe checkout |
| Search, arena (read-mostly) | Push notifications |
| | Cafeteria GIF picker |
| | DMs (require logged-in session) |

The Vite dev server proxies `/api/*` to `https://prmpted.com`. Stripe and other serverless routes hit **real production**.

```js
// vite.config.js (conceptual)
proxy: {
  '/api': { target: 'https://prmpted.com', changeOrigin: true }
}
```

---

## Local dev shortcuts

### Skip the landing page

On `localhost` or `127.0.0.1`, `landingDismissed` initializes to `true` automatically.

### Force landing preview

```
http://localhost:5173/?landing=1
```

### Auth on localhost (verified)

**What works**

- Guest dashboard at surface level: landing auto-dismisses on `localhost` / `127.0.0.1`, anonymous feed loads via `fetchFeedPosts(null)` fallback.
- `?landing=1` still forces the landing preview on localhost.

**What I could not verify locally**

- Logged-in profile/session on localhost during the handoff pass. OAuth did not complete a round-trip back to dev.

**Why OAuth likely fails on localhost**

`AuthModal.jsx` web OAuth calls:

```js
supabase.auth.signInWithOAuth({
  provider,
  options: { redirectTo: window.location.origin }
});
```

On localhost that `redirectTo` is `http://localhost:5173` (or your Vite port). Supabase Auth only accepts redirect URLs on the project allowlist. Production is configured around `prmpted.com`; localhost URLs are not defined in this repo and were not working in practice.

`App.jsx` documents the same pain point: local dev skips the landing page partly because OAuth tends to kick you off localhost.

**Email/password is different**

`signInWithPassword` talks to Supabase directly (no redirect). It may work on localhost if credentials are valid, but do not assume parity with production until you test it.

**Practical recommendation**

- UI shell / guest flows: localhost is fine.
- Real profile, DMs, saves, OAuth: test on production, or add `http://localhost:5173` and `http://127.0.0.1:5173` to Supabase **Redirect URLs**.

---

## Scripts

| Script | Command | Notes |
|--------|---------|-------|
| Dev | `npm run dev` | HMR, default port 5173 |
| Test | `npm test` | Vitest run mode (not watch) |
| Preview | `npm run preview` | Serve `dist/` after build |
| Build | `npm run build` | **Fails** at `embed-shell.mjs` step |
| Vite only | `npx vite build` | Works for bundle inspection |
| Android | `npm run android` | Needs `scripts/` + `android/` project |

> [!WARNING]
> `scripts/embed-shell.mjs` and `scripts/gen-mobile-assets.mjs` are referenced in `package.json` but missing on this branch. Restore them from `main`/`master` before running full production or Capacitor builds.

---

## Project conventions

### Where to put things

| Type | Location |
|------|----------|
| Tab pages | `src/pages/` |
| Reusable UI | `src/components/` |
| Data / helpers | `src/lib/` |
| Global CSS | `src/appStyles.css` |
| Scoped CSS | `ComponentName.module.css` next to component |
| Static assets | `public/` |
| Tests | `src/test/` |

### CSS modules (when adding new components)

Follow the established pattern from `AdUnit.jsx`:

1. Create `MyComponent.module.css` with camelCase class names
2. `import styles from './MyComponent.module.css'`
3. Keep shared utilities (`form-input`, `btn`, etc.) global in `appStyles.css`
4. Check for cross-component class usage before extracting

### Lazy loading (when adding heavy pages)

```jsx
const MyPage = React.lazy(() => import('./pages/MyPage.jsx'));

// In render:
<React.Suspense fallback={null}>
  <MyPage />
</React.Suspense>
```

Tab navigation should go through `handleNavClick` so `startTransition` keeps the current UI visible while chunks load.

### Feed data (when touching home)

Use `src/lib/feedPosts.js` and TanStack Query. Do not add new manual `loadPosts()` loops in `App.jsx`.

```jsx
import { fetchFeedPosts, feedPostsQueryKey } from './lib/feedPosts.js';

const { data: posts } = useQuery({
  queryKey: feedPostsQueryKey(user?.id),
  queryFn: () => fetchFeedPosts(user?.id),
});
```

---

## Key files to know

| File | Why it matters |
|------|----------------|
| `src/App.jsx` | Monolith: auth, routing, feed shell, sidebars |
| `src/router.jsx` | BrowserRouter entry, Suspense boundary |
| `src/main.jsx` | QueryClient, Helmet, native bootstrap |
| `src/lib/feedPosts.js` | Feed + builds query functions |
| `src/lib/appShared.js` | `SITE_ORIGIN`, `OG_IMAGE_URL`, auth context, tool maps |
| `src/lib/queryClient.js` | Default stale/retry settings |
| `src/components/LandingPage.jsx` | Marketing landing |
| `src/components/AuthModal.jsx` | Login/signup/OAuth |
| `src/components/post/PostCard.jsx` | Memoized feed card |
| `vite.config.js` | Proxy, test config, chunk warnings |

---

## Testing

```bash
npm test
```

### Test files

| File | What it tests |
|------|---------------|
| `sanitize.test.js` | `toPlainText`, HTML stripping |
| `links.test.jsx` | `safeHttpUrl`, linkify, XSS rejection |
| `app.test.jsx` | Supabase client + live fetch smoke + App render |

> [!TIP]
> `app.test.jsx` may hit the real Supabase API when network is available. Mock if you need offline CI.

### Adding tests

Vitest config lives in `vite.config.js`:

```js
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: './src/test/setup.js',
}
```

---

## Debugging common issues

<details>
<summary><strong>Blank screen after navigation</strong></summary>

Check the console for a failed lazy import. A missing chunk usually means a bad import path in a new `React.lazy()` call. The Suspense boundary in `router.jsx` should catch suspends; an actual import error will still crash.

</details>

<details>
<summary><strong>Feed shows skeleton forever</strong></summary>

1. Check network tab for `get_personalized_feed` RPC
2. Confirm user session in Supabase auth
3. Look for query `enabled` flags accidentally set to `false`

</details>

<details>
<summary><strong>buildPosts is not defined</strong></summary>

Fixed in `c5a6fda`. Builds come from `buildsFeedQuery.data` aliased as `buildPosts`. If you refactor, keep that alias or update all JSX references.

</details>

<details>
<summary><strong>OG image wrong on share</strong></summary>

1. Static default: `index.html` → `og-image.jpg`
2. Runtime fallback: `OG_IMAGE_URL` in `appShared.js`
3. Per-post: first image in `post.images`, set in `App.jsx` meta updaters

</details>

<details>
<summary><strong>Layout shift on feed load</strong></summary>

Skeleton loaders are intentional. If you see shift, confirm `PostCardSkeleton` dimensions match real cards and that `CreatePostBox` space is reserved when the box is visible.

</details>

---

## Analytics

| Package | Status |
|---------|--------|
| `@vercel/analytics` | Mounted in `App.jsx` as `<Analytics />` |
| `@vercel/speed-insights` | In `package.json`, **not mounted yet** |

To wire Speed Insights:

```jsx
import { SpeedInsights } from '@vercel/speed-insights/react';

// Next to <Analytics /> at the bottom of App.jsx
<SpeedInsights />
```

---

## Mobile / Capacitor

Dependencies are in `package.json` but this branch has no `android/` or `capacitor.config.*` yet. The native bootstrap in `lib/nativeBootstrap.js` handles:

- Status bar styling
- Hardware back button (Android)
- OAuth deep link return

If you need a device build, init Capacitor in a branch with the full `scripts/` folder from main.

---

## Git workflow

```bash
git checkout -b mouse/my-feature
npm test
git add -p
git commit -m "feat: describe what and why"
git push origin mouse/my-feature
```

---

## Documentation accuracy (last verified 2026-07-08)

Claims below were checked against this repo and the original baseline (pre-redesign copy).

| Claim | Status |
|-------|--------|
| `pnpm install` works without peer-dep flags | **True** |
| `npm install` works with repo `.npmrc` (`legacy-peer-deps=true`) | **True** |
| `package-lock.json` committed; `pnpm-lock.yaml` not committed | **True** |
| React 19.2.7, Vite 8.1.3, react-router-dom 7.18.1 | **True** (`package.json`) |
| Old baseline: React 18.2.0, Vite 5.0.0, no router | **True** (old `package.json`) |
| 22 tests pass (`npm test`) | **True** (old baseline: 20 tests) |
| 39 `React.lazy()` calls in `App.jsx` | **True** (old baseline: 1) |
| 14 lazy-loaded pages in `src/pages/` | **True** |
| Feed `p_limit: 150` in `feedPosts.js` | **True** (old: 500) |
| Builds query deferred via `buildsFeedEnabled` | **True** |
| `requestIdleCallback` deferral for directory fetches | **True** |
| `PostCard` is `React.memo` | **True** |
| `scripts/` folder missing; `npm run build` fails after Vite | **True** |
| `npx vite build` succeeds | **True** |
| `@vercel/speed-insights` installed but not mounted | **True** |
| `@vercel/analytics` mounted in `App.jsx` | **True** |
| `public/og-image.jpg`, `video.webm`, `hero.webp` exist | **True** |
| Removed sandbox/admin orphan files are gone | **True** |
| `android/` project not in repo | **True** |
| Hero CTAs call `onSignup` (auth modal), not feed navigation | **True** (`LandingPage.jsx`) |
| `CreatePostBox` is eagerly imported (not lazy) | **True** |
| Main bundle ~876 KB today (changelog Phase 1.4 cited ~1,108 KB at that time) | **True** (sizes drift as code changes) |
| Localhost skips landing (`landingDismissed` init in `App.jsx`) | **True** |
| Guest browse works on localhost (anonymous feed) | **True** (author verified at surface level) |
| OAuth `redirectTo: window.location.origin` in `AuthModal.jsx` | **True** |
| Logged-in profile tested on localhost during handoff | **False** (OAuth redirect allowlist likely prod-only) |
| Email/password uses direct API (no OAuth redirect) | **True** (`signInWithPassword`) |
| Profile paths use `/:username`, not `/@username` | **True** (`App.jsx` pathname match) |
| `dist/` is gitignored (not committed) | **True** (`.gitignore`) |
| Legacy `public/og-image.png` removed (meta uses `.jpg` only) | **True** |

Repo: [github.com/bitmousekatze/PromptedDesign](https://github.com/bitmousekatze/PromptedDesign) (branch `redesign-handoff`)

---

## Related docs

- [`../README.md`](../README.md) overview
- [`../CHANGELOG.md`](../CHANGELOG.md) what changed and when
- [`MIGRATION.md`](./MIGRATION.md) old vs new comparison