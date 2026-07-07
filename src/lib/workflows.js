// ============================================
// WORKFLOW SERVICE LAYER
// ============================================
// All Supabase queries for the workflows feature.
// Tables: workflows, workflow_steps, workflow_likes, workflow_saves, workflow_comments

/**
 * Create a workflow with its steps.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} workflow - Workflow fields (title, description, etc.)
 * @param {object[]} steps - Array of step objects
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function createWorkflow(supabase, workflow, steps) {
  // Insert the workflow first
  const { data: wf, error: wfError } = await supabase
    .from('workflows')
    .insert(workflow)
    .select()
    .single();

  if (wfError) return { data: null, error: wfError };

  // Insert all steps with the workflow_id
  const stepsToInsert = steps.map((step, i) => ({
    workflow_id: wf.id,
    step_number: i + 1,
    title: step.title,
    prompt_text: step.prompt_text,
    why_this_step: step.why_this_step || null,
    what_to_expect: step.what_to_expect || null,
    tips: step.tips || null,
    ai_tool: step.ai_tool || null,
    tool_id: step.tool_id || null,
    estimated_minutes: step.estimated_minutes || null,
  }));

  const { error: stepsError } = await supabase
    .from('workflow_steps')
    .insert(stepsToInsert);

  if (stepsError) {
    // Clean up the workflow if steps fail
    await supabase.from('workflows').delete().eq('id', wf.id);
    return { data: null, error: stepsError };
  }

  return { data: wf, error: null };
}

/**
 * Get a single workflow with steps and author profile.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} id - Workflow ID
 * @param {string|null} currentUserId - Current user ID for like/save status
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function getWorkflow(supabase, id, currentUserId = null) {
  const { data: workflow, error } = await supabase
    .from('workflows')
    .select('*, profiles:user_id (id, username, display_name, avatar_emoji, avatar_url, name_color, bio)')
    .eq('id', id)
    .single();

  if (error) return { data: null, error };

  // Fetch steps
  const { data: steps } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('workflow_id', id)
    .order('step_number', { ascending: true });

  workflow.steps = steps || [];

  // Fetch like/save status for current user
  if (currentUserId) {
    const [likeResult, saveResult] = await Promise.all([
      supabase
        .from('workflow_likes')
        .select('user_id')
        .eq('workflow_id', id)
        .eq('user_id', currentUserId)
        .maybeSingle(),
      supabase
        .from('workflow_saves')
        .select('user_id')
        .eq('workflow_id', id)
        .eq('user_id', currentUserId)
        .maybeSingle(),
    ]);
    workflow.is_liked = !!likeResult.data;
    workflow.is_saved = !!saveResult.data;
  }

  // If forked, fetch original workflow title
  if (workflow.forked_from_workflow_id) {
    const { data: original } = await supabase
      .from('workflows')
      .select('id, title, user_id, profiles:user_id (username, display_name)')
      .eq('id', workflow.forked_from_workflow_id)
      .single();
    workflow.forked_from = original || null;
  }

  return { data: workflow, error: null };
}

/**
 * List workflows with pagination and filters.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} options
 * @returns {Promise<{data: object[], error: object|null}>}
 */
export async function getWorkflows(supabase, options = {}) {
  const {
    categoryId = null,
    difficulty = null,
    toolId = null,
    sortBy = 'recent', // 'recent', 'popular', 'most-liked'
    limit = 20,
    offset = 0,
  } = options;

  let query = supabase
    .from('workflows')
    .select('*, profiles:user_id (id, username, display_name, avatar_emoji, avatar_url, name_color)')
    .eq('moderation_status', 'approved');

  if (categoryId) {
    query = query.contains('category_ids', [categoryId]);
  }

  if (difficulty) {
    query = query.eq('difficulty', difficulty);
  }

  if (toolId) {
    query = query.contains('tool_ids', [toolId]);
  }

  if (sortBy === 'popular' || sortBy === 'most-liked') {
    query = query.order('like_count', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  return { data: data || [], error };
}

/**
 * Get all workflows by a user.
 */
export async function getUserWorkflows(supabase, userId) {
  const { data, error } = await supabase
    .from('workflows')
    .select('*, profiles:user_id (id, username, display_name, avatar_emoji, avatar_url, name_color)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return { data: data || [], error };
}

/**
 * Like a workflow.
 */
export async function likeWorkflow(supabase, userId, workflowId) {
  const { error } = await supabase
    .from('workflow_likes')
    .insert({ user_id: userId, workflow_id: workflowId });
  return { error };
}

/**
 * Unlike a workflow.
 */
export async function unlikeWorkflow(supabase, userId, workflowId) {
  const { error } = await supabase
    .from('workflow_likes')
    .delete()
    .eq('user_id', userId)
    .eq('workflow_id', workflowId);
  return { error };
}

/**
 * Save a workflow.
 */
export async function saveWorkflow(supabase, userId, workflowId) {
  const { error } = await supabase
    .from('workflow_saves')
    .insert({ user_id: userId, workflow_id: workflowId });
  return { error };
}

/**
 * Unsave a workflow.
 */
export async function unsaveWorkflow(supabase, userId, workflowId) {
  const { error } = await supabase
    .from('workflow_saves')
    .delete()
    .eq('user_id', userId)
    .eq('workflow_id', workflowId);
  return { error };
}

/**
 * Delete a workflow (cascade handles steps).
 */
export async function deleteWorkflow(supabase, workflowId) {
  const { error } = await supabase
    .from('workflows')
    .delete()
    .eq('id', workflowId);
  return { error };
}

/**
 * Fork (copy) a workflow and its steps for the current user.
 */
export async function forkWorkflow(supabase, workflowId, userId) {
  // Fetch original workflow
  const { data: original, error: fetchError } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .single();

  if (fetchError) return { data: null, error: fetchError };

  // Fetch original steps
  const { data: originalSteps } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('step_number', { ascending: true });

  // Create new workflow
  const newWorkflow = {
    user_id: userId,
    title: original.title,
    description: original.description,
    outcome: original.outcome,
    category_id: original.category_id,
    category_ids: original.category_ids,
    tool_ids: original.tool_ids,
    difficulty: original.difficulty,
    estimated_minutes: original.estimated_minutes,
    images: original.images,
    forked_from_workflow_id: workflowId,
    moderation_status: 'approved',
  };

  const { data: forked, error: insertError } = await supabase
    .from('workflows')
    .insert(newWorkflow)
    .select()
    .single();

  if (insertError) return { data: null, error: insertError };

  // Copy steps
  if (originalSteps && originalSteps.length > 0) {
    const newSteps = originalSteps.map(step => ({
      workflow_id: forked.id,
      step_number: step.step_number,
      title: step.title,
      prompt_text: step.prompt_text,
      why_this_step: step.why_this_step,
      what_to_expect: step.what_to_expect,
      tips: step.tips,
      ai_tool: step.ai_tool,
      tool_id: step.tool_id,
      estimated_minutes: step.estimated_minutes,
    }));

    await supabase.from('workflow_steps').insert(newSteps);
  }

  return { data: forked, error: null };
}

/**
 * Get workflow comments with author profiles.
 */
export async function getWorkflowComments(supabase, workflowId) {
  const { data, error } = await supabase
    .from('workflow_comments')
    .select('*, profiles:user_id (id, username, display_name, avatar_emoji, avatar_url, name_color)')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: true });

  return { data: data || [], error };
}

/**
 * Add a comment to a workflow.
 */
export async function addWorkflowComment(supabase, userId, workflowId, content, parentCommentId = null) {
  const { data, error } = await supabase
    .from('workflow_comments')
    .insert({
      user_id: userId,
      workflow_id: workflowId,
      content,
      parent_comment_id: parentCommentId,
    })
    .select('*, profiles:user_id (id, username, display_name, avatar_emoji, avatar_url, name_color)')
    .single();

  return { data, error };
}

/**
 * Get user's liked workflow IDs.
 */
export async function getUserWorkflowLikes(supabase, userId) {
  const { data, error } = await supabase
    .from('workflow_likes')
    .select('workflow_id')
    .eq('user_id', userId);

  return { data: (data || []).map(d => d.workflow_id), error };
}

/**
 * Get user's saved workflow IDs.
 */
export async function getUserWorkflowSaves(supabase, userId) {
  const { data, error } = await supabase
    .from('workflow_saves')
    .select('workflow_id')
    .eq('user_id', userId);

  return { data: (data || []).map(d => d.workflow_id), error };
}
