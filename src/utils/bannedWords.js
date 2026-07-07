// Banned words list - these match what's in the Supabase banned_words table
const BANNED_WORDS = [
  'nigger', 'nigga', 'nigg3r', 'n1gger', 'n1gga',
  'kike', 'kyke',
  'faggot', 'f4ggot', 'fag',
  'hitler', 'h1tler',
  'wetback', 'spic', 'chink', 'gook', 'coon',
  'darkie', 'jigaboo', 'raghead', 'towelhead',
  'beaner', 'tranny', 'retard', 'dyke',
  'zipperhead', 'sandnigger', 'redskin',
  'cracker', 'honkey', 'honky', 'negro'
];

export function containsBannedWord(text) {
  if (!text) return false;
  // Normalize: lowercase, strip non-alphanumeric
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BANNED_WORDS.some(word => normalized.includes(word));
}

export function validateUsername(username) {
  if (containsBannedWord(username)) {
    return 'This username is not allowed. Please choose a different one.';
  }
  return null;
}

export function validateDisplayName(displayName) {
  if (containsBannedWord(displayName)) {
    return 'This display name is not allowed. Please choose a different one.';
  }
  return null;
}
