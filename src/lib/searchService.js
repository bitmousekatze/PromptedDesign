import { supabase } from './supabase';

/**
 * Unified search service using the search_all Supabase RPC function.
 * Powers both the navbar search dropdown and the explore page search.
 */

export async function searchAll(query, limit = 20, type = 'all') {
  if (!query || !query.trim()) {
    return { posts: [], builds: [], questions: [], communities: [], users: [] };
  }

  const { data, error } = await supabase.rpc('search_all', {
    query_text: query.trim(),
    result_limit: limit,
    search_type: type,
  });

  if (error) {
    console.error('search_all RPC error:', error);
    throw error;
  }

  return {
    posts: data?.posts || [],
    builds: data?.builds || [],
    questions: data?.questions || [],
    communities: data?.communities || [],
    users: data?.users || [],
  };
}
