// Client wrappers for the account-deletion flow.
//
// - Immediate delete runs the `delete-account` edge function (self or admin).
// - Scheduled (30-day) delete + cancel go through the SECURITY DEFINER RPCs,
//   which set/clear the grace-window lock (is_suspended + pending_deletion).
//
// mode:   'anonymize' (keep posts as "[deleted user]") | 'purge' (remove content too)
// timing: 'immediate' | 'scheduled'

import { supabase } from './supabase';

// Copy of the nftBadge error-unwrap idiom: surface the function's JSON error.
const invokeDelete = async (body) => {
  const { data, error } = await supabase.functions.invoke('delete-account', { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch { /* ignore */ }
    throw new Error(msg || 'Account deletion failed');
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

// Erase the signed-in user's own account right now.
export const deleteMyAccountNow = async ({ mode }) => {
  // Audit row first (best-effort); the function also closes it out.
  try { await supabase.rpc('request_account_deletion', { p_mode: mode, p_timing: 'immediate' }); } catch { /* non-fatal */ }
  return invokeDelete({ mode });
};

// Schedule the signed-in user's own account for deletion in 30 days (cancelable).
export const scheduleMyAccountDeletion = async ({ mode }) => {
  const { data, error } = await supabase.rpc('request_account_deletion', {
    p_mode: mode,
    p_timing: 'scheduled',
  });
  if (error) throw new Error(error.message || 'Could not schedule deletion');
  return data;
};

// Cancel a pending scheduled deletion for the signed-in user.
export const cancelMyAccountDeletion = async () => {
  const { data, error } = await supabase.rpc('cancel_account_deletion');
  if (error) throw new Error(error.message || 'Could not cancel deletion');
  return data;
};

// Admin: delete another user now (immediate) or schedule it.
export const adminDeleteUser = async ({ targetUserId, mode, timing = 'immediate' }) => {
  if (timing === 'scheduled') {
    const { data, error } = await supabase.rpc('admin_request_account_deletion', {
      p_target: targetUserId,
      p_mode: mode,
      p_timing: 'scheduled',
    });
    if (error) throw new Error(error.message || 'Could not schedule deletion');
    return data;
  }
  // Immediate: record audit + run the executor against the target.
  try {
    await supabase.rpc('admin_request_account_deletion', {
      p_target: targetUserId, p_mode: mode, p_timing: 'immediate',
    });
  } catch { /* non-fatal audit */ }
  return invokeDelete({ mode, targetUserId });
};
