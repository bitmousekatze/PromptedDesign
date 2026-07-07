import { supabase } from './supabase';

// ============================================================
// Custom badges data layer
// ------------------------------------------------------------
// Badges are admin-granted (or auto-granted for Pro). A user can
// hold several but displays only one (profiles.displayed_badge).
// Rendering across the app uses a synchronous lookup map keyed by
// lowercased username — mirroring the old VERIFIED_USERS pattern —
// so badge components can be drop-in with no query plumbing.
// ============================================================

// username(lowercased) -> array of badge objects { slug, label, description,
// icon, color, icon_url?, text_color? }. A user can display up to two badges
// (e.g. the Pro shield + the Spotlight gem), via displayed_badge + displayed_badge_2.
let DISPLAYED_BADGES = {};
let loaded = false;

// All badges a user displays (0–2), in slot order. Primary first.
export const getDisplayedBadges = (username) => {
  if (!username) return [];
  return DISPLAYED_BADGES[String(username).toLowerCase()] || [];
};

// Back-compat single-badge accessor — returns the primary displayed badge.
export const getDisplayedBadge = (username) => {
  const arr = getDisplayedBadges(username);
  return arr.length ? arr[0] : null;
};

export const badgesLoaded = () => loaded;

// Load every user who is displaying at least one badge, resolved against the
// catalog. The result set is small (only users with a displayed_badge set).
// Per-user overrides (custom color / hover label / hover-text color / icon) live
// on the user_custom_badges grant row and are layered on top, per badge.
export const loadDisplayedBadges = async () => {
  // Catalog (slug -> def). Small, fully cacheable; lets us resolve both slots
  // without a second FK embed.
  const { data: catalog, error: cErr } = await supabase
    .from('custom_badges')
    .select('id, slug, label, description, icon, color');
  if (cErr) {
    console.warn('[badges] failed to load badge catalog', cErr);
    return DISPLAYED_BADGES;
  }
  const bySlug = {};
  for (const c of catalog || []) bySlug[c.slug] = c;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, displayed_badge, displayed_badge_2')
    .or('displayed_badge.not.is.null,displayed_badge_2.not.is.null');

  if (error) {
    console.warn('[badges] failed to load displayed badges', error);
    return DISPLAYED_BADGES;
  }

  const map = {};
  const userIds = [];
  for (const row of data || []) {
    if (!row.username) continue;
    const slugs = [row.displayed_badge, row.displayed_badge_2].filter(Boolean);
    const badges = [];
    for (const slug of slugs) {
      const def = bySlug[slug];
      if (def) badges.push({ ...def, _userId: row.id });
    }
    if (!badges.length) continue;
    map[row.username.toLowerCase()] = badges;
    userIds.push(row.id);
  }

  // Layer per-user grant overrides onto each badge a user displays.
  if (userIds.length) {
    const { data: grants, error: gErr } = await supabase
      .from('user_custom_badges')
      .select('user_id, badge_id, label_override, color_override, icon_url_override, text_color_override, custom_badges:badge_id (slug)')
      .in('user_id', userIds);

    if (gErr) {
      console.warn('[badges] failed to load badge overrides', gErr);
    } else {
      // Index overrides by `${user_id}:${slug}` for quick lookup.
      const overrides = {};
      for (const g of grants || []) {
        if (!g.custom_badges) continue;
        overrides[`${g.user_id}:${g.custom_badges.slug}`] = g;
      }
      for (const key of Object.keys(map)) {
        for (const b of map[key]) {
          const ov = overrides[`${b._userId}:${b.slug}`];
          if (!ov) continue;
          if (ov.label_override) { b.label = ov.label_override; b.description = null; }
          if (ov.color_override) b.color = ov.color_override;
          if (ov.icon_url_override) b.icon_url = ov.icon_url_override;
          if (ov.text_color_override) b.text_color = ov.text_color_override;
        }
      }
    }
  }

  DISPLAYED_BADGES = map;
  loaded = true;
  try { window.dispatchEvent(new Event('badges-loaded')); } catch {}
  return DISPLAYED_BADGES;
};

// Full catalog (for pickers / admin UI)
export const fetchBadgeCatalog = async () => {
  const { data, error } = await supabase
    .from('custom_badges')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
};

// Badges a specific user holds (slugs available to display).
// Includes any per-user overrides so admin UIs can prefill them.
export const fetchUserBadges = async (userId) => {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('user_custom_badges')
    .select('badge_id, label_override, color_override, icon_url_override, text_color_override, custom_badges:badge_id (slug, label, description, icon, color)')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || [])
    .filter((r) => r.custom_badges)
    .map((r) => ({
      ...r.custom_badges,
      badge_id: r.badge_id,
      label_override: r.label_override,
      color_override: r.color_override,
      icon_url_override: r.icon_url_override,
      text_color_override: r.text_color_override,
    }));
};

// ---- Admin helpers --------------------------------------------------
export const grantBadge = async (userId, badgeId, grantedBy, overrides = {}) => {
  const { error } = await supabase
    .from('user_custom_badges')
    .insert({
      user_id: userId,
      badge_id: badgeId,
      granted_by: grantedBy || null,
      label_override: overrides.label_override || null,
      color_override: overrides.color_override || null,
      icon_url_override: overrides.icon_url_override || null,
    });
  if (error) throw error;
};

// Update the per-user color / hover label / icon on a badge the user holds.
export const setBadgeOverrides = async (userId, badgeId, overrides = {}) => {
  const { error } = await supabase
    .from('user_custom_badges')
    .update({
      label_override: overrides.label_override || null,
      color_override: overrides.color_override || null,
      icon_url_override: overrides.icon_url_override || null,
    })
    .eq('user_id', userId)
    .eq('badge_id', badgeId);
  if (error) throw error;
  await loadDisplayedBadges();
};

export const revokeBadge = async (userId, badgeId) => {
  const { error } = await supabase
    .from('user_custom_badges')
    .delete()
    .eq('user_id', userId)
    .eq('badge_id', badgeId);
  if (error) throw error;
};

// Search users by username/display name (admin panel)
export const searchUsersForAdmin = async (term) => {
  const q = (term || '').trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_emoji, avatar_url, is_pro')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(15);
  if (error) throw error;
  return data || [];
};

// Admin-only: toggle a user's Pro membership (flips is_pro via RPC; the DB
// trigger then auto-grants/revokes the Pro badge).
export const adminSetPro = async (targetUserId, value) => {
  const { error } = await supabase.rpc('admin_set_pro', {
    target_user: targetUserId,
    value,
  });
  if (error) throw error;
  await loadDisplayedBadges();
};

// Pro self-service: customize the color / hover label on a badge the
// signed-in Pro member holds. Enforced server-side via SECURITY DEFINER RPC.
export const updateOwnBadgeOverrides = async (badgeId, label, color, iconUrl, textColor) => {
  const { error } = await supabase.rpc('update_own_badge_overrides', {
    p_badge_id: badgeId,
    p_label: label || null,
    p_color: color || null,
    p_icon_url: iconUrl || null,
    p_text_color: textColor || null,
  });
  if (error) throw error;
  await loadDisplayedBadges();
};

// Set the badge a user chooses to display (must be one they hold;
// enforced by a DB trigger). Pass null to clear.
export const setDisplayedBadge = async (userId, slug) => {
  const { error } = await supabase
    .from('profiles')
    .update({ displayed_badge: slug || null })
    .eq('id', userId);
  if (error) throw error;
  await loadDisplayedBadges();
};
