// Community header (single community view) — extracted verbatim from App.jsx
// during the community component split (July 2026). No behavior change.
import React, { useState, useEffect, useRef } from 'react';
import { useAuth, useToast } from '../../lib/appShared.js';
import { toPlainText } from '../../lib/sanitize.js';
import { RichText } from '../../lib/richText.jsx';
import { ShareToChatModal } from '../sharedUI.jsx';
import { EditIcon, MessageIcon, ShareIcon, TrashIcon, UsersIcon } from '../icons.jsx';
import CommunityMembersModal from './CommunityMembersModal.jsx';

const CommunityHeader = ({ community, isMember, onJoin, onLeave, onDelete, onJoinWithCode, onEdit, rules = [], onViewUser, userFollows = [], onFollow }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareToChatOpen, setShareToChatOpen] = useState(false);
  const shareMenuRef = useRef(null);
  useEffect(() => {
    if (!shareMenuOpen) return undefined;
    const onClick = (e) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target)) setShareMenuOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [shareMenuOpen]);

  const isCreator = user && user.id === community.creator_id;

  const copyInviteCode = () => {
    if (community.invite_code) {
      navigator.clipboard.writeText(community.invite_code);
      addToast('Invite code copied to clipboard!', 'success');
    }
  };

  const handleShare = async () => {
    if (!community.slug) return;
    const url = `${window.location.origin}/community/${community.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: community.name,
          text: toPlainText(community.description) || `Join ${community.name}`,
          url,
        });
        return;
      }
    } catch (err) {
      // User cancelled native share or it's unsupported — fall through to copy
      if (err?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      addToast('Share link copied to clipboard!', 'success');
    } catch {
      addToast(`Share link: ${url}`, 'info');
    }
  };

  const formatCount = (count) => {
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'k';
    }
    return count;
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    await onDelete(community.id);
    setDeleting(false);
    setShowDeleteConfirm(false);
  };

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const handleLeaveClick = () => {
    if (isCreator) {
      // Show confirmation for creator leaving (ownership transfer)
      setShowLeaveConfirm(true);
      return;
    }
    onLeave(community.id);
  };

  const handleCreatorLeave = async () => {
    setLeaving(true);
    await onLeave(community.id);
    setLeaving(false);
    setShowLeaveConfirm(false);
    addToast('You have left the community. Ownership has been transferred.', 'success');
  };

  return (
    <>
      <div className="community-view-header">
        <div className="community-cover" style={{
          background: (community.header_url || community.cover_image)
            ? 'none'
            : 'linear-gradient(135deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%)'
        }}>
          {(community.header_url || community.cover_image) && (
            <img src={community.header_url || community.cover_image} alt={community.name} />
          )}
        </div>
        <div className="community-view-info">
          <div className="community-view-icon">
            {community.icon_url ? (
              <img src={community.icon_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              community.icon || '🌟'
            )}
          </div>
          <div className="community-view-details">
            <h1 className="community-view-name">
              {community.name}
              {community.is_private && (
                <span style={{
                  marginLeft: '0.75rem',
                  fontSize: '0.8rem',
                  padding: '0.2rem 0.5rem',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '4px',
                  color: 'var(--text-muted)',
                  verticalAlign: 'middle'
                }}>Private</span>
              )}
            </h1>
            <div className="community-view-description">
              {community.description
                ? <RichText text={community.description} onUserClick={onViewUser} />
                : 'A community for sharing and learning'}
            </div>
            <div className="community-view-stats">
              <span
                className="community-view-stat"
                onClick={() => setShowMembersModal(true)}
                style={{ cursor: 'pointer' }}
                title="View all members"
              >
                <UsersIcon /> {formatCount(community.member_count || 0)} member{(community.member_count || 0) !== 1 ? 's' : ''}
              </span>
              <span className="community-view-stat">
                {formatCount(community.post_count || 0)} posts
              </span>
            </div>
            {isCreator && community.is_private && community.invite_code && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem 1rem',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap'
              }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Invite Code:</span>
                <code style={{
                  fontFamily: 'monospace',
                  letterSpacing: '0.15em',
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: 'var(--accent-primary)'
                }}>{community.invite_code}</code>
                <button
                  className="btn btn-secondary"
                  onClick={copyInviteCode}
                  style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                >
                  Copy
                </button>
              </div>
            )}
          </div>
          <div className="community-view-actions">
            {community.slug && (
              <div ref={shareMenuRef} style={{ position: 'relative', display: 'inline-flex' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShareMenuOpen(o => !o)}
                  title="Share"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <ShareIcon /> Share
                </button>
                {shareMenuOpen && (
                  <div className="profile-share-menu">
                    <button
                      className="profile-share-menu-item"
                      onClick={() => { setShareMenuOpen(false); handleShare(); }}
                    >
                      <ShareIcon /> Copy link
                    </button>
                    {user && (
                      <button
                        className="profile-share-menu-item"
                        onClick={() => { setShareMenuOpen(false); setShareToChatOpen(true); }}
                      >
                        <MessageIcon /> Send to a friend
                      </button>
                    )}
                  </div>
                )}
                <ShareToChatModal
                  isOpen={shareToChatOpen}
                  onClose={() => setShareToChatOpen(false)}
                  entity={{ kind: 'community', id: community.id }}
                  currentUserId={user?.id}
                />
              </div>
            )}
            {isMember && (
              <button
                className="btn-leave-community"
                onClick={handleLeaveClick}
              >
                Leave
              </button>
            )}
            {!isMember && (
              <button
                className="btn-join-community"
                onClick={() => {
                  if (community.is_private && onJoinWithCode) {
                    onJoinWithCode(community);
                  } else {
                    onJoin(community.id);
                  }
                }}
              >
                {community.is_private ? 'Join with Code' : 'Join Community'}
              </button>
            )}
            {isCreator && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={onEdit}
                  title="Manage community"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <EditIcon /> Manage
                </button>
                <button
                  className="btn-delete-community"
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Delete community"
                >
                  <TrashIcon /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Community Rules Section */}
      {rules.length > 0 && (
        <div style={{
          margin: '1rem 0',
          background: 'var(--bg-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden'
        }}>
          <button
            onClick={() => setShowRules(!showRules)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              background: 'transparent',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              color: 'var(--text-primary)'
            }}
          >
            <span style={{ fontWeight: '600' }}>Community Rules ({rules.length})</span>
            <span style={{ transform: showRules ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </button>
          {showRules && (
            <div style={{ padding: '0 1rem 1rem' }}>
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--border-color)'
                  }}
                >
                  <span style={{
                    background: 'var(--text-secondary)',
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    marginTop: '0.45rem'
                  }}></span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{rule.rule_text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Community Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="delete-confirm-overlay" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Community?</h3>
            <p>Are you sure you want to delete "{community.name}"? All posts in this community will be unlinked and this action cannot be undone.</p>
            <div className="delete-confirm-actions">
              <button
                className="delete-confirm-cancel"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="delete-confirm-delete"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Community'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Community Confirmation Modal (for creator) */}
      {showLeaveConfirm && (
        <div className="delete-confirm-overlay" onClick={() => !leaving && setShowLeaveConfirm(false)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Leave Community?</h3>
            <p>As the owner, leaving will transfer ownership to the next member who joined. Are you sure you want to leave "{community.name}"?</p>
            <div className="delete-confirm-actions">
              <button
                className="delete-confirm-cancel"
                onClick={() => setShowLeaveConfirm(false)}
                disabled={leaving}
              >
                Cancel
              </button>
              <button
                className="delete-confirm-delete"
                onClick={handleCreatorLeave}
                disabled={leaving}
              >
                {leaving ? 'Leaving...' : 'Leave Community'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Community Members Modal */}
      <CommunityMembersModal
        isOpen={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        community={community}
        onViewUser={onViewUser}
        userFollows={userFollows}
        onFollow={onFollow}
      />
    </>
  );
};

export default CommunityHeader;
