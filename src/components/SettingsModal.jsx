// Settings modal (profile, appearance, categories, schools, badges, legal) -
// extracted verbatim from App.jsx during the settings component split
// (July 2026). No behavior change. ProBadgeCustomizer is a private helper
// used only by this modal.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { useToast, hexToRgba, ensureAbsoluteUrl, isReservedTopLevelSegment } from '../lib/appShared.js';
import { uploadAvatar, uploadHeader, validateFile, validateBannerVideoFile, isVideoBannerUrl, uploadBadgeIcon } from '../lib/storage.js';
import { validateUsername, validateDisplayName } from '../utils/bannedWords.js';
import { fetchUserBadges, loadDisplayedBadges, updateOwnBadgeOverrides } from '../lib/badges.js';
import { getOrCreateReferralCode, setReferralCode, referralLink } from '../lib/referrals.js';
import { ImageCropper, SpotlightGem } from './sharedUI.jsx';
import NftBadgePicker from './NftBadgePicker.jsx';
import ConnectAgent from './settings/ConnectAgent.jsx';
import DesktopNotifications from './settings/DesktopNotifications.jsx';
import { CameraIcon, CheckIcon, ChevronRightIcon, DocumentIcon, PaletteIcon, PlusIcon, SettingsIcon, ShieldIcon, TagIcon, TrashIcon, UserIcon, ZoomInIcon } from './icons.jsx';

// Pro self-service editor for a held badge: pick a color and the hover text
// (e.g. "Verified Marketer"). Saves via a SECURITY DEFINER RPC.
const ProBadgeCustomizer = ({ badge, userId, onSaved }) => {
  const [label, setLabel] = useState(badge.label_override || '');
  const [color, setColor] = useState(badge.color_override || badge.color || '#FFD700');
  const [iconUrl, setIconUrl] = useState(badge.icon_url_override || '');
  // Hover-text-box color - only meaningful for the Spotlight gem's styled tooltip.
  // Default gold, exactly as it renders today.
  const [textColor, setTextColor] = useState(badge.text_color_override || '#FFD700');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [cropUrl, setCropUrl] = useState(null); // object URL of the picked image
  const [showNft, setShowNft] = useState(false);
  const iconInputRef = useRef(null);

  const isSpotlight = badge.slug === 'spotlight';
  const placeholder = badge.slug === 'verified' ? 'Verified Marketer' : badge.label;

  // Pick any image (no size limit - it gets cropped & shrunk to icon size),
  // then open the cropper so the user can zoom/position before upload.
  const onPickIcon = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type?.startsWith('image/')) { setMsg('Please choose an image file.'); return; }
    setMsg('');
    setCropUrl(URL.createObjectURL(file));
    if (iconInputRef.current) iconInputRef.current.value = '';
  };

  // Receives the cropped 400×400 file from ImageCropper, uploads it.
  const onCropped = async (croppedFile) => {
    setCropUrl(null);
    setUploading(true);
    setMsg('');
    try {
      const res = await uploadBadgeIcon(supabase, croppedFile, userId, badge.badge_id);
      if (res.error) setMsg(res.error);
      else setIconUrl(res.url);
    } catch (err) {
      setMsg(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await updateOwnBadgeOverrides(badge.badge_id, label.trim(), color, iconUrl, isSpotlight ? textColor : null);
      setMsg('Saved! Your badge is updated.');
    } catch (e) {
      setMsg(e.message || 'Could not save.');
    } finally {
      setSaving(false);
      if (onSaved) onSaved();
    }
  };

  return (
    <div style={{
      marginTop: '0.85rem', padding: '0.85rem', borderRadius: 10,
      border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)',
      display: 'flex', flexDirection: 'column', gap: '0.7rem',
    }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        ✨ Customize {badge.label_override || badge.label}
        {isSpotlight ? (
          <span style={{ fontSize: '0.7rem', color: '#FFD700', border: '1px solid #FFD700', borderRadius: 999, padding: '0.05rem 0.45rem' }}>FREE</span>
        ) : (
          <span style={{ fontSize: '0.7rem', color: '#C9A227', border: '1px solid #C9A227', borderRadius: 999, padding: '0.05rem 0.45rem' }}>PRO</span>
        )}
      </div>

      <div>
        <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '0.3rem' }}>Hover text</label>
        <input
          value={label}
          maxLength={40}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8,
            border: '1px solid var(--border-color)', background: 'var(--bg-secondary, #15171c)',
            color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
          }}
        />
        <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.25rem' }}>
          {isSpotlight
            ? <>This is the text shown in the hover box. Leave blank for the default “{badge.label}”.</>
            : <>Try “Verified Marketer”, “Verified Developer”, “Verified Creator”. Leave blank for the default “{badge.label}”.</>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <label style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{isSpotlight ? 'Gem color' : 'Color'}</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
          style={{ width: 38, height: 30, border: '1px solid var(--border-color)', borderRadius: 7, background: 'transparent', cursor: 'pointer', padding: 0 }} />
        <input value={color} onChange={(e) => setColor(e.target.value)}
          style={{ width: 100, padding: '0.4rem 0.5rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary, #15171c)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }} />
        {iconUrl ? (
          <img src={iconUrl} alt="" title={label || badge.label} style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', background: color }} />
        ) : isSpotlight ? (
          <span style={{ marginLeft: 'auto' }}><SpotlightGem size={22} color={color} /></span>
        ) : (
          <span title={label || badge.label} style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: '50%', background: color, color: '#0a0a0a',
            fontSize: 12, fontWeight: 700,
          }}>{badge.icon || '★'}</span>
        )}
      </div>

      {/* Spotlight only: the gem's hover text box ("the box that opens when
          another hovers over it") gets its own color - default gold. The preview
          below is the EXACT styled tooltip, so what you see is what shows on hover. */}
      {isSpotlight && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <label style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Hover text box color</label>
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)}
              style={{ width: 38, height: 30, border: '1px solid var(--border-color)', borderRadius: 7, background: 'transparent', cursor: 'pointer', padding: 0 }} />
            <input value={textColor} onChange={(e) => setTextColor(e.target.value)}
              style={{ width: 100, padding: '0.4rem 0.5rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary, #15171c)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }} />
            <button type="button" onClick={() => setTextColor('#FFD700')}
              style={{ marginLeft: 'auto', padding: '0.3rem 0.6rem', borderRadius: 7, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', background: 'transparent', color: '#9ca3af' }}>
              Reset to gold
            </button>
          </div>
          {/* Live preview: same styling as the real .spotlight-tip tooltip. */}
          <div style={{ marginTop: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Preview:</span>
            <span style={{
              display: 'inline-block', background: '#15171c', color: textColor,
              border: `1px solid ${hexToRgba(textColor, 0.55)}`, padding: '4px 10px',
              borderRadius: 8, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
            }}>{label.trim() || badge.label_override || badge.label}</span>
          </div>
        </div>
      )}

      <div>
        <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '0.3rem' }}>Custom icon (optional)</label>
        <input ref={iconInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={onPickIcon} style={{ display: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" disabled={uploading} onClick={() => iconInputRef.current?.click()} style={{
            padding: '0.4rem 0.8rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
            cursor: uploading ? 'default' : 'pointer', border: '1px solid var(--border-color)',
            background: 'transparent', color: 'var(--text-primary)',
          }}>{uploading ? 'Uploading…' : iconUrl ? 'Replace icon' : '⬆ Upload icon'}</button>
          {iconUrl && (
            <button type="button" onClick={() => setIconUrl('')} style={{
              padding: '0.4rem 0.7rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
              cursor: 'pointer', border: '1px solid var(--border-color)', background: 'transparent', color: '#ff6b6b',
            }}>Remove</button>
          )}
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>Upload any image - zoom &amp; shrink it to fit. Replaces the glyph.</span>
        </div>
      </div>

      {/* Use an NFT you own */}
      <div>
        <button type="button" onClick={() => setShowNft((v) => !v)} style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem',
          borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
          border: '1px solid var(--border-color)', background: showNft ? 'rgba(168,85,247,0.12)' : 'transparent',
          color: 'var(--text-primary)',
        }}>🖼️ Use an NFT you own {showNft ? '▲' : '▼'}</button>
        {showNft && (
          <div style={{ marginTop: '0.6rem' }}>
            <NftBadgePicker
              userId={userId}
              badgeId={badge.badge_id}
              onIconSet={(url) => setIconUrl(url)}
            />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <button type="button" disabled={saving} onClick={save} style={{
          padding: '0.45rem 1rem', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700,
          cursor: saving ? 'default' : 'pointer', border: 'none', background: '#4ECDC4', color: '#06251f',
        }}>{saving ? 'Saving…' : 'Save badge'}</button>
        {msg && <span style={{ fontSize: '0.78rem', color: msg.startsWith('Saved') ? '#4ECDC4' : '#ff6b6b' }}>{msg}</span>}
      </div>

      {cropUrl && (
        <ImageCropper
          imageUrl={cropUrl}
          aspectRatio={1}
          cropShape="circle"
          onCrop={(file) => onCropped(file)}
          onCancel={() => setCropUrl(null)}
        />
      )}
    </div>
  );
};

// ============================================
// SETTINGS MODAL COMPONENT
// ============================================
const SettingsModal = ({ isOpen, onClose, user, profile, onProfileUpdate, onLogout, onDeleteAccount, onCancelDeletion, categories = [], userFollowedCategories = [], onFollowCategory, userPostCount = 0, onNavigateToLegal, schoolLeaderboard = [], userSchool = null, onJoinSchool, onLeaveSchool }) => {
  const { addToast } = useToast();
  const avatarInputRef = useRef(null);
  const headerInputRef = useRef(null);
  // Account email reveal toggle. Shown masked by default; "Reveal" shows it in full.
  const [emailRevealed, setEmailRevealed] = useState(false);
  const [formData, setFormData] = useState({
    display_name: '',
    username: '',
    bio: '',
    avatar_emoji: '',
    avatar_url: '',
    header_url: '',
    name_color: '',
    github_url: '',
    website_url: '',
    displayed_badge: '',
    displayed_badge_2: ''
  });

  // Referral code (lives in referral_codes, edited via RPC - profiles is column-locked)
  const [refCode, setRefCode] = useState('');
  const [refCodeInput, setRefCodeInput] = useState('');
  const [refCodeSaving, setRefCodeSaving] = useState(false);
  const [refCodeMsg, setRefCodeMsg] = useState('');
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    getOrCreateReferralCode()
      .then((c) => { if (active && c) { setRefCode(c); setRefCodeInput(c); } })
      .catch(() => {});
    return () => { active = false; };
  }, [user?.id]);
  const handleSaveRefCode = async () => {
    const next = (refCodeInput || '').trim().toLowerCase();
    if (!next || next === refCode) return;
    setRefCodeSaving(true);
    setRefCodeMsg('');
    try {
      const saved = await setReferralCode(next);
      setRefCode(saved);
      setRefCodeInput(saved);
      setRefCodeMsg('Saved!');
      addToast('Referral code updated!', 'success');
    } catch (e) {
      setRefCodeMsg(e?.message || 'Could not save that code.');
    } finally {
      setRefCodeSaving(false);
    }
  };

  // Badges this user holds and may choose to display
  const [ownedBadges, setOwnedBadges] = useState([]);
  const reloadOwnedBadges = useCallback(async () => {
    if (!user?.id) return;
    try { setOwnedBadges(await fetchUserBadges(user.id)); } catch {}
  }, [user?.id]);
  useEffect(() => {
    let active = true;
    if (user?.id) {
      fetchUserBadges(user.id)
        .then((b) => { if (active) setOwnedBadges(b); })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [user?.id]);
  // Pro members can recolor / relabel their displayed badge.
  const isProMember = ownedBadges.some((b) => b.slug === 'pro');
  // Animated (video) banners: active Pro OR contest winner (spotlight badge).
  // Mirrors public.can_use_animated_banner() - the trigger on profiles is the
  // real gate; this only decides what the picker offers.
  const canAnimatedBanner =
    (!!profile?.is_pro && (!profile?.pro_expires_at || new Date(profile.pro_expires_at) > new Date())) ||
    ownedBadges.some((b) => b.slug === 'spotlight');

  // macOS-style categorized settings: a left nav switches the active pane.
  const [activeCat, setActiveCat] = useState('profile');
  const SETTINGS_CATEGORIES = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'badges', label: 'Badges', icon: '🏅' },
    { id: 'school', label: 'School', icon: '🎓' },
    { id: 'interests', label: 'Interests', icon: '🏷️' },
    { id: 'integrations', label: 'Integrations', icon: '🔌' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'legal', label: 'Legal', icon: '📄' },
    { id: 'account', label: 'Account', icon: '⚙️' },
  ];

  // Name color options - nice colors people would want
  const nameColors = [
    { id: 'default', color: null, label: 'Default' },
    { id: 'gold', color: '#FFD700', label: 'Gold' },
    { id: 'coral', color: '#FF6B6B', label: 'Coral' },
    { id: 'sky', color: '#4ECDC4', label: 'Sky' },
    { id: 'violet', color: '#9B59B6', label: 'Violet' },
    { id: 'ocean', color: '#3498DB', label: 'Ocean' },
    { id: 'mint', color: '#2ECC71', label: 'Mint' },
    { id: 'sunset', color: '#F39C12', label: 'Sunset' },
    { id: 'rose', color: '#E91E63', label: 'Rose' },
    { id: 'lavender', color: '#A29BFE', label: 'Lavender' },
    { id: 'peach', color: '#FD79A8', label: 'Peach' },
    { id: 'cyan', color: '#00CEC9', label: 'Cyan' },
    { id: 'lime', color: '#00B894', label: 'Lime' },
  ];

  const hasUnlockedNameColor = userPostCount >= 1;
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [headerPreview, setHeaderPreview] = useState(null);
  const [headerFile, setHeaderFile] = useState(null);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [headerError, setHeaderError] = useState('');
  // Image cropper states
  const [showAvatarCropper, setShowAvatarCropper] = useState(false);
  const [avatarCropUrl, setAvatarCropUrl] = useState(null);
  const [showHeaderCropper, setShowHeaderCropper] = useState(false);
  const [headerCropUrl, setHeaderCropUrl] = useState(null);
  // Avatar edit menu state
  const [showAvatarEditMenu, setShowAvatarEditMenu] = useState(false);
  const avatarEditMenuRef = useRef(null);

  const avatarEmojis = ['😀', '😎', '🚀', '💻', '🎨', '🎮', '🎵', '📚', '🔥', '⚡', '🌟', '💡', '🎯', '🏆', '🌈', '🦄'];
  const [settingsSchoolSearch, setSettingsSchoolSearch] = useState('');
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        display_name: profile.display_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
        avatar_emoji: profile.avatar_emoji || '😀',
        avatar_url: profile.avatar_url || '',
        header_url: profile.header_url || '',
        name_color: profile.name_color || '',
        github_url: profile.github_url || '',
        website_url: profile.website_url || '',
        displayed_badge: profile.displayed_badge || '',
        displayed_badge_2: profile.displayed_badge_2 || ''
      });
      setAvatarPreview(null);
      setAvatarFile(null);
      setHeaderPreview(null);
      setHeaderFile(null);
    }
  }, [profile]);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
      if (headerPreview) {
        URL.revokeObjectURL(headerPreview);
      }
    };
  }, [avatarPreview, headerPreview]);

  // Close avatar edit menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (avatarEditMenuRef.current && !avatarEditMenuRef.current.contains(e.target)) {
        setShowAvatarEditMenu(false);
      }
    };
    if (showAvatarEditMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAvatarEditMenu]);

  if (!isOpen) return null;

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      setAvatarError(validation.error);
      return;
    }

    setAvatarError('');
    // Open cropper instead of directly setting preview
    const url = URL.createObjectURL(file);
    setAvatarCropUrl(url);
    setShowAvatarCropper(true);
    // Reset file input so the same file can be selected again
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  // Handle re-editing the current avatar (open cropper with existing image)
  const handleEditCurrentAvatar = async () => {
    setShowAvatarEditMenu(false);
    const imageUrl = avatarPreview || formData.avatar_url;
    if (!imageUrl) return;

    try {
      // Fetch the current image and open cropper
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAvatarCropUrl(url);
      setShowAvatarCropper(true);
    } catch (err) {
      console.error('Error loading avatar for edit:', err);
      addToast('Could not load image for editing', 'error');
    }
  };

  // Handle replacing the avatar (open file picker)
  const handleReplaceAvatar = () => {
    setShowAvatarEditMenu(false);
    avatarInputRef.current?.click();
  };

  // Handle clicking on avatar when there's an existing image
  const handleAvatarClick = () => {
    const hasExistingImage = avatarPreview || formData.avatar_url;
    if (hasExistingImage) {
      setShowAvatarEditMenu(prev => !prev);
    } else {
      avatarInputRef.current?.click();
    }
  };

  const handleAvatarCrop = (croppedFile, previewUrl) => {
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }
    if (avatarCropUrl) {
      URL.revokeObjectURL(avatarCropUrl);
    }
    setAvatarFile(croppedFile);
    setAvatarPreview(previewUrl);
    setShowAvatarCropper(false);
    setAvatarCropUrl(null);
  };

  const handleAvatarCropCancel = () => {
    if (avatarCropUrl) {
      URL.revokeObjectURL(avatarCropUrl);
    }
    setShowAvatarCropper(false);
    setAvatarCropUrl(null);
  };

  const handleRemoveAvatar = async () => {
    // Clear the preview if there is one
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
      setAvatarFile(null);
    }

    // Clear the avatar URL from form data
    setFormData({ ...formData, avatar_url: '' });
  };

  const handleHeaderSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Animated banner path: video files skip the cropper (it's image-only)
    // and preview directly. Eligibility is re-checked server-side.
    if (file.type?.startsWith('video/')) {
      if (!canAnimatedBanner) {
        setHeaderError('Animated video banners are for Pro members & contest winners');
        if (headerInputRef.current) headerInputRef.current.value = '';
        return;
      }
      const validation = validateBannerVideoFile(file);
      if (!validation.valid) {
        setHeaderError(validation.error);
        if (headerInputRef.current) headerInputRef.current.value = '';
        return;
      }
      setHeaderError('');
      if (headerPreview) URL.revokeObjectURL(headerPreview);
      setHeaderFile(file);
      setHeaderPreview(URL.createObjectURL(file));
      if (headerInputRef.current) headerInputRef.current.value = '';
      return;
    }

    const validation = validateFile(file);
    if (!validation.valid) {
      setHeaderError(validation.error);
      return;
    }

    setHeaderError('');
    // Open cropper instead of directly setting preview
    const url = URL.createObjectURL(file);
    setHeaderCropUrl(url);
    setShowHeaderCropper(true);
    // Reset file input so the same file can be selected again
    if (headerInputRef.current) {
      headerInputRef.current.value = '';
    }
  };

  const handleHeaderCrop = (croppedFile, previewUrl) => {
    if (headerPreview) {
      URL.revokeObjectURL(headerPreview);
    }
    if (headerCropUrl) {
      URL.revokeObjectURL(headerCropUrl);
    }
    setHeaderFile(croppedFile);
    setHeaderPreview(previewUrl);
    setShowHeaderCropper(false);
    setHeaderCropUrl(null);
  };

  const handleHeaderCropCancel = () => {
    if (headerCropUrl) {
      URL.revokeObjectURL(headerCropUrl);
    }
    setShowHeaderCropper(false);
    setHeaderCropUrl(null);
  };

  const handleRemoveHeader = async () => {
    // Clear the preview if there is one
    if (headerPreview) {
      URL.revokeObjectURL(headerPreview);
      setHeaderPreview(null);
      setHeaderFile(null);
    }

    // Clear the header URL from form data
    setFormData({ ...formData, header_url: '' });
  };

  const handleSave = async () => {
    if (!user) return;

    // Check for banned words in username and display name
    const usernameBanned = validateUsername(formData.username);
    if (usernameBanned) {
      addToast(usernameBanned, 'error');
      return;
    }
    if (formData.username && isReservedTopLevelSegment(formData.username.trim().toLowerCase())) {
      addToast('That username is reserved. Try another.', 'error');
      return;
    }
    const displayNameBanned = validateDisplayName(formData.display_name);
    if (displayNameBanned) {
      addToast(displayNameBanned, 'error');
      return;
    }

    setLoading(true);
    setAvatarError('');

    try {
      const normalizedUsername = formData.username.toLowerCase().trim();

      // Check if username is already taken by another user
      if (normalizedUsername !== profile?.username?.toLowerCase()) {
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', normalizedUsername)
          .neq('id', user.id)
          .single();

        if (existingUser) {
          addToast('This username is already taken. Please choose another one.', 'error');
          setLoading(false);
          return;
        }
      }

      let avatarUrl = formData.avatar_url;
      let headerUrl = formData.header_url;

      // Upload new avatar if selected
      if (avatarFile) {
        setUploadingAvatar(true);
        const result = await uploadAvatar(supabase, avatarFile, user.id);
        setUploadingAvatar(false);

        if (result.error) {
          setAvatarError(result.error);
          setLoading(false);
          return;
        }

        avatarUrl = result.url;
      }

      // Upload new header if selected
      if (headerFile) {
        setUploadingHeader(true);
        const result = await uploadHeader(supabase, headerFile, user.id);
        setUploadingHeader(false);

        if (result.error) {
          setHeaderError(result.error);
          setLoading(false);
          return;
        }

        headerUrl = result.url;
      }

      // Use update (not upsert): the profile row always exists by the time the
      // edit modal is open. The June 2026 hardening replaced table-level UPDATE
      // on profiles with column-level grants that intentionally EXCLUDE `id`.
      // supabase-js `.upsert()` emits `ON CONFLICT DO UPDATE SET id = excluded.id`,
      // which needs UPDATE on the id column → "permission denied for table profiles".
      // Updating by id (without writing id) only touches granted columns.
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: formData.display_name,
          username: normalizedUsername,
          bio: formData.bio,
          avatar_emoji: formData.avatar_emoji,
          avatar_url: avatarUrl || null,
          header_url: headerUrl || null,
          name_color: formData.name_color || null,
          github_url: formData.github_url ? ensureAbsoluteUrl(formData.github_url.trim()) : null,
          website_url: formData.website_url ? ensureAbsoluteUrl(formData.website_url.trim()) : null,
          displayed_badge: formData.displayed_badge || null,
          displayed_badge_2: formData.displayed_badge_2 || null
        })
        .eq('id', user.id);

      if (error) throw error;

      // Refresh the global badge map so the change shows immediately.
      try { await loadDisplayedBadges(); } catch {}

      // Cleanup
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
      if (headerPreview) {
        URL.revokeObjectURL(headerPreview);
      }
      setAvatarPreview(null);
      setAvatarFile(null);
      setHeaderPreview(null);
      setHeaderFile(null);

      addToast('Profile updated successfully!', 'success');
      onProfileUpdate();
      try { window.dispatchEvent(new Event('profile-updated')); } catch {}
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
      setUploadingAvatar(false);
    }
  };

  // Account deletion is handled by the parent via the AccountDeletionModal
  // (opened through onDeleteAccount); cancellation of a scheduled deletion goes
  // through onCancelDeletion. Both are wired in App.jsx.

  // Determine what to show in the avatar preview
  const displayAvatarUrl = avatarPreview || formData.avatar_url;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal-wide" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '94vw' }}>
        <div className="modal-header">
          <h2 className="modal-title"><SettingsIcon /> Settings</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body settings-modal-body">
          {!user ? (
            <div className="login-prompt">
              <div className="login-prompt-icon"><UserIcon /></div>
              <div className="login-prompt-title">Login Required</div>
              <p className="login-prompt-text">Please login to access settings.</p>
            </div>
          ) : (
            <div className="settings-layout">
              <nav className="settings-nav">
                {SETTINGS_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`settings-nav-item ${activeCat === c.id ? 'active' : ''}`}
                    onClick={() => setActiveCat(c.id)}
                  >
                    <span className="settings-nav-ico" aria-hidden>{c.icon}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </nav>
              <div className="settings-content">
              {/* PANE: Profile */}
              <div className="settings-pane" style={{ display: activeCat === 'profile' ? undefined : 'none' }}>
              {/* Profile Section */}
              <div className="settings-section">
                <h3 className="settings-section-title"><UserIcon /> Profile</h3>

                {/* Avatar Upload Section */}
                <div className="avatar-upload-section">
                  <input
                    type="file"
                    ref={avatarInputRef}
                    className="file-input-hidden"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleAvatarSelect}
                  />
                  <div className="avatar-preview-container" ref={avatarEditMenuRef}>
                    <div
                      className="avatar-preview avatar-preview-clickable"
                      onClick={handleAvatarClick}
                      style={{ cursor: 'pointer' }}
                    >
                      {displayAvatarUrl ? (
                        <img src={displayAvatarUrl} alt="Avatar" />
                      ) : (
                        <span className="avatar-preview-emoji">{formData.avatar_emoji || '😀'}</span>
                      )}
                      {displayAvatarUrl && (
                        <div className="avatar-preview-hover-overlay">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                        </div>
                      )}
                    </div>
                    {!displayAvatarUrl && (
                      <button
                        className="avatar-upload-overlay"
                        onClick={() => avatarInputRef.current?.click()}
                        title="Upload avatar"
                      >
                        <CameraIcon />
                      </button>
                    )}
                    {/* Avatar Edit Menu */}
                    {showAvatarEditMenu && displayAvatarUrl && (
                      <div className="avatar-edit-menu">
                        <button
                          className="avatar-edit-menu-item"
                          onClick={handleEditCurrentAvatar}
                        >
                          <ZoomInIcon /> Edit (Zoom/Crop)
                        </button>
                        <button
                          className="avatar-edit-menu-item"
                          onClick={handleReplaceAvatar}
                        >
                          <CameraIcon /> Replace Image
                        </button>
                      </div>
                    )}
                  </div>
                  {!displayAvatarUrl && (
                    <p className="avatar-upload-label">
                      Upload a profile photo
                    </p>
                  )}
                  {displayAvatarUrl && (
                    <button
                      className="avatar-remove-btn"
                      onClick={handleRemoveAvatar}
                    >
                      Remove Photo
                    </button>
                  )}
                  {uploadingAvatar && (
                    <div className="upload-loading">
                      <div className="upload-spinner"></div>
                      <span>Uploading...</span>
                    </div>
                  )}
                  {avatarError && (
                    <div className="upload-error">{avatarError}</div>
                  )}
                </div>

                {/* Header Image Upload Section (3:1 aspect ratio, Twitter standard) */}
                <div className="header-upload-section" style={{ marginTop: '1.5rem' }}>
                  <label className="form-label" style={{ marginBottom: '0.75rem', display: 'block' }}>Profile Banner <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>(1500 x 500)</span></label>
                  <input
                    type="file"
                    ref={headerInputRef}
                    className="file-input-hidden"
                    accept={canAnimatedBanner
                      ? 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm'
                      : 'image/jpeg,image/png,image/gif,image/webp'}
                    onChange={handleHeaderSelect}
                  />
                  <div className="header-preview-container" style={{
                    width: '100%',
                    height: 0,
                    paddingBottom: '33.33%',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    position: 'relative',
                    background: 'var(--bg-tertiary)',
                    border: '2px dashed var(--border-color)',
                    cursor: 'pointer'
                  }} onClick={() => headerInputRef.current?.click()}>
                    {(headerPreview || formData.header_url) ? (
                      (headerFile ? headerFile.type?.startsWith('video/') : isVideoBannerUrl(formData.header_url)) ? (
                        <video
                          src={headerPreview || formData.header_url}
                          autoPlay
                          loop
                          muted
                          playsInline
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                      <img
                        src={headerPreview || formData.header_url}
                        alt="Banner"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      )
                    ) : (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)'
                      }}>
                        <CameraIcon style={{ width: '24px', height: '24px', marginBottom: '0.5rem' }} />
                        <span style={{ fontSize: '0.85rem' }}>Click to upload banner image</span>
                      </div>
                    )}
                    {(headerPreview || formData.header_url) && (
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'rgba(0,0,0,0.6)',
                        borderRadius: '50%',
                        padding: '0.5rem',
                        opacity: 0,
                        transition: 'opacity 0.2s'
                      }} className="header-overlay-icon">
                        <CameraIcon style={{ width: '20px', height: '20px', color: 'white' }} />
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {canAnimatedBanner
                      ? '✨ You can upload a looping video banner (MP4/WebM, up to 30MB)'
                      : '🔒 Animated video banners are for Pro members & contest winners'}
                  </div>
                  {(headerPreview || formData.header_url) && (
                    <button
                      className="avatar-remove-btn"
                      onClick={(e) => { e.stopPropagation(); handleRemoveHeader(); }}
                      style={{ marginTop: '0.5rem' }}
                    >
                      Remove Header
                    </button>
                  )}
                  {uploadingHeader && (
                    <div className="upload-loading">
                      <div className="upload-spinner"></div>
                      <span>Uploading...</span>
                    </div>
                  )}
                  {headerError && (
                    <div className="upload-error">{headerError}</div>
                  )}
                </div>

                <div className="form-group" style={{ marginTop: '1.5rem' }}>
                  <label className="form-label">Display Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Your display name"
                    value={formData.display_name}
                    onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="your_username"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Bio / About Me</label>
                  <textarea
                    className="form-input form-textarea"
                    placeholder="Tell us about yourself..."
                    value={formData.bio}
                    onChange={e => setFormData({ ...formData, bio: e.target.value })}
                    rows={3}
                    maxLength={200}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">GitHub URL <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem' }}>(optional)</span></label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://github.com/yourname"
                    value={formData.github_url}
                    onChange={e => setFormData({ ...formData, github_url: e.target.value })}
                    maxLength={200}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Personal link <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem' }}>(optional - portfolio, X, anything)</span></label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://yoursite.com"
                    value={formData.website_url}
                    onChange={e => setFormData({ ...formData, website_url: e.target.value })}
                    maxLength={200}
                  />
                </div>

                {/* Referral code - your personal invite link */}
                <div className="form-group">
                  <label className="form-label">Referral code <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem' }}>(your invite link - 3–20 chars: a–z, 0–9, _)</span></label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="yourname"
                      value={refCodeInput}
                      onChange={e => { setRefCodeInput(e.target.value); setRefCodeMsg(''); }}
                      maxLength={20}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleSaveRefCode}
                      disabled={refCodeSaving || !refCodeInput.trim() || refCodeInput.trim().toLowerCase() === refCode}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {refCodeSaving ? 'Saving…' : 'Save code'}
                    </button>
                  </div>
                  {refCode && (
                    <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.4rem', wordBreak: 'break-all' }}>
                      {referralLink(refCode)}
                    </p>
                  )}
                  {refCodeMsg && (
                    <p style={{ color: refCodeMsg === 'Saved!' ? '#34d399' : '#f87171', fontSize: '0.8rem', marginTop: '0.3rem' }}>
                      {refCodeMsg}
                    </p>
                  )}
                </div>

                {/* Name Color Section */}
                <div className="name-color-section">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <PaletteIcon /> Name Color
                  </label>
                  <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                    Customize how your display name appears across the platform
                  </p>

                  {hasUnlockedNameColor ? (
                    <>
                      <div className="name-color-grid">
                        {nameColors.map(colorOpt => (
                          <button
                            key={colorOpt.id}
                            className={`name-color-option ${formData.name_color === colorOpt.color || (!formData.name_color && !colorOpt.color) ? 'selected' : ''}`}
                            style={{
                              background: colorOpt.color || 'var(--text-primary)',
                              border: !colorOpt.color ? '2px dashed var(--border-color)' : 'none'
                            }}
                            onClick={() => setFormData({ ...formData, name_color: colorOpt.color || '' })}
                            title={colorOpt.label}
                          />
                        ))}
                      </div>
                      <div className="name-color-preview">
                        <span className="name-color-preview-label">Preview:</span>
                        <span
                          className="name-color-preview-name"
                          style={{ color: formData.name_color || 'var(--text-primary)' }}
                        >
                          {formData.display_name || formData.username || 'Your Name'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="name-color-locked-message">
                      <span style={{ fontSize: '1.2rem' }}>🔒</span>
                      <span>Make your first post to unlock name colors!</span>
                    </div>
                  )}
                </div>
              </div>
              </div>
              {/* PANE: Badges */}
              <div className="settings-pane" style={{ display: activeCat === 'badges' ? undefined : 'none' }}>
              <div className="settings-section">
                <h3 className="settings-section-title">🏅 Badges</h3>
                {/* Display Badge Section */}
                <div className="name-color-section">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Display Badges
                  </label>
                  <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                    Choose up to two badges to show next to your name (e.g. Pro + Spotlight). Tap to add or remove.
                  </p>

                  {ownedBadges.length > 0 ? (() => {
                    const selectedSlugs = [formData.displayed_badge, formData.displayed_badge_2].filter(Boolean);
                    const atCap = selectedSlugs.length >= 2;
                    const setSelected = (slugs) =>
                      setFormData({ ...formData, displayed_badge: slugs[0] || '', displayed_badge_2: slugs[1] || '' });
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className={`category-pill ${selectedSlugs.length === 0 ? 'active' : ''}`}
                          onClick={() => setSelected([])}
                          style={{
                            padding: '0.4rem 0.9rem', borderRadius: 999, cursor: 'pointer',
                            background: selectedSlugs.length === 0 ? 'rgba(255,255,255,0.1)' : 'transparent',
                            border: `1px solid ${selectedSlugs.length === 0 ? 'var(--text-primary)' : 'var(--border-color)'}`,
                            color: 'var(--text-primary)', fontSize: '0.85rem',
                          }}
                        >
                          None
                        </button>
                        {ownedBadges.map((b) => {
                          const selected = selectedSlugs.includes(b.slug);
                          // Toggle in/out; capped at 2 (deselect one to add another).
                          const onToggle = () => {
                            if (selected) setSelected(selectedSlugs.filter((s) => s !== b.slug));
                            else if (!atCap) setSelected([...selectedSlugs, b.slug]);
                          };
                          const disabled = !selected && atCap;
                          return (
                            <button
                              key={b.slug}
                              type="button"
                              title={disabled ? 'Deselect a badge first (max 2)' : (b.description || b.label)}
                              onClick={onToggle}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                                padding: '0.4rem 0.9rem', borderRadius: 999,
                                cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
                                background: selected ? 'rgba(255,255,255,0.1)' : 'transparent',
                                border: `1px solid ${selected ? (b.color || 'var(--text-primary)') : 'var(--border-color)'}`,
                                color: 'var(--text-primary)', fontSize: '0.85rem',
                              }}
                            >
                              {b.slug === 'spotlight' ? (
                                <SpotlightGem size={16} color={b.color_override || b.color || '#FFD700'} />
                              ) : (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 16, height: 16, borderRadius: '50%', background: b.color || '#C9A227',
                                  color: '#0a0a0a', fontSize: 10, fontWeight: 700,
                                }}>{b.icon || '★'}</span>
                              )}
                              {b.label}
                              {selected && <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>#{selectedSlugs.indexOf(b.slug) + 1}</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })() : (
                    <div className="name-color-locked-message">
                      <span style={{ fontSize: '1.2rem' }}>🔒</span>
                      <span>You don't have any badges yet. Go Pro or earn one to display it here!</span>
                    </div>
                  )}

                  {/* A customizer per displayed badge, so colors are set separately.
                      Spotlight is editable free; other badges need active Pro. */}
                  {[formData.displayed_badge, formData.displayed_badge_2].filter(Boolean).map((slug) => {
                    const sel = ownedBadges.find((b) => b.slug === slug);
                    if (!sel) return null;
                    const canEdit = isProMember || sel.slug === 'spotlight';
                    if (!canEdit) {
                      return (
                        <div key={slug} className="name-color-locked-message" style={{ marginTop: '0.75rem' }}>
                          <span style={{ fontSize: '1.2rem' }}>✨</span>
                          <span>Go Pro to customize your {sel.label} badge's color and hover text.</span>
                        </div>
                      );
                    }
                    return (
                      <ProBadgeCustomizer
                        key={slug}
                        badge={sel}
                        userId={user.id}
                        onSaved={reloadOwnedBadges}
                      />
                    );
                  })}
                </div>

              </div>
              </div>
              {/* PANE: School */}
              <div className="settings-pane" style={{ display: activeCat === 'school' ? undefined : 'none' }}>
              {/* Your School Section */}
              <div className="settings-section">
                <h3 className="settings-section-title">🎓 Your School</h3>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  Join your school to compete on the leaderboard and connect with classmates
                </p>

                {userSchool ? (
                  <div>
                    <div className="school-select-current">
                      <span
                        className="school-badge"
                        style={{ background: userSchool.color || '#333', fontSize: '0.95rem', padding: '0.35rem 0.7rem' }}
                      >
                        {userSchool.school_name}
                      </span>
                    </div>
                    <button
                      className="school-leave-btn"
                      onClick={() => { onLeaveSchool(); }}
                    >
                      Leave school
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="school-select-search">
                      <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.35-4.35"/>
                      </svg>
                      <input
                        type="text"
                        placeholder="Search for your school..."
                        value={settingsSchoolSearch}
                        onChange={(e) => { setSettingsSchoolSearch(e.target.value); setShowSchoolDropdown(true); }}
                        onFocus={() => setShowSchoolDropdown(true)}
                      />
                    </div>
                    {showSchoolDropdown && settingsSchoolSearch.trim() && (
                      <div className="school-select-dropdown">
                        {schoolLeaderboard
                          .filter(s => s.name.toLowerCase().includes(settingsSchoolSearch.toLowerCase()) || (s.short_name && s.short_name.toLowerCase().includes(settingsSchoolSearch.toLowerCase())))
                          .map(school => (
                            <button
                              key={school.id}
                              className="school-select-option"
                              onClick={() => {
                                onJoinSchool(school.id);
                                setSettingsSchoolSearch('');
                                setShowSchoolDropdown(false);
                              }}
                            >
                              <div
                                className="school-select-option-icon"
                                style={{ background: school.color || '#333' }}
                              >
                                {school.short_name || school.name.substring(0, 3)}
                              </div>
                              <span className="school-select-option-name">{school.name}</span>
                              <span className="school-select-option-location">{school.state || ''}</span>
                            </button>
                          ))}
                        {schoolLeaderboard.filter(s => s.name.toLowerCase().includes(settingsSchoolSearch.toLowerCase()) || (s.short_name && s.short_name.toLowerCase().includes(settingsSchoolSearch.toLowerCase()))).length === 0 && (
                          <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No schools found</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>
              {/* PANE: Interests */}
              <div className="settings-pane" style={{ display: activeCat === 'interests' ? undefined : 'none' }}>
              {/* Categories Section */}
              <div className="settings-section">
                <h3 className="settings-section-title"><TagIcon /> Categories to Follow</h3>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  Follow categories to see their top posts on the Explore page
                </p>
                <div className="settings-categories-grid">
                  {categories.map(cat => {
                    const isFollowed = userFollowedCategories.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        className={`settings-category-chip ${isFollowed ? 'followed' : ''}`}
                        onClick={() => onFollowCategory(cat.id, isFollowed)}
                      >
                        {cat.name}
                        <span className="settings-category-icon">
                          {isFollowed ? <CheckIcon /> : <PlusIcon />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              </div>
              {/* PANE: Integrations */}
              <div className="settings-pane" style={{ display: activeCat === 'integrations' ? undefined : 'none' }}>
              {/* Connect Agent - Agent Posting (MCP) */}
              {user && <ConnectAgent user={user} />}
              </div>
              {/* PANE: Notifications */}
              <div className="settings-pane" style={{ display: activeCat === 'notifications' ? undefined : 'none' }}>
              {/* Desktop Notifications - opt-in (default off) */}
              {user && <DesktopNotifications />}
              </div>
              {/* PANE: Legal */}
              <div className="settings-pane" style={{ display: activeCat === 'legal' ? undefined : 'none' }}>
              {/* Legal Section */}
              <div className="settings-section">
                <h3 className="settings-section-title"><DocumentIcon /> Legal</h3>
                <div className="settings-legal-section">
                  <button
                    className="settings-legal-link"
                    onClick={() => {
                      onClose();
                      onNavigateToLegal && onNavigateToLegal('terms');
                    }}
                  >
                    <DocumentIcon />
                    <span>Terms and Conditions</span>
                    <ChevronRightIcon className="chevron" />
                  </button>
                  <button
                    className="settings-legal-link"
                    onClick={() => {
                      onClose();
                      onNavigateToLegal && onNavigateToLegal('privacy');
                    }}
                  >
                    <ShieldIcon />
                    <span>Privacy Policy</span>
                    <ChevronRightIcon className="chevron" />
                  </button>
                  <button
                    className="settings-legal-link"
                    onClick={() => {
                      onClose();
                      onNavigateToLegal && onNavigateToLegal('support');
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span>Support</span>
                    <ChevronRightIcon className="chevron" />
                  </button>
                  <button
                    className="settings-legal-link"
                    onClick={() => {
                      onClose();
                      onNavigateToLegal && onNavigateToLegal('copyright');
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.5 9.5a3.5 3.5 0 1 0 0 5"/></svg>
                    <span>Copyright</span>
                    <ChevronRightIcon className="chevron" />
                  </button>
                </div>
              </div>
              </div>
              {/* PANE: Account */}
              <div className="settings-pane" style={{ display: activeCat === 'account' ? undefined : 'none' }}>
              {/* Account Actions */}
              <div className="settings-section">
                <h3 className="settings-section-title"><UserIcon /> Account</h3>

                {user?.email && (() => {
                  const maskEmail = (em) => {
                    if (!em || !em.includes('@')) return em || '';
                    const [local, domain] = em.split('@');
                    const maskedLocal = local.length <= 2
                      ? (local[0] || '') + '•••'
                      : local.slice(0, 2) + '•'.repeat(Math.max(3, local.length - 2));
                    const dotIdx = domain.lastIndexOf('.');
                    if (dotIdx === -1) return `${maskedLocal}@${domain}`;
                    const dName = domain.slice(0, dotIdx);
                    const tld = domain.slice(dotIdx);
                    const maskedDomain = dName.length <= 1
                      ? dName
                      : dName[0] + '•'.repeat(Math.max(3, dName.length - 1));
                    return `${maskedLocal}@${maskedDomain}${tld}`;
                  };
                  return (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label className="form-label">Email</label>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: '0.75rem', padding: '0.65rem 0.85rem', background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px'
                      }}>
                        <span style={{ fontSize: '0.9rem', color: '#ddd', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                          {emailRevealed ? user.email : maskEmail(user.email)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEmailRevealed(v => !v)}
                          style={{
                            flexShrink: 0, background: 'none', border: 'none', color: '#888',
                            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, padding: 0
                          }}
                        >
                          {emailRevealed ? 'Hide' : 'Reveal'}
                        </button>
                      </div>
                      <p className="form-hint">The email used to create your account. Only you can see this.</p>
                    </div>
                  );
                })()}

                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                  style={{ width: '100%' }}
                >
                  Log Out
                </button>
              </div>

              {/* Danger Zone */}
              <div className="settings-section">
                <div className="danger-zone">
                  <div className="danger-zone-title"><TrashIcon /> Danger Zone</div>
                  {profile?.pending_deletion ? (
                    <>
                      <p className="danger-zone-text">
                        Your account is scheduled for deletion and is hidden until then.
                        You can still cancel to restore it.
                      </p>
                      <button
                        className="btn btn-secondary"
                        onClick={async () => {
                          if (!onCancelDeletion) return;
                          setLoading(true);
                          try {
                            await onCancelDeletion();
                            addToast('Deletion canceled - your account is active again.', 'success');
                          } catch (err) {
                            addToast(err.message || 'Could not cancel deletion', 'error');
                          } finally {
                            setLoading(false);
                          }
                        }}
                        disabled={loading}
                      >
                        Cancel deletion
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="danger-zone-text">
                        Once you delete your account, there is no going back. Please be certain.
                      </p>
                      <button
                        className="btn-danger-outline"
                        onClick={() => { if (onDeleteAccount) onDeleteAccount(); }}
                      >
                        Delete Account
                      </button>
                    </>
                  )}
                </div>
              </div>
              </div>
              </div>
            </div>
          )}
        </div>

        {user && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={loading || uploadingAvatar}>
              {uploadingAvatar ? 'Uploading...' : loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Avatar Image Cropper */}
      {showAvatarCropper && avatarCropUrl && (
        <ImageCropper
          imageUrl={avatarCropUrl}
          cropShape="circle"
          onCrop={handleAvatarCrop}
          onCancel={handleAvatarCropCancel}
        />
      )}

      {/* Header Image Cropper */}
      {showHeaderCropper && headerCropUrl && (
        <ImageCropper
          imageUrl={headerCropUrl}
          cropShape="rectangle"
          onCrop={handleHeaderCrop}
          onCancel={handleHeaderCropCancel}
        />
      )}
    </div>
  );
};


export default SettingsModal;
