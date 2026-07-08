import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import BadgeSVG, { getBadgeForPoints } from './BadgeSVG';
import { uploadPostImage } from '../lib/storage';
import { EmojiPicker, GifPicker, ChatComposerStyles } from './chatComposer';
import { UserBadge } from './sharedUI.jsx';
import styles from './CommunityChannels.module.css';

const ChannelRankBadge = ({ points }) => {
  if (points === undefined || points === null) return null;
  const badge = getBadgeForPoints(points || 0);
  return (
    <span
      className="builder-rank-badge-svg"
      style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}
      title={`${badge.name} · ${points} builder points`}
    >
      <BadgeSVG badge={badge} size={28} compact />
    </span>
  );
};

// ============================================
// @MENTION HELPER FOR CHANNELS
// ============================================
const MentionText = ({ text, onUserClick }) => {
  if (!text || !onUserClick) return text || null;

  const mentionRegex = /@(\w+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const username = match[1];
    parts.push(
      <span
        key={`mention-${match.index}`}
        className="mention-link"
        onClick={async (e) => {
          e.stopPropagation();
          e.preventDefault();
          try {
            const { data } = await supabase
              .from('profiles')
              .select('id')
              .eq('username', username)
              .single();
            if (data?.id) {
              onUserClick(data.id);
            }
          } catch (err) {
            // Username not found
          }
        }}
      >
        @{username}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 0) return text;
  return <>{parts}</>;
};

// ============================================
// CHANNEL SIDEBAR COMPONENT
// ============================================
const ChannelSidebar = ({
  channels,
  activeChannelId,
  onSelectChannel,
  onCreateChannel,
  onEditChannel,
  isOwner,
  canManageChannels,
  onReorderChannel,
  communityName,
  onToggleMobile,
  showMobile
}) => {
  const textChannels = channels.filter(c => c.channel_type === 'text');
  const announcementChannels = channels.filter(c => c.channel_type === 'announcements');

  const renderChannelItem = (channel) => (
    <button
      key={channel.id}
      className={`channel-item ${activeChannelId === channel.id ? 'active' : ''}`}
      onClick={() => {
        onSelectChannel(channel);
        if (showMobile) onToggleMobile();
      }}
    >
      <span className="channel-hash">{channel.channel_type === 'announcements' ? '\uD83D\uDCE2' : '#'}</span>
      <span className="channel-name">{channel.name}</span>
      {channel.is_private && <span className="channel-private-badge">&#128274;</span>}
    </button>
  );

  const renderReorderButtons = (channel, index, list) => {
    if (!canManageChannels) return null;
    return (
      <div className="channel-reorder-btns">
        <button
          className="channel-edit-btn"
          onClick={(e) => { e.stopPropagation(); onEditChannel(channel); }}
          title="Edit channel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {showMobile && (
        <div className="channel-sidebar-backdrop" onClick={onToggleMobile} />
      )}
      <div className={`channel-sidebar ${showMobile ? 'show-mobile' : ''}`}>
        <div className="channel-sidebar-header">
          <h3 className="channel-sidebar-title">{communityName}</h3>
          <button className="channel-sidebar-close-mobile" onClick={onToggleMobile}>
            &times;
          </button>
        </div>

        <div className="channel-list">
          {announcementChannels.length > 0 && (
            <div className="channel-group">
              <div className="channel-group-header">ANNOUNCEMENTS</div>
              {announcementChannels.map((ch, i) => (
                <div key={ch.id} className="channel-item-wrapper">
                  {renderChannelItem(ch)}
                  {renderReorderButtons(ch, i, announcementChannels)}
                </div>
              ))}
            </div>
          )}

          <div className="channel-group">
            <div className="channel-group-header">TEXT CHANNELS</div>
            {textChannels.map((ch, i) => (
              <div key={ch.id} className="channel-item-wrapper">
                {renderChannelItem(ch)}
                {renderReorderButtons(ch, i, textChannels)}
              </div>
            ))}
          </div>
        </div>

        {canManageChannels && (
          <button className="channel-create-btn" onClick={onCreateChannel}>
            + New Channel
          </button>
        )}
      </div>
    </>
  );
};

// ============================================
// MANAGE PRIVATE CHANNEL MEMBERS MODAL
// ============================================
const ManagePrivateChannelMembers = ({ channelId, channelName, communityId, onClose, onUpdateAllowedUsers }) => {
  const [communityMembers, setCommunityMembers] = useState([]);
  const [allowedUserIds, setAllowedUserIds] = useState(new Set());
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [membersRes, allowedRes] = await Promise.all([
          supabase
            .from('community_members')
            .select('user_id, profiles:user_id (username, display_name, avatar_emoji)')
            .eq('community_id', communityId),
          supabase
            .from('channel_allowed_users')
            .select('user_id')
            .eq('channel_id', channelId)
        ]);
        setCommunityMembers(membersRes.data || []);
        setAllowedUserIds(new Set((allowedRes.data || []).map(a => a.user_id)));
      } catch (err) {
        console.error('Error loading members:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [communityId, channelId]);

  const filteredMembers = communityMembers.filter(m => {
    const displayName = m.profiles?.display_name || m.profiles?.username || '';
    const username = m.profiles?.username || '';
    const search = memberSearch.toLowerCase();
    return displayName.toLowerCase().includes(search) || username.toLowerCase().includes(search);
  });

  const toggleMember = (userId) => {
    setAllowedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdateAllowedUsers(channelId, Array.from(allowedUserIds));
      onClose();
    } catch (err) {
      console.error('Error saving members:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="channel-modal">
        <div className="channel-modal-header">
          <h2>Manage Members - #{channelName}</h2>
          <button className="channel-modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="channel-modal-field">
          <label>Select which members can access this private channel</label>
          <input
            type="text"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Search members..."
            autoFocus
          />
        </div>

        {loading ? (
          <div className="channel-modal-hint" style={{ padding: '1rem', textAlign: 'center' }}>Loading members...</div>
        ) : (
          <div className={styles.memberSelectList}>
            {filteredMembers.map(m => {
              const isSelected = allowedUserIds.has(m.user_id);
              return (
                <button
                  key={m.user_id}
                  type="button"
                  className={`${styles.memberSelectOption} ${isSelected ? styles.selected : ''}`}
                  onClick={() => toggleMember(m.user_id)}
                >
                  <span className={styles.memberSelectCheck}>{isSelected ? '✓' : ''}</span>
                  <span className={styles.memberSelectAvatar}>{m.profiles?.avatar_emoji || '👤'}</span>
                  <span className={styles.memberSelectName}>{m.profiles?.display_name || m.profiles?.username}</span>
                  <span className={styles.memberUsername}>@{m.profiles?.username}</span>
                </button>
              );
            })}
            {filteredMembers.length === 0 && (
              <span className="channel-modal-hint" style={{ padding: '0.75rem', display: 'block', textAlign: 'center' }}>No members found</span>
            )}
          </div>
        )}

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>
          {allowedUserIds.size} member{allowedUserIds.size !== 1 ? 's' : ''} selected
        </div>

        <div className="channel-modal-actions">
          <button type="button" className="channel-modal-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="channel-modal-submit" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Members'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// CREATE CHANNEL MODAL
// ============================================
const CreateChannelModal = ({ onClose, onSubmit, existingNames, communityId }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelType, setChannelType] = useState('text');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const formatName = (raw) => {
    return raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formatted = formatName(name);
    if (!formatted) {
      setError('Channel name is required');
      return;
    }
    if (existingNames.includes(formatted)) {
      setError('A channel with this name already exists');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await onSubmit({
        name: formatted,
        description: description.trim() || null,
        channel_type: channelType,
        is_private: isPrivate,
        allowed_user_ids: []
      });
      onClose(isPrivate ? result : null);
    } catch (err) {
      setError(err.message || 'Failed to create channel');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="channel-modal">
        <div className="channel-modal-header">
          <h2>Create Channel</h2>
          <button className="channel-modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="channel-modal-field">
            <label>Channel Name</label>
            <div className="channel-name-input-wrapper">
              <span className="channel-name-prefix">#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(formatName(e.target.value)); setError(''); }}
                placeholder="e.g. post-here"
                maxLength={50}
                autoFocus
              />
            </div>
            <span className="channel-modal-hint">Lowercase, no spaces (auto-formatted)</span>
          </div>

          <div className="channel-modal-field">
            <label>Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this channel about?"
              maxLength={200}
            />
          </div>

          <div className="channel-modal-field">
            <label>Channel Type</label>
            <div className="channel-type-options">
              <button
                type="button"
                className={`channel-type-option ${channelType === 'text' ? 'active' : ''}`}
                onClick={() => setChannelType('text')}
              >
                <span className="channel-type-icon">#</span>
                <div>
                  <div className="channel-type-label">Text</div>
                  <div className="channel-type-desc">Anyone can send messages</div>
                </div>
              </button>
              <button
                type="button"
                className={`channel-type-option ${channelType === 'announcements' ? 'active' : ''}`}
                onClick={() => setChannelType('announcements')}
              >
                <span className="channel-type-icon">{'\uD83D\uDCE2'}</span>
                <div>
                  <div className="channel-type-label">Announcements</div>
                  <div className="channel-type-desc">Only you can post</div>
                </div>
              </button>
            </div>
          </div>

          <div className="channel-modal-field">
            <label className="channel-private-toggle">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              <span>Private Channel</span>
            </label>
            <span className="channel-modal-hint">
              {isPrivate ? 'You\'ll be able to select members after creating the channel' : 'All community members can access this channel'}
            </span>
          </div>

          {error && <div className="channel-modal-error">{error}</div>}

          <div className="channel-modal-actions">
            <button type="button" className="channel-modal-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="channel-modal-submit" disabled={submitting || !name.trim()}>
              {submitting ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================
// EDIT CHANNEL MODAL
// ============================================
const EditChannelModal = ({ channel, onClose, onSubmit, onDelete, existingNames, communityId, onUpdateAllowedUsers, onManageMembers }) => {
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description || '');
  const [isPrivate, setIsPrivate] = useState(channel.is_private || false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const formatName = (raw) => {
    return raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formatted = formatName(name);
    if (!formatted) {
      setError('Channel name is required');
      return;
    }
    if (formatted !== channel.name && existingNames.includes(formatted)) {
      setError('A channel with this name already exists');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(channel.id, { name: formatted, description: description.trim() || null, is_private: isPrivate });
      // If toggling off private, clear allowed users
      if (!isPrivate && channel.is_private && onUpdateAllowedUsers) {
        await onUpdateAllowedUsers(channel.id, []);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update channel');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSubmitting(true);
    try {
      await onDelete(channel.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete channel');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="channel-modal">
        <div className="channel-modal-header">
          <h2>Edit Channel</h2>
          <button className="channel-modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="channel-modal-field">
            <label>Channel Name</label>
            <div className="channel-name-input-wrapper">
              <span className="channel-name-prefix">#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(formatName(e.target.value)); setError(''); }}
                placeholder="e.g. post-here"
                maxLength={50}
                autoFocus
              />
            </div>
          </div>

          <div className="channel-modal-field">
            <label>Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this channel about?"
              maxLength={200}
            />
          </div>

          <div className="channel-modal-field">
            <label className="channel-private-toggle">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              <span>Private Channel</span>
            </label>
            <span className="channel-modal-hint">
              {isPrivate ? 'Only selected members can view and type in this channel' : 'All community members can access this channel'}
            </span>
          </div>

          {isPrivate && (
            <div className="channel-modal-field">
              <button
                type="button"
                className="channel-modal-submit"
                style={{ width: '100%', marginTop: '0.25rem' }}
                onClick={() => onManageMembers(channel)}
              >
                Manage Members
              </button>
            </div>
          )}

          {error && <div className="channel-modal-error">{error}</div>}

          <div className="channel-modal-actions" style={{ justifyContent: 'space-between' }}>
            {!channel.is_default ? (
              <button
                type="button"
                className="channel-modal-cancel"
                style={confirmDelete ? { background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', borderColor: '#ef4444' } : { color: '#ef4444' }}
                onClick={handleDelete}
                disabled={submitting}
              >
                {confirmDelete ? 'Confirm Delete' : 'Delete Channel'}
              </button>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Default channel</span>
            )}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="channel-modal-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="channel-modal-submit" disabled={submitting || !name.trim()}>
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================
// BAN USER MODAL
// ============================================
const BAN_DURATIONS = [
  { label: '1 Hour', value: 60 },
  { label: '6 Hours', value: 360 },
  { label: '24 Hours', value: 1440 },
  { label: '7 Days', value: 10080 },
  { label: '30 Days', value: 43200 },
  { label: 'Permanent', value: null },
];

const BanUserModal = ({ userId, username, channelId, channelName, onClose, onBanned }) => {
  const [duration, setDuration] = useState(1440); // default 24h
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Convert duration from minutes to hours for the RPC
      const durationHours = duration !== null ? Math.round(duration / 60) || 1 : null;

      const { data, error: rpcError } = await supabase.rpc('ban_user_from_channel', {
        p_channel_id: channelId,
        p_user_id: userId,
        p_reason: reason.trim() || null,
        p_duration_hours: durationHours,
      });

      if (rpcError) throw rpcError;

      onBanned && onBanned(data);
      onClose();
    } catch (err) {
      console.error('Error banning user:', err);
      setError(err.message || 'Failed to ban user');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="channel-modal" style={{ maxWidth: 420 }}>
        <div className="channel-modal-header">
          <h3>Ban User from #{channelName}</h3>
          <button className="channel-modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="channel-modal-body">
            <p style={{ color: '#ccc', marginBottom: 16 }}>
              Ban <strong style={{ color: '#ff6b6b' }}>{username}</strong> from typing in this channel.
            </p>

            <label className="channel-form-label">Duration</label>
            <div className="ban-duration-grid">
              {BAN_DURATIONS.map(d => (
                <button
                  key={d.label}
                  type="button"
                  className={`ban-duration-btn ${duration === d.value ? 'active' : ''}`}
                  onClick={() => setDuration(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <label className="channel-form-label" style={{ marginTop: 16 }}>Reason (optional)</label>
            <textarea
              className="channel-form-input"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why is this user being banned?"
              rows={2}
              maxLength={200}
            />

            {error && <p style={{ color: '#ff6b6b', marginTop: 8, fontSize: 13 }}>{error}</p>}
          </div>
          <div className="channel-modal-footer">
            <button type="button" className="channel-btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className="channel-btn-danger"
              disabled={submitting}
            >
              {submitting ? 'Banning...' : 'Ban User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================
// MANAGE BANS MODAL
// ============================================
const ManageBansModal = ({ channelId, channelName, onClose }) => {
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBans = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_channel_bans', {
          p_channel_id: channelId,
        });

        if (error) throw error;
        setBans(data || []);
      } catch (err) {
        console.error('Error loading bans:', err);
      } finally {
        setLoading(false);
      }
    };
    loadBans();
  }, [channelId]);

  const handleUnban = async (ban) => {
    try {
      const { error } = await supabase.rpc('unban_user_from_channel', {
        p_channel_id: channelId,
        p_user_id: ban.user_id,
      });

      if (error) throw error;
      setBans(prev => prev.filter(b => b.id !== ban.id));
    } catch (err) {
      console.error('Error unbanning user:', err);
    }
  };

  const isExpired = (ban) => ban.is_expired || (ban.expires_at && new Date(ban.expires_at) <= new Date());

  const formatBanExpiry = (ban) => {
    if (!ban.expires_at) return 'Permanent';
    const expiry = new Date(ban.expires_at);
    if (expiry <= new Date()) return 'Expired';
    const diff = expiry - new Date();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  const activeBans = bans.filter(b => !isExpired(b));
  const expiredBans = bans.filter(b => isExpired(b));

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="channel-modal" style={{ maxWidth: 500 }}>
        <div className="channel-modal-header">
          <h3>Manage Bans - #{channelName}</h3>
          <button className="channel-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="channel-modal-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div className="spinner" />
              <p style={{ color: '#999' }}>Loading bans...</p>
            </div>
          ) : bans.length === 0 ? (
            <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>No bans in this channel.</p>
          ) : (
            <>
              {activeBans.length > 0 && (
                <>
                  <h4 style={{ color: '#ccc', marginBottom: 8, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Active Bans ({activeBans.length})</h4>
                  {activeBans.map(ban => (
                    <div key={ban.id} className="ban-list-item">
                      <div className="ban-list-avatar">
                        {ban.avatar_url ? (
                          <img src={ban.avatar_url} alt="" />
                        ) : (
                          <span>{ban.avatar_emoji || '\uD83D\uDC64'}</span>
                        )}
                      </div>
                      <div className="ban-list-info">
                        <span className="ban-list-username">{ban.display_name || ban.username || 'Unknown'}</span>
                        <span className="ban-list-meta">{formatBanExpiry(ban)}</span>
                        {ban.reason && <span className="ban-list-reason">{ban.reason}</span>}
                      </div>
                      <button className="channel-btn-secondary ban-unban-btn" onClick={() => handleUnban(ban)}>Unban</button>
                    </div>
                  ))}
                </>
              )}
              {expiredBans.length > 0 && (
                <>
                  <h4 style={{ color: '#666', marginTop: 16, marginBottom: 8, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Expired ({expiredBans.length})</h4>
                  {expiredBans.map(ban => (
                    <div key={ban.id} className="ban-list-item expired">
                      <div className="ban-list-avatar">
                        {ban.avatar_url ? (
                          <img src={ban.avatar_url} alt="" />
                        ) : (
                          <span>{ban.avatar_emoji || '\uD83D\uDC64'}</span>
                        )}
                      </div>
                      <div className="ban-list-info">
                        <span className="ban-list-username">{ban.display_name || ban.username || 'Unknown'}</span>
                        <span className="ban-list-meta">Expired</span>
                        {ban.reason && <span className="ban-list-reason">{ban.reason}</span>}
                      </div>
                      <button className="channel-btn-secondary ban-unban-btn" onClick={() => handleUnban(ban)}>Remove</button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
        <div className="channel-modal-footer">
          <button type="button" className="channel-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MESSAGE COMPONENT
// ============================================
const MessageItem = ({ message, currentUserId, isOwner, onReply, onEdit, onDelete, onBanUser, onUserClick, builderRanks }) => {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showActions, setShowActions] = useState(false);

  const isOwn = currentUserId === message.user_id;
  const canDelete = isOwn || isOwner;

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    await onEdit(message.id, editContent.trim());
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      setEditing(false);
      setEditContent(message.content);
    }
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  return (
    <div
      className={`channel-message ${isOwn ? 'own' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Reply reference */}
      {message.reply_message && (
        <div className="message-reply-ref">
          <span className="message-reply-ref-line" />
          <span className="message-reply-ref-avatar">
            {message.reply_message.profiles?.avatar_url ? (
              <img src={message.reply_message.profiles.avatar_url} alt="" />
            ) : (
              message.reply_message.profiles?.avatar_emoji || '\uD83D\uDC64'
            )}
          </span>
          <span className="message-reply-ref-user">
            {message.reply_message.profiles?.display_name || message.reply_message.profiles?.username || 'User'}
          </span>
          <span className="message-reply-ref-content">
            {message.reply_message.content?.substring(0, 80)}{message.reply_message.content?.length > 80 ? '...' : ''}
          </span>
        </div>
      )}

      <div className="message-row">
        <div
          className="message-avatar"
          onClick={() => onUserClick && onUserClick(message.user_id)}
          style={{ cursor: onUserClick ? 'pointer' : 'default' }}
        >
          {message.profiles?.avatar_url ? (
            <img src={message.profiles.avatar_url} alt="" />
          ) : (
            <span>{message.profiles?.avatar_emoji || '\uD83D\uDC64'}</span>
          )}
        </div>
        <div className="message-body">
          <div className="message-header">
            <span
              className="message-username"
              onClick={() => onUserClick && onUserClick(message.user_id)}
              style={{ cursor: onUserClick ? 'pointer' : 'default', color: message.profiles?.name_color || '#22c55e' }}
            >
              {message.profiles?.display_name || message.profiles?.username || 'Unknown'}
            </span>
            <UserBadge username={message.profiles?.username} size={15} />
            <ChannelRankBadge points={message.profiles?.builder_points} />
            <span className="message-time">{formatTime(message.created_at)}</span>
            {message.is_edited && <span className="message-edited">(edited)</span>}
          </div>

          {editing ? (
            <div className="message-edit-wrapper">
              <textarea
                className="message-edit-input"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                rows={3}
              />
              <div className="message-edit-actions">
                <span className="message-edit-hint">Escape to cancel, Enter to save</span>
                <button className="message-edit-save" onClick={handleSaveEdit}>Save</button>
                <button className="message-edit-cancel" onClick={() => { setEditing(false); setEditContent(message.content); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {message.content && <div className="message-content"><MentionText text={message.content} onUserClick={onUserClick} /></div>}
              {message.image_url && (
                <a href={message.image_url} target="_blank" rel="noopener noreferrer" className="cafe-img-wrap">
                  <img src={message.image_url} alt="" className="cafe-img" loading="lazy" />
                </a>
              )}
            </>
          )}
        </div>

        {/* Action buttons on hover */}
        {showActions && !editing && (
          <div className="message-actions">
            <button className="message-action-btn" onClick={() => onReply(message)} title="Reply">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
            </button>
            {isOwn && (
              <button className="message-action-btn" onClick={() => setEditing(true)} title="Edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
            )}
            {canDelete && (
              <button className="message-action-btn delete" onClick={() => onDelete(message.id)} title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              </button>
            )}
            {!isOwn && onBanUser && (
              <button className="message-action-btn ban" onClick={() => onBanUser(message.user_id, message.profiles?.display_name || message.profiles?.username || 'User')} title="Ban user from channel">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// MESSAGE FEED COMPONENT
// ============================================
const ChannelMessageFeed = ({
  channel,
  user,
  communityId,
  isOwner,
  canManageChannels,
  isMember,
  onUserClick,
  builderRanks
}) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showNewIndicator, setShowNewIndicator] = useState(false);
  const [banStatus, setBanStatus] = useState(null); // null = not banned, object = ban details
  const [banModalTarget, setBanModalTarget] = useState(null); // { userId, username }
  const [showManageBans, setShowManageBans] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [uploading, setUploading] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  const PAGE_SIZE = 50;

  // Check if user is at bottom of scroll
  const checkIsAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 100;
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = false) => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }
    setShowNewIndicator(false);
  }, []);

  // Load messages for the channel
  const loadMessages = useCallback(async () => {
    if (!channel?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('channel_messages')
        .select(`
          *,
          profiles:user_id (username, display_name, avatar_emoji, avatar_url, name_color, builder_points),
          reply_message:reply_to (
            id, content,
            profiles:user_id (username, display_name, avatar_emoji, avatar_url)
          )
        `)
        .eq('channel_id', channel.id)
        .order('created_at', { ascending: true })
        .range(0, PAGE_SIZE - 1);

      if (error) throw error;

      // If we got exactly PAGE_SIZE, there might be more (we need newest, so re-query)
      if (data && data.length === PAGE_SIZE) {
        // Get the newest messages instead
        const { data: newestData, error: newestError } = await supabase
          .from('channel_messages')
          .select(`
            *,
            profiles:user_id (username, display_name, avatar_emoji, avatar_url, name_color, builder_points),
            reply_message:reply_to (
              id, content,
              profiles:user_id (username, display_name, avatar_emoji, avatar_url)
            )
          `)
          .eq('channel_id', channel.id)
          .order('created_at', { ascending: false })
          .range(0, PAGE_SIZE - 1);

        if (newestError) throw newestError;

        setMessages((newestData || []).reverse());
        setHasOlderMessages(true);
      } else {
        setMessages(data || []);
        setHasOlderMessages(false);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoading(false);
      setTimeout(() => scrollToBottom(), 50);
    }
  }, [channel?.id, scrollToBottom]);

  // Load older messages (cursor-based pagination)
  const loadOlderMessages = async () => {
    if (!channel?.id || !messages.length || loadingOlder) return;
    setLoadingOlder(true);

    const oldestMessage = messages[0];
    try {
      const { data, error } = await supabase
        .from('channel_messages')
        .select(`
          *,
          profiles:user_id (username, display_name, avatar_emoji, avatar_url, name_color, builder_points),
          reply_message:reply_to (
            id, content,
            profiles:user_id (username, display_name, avatar_emoji, avatar_url)
          )
        `)
        .eq('channel_id', channel.id)
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (error) throw error;

      if (data && data.length > 0) {
        const container = messagesContainerRef.current;
        const prevScrollHeight = container?.scrollHeight || 0;

        setMessages(prev => [...data.reverse(), ...prev]);
        setHasOlderMessages(data.length === PAGE_SIZE);

        // Maintain scroll position
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        });
      } else {
        setHasOlderMessages(false);
      }
    } catch (err) {
      console.error('Error loading older messages:', err);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Check if current user is banned from this channel
  useEffect(() => {
    if (!channel?.id || !user?.id) {
      setBanStatus(null);
      return;
    }
    const checkBan = async () => {
      try {
        const { data } = await supabase
          .from('channel_bans')
          .select('*')
          .eq('channel_id', channel.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (data) {
          // Check if ban has expired
          if (data.expires_at && new Date(data.expires_at) <= new Date()) {
            setBanStatus(null);
          } else {
            setBanStatus(data);
          }
        } else {
          setBanStatus(null);
        }
      } catch (err) {
        setBanStatus(null);
      }
    };
    checkBan();
  }, [channel?.id, user?.id]);

  // Send any message kind (text / image / GIF) with an optimistic update.
  const postMessage = async ({ content = '', imageUrl = null }) => {
    const text = (content || '').trim();
    if ((!text && !imageUrl) || !user || !channel?.id || banStatus) return;
    const reply = replyTo;
    const optimisticMsg = {
      id: 'temp-' + Date.now(),
      channel_id: channel.id, user_id: user.id, content: text || null, image_url: imageUrl,
      reply_to: reply?.id || null, is_edited: false, created_at: new Date().toISOString(),
      profiles: {
        username: user.user_metadata?.username || 'You',
        display_name: user.user_metadata?.display_name || user.user_metadata?.username || 'You',
        avatar_emoji: user.user_metadata?.avatar_emoji,
        avatar_url: user.user_metadata?.avatar_url,
        name_color: user.user_metadata?.name_color
      },
      reply_message: reply ? { id: reply.id, content: reply.content, profiles: reply.profiles } : null
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setReplyTo(null);
    scrollToBottom(true);

    try {
      const insertData = { channel_id: channel.id, user_id: user.id };
      if (text) insertData.content = text;
      if (imageUrl) insertData.image_url = imageUrl;
      if (reply?.id) insertData.reply_to = reply.id;

      const { data, error } = await supabase
        .from('channel_messages')
        .insert(insertData)
        .select(`
          *,
          profiles:user_id (username, display_name, avatar_emoji, avatar_url, name_color, builder_points),
          reply_message:reply_to (
            id, content,
            profiles:user_id (username, display_name, avatar_emoji, avatar_url)
          )
        `)
        .single();

      if (error) throw error;
      setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? data : m));
    } catch (err) {
      console.error('Error sending message:', err);
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      throw err;
    }
  };

  // Send a text message
  const handleSend = async () => {
    if (!inputValue.trim() || !user || !channel?.id || sending || banStatus) return;
    const content = inputValue.trim();
    setSending(true);
    setInputValue(''); setShowEmoji(false);
    try { await postMessage({ content }); } catch { setInputValue(content); }
    finally { setSending(false); inputRef.current?.focus(); }
  };

  const handlePickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !user || banStatus) return;
    setUploading(true);
    try {
      const { url, error } = await uploadPostImage(supabase, f, user.id);
      if (error) throw new Error(error);
      await postMessage({ imageUrl: url });
    } catch (err) { console.error('Channel image upload failed', err); }
    finally { setUploading(false); }
  };

  const handlePickGif = async (gifUrl) => { setShowGif(false); try { await postMessage({ imageUrl: gifUrl }); } catch {} };
  const insertEmoji = (emo) => { setInputValue(prev => prev + emo); inputRef.current?.focus(); };

  // Edit a message
  const handleEdit = async (messageId, newContent) => {
    try {
      const { error } = await supabase
        .from('channel_messages')
        .update({ content: newContent, is_edited: true })
        .eq('id', messageId);

      if (error) throw error;

      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, content: newContent, is_edited: true } : m
      ));
    } catch (err) {
      console.error('Error editing message:', err);
    }
  };

  // Delete a message
  const handleDelete = async (messageId) => {
    try {
      const { error } = await supabase
        .from('channel_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  // Handle input key
  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle scroll
  const handleScroll = () => {
    isAtBottomRef.current = checkIsAtBottom();
    if (isAtBottomRef.current) {
      setShowNewIndicator(false);
    }
  };

  // Load messages when channel changes
  useEffect(() => {
    loadMessages();
    setReplyTo(null);
    setInputValue('');
  }, [channel?.id, loadMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!channel?.id) return;

    const subscription = supabase
      .channel(`channel-messages-${channel.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'channel_messages',
        filter: `channel_id=eq.${channel.id}`
      }, async (payload) => {
        const newMsg = payload.new;
        // Don't duplicate our own optimistic messages
        if (newMsg.user_id === user?.id) {
          // Already handled by optimistic update
          return;
        }

        // Fetch the full message with profile data
        const { data } = await supabase
          .from('channel_messages')
          .select(`
            *,
            profiles:user_id (username, display_name, avatar_emoji, avatar_url, name_color, builder_points),
            reply_message:reply_to (
              id, content,
              profiles:user_id (username, display_name, avatar_emoji, avatar_url)
            )
          `)
          .eq('id', newMsg.id)
          .single();

        if (data) {
          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m.id === data.id)) return prev;
            return [...prev, data];
          });

          if (isAtBottomRef.current) {
            setTimeout(() => scrollToBottom(true), 50);
          } else {
            setShowNewIndicator(true);
          }
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'channel_messages',
        filter: `channel_id=eq.${channel.id}`
      }, (payload) => {
        setMessages(prev => prev.map(m =>
          m.id === payload.new.id ? { ...m, content: payload.new.content, is_edited: payload.new.is_edited } : m
        ));
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'channel_messages',
        filter: `channel_id=eq.${channel.id}`
      }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [channel?.id, user?.id, scrollToBottom]);

  // Can this user post in this channel?
  const canPost = isMember && !banStatus && (channel?.channel_type === 'text' || isOwner);

  const isAnnouncementsOnly = channel?.channel_type === 'announcements' && !isOwner;

  return (
    <div className="channel-feed">
      {/* Channel header */}
      <div className="channel-feed-header">
        <button className="channel-sidebar-toggle" onClick={() => {/* handled by parent */}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </button>
        <span className="channel-feed-header-hash">#</span>
        <span className="channel-feed-header-name">{channel?.name || 'general'}</span>
        {channel?.description && (
          <>
            <span className="channel-feed-header-divider">|</span>
            <span className="channel-feed-header-desc">{channel.description}</span>
          </>
        )}
        {canManageChannels && (
          <button
            className="channel-manage-bans-btn"
            onClick={() => setShowManageBans(true)}
            title="Manage bans"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>
          </button>
        )}
      </div>

      {/* Messages area */}
      <div
        className="channel-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {hasOlderMessages && (
          <button
            className="channel-load-older"
            onClick={loadOlderMessages}
            disabled={loadingOlder}
          >
            {loadingOlder ? 'Loading...' : 'Load older messages'}
          </button>
        )}

        {loading ? (
          <div className="channel-messages-loading">
            <div className="spinner" />
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="channel-messages-empty">
            <div className="channel-messages-empty-icon">#</div>
            <h3>Welcome to #{channel?.name || 'general'}!</h3>
            <p>This is the start of the channel. Send the first message!</p>
          </div>
        ) : (
          messages.map(msg => (
            <MessageItem
              key={msg.id}
              message={msg}
              currentUserId={user?.id}
              isOwner={isOwner}
              onReply={setReplyTo}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onBanUser={canManageChannels ? (userId, username) => setBanModalTarget({ userId, username }) : null}
              onUserClick={onUserClick}
              builderRanks={builderRanks}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* New messages indicator */}
      {showNewIndicator && (
        <button className="channel-new-messages-btn" onClick={() => scrollToBottom(true)}>
          New messages &#8595;
        </button>
      )}

      {/* Reply bar */}
      {replyTo && (
        <div className="channel-reply-bar">
          <span className="channel-reply-bar-text">
            Replying to <strong>{replyTo.profiles?.display_name || replyTo.profiles?.username || 'User'}</strong>
          </span>
          <button className="channel-reply-bar-close" onClick={() => setReplyTo(null)}>&times;</button>
        </div>
      )}

      {/* Input area */}
      {canPost ? (
        <div className="cafe-composer">
          {showEmoji && <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />}
          {showGif && <GifPicker onPick={handlePickGif} onClose={() => setShowGif(false)} />}
          <div className="channel-input-bar">
            {!isAnnouncementsOnly && (
              <div className="cafe-tools">
                <button type="button" className="cafe-tool-btn" title="Emoji" onClick={() => { setShowEmoji((v) => !v); setShowGif(false); }}>😊</button>
                <button type="button" className="cafe-tool-btn" title="Upload image or GIF" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <span className="cafe-spin">⏳</span> : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                  )}
                </button>
                <button type="button" className="cafe-tool-btn cafe-gif-btn" title="Search GIFs" onClick={() => { setShowGif((v) => !v); setShowEmoji(false); }}>GIF</button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={handlePickFile} />
              </div>
            )}
            <textarea
              ref={inputRef}
              className="channel-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={isAnnouncementsOnly ? 'Only the community owner can post here' : 'Send a message...'}
              disabled={isAnnouncementsOnly}
              rows={3}
            />
            <button
              className="channel-send-btn"
              onClick={handleSend}
              disabled={!inputValue.trim() || sending}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      ) : !isMember ? (
        <div className="channel-input-bar disabled">
          <span className="channel-input-disabled-text">Join this community to send messages</span>
        </div>
      ) : isAnnouncementsOnly ? (
        <div className="channel-input-bar disabled">
          <span className="channel-input-disabled-text">Only the community owner can post in announcements</span>
        </div>
      ) : banStatus ? (
        <div className="channel-input-bar disabled banned">
          <span className="channel-input-disabled-text">
            You are banned from this channel
            {banStatus.expires_at ? ` (expires ${new Date(banStatus.expires_at).toLocaleString()})` : ' (permanent)'}
          </span>
        </div>
      ) : null}

      {/* Ban user modal */}
      {banModalTarget && (
        <BanUserModal
          userId={banModalTarget.userId}
          username={banModalTarget.username}
          channelId={channel.id}
          channelName={channel.name}
          onClose={() => setBanModalTarget(null)}
          onBanned={() => setBanModalTarget(null)}
        />
      )}

      {/* Manage bans modal */}
      {showManageBans && (
        <ManageBansModal
          channelId={channel.id}
          channelName={channel.name}
          onClose={() => setShowManageBans(false)}
        />
      )}
    </div>
  );
};

// ============================================
// MAIN COMMUNITY CHANNELS COMPONENT
// ============================================
const CommunityChannels = ({ community, user, isMember, onUserClick, builderRanks = [] }) => {
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [managingMembersChannel, setManagingMembersChannel] = useState(null);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [userColor, setUserColor] = useState(null);
  const [isModerator, setIsModerator] = useState(false);

  const isOwner = user?.id === community?.creator_id;
  const isProfileOwner = community?.is_profile_channel && user?.id === community?.profile_user_id;
  const canManageChannels = isOwner || isModerator || isProfileOwner;

  // Fetch user's profile color and moderator status
  useEffect(() => {
    if (!user?.id) return;
    const fetchUserData = async () => {
      try {
        const [profileRes, memberRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('name_color')
            .eq('id', user.id)
            .single(),
          community?.id ? supabase
            .from('community_members')
            .select('role')
            .eq('community_id', community.id)
            .eq('user_id', user.id)
            .single() : Promise.resolve({ data: null })
        ]);
        if (profileRes.data?.name_color) {
          setUserColor(profileRes.data.name_color);
        }
        if (memberRes.data?.role === 'moderator') {
          setIsModerator(true);
        }
      } catch (err) {
        // Ignore
      }
    };
    fetchUserData();
  }, [user?.id, community?.id]);

  // Load channels (filter private channels based on access)
  const loadChannels = useCallback(async () => {
    if (!community?.id) return;
    setChannelsLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_channels')
        .select('*')
        .eq('community_id', community.id)
        .order('position', { ascending: true });

      if (error) throw error;

      let visibleChannels = data || [];

      // Filter out private channels the user doesn't have access to
      // Owner and moderators can see all channels
      if (user?.id && !isOwner && !isModerator) {
        const privateChannelIds = visibleChannels
          .filter(ch => ch.is_private)
          .map(ch => ch.id);

        if (privateChannelIds.length > 0) {
          const { data: allowedData } = await supabase
            .from('channel_allowed_users')
            .select('channel_id')
            .eq('user_id', user.id)
            .in('channel_id', privateChannelIds);

          const allowedChannelIds = new Set((allowedData || []).map(a => a.channel_id));
          visibleChannels = visibleChannels.filter(ch => !ch.is_private || allowedChannelIds.has(ch.id));
        }
      }

      setChannels(visibleChannels);

      // Auto-select the default channel or first channel
      if (visibleChannels.length > 0) {
        setActiveChannel(prev => {
          if (prev && visibleChannels.find(c => c.id === prev.id)) return prev;
          const defaultCh = visibleChannels.find(c => c.is_default);
          return defaultCh || visibleChannels[0];
        });
      }
    } catch (err) {
      console.error('Error loading channels:', err);
    } finally {
      setChannelsLoading(false);
    }
  }, [community?.id, user?.id, isOwner, isModerator]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Create channel
  const handleCreateChannel = async ({ name, description, channel_type, is_private, allowed_user_ids }) => {
    const maxPosition = channels.reduce((max, ch) => Math.max(max, ch.position), -1);

    const { data, error } = await supabase
      .from('community_channels')
      .insert({
        community_id: community.id,
        name,
        description,
        channel_type,
        is_private: is_private || false,
        position: maxPosition + 1
      })
      .select()
      .single();

    if (error) throw error;

    // Add allowed users for private channels
    if (is_private && allowed_user_ids && allowed_user_ids.length > 0) {
      const allowedEntries = allowed_user_ids.map(uid => ({
        channel_id: data.id,
        user_id: uid
      }));
      await supabase.from('channel_allowed_users').insert(allowedEntries);
    }

    setChannels(prev => [...prev, data]);
    setActiveChannel(data);
    return data;
  };

  // Edit channel
  const handleEditChannel = async (channelId, updates) => {
    const { error } = await supabase
      .from('community_channels')
      .update(updates)
      .eq('id', channelId);

    if (error) throw error;

    setChannels(prev => prev.map(ch => ch.id === channelId ? { ...ch, ...updates } : ch));
    if (activeChannel?.id === channelId) {
      setActiveChannel(prev => ({ ...prev, ...updates }));
    }
  };

  // Delete channel
  const handleDeleteChannel = async (channelId) => {
    const { error } = await supabase
      .from('community_channels')
      .delete()
      .eq('id', channelId);

    if (error) throw error;

    setChannels(prev => prev.filter(ch => ch.id !== channelId));
    if (activeChannel?.id === channelId) {
      setActiveChannel(channels.find(ch => ch.id !== channelId && ch.is_default) || channels.find(ch => ch.id !== channelId) || null);
    }
  };

  // Update allowed users for a private channel
  const handleUpdateAllowedUsers = async (channelId, userIds) => {
    // Remove all existing allowed users
    await supabase.from('channel_allowed_users').delete().eq('channel_id', channelId);

    // Insert new allowed users
    if (userIds && userIds.length > 0) {
      const entries = userIds.map(uid => ({ channel_id: channelId, user_id: uid }));
      await supabase.from('channel_allowed_users').insert(entries);
    }
  };

  // Reorder channel
  const handleReorderChannel = async (channelId, direction) => {
    const idx = channels.findIndex(c => c.id === channelId);
    if (idx === -1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= channels.length) return;

    const newChannels = [...channels];
    const temp = newChannels[idx];
    newChannels[idx] = newChannels[swapIdx];
    newChannels[swapIdx] = temp;

    // Update positions
    const updated = newChannels.map((ch, i) => ({ ...ch, position: i }));
    setChannels(updated);

    // Persist both position changes
    try {
      await Promise.all([
        supabase.from('community_channels').update({ position: updated[idx].position }).eq('id', updated[idx].id),
        supabase.from('community_channels').update({ position: updated[swapIdx].position }).eq('id', updated[swapIdx].id)
      ]);
    } catch (err) {
      console.error('Error reordering channels:', err);
      loadChannels(); // Reload on error
    }
  };

  // Dynamic color style overrides
  const accentColor = userColor || '#22c55e';
  const colorStyle = {
    '--channel-accent': accentColor,
    '--channel-accent-rgb': accentColor.replace('#', '').match(/.{2}/g)?.map(h => parseInt(h, 16)).join(', ') || '34, 197, 94'
  };

  if (channelsLoading) {
    return (
      <div className="community-channels-container">
        <div className="channel-loading">
          <div className="spinner" />
          <p>Loading channels...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="community-channels-container" style={colorStyle}>
      <ChatComposerStyles />
      {/* Mobile toggle */}
      <button
        className="channel-mobile-toggle"
        onClick={() => setShowMobileSidebar(!showMobileSidebar)}
        style={{ color: accentColor }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        <span>#{activeChannel?.name || 'channels'}</span>
      </button>

      <ChannelSidebar
        channels={channels}
        activeChannelId={activeChannel?.id}
        onSelectChannel={setActiveChannel}
        onCreateChannel={() => setShowCreateModal(true)}
        onEditChannel={(ch) => setEditingChannel(ch)}
        isOwner={isOwner}
        canManageChannels={canManageChannels}
        onReorderChannel={handleReorderChannel}
        communityName={community?.name || 'Community'}
        onToggleMobile={() => setShowMobileSidebar(!showMobileSidebar)}
        showMobile={showMobileSidebar}
      />

      {activeChannel ? (
        <ChannelMessageFeed
          channel={activeChannel}
          user={user}
          communityId={community?.id}
          isOwner={isOwner || isProfileOwner}
          canManageChannels={canManageChannels}
          isMember={isMember}
          onUserClick={onUserClick}
          builderRanks={builderRanks}
        />
      ) : (
        <div className="channel-feed">
          <div className="channel-messages-empty">
            <div className="channel-messages-empty-icon">#</div>
            <h3>No channels yet</h3>
            <p>{isOwner ? 'Create your first channel to get started!' : 'This community has no channels yet.'}</p>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateChannelModal
          onClose={(createdChannel) => {
            setShowCreateModal(false);
            if (createdChannel && createdChannel.is_private) {
              setManagingMembersChannel(createdChannel);
            }
          }}
          onSubmit={handleCreateChannel}
          existingNames={channels.map(c => c.name)}
          communityId={community?.id}
        />
      )}

      {editingChannel && (
        <EditChannelModal
          channel={editingChannel}
          onClose={() => setEditingChannel(null)}
          onSubmit={handleEditChannel}
          onDelete={handleDeleteChannel}
          existingNames={channels.map(c => c.name)}
          communityId={community?.id}
          onUpdateAllowedUsers={handleUpdateAllowedUsers}
          onManageMembers={(ch) => {
            setEditingChannel(null);
            setManagingMembersChannel(ch);
          }}
        />
      )}

      {managingMembersChannel && (
        <ManagePrivateChannelMembers
          channelId={managingMembersChannel.id}
          channelName={managingMembersChannel.name}
          communityId={community?.id}
          onClose={() => setManagingMembersChannel(null)}
          onUpdateAllowedUsers={handleUpdateAllowedUsers}
        />
      )}
    </div>
  );
};

export default CommunityChannels;
