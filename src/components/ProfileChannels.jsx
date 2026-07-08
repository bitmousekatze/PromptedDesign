import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadPostImage } from '../lib/storage';
import { EmojiPicker, GifPicker, ChatComposerStyles } from './chatComposer';

// ============================================
// EDIT PROFILE CHANNEL MODAL
// ============================================
const EditProfileChannelModal = ({ channel, onClose, onSubmit, onDelete }) => {
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
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(channel.id, { name: formatted, description: description.trim() || null, is_private: isPrivate });
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
            <div className="channel-name-input-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(formatName(e.target.value)); setError(''); }}
                placeholder="e.g. general"
                maxLength={50}
                autoFocus
                style={{ flex: 1 }}
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
            <span className="channel-modal-hint" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
              {isPrivate ? 'Only you and invited members can view this channel' : 'Everyone can access this channel'}
            </span>
          </div>

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

const AddProfileChannelModal = ({ onClose, onSubmit, submitting }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onSubmit({ name: name.trim(), description: description.trim(), isPrivate });
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="channel-modal" onSubmit={handleSubmit}>
        <div className="channel-modal-header">
          <h2>Create Channel</h2>
          <button type="button" className="channel-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="channel-modal-field">
          <label>Channel name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required autoFocus />
        </div>
        <div className="channel-modal-field">
          <label>Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={180} />
        </div>
        <label className="channel-private-toggle" style={{ marginBottom: '1rem' }}>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          <span>Private channel (only visible to you and invited members)</span>
        </label>
        <div className="channel-modal-actions">
          <button type="button" className="channel-modal-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="channel-modal-submit" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
};

const hexToRgb = (hex) => {
  if (!hex) return null;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : null;
};

const ProfileMessageItem = ({ message, currentUserId, isOwner, onReply, onEdit, onDelete, onUserClick }) => {
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
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className={`channel-message ${isOwn ? 'own' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {message.reply_message && (
        <div className="message-reply-ref">
          <span className="message-reply-ref-line" />
          <span className="message-reply-ref-avatar">
            {message.reply_message.profiles?.avatar_url ? (
              <img src={message.reply_message.profiles.avatar_url} alt="" />
            ) : (
              message.reply_message.profiles?.avatar_emoji || '👤'
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
        <div className="message-avatar" onClick={() => message.user_id && onUserClick?.(message.user_id)} style={{ cursor: 'pointer' }}>
          {message.profiles?.avatar_url ? (
            <img src={message.profiles.avatar_url} alt="" />
          ) : (
            <span>{message.profiles?.avatar_emoji || '👤'}</span>
          )}
        </div>
        <div className="message-body">
          <div className="message-header">
            <span className="message-username" onClick={() => message.user_id && onUserClick?.(message.user_id)} style={{ cursor: 'pointer', color: message.profiles?.name_color || 'var(--channel-accent, #22c55e)' }}>
              {message.profiles?.display_name || message.profiles?.username || 'Unknown'}
            </span>
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
              {message.content && <div className="message-content">{message.content}</div>}
              {message.image_url && (
                <a href={message.image_url} target="_blank" rel="noopener noreferrer" className="cafe-img-wrap">
                  <img src={message.image_url} alt="" className="cafe-img" loading="lazy" />
                </a>
              )}
            </>
          )}
        </div>

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
          </div>
        )}
      </div>
    </div>
  );
};

const ProfileChannels = ({ profileUserId, profileDisplayName, currentUser, onUserClick, profileNameColor, isFollowingOwner, onFollow }) => {
  const [profileCommunityId, setProfileCommunityId] = useState(null);
  const [channels, setChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [canPostInPrivate, setCanPostInPrivate] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editingChannel, setEditingChannel] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  const isOwner = currentUser?.id === profileUserId;
  const activeChannel = useMemo(() => channels.find(ch => ch.id === activeChannelId) || null, [channels, activeChannelId]);

  // Fetch the current user's actual profile data from the profiles table
  // so optimistic messages display the correct name (not stale auth user_metadata)
  useEffect(() => {
    // Always clear stale profile data immediately when user changes
    setCurrentUserProfile(null);

    if (!currentUser?.id) {
      return;
    }
    let cancelled = false;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_emoji, avatar_url, name_color')
        .eq('id', currentUser.id)
        .single();
      if (data && !cancelled) setCurrentUserProfile(data);
    };
    fetchProfile();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // Auto-dismiss send error after 4 seconds
  useEffect(() => {
    if (!sendError) return;
    const timer = setTimeout(() => setSendError(null), 4000);
    return () => clearTimeout(timer);
  }, [sendError]);

  const ensureProfileCommunity = useCallback(async () => {
    const { data: existing, error: existingError } = await supabase
      .from('communities')
      .select('id')
      .eq('profile_user_id', profileUserId)
      .eq('is_profile_channel', true)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing?.id) {
      setProfileCommunityId(existing.id);
      return existing.id;
    }

    if (!isOwner || !currentUser?.id) return null;

    // Create the profile community directly
    const slug = `profile-channel-${currentUser.id}`;
    const { data: created, error: createError } = await supabase
      .from('communities')
      .insert({
        name: `${profileDisplayName || 'User'}'s Profile`,
        slug,
        creator_id: currentUser.id,
        is_public: true,
        is_profile_channel: true,
        profile_user_id: currentUser.id
      })
      .select('id')
      .single();

    if (createError) throw createError;
    if (!created?.id) {
      throw new Error('Failed to create profile community');
    }

    setProfileCommunityId(created.id);
    return created.id;
  }, [currentUser?.id, isOwner, profileDisplayName, profileUserId]);

  const loadChannels = useCallback(async () => {
    if (!profileUserId) return;
    setLoadingChannels(true);
    try {
      const communityId = await ensureProfileCommunity();
      if (!communityId) {
        setChannels([]);
        setActiveChannelId(null);
        setLoadingChannels(false);
        return;
      }

      const { data, error } = await supabase
        .from('community_channels')
        .select('*')
        .eq('community_id', communityId)
        .order('position', { ascending: true });

      if (error) throw error;

      const nextChannels = data || [];
      setChannels(nextChannels);
      setActiveChannelId((prev) => {
        if (prev && nextChannels.some(ch => ch.id === prev)) return prev;
        return nextChannels.find(ch => ch.is_default)?.id || nextChannels[0]?.id || null;
      });
    } catch (err) {
      console.error('Error loading profile channels:', err);
      setChannels([]);
      setActiveChannelId(null);
    } finally {
      setLoadingChannels(false);
    }
  }, [ensureProfileCommunity, profileUserId]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const MESSAGE_SELECT = `
    *,
    profiles:user_id (username, display_name, avatar_emoji, avatar_url, name_color),
    reply_message:reply_to (
      id, content,
      profiles:user_id (username, display_name, avatar_emoji, avatar_url)
    )
  `;

  const loadMessages = useCallback(async (channelId, cursor = null) => {
    if (!channelId) return;
    setLoadingMessages(true);
    try {
      let query = supabase
        .from('channel_messages')
        .select(MESSAGE_SELECT)
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;
      if (error) throw error;

      const fetched = data || [];
      const ordered = [...fetched].reverse();
      setHasMore(fetched.length === 50);

      if (!cursor) {
        setMessages(ordered);
        requestAnimationFrame(() => {
          if (messagesRef.current) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
          }
        });
      } else {
        const container = messagesRef.current;
        const previousHeight = container?.scrollHeight || 0;
        setMessages((prev) => {
          const seen = new Set(prev.map(m => m.id));
          const uniqueOlder = ordered.filter(m => !seen.has(m.id));
          return [...uniqueOlder, ...prev];
        });
        requestAnimationFrame(() => {
          if (container) {
            const newHeight = container.scrollHeight;
            container.scrollTop = Math.max(0, newHeight - previousHeight + container.scrollTop);
          }
        });
      }
    } catch (err) {
      console.error('Error loading profile channel messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    setReplyTo(null);
    if (activeChannelId) {
      loadMessages(activeChannelId);
    }
  }, [activeChannelId, loadMessages]);

  useEffect(() => {
    const checkPostAccess = async () => {
      if (!activeChannel?.id || !currentUser?.id || isOwner || !activeChannel.is_private) {
        setCanPostInPrivate(false);
        return;
      }

      const { data } = await supabase
        .from('channel_allowed_users')
        .select('id')
        .eq('channel_id', activeChannel.id)
        .eq('user_id', currentUser.id)
        .maybeSingle();

      setCanPostInPrivate(Boolean(data));
    };

    checkPostAccess();
  }, [activeChannel?.id, activeChannel?.is_private, currentUser?.id, isOwner]);

  useEffect(() => {
    if (!activeChannelId) return undefined;

    const realtimeChannel = supabase
      .channel(`profile-channel-${activeChannelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'channel_messages',
        filter: `channel_id=eq.${activeChannelId}`
      }, async (payload) => {
        const inserted = payload.new;
        if (!inserted?.id) return;

        // Skip if it's our own message (handled by optimistic update)
        if (inserted.user_id === currentUser?.id) return;

        // Fetch the message with profile data via direct query
        const { data: rows } = await supabase
          .from('channel_messages')
          .select(MESSAGE_SELECT)
          .eq('id', inserted.id)
          .limit(1);

        const msg = rows?.[0];
        if (msg) {
          setMessages((prev) => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [activeChannelId, currentUser?.id]);

  const canPost = !!currentUser?.id && !!activeChannelId && (
    isOwner
    || (activeChannel?.is_private && canPostInPrivate)
    || !activeChannel?.is_private
  );

  const scrollToBottom = useCallback((smooth = false) => {
    const container = messagesRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  const ensureCommunityMember = useCallback(async (authUserId) => {
    if (!profileCommunityId || !authUserId) return;

    // Check if already a member
    const { data: existing } = await supabase
      .from('community_members')
      .select('id')
      .eq('community_id', profileCommunityId)
      .eq('user_id', authUserId)
      .maybeSingle();

    if (existing) return;

    // Auto-join the profile community so the RLS policy allows sending messages
    await supabase
      .from('community_members')
      .insert({
        community_id: profileCommunityId,
        user_id: authUserId,
        role: 'member'
      });
  }, [profileCommunityId]);

  const postProfileMessage = async ({ content: rawContent = '', imageUrl = null }) => {
    const content = (rawContent || '').trim();
    if (!canPost || (!content && !imageUrl) || sendingMessage) return;

    const currentReplyTo = replyTo;
    setSendingMessage(true);

    // Use currentUser from the React auth state - canPost already verified
    // currentUser.id is present. Previously this did a three-step session
    // check (getSession → refreshSession → getUser) which could fail for
    // email/password users when the cached session was stale, even though
    // the user was genuinely authenticated. The server-side RPC validates
    // auth.uid() independently, so a pre-flight check is unnecessary.
    if (!currentUser?.id) {
      setSendError('You must be signed in to send messages. Please sign out and sign back in.');
      setSendingMessage(false);
      return;
    }
    const authenticatedUserId = currentUser.id;

    // Ensure the Supabase client has a fresh token for the RPC call.
    // This is a best-effort refresh - if it fails, the RPC will still
    // attempt the call with whatever token is available.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      await supabase.auth.refreshSession();
    }

    // Optimistic update - use actual profile data from the profiles table.
    // Only use currentUserProfile if it was fetched for the CURRENT user
    // (it gets cleared to null on user change to prevent stale data from
    // a previous user leaking into the optimistic message).
    const safeProfile = currentUserProfile;
    const meta = currentUser.user_metadata || {};
    const optimisticMsg = {
      id: 'temp-' + Date.now(),
      channel_id: activeChannelId,
      user_id: authenticatedUserId,
      content: content || null,
      image_url: imageUrl,
      reply_to: currentReplyTo?.id || null,
      is_edited: false,
      created_at: new Date().toISOString(),
      profiles: {
        username: safeProfile?.username || meta.username || 'You',
        display_name: safeProfile?.display_name || meta.display_name || meta.username || 'You',
        avatar_emoji: safeProfile?.avatar_emoji || meta.avatar_emoji,
        avatar_url: safeProfile?.avatar_url || meta.avatar_url,
        name_color: safeProfile?.name_color || meta.name_color
      },
      reply_message: currentReplyTo ? {
        id: currentReplyTo.id,
        content: currentReplyTo.content,
        profiles: currentReplyTo.profiles
      } : null
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setReplyTo(null);
    setSendError(null);
    scrollToBottom(true);

    try {
      // Ensure the user is a community member (needed for RLS SELECT on messages)
      await ensureCommunityMember(authenticatedUserId);

      const rpcParams = {
        p_channel_id: activeChannelId,
        p_content: content
      };
      if (currentReplyTo?.id) rpcParams.p_reply_to = currentReplyTo.id;
      if (imageUrl) rpcParams.p_image_url = imageUrl;

      const { data, error } = await supabase.rpc('send_profile_channel_message', rpcParams);

      if (error) throw error;

      // The RPC returns a jsonb object with the message and profile data
      const msg = data;
      const realMsg = {
        id: msg.id,
        channel_id: msg.channel_id,
        user_id: msg.user_id,
        content: msg.content,
        image_url: msg.image_url,
        reply_to: msg.reply_to,
        is_edited: msg.is_edited,
        created_at: msg.created_at,
        updated_at: msg.updated_at,
        profiles: {
          username: msg.username,
          display_name: msg.display_name,
          avatar_emoji: msg.avatar_emoji,
          avatar_url: msg.avatar_url,
          name_color: msg.name_color
        },
        reply_message: currentReplyTo ? {
          id: currentReplyTo.id,
          content: currentReplyTo.content,
          profiles: currentReplyTo.profiles
        } : null
      };

      // Replace optimistic message with real one, and deduplicate in case
      // the realtime subscription already added this message
      setMessages(prev => {
        const withoutDupe = prev.filter(m => m.id !== realMsg.id || m.id === optimisticMsg.id);
        return withoutDupe.map(m => m.id === optimisticMsg.id ? realMsg : m);
      });
    } catch (err) {
      console.error('Error sending profile channel message:', err);
      // Remove optimistic message on error and show error to user
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      setMessageText(content);
      setSendError(err.message || 'Failed to send message. Please try again.');
    } finally {
      setSendingMessage(false);
      inputRef.current?.focus();
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    const content = messageText;
    setMessageText(''); setShowEmoji(false);
    await postProfileMessage({ content });
  };

  const handlePickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !canPost || !currentUser?.id) return;
    setUploading(true);
    try {
      const { url, error } = await uploadPostImage(supabase, f, currentUser.id);
      if (error) throw new Error(error);
      await postProfileMessage({ imageUrl: url });
    } catch (err) { console.error('Profile channel upload failed', err); setSendError('Could not upload image.'); }
    finally { setUploading(false); }
  };

  const handlePickGif = async (gifUrl) => { setShowGif(false); await postProfileMessage({ imageUrl: gifUrl }); };
  const insertEmoji = (emo) => { setMessageText((prev) => prev + emo); inputRef.current?.focus(); };

  const handleEditMessage = async (messageId, newContent) => {
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

  const handleDeleteMessage = async (messageId) => {
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

  const handleCreateChannel = async ({ name, description, isPrivate }) => {
    if (!isOwner) return;
    setCreatingChannel(true);
    try {
      let communityId = profileCommunityId;
      if (!communityId) {
        communityId = await ensureProfileCommunity();
      }
      if (!communityId) throw new Error('Missing profile community id');

      await supabase.from('community_channels').insert({
        community_id: communityId,
        name,
        description: description || null,
        channel_type: 'text',
        is_private: isPrivate,
        position: channels.length
      });

      setShowCreateModal(false);
      await loadChannels();
    } catch (err) {
      console.error('Error creating profile channel:', err);
    } finally {
      setCreatingChannel(false);
    }
  };

  const handleDeleteChannel = async (channelId) => {
    try {
      await supabase.from('channel_allowed_users').delete().eq('channel_id', channelId);
      await supabase.from('channel_messages').delete().eq('channel_id', channelId);
      await supabase.from('community_channels').delete().eq('id', channelId);
      await loadChannels();
    } catch (err) {
      console.error('Error deleting profile channel:', err);
      throw err;
    }
  };

  const handleEditChannel = async (channelId, updates) => {
    if (!isOwner) return;
    try {
      const { error } = await supabase
        .from('community_channels')
        .update(updates)
        .eq('id', channelId);
      if (error) throw error;
      await loadChannels();
    } catch (err) {
      console.error('Error editing profile channel:', err);
      throw err;
    }
  };

  const handleMessagesScroll = () => {
    const el = messagesRef.current;
    if (!el || loadingMessages || !hasMore || !messages.length) return;
    if (el.scrollTop > 80) return;

    const oldest = messages[0];
    if (!oldest?.created_at) return;
    loadMessages(activeChannelId, oldest.created_at);
  };

  return (
    <div
      className="community-channels-container"
      style={profileNameColor ? {
        '--channel-accent': profileNameColor,
        '--channel-accent-rgb': hexToRgb(profileNameColor) || '34, 197, 94'
      } : undefined}
    >
      <ChatComposerStyles />
      <button className="channel-mobile-toggle" onClick={() => setShowMobileSidebar(!showMobileSidebar)}>
        <span>#{activeChannel?.name || 'channels'}</span>
      </button>

      {showMobileSidebar && <div className="channel-sidebar-backdrop" onClick={() => setShowMobileSidebar(false)} />}
      <div className={`channel-sidebar ${showMobileSidebar ? 'show-mobile' : ''}`}>
        <div className="channel-sidebar-header">
          <h3 className="channel-sidebar-title">Channels</h3>
          <button className="channel-sidebar-close-mobile" onClick={() => setShowMobileSidebar(false)}>&times;</button>
        </div>
        <div className="channel-list">
          <div className="channel-group">
            <div className="channel-group-header">PROFILE CHANNELS</div>
            {channels.map((channel) => (
              <div key={channel.id} className="channel-item-wrapper">
                <button
                  className={`channel-item ${activeChannelId === channel.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveChannelId(channel.id);
                    setShowMobileSidebar(false);
                  }}
                >
                  <span className="channel-hash">{channel.is_private ? '🔒' : '#'}</span>
                  <span className="channel-name">{channel.name}</span>
                </button>
                {isOwner && (
                  <div className="channel-reorder-btns">
                    <button
                      className="channel-edit-btn"
                      onClick={(e) => { e.stopPropagation(); setEditingChannel(channel); }}
                      title="Edit channel"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {isOwner && (
          <button className="channel-create-btn" onClick={() => setShowCreateModal(true)}>+ Add Channel</button>
        )}
      </div>

      <div className="channel-feed">
        <div className="channel-feed-header">
          {showMobileSidebar ? null : (
            <button className="channel-sidebar-toggle" onClick={() => setShowMobileSidebar(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
          )}
          <h3>#{activeChannel?.name || 'Select channel'}</h3>
        </div>

        <div className="channel-messages" ref={messagesRef} onScroll={handleMessagesScroll}>
          {loadingChannels ? (
            <div className="channel-messages-loading">Loading channels...</div>
          ) : !activeChannel ? (
            <div className="channel-messages-empty"><h3>No channels available</h3></div>
          ) : messages.length === 0 ? (
            <div className="channel-messages-empty"><h3>No messages yet</h3></div>
          ) : (
            messages.map((message) => (
              <ProfileMessageItem
                key={message.id}
                message={message}
                currentUserId={currentUser?.id}
                isOwner={isOwner}
                onReply={(msg) => {
                  setReplyTo(msg);
                  inputRef.current?.focus();
                }}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
                onUserClick={onUserClick}
              />
            ))
          )}
        </div>

        {replyTo && canPost && (
          <div className="channel-reply-bar">
            <span className="channel-reply-bar-text">
              Replying to <strong>{replyTo.profiles?.display_name || replyTo.profiles?.username || 'message'}</strong>
            </span>
            <button className="channel-reply-bar-close" onClick={() => setReplyTo(null)}>&times;</button>
          </div>
        )}

        {sendError && (
          <div style={{
            padding: '0.5rem 1rem',
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            fontSize: '0.8rem',
            borderTop: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>{sendError}</span>
            <button onClick={() => setSendError(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}>&times;</button>
          </div>
        )}

        {canPost ? (
          <div className="cafe-composer">
            {showEmoji && <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />}
            {showGif && <GifPicker onPick={handlePickGif} onClose={() => setShowGif(false)} />}
            <div className="channel-input-bar">
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
              <textarea
                ref={inputRef}
                className="channel-input"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={`Message #${activeChannel?.name || ''}`}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <button className="channel-send-btn" onClick={handleSendMessage} disabled={sendingMessage || !messageText.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </button>
            </div>
          </div>
        ) : currentUser?.id ? null : (
          <div className="channel-input-bar disabled">
            <span className="channel-input-disabled-text">Sign in to send messages</span>
          </div>
        )}
      </div>

      {showCreateModal && isOwner && (
        <AddProfileChannelModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateChannel}
          submitting={creatingChannel}
        />
      )}

      {editingChannel && isOwner && (
        <EditProfileChannelModal
          channel={editingChannel}
          onClose={() => setEditingChannel(null)}
          onSubmit={handleEditChannel}
          onDelete={handleDeleteChannel}
        />
      )}
    </div>
  );
};

export default ProfileChannels;
