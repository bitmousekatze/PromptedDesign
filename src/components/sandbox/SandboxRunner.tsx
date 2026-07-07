import React, { useEffect, useMemo, useState } from 'react';
import { SUPABASE_URL } from '../../lib/supabase.js';

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o'],
  anthropic: ['claude-3-5-sonnet-20241022'],
  google: ['gemini-1.5-pro'],
};

type Props = {
  postId: string;
  supabase: any;
};

export default function SandboxRunner({ postId, supabase }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [variables, setVariables] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [keys, setKeys] = useState<any[]>([]);
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState(PROVIDER_MODELS.openai[0]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

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
    if (!response.ok) {
      throw new Error(payload?.error || 'Request failed');
    }
    return payload;
  };

  const hasKey = useMemo(() => keys.some((k) => (k.provider_name || '').toLowerCase() === provider), [keys, provider]);

  useEffect(() => {
    setModel(PROVIDER_MODELS[provider][0]);
  }, [provider]);

  useEffect(() => {
    if (!expanded) return;

    const load = async () => {
      const { data } = await supabase
        .from('workflow_variable_definitions')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      setVariables(data || []);

      const defaults: Record<string, string> = {};
      (data || []).forEach((item: any) => {
        defaults[item.variable_name] = item.default_value || '';
      });
      setValues(defaults);

      try {
        const keysData = await callSandboxFunction('sandbox-keys', { method: 'GET' });
        setKeys(keysData?.data || []);
      } catch {
        setKeys([]);
      }
    };

    load();
  }, [expanded, postId, supabase]);

  const handleRun = async () => {
    setRunning(true);
    setError('');
    setResult(null);

    try {
      const data = await callSandboxFunction('sandbox-run', {
        method: 'POST',
        body: JSON.stringify({
          post_id: postId,
          provider_name: provider,
          model_name: model,
          variable_values: values,
        }),
      });
      setResult(data);
    } catch (runError: any) {
      setError(runError?.message || 'Run failed');
    }

    setRunning(false);
  };

  const handleSaveOutput = async () => {
    if (!result?.run_id) return;

    try {
      await callSandboxFunction('sandbox-history/save', {
        method: 'POST',
        body: JSON.stringify({ workflow_run_id: result.run_id }),
      });
    } catch (saveError: any) {
      setError(saveError.message || 'Failed to save output');
    }
  };

  return (
    <div className="full-post-prompt-section" style={{ marginTop: '1rem' }}>
      <div className="full-post-prompt-header">
        <div className="full-post-prompt-label">AI Workflow Sandbox</div>
        <button className="full-post-copy-btn" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Hide' : 'Run this prompt'}
        </button>
      </div>

      {expanded && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {variables.map((item) => (
            <label key={item.id} style={{ display: 'grid', gap: '0.35rem', color: '#ddd' }}>
              <span>{item.label || item.variable_name} {item.is_required ? '*' : ''}</span>
              <input
                type={item.input_type === 'number' ? 'number' : 'text'}
                value={values[item.variable_name] || ''}
                placeholder={item.description || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [item.variable_name]: e.target.value }))}
                style={{ background: '#151522', border: '1px solid #333', borderRadius: '8px', color: '#fff', padding: '0.6rem' }}
              />
            </label>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Provider</span>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ background: '#151522', border: '1px solid #333', borderRadius: '8px', color: '#fff', padding: '0.6rem' }}>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Model</span>
              <select value={model} onChange={(e) => setModel(e.target.value)} style={{ background: '#151522', border: '1px solid #333', borderRadius: '8px', color: '#fff', padding: '0.6rem' }}>
                {PROVIDER_MODELS[provider].map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>

          {!hasKey && <div style={{ color: '#f0c674', fontSize: '0.9rem' }}>No API key found for this provider. Add one in Settings → API Keys.</div>}

          <button className="full-post-demo-btn" onClick={handleRun} disabled={running || !hasKey}>
            {running ? 'Running...' : 'Run'}
          </button>

          {error && <div style={{ color: '#ff8f8f' }}>{error}</div>}
          {result?.output_text && (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <textarea readOnly value={result.output_text} style={{ minHeight: '180px', background: '#10101a', border: '1px solid #333', borderRadius: '10px', color: '#f5f5f5', padding: '0.8rem' }} />
              <button className="full-post-copy-btn" onClick={handleSaveOutput}>Save this output</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
