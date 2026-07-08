// Multi-account session store (X-style account switcher).
//
// Why: Supabase Auth only holds one active session per browser. To switch
// between accounts without re-logging in, we stash each account's tokens
// and call supabase.auth.setSession() on switch.
//
// Security: tokens are encrypted at rest with AES-GCM using a NON-EXTRACTABLE
// WebCrypto key kept in IndexedDB. A smash-and-grab XSS that dumps localStorage
// gets only ciphertext, and the key itself can never be exfiltrated (it can only
// be *used* same-origin). This is defense in depth - the primary control is still
// preventing XSS - but it removes the trivial "read localStorage, POST elsewhere"
// path. Falls back to plaintext only where WebCrypto/IndexedDB are unavailable.
// Capped at MAX_ACCOUNTS.

import { supabase } from './supabase';

const STORAGE_KEY = 'prompted-accounts-v1';
export const MAX_ACCOUNTS = 5;

// In-memory cache backs the synchronous public API; hydrated asynchronously from
// the encrypted blob in localStorage on module load.
let cache = [];

const cryptoOk =
  typeof crypto !== 'undefined' && crypto?.subtle && typeof indexedDB !== 'undefined';

// --- non-extractable AES-GCM key, persisted in IndexedDB ---
const DB_NAME = 'prompted-secure';
const STORE = 'keys';
const KEY_ID = 'accounts-key';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGet(key) {
  return idb().then(db => new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
function idbSet(key, val) {
  return idb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

async function getKey() {
  let key = await idbGet(KEY_ID);
  if (!key) {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await idbSet(KEY_ID, key); // CryptoKey is structured-cloneable; stored non-extractable
  }
  return key;
}

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function encryptAccounts(accounts) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify({ accounts }));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
  return JSON.stringify({ v: 2, iv: toB64(iv), data: toB64(ct) });
}

async function decryptAccounts(raw) {
  const parsed = JSON.parse(raw);
  if (parsed?.v === 2 && parsed.iv && parsed.data) {
    const key = await getKey();
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(parsed.iv) }, key, fromB64(parsed.data));
    const obj = JSON.parse(new TextDecoder().decode(pt));
    return Array.isArray(obj?.accounts) ? obj.accounts : [];
  }
  // Legacy plaintext format: { accounts: [...] }
  return Array.isArray(parsed?.accounts) ? parsed.accounts : [];
}

async function persist() {
  try {
    const raw = cryptoOk ? await encryptAccounts(cache) : JSON.stringify({ accounts: cache });
    localStorage.setItem(STORAGE_KEY, raw);
  } catch { /* storage full / unavailable - best effort */ }
}

async function hydrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = cryptoOk ? await decryptAccounts(raw) : (JSON.parse(raw)?.accounts ?? []);
    if (Array.isArray(stored) && stored.length) {
      // Merge, don't overwrite: an account saved synchronously before hydration
      // finished (e.g. SIGNED_IN) is fresher and wins; append the rest.
      const have = new Set(cache.map(a => a.user_id));
      cache = [...cache, ...stored.filter(a => a && !have.has(a.user_id))].slice(0, MAX_ACCOUNTS);
    }
    // Upgrade a legacy plaintext blob to the encrypted format in place.
    if (cryptoOk && !raw.includes('"v":2')) await persist();
  } catch {
    /* unreadable (e.g. key cleared) - keep whatever is already in cache */
  }
}

const ready = hydrate();
export const accountsReady = ready;

export function getSavedAccounts() {
  return cache;
}

// Upsert the current session into the saved list. Called on SIGNED_IN /
// TOKEN_REFRESHED and whenever the profile updates so display data stays fresh.
// The in-memory cache is updated synchronously (so a read right after a write is
// correct); only the encrypt-and-write to localStorage is async.
export function saveAccount({ session, profile }) {
  if (!session?.user?.id || !session.access_token || !session.refresh_token) return;
  const entry = {
    user_id: session.user.id,
    email: session.user.email || null,
    username: profile?.username || null,
    display_name: profile?.display_name || null,
    avatar_url: profile?.avatar_url || null,
    avatar_emoji: profile?.avatar_emoji || null,
    name_color: profile?.name_color || null,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    savedAt: Date.now(),
  };
  cache = [entry, ...cache.filter(a => a.user_id !== entry.user_id)].slice(0, MAX_ACCOUNTS);
  void persist();
}

export function removeAccount(userId) {
  cache = cache.filter(a => a.user_id !== userId);
  void persist();
}

// Switch to a saved account: install its tokens, then reload to reset all
// in-memory state (profile, communities, subscriptions, etc.).
export async function switchToAccount(account) {
  if (!account?.refresh_token) return { ok: false, error: 'Missing tokens' };
  const { error } = await supabase.auth.setSession({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });
  if (error) {
    // Refresh token revoked/expired - drop it so the UI prompts re-login.
    removeAccount(account.user_id);
    return { ok: false, error: error.message };
  }
  window.location.reload();
  return { ok: true };
}

// "Add another account" - keep current account in the saved list, sign out
// locally (without revoking the refresh token server-side so we can switch
// back), then open the auth modal.
export async function signOutKeepingSaved() {
  await supabase.auth.signOut({ scope: 'local' });
}
