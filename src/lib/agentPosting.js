// ============================================
// AGENT POSTING (MCP) - client data layer
// Design doc: docs/PROMPTED_AGENT_POSTING_DESIGN.html
//
// Covers the two user-facing surfaces of Phase 1:
//   1. Connect Agent  - generate / list / revoke personal access tokens.
//   2. Review page     - load an agent draft and publish it as a real post.
//
// The raw token is generated in the browser, hashed with SHA-256, and only the
// hash is persisted. The raw value is returned to the caller exactly once so the
// UI can show it; it is never stored.
// ============================================

import { normalizePostVideoItem } from './storage.js';

const TOKEN_PREFIX = 'prmpt_live_';
const TOKEN_BODY_LEN = 32;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** SHA-256 hex digest of a string (matches the edge function's hashing). */
export async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Cryptographically-random raw token: prmpt_live_<32 base62 chars>. */
export function generateRawToken() {
  const rand = new Uint32Array(TOKEN_BODY_LEN);
  crypto.getRandomValues(rand);
  let out = '';
  for (let i = 0; i < TOKEN_BODY_LEN; i++) {
    out += ALPHABET[rand[i] % ALPHABET.length];
  }
  return TOKEN_PREFIX + out;
}

// ── Tokens ────────────────────────────────────────────────────────────────

/**
 * Create a new personal access token for the current user.
 * Returns { token } (the raw secret, show ONCE) and { row } (the stored record).
 */
export async function createApiToken(supabase, userId, label) {
  const raw = generateRawToken();
  const token_hash = await sha256Hex(raw);
  // First 8 chars after the prefix, purely for display in the connections list.
  const token_prefix = raw.slice(0, TOKEN_PREFIX.length + 8);

  const { data, error } = await supabase
    .from('api_tokens')
    .insert({
      user_id: userId,
      token_hash,
      token_prefix,
      label: (label || '').trim().slice(0, 120) || 'Untitled connection',
    })
    .select('id, token_prefix, label, last_used_at, created_at')
    .single();

  if (error) throw error;
  return { token: raw, row: data };
}

export async function listApiTokens(supabase, userId) {
  const { data, error } = await supabase
    .from('api_tokens')
    .select('id, token_prefix, label, last_used_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function revokeApiToken(supabase, id) {
  const { error } = await supabase.from('api_tokens').delete().eq('id', id);
  if (error) throw error;
}

// ── Design docs ───────────────────────────────────────────────────────────

/**
 * Host a self-contained HTML design doc for a post and return the public URL.
 *
 * Stores the HTML in post_design_docs (one row per post) and returns the
 * /design-doc/<postId> route that api/design-doc/[id].js serves with a strict,
 * script-free CSP. Shared by the agent publish flow and the normal create-post
 * flow so an uploaded HTML file and an agent-generated doc are hosted identically.
 *
 * @returns {Promise<string|null>} the hosted URL, or null if html was empty/failed
 */
export async function hostPostDesignDoc(supabase, { postId, userId, html }) {
  if (!html || !html.trim()) return null;

  const { error } = await supabase
    .from('post_design_docs')
    .upsert({ post_id: postId, user_id: userId, html }, { onConflict: 'post_id' });

  if (error) {
    console.error('Failed to host design doc:', error);
    return null;
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://prmpted.com';
  return `${origin}/design-doc/${postId}`;
}

// ── Drafts ──────────────────────────────────────────────────────────────────

export async function getDraft(supabase, id) {
  const { data, error } = await supabase
    .from('agent_post_drafts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listPendingDrafts(supabase, userId) {
  const { data, error } = await supabase
    .from('agent_post_drafts')
    .select('id, title, ai_tool, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function discardDraft(supabase, id) {
  const { error } = await supabase
    .from('agent_post_drafts')
    .update({ status: 'discarded' })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Publish an agent draft as a real build post.
 *
 * Mirrors the post insert in App.jsx's create-post flow (post_type 'build'),
 * then - if the agent supplied a design doc - hosts the HTML at
 * /design-doc/<post_id> and points the post's design_doc_url there. Finally the
 * draft is marked 'published' and linked to the new post.
 *
 * @param {object} args
 * @param {object} args.draft        the loaded draft row
 * @param {string[]} args.imageUrls  uploaded image URLs (builds require >= 1 attachment)
 * @param {Array<{url: string, path: string, type: 'video'}>} [args.videos] uploaded video items
 * @param {string[]} args.categoryIds selected category ids
 * @param {string[]} [args.communityIds] communities to cross-post into
 * @param {string} [args.difficulty] optional difficulty
 * @returns {Promise<object>} the created post row
 */
export async function publishDraft(supabase, userId, { draft, imageUrls, videos, categoryIds, communityIds, difficulty, pollOptions, repostSourceId }) {
  const prompts = Array.isArray(draft.prompts) ? draft.prompts.filter((p) => typeof p === 'string' && p.trim()) : [];
  const combinedPrompt = prompts.join('\n\n---\n\n') || null;
  const promptSteps = prompts.length
    ? prompts.map((prompt_text, i) => ({ step_number: i + 1, prompt_text }))
    : null;

  const aiToolNames = (draft.ai_tool || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const toolIds = aiToolNames.map((t) => t.toLowerCase().replace(/\s+/g, '-'));

  // Video data lives on its own columns (videos / has_video / video_url),
  // independent of post_type - mirrors App.jsx's create-post insert.
  const videoItems = Array.isArray(videos) ? videos.filter(Boolean) : [];
  const firstVideo = videoItems.length > 0 ? normalizePostVideoItem(videoItems[0]) : null;

  const insertData = {
    user_id: userId,
    title: draft.title,
    description: draft.body || null,
    prompt: combinedPrompt,
    prompt_steps: promptSteps,
    category_id: (categoryIds && categoryIds[0]) || null,
    category_ids: categoryIds && categoryIds.length ? categoryIds : null,
    demo_url: draft.demo_url || null,
    github_repo_url: draft.github_repo_url || null,
    ai_tool: aiToolNames.join(', ') || null,
    tool_ids: toolIds.length ? toolIds : null,
    images: imageUrls && imageUrls.length ? imageUrls : null,
    videos: videoItems.length ? videoItems : null,
    has_video: videoItems.length > 0,
    video_url: firstVideo?.url || null,
    is_question: false,
    post_type: 'build',
    difficulty: difficulty || null,
  };

  // Optional repost: embed an existing post (renders "Reposted from @user").
  if (repostSourceId) {
    insertData.forked_from_post_id = repostSourceId;
    insertData.fork_type = 'repost';
  }

  // Optional poll (same { id, text } shape the create-post flow + PollWidget use).
  if (Array.isArray(pollOptions)) {
    const opts = pollOptions
      .map((o) => (o || '').trim())
      .filter(Boolean)
      .slice(0, 6)
      .map((text, i) => ({ id: `opt${i + 1}`, text }));
    if (opts.length >= 2) insertData.poll_options = opts;
  }

  const { data: post, error: postError } = await supabase
    .from('posts')
    .insert(insertData)
    .select()
    .single();
  if (postError) throw postError;

  // Host the agent's design doc, if any, and point the post at it.
  // Non-fatal: the post is live regardless of the design-doc side artifact.
  const designDocUrl = await hostPostDesignDoc(supabase, {
    postId: post.id,
    userId,
    html: draft.design_doc_html,
  });
  if (designDocUrl) {
    await supabase.from('posts').update({ design_doc_url: designDocUrl }).eq('id', post.id);
    post.design_doc_url = designDocUrl;
  }

  // Cross-post into any selected communities (same shape as the create-post flow).
  if (communityIds && communityIds.length) {
    const { error: communityError } = await supabase
      .from('community_posts')
      .insert(communityIds.map((community_id) => ({ community_id, post_id: post.id })));
    if (communityError) {
      // Non-fatal: the post is live even if a community link fails.
      console.error('Failed to add post to communities:', communityError);
    }
  }

  // Mark the draft done and link it to the published post.
  await supabase
    .from('agent_post_drafts')
    .update({ status: 'published', published_post_id: post.id })
    .eq('id', draft.id);

  return post;
}
