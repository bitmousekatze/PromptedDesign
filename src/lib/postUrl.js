// Slug + URL helpers for per-post pages.
//
// Posts are identified by a UUID, but bare /post/{uuid} URLs carry no
// keywords for search engines. We embed a keyword slug derived from the
// post title so URLs look like:
//   /post/midjourney-cyberpunk-city-8f3a1b2c-...-uuid
//   /username/post/midjourney-cyberpunk-city-8f3a1b2c-...-uuid
//
// The UUID is always the trailing portion of the segment, so parsing stays
// fully backward compatible with old /post/{uuid} links that have no slug.

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function slugify(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accent marks
    .replace(/[^a-z0-9]+/g, '-')     // non-alphanumeric -> hyphen
    .replace(/^-+|-+$/g, '')         // trim leading/trailing hyphens
    .slice(0, 60)
    .replace(/-+$/g, '');            // re-trim after the length cap
}

// Build the slug tail ("slug-uuid", or just "uuid" when there's no title).
export function buildPostSlugTail(post) {
  if (!post || !post.id) return '';
  const slug = slugify(post.title);
  return slug ? `${slug}-${post.id}` : post.id;
}

// Build the path portion ("/user/post/slug-uuid" or "/post/slug-uuid").
export function buildPostPath(post) {
  if (!post || !post.id) return '/';
  const username = post.profiles?.username || post.username;
  const tail = buildPostSlugTail(post);
  return username ? `/${username}/post/${tail}` : `/post/${tail}`;
}

// Extract the canonical UUID from any post URL segment, ignoring the slug.
export function extractPostId(value) {
  if (!value) return null;
  const m = String(value).match(UUID_RE);
  return m ? m[1] : null;
}
