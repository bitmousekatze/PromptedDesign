import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

export default function AdminGamesQueue() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('games')
      .select('*, creator:creator_id(id,username), current_version:current_version_id(storage_path,manifest)')
      .in('status', ['in_review', 'changes_requested'])
      .order('created_at', { ascending: true });
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (id, status) => {
    const patch = { status };
    if (status === 'approved') patch.approved_at = new Date().toISOString();
    await supabase.from('games').update(patch).eq('id', id);
    load();
  };

  if (loading) return <p>Loading admin queue…</p>;

  return (
    <section style={{ marginTop: 32, padding: 16, border: '1px dashed var(--accent, #7c5cff)', borderRadius: 10 }}>
      <h2 style={{ marginTop: 0 }}>Admin: Review Queue</h2>
      {rows.length === 0 && <p style={{ color: '#888' }}>Nothing waiting for review.</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
        {rows.map(g => (
          <li key={g.id} style={{ background: 'var(--card-bg, #161821)', border: '1px solid var(--border, #262a36)', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong>{g.title}</strong> — <span style={{ color: '#888' }}>@{g.creator?.username}</span>
                <div style={{ fontSize: 12, color: '#888' }}>{g.slug} · {g.status}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={`/games/${g.slug}`} target="_blank" rel="noopener" style={{ color: 'var(--accent-2, #4ad6c4)' }}>Preview ↗</a>
                <button onClick={() => setStatus(g.id, 'approved')} style={btnOK}>Approve</button>
                <button onClick={() => setStatus(g.id, 'changes_requested')} style={btnNote}>Request changes</button>
                <button onClick={() => setStatus(g.id, 'rejected')} style={btnBad}>Reject</button>
              </div>
            </div>
            {g.tool_disclosure && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', color: '#aaa' }}>Tool disclosure</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#ccc' }}>{g.tool_disclosure}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const btnOK = { background: '#2a9d6a', color: '#fff', border: 0, borderRadius: 6, padding: '6px 12px', cursor: 'pointer' };
const btnNote = { background: '#b78c2f', color: '#fff', border: 0, borderRadius: 6, padding: '6px 12px', cursor: 'pointer' };
const btnBad = { background: '#a04545', color: '#fff', border: 0, borderRadius: 6, padding: '6px 12px', cursor: 'pointer' };
