import { supabase } from './supabase.js';

export const TIER_COLORS = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  legendary: '#a855f7',
};

export const TIER_GLOW = {
  bronze: 'rgba(205, 127, 50, 0.35)',
  silver: 'rgba(192, 192, 192, 0.35)',
  gold: 'rgba(255, 215, 0, 0.4)',
  legendary: 'rgba(168, 85, 247, 0.45)',
};

export const TIER_RANK = { bronze: 1, silver: 2, gold: 3, legendary: 4 };

export const CATEGORY_LABELS = {
  all: 'All',
  build: 'Builds',
  discussion: 'Discussion',
  questions: 'Questions',
  tools: 'Tools',
  social: 'Social',
  engagement: 'Engagement',
  community: 'Community',
  comments: 'Comments',
  profile: 'Profile',
  special: 'Special',
};

export const CATEGORY_ORDER = [
  'all', 'build', 'discussion', 'questions', 'tools',
  'social', 'engagement', 'community', 'comments',
  'profile', 'special',
];

export async function fetchAchievementsWithProgress(userId) {
  if (!userId) {
    const { data, error } = await supabase
      .from('achievements')
      .select('*')
      .order('display_order');
    if (error) throw error;
    return (data || []).map((a) => ({
      ...a,
      progress: 0,
      unlocked_at: null,
      claimed_at: null,
    }));
  }

  const { data, error } = await supabase.rpc('get_user_achievements_with_progress', {
    p_user_id: userId,
  });
  if (error) throw error;
  return data || [];
}

export async function refreshMyAchievements() {
  const { data, error } = await supabase.rpc('refresh_my_achievements');
  if (error) throw error;
  return data || [];
}

// Claim builder points for an unlocked-but-unclaimed achievement.
// Server is idempotent - calling on an already-claimed achievement returns
// awarded_points = 0. Returns { claimed_id, awarded_points, claimed_at,
// new_total_points }.
export async function claimAchievement(achievementId) {
  const { data, error } = await supabase.rpc('claim_achievement', {
    p_achievement_id: achievementId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

// Convenience selector used by AchievementCard / detail sheet / Builder Rank
// section to decide which CTA to render.
export function getAchievementState(achievement) {
  if (!achievement) return 'locked';
  if (achievement.unlocked_at && !achievement.claimed_at) return 'unclaimed';
  if (achievement.unlocked_at) return 'claimed';
  return 'locked';
}

export async function fetchAllAchievements() {
  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .order('display_order');
  if (error) throw error;
  return data || [];
}

export async function fetchAchievementById(id) {
  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
