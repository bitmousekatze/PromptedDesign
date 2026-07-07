# prmpted Games — Agent Instructions

You are helping a user prepare a browser game for upload to **prmpted Games**
(<https://prmpted.com>). Read this whole file before making changes.

prmpted Games embeds the user's game in a sandboxed iframe on the platform.
Your job is to make the game compatible and to wire up achievements so players
earn Builder Points (BP) while playing.

There are no API keys, tokens, or secrets in this kit. Everything is public.

---

## 1. Compatibility checklist

The game must be 100% client-side static HTML/JS/CSS/assets. No backend, no
Node server, no `/api/*` routes on the user's own domain. External APIs are
fine if they support CORS.

Before doing anything else, confirm:

- [ ] There is an `index.html` at the root of the deployed/built output
- [ ] All asset paths are **relative** (`./assets/foo.js`), not absolute (`/assets/foo.js`)
- [ ] If the project uses a router, it is `HashRouter` (or equivalent) — `BrowserRouter` will break in the sandbox
- [ ] The game runs by opening `dist/index.html` (or equivalent) directly from `file://`

### Framework fixes you may need to apply

| Framework | Fix |
| --- | --- |
| Vite | Set `base: './'` in `vite.config.{ts,js}`, then rebuild |
| Create React App | Set `"homepage": "."` in `package.json`, then rebuild |
| React Router | Replace `BrowserRouter` with `HashRouter`; remove any `basename` prop |
| Next.js | Not supported (needs a server). Only static-exported projects work |
| Plain HTML/Phaser/Pixi | Usually already fine |

---

## 2. Hosting

The user picks one of two routes when submitting:

1. **External URL** (preferred — Lovable, Replit, GitHub Pages, Netlify, Vercel static, itch.io HTML5). The user pastes their `https://...` URL.
2. **Zip upload** (fallback). The zip's **root** must contain `index.html`. Zip the *contents* of the build folder, not the folder itself.

If the user is on Windows, the zip command is:

```powershell
Compress-Archive -Path .\dist\* -DestinationPath my-game.zip
```

Max zip size: **200 MB**. Recommend WebP for images and dropping sourcemaps.

---

## 3. The prmpted SDK

Add this script to the top of `<head>` in `index.html`. It is self-contained,
has no dependencies, and is safe to ship to production. It does nothing unless
the page is embedded inside prmpted.

```html
<script>
(function(){
  if (window.prmpted) return;
  function send(m){ try { window.parent.postMessage(m, '*'); } catch(_){} }
  function heartbeat(){
    if (document.visibilityState !== 'visible') return;
    send({ type: 'prmpted:heartbeat', t: Date.now() });
  }
  setInterval(heartbeat, 30000);
  setTimeout(heartbeat, 2000);
  var pending = {}, seq = 0;
  window.addEventListener('message', function(e){
    var d = e.data; if (!d || d.type !== 'prmpted:score:result') return;
    var cb = pending[d.rid]; if (cb){ delete pending[d.rid]; cb(d.result || {ok:false}); }
  });
  window.prmpted = {
    unlock: function(id){
      if (!id || typeof id !== 'string') return;
      send({ type: 'prmpted:achievement', id: id });
    },
    score: function(value, opts){
      opts = opts || {}; var n = Number(value);
      if (!isFinite(n)) return Promise.resolve({ ok:false, reason:'invalid_score' });
      var rid = 'r' + (++seq);
      send({ type:'prmpted:score', rid:rid, score:n,
             board: typeof opts.board==='string'?opts.board:'default',
             lowerIsBetter: !!opts.lowerIsBetter,
             meta: opts.meta && typeof opts.meta==='object'?opts.meta:{} });
      return new Promise(function(resolve){
        pending[rid] = resolve;
        setTimeout(function(){ if(pending[rid]){ delete pending[rid]; resolve({ok:false,reason:'timeout'}); } }, 8000);
      });
    }
  };
})();
</script>
```

After adding the SDK, **find every place the game grants an achievement** and
add a `window.prmpted.unlock(...)` call. Examples:

```js
function unlockAch(id) {
  // ... existing local logic ...
  try {
    if (window.prmpted && window.prmpted.unlock) window.prmpted.unlock(id);
  } catch(_){}
}
```

Each unique `(user, game, achievement_id)` triple awards **+15 BP** the first
time it fires. Calling repeatedly is safe — the platform deduplicates.

### Achievement IDs

Pick stable, snake_case IDs. They are the identity used for deduplication;
renaming an ID after launch makes existing unlocks orphans. Examples:

- `first_blood`
- `level_10_complete`
- `no_damage_run`
- `secret_room_found`

---

## 3b. Leaderboards (optional)

If your game has a score, submit it and prmpted ranks every player globally. A
top-10 board renders automatically on your game's page — no UI work needed.

```js
// At the end of a run / on game over:
window.prmpted.score(finalScore).then(function (res) {
  if (res.ok && res.improved) {
    console.log('New best! Rank #' + res.rank + ' of ' + res.total);
  }
});
```

Options:

```js
window.prmpted.score(seconds, { lowerIsBetter: true });      // speedruns: lower wins
window.prmpted.score(points, { board: 'endless' });          // multiple boards per game
window.prmpted.score(points, { meta: { level: 7 } });        // attach context
```

- prmpted keeps only each player's **best** score per board — submit freely.
- `board` is any short string; a new board appears the first time you post to it.
- The call returns a Promise resolving to `{ ok, improved, score, rank, total }`.
- Logged-out players get a "sign in to save your score" prompt; the call resolves `{ ok: false }`.

---

## 4. Save state (optional)

If the game uses `localStorage` / `sessionStorage`, it works automatically —
prmpted bridges storage calls to the parent and persists them per-user
(Supabase if logged in, browser localStorage if anonymous). You do not need
to write any code for this.

The only thing to avoid: do not assume storage is synchronous across reloads
on the same page-load — treat it as eventually consistent.

---

## 5. Sandbox limits

The game runs inside an iframe with restricted capabilities. The following
will *not* work and should not be relied on:

- Cookies
- Top-level navigation (`window.top.location = ...`)
- Popups / `window.open` to non-game URLs
- Direct DOM access to the parent prmpted page

The following *do* work:

- Canvas, WebGL, WebAudio
- Gamepad API
- Fullscreen and pointer lock
- `fetch` to any CORS-friendly URL
- All in-page input (keyboard, mouse, touch)

---

## 6. Verification before submission

Before telling the user the game is ready, do all of these:

1. Build the project.
2. Open the built `index.html` directly from the filesystem (`file://...`) — it must run without a dev server.
3. Open browser devtools → confirm there are no 404s for assets (catches absolute-path bugs).
4. Grep the codebase for every achievement-grant site and confirm each one calls `window.prmpted.unlock(...)`.
5. Confirm the SDK `<script>` block exists at the top of `<head>` in the built `index.html`, not just the source.

If a build step strips the SDK script, move it to a template/partial the
build tool will preserve (e.g. Vite's `index.html` at project root is copied
verbatim).

---

## 7. Submission checklist

When the above passes, the user can submit via the **Upload Game** button on
the Games tab:

- **URL submission:** paste the hosted URL, fill title/description, list the achievement IDs you wired up.
- **Zip submission:** upload the zip whose root is `index.html`.

Submissions enter `in_review`. A human approves before the game appears in
the public grid.

---

## 8. Common failure modes (and the fix)

| Symptom | Cause | Fix |
| --- | --- | --- |
| Iframe shows blank / green / white | Absolute asset paths | Set `base: './'` and rebuild |
| Routes 404 on refresh | `BrowserRouter` in sandbox | Switch to `HashRouter` |
| Achievements never fire | SDK script missing from built `index.html` | Move script to the source template, rebuild |
| Achievements fire but no BP awarded | User not logged in | BP is auth-only by design |
| Game state resets every load | Game writes to IndexedDB | Migrate to `localStorage` (bridged) |
