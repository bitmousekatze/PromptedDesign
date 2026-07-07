// Destructive account-deletion confirm. Collects two choices — what happens to
// the user's content (anonymize vs purge) and when (scheduled vs immediate) —
// and requires typing the account's username to confirm. Presentational: the
// parent passes onConfirm({ contentMode, timing }) and handles the aftermath
// (self → logout; admin → refresh).

import React, { useState } from 'react';

const cardBase = {
  textAlign: 'left',
  border: '1px solid var(--border, #2a2a2a)',
  background: 'var(--bg-elev, #161616)',
  borderRadius: 12,
  padding: '12px 14px',
  cursor: 'pointer',
  width: '100%',
  transition: 'border-color .12s, background .12s',
};
const cardActive = { borderColor: '#ef4444', background: 'rgba(239,68,68,0.08)' };

function Choice({ active, onClick, title, desc }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick}
      style={{ ...cardBase, ...(active ? cardActive : {}) }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12.5, opacity: 0.7, lineHeight: 1.35 }}>{desc}</div>
    </button>
  );
}

export default function AccountDeletionModal({
  isOpen,
  onClose,
  onConfirm,
  username,              // the account's username the user must type
  variant = 'self',     // 'self' | 'admin'
  targetLabel = null,    // admin: display name of the account being deleted
}) {
  const [contentMode, setContentMode] = useState('anonymize'); // 'anonymize' | 'purge'
  const [timing, setTiming] = useState(variant === 'self' ? 'scheduled' : 'immediate');
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const confirmMatches = typed.trim().toLowerCase() === (username || '').toLowerCase();

  const handleConfirm = async () => {
    if (!confirmMatches || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm({ contentMode, timing });
      // Parent handles closing/navigation on success.
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
      setLoading(false);
    }
  };

  const isImmediate = timing === 'immediate';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '94vw' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ color: '#ef4444' }}>
            {variant === 'admin' ? `Delete ${targetLabel || '@' + username}` : 'Delete your account'}
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13.5, opacity: 0.8 }}>
            This is permanent and cannot be undone{timing === 'scheduled' ? ' once the 30 days pass' : ''}.
          </p>

          {/* Content choice */}
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', opacity: 0.6, marginBottom: 8 }}>
              What happens to {variant === 'admin' ? 'their' : 'your'} posts &amp; comments
            </div>
            <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Choice active={contentMode === 'anonymize'} onClick={() => setContentMode('anonymize')}
                title="Keep content, remove the account"
                desc={`Posts & comments stay, reattributed to "[deleted user]". Everything personal (profile, likes, follows, uploads) is erased.`} />
              <Choice active={contentMode === 'purge'} onClick={() => setContentMode('purge')}
                title="Delete everything"
                desc="Remove the account and all of their posts, comments, workflows, and uploads. Leaves gaps in threads others replied to." />
            </div>
          </div>

          {/* Timing choice */}
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', opacity: 0.6, marginBottom: 8 }}>
              When
            </div>
            <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Choice active={timing === 'scheduled'} onClick={() => setTiming('scheduled')}
                title="In 30 days (cancelable)"
                desc={`The account is locked and hidden immediately; ${variant === 'admin' ? 'they' : 'you'} can cancel any time in the next 30 days before it's erased.`} />
              <Choice active={timing === 'immediate'} onClick={() => setTiming('immediate')}
                title="Immediately"
                desc="Erase right now. No recovery." />
            </div>
          </div>

          {/* Type-to-confirm */}
          <div>
            <label style={{ fontSize: 13, opacity: 0.8 }}>
              Type <b>{username}</b> to confirm
            </label>
            <input
              className="lounge-comment-input"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={username}
              style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10,
                       border: '1px solid var(--border,#2a2a2a)', background: 'var(--bg,#0f0f0f)', color: 'inherit' }}
            />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button className="btn btn-danger" onClick={handleConfirm} disabled={!confirmMatches || loading}>
              {loading ? 'Working…' : isImmediate
                ? (contentMode === 'purge' ? 'Delete everything now' : 'Delete account now')
                : 'Schedule deletion'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
