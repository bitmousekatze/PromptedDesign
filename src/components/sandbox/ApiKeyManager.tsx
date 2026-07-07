import React, { useEffect, useState } from 'react';
import { SUPABASE_URL } from '../../lib/supabase.js';

type Props = {
  supabase: any;
};

const PROVIDERS = ['openai', 'anthropic', 'google'];

export default function ApiKeyManager({ supabase }: Props) {
  const [keys, setKeys] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

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

  const loadKeys = async () => {
    try {
      const data = await callSandboxFunction('sandbox-keys', { method: 'GET' });
      setKeys(data?.data || []);
    } catch {
      setKeys([]);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const addKey = async (provider: string) => {
    const apiKey = values[provider];
    if (!apiKey) return;
    setLoading(true);
    await callSandboxFunction('sandbox-keys', { method: 'POST', body: JSON.stringify({ provider_name: provider, api_key: apiKey }) });
    setValues((prev) => ({ ...prev, [provider]: '' }));
    await loadKeys();
    setLoading(false);
  };

  const deleteKey = async (provider: string) => {
    setLoading(true);
    await callSandboxFunction('sandbox-keys', { method: 'DELETE', body: JSON.stringify({ provider_name: provider }) });
    await loadKeys();
    setLoading(false);
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">🔐 AI Sandbox API Keys</h3>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Bring your own key (BYOK). Keys are encrypted and only used server-side for sandbox runs.</p>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {PROVIDERS.map((provider) => {
          const existing = keys.find((k) => (k.provider_name || '').toLowerCase() === provider);
          return (
            <div key={provider} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <strong style={{ textTransform: 'capitalize' }}>{provider}</strong>
                {existing ? (
                  <button className="full-post-copy-btn" onClick={() => deleteKey(provider)} disabled={loading}>Delete</button>
                ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No key saved</span>}
              </div>
              {existing && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>Last updated: {new Date(existing.updated_at || existing.created_at).toLocaleString()}</div>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="password" value={values[provider] || ''} onChange={(e) => setValues((prev) => ({ ...prev, [provider]: e.target.value }))} placeholder={`Enter ${provider} API key`} style={{ flex: 1, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.55rem 0.65rem' }} />
                <button className="full-post-copy-btn" onClick={() => addKey(provider)} disabled={loading || !(values[provider] || '').trim()}>Save key</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
