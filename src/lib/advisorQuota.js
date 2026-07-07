import { supabase } from './supabase.js';

// Advisor persona handles (incl. aliases) the composer should detect.
// Mirrors the DB trigger's username + ai_mention_aliases matching.
const ADVISOR_HANDLES = ['claude', 'chatgpt', 'grok', 'gpt', 'openai', 'gemini', 'google'];
const ADVISOR_RE = new RegExp(`@(${ADVISOR_HANDLES.join('|')})(?![a-zA-Z0-9_])`, 'i');

const normalizeHandle = (h) => {
  const x = h.toLowerCase();
  if (x === 'gpt' || x === 'openai') return 'chatgpt';
  if (x === 'google') return 'gemini';
  return x;
};

// Returns the first advisor handle mentioned in the text, normalized, or null.
export const advisorMentionIn = (htmlOrText) => {
  const all = advisorMentionsIn(htmlOrText);
  return all.length ? all[0] : null;
};

// Returns ALL distinct advisor handles mentioned (in order of appearance),
// normalized to display handles. Strips HTML first (CommentEditor stores HTML).
export const advisorMentionsIn = (htmlOrText) => {
  if (!htmlOrText) return [];
  const text = String(htmlOrText).replace(/<[^>]+>/g, ' ');
  const re = new RegExp(ADVISOR_RE.source, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const h = normalizeHandle(m[1]);
    if (!out.includes(h)) out.push(h);
  }
  return out;
};

let _cache = null;
let _cachedAt = 0;
const TTL_MS = 60_000;

// The caller's own advisor quota (Pro status, replies used/remaining, reset).
// Cached briefly so typing doesn't spam the RPC.
export const fetchAdvisorQuota = async () => {
  if (_cache && Date.now() - _cachedAt < TTL_MS) return _cache;
  const { data, error } = await supabase.rpc('advisor_quota_self');
  if (error) throw error;
  _cache = data;
  _cachedAt = Date.now();
  return data;
};

export const invalidateAdvisorQuota = () => { _cache = null; };
