import { supabase } from './supabase.js';

export function filterFeedPosts(postsArray) {
  if (!postsArray) return [];
  return postsArray.filter((p) => {
    const username = p.username || p.profiles?.username || '';
    const title = (p.title || '').toLowerCase();
    if (username === 'patotomastoledo000' && title === 'son todos putos?') return false;
    if (p.post_type === 'meme') return false;
    return true;
  });
}

export const feedPostsQueryKey = (userId) => ['feed', 'posts', userId ?? 'anon'];

/** Fetch home feed posts — personalized when logged in, chronological fallback otherwise. */
export async function fetchFeedPosts(userId) {
  if (userId) {
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { data: feedData, error: feedError } = await supabase.rpc('get_personalized_feed', {
          p_user_id: userId,
          p_limit: 150,
          p_offset: 0,
        });

        if (!feedError && feedData && feedData.length > 0) {
          return filterFeedPosts(feedData);
        }

        if (feedError?.code === '42883' || (feedData && feedData.length === 0)) {
          break;
        }

        if (feedError && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
          continue;
        }
      } catch (err) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
          continue;
        }
        console.error('Personalized feed error after retries, falling back:', err);
      }
      break;
    }
  }

  const { data } = await supabase
    .from('posts_with_stats')
    .select('*')
    .neq('post_type', 'learning_submission')
    .neq('post_type', 'meme')
    .order('created_at', { ascending: false })
    .limit(150);

  return filterFeedPosts(data);
}

export const buildPostsQueryKey = () => ['feed', 'builds'];

/** Dedicated builds feed (non-post types) — fetched only when Builds tab is active. */
export async function fetchBuildPosts() {
  const { data } = await supabase
    .from('posts_with_stats')
    .select('*')
    .neq('post_type', 'post')
    .neq('post_type', 'learning_submission')
    .neq('post_type', 'meme')
    .eq('is_question', false)
    .order('created_at', { ascending: false })
    .limit(150);

  return filterFeedPosts(data);
}