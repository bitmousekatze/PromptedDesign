// ConnectAgent - Settings → Connect Agent (Agent Posting / MCP, Phase 1).
// Design doc: docs/PROMPTED_AGENT_POSTING_DESIGN.html
//
// Generate / list / revoke personal access tokens, and show the setup snippet
// the user pastes into their agent. The raw token is shown exactly once.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { createApiToken, listApiTokens, revokeApiToken } from '../../lib/agentPosting';

const ENDPOINT = 'https://hgzkeaicuxvqsiacqnul.supabase.co/functions/v1/agent-post';

export default function ConnectAgent({ user }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState('');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      try {
        const rows = await listApiTokens(supabase, userId);
        if (active) setTokens(rows);
      } catch (e) {
        if (active) setError(e.message || 'Failed to load connections');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [userId]);

  const handleCreate = async () => {
    if (!userId) return;
    setCreating(true);
    setError('');
    try {
      const { token, row } = await createApiToken(supabase, userId, label);
      setFreshToken(token);
      setTokens((prev) => [row, ...prev]);
      setLabel('');
    } catch (e) {
      setError(e.message || 'Failed to create token');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm('Revoke this connection? Any agent using it will stop being able to post.')) return;
    try {
      await revokeApiToken(supabase, id);
      setTokens((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e.message || 'Failed to revoke token');
    }
  };

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const tokenForSnippet = freshToken || 'prmpt_live_YOUR_TOKEN';

  // Recommended path: one-click MCP server (Claude Desktop / Cursor / Claude Code).
  const mcpConfig = `{
  "mcpServers": {
    "prompted": {
      "command": "npx",
      "args": ["-y", "@prmpted/mcp"],
      "env": { "PROMPTED_TOKEN": "${tokenForSnippet}" }
    }
  }
}`;

  // Fallback path: any agent that can run a command can hit the endpoint directly.
  const snippet = `curl -X POST ${ENDPOINT} \\
  -H "Authorization: Bearer ${tokenForSnippet}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "What I built",
    "body": "A short writeup of the build and how it works.",
    "prompts": ["the key prompt I used"],
    "ai_tool": "Claude Code",
    "github_repo_url": "https://github.com/me/project"
  }'`;

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">🤖 Connect Agent</h3>
      <p style={{ color: '#888', fontSize: 13, margin: '0 0 14px', lineHeight: 1.6 }}>
        Let your AI agent post your builds for you. Generate a personal token, give it to your
        agent once, and say <em>“post this build to Prompted.”</em> Your agent writes the draft -
        you add screenshots and publish from a review link. Nothing goes live until you approve it.
        {' '}Works with Claude Desktop, Claude Code, and Cursor via MCP.
        {' '}<a href="/agent-kit/prompted-posting-guide.md" target="_blank" rel="noopener noreferrer" style={{ color: '#4796E3' }}>How it works →</a>
      </p>

      {/* Create */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name this connection (e.g. Claude Code on my laptop)"
          maxLength={120}
          style={{ flex: '1 1 240px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, color: '#f0f0f0', padding: '10px 12px', fontSize: 14 }}
        />
        <button onClick={handleCreate} disabled={creating}
          style={{ background: '#a855f7', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: creating ? 'wait' : 'pointer' }}>
          {creating ? 'Generating…' : 'Generate token'}
        </button>
      </div>

      {error && <p style={{ color: '#D97757', fontSize: 13 }}>{error}</p>}

      {/* Freshly generated token - shown once */}
      {freshToken && (
        <div style={{ background: 'rgba(16,163,127,0.08)', border: '1px solid rgba(16,163,127,0.4)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#10A37F', fontWeight: 600, marginBottom: 8 }}>
            ✓ Copy this now - you won’t see it again.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 10px', fontSize: 13, color: '#C9A227', wordBreak: 'break-all' }}>{freshToken}</code>
            <button onClick={() => copy(freshToken, 'fresh')} style={miniBtn}>{copied === 'fresh' ? 'Copied' : 'Copy'}</button>
          </div>

          {/* Recommended: MCP one-click setup */}
          <div style={{ fontSize: 12, color: '#888', margin: '16px 0 6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Set up your agent <span style={{ color: '#a855f7' }}>· recommended</span>
          </div>
          <p style={{ fontSize: 12.5, color: '#aaa', margin: '0 0 8px', lineHeight: 1.5 }}>
            Add this to your MCP config in <strong>Claude Desktop, Claude Code, or Cursor</strong>, then restart.
            Your agent gets a <code style={{ color: '#C9A227' }}>create_post</code> tool - just say “post this build to Prompted.”
          </p>
          <div style={{ position: 'relative' }}>
            <pre style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12, overflowX: 'auto', fontSize: 12, color: '#d4d4d4', margin: 0 }}>{mcpConfig}</pre>
            <button onClick={() => copy(mcpConfig, 'mcp')} style={{ ...miniBtn, position: 'absolute', top: 8, right: 8 }}>{copied === 'mcp' ? 'Copied' : 'Copy'}</button>
          </div>

          {/* Fallback: raw HTTP for any curl-capable agent */}
          <details style={{ marginTop: 12 }}>
            <summary style={{ fontSize: 12.5, color: '#aaa', cursor: 'pointer' }}>Or post directly with <code style={{ color: '#C9A227' }}>curl</code> (any agent)</summary>
            <div style={{ position: 'relative', marginTop: 8 }}>
              <pre style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 8, padding: 12, overflowX: 'auto', fontSize: 12, color: '#d4d4d4', margin: 0 }}>{snippet}</pre>
              <button onClick={() => copy(snippet, 'snip')} style={{ ...miniBtn, position: 'absolute', top: 8, right: 8 }}>{copied === 'snip' ? 'Copied' : 'Copy'}</button>
            </div>
          </details>

          <p style={{ fontSize: 12, color: '#666', marginTop: 12 }}>
            Either way, the response includes a <code style={{ color: '#C9A227' }}>review_url</code> - open it while logged in to add screenshots and publish.
            {' '}<a href="/agent-kit/prompted-posting-guide.md" target="_blank" rel="noopener noreferrer" style={{ color: '#4796E3' }}>Full agent guide →</a>
          </p>
        </div>
      )}

      {/* Existing connections */}
      {loading ? (
        <p style={{ color: '#888', fontSize: 13 }}>Loading connections…</p>
      ) : tokens.length === 0 ? (
        <p style={{ color: '#666', fontSize: 13 }}>No connections yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tokens.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#111', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label || 'Untitled connection'}</div>
                <div style={{ fontSize: 12, color: '#888', fontFamily: "'JetBrains Mono', monospace" }}>
                  {t.token_prefix ? `${t.token_prefix}…` : 'prmpt_live_…'}
                  {t.last_used_at ? ` · last used ${new Date(t.last_used_at).toLocaleDateString()}` : ' · never used'}
                </div>
              </div>
              <button onClick={() => handleRevoke(t.id)} style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#D97757', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>Revoke</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const miniBtn = {
  background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#f0f0f0',
  borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
};
