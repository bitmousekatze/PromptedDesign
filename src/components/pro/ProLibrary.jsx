import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

const TYPE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'skill', label: 'Skills' },
  { id: 'prompt', label: 'Prompts' },
  { id: 'agent', label: 'Agents' },
];
const TYPE_ICON = { skill: '⚙️', prompt: '✍️', agent: '🤖' };

// Pro-exclusive curated library of skills, prompts, and agents. Reads are
// RLS-gated to active Pros; admins curate from the inline form.
export default function ProLibrary({ isPro, isPlatformAdmin, addToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeTab, setTypeTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pro_library_items')
      .select('*')
      .order('is_featured', { ascending: false })
      .order('copy_count', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) addToast?.(error.message, 'error');
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (typeTab !== 'all' && it.item_type !== typeTab) return false;
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) ||
        (it.description || '').toLowerCase().includes(q) ||
        (it.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [items, typeTab, search]);

  return (
    <div>
      {/* Type tabs + search */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 2, border: '1px solid rgba(255,255,255,0.15)' }}>
          {TYPE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTypeTab(t.id)}
              style={{ ...typeTabBtn, ...(typeTab === t.id ? typeTabActive : {}) }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="form-input"
          placeholder="Search the library…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, maxWidth: 340 }}
        />
        {isPlatformAdmin && (
          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? 'Cancel' : '+ Add item (admin)'}
          </button>
        )}
      </div>

      {showAdd && isPlatformAdmin && <AddItemForm addToast={addToast} onAdded={() => { setShowAdd(false); load(); }} />}

      {loading ? (
        <p style={muted}>Loading the library…</p>
      ) : !visible.length ? (
        <div style={emptyBox}>
          {items.length
            ? 'Nothing matches that filter.'
            : 'The shelves are being stocked - new skills, prompts, and agents land here regularly.'}
        </div>
      ) : (
        <div style={grid}>
          {visible.map((it) => (
            <LibraryCard key={it.id} item={it} isPro={isPro} isPlatformAdmin={isPlatformAdmin} addToast={addToast} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryCard({ item, isPro, isPlatformAdmin, addToast, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copies, setCopies] = useState(item.copy_count);

  const copy = async () => {
    if (!item.content) return;
    try {
      await navigator.clipboard.writeText(item.content);
      setCopied(true);
      setCopies((c) => c + 1);
      setTimeout(() => setCopied(false), 1600);
      supabase.rpc('copy_pro_library_item', { p_item_id: item.id }).then(undefined, () => {});
    } catch {
      addToast?.('Could not copy to clipboard', 'error');
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${item.title}" from the library?`)) return;
    const { error } = await supabase.from('pro_library_items').delete().eq('id', item.id);
    if (error) { addToast?.(error.message, 'error'); return; }
    addToast?.('Removed', 'success');
    onChanged();
  };

  return (
    <div style={{ ...card, ...(item.is_featured ? featuredCard : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 15 }}>{TYPE_ICON[item.item_type]}</span>
        <span style={typeBadge}>{item.item_type}</span>
        {item.is_featured && <span style={{ ...typeBadge, border: '1px solid rgba(255,215,0,0.5)', color: '#ffd700' }}>featured</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>{copies} {copies === 1 ? 'copy' : 'copies'}</span>
      </div>
      <h3 style={cardTitle}>{item.title}</h3>
      {item.description && <p style={{ ...muted, margin: '8px 0 0' }}>{item.description}</p>}
      {(item.tags || []).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {item.tags.map((t) => <span key={t} style={tagChip}>{t}</span>)}
        </div>
      )}
      {expanded && item.content && (
        <pre style={contentPre}>{item.content}</pre>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {item.content && (
          <>
            <button className="btn btn-primary" style={smallBtn} disabled={!isPro && !isPlatformAdmin} onClick={copy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button className="btn" style={smallBtn} onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Hide' : 'Preview'}
            </button>
          </>
        )}
        {item.platform_url && (
          <a href={item.platform_url} target="_blank" rel="noopener noreferrer" className="btn" style={{ ...smallBtn, textDecoration: 'none' }}>
            Open ↗
          </a>
        )}
        {isPlatformAdmin && (
          <button className="btn" style={{ ...smallBtn, marginLeft: 'auto', color: '#fca5a5' }} onClick={remove}>Delete</button>
        )}
      </div>
    </div>
  );
}

function AddItemForm({ addToast, onAdded }) {
  const [itemType, setItemType] = useState('prompt');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [platformUrl, setPlatformUrl] = useState('');
  const [tags, setTags] = useState('');
  const [featured, setFeatured] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) { addToast?.('Title required', 'error'); return; }
    if (!content.trim() && !platformUrl.trim()) { addToast?.('Add content or a URL', 'error'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('pro_library_items').insert({
        item_type: itemType,
        title: title.trim(),
        description: description.trim() || null,
        content: content.trim() || null,
        platform_url: platformUrl.trim() || null,
        tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
        is_featured: featured,
      });
      if (error) throw error;
      addToast?.('Added to the library', 'success');
      onAdded();
    } catch (e) {
      addToast?.(e.message || 'Failed to add item', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 560, border: '1px solid rgba(255,255,255,0.12)', padding: 16, marginBottom: 22 }}>
      <select className="form-input" value={itemType} onChange={(e) => setItemType(e.target.value)}>
        <option value="skill">Skill</option>
        <option value="prompt">Prompt</option>
        <option value="agent">Agent</option>
      </select>
      <input className="form-input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <input className="form-input" placeholder="One-line description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
      <textarea className="form-input" placeholder="Content - the copyable prompt / skill / agent spec" rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
      <input className="form-input" placeholder="Hosted URL (optional, e.g. a GPT link)" value={platformUrl} onChange={(e) => setPlatformUrl(e.target.value)} />
      <input className="form-input" placeholder="Tags, comma-separated" value={tags} onChange={(e) => setTags(e.target.value)} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
        <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Featured
      </label>
      <button className="btn btn-primary" style={smallBtn} disabled={saving} onClick={submit}>
        {saving ? 'Adding…' : 'Add to library'}
      </button>
    </div>
  );
}

// styles
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 };
const card = { background: '#070707', border: '1px solid rgba(255,255,255,0.12)', padding: '18px 20px', display: 'flex', flexDirection: 'column' };
const featuredCard = { border: '1px solid rgba(255,215,0,0.35)' };
const cardTitle = { margin: 0, fontSize: 17, fontWeight: 500, fontFamily: "Georgia, 'Times New Roman', serif" };
const muted = { fontSize: 13.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.62)' };
const typeBadge = { fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', padding: '2px 7px', border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.6)' };
const tagChip = { fontSize: 11, padding: '2px 8px', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)', borderRadius: 999 };
const contentPre = { marginTop: 12, padding: 12, background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflow: 'auto', color: 'rgba(255,255,255,0.8)' };
const typeTabBtn = { background: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none', padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', letterSpacing: 0.5 };
const typeTabActive = { background: '#fff', color: '#0a0a0a', fontWeight: 600 };
const emptyBox = { border: '1px dashed rgba(255,255,255,0.2)', padding: '28px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 14 };
const smallBtn = { fontSize: 12, padding: '6px 12px' };
