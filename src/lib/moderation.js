// Local content moderation - checks for genuinely harmful content only
const BANNED_WORDS = [
  // Racial slurs
  'nigger', 'nigga', 'chink', 'spic', 'wetback', 'kike', 'gook', 'raghead', 'towelhead', 'beaner', 'coon', 'darkie', 'zipperhead', 'redskin',
  // Hateful slurs targeting protected groups
  'faggot', 'fag', 'dyke', 'tranny', 'shemale', 'retard', 'retarded',
  // Direct violent threats
  'kill yourself', 'kys',
  // Extreme profanity (lenient - only the worst)
  'motherfucker', 'motherfuckers',
  // Spanish slurs
  'putos', 'puto', 'puta',
];

// Pre-compile regex patterns for whole-word matching (case-insensitive)
const BANNED_PATTERNS = BANNED_WORDS.map(word =>
  new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
);

export async function moderateContent(text) {
  if (!text || typeof text !== 'string') {
    return { approved: true };
  }

  for (let i = 0; i < BANNED_PATTERNS.length; i++) {
    if (BANNED_PATTERNS[i].test(text)) {
      return { approved: false, reason: 'Your content contains language that violates our community guidelines.' };
    }
  }

  return { approved: true };
}

export const REPORT_REASONS = ['spam', 'inappropriate', 'harassment', 'misinformation', 'other'];

export async function reportContent(supabase, { reporterId, contentType, contentId, reason }) {
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: reporterId,
    content_type: contentType,
    content_id: contentId,
    reason
  });
  if (error) throw error;
}
