// DraftsListPage - the "Drafts" overlay opened from the user's own profile.
// Design doc: docs/PROMPTED_AGENT_POSTING_DESIGN.html
//
// Lists the current user's PENDING agent-posted drafts (ones an AI created via
// the MCP / agent-post flow that haven't been published or discarded yet).
// Clicking a draft opens the existing ReviewDraftPage to edit + publish it.
//
// Self-contained (own inline styles) so it stays decoupled from App.jsx, and
// mirrors the ReviewDraftPage palette.

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ListItemSkeleton } from '../components/SkeletonLoader.jsx';
import { listPendingDrafts } from '../lib/agentPosting';

const C = {
  bg: '#0a0a0a', bg2: '#111', bg3: '#1a1a1a', border: '#2a2a2a',
  text: '#f0f0f0', muted: '#888', purple: '#a855f7', teal: '#4ECDC4',
};

const wrap = { minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Space Grotesk', system-ui, sans-serif" };
const inner = { maxWidth: 720, margin: '0 auto', padding: '32px 20px 96px' };

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function DraftsListPage({ user, onClose, onOpenDraft }) {
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      try {
        const rows = await listPendingDrafts(supabase, user.id);
        if (active) setDrafts(rows || []);
      } catch (e) {
        if (active) setError(e?.message || 'Could not load your drafts.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  return (
    <div style={wrap}>
      <div style={inner}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>📝 Your drafts</h1>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 14px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Close
          </button>
        </div>
        <p style={{ color: C.muted, fontSize: 14, marginTop: 0 }}>
          Posts your AI drafted and handed you to review. Nothing is live until you publish it.
        </p>

        {loading && (
          <div style={{ marginTop: 40 }}>{[1,2,3].map(i => <ListItemSkeleton key={i} />)}</div>
        )}

        {!loading && error && (
          <p style={{ color: '#ff6b6b', marginTop: 40 }}>{error}</p>
        )}

        {!loading && !error && drafts.length === 0 && (
          <div style={{ marginTop: 48, textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🪹</div>
            <p style={{ fontSize: 16, color: C.text, margin: '0 0 6px' }}>No drafts waiting.</p>
            <p style={{ fontSize: 14, margin: 0 }}>
              When your AI posts to Prompted, the draft shows up here for you to review and publish.
            </p>
          </div>
        )}

        {!loading && !error && drafts.length > 0 && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {drafts.map((d) => (
              <button
                key={d.id}
                onClick={() => onOpenDraft(d.id)}
                style={{
                  textAlign: 'left', background: C.bg2, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '14px 16px', color: C.text, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.purple; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; }}
              >
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                  {d.title || 'Untitled draft'}
                </div>
                <div style={{ fontSize: 12.5, color: C.muted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {d.ai_tool && <span>🤖 {d.ai_tool}</span>}
                  <span>{timeAgo(d.created_at)}</span>
                  <span style={{ color: C.teal }}>Review &amp; publish →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
