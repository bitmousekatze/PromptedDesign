// Data layer for Prompted Learning (the "Learn" tab).
// Tables/RPCs ship in migrations 20260618000002 (schema) + 20260618000003 (seed).
// All writes go through SECURITY DEFINER RPCs; reads are public-readable tables.
import { supabase } from './supabase';

// ── Curriculum + progress reads ──────────────────────────────────────────────

export async function fetchTracks() {
  const { data, error } = await supabase
    .from('learning_tracks')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

// The curated curriculum only. Community projects (is_community=true) live in their
// own tab and must never inflate the curated "/N" count or appear on the track path.
export async function fetchProjects() {
  const { data, error } = await supabase
    .from('learning_projects')
    .select('*')
    .eq('is_active', true)
    .eq('is_community', false)
    .order('project_number', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ── Community projects (user-authored, admin-approved) ───────────────────────

// Approved community projects with full fields so the build flow can open directly.
export async function getCommunityProjects() {
  const { data, error } = await supabase.rpc('get_community_projects');
  if (error) throw error;
  return data || [];
}

// Author a pending community project + its 5 pre / 5 after quiz questions.
//   pre/after: [{ question, options: string[], correct_index }]
export async function createCommunityProject(p) {
  const { data, error } = await supabase.rpc('create_community_project', {
    p_title: p.title,
    p_brief: p.brief,
    p_instructions: p.instructions || null,
    p_rubric: p.rubric || [],
    p_starter_prompt: p.starterPrompt || null,
    p_example_prompt: p.examplePrompt || null,
    p_example_output: p.exampleOutput || null,
    p_pre: p.pre,
    p_after: p.after,
  });
  if (error) throw error;
  return data; // project uuid
}

// Admin queue: pending community projects WITH correct answers, for vetting.
export async function listPendingCommunityProjects() {
  const { data, error } = await supabase.rpc('list_pending_community_projects');
  if (error) throw error;
  return data || [];
}

export async function approveCommunityProject(projectId) {
  const { error } = await supabase.rpc('approve_community_project', { p_project_id: projectId });
  if (error) throw error;
}

export async function rejectCommunityProject(projectId, reason) {
  const { error } = await supabase.rpc('reject_community_project', { p_project_id: projectId, p_reason: reason || '' });
  if (error) throw error;
}

// All of a user's per-track progress rows, keyed by track_id.
export async function fetchMyProgress(userId) {
  if (!userId) return {};
  const { data, error } = await supabase
    .from('learning_progress')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  const map = {};
  (data || []).forEach((r) => { map[r.track_id] = r; });
  return map;
}

// A user's submissions on one track, keyed by project_id.
export async function fetchMySubmissions(userId, trackId) {
  if (!userId || !trackId) return {};
  const { data, error } = await supabase
    .from('learning_submissions')
    .select('*')
    .eq('user_id', userId)
    .eq('track_id', trackId);
  if (error) throw error;
  const map = {};
  (data || []).forEach((s) => { map[s.project_id] = s; });
  return map;
}

// A user's quiz attempts for one project → { hasPre, hasAfter, preScore, afterScore }.
export async function fetchMyAttempts(userId, projectId) {
  const empty = { hasPre: false, hasAfter: false, preScore: null, afterScore: null };
  if (!userId || !projectId) return empty;
  const { data, error } = await supabase
    .from('learning_quiz_attempts')
    .select('phase, score, created_at')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const out = { ...empty };
  for (const a of data || []) {
    if (a.phase === 'pre') {
      out.hasPre = true;
      out.preScore = Math.max(out.preScore ?? 0, a.score);
    } else if (a.phase === 'after') {
      out.hasAfter = true;
      out.afterScore = a.score; // latest after (rows are ascending)
    }
  }
  return out;
}

// ── Quiz RPCs ────────────────────────────────────────────────────────────────

export async function getProjectQuiz(projectId, phase) {
  const { data, error } = await supabase.rpc('get_project_quiz', {
    p_project_id: projectId,
    p_phase: phase,
  });
  if (error) throw error;
  return data || [];
}

// answers: array of selected option indexes, aligned to question position (1..5).
export async function submitQuiz(projectId, phase, answers) {
  const { data, error } = await supabase.rpc('start_project_quiz', {
    p_project_id: projectId,
    p_phase: phase,
    p_answers: answers,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// ── Submission RPC ───────────────────────────────────────────────────────────

export async function submitProject({ projectId, trackId, prompts, finalCode, screenshotUrl, liveUrl, question, model, isPublic = true }) {
  const { data, error } = await supabase.rpc('submit_learning_project', {
    p_project_id: projectId,
    p_track_id: trackId,
    p_prompts: prompts || null,
    p_final_code: finalCode || null,
    p_screenshot_url: screenshotUrl || null,
    p_live_url: liveUrl || null,
    p_question: question || null,
    p_model_used: model || null,
    p_public: isPublic,
  });
  if (error) throw error;
  return data; // submission uuid
}

// ── Submission view + grading ────────────────────────────────────────────────

// Hydrate profiles for a set of user ids in one query.
async function fetchProfilesByIds(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, avatar_emoji, name_color, builder_points')
    .in('id', unique);
  if (error) throw error;
  const map = {};
  (data || []).forEach((p) => { map[p.id] = p; });
  return map;
}

// Full submission detail: submission row + author + grade votes + comment thread.
export async function fetchSubmissionFull(submissionId) {
  const { data: sub, error: subErr } = await supabase
    .from('learning_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();
  if (subErr) throw subErr;

  const [{ data: votes, error: vErr }, { data: comments, error: cErr }, { data: proj }] = await Promise.all([
    supabase.from('learning_grade_votes').select('*').eq('submission_id', submissionId),
    supabase
      .from('comments')
      .select('id, post_id, user_id, content, parent_comment_id, created_at')
      .eq('post_id', sub.post_id)
      .order('created_at', { ascending: true }),
    // The project may be a community project (absent from the curated list the
    // grading view has in memory), so fetch its title/flag directly.
    supabase.from('learning_projects').select('id, title, project_number, is_community').eq('id', sub.project_id).maybeSingle(),
  ]);
  if (vErr) throw vErr;
  if (cErr) throw cErr;

  const profiles = await fetchProfilesByIds([
    sub.user_id,
    ...(votes || []).map((v) => v.voter_id),
    ...(comments || []).map((c) => c.user_id),
  ]);

  // Map a voter_id → their vote so the comment can show its A/B/C chip.
  const voteByUser = {};
  (votes || []).forEach((v) => { voteByUser[v.voter_id] = v; });

  return {
    submission: sub,
    project: proj || null,
    author: profiles[sub.user_id] || null,
    votes: (votes || []).map((v) => ({ ...v, voter: profiles[v.voter_id] || null })),
    comments: (comments || []).map((c) => ({
      ...c,
      profile: profiles[c.user_id] || null,
      vote: voteByUser[c.user_id] || null,
    })),
    profiles,
  };
}

// Recent submissions on a track to browse/grade (excludes the viewer's own and
// any finished-but-not-posted private builds).
export async function fetchSubmissionsToGrade(trackId, { projectId = null, excludeUserId = null, limit = 40 } = {}) {
  let q = supabase
    .from('learning_submissions')
    .select('*')
    .eq('track_id', trackId)
    .eq('status', 'posted')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (projectId) q = q.eq('project_id', projectId);
  if (excludeUserId) q = q.neq('user_id', excludeUserId);
  const { data, error } = await q;
  if (error) throw error;
  const profiles = await fetchProfilesByIds((data || []).map((s) => s.user_id));
  return (data || []).map((s) => ({ ...s, author: profiles[s.user_id] || null }));
}

export async function gradeProject(submissionId, letter, feedback) {
  const { data, error } = await supabase.rpc('grade_project', {
    p_submission_id: submissionId,
    p_letter: letter,
    p_feedback: feedback || '',
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function likeGradeComment(submissionId, voterId) {
  const { data, error } = await supabase.rpc('like_grade_comment', {
    p_submission_id: submissionId,
    p_voter_id: voterId,
  });
  if (error) throw error;
  return data;
}

// ── Leaderboards ─────────────────────────────────────────────────────────────

// Learn-tab leaderboards, scored separately from Builder Points. One round trip
// returns all three boards plus the GPA qualifying floor:
//   { teachers: [...], students: [...], gpa: [...], gpa_min_graded: int }
export async function fetchLearningLeaderboards(limit = 50) {
  const { data, error } = await supabase.rpc('get_learning_leaderboards', { p_limit: limit });
  if (error) throw error;
  return {
    teachers: data?.teachers || [],
    students: data?.students || [],
    gpa: data?.gpa || [],
    gpaMinGraded: data?.gpa_min_graded ?? 2,
  };
}

// ── Models ───────────────────────────────────────────────────────────────────

// Public models a learner can pick per track, keyed by tool_id. The build's grades
// and post are filed under the chosen model. First entry is the flagship default.
// Single-model tools (Lovable, Replit, local Ollama) have exactly one and lock to it.
// Keep in sync with the arena model lists as new models ship.
export const LEARN_MODELS = {
  claude:  ['Opus', 'Sonnet', 'Haiku'],
  chatgpt: ['GPT-5.5', 'GPT-5.4', 'GPT-5.3', 'GPT-5.2'],
  gemini:  ['3 Pro', '3.5 Flash', '3 Deepthink'],
  grok:    ['Super', 'Heavy'],
  kimi:    ['K2.5', 'K2'],
  ollama:  ['Local'],
  lovable: ['Lovable'],
  replit:  ['Agent 3'],
};

// Model options for a track's tool_id (empty array if none defined).
export function modelsForTrack(toolId) {
  return LEARN_MODELS[toolId] || [];
}

// ── Display helpers ──────────────────────────────────────────────────────────

// GPA-style numeric average (A=4,B=3,C=2,D=1) → nearest letter for display.
export function gpaToLetter(g) {
  if (g === null || g === undefined) return null;
  const n = Number(g);
  if (n >= 3.85) return 'A';
  if (n >= 3.5) return 'A−';
  if (n >= 3.15) return 'B+';
  if (n >= 2.85) return 'B';
  if (n >= 2.5) return 'B−';
  if (n >= 2.15) return 'C+';
  if (n >= 1.85) return 'C';
  if (n >= 1.5) return 'C−';
  if (n >= 1.15) return 'D+';
  return 'D';
}

// "2×A · 1×B" style distribution from an array of votes.
export function gradeDistribution(votes) {
  const c = { A: 0, B: 0, C: 0, D: 0 };
  (votes || []).forEach((v) => { if (c[v.letter] != null) c[v.letter] += 1; });
  return ['A', 'B', 'C', 'D'].filter((k) => c[k] > 0).map((k) => `${c[k]}×${k}`).join(' · ');
}

export const LETTER_MEANING = {
  A: 'Works AND shows real creativity or initiative - they made it their own and went beyond the brief',
  B: 'Works with a personal spark; minor rough edges',
  C: 'Works, but plays it safe - sticks closely to the template',
  D: 'Needs rework - try the feedback and repost',
};
