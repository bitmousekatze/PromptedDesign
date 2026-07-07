import { useEffect, useMemo, useState } from 'react';
import { REMIX_TOOLS, buildRemixPrompt } from '../lib/remixPrompts';

const CheckMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const RemixBuildModal = ({ isOpen, post, onClose, onStartRemixPost }) => {
  const [toolId, setToolId] = useState('claude-web');
  const [twist, setTwist] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setToolId('claude-web');
      setTwist('');
      setCopied(false);
      setCopiedUrl(false);
    }
  }, [isOpen]);

  const postUrl = post ? `https://prmpted.com/post/${post.id}` : '';
  const author = post?.profiles?.username || post?.username || '';

  const generatedPrompt = useMemo(() => {
    if (!post) return '';
    return buildRemixPrompt(toolId, {
      designDocUrl: post.design_doc_url,
      githubRepoUrl: post.github_repo_url,
      postUrl,
      postTitle: post.title,
      author,
      twist,
    });
  }, [toolId, twist, post, postUrl, author]);

  if (!isOpen || !post) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = generatedPrompt;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      document.body.removeChild(ta);
    }
  };

  const hasDesignDoc = !!post.design_doc_url;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div className="modal-title-block">
            <span className="modal-title-eyebrow">Remix Build</span>
            <h2 className="modal-title">Remix this build</h2>
            <p className="modal-title-sub">
              Pick your AI tool. We'll generate a starter prompt with the original design doc baked in.
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">

          {/* What is remixing? — quick explainer */}
          <div
            style={{
              background: 'rgba(99, 91, 255, 0.08)',
              border: '1px solid rgba(99, 91, 255, 0.25)',
              borderRadius: 10,
              padding: '0.85rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              lineHeight: 1.55,
              color: '#cbd5e1',
            }}
          >
            <div style={{ fontWeight: 700, color: '#e6edf3', marginBottom: 6 }}>
              What's a remix?
            </div>
            A remix is your own take on someone else's build. Pick an AI tool below, paste
            the generated prompt into it (it links the original design doc + repo), describe
            your twist, and let the AI scaffold your version. When you ship it, post it here
            and credit the original — it'll show up as "Remixed from @{author || 'creator'}".
            <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#94a3b8' }}>
              <strong style={{ color: '#cbd5e1' }}>Tip:</strong> paste the original post URL into the
              "Remix / repost link" field on your new post and it'll auto-tag and embed the
              original — linking you to @{author || 'the creator'} like a quote/repost.
            </div>
            <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#94a3b8' }}>
              <strong style={{ color: '#cbd5e1' }}>Three steps:</strong> 1) Pick tool · 2) Add your twist · 3) Copy &amp; paste into the AI
            </div>
          </div>

          {/* Design doc download — only when the post has one */}
          {hasDesignDoc && (
            <div
              style={{
                background: 'rgba(63, 185, 80, 0.08)',
                border: '1px solid rgba(63, 185, 80, 0.3)',
                borderRadius: 10,
                padding: '0.8rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>📄</div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, color: '#e6edf3', fontSize: '0.9rem' }}>Design doc available</div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>
                  The original builder shared a doc explaining how this was made.
                </div>
              </div>
              <a
                href={post.design_doc_url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="btn"
                style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}
              >
                ⬇ Open / download
              </a>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">AI tool</label>
            <div className="remix-tool-grid">
              {REMIX_TOOLS.map(t => {
                const isActive = toolId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-tool={t.id}
                    onClick={() => setToolId(t.id)}
                    className={`remix-tool-card ${isActive ? 'active' : ''}`}
                    aria-pressed={isActive}
                  >
                    <span className="remix-tool-card-label">{t.label}</span>
                    <span className={`remix-tool-card-kind kind-${t.kind === 'terminal' ? 'terminal' : 'web'}`}>
                      {t.kind === 'terminal' ? 'Terminal' : 'Web LLM'}
                    </span>
                    <span className="remix-tool-card-check" aria-hidden="true"><CheckMark /></span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">What's your twist? <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem' }}>(optional)</span></label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., same idea but swap React for Svelte"
              value={twist}
              onChange={(e) => setTwist(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Generated prompt</label>
            <textarea
              className="form-input"
              readOnly
              value={generatedPrompt}
              rows={10}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.82rem', lineHeight: 1.5 }}
              onClick={(e) => e.target.select()}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button
              className="btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(postUrl);
                  setCopiedUrl(true);
                  setTimeout(() => setCopiedUrl(false), 2000);
                } catch {}
              }}
              title="Copy the original post URL"
            >
              {copiedUrl ? 'URL copied!' : 'Copy post URL'}
            </button>
            {onStartRemixPost && (
              <button
                className="btn"
                onClick={() => { onStartRemixPost(post); onClose(); }}
                title="Open the Create Post modal pre-filled to credit this build"
              >
                Post my remix
              </button>
            )}
            <button className="btn btn-primary" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy prompt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RemixBuildModal;
