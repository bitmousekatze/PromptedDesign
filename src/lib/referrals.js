// Data layer for Prompted Referrals (the "Referrals" tab).
// Tables/RPCs ship in migration 20260620000001_referrals.sql.
// A referral is valid only when an invited user signs up AND makes a post.
// All writes go through SECURITY DEFINER RPCs; counters are server-derived.
import { supabase } from './supabase';

// localStorage key where the ?ref= code captured at landing is stashed until
// the user has an authenticated session we can attribute it to.
const REF_STORAGE_KEY = 'prmpted:ref';

// Pull ?ref=<code> off the current URL (once, at app load) and remember it.
// Returns the captured code, or null. Safe to call repeatedly.
export function captureReferralFromUrl() {
  try {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code && /^[a-z0-9_]{3,20}$/i.test(code.trim())) {
      window.localStorage.setItem(REF_STORAGE_KEY, code.trim().toLowerCase());
      return code.trim().toLowerCase();
    }
  } catch {}
  return null;
}

export function getStoredReferralCode() {
  try { return window.localStorage.getItem(REF_STORAGE_KEY) || null; } catch { return null; }
}

function clearStoredReferralCode() {
  try { window.localStorage.removeItem(REF_STORAGE_KEY); } catch {}
}

// Bind the signed-in user to whoever referred them (idempotent server-side).
// Call once after auth resolves. Clears the stored code on a definitive outcome
// so we don't keep retrying a code that's already been handled.
export async function attributePendingReferral() {
  const code = getStoredReferralCode();
  if (!code) return null;
  try {
    const { data, error } = await supabase.rpc('attribute_referral', { p_code: code });
    if (error) throw error;
    // 'pending'/'already_attributed'/'self_referral'/'unknown_code' are all terminal.
    clearStoredReferralCode();
    return data || null;
  } catch (e) {
    // Network/transient error - keep the code so a later session can retry.
    return null;
  }
}

// ── Hub ──────────────────────────────────────────────────────────────────────

// { code, qualified, signups, shares, tiers: [{threshold,reward_type,label,reached,claimed,claimable}] }
export async function getReferralSummary() {
  const { data, error } = await supabase.rpc('get_referral_summary');
  if (error) throw error;
  return data || null;
}

export async function getOrCreateReferralCode() {
  const { data, error } = await supabase.rpc('get_or_create_referral_code');
  if (error) throw error;
  return data || null;
}

export async function setReferralCode(code) {
  const { data, error } = await supabase.rpc('set_referral_code', { p_code: code });
  if (error) throw error;
  return data || null;
}

export async function logReferralShare(channel = 'link') {
  try { await supabase.rpc('log_referral_share', { p_channel: channel }); } catch {}
}

export async function claimReferralReward(threshold) {
  const { data, error } = await supabase.rpc('claim_referral_reward', { p_threshold: threshold });
  if (error) throw error;
  return data || null;
}

// ── Link helpers ─────────────────────────────────────────────────────────────

export function referralLink(code) {
  const origin = (typeof window !== 'undefined' && window.location?.origin) || 'https://prmpted.app';
  return `${origin}/?ref=${encodeURIComponent(code)}`;
}
