import { supabase } from './supabase.js';

// AI Advisors admin dashboard — all server-gated on is_admin() via RPC.
// The client never reads ai_reply_queue / ai_reply_spend / ai_* config directly.

export const fetchAiDashboard = async () => {
  const { data, error } = await supabase.rpc('admin_ai_dashboard');
  if (error) throw error;
  return data;
};

export const setAiConfig = async (key, value) => {
  const { error } = await supabase.rpc('admin_ai_set_config', {
    p_key: key,
    p_value: String(value),
  });
  if (error) throw error;
};

// Edit an advisor (bot) account's bio / avatar / banner / display name.
// Server-gated on is_admin() AND the target being a bot.
export const updateAdvisorProfile = async (targetId, { bio, avatarUrl, headerUrl, displayName }) => {
  const { error } = await supabase.rpc('admin_update_advisor_profile', {
    p_target: targetId,
    p_bio: bio ?? null,
    p_avatar_url: avatarUrl ?? null,
    p_header_url: headerUrl ?? null,
    p_display_name: displayName ?? null,
  });
  if (error) throw error;
};
