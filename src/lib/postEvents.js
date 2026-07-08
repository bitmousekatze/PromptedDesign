// Lightweight analytics event recording for posts.
//
// Impressions ("someone saw your post in a feed") are queued and flushed in
// batches so scrolling a feed costs one RPC, not one per card. Profile visits
// fire immediately. Both are best-effort: failures are swallowed - analytics
// must never break browsing.
import { supabase } from './supabase.js';

const FLUSH_MS = 4000;

const seenThisSession = new Set(); // post ids already counted this session
const pending = new Set();
let flushTimer = null;

async function flush() {
  flushTimer = null;
  if (!pending.size) return;
  const batch = [...pending].slice(0, 100);
  batch.forEach((id) => pending.delete(id));
  try {
    await supabase.rpc('record_post_impressions', { p_post_ids: batch });
  } catch (err) {
    console.debug('Impression tracking:', err?.message);
  }
  if (pending.size) flushTimer = setTimeout(flush, FLUSH_MS);
}

// Queue an impression for a post card that became visible. Deduped per session.
export function queuePostImpression(postId) {
  if (!postId || seenThisSession.has(postId)) return;
  seenThisSession.add(postId);
  pending.add(postId);
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}

// Record that someone navigated to the author's profile from this post.
export function recordProfileVisit(postId) {
  if (!postId) return;
  supabase
    .rpc('record_post_profile_visit', { p_post_id: postId })
    .then(undefined, (err) => console.debug('Profile-visit tracking:', err?.message));
}

// Shared IntersectionObserver: a card counts as "seen" once half of it is
// on screen. One observer for every card keeps feed scrolling cheap.
let observer = null;
const nodeToPost = new WeakMap();

function getObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const postId = nodeToPost.get(entry.target);
        if (postId) queuePostImpression(postId);
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.5 }
  );
  return observer;
}

// Attach impression tracking to a card element. Returns a cleanup function.
export function observeImpression(node, postId) {
  if (!node || !postId || seenThisSession.has(postId)) return () => {};
  const obs = getObserver();
  if (!obs) return () => {};
  nodeToPost.set(node, postId);
  obs.observe(node);
  return () => obs.unobserve(node);
}
