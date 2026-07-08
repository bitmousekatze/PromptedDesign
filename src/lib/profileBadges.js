import { supabase } from './supabase.js';

// Advances the signed-in user's login streak (once/day). Engagement counter only.
export const touchLoginStreak = async () => {
  const { data, error } = await supabase.rpc('touch_login_streak');
  if (error) throw error;
  return data;
};

// Everything the collection / loot-box UI needs: slots, owned, selected, packs left.
export const fetchIconCollection = async () => {
  const { data, error } = await supabase.rpc('icon_collection_self');
  if (error) throw error;
  return data;
};

// Open one loot pack - 6 random non-duplicate icons. Returns { ok, pulled, remaining_today, ... }.
export const openIconPack = async () => {
  const { data, error } = await supabase.rpc('open_icon_pack');
  if (error) throw error;
  return data;
};

// Set which unlocked icon slugs fill your slots (free 3 / Pro 10; must own each).
export const setProfileIconBadges = async (slugs) => {
  const { error } = await supabase.rpc('set_profile_icon_badges', { p_slugs: slugs });
  if (error) throw error;
};
