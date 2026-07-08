// Edit/manage community modal (creator settings, members, rules, payments) -
// extracted verbatim from App.jsx during the community component split
// (July 2026). No behavior change.
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAuth, useToast } from '../../lib/appShared.js';
import { uploadCommunityIcon, uploadCommunityBanner } from '../../lib/storage.js';
import { RichTextarea } from '../RichTextarea.jsx';
import { ImageCropper } from '../sharedUI.jsx';
import { TrashIcon, UserIcon } from '../icons.jsx';

const EditCommunityModal = ({ isOpen, onClose, community, onSuccess, onCreatePost = null }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const editIconInputRef = useRef(null);
  const editCoverInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('settings'); // 'settings', 'rules', 'members'
  const [formData, setFormData] = useState({
    name: community?.name || '',
    description: community?.description || ''
  });
  const [paymentData, setPaymentData] = useState({
    monthly_price_usd: community?.monthly_price_usd || '',
    btc_address: community?.btc_address || '',
    eth_address: community?.eth_address || '',
    sol_address: community?.sol_address || '',
    paypal_handle: community?.paypal_handle || '',
    stripe_payment_link: community?.stripe_payment_link || '',
  });
  const [savingPayment, setSavingPayment] = useState(false);
  const [rules, setRules] = useState([]);
  const [members, setMembers] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [newRule, setNewRule] = useState('');
  // Icon and cover image states
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [showIconCropper, setShowIconCropper] = useState(false);
  const [iconCropUrl, setIconCropUrl] = useState(null);
  const [showCoverCropper, setShowCoverCropper] = useState(false);
  const [coverCropUrl, setCoverCropUrl] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState(null);

  const communityEmojis = [
    '🎮', '💻', '🎨', '📚', '🎵', '🎬', '📷', '✍️',
    '🚀', '💡', '🔬', '🎯', '🏆', '⚡', '🌟', '💎',
    '🌍', '🎪', '🎭', '🎸', '🎹', '🎺', '🥁', '🎻',
    '⚽', '🏀', '🎾', '🏈', '🎱', '🏓', '🎳', '🎯',
    '🍳', '🍕', '🍔', '🍰', '☕', '🍷', '🍺', '🍜',
    '🐶', '🐱', '🐼', '🦁', '🦊', '🐰', '🦄', '🐲',
    '🌸', '🌺', '🌻', '🌴', '🌈', '⭐', '🌙', '☀️',
    '💰', '📈', '🎓', '📝', '🔧', '⚙️', '🛠️', '🔌'
  ];

  // Load rules and members when modal opens
  useEffect(() => {
    if (isOpen && community) {
      setFormData({
        name: community.name || '',
        description: community.description || ''
      });
      setPaymentData({
        monthly_price_usd: community.monthly_price_usd || '',
        btc_address: community.btc_address || '',
        eth_address: community.eth_address || '',
        sol_address: community.sol_address || '',
        paypal_handle: community.paypal_handle || '',
        stripe_payment_link: community.stripe_payment_link || '',
      });
      setIconFile(null);
      setIconPreview(null);
      setCoverFile(null);
      setCoverPreview(null);
      setSelectedEmoji(null);
      setShowEmojiPicker(false);
      loadRules();
      loadMembers();
      loadJoinRequests();
    }
  }, [isOpen, community?.id]);

  // Cleanup preview URLs
  useEffect(() => {
    return () => {
      if (iconPreview) URL.revokeObjectURL(iconPreview);
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      if (iconCropUrl) URL.revokeObjectURL(iconCropUrl);
      if (coverCropUrl) URL.revokeObjectURL(coverCropUrl);
    };
  }, [iconPreview, coverPreview, iconCropUrl, coverCropUrl]);

  const loadRules = async () => {
    if (!community) return;
    const { data } = await supabase
      .from('community_rules')
      .select('*')
      .eq('community_id', community.id)
      .order('rule_number');
    setRules(data || []);
  };

  const loadMembers = async () => {
    if (!community) return;
    setLoadingMembers(true);
    try {
      // Step 1: Get all community members
      const { data: membersData, error: membersError } = await supabase
        .from('community_members')
        .select('id, user_id, role, joined_at, is_muted')
        .eq('community_id', community.id)
        .order('joined_at');

      if (membersError) {
        console.error('Error loading members:', membersError);
        setMembers([]);
        setLoadingMembers(false);
        return;
      }

      if (!membersData || membersData.length === 0) {
        setMembers([]);
        setLoadingMembers(false);
        return;
      }

      // Step 2: Get profiles for all member user IDs
      const userIds = membersData.map(m => m.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_emoji, avatar_url, builder_points')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error loading member profiles:', profilesError);
      }

      // Step 3: Combine the data
      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));

      // Paid communities: fetch most-recent approved payment per member to derive last_paid / next_bill
      let paymentsByUser = new Map();
      if (community.is_paid) {
        const { data: approved } = await supabase
          .from('community_join_requests')
          .select('user_id, decided_at, payment_method')
          .eq('community_id', community.id)
          .eq('status', 'approved')
          .order('decided_at', { ascending: false });
        (approved || []).forEach(r => {
          if (!paymentsByUser.has(r.user_id)) paymentsByUser.set(r.user_id, r);
        });
      }

      const combinedData = membersData.map(member => {
        const pay = paymentsByUser.get(member.user_id);
        return {
          ...member,
          profiles: profilesMap.get(member.user_id) || null,
          last_paid_at: pay?.decided_at || null,
          last_payment_method: pay?.payment_method || null,
        };
      });

      setMembers(combinedData);
    } catch (err) {
      console.error('Error loading members:', err);
      setMembers([]);
    }
    setLoadingMembers(false);
  };

  const handleToggleMute = async (memberUserId, currentlyMuted) => {
    const { error } = await supabase
      .from('community_members')
      .update({ is_muted: !currentlyMuted })
      .eq('community_id', community.id)
      .eq('user_id', memberUserId);
    if (error) { addToast(error.message, 'error'); return; }
    addToast(currentlyMuted ? 'Unmuted' : 'Muted', 'success');
    loadMembers();
  };

  const handleBanMember = async (memberUserId, username) => {
    if (!confirm(`Ban @${username}? They will be removed and blocked from rejoining.`)) return;
    try {
      const { error: banErr } = await supabase
        .from('community_bans')
        .insert({ community_id: community.id, user_id: memberUserId, banned_by: user.id });
      if (banErr && banErr.code !== '23505') throw banErr;
      await supabase
        .from('community_members')
        .delete()
        .eq('community_id', community.id)
        .eq('user_id', memberUserId);
      addToast(`@${username} banned`, 'success');
      loadMembers();
    } catch (e) {
      addToast(e.message || 'Failed to ban', 'error');
    }
  };

  const loadJoinRequests = async () => {
    if (!community?.is_paid) { setJoinRequests([]); return; }
    setLoadingRequests(true);
    try {
      const { data: reqs } = await supabase
        .from('community_join_requests')
        .select('id, user_id, status, payment_method, tx_hash, payment_note, created_at')
        .eq('community_id', community.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (!reqs || reqs.length === 0) { setJoinRequests([]); setLoadingRequests(false); return; }
      const userIds = reqs.map(r => r.user_id);
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_emoji, avatar_url')
        .in('id', userIds);
      const profMap = new Map((profilesData || []).map(p => [p.id, p]));
      setJoinRequests(reqs.map(r => ({ ...r, profile: profMap.get(r.user_id) || null })));
    } catch (e) {
      setJoinRequests([]);
    }
    setLoadingRequests(false);
  };

  const handleApproveRequest = async (requestId) => {
    const note = window.prompt('Optional message to the buyer (leave blank for a generic approval):', '');
    if (note === null) return;
    const { error } = await supabase.rpc('approve_community_join_request', { p_request_id: requestId, p_note: note.trim() || null });
    if (error) { addToast(error.message, 'error'); return; }
    addToast('Request approved - member added', 'success');
    loadJoinRequests();
    loadMembers();
    window.dispatchEvent(new Event('paid-request-decided'));
  };

  const handleSavePayment = async () => {
    if (!community) return;
    const price = parseFloat(paymentData.monthly_price_usd);
    if (!price || price <= 0) { addToast('Enter a valid monthly price', 'error'); return; }
    const btc = paymentData.btc_address.trim();
    const eth = paymentData.eth_address.trim();
    const sol = paymentData.sol_address.trim();
    const stripe = paymentData.stripe_payment_link.trim();
    const paypal = paymentData.paypal_handle.trim();
    if (!btc && !eth && !sol && !stripe && !paypal) { addToast('Add at least one payment method', 'error'); return; }
    setSavingPayment(true);
    try {
      const { error } = await supabase
        .from('communities')
        .update({
          is_paid: true,
          monthly_price_usd: price,
          btc_address: btc || null,
          eth_address: eth || null,
          sol_address: sol || null,
          stripe_payment_link: stripe || null,
          paypal_handle: paypal || null,
        })
        .eq('id', community.id);
      if (error) throw error;
      addToast('Payment settings saved', 'success');
    } catch (e) {
      addToast(e.message || 'Failed to save', 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDenyRequest = async (requestId) => {
    const note = window.prompt('Reason for denial (sent to the buyer - e.g. "tx hash not found", "amount insufficient", "wrong wallet"):', '');
    if (note === null) return;
    const { error } = await supabase.rpc('deny_community_join_request', { p_request_id: requestId, p_note: note.trim() || null });
    if (error) { addToast(error.message, 'error'); return; }
    addToast('Request denied', 'success');
    loadJoinRequests();
    window.dispatchEvent(new Event('paid-request-decided'));
  };

  if (!isOpen || !community) return null;

  const isCreator = user && user.id === community.creator_id;
  if (!isCreator) return null;

  // Icon handlers
  const handleEditIconSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setIconCropUrl(url);
    setShowIconCropper(true);
    if (editIconInputRef.current) editIconInputRef.current.value = '';
  };

  const handleEditIconCrop = (croppedFile, previewUrl) => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    if (iconCropUrl) URL.revokeObjectURL(iconCropUrl);
    setIconFile(croppedFile);
    setIconPreview(previewUrl);
    setSelectedEmoji(null);
    setShowEmojiPicker(false);
    setShowIconCropper(false);
    setIconCropUrl(null);
  };

  const handleEditIconCropCancel = () => {
    if (iconCropUrl) URL.revokeObjectURL(iconCropUrl);
    setShowIconCropper(false);
    setIconCropUrl(null);
  };

  // Cover handlers
  const handleEditCoverSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCoverCropUrl(url);
    setShowCoverCropper(true);
    if (editCoverInputRef.current) editCoverInputRef.current.value = '';
  };

  const handleEditCoverCrop = (croppedFile, previewUrl) => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    if (coverCropUrl) URL.revokeObjectURL(coverCropUrl);
    setCoverFile(croppedFile);
    setCoverPreview(previewUrl);
    setShowCoverCropper(false);
    setCoverCropUrl(null);
  };

  const handleEditCoverCropCancel = () => {
    if (coverCropUrl) URL.revokeObjectURL(coverCropUrl);
    setShowCoverCropper(false);
    setCoverCropUrl(null);
  };

  const handleSaveSettings = async () => {
    if (!formData.name.trim()) {
      addToast('Community name is required', 'error');
      return;
    }

    setLoading(true);
    try {
      let iconImageUrl = community.icon_url || null;
      let headerImageUrl = community.header_url || community.cover_image || null;

      // Upload new icon if selected
      if (iconFile) {
        const result = await uploadCommunityIcon(supabase, iconFile, user.id, community.id);
        if (result.error) throw new Error(result.error);
        iconImageUrl = result.url;
      }

      // Upload new cover/banner if selected
      if (coverFile) {
        const result = await uploadCommunityBanner(supabase, coverFile, user.id, community.id);
        if (result.error) throw new Error(result.error);
        headerImageUrl = result.url;
      }

      const updateData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null
      };

      if (iconFile) {
        updateData.icon_url = iconImageUrl;
        updateData.icon = null; // Clear emoji when using image
      } else if (selectedEmoji) {
        updateData.icon = selectedEmoji;
        updateData.icon_url = null; // Clear custom image when using emoji
      }
      if (coverFile) {
        updateData.header_url = headerImageUrl;
        updateData.cover_image = headerImageUrl; // Keep backward compat
      }

      const { error } = await supabase
        .from('communities')
        .update(updateData)
        .eq('id', community.id);

      if (error) throw error;
      addToast('Community updated!', 'success');
      await onSuccess();
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.trim()) return;
    if (rules.length >= 10) {
      addToast('Maximum 10 rules allowed', 'error');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('community_rules')
        .insert({
          community_id: community.id,
          rule_number: rules.length + 1,
          rule_text: newRule.trim()
        });

      if (error) throw error;
      setNewRule('');
      await loadRules();
      addToast('Rule added!', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (ruleId, ruleNumber) => {
    setLoading(true);
    try {
      // Delete the rule
      const { error: deleteError } = await supabase
        .from('community_rules')
        .delete()
        .eq('id', ruleId);

      if (deleteError) throw deleteError;

      // Re-number remaining rules
      const remainingRules = rules.filter(r => r.id !== ruleId);
      for (let i = 0; i < remainingRules.length; i++) {
        if (remainingRules[i].rule_number !== i + 1) {
          await supabase
            .from('community_rules')
            .update({ rule_number: i + 1 })
            .eq('id', remainingRules[i].id);
        }
      }

      await loadRules();
      addToast('Rule deleted!', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleKickMember = async (memberUserId, memberUsername) => {
    if (memberUserId === community.creator_id) {
      addToast('Cannot remove the community creator', 'error');
      return;
    }

    if (!confirm(`Are you sure you want to remove @${memberUsername} from this community?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', community.id)
        .eq('user_id', memberUserId);

      if (error) throw error;
      await loadMembers();
      addToast(`@${memberUsername} has been removed from the community`, 'success');
      onSuccess();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePromoteToMod = async (memberUserId, memberUsername) => {
    if (memberUserId === community.creator_id) {
      addToast('Owner is already the highest role', 'error');
      return;
    }

    if (!confirm(`Promote @${memberUsername} to moderator? They will be able to remove posts and kick members.`)) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_members')
        .update({ role: 'moderator' })
        .eq('community_id', community.id)
        .eq('user_id', memberUserId)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Failed to update member role - member not found');
      }
      await loadMembers();
      addToast(`@${memberUsername} is now a moderator`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoteFromMod = async (memberUserId, memberUsername) => {
    if (!confirm(`Remove @${memberUsername} from moderators? They will become a regular member.`)) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_members')
        .update({ role: 'member' })
        .eq('community_id', community.id)
        .eq('user_id', memberUserId)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Failed to update member role - member not found');
      }
      await loadMembers();
      addToast(`@${memberUsername} is no longer a moderator`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Manage Community</h2>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color)',
          padding: '0 1.5rem'
        }}>
          <button
            onClick={() => setActiveTab('settings')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: activeTab === 'settings' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'settings' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              fontWeight: activeTab === 'settings' ? '600' : '400'
            }}
          >
            Settings
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: activeTab === 'rules' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'rules' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              fontWeight: activeTab === 'rules' ? '600' : '400'
            }}
          >
            Rules ({rules.length}/10)
          </button>
          <button
            onClick={() => setActiveTab('members')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: activeTab === 'members' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'members' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              fontWeight: activeTab === 'members' ? '600' : '400'
            }}
          >
            Members ({members.length})
          </button>
          {community && (
            <button
              onClick={() => setActiveTab('payment')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: activeTab === 'payment' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottom: activeTab === 'payment' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                fontWeight: activeTab === 'payment' ? '600' : '400'
              }}
            >
              Payment
            </button>
          )}
          {community?.is_paid && (
            <button
              onClick={() => setActiveTab('requests')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: activeTab === 'requests' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottom: activeTab === 'requests' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                fontWeight: activeTab === 'requests' ? '600' : '400'
              }}
            >
              Requests ({joinRequests.length})
            </button>
          )}
        </div>

        <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <>
              {onCreatePost && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem', padding: '0.7rem 0.9rem', background: 'rgba(99,91,255,0.06)', border: '1px solid rgba(99,91,255,0.2)', borderRadius: 8 }}>
                  <span style={{ flex: '1 1 100%', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: 4 }}>Post directly to this community:</span>
                  <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '5px 10px' }} onClick={() => { onCreatePost(community.id, 'build'); onClose(); }}>+ Build</button>
                  <button className="btn" style={{ fontSize: '0.78rem', padding: '5px 10px' }} onClick={() => { onCreatePost(community.id, 'discussion'); onClose(); }}>+ Discussion</button>
                  <button className="btn" style={{ fontSize: '0.78rem', padding: '5px 10px' }} onClick={() => { onCreatePost(community.id, 'question'); onClose(); }}>+ Question</button>
                </div>
              )}
              {/* Community Icon (400x400 circle, matching profile PFP) */}
              <div className="form-group">
                <label className="form-label">Community Icon</label>
                <input
                  type="file"
                  ref={editIconInputRef}
                  className="file-input-hidden"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleEditIconSelect}
                />
                <div className="selected-emoji-preview">
                  {iconPreview ? (
                    <img
                      src={iconPreview}
                      alt="Icon preview"
                      style={{
                        width: '64px',
                        height: '64px',
                        objectFit: 'cover',
                        borderRadius: '12px'
                      }}
                    />
                  ) : selectedEmoji ? (
                    <div className="selected-emoji-icon">{selectedEmoji}</div>
                  ) : community?.icon_url ? (
                    <img
                      src={community.icon_url}
                      alt="Icon"
                      style={{
                        width: '64px',
                        height: '64px',
                        objectFit: 'cover',
                        borderRadius: '12px'
                      }}
                    />
                  ) : (
                    <div className="selected-emoji-icon">{community?.icon || '🌟'}</div>
                  )}
                  <span className="selected-emoji-label">
                    {iconPreview ? 'Custom image selected' : selectedEmoji ? 'Using emoji icon' : community?.icon_url ? 'Custom image' : 'Using emoji icon'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => { editIconInputRef.current?.click(); setShowEmojiPicker(false); }}
                    style={{ flex: 1 }}
                  >
                    {iconPreview || (!selectedEmoji && community?.icon_url) ? 'Change Image' : 'Upload Image'}
                  </button>
                  {(iconPreview || (!selectedEmoji && community?.icon_url)) && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        if (iconPreview) URL.revokeObjectURL(iconPreview);
                        setIconFile(null);
                        setIconPreview(null);
                        setSelectedEmoji(community?.icon || '🌟');
                      }}
                    >
                      Use Emoji
                    </button>
                  )}
                </div>
                {!iconPreview && (selectedEmoji || !community?.icon_url) && (
                  <>
                    <button
                      type="button"
                      className="form-input"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      style={{ cursor: 'pointer', textAlign: 'left' }}
                    >
                      {showEmojiPicker ? 'Hide emoji picker' : 'Choose an emoji'}
                    </button>
                    {showEmojiPicker && (
                      <div className="emoji-picker-grid">
                        {communityEmojis.map((emoji, index) => (
                          <button
                            key={index}
                            type="button"
                            className={`emoji-picker-item ${(selectedEmoji || community?.icon) === emoji ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedEmoji(emoji);
                              setShowEmojiPicker(false);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Community Banner (3:1 aspect ratio) */}
              <div className="form-group">
                <label className="form-label">Banner Image <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>(1500 x 500)</span></label>
                <input
                  type="file"
                  ref={editCoverInputRef}
                  className="file-input-hidden"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleEditCoverSelect}
                />
                <div style={{
                  width: '100%',
                  height: 0,
                  paddingBottom: '25%',
                  borderRadius: '10px',
                  background: 'var(--bg-tertiary)',
                  overflow: 'hidden',
                  marginBottom: '0.5rem',
                  border: '2px dashed var(--border-color)',
                  cursor: 'pointer',
                  position: 'relative'
                }} onClick={() => editCoverInputRef.current?.click()}>
                  {coverPreview ? (
                    <img src={coverPreview} alt="Banner" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (community?.header_url || community?.cover_image) ? (
                    <img src={community.header_url || community.cover_image} alt="Banner" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '0.85rem'
                    }}>Click to upload banner image</div>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Community Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  maxLength={50}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <RichTextarea
                  value={formData.description}
                  onChange={(v) => setFormData({ ...formData, description: v })}
                  maxLength={300}
                  placeholder="What is this community about?"
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleSaveSettings}
                disabled={loading || !formData.name.trim()}
                style={{ width: '100%' }}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}

          {/* Rules Tab */}
          {activeTab === 'rules' && (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Add rules for your community. Members will see these when they join.
              </p>

              {rules.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        marginBottom: '0.5rem'
                      }}
                    >
                      <span style={{
                        background: 'var(--accent-primary)',
                        color: 'white',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        flexShrink: 0
                      }}>
                        {rule.rule_number}
                      </span>
                      <span style={{ flex: 1, color: 'var(--text-primary)' }}>{rule.rule_text}</span>
                      <button
                        onClick={() => handleDeleteRule(rule.id, rule.rule_number)}
                        disabled={loading}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '0.25rem'
                        }}
                        title="Delete rule"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {rules.length < 10 && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Add a new rule..."
                    value={newRule}
                    onChange={e => setNewRule(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleAddRule()}
                    maxLength={200}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleAddRule}
                    disabled={loading || !newRule.trim()}
                  >
                    Add
                  </button>
                </div>
              )}

              {rules.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '2rem',
                  color: 'var(--text-muted)'
                }}>
                  <p>No rules yet. Add rules to help members understand community guidelines.</p>
                </div>
              )}
            </>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Manage community members. As the owner, you can remove members and assign moderators.
              </p>

              {loadingMembers ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="spinner"></div>
                  <p>Loading members...</p>
                </div>
              ) : members.length > 0 ? (
                <div>
                  {/* Owner Section */}
                  {(() => {
                    const ownerMember = members.find(m => m.user_id === community.creator_id);
                    const moderatorMembers = members.filter(m => m.role === 'moderator' && m.user_id !== community.creator_id);
                    const regularMembers = members.filter(m => m.role !== 'moderator' && m.user_id !== community.creator_id);

                    return (
                      <>
                        {/* Owner */}
                        <div style={{
                          marginBottom: '1.5rem'
                        }}>
                          <div style={{
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            color: 'var(--text-secondary)',
                            marginBottom: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <span style={{ color: 'var(--accent-primary)' }}>Owner</span>
                            <span style={{ color: 'var(--text-muted)' }}>(1)</span>
                          </div>
                          {ownerMember && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.75rem',
                                background: 'var(--bg-secondary)',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)'
                              }}
                            >
                              <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: 'var(--bg-tertiary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                                flexShrink: 0
                              }}>
                                {ownerMember.profiles?.avatar_url ? (
                                  <img src={ownerMember.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : ownerMember.profiles?.avatar_emoji ? (
                                  <span style={{ fontSize: '1.2rem' }}>{ownerMember.profiles.avatar_emoji}</span>
                                ) : (
                                  <UserIcon />
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: '500', color: ownerMember.profiles?.name_color || 'var(--text-primary)' }}>
                                  {ownerMember.profiles?.display_name || ownerMember.profiles?.username || 'Unknown'}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  @{ownerMember.profiles?.username || 'unknown'}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Moderators */}
                        <div style={{ marginBottom: '1.5rem' }}>
                          <div style={{
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            color: 'var(--text-secondary)',
                            marginBottom: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <span style={{ color: 'var(--accent-primary)' }}>Moderators</span>
                            <span style={{ color: 'var(--text-muted)' }}>({moderatorMembers.length})</span>
                          </div>
                          {moderatorMembers.length > 0 ? (
                            moderatorMembers.map((member) => {
                              const profile = member.profiles;
                              return (
                                <div
                                  key={member.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.75rem',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '8px',
                                    marginBottom: '0.5rem',
                                    border: '1px solid var(--border-color)'
                                  }}
                                >
                                  <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    background: 'var(--bg-tertiary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    flexShrink: 0
                                  }}>
                                    {profile?.avatar_url ? (
                                      <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : profile?.avatar_emoji ? (
                                      <span style={{ fontSize: '1.2rem' }}>{profile.avatar_emoji}</span>
                                    ) : (
                                      <UserIcon />
                                    )}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <span style={{ fontWeight: '500', color: profile?.name_color || 'var(--text-primary)' }}>
                                        {profile?.display_name || profile?.username || 'Unknown'}
                                      </span>
                                      <span style={{
                                        fontSize: '0.65rem',
                                        padding: '0.1rem 0.35rem',
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--accent-primary)',
                                        borderRadius: '4px',
                                        fontWeight: '600',
                                        border: '1px solid var(--accent-primary)'
                                      }}>Mod</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                      @{profile?.username || 'unknown'}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                      onClick={() => handleDemoteFromMod(member.user_id, profile?.username)}
                                      disabled={loading}
                                      className="btn btn-secondary"
                                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                                      title="Remove from moderators"
                                    >
                                      Demote
                                    </button>
                                    <button
                                      onClick={() => handleKickMember(member.user_id, profile?.username)}
                                      disabled={loading}
                                      className="btn btn-secondary"
                                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--error-color)' }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div style={{
                              textAlign: 'center',
                              padding: '1rem',
                              color: 'var(--text-muted)',
                              background: 'var(--bg-secondary)',
                              borderRadius: '8px',
                              fontSize: '0.85rem'
                            }}>
                              <p style={{ margin: 0 }}>No moderators yet. Promote members below to help moderate.</p>
                            </div>
                          )}
                        </div>

                        {/* Members */}
                        <div>
                          <div style={{
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            color: 'var(--text-secondary)',
                            marginBottom: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <span>Members</span>
                            <span style={{ color: 'var(--text-muted)' }}>({regularMembers.length})</span>
                          </div>
                          {regularMembers.length > 0 ? (
                            regularMembers.map((member) => {
                              const profile = member.profiles;
                              return (
                                <div
                                  key={member.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.75rem',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '8px',
                                    marginBottom: '0.5rem'
                                  }}
                                >
                                  <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    background: 'var(--bg-tertiary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    flexShrink: 0
                                  }}>
                                    {profile?.avatar_url ? (
                                      <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : profile?.avatar_emoji ? (
                                      <span style={{ fontSize: '1.2rem' }}>{profile.avatar_emoji}</span>
                                    ) : (
                                      <UserIcon />
                                    )}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: '500', color: profile?.name_color || 'var(--text-primary)' }}>
                                      {profile?.display_name || profile?.username || 'Unknown'}
                                      {member.is_muted && <span style={{ marginLeft: 6, fontSize: '0.65rem', padding: '1px 6px', borderRadius: 10, background: 'rgba(234,179,8,0.2)', color: '#fde68a' }}>muted</span>}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                      @{profile?.username || 'unknown'}
                                    </div>
                                    {community.is_paid && member.last_paid_at && (() => {
                                      const lastPaid = new Date(member.last_paid_at);
                                      const nextBill = new Date(lastPaid.getTime() + 30 * 24 * 60 * 60 * 1000);
                                      const daysLeft = Math.ceil((nextBill - Date.now()) / (24 * 60 * 60 * 1000));
                                      const overdue = daysLeft <= 0;
                                      return (
                                        <div style={{ fontSize: '0.72rem', color: overdue ? '#fca5a5' : 'var(--text-muted)', marginTop: 2 }}>
                                          Paid {lastPaid.toLocaleDateString()} via {(member.last_payment_method || '-').toUpperCase()} · next bill {overdue ? `overdue ${-daysLeft}d` : `in ${daysLeft}d`}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    <button
                                      onClick={() => handlePromoteToMod(member.user_id, profile?.username)}
                                      disabled={loading}
                                      className="btn btn-secondary"
                                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                                      title="Make moderator"
                                    >
                                      Promote
                                    </button>
                                    <button
                                      onClick={() => handleToggleMute(member.user_id, member.is_muted)}
                                      className="btn btn-secondary"
                                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                                      title={member.is_muted ? 'Unmute' : 'Mute (block chat)'}
                                    >
                                      {member.is_muted ? 'Unmute' : 'Mute'}
                                    </button>
                                    <button
                                      onClick={() => handleKickMember(member.user_id, profile?.username)}
                                      disabled={loading}
                                      className="btn btn-secondary"
                                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--error-color)' }}
                                    >
                                      Kick
                                    </button>
                                    <button
                                      onClick={() => handleBanMember(member.user_id, profile?.username)}
                                      className="btn btn-secondary"
                                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--error-color)', fontWeight: 600 }}
                                      title="Ban (remove + block rejoin)"
                                    >
                                      Ban
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div style={{
                              textAlign: 'center',
                              padding: '1rem',
                              color: 'var(--text-muted)',
                              background: 'var(--bg-secondary)',
                              borderRadius: '8px'
                            }}>
                              <p style={{ margin: 0 }}>No other members yet.</p>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '2rem',
                  color: 'var(--text-muted)'
                }}>
                  <p>No members yet.</p>
                </div>
              )}
            </>
          )}

          {/* Payment Tab - show for owner; saving promotes to paid */}
          {activeTab === 'payment' && community && (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Wallet addresses subscribers will see when they go to join. Update them anytime; new join requests will show the latest addresses.
              </p>

              <div className="form-group">
                <label className="form-label">Monthly price (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input"
                  value={paymentData.monthly_price_usd}
                  onChange={e => setPaymentData({ ...paymentData, monthly_price_usd: e.target.value })}
                  placeholder="e.g. 9.99"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Stripe Payment Link <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem' }}>(create in dashboard.stripe.com/payment-links)</span></label>
                <input
                  type="url"
                  className="form-input"
                  value={paymentData.stripe_payment_link}
                  onChange={e => setPaymentData({ ...paymentData, stripe_payment_link: e.target.value })}
                  placeholder="https://buy.stripe.com/..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Solana (SOL) address</label>
                <input
                  type="text"
                  className="form-input"
                  value={paymentData.sol_address}
                  onChange={e => setPaymentData({ ...paymentData, sol_address: e.target.value })}
                  placeholder="Your SOL wallet"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Bitcoin (BTC) address</label>
                <input
                  type="text"
                  className="form-input"
                  value={paymentData.btc_address}
                  onChange={e => setPaymentData({ ...paymentData, btc_address: e.target.value })}
                  placeholder="Your BTC wallet"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Ethereum (ETH) address</label>
                <input
                  type="text"
                  className="form-input"
                  value={paymentData.eth_address}
                  onChange={e => setPaymentData({ ...paymentData, eth_address: e.target.value })}
                  placeholder="Your ETH wallet"
                />
              </div>

              <div className="form-group">
                <label className="form-label">PayPal</label>
                <input
                  type="text"
                  className="form-input"
                  value={paymentData.paypal_handle}
                  onChange={e => setPaymentData({ ...paymentData, paypal_handle: e.target.value })}
                  placeholder="paypal.me/you or your PayPal email"
                />
              </div>

              <div style={{ background: 'rgba(99,91,255,0.08)', border: '1px solid rgba(99,91,255,0.25)', borderRadius: 8, padding: '0.7rem 0.9rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#cbd5e1' }}>
                <strong style={{ color: '#e6edf3' }}>How approvals work:</strong> a subscriber submits a join request with their tx hash as a note. You verify the payment on-chain, then approve them from the Requests tab.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" disabled={savingPayment} onClick={handleSavePayment}>
                  {savingPayment ? 'Saving…' : 'Save payment settings'}
                </button>
              </div>
            </>
          )}

          {/* Join Requests Tab (paid communities only) */}
          {activeTab === 'requests' && community?.is_paid && (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Pending paid-community join requests. Verify the payment off-platform (BTC/ETH/SOL), then approve.
              </p>
              {loadingRequests ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner"></div><p>Loading…</p></div>
              ) : joinRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}><p>No pending requests.</p></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {joinRequests.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.8rem', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {r.profile?.avatar_url ? <img src={r.profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : r.profile?.avatar_emoji ? <span>{r.profile.avatar_emoji}</span> : <UserIcon />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.profile?.display_name || r.profile?.username || 'unknown'}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>@{r.profile?.username || 'unknown'} · paid via {(r.payment_method || '-').toUpperCase()}</div>
                        {r.tx_hash && <div style={{ fontSize: '0.72rem', color: '#fde68a', marginTop: 2, wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' }}>tx: {r.tx_hash}</div>}
                        {r.payment_note && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, wordBreak: 'break-all' }}>“{r.payment_note}”</div>}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn btn-primary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleApproveRequest(r.id)}>Approve</button>
                        <button className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', color: 'var(--error-color)' }} onClick={() => handleDenyRequest(r.id)}>Deny</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* Icon Cropper */}
      {showIconCropper && iconCropUrl && (
        <ImageCropper
          imageUrl={iconCropUrl}
          aspectRatio={1}
          onCrop={handleEditIconCrop}
          onCancel={handleEditIconCropCancel}
          cropShape="circle"
        />
      )}

      {/* Cover Cropper */}
      {showCoverCropper && coverCropUrl && (
        <ImageCropper
          imageUrl={coverCropUrl}
          aspectRatio={2.5}
          onCrop={handleEditCoverCrop}
          onCancel={handleEditCoverCropCancel}
          cropShape="rectangle"
        />
      )}
    </div>
  );
};

export default EditCommunityModal;
