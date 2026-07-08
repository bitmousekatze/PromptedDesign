import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hgzkeaicuxvqsiacqnul.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnemtlYWljdXh2cXNpYWNxbnVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMzQ3NDcsImV4cCI6MjA4NDcxMDc0N30.V2VQe0YAfqmVJZ5V2il22b6SGtFnAi7yJDbSSUjJZ4M';

// Pass-through auth "lock": run each operation immediately, no serialization.
//
// Both default locks (navigatorLock on web, processLock on native) funnel EVERY
// auth operation - getSession, token refresh, signOut - through a single
// serialized chain. If one operation's network call stalls (a hung token
// refresh, a Cloudflare challenge, a flaky connection), it holds the chain and
// every other query in the tab queues behind it until the 10s acquire-timeout
// fires: "Lock \"lock:prompted-auth\" acquisition timed out after 10000ms".
// That's what froze Ranks / Messages / profile and hung Log Out.
//
// We don't actually need that serialization for safety: GoTrueClient already
// dedupes concurrent token refreshes on its own (refreshingDeferred inside
// _callRefreshToken), so a second refresh reuses the first's in-flight promise
// rather than racing it. Running lock-free therefore keeps refresh correct
// while removing the whole stuck-lock / timeout failure class - a single slow
// op can no longer block unrelated queries.
//
// NOTE: this is a deliberate stopgap ahead of the App.jsx refactor; revisit if
// we ever need cross-tab session coordination.
const passThroughLock = async (_name, _acquireTimeout, fn) => fn();

// ── Read-only maintenance gate ───────────────────────────────────────────────
// When site_settings.read_only is on (see src/lib/readOnly.js, which polls the
// flag and calls setReadOnlyMode), every mutating request is short-circuited
// here - the one choke point all table writes, storage uploads, edge-function
// calls, and mutating RPCs pass through. Reads keep working so the site stays
// browsable during the maintenance window.
let readOnlyMode = false;
export const setReadOnlyMode = (v) => { readOnlyMode = !!v; };
export const isReadOnlyMode = () => readOnlyMode;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// PostgREST invokes every RPC via POST, including pure reads - allow the
// read-shaped name prefixes through. (daily_reward_status is a read despite
// the odd name; record_*/touch_* are writes and intentionally blocked - their
// callers already tolerate errors.)
const READ_RPC_RE = /\/rest\/v1\/rpc\/(get_|is_|has_|check_|search_|list_|daily_reward_status)/;

const isBlockedWhileReadOnly = (input, init) => {
  if (!readOnlyMode) return false;
  const method = ((init && init.method) || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
  if (!MUTATING_METHODS.has(method)) return false;
  const url = typeof input === 'string' ? input : (input?.url || '');
  if (url.includes('/auth/v1/')) return false;                        // sign-in + token refresh keep working
  if (READ_RPC_RE.test(url)) return false;                            // read RPCs (POST by transport only)
  if (url.includes('/rest/v1/rpc/set_read_only_mode')) return false;  // admins must be able to flip it back off
  return true;
};

const guardedFetch = (input, init) => {
  if (isBlockedWhileReadOnly(input, init)) {
    return Promise.resolve(new Response(
      JSON.stringify({ message: 'Prompted is in read-only maintenance mode - back online soon!', code: 'read_only' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    ));
  }
  return fetch(input, init);
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storageKey: 'prompted-auth',
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    lock: passThroughLock,
  },
  global: {
    fetch: guardedFetch,
  }
});
export { SUPABASE_URL, SUPABASE_ANON_KEY };
