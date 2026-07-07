# Prompted — Design Test Copy

Hi chlo! 👋 This is a working copy of the Prompted website frontend for design
experiments.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). Log in with your
normal Prompted account — the app talks to the real backend the same way the
live site does, so your profile, posts, and DMs all work.

## Landing page demo

`landing-preview.html` is a self-contained mockup of the new landing page —
just double-click it (no server needed). It's the design we're playing with.

## Where things live

- Pages: `src/pages/`
- Components: `src/components/`
- Global styles: `src/appStyles.css`
- Static assets: `public/`

## Notes

- **This repo has no deploy access.** Nothing you change here can affect the
  live site — go wild.
- A few things won't work locally because they run on our servers: Stripe
  checkout, push notifications, and the Cafeteria GIF picker. Everything else
  should behave like production.
