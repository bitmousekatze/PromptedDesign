import { supabase } from './supabase';

// ============================================================
// Admin stats & system health — client-side metrics only.
// All reads use the anon key (RLS allows public reads), so there
// are no secrets here. Deeper platform metrics (advisors, logs,
// Vercel deploys) would require a serverless proxy with tokens.
// ============================================================

const countOf = async (table, build) => {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (build) q = build(q);
  const { count, error } = await q;
  if (error) return 0;
  return count || 0;
};

// ---- Per-user statistics -------------------------------------------
export const fetchUserStats = async (userId) => {
  if (!userId) return null;

  const [
    profileRes,
    posts, comments, workflows,
    followers, following,
    likesGiven, saved,
    achUnlocked, achClaimed,
  ] = await Promise.all([
    supabase.from('profiles')
      .select('builder_points, created_at, is_pro, pro_since')
      .eq('id', userId).single(),
    countOf('posts',     (q) => q.eq('user_id', userId)),
    countOf('comments',  (q) => q.eq('user_id', userId)),
    countOf('workflows', (q) => q.eq('user_id', userId)),
    countOf('follows',   (q) => q.eq('following_id', userId)), // people following them
    countOf('follows',   (q) => q.eq('follower_id', userId)),  // people they follow
    countOf('likes',     (q) => q.eq('user_id', userId)),
    countOf('saved_posts', (q) => q.eq('user_id', userId)),
    countOf('user_achievements', (q) => q.eq('user_id', userId)),
    countOf('user_achievements', (q) => q.eq('user_id', userId).not('claimed_at', 'is', null)),
  ]);

  // Likes received across their posts (bounded fetch of post ids)
  let likesReceived = 0;
  const { data: postIds } = await supabase
    .from('posts').select('id').eq('user_id', userId).limit(1000);
  if (postIds && postIds.length) {
    likesReceived = await countOf('likes', (q) =>
      q.in('post_id', postIds.map((p) => p.id)));
  }

  const profile = profileRes.data || {};
  return {
    builderPoints: profile.builder_points || 0,
    joined: profile.created_at,
    isPro: !!profile.is_pro,
    proSince: profile.pro_since,
    posts, comments, workflows,
    followers, following,
    likesGiven, likesReceived,
    saved,
    achievementsUnlocked: achUnlocked,
    achievementsClaimed: achClaimed,
  };
};

// ---- System health -------------------------------------------------
// Event types tracked for the activity windows. Each maps to a table
// with a created_at column we can filter on.
const ACTIVITY_METRICS = [
  { key: 'users',       label: 'New users',   table: 'profiles' },
  { key: 'posts',       label: 'Posts',       table: 'posts' },
  { key: 'comments',    label: 'Comments',    table: 'comments' },
  { key: 'likes',       label: 'Likes',       table: 'likes' },
  { key: 'follows',     label: 'Follows',     table: 'follows' },
  { key: 'workflows',   label: 'Workflows',   table: 'workflows' },
  { key: 'communities', label: 'Communities', table: 'communities' },
];

const WINDOWS = [
  { key: '1h',  ms: 60 * 60 * 1000 },
  { key: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d',  ms: 7 * 24 * 60 * 60 * 1000 },
];

export const fetchSystemHealth = async () => {
  const now = Date.now();

  // Connectivity + latency ping
  const t0 = performance.now();
  const { error: pingErr } = await supabase
    .from('profiles').select('id', { count: 'exact', head: true });
  const latencyMs = Math.round(performance.now() - t0);

  // Totals (one count per metric)
  const totalPromises = ACTIVITY_METRICS.map((m) => countOf(m.table));

  // Activity matrix: one count per metric per window
  const activityJobs = [];
  for (const m of ACTIVITY_METRICS) {
    for (const w of WINDOWS) {
      const since = new Date(now - w.ms).toISOString();
      activityJobs.push(
        countOf(m.table, (q) => q.gte('created_at', since))
          .then((count) => ({ metric: m.key, window: w.key, count }))
      );
    }
  }

  const [totalsArr, activityArr] = await Promise.all([
    Promise.all(totalPromises),
    Promise.all(activityJobs),
  ]);

  const totals = {};
  ACTIVITY_METRICS.forEach((m, i) => { totals[m.key] = totalsArr[i]; });

  // Shape: activity[metricKey][windowKey] = count
  const activity = {};
  for (const m of ACTIVITY_METRICS) activity[m.key] = {};
  for (const r of activityArr) activity[r.metric][r.window] = r.count;

  return {
    online: !pingErr,
    latencyMs,
    metrics: ACTIVITY_METRICS,
    windows: WINDOWS.map((w) => w.key),
    totals,
    activity,
    checkedAt: new Date(),
  };
};
