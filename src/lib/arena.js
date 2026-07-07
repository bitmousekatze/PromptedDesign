import { supabase } from './supabase';

export async function getArenaCategories() {
  const { data, error } = await supabase
    .from('arena_categories')
    .select('*')
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getArenaLeaderboard() {
  const { data, error } = await supabase
    .from('arena_leaderboard')
    .select('*');
  if (error) throw error;
  return data || [];
}

export async function getUserArenaVotes(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('arena_votes')
    .select('category_id, tool_id')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

export async function castArenaVote({ userId, categoryId, toolId }) {
  if (!userId) throw new Error('Must be signed in to vote');
  const { error } = await supabase
    .from('arena_votes')
    .insert({ user_id: userId, category_id: categoryId, tool_id: toolId });
  if (error && !error.message?.includes('duplicate')) throw error;
}

export async function removeArenaVote({ userId, categoryId, toolId }) {
  if (!userId) throw new Error('Must be signed in to vote');
  const { error } = await supabase
    .from('arena_votes')
    .delete()
    .eq('user_id', userId)
    .eq('category_id', categoryId)
    .eq('tool_id', toolId);
  if (error) throw error;
}

export function groupLeaderboardByCategory(rows) {
  const byCategory = new Map();
  for (const row of rows) {
    if (!byCategory.has(row.category_id)) byCategory.set(row.category_id, []);
    byCategory.get(row.category_id).push(row);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => b.total_votes - a.total_votes || a.tool_name.localeCompare(b.tool_name));
  }
  return byCategory;
}

export function getToolCategoryRanks(rows, toolId) {
  const grouped = groupLeaderboardByCategory(rows);
  const ranks = [];
  for (const [categoryId, list] of grouped.entries()) {
    const idx = list.findIndex(r => r.tool_id === toolId);
    if (idx === -1) continue;
    ranks.push({
      category_id: categoryId,
      category_name: list[0].category_name,
      category_emoji: list[0].category_emoji,
      rank: idx + 1,
      total_tools: list.length,
      total_votes: list[idx].total_votes,
    });
  }
  ranks.sort((a, b) => a.rank - b.rank || b.total_votes - a.total_votes);
  return ranks;
}

// Maps a community/field category id (e.g. "field_work_developers") to the
// arena category id ("coding") whose leaderboard should be surfaced on that
// category page. Pages without an entry here just don't render the widget.
export const COMMUNITY_TO_ARENA_CATEGORY = {
  field_work_developers: 'coding',
  field_work_designers: 'image-generation',
  field_work_writers: 'writing',
  field_work_marketers: 'marketing',
  field_work_sales: 'marketing',
  field_work_small_business: 'marketing',
  field_work_managers: 'writing',
  field_work_teachers: 'writing',
  field_work_researchers: 'research',
  field_work_legal: 'reasoning',
  field_work_finance: 'data-analysis',
  field_work_healthcare: 'reasoning',
  field_school_college: 'reasoning',
  field_school_highschool: 'reasoning',
  field_school_study: 'reasoning',
  field_school_essays: 'writing',
  field_school_testprep: 'reasoning',
  field_life_hobbies: 'image-generation',
  field_life_money: 'data-analysis',
  field_life_travel: 'research',
  field_life_health: 'reasoning',
  field_life_everyday: 'value',
};

export function getArenaCategoryForCommunityCategory(communityCategoryId) {
  if (!communityCategoryId) return null;
  return COMMUNITY_TO_ARENA_CATEGORY[communityCategoryId] || null;
}

// Brand color per AI tool, keyed by lowercased display name. Used everywhere
// a tool is visually labeled in arena surfaces (ticker, leader badge,
// category-page widget). Tools without an entry fall back to a neutral grey.
export const TOOL_BRAND_COLORS = {
  'claude': '#D97757',           // Anthropic coral/orange
  'chatgpt': '#10A37F',          // OpenAI green
  'codex': '#10A37F',            // OpenAI green (same family)
  'gemini': '#4796E3',           // Google Gemini blue
  'grok': '#E8E8E8',             // xAI white/silver
  'kimi': '#6E92F0',             // Moonshot moonlight blue
  'lovable': '#E5448C',          // Lovable pink
  'replit': '#F26207',           // Replit orange
  'qwen': '#7C5CFF',             // Alibaba Qwen purple
  'nano banana pro': '#FFE135',  // Banana yellow (literal brand)
  'devin': '#C9A876',            // Cognition Labs warm gold
  'ollama': '#6FCF97',           // Local / open-source — "free & runs on your machine"
};

export function getToolBrandColor(name) {
  if (!name) return null;
  return TOOL_BRAND_COLORS[name.trim().toLowerCase()] || null;
}

// Flagship model label per tool, keyed by lowercased display name. Appended to
// the tool name in arena rankings so the leaderboard reads "Claude Opus 4.7"
// instead of just "Claude". Tools where the model name and tool name are the
// same (e.g. Nano Banana Pro), or where there's no obvious flagship version
// (e.g. Lovable), should be left out of this map. Edit the strings here as
// new flagship models ship — model versions move quickly.
export const TOOL_MODEL_LABELS = {
  'claude': 'Opus 4.8',
  'chatgpt': '5.5',
  'codex': '5',
  'gemini': '3',
  'grok': '4',
  'kimi': 'K2',
  'qwen': '3',
  'replit': 'Agent 3',
};

export function getToolModelLabel(name) {
  if (!name) return null;
  return TOOL_MODEL_LABELS[name.trim().toLowerCase()] || null;
}

// Full label for a tool in arena rankings — the tool brand plus its current
// flagship model, e.g. "Claude" → "Claude Opus 4.7". Tools without a model
// label fall back to just the tool name. Use this anywhere a leaderboard or
// rank surface displays a tool by name; do not use it for brand-color lookups
// (those still want the raw tool name).
export function getToolDisplayLabel(name) {
  if (!name) return name;
  const model = getToolModelLabel(name);
  return model ? `${name} ${model}` : name;
}

// Returns the text color (white or near-black) that gives the best contrast
// when laid over a solid brand-color background. Used for the leader badges.
export function getReadableTextOn(hex) {
  if (!hex) return '#FFFFFF';
  const m = hex.replace('#', '');
  if (m.length !== 6) return '#FFFFFF';
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? '#161616' : '#FFFFFF';
}
