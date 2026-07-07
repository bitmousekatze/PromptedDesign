// X (Twitter) tweet embedding for the Memes tab.
//
// Mirrors the lib/zoe.js philosophy: we never store a ready-made iframe src.
// We store the canonical status URL the user pasted, parse out the numeric
// tweet id, and rebuild the platform.twitter.com embed src at render time. That
// keeps the stored value human-readable and lets us change embed params
// (theme / width) later without a data migration.

// Pull the numeric tweet id from an x.com / twitter.com status URL (or a bare
// id). Handles mobile.twitter.com, query strings (?s=20), and /statuses/.
export function parseTweetId(input) {
  if (!input) return '';
  const s = String(input).trim();
  const m = s.match(/(?:twitter\.com|x\.com)\/[^/]+\/status(?:es)?\/(\d{5,25})/i);
  if (m) return m[1];
  // Bare numeric id.
  if (/^\d{5,25}$/.test(s)) return s;
  return '';
}

// True if the input looks like a tweet we can embed.
export function isTweetUrl(input) {
  return !!parseTweetId(input);
}

// Build the embeddable iframe src for a tweet id. platform.twitter.com/embed is
// X's official, iframe-able single-tweet renderer — no global widgets.js script
// is loaded into the app, so X can't track every page view.
export function buildTweetEmbedSrc(tweetId, { theme = 'dark' } = {}) {
  if (!tweetId) return null;
  const params = new URLSearchParams({
    id: tweetId,
    theme,            // 'dark' | 'light'
    dnt: 'true',      // do-not-track: don't personalize/track viewers
  });
  return `https://platform.twitter.com/embed/Tweet.html?${params.toString()}`;
}

// The public-facing tweet URL we link out to.
export function tweetWatchUrl(tweetId) {
  return tweetId ? `https://twitter.com/i/status/${tweetId}` : null;
}

// ── Instagram ────────────────────────────────────────────────────────────────
// Pull the post/reel/tv shortcode from an instagram.com URL. Returns
// { kind: 'p'|'reel'|'tv', code } or null. Same store-URL / rebuild-embed-at-
// render approach as tweets.
export function parseInstagram(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (!m) return null;
  const kind = m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase();
  return { kind, code: m[2] };
}

// Instagram's official iframe embed endpoint (no embeds.js script needed).
export function buildInstagramEmbedSrc(ig) {
  if (!ig?.code) return null;
  const path = ig.kind === 'reel' ? 'reel' : ig.kind === 'tv' ? 'tv' : 'p';
  return `https://www.instagram.com/${path}/${encodeURIComponent(ig.code)}/embed/`;
}

// True if the URL is something we can embed (X tweet or Instagram post/reel).
export function isEmbeddable(input) {
  return !!parseTweetId(input) || !!parseInstagram(input);
}
