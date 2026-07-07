import { supabase } from './supabase.js';

// Admin content-moderation queue — all server-gated on is_admin() via RPC.

export const fetchReports = async (status = 'pending') => {
  const { data, error } = await supabase.rpc('admin_reports_list', { p_status: status });
  if (error) throw error;
  return data || [];
};

export const setReportStatus = async (reportId, status) => {
  const { error } = await supabase.rpc('admin_report_set_status', {
    p_report_id: reportId,
    p_status: status,
  });
  if (error) throw error;
};

// remove=true rejects the content (and clears its pending reports); remove=false restores it.
export const moderateContent = async (contentType, contentId, remove) => {
  const { error } = await supabase.rpc('admin_moderate_content', {
    p_content_type: contentType,
    p_content_id: contentId,
    p_remove: remove,
  });
  if (error) throw error;
};
