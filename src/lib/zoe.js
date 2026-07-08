// Data layer for Zoetrope ("Zoe") - Prompted's Pro livestreaming tab.
// Phase 1 = external video (Twitch / YouTube embed). Tables/RPCs ship in
// migration 20260620000004_zoe_livestreams. All writes go through SECURITY
// DEFINER RPCs; live_streams is public-readable so the banner works for guests.
import { supabase } from './supabase';

// ── Embed parsing ─────────────────────────────────────────────────────────────
// We never store a ready-made iframe URL: Twitch requires a `parent` param that
// equals the *current* host (prmpted.com in prod, localhost in dev), so we store
// a stable key (twitch channel slug / youtube video id) and rebuild the iframe
// src at render time via buildEmbedSrc().

// Pull a Twitch channel slug from a URL or a bare handle. Returns '' if none.
export function parseTwitchChannel(input) {
  if (!input) return '';
  const s = String(input).trim();
  const m = s.match(/(?:twitch\.tv\/)([A-Za-z0-9_]{2,40})/i);
  if (m) return m[1];
  // Bare handle (no URL).
  if (/^[A-Za-z0-9_]{2,40}$/.test(s)) return s;
  return '';
}

// Pull a YouTube video id from watch / youtu.be / live / embed URLs (or a bare id).
export function parseYouTubeId(input) {
  if (!input) return '';
  const s = String(input).trim();
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,        // watch?v=ID
    /youtu\.be\/([A-Za-z0-9_-]{11})/,   // youtu.be/ID
    /\/live\/([A-Za-z0-9_-]{11})/,      // /live/ID
    /\/embed\/([A-Za-z0-9_-]{11})/,     // /embed/ID
  ];
  for (const p of patterns) { const m = s.match(p); if (m) return m[1]; }
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return '';
}

// Parse a "go live" link into { platform, key } or { error }.
//   platform: 'twitch' | 'youtube', key: channel slug or video id.
export function parseStreamLink(platform, input) {
  if (platform === 'twitch') {
    const key = parseTwitchChannel(input);
    return key ? { platform, key } : { error: "That doesn't look like a Twitch channel. Paste twitch.tv/yourname." };
  }
  if (platform === 'youtube') {
    const key = parseYouTubeId(input);
    return key ? { platform, key } : { error: 'Paste the link to your YouTube live video (the watch?v=… URL).' };
  }
  return { error: 'Pick Twitch or YouTube.' };
}

// Build the iframe src for a live_streams row, given the current page host.
export function buildEmbedSrc(stream, hostname) {
  if (!stream?.embed_url) return null;
  const host = hostname || (typeof window !== 'undefined' ? window.location.hostname : 'prmpted.com');
  if (stream.platform === 'twitch') {
    return `https://player.twitch.tv/?channel=${encodeURIComponent(stream.embed_url)}&parent=${encodeURIComponent(host)}`;
  }
  if (stream.platform === 'youtube') {
    return `https://www.youtube.com/embed/${encodeURIComponent(stream.embed_url)}?autoplay=1`;
  }
  return null;
}

// The public-facing channel URL we link out to (and count clicks on).
export function channelWatchUrl(stream) {
  if (stream?.platform === 'twitch') return `https://twitch.tv/${stream.embed_url}`;
  if (stream?.platform === 'youtube') return `https://youtube.com/watch?v=${stream.embed_url}`;
  return null;
}

// ── Profile hydration (host_id → profiles, FK is to auth.users so we join by hand) ──
async function fetchProfilesByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, avatar_emoji, name_color, is_pro')
    .in('id', unique);
  if (error) throw error;
  const map = {};
  (data || []).forEach((p) => { map[p.id] = p; });
  return map;
}

// ── Reads ─────────────────────────────────────────────────────────────────────
// Every currently-live stream, newest first, with its host profile attached.
export async function fetchLiveStreams() {
  const { data, error } = await supabase
    .from('live_streams')
    .select('*')
    .eq('status', 'live')
    .order('started_at', { ascending: false });
  if (error) throw error;
  const profiles = await fetchProfilesByIds((data || []).map((s) => s.host_id));
  return (data || []).map((s) => ({ ...s, host: profiles[s.host_id] || null }));
}

export async function fetchStreamById(id) {
  if (!id) return null;
  const { data, error } = await supabase.from('live_streams').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const profiles = await fetchProfilesByIds([data.host_id]);
  return { ...data, host: profiles[data.host_id] || null };
}

// Current live viewer count (logged-in participants tracked in live_participants).
export async function fetchViewerCount(streamId) {
  if (!streamId) return 0;
  const { count, error } = await supabase
    .from('live_participants')
    .select('*', { count: 'exact', head: true })
    .eq('stream_id', streamId);
  if (error) return 0;
  return count || 0;
}

export async function fetchMyChannel(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from('creator_channels').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data || null;
}

// A host's recently-ended streams (simple "past streams" list).
export async function fetchPastStreams(limit = 12) {
  const { data, error } = await supabase
    .from('live_streams')
    .select('*')
    .eq('status', 'ended')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const profiles = await fetchProfilesByIds((data || []).map((s) => s.host_id));
  return (data || []).map((s) => ({ ...s, host: profiles[s.host_id] || null }));
}

// ── Writes (RPCs) ─────────────────────────────────────────────────────────────
export async function startLiveStream({ type = 'external_video', platform, title, embedKey, tags = null, notify = true }) {
  const { data, error } = await supabase.rpc('start_live_stream', {
    p_type: type,
    p_platform: platform || null,
    p_title: title,
    p_embed_url: embedKey || null,
    p_tags: tags,
    p_notify: notify,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function endLiveStream(streamId) {
  const { error } = await supabase.rpc('end_live_stream', { p_stream_id: streamId });
  if (error) throw error;
}

export async function connectChannel(platform, url) {
  const { data, error } = await supabase.rpc('connect_creator_channel', { p_platform: platform, p_url: url });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function joinStream(streamId) {
  const { error } = await supabase.rpc('join_live_stream', { p_stream_id: streamId });
  if (error) throw error;
}

export async function leaveStream(streamId) {
  const { error } = await supabase.rpc('leave_live_stream', { p_stream_id: streamId });
  if (error) throw error;
}

export async function bumpChannelClick(hostId) {
  try { await supabase.rpc('bump_channel_click', { p_host: hostId }); } catch { /* best-effort */ }
}

// ── Likes ───────────────────────────────────────────────────────────────────
// Toggle the current user's like on a stream. Returns the new liked state.
export async function toggleStreamLike(streamId) {
  const { data, error } = await supabase.rpc('toggle_stream_like', { p_stream_id: streamId });
  if (error) throw error;
  return !!data;
}

export async function fetchMyStreamLike(streamId, userId) {
  if (!streamId || !userId) return false;
  const { data, error } = await supabase
    .from('stream_likes').select('user_id')
    .eq('stream_id', streamId).eq('user_id', userId).maybeSingle();
  if (error) return false;
  return !!data;
}

// ── Live chat ─────────────────────────────────────────────────────────────────
// One brief profile (used to hydrate the author of a realtime-delivered message).
export async function fetchProfileBrief(id) {
  const map = await fetchProfilesByIds([id]);
  return map[id] || null;
}

export async function fetchStreamMessages(streamId, limit = 100) {
  if (!streamId) return [];
  const { data, error } = await supabase
    .from('live_stream_messages').select('*')
    .eq('stream_id', streamId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  const profiles = await fetchProfilesByIds((data || []).map((m) => m.user_id));
  return (data || []).map((m) => ({ ...m, author: profiles[m.user_id] || null }));
}

export async function postStreamMessage(streamId, content) {
  const { data, error } = await supabase.rpc('post_stream_message', { p_stream_id: streamId, p_content: content });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function deleteStreamMessage(messageId) {
  const { error } = await supabase.rpc('delete_stream_message', { p_message_id: messageId });
  if (error) throw error;
}

// ── Leaderboard Boost ($2.99) ───────────────────────────────────────────────
// A live host can pay $2.99 to notify the top 67 Builder-Points users (whose
// live alerts are fully on) that they're live - reaching beyond their followers.
//
// Flow: boostCheckout() opens Stripe Checkout; on return the page calls
// verifyBoost(sessionId), which confirms payment server-side and fans out the
// notifications. The api/ endpoints proxy to prod (vite.config), so they must be
// deployed before this works locally.

// Open Stripe Checkout for a boost. Returns the hosted checkout URL.
export async function boostCheckout({ userId, username, streamId }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const r = await fetch('/api/boost-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, username, streamId, origin }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || 'Could not start checkout.');
  return data; // { url, id }
}

// Confirm a returned Stripe session and fan out the boost. Returns the count notified.
export async function verifyBoost(sessionId) {
  const r = await fetch('/api/boost-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || 'Could not verify the boost.');
  return data; // { ok, notified }
}

// Admin-only FREE test path: fan out the boost without a charge. Returns count.
export async function adminTestBoost(streamId) {
  const { data, error } = await supabase.rpc('admin_test_boost', { p_stream_id: streamId });
  if (error) throw error;
  return data || 0;
}
