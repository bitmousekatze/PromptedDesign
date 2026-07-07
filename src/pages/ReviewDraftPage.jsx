// ReviewDraftPage — the /review/:id screen for Agent Posting (MCP).
// Design doc: docs/PROMPTED_AGENT_POSTING_DESIGN.html
//
// Loads an agent-submitted draft (RLS guarantees the viewer owns it), shows a
// pre-filled, editable build form, lets the user add the screenshots the agent
// could not, then publishes through the normal post flow. Nothing here ever
// touches the live feed until the user presses Publish.
//
// Self-contained (own inline styles) so it stays decoupled from App.jsx.

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getDraft, publishDraft, discardDraft } from '../lib/agentPosting';
import { uploadMultiplePostImages, uploadMultiplePostVideos, validateFile, validateVideoFile } from '../lib/storage';
import { buildPostPath, extractPostId } from '../lib/postUrl';
import { RichText } from '../lib/richText';

const C = {
  bg: '#0a0a0a', bg2: '#111', bg3: '#1a1a1a', border: '#2a2a2a',
  text: '#f0f0f0', muted: '#888', purple: '#a855f7', teal: '#4ECDC4',
  green: '#10A37F', coral: '#D97757',
};

const wrap = { minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Space Grotesk', system-ui, sans-serif" };
const inner = { maxWidth: 760, margin: '0 auto', padding: '32px 20px 96px' };
const label = { display: 'block', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.6px', color: C.muted, margin: '18px 0 6px' };
const field = { width: '100%', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };

export default function ReviewDraftPage({ draftId, currentUser, onClose, onPublished }) {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState('');

  // editable form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [prompts, setPrompts] = useState([]);
  const [aiTool, setAiTool] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [difficulty, setDifficulty] = useState('');

  const [categories, setCategories] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);

  const [communities, setCommunities] = useState([]);
  const [communityIds, setCommunityIds] = useState([]);

  // Optional repost: embed an existing Prompted post ("Reposted from @user").
  const [repostEnabled, setRepostEnabled] = useState(false);
  const [repostUrl, setRepostUrl] = useState('');
  const [repostPreview, setRepostPreview] = useState(null); // fetched original post
  const [repostError, setRepostError] = useState('');

  // Optional poll attached to the published post.
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const updatePollOption = (i, v) => setPollOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));
  const addPollOption = () => setPollOptions((prev) => (prev.length >= 6 ? prev : [...prev, '']));
  const removePollOption = (i) => setPollOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));

  const [bodyFocused, setBodyFocused] = useState(false);
  // 'edit' shows the raw markdown textarea; 'preview' renders it exactly like a
  // live post so authors see the formatting instead of literal **stars**.
  const [bodyMode, setBodyMode] = useState('preview');

  const [imageFiles, setImageFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const fileRef = useRef(null);

  const [videoFiles, setVideoFiles] = useState([]);
  const [videoPreviews, setVideoPreviews] = useState([]);
  const videoRef = useRef(null);

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  // ── Load draft + categories ────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [d, cats] = await Promise.all([
          getDraft(supabase, draftId),
          supabase.from('categories').select('id, name').order('display_order'),
        ]);
        if (!active) return;
        if (!d) {
          setLoadError('not-found');
        } else {
          setDraft(d);
          setTitle(d.title || '');
          setBody(d.body || '');
          setPrompts(Array.isArray(d.prompts) ? d.prompts.filter(Boolean) : []);
          setAiTool(d.ai_tool || '');
          setDemoUrl(d.demo_url || '');
          setGithubUrl(d.github_repo_url || '');
          // If the agent linked a Prompted post in the body, offer to repost it.
          const linked = (d.body || '').match(/https?:\/\/[^\s)]*\/post\/[^\s)]+/i);
          if (linked && extractPostId(linked[0])) {
            setRepostUrl(linked[0]);
            setRepostEnabled(true);
          }
        }
        setCategories(cats.data || []);

        // Load the communities the current user can post into (same as the
        // create-post flow: their memberships -> communities_with_stats).
        if (currentUser?.id) {
          const { data: memberships } = await supabase
            .from('community_members')
            .select('community_id')
            .eq('user_id', currentUser.id);
          const ids = (memberships || []).map((m) => m.community_id);
          if (active && ids.length) {
            const { data: comms } = await supabase
              .from('communities_with_stats')
              .select('id, name, icon_url')
              .in('id', ids);
            const REMOVED = ['eijrbi', 'name', 'community'];
            if (active) setCommunities((comms || []).filter((c) => !REMOVED.includes(c.name?.toLowerCase())));
          }
        }
      } catch (e) {
        if (active) setLoadError(e.message || 'load-failed');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [draftId, currentUser?.id]);

  // Fetch a preview of the post being reposted (debounced-ish via the URL dep).
  useEffect(() => {
    if (!repostEnabled) { setRepostPreview(null); setRepostError(''); return; }
    const id = extractPostId(repostUrl);
    if (!id) { setRepostPreview(null); setRepostError(repostUrl.trim() ? "That doesn't look like a Prompted post link." : ''); return; }
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('posts_with_stats')
        .select('id, title, username, display_name, avatar_url, avatar_emoji, images, description')
        .eq('id', id)
        .maybeSingle();
      if (!active) return;
      if (error || !data) { setRepostPreview(null); setRepostError('Could not find that post.'); return; }
      setRepostError('');
      setRepostPreview(data);
    })();
    return () => { active = false; };
  }, [repostEnabled, repostUrl]);

  // Clean up object URLs.
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  useEffect(() => () => videoPreviews.forEach((u) => URL.revokeObjectURL(u)), [videoPreviews]);

  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const valid = [];
    for (const f of picked) {
      const v = validateFile(f);
      if (v.valid) valid.push(f);
      else setError(`${f.name}: ${v.error}`);
    }
    if (valid.length) {
      setImageFiles((prev) => [...prev, ...valid]);
      setPreviews((prev) => [...prev, ...valid.map((f) => URL.createObjectURL(f))]);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeImage = (i) => {
    setImageFiles((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[i]);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const onPickVideos = (e) => {
    const picked = Array.from(e.target.files || []);
    const valid = [];
    for (const f of picked) {
      const v = validateVideoFile(f);
      if (v.valid) valid.push(f);
      else setError(`${f.name}: ${v.error}`);
    }
    if (valid.length) {
      setVideoFiles((prev) => [...prev, ...valid]);
      setVideoPreviews((prev) => [...prev, ...valid.map((f) => URL.createObjectURL(f))]);
    }
    if (videoRef.current) videoRef.current.value = '';
  };

  const removeVideo = (i) => {
    setVideoFiles((prev) => prev.filter((_, idx) => idx !== i));
    setVideoPreviews((prev) => {
      URL.revokeObjectURL(prev[i]);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const toggleCategory = (id) => {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const toggleCommunity = (id) => {
    setCommunityIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  // Preview the agent's design doc in a new tab before publishing. We strip
  // <script> first so the preview matches how it'll be served once hosted
  // (api/design-doc/[id].js applies a strict, script-free CSP).
  const viewDesignDoc = () => {
    if (!draft?.design_doc_html) return;
    const safe = draft.design_doc_html.replace(/<script[\s\S]*?<\/script>/gi, '');
    const blob = new Blob([safe], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Give the new tab time to load before reclaiming the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const updatePrompt = (i, v) => setPrompts((prev) => prev.map((p, idx) => (idx === i ? v : p)));

  const canPublish = useMemo(
    () => title.trim() && (imageFiles.length > 0 || videoFiles.length > 0) && (demoUrl.trim() || githubUrl.trim()) && !publishing,
    [title, imageFiles, videoFiles, demoUrl, githubUrl, publishing],
  );

  const handlePublish = async () => {
    setError('');
    if (!imageFiles.length && !videoFiles.length) { setError('Builds need at least one screenshot or video. Add a screenshot or video before publishing.'); return; }
    if (!demoUrl.trim() && !githubUrl.trim()) { setError('Add a demo link or a GitHub repo so people can check out the build.'); return; }
    if (pollEnabled && pollOptions.filter((o) => o.trim()).length < 2) { setError('A poll needs at least two options.'); return; }
    if (repostEnabled && !repostPreview) { setError("That repost link isn't a valid Prompted post — fix it or turn off repost."); return; }
    setPublishing(true);
    try {
      const { urls, errors } = await uploadMultiplePostImages(supabase, imageFiles, currentUser.id);
      if (errors.length) { setError(errors.join(', ')); setPublishing(false); return; }

      let videoItems = [];
      if (videoFiles.length) {
        const { videos, errors: videoErrors } = await uploadMultiplePostVideos(supabase, videoFiles, currentUser.id);
        if (videoErrors.length) { setError(videoErrors.join(', ')); setPublishing(false); return; }
        videoItems = videos;
      }

      // Publish with the (possibly edited) form values.
      const editedDraft = {
        ...draft,
        title: title.trim(),
        body: body.trim(),
        prompts: prompts.map((p) => (p || '').trim()).filter(Boolean),
        ai_tool: aiTool.trim(),
        demo_url: demoUrl.trim(),
        github_repo_url: githubUrl.trim(),
      };
      const post = await publishDraft(supabase, currentUser.id, {
        draft: editedDraft,
        imageUrls: urls,
        videos: videoItems,
        categoryIds,
        communityIds,
        difficulty,
        pollOptions: pollEnabled ? pollOptions : null,
        repostSourceId: repostEnabled && repostPreview ? repostPreview.id : null,
      });

      if (onPublished) onPublished(post);
      // Navigate to the freshly published post.
      const path = buildPostPath({ ...post, username: currentUser?.user_metadata?.username });
      window.location.href = path;
    } catch (e) {
      setError(e.message || 'Failed to publish. Please try again.');
      setPublishing(false);
    }
  };

  const handleDiscard = async () => {
    if (!draft) return;
    if (!window.confirm('Discard this draft? This cannot be undone.')) return;
    try {
      await discardDraft(supabase, draft.id);
      if (onClose) onClose();
      else window.location.href = '/';
    } catch (e) {
      setError(e.message || 'Failed to discard.');
    }
  };

  // ── Render states ────────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div style={wrap}><div style={inner}>
        <h1 style={{ fontSize: 24 }}>Log in to review your draft</h1>
        <p style={{ color: C.muted }}>This review link is private to your account. Sign in with the same account your agent is connected to, then reopen the link.</p>
        <button style={btn(C.purple)} onClick={() => (window.location.href = '/')}>Go to Prompted</button>
      </div></div>
    );
  }

  if (loading) {
    return <div style={wrap}><div style={inner}><p style={{ color: C.muted }}>Loading your draft…</p></div></div>;
  }

  if (loadError === 'not-found' || !draft) {
    return (
      <div style={wrap}><div style={inner}>
        <h1 style={{ fontSize: 24 }}>Draft not found</h1>
        <p style={{ color: C.muted }}>This draft doesn’t exist, was already handled, or belongs to a different account. Make sure you’re logged in as the account your agent is connected to.</p>
        <button style={btn(C.purple)} onClick={() => (window.location.href = '/')}>Go to Prompted</button>
      </div></div>
    );
  }

  if (draft.status !== 'pending') {
    return (
      <div style={wrap}><div style={inner}>
        <h1 style={{ fontSize: 24 }}>This draft was already {draft.status}</h1>
        <p style={{ color: C.muted }}>Nothing left to review here.</p>
        <button style={btn(C.purple)} onClick={() => (window.location.href = '/')}>Go to Prompted</button>
      </div></div>
    );
  }

  return (
    <div style={wrap}><div style={inner}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: C.purple, border: `1px solid ${C.purple}55`, padding: '3px 10px', borderRadius: 999, background: `${C.purple}18` }}>🤖 Posted from your agent</span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', margin: '4px 0 4px' }}>Review &amp; publish your build</h1>
      <p style={{ color: C.muted, marginBottom: 8 }}>Your agent wrote this up{draft.ai_tool ? ` with ${draft.ai_tool}` : ''}. Add screenshots or a video, tweak anything, then publish. Nothing is live until you hit the button.</p>

      <label style={label}>Title</label>
      <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 6px' }}>
        <span style={{ ...label, margin: 0 }}>Description</span>
        <div style={{ display: 'flex', gap: 2, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 999, padding: 2 }}>
          <button type="button" onClick={() => setBodyMode('preview')} style={segBtn(bodyMode === 'preview')}>Preview</button>
          <button type="button" onClick={() => setBodyMode('edit')} style={segBtn(bodyMode === 'edit')}>Edit</button>
        </div>
      </div>
      {bodyMode === 'edit' ? (
        <textarea
          style={{ ...field, minHeight: bodyFocused ? 280 : 160, resize: 'vertical', transition: 'min-height 0.18s ease' }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onFocus={() => setBodyFocused(true)}
          onBlur={() => setBodyFocused(false)}
          placeholder="Write your build up — **bold**, *italic*, ***bold italic***, - bullets, links and @mentions all render."
        />
      ) : (
        <div
          onClick={() => setBodyMode('edit')}
          title="Click to edit"
          className="full-post-description"
          style={{ ...field, minHeight: 160, cursor: 'text', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}
        >
          {body.trim()
            ? <RichText text={body} />
            : <span style={{ color: C.muted }}>Nothing written yet — click to add a description.</span>}
        </div>
      )}

      {prompts.length > 0 && (
        <>
          <label style={label}>Key prompts</label>
          {prompts.map((p, i) => (
            <textarea key={i} style={{ ...field, minHeight: 80, resize: 'vertical', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
              value={p} onChange={(e) => updatePrompt(i, e.target.value)} />
          ))}
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={label}>Demo / live link</label>
          <input style={field} value={demoUrl} onChange={(e) => setDemoUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div>
          <label style={label}>GitHub repo</label>
          <input style={field} value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/…" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={label}>AI tool(s)</label>
          <input style={field} value={aiTool} onChange={(e) => setAiTool(e.target.value)} placeholder="Claude Code, …" />
        </div>
        <div>
          <label style={label}>Difficulty (optional)</label>
          <select style={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">—</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      {draft.design_doc_html && draft.design_doc_html.trim() && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: `${C.teal}12`, border: `1px solid ${C.teal}44`, borderRadius: 8, fontSize: 13, color: '#cfeae8', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>📄 Your agent attached a design doc — it’ll be hosted and linked from the published build.</span>
          <button type="button" onClick={viewDesignDoc} style={{ flexShrink: 0, background: C.teal, color: '#06302d', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            View ↗
          </button>
        </div>
      )}

      <label style={label}>Screenshots &amp; videos <span style={{ color: C.coral }}>· at least one required</span></label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {previews.map((u, i) => (
          <div key={`img-${i}`} style={{ position: 'relative' }}>
            <img src={u} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
            <button onClick={() => removeImage(i)} style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: 999, border: 'none', background: C.coral, color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: '22px' }}>×</button>
          </div>
        ))}
        {videoPreviews.map((u, i) => (
          <div key={`vid-${i}`} style={{ position: 'relative' }}>
            <video src={u} controls style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}`, background: '#000' }} />
            <button onClick={() => removeVideo(i)} style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: 999, border: 'none', background: C.coral, color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: '22px' }}>×</button>
          </div>
        ))}
        <button onClick={() => fileRef.current?.click()} title="Add screenshots" style={{ width: 96, height: 96, borderRadius: 8, border: `1px dashed ${C.border}`, background: C.bg2, color: C.muted, cursor: 'pointer', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>🖼️</span>Image
        </button>
        <button onClick={() => videoRef.current?.click()} title="Add videos" style={{ width: 96, height: 96, borderRadius: 8, border: `1px dashed ${C.border}`, background: C.bg2, color: C.muted, cursor: 'pointer', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>🎬</span>Video
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPickFiles} style={{ display: 'none' }} />
        <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" multiple onChange={onPickVideos} style={{ display: 'none' }} />
      </div>
      <p style={{ color: C.muted, fontSize: 12, margin: '8px 0 0' }}>Images: JPEG/PNG/GIF/WebP up to 5MB. Videos: MP4/WebM/MOV up to 150MB.</p>

      <label style={label}>Category <span style={{ color: C.muted, textTransform: 'none', letterSpacing: 0 }}>· pick the topics this build fits</span></label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 168, overflowY: 'auto', padding: 2 }}>
        {categories.map((c) => {
          const on = categoryIds.includes(c.id);
          return (
            <button key={c.id} type="button" onClick={() => toggleCategory(c.id)} style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
              border: `1px solid ${on ? C.purple : C.border}`,
              background: on ? `${C.purple}22` : C.bg2,
              color: on ? '#e9d5ff' : C.text,
            }}>{c.name}</button>
          );
        })}
      </div>

      {communities.length > 0 && (
        <>
          <label style={label}>Post to a community <span style={{ color: C.muted, textTransform: 'none', letterSpacing: 0 }}>· optional</span></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {communities.map((c) => {
              const on = communityIds.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => toggleCommunity(c.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
                  border: `1px solid ${on ? C.teal : C.border}`,
                  background: on ? `${C.teal}22` : C.bg2,
                  color: on ? '#cfeae8' : C.text,
                }}>
                  {c.icon_url && <img src={c.icon_url} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />}
                  <span>{c.name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 14, color: C.text }}>
        <input type="checkbox" checked={repostEnabled} onChange={(e) => setRepostEnabled(e.target.checked)} />
        <span style={{ fontWeight: 600 }}>🔁 Repost an existing post</span>
      </label>
      {repostEnabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <input
            style={field}
            placeholder="Paste a Prompted post link (prmpted.com/…/post/…)"
            value={repostUrl}
            onChange={(e) => setRepostUrl(e.target.value)}
          />
          {repostError && <p style={{ color: C.coral, fontSize: 12, margin: 0 }}>{repostError}</p>}
          {repostPreview && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, border: `1px solid ${C.green}55`, background: `${C.green}12`, borderRadius: 8 }}>
              {repostPreview.images?.[0]
                ? <img src={repostPreview.images[0]} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                : <span style={{ width: 44, height: 44, borderRadius: 6, background: C.bg3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>{repostPreview.avatar_emoji || '📝'}</span>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>✓ Reposting @{repostPreview.username}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repostPreview.title}</div>
              </div>
            </div>
          )}
          <p style={{ color: C.muted, fontSize: 12, margin: '2px 0 0' }}>The original shows embedded in your post as “Reposted from @user.”</p>
        </div>
      )}

      <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 14, color: C.text }}>
        <input type="checkbox" checked={pollEnabled} onChange={(e) => setPollEnabled(e.target.checked)} />
        <span style={{ fontWeight: 600 }}>📊 Add a poll</span>
      </label>
      {pollEnabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {pollOptions.map((opt, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                style={field}
                placeholder={`Option ${i + 1}`}
                maxLength={80}
                value={opt}
                onChange={(e) => updatePollOption(i, e.target.value)}
              />
              {pollOptions.length > 2 && (
                <button type="button" onClick={() => removePollOption(i)} title="Remove option"
                  style={{ flexShrink: 0, padding: '0 12px', height: 38, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg2, color: C.muted, cursor: 'pointer', fontSize: 16 }}>×</button>
              )}
            </div>
          ))}
          {pollOptions.length < 6 && (
            <button type="button" onClick={addPollOption}
              style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, cursor: 'pointer', fontSize: 13 }}>+ Add option</button>
          )}
          <p style={{ color: C.muted, fontSize: 12, margin: '2px 0 0' }}>People pick one option. You can add 2–6 choices.</p>
        </div>
      )}

      {error && <p style={{ color: C.coral, marginTop: 16 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
        <button style={{ ...btn(C.green), opacity: canPublish ? 1 : 0.5, cursor: canPublish ? 'pointer' : 'not-allowed' }}
          disabled={!canPublish} onClick={handlePublish}>
          {publishing ? 'Publishing…' : 'Publish build'}
        </button>
        <button style={btn('transparent', C.muted)} onClick={handleDiscard}>Discard</button>
      </div>
    </div></div>
  );
}

function segBtn(active) {
  return {
    padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
    background: active ? C.purple : 'transparent',
    color: active ? '#fff' : C.muted,
  };
}

function btn(bg, color = '#fff') {
  return {
    padding: '11px 22px', borderRadius: 8, fontSize: 15, fontWeight: 600,
    border: bg === 'transparent' ? `1px solid ${C.border}` : 'none',
    background: bg, color, cursor: 'pointer', fontFamily: 'inherit',
  };
}
