import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { supabase } from '../../lib/supabase.js';

// SDK script (kept in sync with /public/games-sdk.js). Injected into the
// game's index.html so heartbeats + achievements work without the creator
// having to add anything.
const SDK_INJECTION = `<script>(function(){if(window.prmpted)return;function s(m){try{parent.postMessage(m,'*')}catch(e){}}function h(){if(document.visibilityState!=='visible')return;s({type:'prmpted:heartbeat',t:Date.now()})}setInterval(h,30000);setTimeout(h,2000);window.prmpted={unlock:function(k){if(!k||typeof k!=='string')return;s({type:'prmpted:achievement',id:k})}}})();</script>`;

const MAX_BYTES = 200 * 1024 * 1024;

function slugify(s) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function UploadGameModal({ user, onClose, onSubmitted }) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [pitch, setPitch] = useState('');
  const [description, setDescription] = useState('');
  const [controls, setControls] = useState('');
  const [aspect, setAspect] = useState('16:9');
  const [toolDisclosure, setToolDisclosure] = useState('');
  const [mode, setMode] = useState('url'); // 'url' | 'zip'
  const [externalUrl, setExternalUrl] = useState('');
  const [zipFile, setZipFile] = useState(null);
  const [thumb, setThumb] = useState(null);
  const [splash, setSplash] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [tags, setTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('game_tags')
        .select('*')
        .order('namespace').order('display_order');
      setAllTags(data || []);
    })();
  }, []);

  const slug = useMemo(() => slugify(title), [title]);

  const tagsByNs = useMemo(() => {
    const out = { genre: [], tool: [], field: [] };
    for (const t of allTags) out[t.namespace]?.push(t);
    return out;
  }, [allTags]);

  const urlValid = /^https:\/\/\S+\.\S+/.test(externalUrl.trim());
  // Required fields, each tagged with the step where the user can fix it. Used
  // to give explicit feedback on Submit instead of silently disabling the
  // button (which left users on step 4 with nothing happening and no message).
  const missing = [];
  if (!title.trim()) missing.push({ label: 'Title', step: 1 });
  if (!pitch.trim()) missing.push({ label: 'Pitch', step: 1 });
  if (!toolDisclosure.trim()) missing.push({ label: 'Tool disclosure', step: 2 });
  if (!tags.some(id => id.startsWith('genre_'))) missing.push({ label: 'at least one Genre tag', step: 2 });
  if (!tags.some(id => id.startsWith('tool_'))) missing.push({ label: 'at least one Tool tag', step: 2 });
  if (mode === 'url' ? !urlValid : !(zipFile && zipFile.size <= MAX_BYTES)) {
    missing.push({ label: mode === 'url' ? 'a valid Game URL' : 'a build zip (≤200MB)', step: 3 });
  }

  async function submitUrl() {
    setProgress('Submitting link…');
    let finalSlug = slug;
    const { data: existing } = await supabase.from('games').select('id').eq('slug', finalSlug).maybeSingle();
    if (existing) finalSlug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    let thumbnail_url = null, splash_url = null;
    if (thumb) {
      const path = `${finalSlug}/thumbnail.${extOf(thumb.name)}`;
      await uploadFile(path, thumb, thumb.type);
      thumbnail_url = publicUrl(path);
    }
    if (splash) {
      const path = `${finalSlug}/splash.${extOf(splash.name)}`;
      await uploadFile(path, splash, splash.type);
      splash_url = publicUrl(path);
    }
    const { data: gameRow, error: gameErr } = await supabase
      .from('games')
      .insert({
        slug: finalSlug,
        title: title.trim(),
        pitch: pitch.trim(),
        description: description.trim() || null,
        controls: controls.trim() || null,
        tool_disclosure: toolDisclosure.trim(),
        aspect_ratio: aspect,
        creator_id: user.id,
        status: 'in_review',
        external_url: externalUrl.trim(),
        thumbnail_url, splash_url,
      })
      .select().single();
    if (gameErr) throw gameErr;
    if (tags.length) {
      await supabase.from('game_tag_links').insert(tags.map(tag_id => ({ game_id: gameRow.id, tag_id })));
    }
    if (achievements.length) {
      await supabase.from('game_achievements').insert(
        achievements.map((a, i) => ({
          game_id: gameRow.id, achievement_key: a.key,
          name: a.name, description: a.description || null,
          display_order: (i + 1) * 10,
        }))
      );
    }
    setProgress('Submitted for review!');
    onSubmitted?.(gameRow);
  }

  async function uploadFile(path, blob, contentType) {
    const { error } = await supabase.storage
      .from('games')
      .upload(path, blob, { upsert: true, contentType, cacheControl: '3600' });
    if (error) throw error;
  }

  async function submit() {
    if (missing.length) {
      setError('Please add ' + missing.map(m => m.label).join(', ') + ' before submitting.');
      setStep(missing[0].step);
      return;
    }
    setBusy(true); setError(null);
    try {
      if (mode === 'url') { await submitUrl(); return; }
      setProgress('Reading zip…');
      // 1. Read zip
      const zip = await JSZip.loadAsync(zipFile);
      const files = Object.values(zip.files).filter(f => !f.dir);
      const hasIndex = files.some(f => /^(?:[^/]+\/)?index\.html$/i.test(f.name));
      if (!hasIndex) throw new Error('Zip must contain index.html at the root (or inside a single top-level folder).');

      // Detect a single wrapping folder and strip it
      const segments = files.map(f => f.name.split('/'));
      let stripPrefix = '';
      const firstSeg = segments[0]?.[0] || '';
      if (segments.every(s => s.length > 1 && s[0] === firstSeg)) stripPrefix = firstSeg + '/';

      // 2. Reserve slug + insert game row (draft)
      setProgress('Creating draft…');
      let finalSlug = slug;
      const { data: existing } = await supabase.from('games').select('id').eq('slug', finalSlug).maybeSingle();
      if (existing) finalSlug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

      const { data: gameRow, error: gameErr } = await supabase
        .from('games')
        .insert({
          slug: finalSlug,
          title: title.trim(),
          pitch: pitch.trim(),
          description: description.trim() || null,
          controls: controls.trim() || null,
          tool_disclosure: toolDisclosure.trim(),
          aspect_ratio: aspect,
          creator_id: user.id,
          status: 'draft',
        })
        .select()
        .single();
      if (gameErr) throw gameErr;

      const basePath = `${finalSlug}/v1`;

      // 3. Upload build files
      setProgress(`Uploading ${files.length} files…`);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const cleanName = file.name.slice(stripPrefix.length);
        if (!cleanName) continue;
        let blob = await file.async('blob');
        let contentType = guessMime(cleanName);
        // Inject SDK into index.html
        if (/^index\.html$/i.test(cleanName)) {
          const html = await blob.text();
          const injected = html.replace(/<\/head>/i, `${SDK_INJECTION}</head>`);
          blob = new Blob([injected === html ? `${SDK_INJECTION}\n${html}` : injected], { type: 'text/html' });
          contentType = 'text/html';
        }
        await uploadFile(`${basePath}/${cleanName}`, blob, contentType);
        setProgress(`Uploading ${i + 1}/${files.length}…`);
      }

      // 4. Upload thumbnail + optional splash
      let thumbnail_url = null, splash_url = null;
      if (thumb) {
        const path = `${finalSlug}/thumbnail.${extOf(thumb.name)}`;
        await uploadFile(path, thumb, thumb.type);
        thumbnail_url = publicUrl(path);
      }
      if (splash) {
        const path = `${finalSlug}/splash.${extOf(splash.name)}`;
        await uploadFile(path, splash, splash.type);
        splash_url = publicUrl(path);
      }

      // 5. Insert game_version
      setProgress('Finalizing…');
      const manifest = {
        entry: 'index.html',
        aspectRatio: aspect,
        achievements: achievements.map(a => ({ id: a.key, name: a.name, description: a.description })),
        controls,
        version: 1,
      };
      const { data: ver, error: verErr } = await supabase
        .from('game_versions')
        .insert({ game_id: gameRow.id, version: 1, storage_path: basePath, manifest })
        .select().single();
      if (verErr) throw verErr;

      // 6. Update game with version + thumb/splash, flip to in_review
      const { error: updErr } = await supabase
        .from('games')
        .update({
          current_version_id: ver.id,
          thumbnail_url, splash_url,
          status: 'in_review',
        })
        .eq('id', gameRow.id);
      if (updErr) throw updErr;

      // 7. Tag links + achievement rows
      if (tags.length) {
        await supabase.from('game_tag_links').insert(
          tags.map(tag_id => ({ game_id: gameRow.id, tag_id }))
        );
      }
      if (achievements.length) {
        await supabase.from('game_achievements').insert(
          achievements.map((a, i) => ({
            game_id: gameRow.id,
            achievement_key: a.key,
            name: a.name,
            description: a.description || null,
            display_order: (i + 1) * 10,
          }))
        );
      }

      setProgress('Submitted for review!');
      onSubmitted?.(gameRow);
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Submit a Game</h2>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <div style={{ color: '#888', marginBottom: 16, fontSize: 13 }}>Step {step} of 4</div>

        {error && <div style={errBox}>{error}</div>}

        {step === 1 && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Label>Title*</Label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} maxLength={80} />
            <Label>Pitch (≤140 chars)*</Label>
            <input value={pitch} onChange={(e) => setPitch(e.target.value.slice(0, 140))} style={input} />
            <Label>Long description</Label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...input, minHeight: 100 }} />
            <Label>Controls</Label>
            <textarea value={controls} onChange={(e) => setControls(e.target.value)} style={{ ...input, minHeight: 60 }} placeholder="e.g. Arrow keys to move, Space to jump" />
            <Label>Aspect ratio</Label>
            <select value={aspect} onChange={(e) => setAspect(e.target.value)} style={input}>
              <option value="16:9">16:9</option>
              <option value="4:3">4:3</option>
              <option value="1:1">1:1</option>
              <option value="9:16">9:16 (portrait)</option>
            </select>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Label>Tool disclosure*</Label>
            <textarea
              value={toolDisclosure}
              onChange={(e) => setToolDisclosure(e.target.value)}
              style={{ ...input, minHeight: 100 }}
              placeholder="Which AI tool(s) did you use? Paste a representative prompt or link to a chat transcript."
            />
            <Label>Tags — pick at least one Genre and one Tool</Label>
            <TagPicker namespace="genre" tags={tagsByNs.genre} value={tags} onChange={setTags} />
            <TagPicker namespace="tool" tags={tagsByNs.tool} value={tags} onChange={setTags} />
            {tagsByNs.field.length > 0 && (
              <>
                <Label>Field (optional — who is this for?)</Label>
                <TagPicker namespace="field" tags={tagsByNs.field} value={tags} onChange={setTags} />
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div style={{ display:'grid', gap:12 }}>
            <div style={{ display:'flex', gap:8, marginBottom:4 }}>
              <button type="button" onClick={() => setMode('url')} style={mode==='url' ? primaryBtn : secondaryBtn}>🔗 Share a link</button>
              <button type="button" onClick={() => setMode('zip')} style={mode==='zip' ? primaryBtn : secondaryBtn}>📦 Upload zip</button>
            </div>
            {mode === 'url' ? (
              <>
                <Label>Game URL (https://…)*</Label>
                <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://yourgame.lovable.app/ or https://yourname.github.io/yourgame/" style={input} />
                <small style={{ color:'#888' }}>
                  Works with Lovable previews, Replit, GitHub Pages, Vercel, Netlify — anything that serves your game over HTTPS. To award builder points for in-game achievements, your game can call <code>window.parent.postMessage({'{'}type:'prmpted:achievement',id:'your_key'{'}'}, '*')</code> from inside the iframe.
                </small>
                <Label>Thumbnail image (recommended)</Label>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setThumb(e.target.files?.[0] || null)} />
                <Label>Splash image (optional)</Label>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setSplash(e.target.files?.[0] || null)} />
              </>
            ) : (
              <ZipUploadFields zipFile={zipFile} setZipFile={setZipFile} setThumb={setThumb} setSplash={setSplash} />
            )}
          </div>
        )}
        {false && step === 3 && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Label>Build zip (≤200MB) — must contain index.html at root*</Label>
            <input type="file" accept=".zip,application/zip" onChange={(e) => setZipFile(e.target.files?.[0] || null)} />
            {zipFile && <small style={{ color: '#888' }}>{zipFile.name} — {(zipFile.size / 1024 / 1024).toFixed(2)} MB</small>}
            <Label>Thumbnail (1280×720 recommended)</Label>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setThumb(e.target.files?.[0] || null)} />
            <Label>Splash screen (optional, shown while loading)</Label>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setSplash(e.target.files?.[0] || null)} />
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Label>Achievements (optional — up to 20)</Label>
            <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
              From inside your game, call <code>prmpted.unlock('your_key')</code> to award the player 15 builder points.
              The SDK is auto-injected into your index.html.
            </p>
            <AchievementsEditor value={achievements} onChange={setAchievements} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1 || busy} style={secondaryBtn}>← Back</button>
          {step < 4 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={busy} style={primaryBtn}>Next →</button>
          ) : (
            <button onClick={submit} disabled={busy} style={primaryBtn}>
              {busy ? (progress || 'Submitting…') : 'Submit for review'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ZipUploadFields({ zipFile, setZipFile, setThumb, setSplash }) {
  return (
    <>
      <Label>Build zip (≤200MB) — must contain index.html at root*</Label>
      <input type="file" accept=".zip,application/zip" onChange={(e) => setZipFile(e.target.files?.[0] || null)} />
      {zipFile && <small style={{ color:'#888' }}>{zipFile.name} — {(zipFile.size / 1024 / 1024).toFixed(2)} MB</small>}
      <Label>Thumbnail image (recommended)</Label>
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setThumb(e.target.files?.[0] || null)} />
      <Label>Splash image (optional)</Label>
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setSplash(e.target.files?.[0] || null)} />
    </>
  );
}

function TagPicker({ namespace, tags, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {tags.map(t => {
        const active = value.includes(t.id);
        return (
          <button key={t.id} type="button"
            onClick={() => onChange(active ? value.filter(x => x !== t.id) : [...value, t.id])}
            style={{
              background: active ? 'var(--accent, #7c5cff)' : 'var(--card-bg, #161821)',
              color: active ? '#fff' : 'inherit',
              border: '1px solid var(--border, #262a36)',
              borderRadius: 999, padding: '4px 10px', fontSize: 13, cursor: 'pointer',
            }}>
            {t.icon ? `${t.icon} ` : ''}{t.name}
          </button>
        );
      })}
    </div>
  );
}

function AchievementsEditor({ value, onChange }) {
  const add = () => onChange([...value, { key: '', name: '', description: '' }]);
  const upd = (i, patch) => onChange(value.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  const rm = (i) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {value.map((a, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 8 }}>
          <input placeholder="key (e.g. first_blood)" value={a.key} onChange={(e) => upd(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })} style={input} />
          <input placeholder="Name" value={a.name} onChange={(e) => upd(i, { name: e.target.value })} style={input} />
          <input placeholder="Description" value={a.description} onChange={(e) => upd(i, { description: e.target.value })} style={input} />
          <button type="button" onClick={() => rm(i)} style={secondaryBtn}>✕</button>
        </div>
      ))}
      {value.length < 20 && <button type="button" onClick={add} style={secondaryBtn}>+ Add achievement</button>}
    </div>
  );
}

const Label = ({ children }) => <label style={{ fontSize: 13, color: '#aaa' }}>{children}</label>;
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, zIndex: 9999, overflowY: 'auto' };
const modal = { background: 'var(--card-bg, #161821)', border: '1px solid var(--border, #262a36)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 640, color: 'inherit' };
const closeBtn = { background: 'transparent', border: 0, color: '#888', fontSize: 20, cursor: 'pointer' };
const input = { background: '#0e0f13', color: 'inherit', border: '1px solid var(--border, #262a36)', borderRadius: 8, padding: '8px 10px', font: 'inherit' };
const primaryBtn = { background: 'var(--accent, #7c5cff)', color: '#fff', border: 0, borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontWeight: 600 };
const secondaryBtn = { background: 'transparent', color: 'inherit', border: '1px solid var(--border, #262a36)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' };
const errBox = { background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.4)', borderRadius: 8, padding: 12, marginBottom: 16, color: '#ff8a8a', fontSize: 13 };

function extOf(name) { const m = name.match(/\.([a-z0-9]+)$/i); return m ? m[1].toLowerCase() : 'bin'; }
function publicUrl(path) {
  return supabase.storage.from('games').getPublicUrl(path).data.publicUrl;
}
function guessMime(name) {
  const e = extOf(name);
  return {
    html: 'text/html', htm: 'text/html', css: 'text/css', js: 'application/javascript',
    mjs: 'application/javascript', json: 'application/json',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    woff: 'font/woff', woff2: 'font/woff2',
  }[e] || 'application/octet-stream';
}
