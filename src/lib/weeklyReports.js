// ============================================
// WEEKLY SOCIAL MEDIA REPORT - service layer
// ============================================
// Backs src/pages/WeeklyReportPage.jsx.
// Table: weekly_reports · RPC: submit_weekly_report · Edge fn: report-extract

// The platforms shown on the form (id used for field keys, name used in exports).
export const REPORT_PLATFORMS = [
  { id: 'insta', name: 'Instagram',  emoji: '📷', canon: 'instagram' },
  { id: 'fb',    name: 'Facebook',   emoji: '👥', canon: 'facebook' },
  { id: 'tw',    name: 'Twitter/X',  emoji: '🐦', canon: 'twitter' },
  { id: 'tt',    name: 'TikTok',     emoji: '🎵', canon: 'tiktok' },
  { id: 'li',    name: 'LinkedIn',   emoji: '💼', canon: 'linkedin' },
  { id: 'oth',   name: 'Other',      emoji: '➕', canon: null },
];

/**
 * Build the structured report object from the flat field map `f`.
 * Mirrors the original Weekly_Social_Media_Report.html export shape.
 */
export function buildReportData(f) {
  const v = (id) => f[id] || '';
  return {
    weekOf: v('weekOf'), reportDate: v('reportDate'),
    manager: v('managerName'), email: v('managerEmail'),
    platforms: Object.fromEntries(REPORT_PLATFORMS.map((p) => [p.name, {
      posts: v(`${p.id}_posts`), topics: v(`${p.id}_topics`),
      views: v(`${p.id}_views`), engagement: v(`${p.id}_engagement`),
    }])),
    bestPost:  { link: v('best_post_link'),  views: v('best_post_views'),  why: v('best_post_why') },
    worstPost: { link: v('worst_post_link'), views: v('worst_post_views'), why: v('worst_post_why') },
    growth: {
      followersStart: v('followers_start'), followersEnd: v('followers_end'),
      engagementStart: v('engagement_rate_start'), engagementEnd: v('engagement_rate_end'),
      newFollowers: v('new_followers'), demographics: v('demographics'),
    },
    wentWell: v('went_well'), challenges: v('challenges'),
    features: [1, 2, 3].map((n) => ({
      name: v(`feature${n}_name`), priority: v(`feature${n}_priority`),
      for: v(`feature${n}_for`), desc: v(`feature${n}_desc`),
    })),
    actionPlan: v('action_plan'), notes: v('additional_notes'),
  };
}

/** Plain-text version of the report (used as the DM body preview / quick read). */
export function buildSummaryText(f) {
  const v = (id) => f[id] || '';
  const fChange = (parseFloat(v('followers_end')) || 0) - (parseFloat(v('followers_start')) || 0);
  const plat = REPORT_PLATFORMS.map((p) =>
    `- ${p.name}: ${v(`${p.id}_posts`) || '0'} posts, ${v(`${p.id}_views`) || '0'} views, ${v(`${p.id}_engagement`) || '0'} engagement. Topics: ${v(`${p.id}_topics`) || '-'}`
  ).join('\n');
  const feats = [1, 2, 3].map((n) =>
    `${n}. ${v(`feature${n}_name`) || '-'} (Priority: ${v(`feature${n}_priority`) || '?'}, For: ${v(`feature${n}_for`) || '?'})\n   ${v(`feature${n}_desc`) || ''}`
  ).join('\n');
  return `PROMPTED WEEKLY SOCIAL MEDIA REPORT
Week of: ${v('weekOf') || '-'}
Manager: ${v('managerName') || '-'}

POST ACTIVITY:
${plat}

BEST POST: ${v('best_post_link') || '-'} - ${v('best_post_views') || '0'} views
WHY: ${v('best_post_why') || '-'}

WORST POST: ${v('worst_post_link') || '-'} - ${v('worst_post_views') || '0'} views
WHY: ${v('worst_post_why') || '-'}

FOLLOWERS: ${v('followers_start') || '0'} → ${v('followers_end') || '0'} (${fChange >= 0 ? '+' : ''}${fChange})
NEW FOLLOWERS: ${v('new_followers') || '0'}
ENGAGEMENT RATE: ${v('engagement_rate_start') || '0'}% → ${v('engagement_rate_end') || '0'}%
DEMOGRAPHICS: ${v('demographics') || '-'}

WHAT WENT WELL:
${v('went_well') || '-'}

CHALLENGES:
${v('challenges') || '-'}

ACTION PLAN (how management/devs can help next week):
${v('action_plan') || '-'}

FEATURE REQUESTS:
${feats}

NOTES:
${v('additional_notes') || '-'}`.trim();
}

/**
 * Map the canonical JSON returned by report-extract back into the flat field map.
 * Only non-empty / non-null values overwrite existing fields.
 */
export function mergeExtracted(prev, extracted) {
  const next = { ...prev };
  const put = (id, val) => {
    if (val === null || val === undefined || val === '') return;
    next[id] = String(val);
  };
  const plats = extracted?.platforms || {};
  for (const p of REPORT_PLATFORMS) {
    if (!p.canon) continue;
    const d = plats[p.canon];
    if (!d) continue;
    put(`${p.id}_posts`, d.posts);
    put(`${p.id}_views`, d.views);
    put(`${p.id}_engagement`, d.engagement);
    put(`${p.id}_topics`, d.topics);
  }
  const g = extracted?.growth || {};
  put('followers_start', g.followersStart);
  put('followers_end', g.followersEnd);
  put('engagement_rate_start', g.engagementStart);
  put('engagement_rate_end', g.engagementEnd);
  put('new_followers', g.newFollowers);
  put('demographics', g.demographics);
  const b = extracted?.bestPost || {};
  put('best_post_link', b.link); put('best_post_views', b.views); put('best_post_why', b.why);
  const w = extracted?.worstPost || {};
  put('worst_post_link', w.link); put('worst_post_views', w.views); put('worst_post_why', w.why);
  put('went_well', extracted?.wentWell);
  put('challenges', extracted?.challenges);
  put('action_plan', extracted?.actionPlan);
  put('additional_notes', extracted?.notes);
  return next;
}

/**
 * Auto-fill from a screenshot / pasted text / URL via the report-extract edge fn.
 * @param payload { mode: 'image'|'text'|'url', image?, mediaType?, text?, url? }
 * @returns { data, error, loginWall }
 */
export async function extractAnalytics(supabase, payload) {
  const { data, error } = await supabase.functions.invoke('report-extract', { body: payload });
  if (error) {
    // Surface the function's JSON error message when present.
    let msg = error.message || 'Extraction failed';
    try { const ctx = await error.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* ignore */ }
    return { data: null, error: msg, loginWall: false };
  }
  if (data?.error) return { data: null, error: data.error, loginWall: false };
  const extracted = data?.data || {};
  return { data: extracted, error: null, loginWall: !!extracted._loginWall };
}

/**
 * Submit the report: persists it and DMs each recipient a download link.
 * @returns { id, error }
 */
export async function submitWeeklyReport(supabase, { data, summary, recipients }) {
  const { data: id, error } = await supabase.rpc('submit_weekly_report', {
    p_data: data,
    p_summary: summary,
    p_recipient_usernames: recipients,
  });
  if (error) return { id: null, error: error.message || 'Could not submit report' };
  return { id, error: null };
}

/** Fetch a saved report by id (RLS lets only the author/recipients/admins read it). */
export async function fetchWeeklyReport(supabase, id) {
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('id, created_by, week_of, report_date, manager_name, manager_email, data, summary_text, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) return { report: null, error: error.message };
  return { report: data, error: null };
}
