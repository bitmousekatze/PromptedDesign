// Shared module-level state and helpers extracted verbatim from App.jsx
// during the post-experience component split (July 2026). Imported by both
// App.jsx and the extracted components — no behavior change.
import { createContext, useContext } from 'react';
import { buildPostPath } from './postUrl.js';

// ============================================
// CONTEXT FOR GLOBAL STATE
// ============================================
export const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const ToastContext = createContext({});

export const useToast = () => useContext(ToastContext);

// AI tool names and ID-to-name map are populated dynamically from the ai_tools table.
// They are module-level variables so all components importing them can reference them.
export let AI_TOOL_NAMES = [];
export let AI_TOOL_ID_TO_NAME = {};
export let AI_TOOLS = []; // Full tool objects {id, name}
export let AI_TOOL_NAME_TO_ID = {};

// Repopulates the module-level AI tool maps. Lives here (rather than in
// App.jsx's loadAiTools) because ES module `let` exports can only be
// reassigned from their own module; importers see the live bindings.
export const setAiToolData = (data) => {
  AI_TOOL_NAMES = data.map(t => t.name);
  AI_TOOLS = data;
  AI_TOOL_ID_TO_NAME = {};
  AI_TOOL_NAME_TO_ID = {};
  data.forEach(t => {
    AI_TOOL_ID_TO_NAME[t.id] = t.name;
    AI_TOOL_NAME_TO_ID[t.name] = t.id;
  });
};

export const TOOL_MODELS = {
  'chatgpt': ['GPT-5.5', 'GPT-5.4', 'GPT-5.3', 'GPT-5.2'],
  'codex': ['GPT-5.3-Codex', 'GPT-5.2-Codex', 'GPT-5.1-Codex'],
  'claude': ['Opus 4.8', 'Opus 4.7', 'Opus 4.6', 'Sonnet 4.6', 'Haiku 4.5', 'Opus 4.5', 'Sonnet 4.5'],
  'gemini': ['3.5 Flash', '3 Pro', '3 Deepthink'],
  'grok': ['4.2', '4.1'],
  'kimi': ['K2.5', 'K2'],
  'meta-ai': ['Llama 4 Scout', 'Llama 4 Maverick'],
  'qwen': ['Qwen3.5-397B-A17B', 'Qwen3.5-Plus', 'Qwen3.5-122B-A10B', 'Qwen3.5-35B-A3B', 'Qwen3.5-27B', 'Qwen3.5-Flash']
};

export const normalizeToolKey = (value = '') => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const getModelsForTool = (toolNameOrId) => {
  if (!toolNameOrId) return [];
  const normalized = normalizeToolKey(toolNameOrId);
  const aliases = {
    'meta': 'meta-ai',
    'meta-ai': 'meta-ai'
  };
  return TOOL_MODELS[aliases[normalized] || normalized] || [];
};

export const getPostToolModelMap = (post) => {
  if (!post?.tool_models) return {};
  if (typeof post.tool_models === 'string') {
    try {
      return JSON.parse(post.tool_models) || {};
    } catch {
      return {};
    }
  }
  if (typeof post.tool_models === 'object') return post.tool_models;
  return {};
};

export const getModelForTool = (post, toolId, toolName) => {
  const map = getPostToolModelMap(post);
  const candidates = [
    toolId,
    toolName,
    normalizeToolKey(toolId || ''),
    normalizeToolKey(toolName || ''),
    AI_TOOL_ID_TO_NAME[toolId],
    (AI_TOOL_ID_TO_NAME[toolId] || '').toLowerCase(),
    (toolName || '').toLowerCase()
  ].filter(Boolean);

  for (const key of candidates) {
    if (map[key]) return map[key];
  }

  return null;
};

export const getToolDisplayName = (toolId) => {
  return AI_TOOL_ID_TO_NAME[toolId] || toolId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

// Robust clipboard copy. navigator.clipboard.writeText silently rejects in
// non-secure contexts and some in-app browsers, so fall back to the legacy
// textarea + execCommand path. Returns true only when the text actually
// reached the clipboard, so callers can decide whether to show a "copied"
// toast or a manual-copy fallback instead of lying to the user.
export const copyToClipboard = async (text) => {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand
  }
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

export const normalizeToolLabel = (tool) => (tool || '').trim();

export const normalizeToolList = (tools = []) => {
  const seen = new Set();
  const result = [];
  tools.forEach((tool) => {
    const normalized = normalizeToolLabel(tool);
    if (!normalized) return;
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    result.push(normalized);
  });
  return result;
};

export const parseToolString = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return normalizeToolList(value);
  return normalizeToolList(value.split(','));
};

export const ADMIN_USERNAMES = ['herz', 'mouse', 'devmouse'];

// Turn a #rrggbb into rgba() with the given alpha (for the tooltip border tint).
// Falls back to gold-ish if anything unexpected is passed.
export const hexToRgba = (hex, alpha) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return `rgba(255,215,0,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// ============================================
// BUILDER RANK HELPERS & COMPONENT
// ============================================
export const getRankForPoints = (points, ranks) => {
  if (!ranks || ranks.length === 0 || points === undefined || points === null) return null;
  const sorted = [...ranks].sort((a, b) => b.min_points - a.min_points);
  return sorted.find(r => (points || 0) >= r.min_points) || sorted[sorted.length - 1];
};

export const getNextRank = (currentRank, ranks) => {
  if (!ranks || !currentRank) return null;
  const sorted = [...ranks].sort((a, b) => a.min_points - b.min_points);
  const currentIndex = sorted.findIndex(r => r.name === currentRank.name);
  if (currentIndex < 0 || currentIndex >= sorted.length - 1) return null;
  return sorted[currentIndex + 1];
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
export const formatTimeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
};

export const ensureAbsoluteUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `https://${url}`;
};

export const SITE_ORIGIN = 'https://prmpted.com';

export const buildProfileShareUrl = (username) => {
  if (!username) return SITE_ORIGIN;
  return `${SITE_ORIGIN}/${username}`;
};

export const buildPostShareUrl = (post) => {
  if (!post || !post.id) return SITE_ORIGIN;
  // Slug-rich path (/user/post/title-slug-uuid) for better search ranking;
  // the trailing UUID keeps old links working.
  return `${SITE_ORIGIN}${buildPostPath(post)}`;
};

// Top-level path segments that can never be claimed as a username. Used in
// two places: (a) the /:username deep-link/popstate handlers below, so /support
// or /explore aren't treated as profile lookups, and (b) the signup and
// profile-edit forms, so usernames that would collide with an app route or
// could be used to impersonate the platform are rejected at form time.
export const RESERVED_TOP_LEVEL_ROUTES = new Set([
  // Existing app routes
  'onboarding', 'search', 'explore', 'new', 'create',
  'termsandconditions', 'privacypolicy', 'support', 'copyright', 'about',
  'ranks', 'arena', 'leaderboard', 'games', 'memes', 'lounge',
  'category', 'schools', 'community', 'communities', 'tool', 'workflow', 'post',
  'api', 'auth', 'login', 'signup', 'logout',
  'settings', 'admin', 'help', 'feedback', 'bug', 'bugs',
  'terms', 'privacy', 'tos',
  'discover', 'home', 'index',
  // Future / aliased routes
  'posts', 'p', 'build', 'builds',
  'profile', 'profiles', 'u', 'user', 'users',
  'account', 'feed', 'trending', 'for-you', 'foryou',
  'notifications', 'messages', 'inbox', 'dm',
  'questions', 'saved',
  'c', 'channel', 'channels',
  'tools', 'ai', 'models',
  'workflows', 'sandbox', 'rank',
  'achievements',
  'remix', 'remixes', 'fork', 'forks',
  'school',
  // Auth aliases
  'signin', 'sign-in', 'signout', 'sign-out',
  'sign-up', 'register', 'callback', 'oauth',
  'verify', 'reset', 'forgot', 'password',
  // Marketing / legal
  'faq', 'contact', 'legal', 'dmca',
  'press', 'blog', 'careers', 'jobs',
  // Infrastructure
  'v1', 'v2', 'graphql', 'rpc', 'rest',
  'moderator', 'mod', 'staff', 'team',
  'dashboard', 'console',
  'static', 'assets', 'public', 'cdn',
  'www', 'app', 'm', 'mobile',
  // Reserved identifiers / impersonation
  'null', 'undefined', 'anonymous', 'deleted',
  'prompted', 'prmpted', 'official',
]);

export const isReservedTopLevelSegment = (segment) =>
  !segment || segment.includes('.') || RESERVED_TOP_LEVEL_ROUTES.has(segment.toLowerCase());
