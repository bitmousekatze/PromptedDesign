import React, { useEffect, useState } from 'react';
import { SUPABASE_URL } from '../../lib/supabase.js';

type Props = {
  postId: string;
  supabase: any;
};

export default function RunHistory({ postId, supabase }: Props) {
  const [runs, setRuns] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);

  const callSandboxFunction = async (path: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Request failed');
    return payload;
  };

  const loadRuns = async () => {
    try {
      const data = await callSandboxFunction(`sandbox-history?post_id=${postId}`, { method: 'GET' });
      setRuns((data?.data || []).slice(0, 10));
    } catch {
      setRuns([]);
    }
  };

  useEffect(() => {
    if (expanded) loadRuns();
  }, [expanded, postId]);

  const saveRun = async (runId: string) => {
    await callSandboxFunction('sandbox-history/save', {
      method: 'POST',
      body: JSON.stringify({ workflow_run_id: runId }),
    });
  };

  return (
    <div className="full-post-prompt-section" style={{ marginTop: '1rem' }}>
      <div className="full-post-prompt-header">
        <div className="full-post-prompt-label">Recent sandbox runs</div>
        <button className="full-post-copy-btn" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Hide' : 'Show history'}</button>
      </div>
      {expanded && (
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {runs.length === 0 && <div style={{ color: '#999' }}>No runs yet.</div>}
          {runs.map((run) => (
            <details key={run.id} style={{ border: '1px solid #2b2b3d', borderRadius: '8px', padding: '0.6rem', background: '#10101a' }}>
              <summary style={{ cursor: 'pointer', color: '#ddd' }}>{run.status} · {run.model_name} · {new Date(run.created_at).toLocaleString()}</summary>
              <pre style={{ whiteSpace: 'pre-wrap', color: '#fff', marginTop: '0.5rem' }}>{run.output || ''}</pre>
              {run.status === 'success' && <button className="full-post-copy-btn" onClick={() => saveRun(run.id)}>Save</button>}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
