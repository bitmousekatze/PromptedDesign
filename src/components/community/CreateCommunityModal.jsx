// Create Community modal - extracted verbatim from App.jsx during the
// community component split (July 2026). No behavior change.
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAuth, useToast } from '../../lib/appShared.js';
import { uploadCommunityIcon, uploadCommunityBanner } from '../../lib/storage.js';
import { RichTextarea } from '../RichTextarea.jsx';
import { ImageCropper } from '../sharedUI.jsx';

const CreateCommunityModal = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const coverInputRef = useRef(null);
  const iconInputRef = useRef(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '🌟',
    is_private: false,
    // Subscriber settings - UI only for v1. Persisted to localStorage after
    // creation under `paidCommunity:<community_id>`. Backend columns land in
    // a later phase (see PAID_COMMUNITIES_DESIGN.html §4a).
    is_paid: false,
    tier_label: 'Subscribers',
    monthly_price_usd: '',
    btc_address: '',
    eth_address: '',
    sol_address: '',
    paypal_handle: ''
  });
  const [showPaidHelp, setShowPaidHelp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // Image cropper states
  const [showIconCropper, setShowIconCropper] = useState(false);
  const [iconCropUrl, setIconCropUrl] = useState(null);
  const [showCoverCropper, setShowCoverCropper] = useState(false);
  const [coverCropUrl, setCoverCropUrl] = useState(null);

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

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      if (iconPreview) URL.revokeObjectURL(iconPreview);
      if (iconCropUrl) URL.revokeObjectURL(iconCropUrl);
      if (coverCropUrl) URL.revokeObjectURL(coverCropUrl);
    };
  }, [coverPreview, iconPreview, iconCropUrl, coverCropUrl]);

  if (!isOpen) return null;

  const handleIconSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setIconCropUrl(url);
    setShowIconCropper(true);
    setShowEmojiPicker(false);
    if (iconInputRef.current) iconInputRef.current.value = '';
  };

  const handleIconCrop = (croppedFile, previewUrl) => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    if (iconCropUrl) URL.revokeObjectURL(iconCropUrl);
    setIconFile(croppedFile);
    setIconPreview(previewUrl);
    setShowIconCropper(false);
    setIconCropUrl(null);
  };

  const handleIconCropCancel = () => {
    if (iconCropUrl) URL.revokeObjectURL(iconCropUrl);
    setShowIconCropper(false);
    setIconCropUrl(null);
  };

  const handleRemoveIcon = () => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconFile(null);
    setIconPreview(null);
  };

  const handleCoverSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCoverCropUrl(url);
    setShowCoverCropper(true);
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  const handleCoverCrop = (croppedFile, previewUrl) => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    if (coverCropUrl) URL.revokeObjectURL(coverCropUrl);
    setCoverFile(croppedFile);
    setCoverPreview(previewUrl);
    setShowCoverCropper(false);
    setCoverCropUrl(null);
  };

  const handleCoverCropCancel = () => {
    if (coverCropUrl) URL.revokeObjectURL(coverCropUrl);
    setShowCoverCropper(false);
    setCoverCropUrl(null);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      addToast('Please enter a community name', 'error');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create the community first (to get the community ID)
      const paidPrice = formData.is_paid ? parseFloat(formData.monthly_price_usd) : null;
      const isPaid = !!(formData.is_paid && paidPrice && paidPrice > 0);
      const { data: community, error: createError } = await supabase
        .from('communities')
        .insert({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          icon: formData.icon,
          creator_id: user.id,
          is_private: formData.is_private,
          is_paid: isPaid,
          monthly_price_usd: isPaid ? paidPrice : null,
          btc_address: isPaid ? (formData.btc_address?.trim() || null) : null,
          eth_address: isPaid ? (formData.eth_address?.trim() || null) : null,
          sol_address: isPaid ? (formData.sol_address?.trim() || null) : null,
          paypal_handle: isPaid ? (formData.paypal_handle?.trim() || null) : null,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Step 2: Upload images to community-images bucket using the real community ID
      let iconImageUrl = null;
      let coverImageUrl = null;

      if (iconFile) {
        const result = await uploadCommunityIcon(supabase, iconFile, user.id, community.id);
        if (result.error) {
          addToast(`Icon upload failed: ${result.error}`, 'error');
        } else {
          iconImageUrl = result.url;
        }
      }

      if (coverFile) {
        const result = await uploadCommunityBanner(supabase, coverFile, user.id, community.id);
        if (result.error) {
          addToast(`Banner upload failed: ${result.error}`, 'error');
        } else {
          coverImageUrl = result.url;
        }
      }

      // Step 3: Update community with image URLs if uploads succeeded
      if (iconImageUrl || coverImageUrl) {
        const updateData = {};
        if (iconImageUrl) {
          updateData.icon_url = iconImageUrl;
          updateData.icon = null; // Clear emoji when using image
        }
        if (coverImageUrl) {
          updateData.cover_image = coverImageUrl;
          updateData.header_url = coverImageUrl;
        }

        const { error: updateError } = await supabase
          .from('communities')
          .update(updateData)
          .eq('id', community.id);

        if (updateError) console.error('Failed to save image URLs:', updateError);
      }

      // Auto-join the creator as admin
      const { error: joinError } = await supabase
        .from('community_members')
        .insert({
          community_id: community.id,
          user_id: user.id,
          role: 'admin'
        });

      if (joinError) throw joinError;

      if (community.is_private && community.invite_code) {
        addToast(`Community created! Invite code: ${community.invite_code}`, 'success');
      } else {
        addToast('Community created!', 'success');
      }

      // Reset form
      setFormData({
        name: '', description: '', icon: '🌟', is_private: false,
        is_paid: false, tier_label: 'Subscribers', monthly_price_usd: '',
        btc_address: '', eth_address: '', sol_address: '', paypal_handle: ''
      });
      setCoverFile(null);
      setCoverPreview(null);
      setIconFile(null);
      setIconPreview(null);
      setShowEmojiPicker(false);

      onSuccess(community);
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create a Community</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Community Icon</label>
            <input
              type="file"
              ref={iconInputRef}
              className="file-input-hidden"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleIconSelect}
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
              ) : (
                <div className="selected-emoji-icon">{formData.icon}</div>
              )}
              <span className="selected-emoji-label">
                {iconPreview ? 'Custom image selected' : 'Using emoji icon'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => iconInputRef.current?.click()}
                style={{ flex: 1 }}
              >
                {iconPreview ? 'Change Image' : 'Upload Image'}
              </button>
              {iconPreview && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRemoveIcon}
                >
                  Remove
                </button>
              )}
            </div>
            {!iconPreview && (
              <>
                <button
                  type="button"
                  className="form-input"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  style={{ cursor: 'pointer', textAlign: 'left' }}
                >
                  {showEmojiPicker ? 'Hide emoji picker' : 'Or choose an emoji instead'}
                </button>
                {showEmojiPicker && (
                  <div className="emoji-picker-grid">
                    {communityEmojis.map((emoji, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`emoji-picker-item ${formData.icon === emoji ? 'selected' : ''}`}
                        onClick={() => {
                          setFormData({ ...formData, icon: emoji });
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

          <div className="form-group">
            <label className="form-label">Community Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., Indie Game Devs"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <RichTextarea
              placeholder="What is this community about?"
              value={formData.description}
              onChange={(v) => setFormData({ ...formData, description: v })}
              maxLength={300}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Banner Image (optional) <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>(1500 x 500)</span></label>
            <input
              type="file"
              ref={coverInputRef}
              className="file-input-hidden"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleCoverSelect}
            />
            {coverPreview ? (
              <div style={{ position: 'relative' }}>
                <div style={{
                  width: '100%',
                  height: 0,
                  paddingBottom: '25%',
                  position: 'relative',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  marginBottom: '0.5rem'
                }}>
                  <img
                    src={coverPreview}
                    alt="Banner preview"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => coverInputRef.current?.click()}
                  style={{ width: '100%' }}
                >
                  Change Image
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => coverInputRef.current?.click()}
                style={{ width: '100%' }}
              >
                Upload Banner Image
              </button>
            )}
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: 0 }}>
                <input
                  type="checkbox"
                  checked={formData.is_paid}
                  onChange={e => setFormData({ ...formData, is_paid: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span>🔒 Paid community (charge subscribers)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPaidHelp(s => !s)}
                title="What is a paid community?"
                aria-label="What is a paid community?"
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--bg-tertiary, #161b22)',
                  border: '1px solid var(--border-color, #30363d)',
                  color: '#cbd5e1', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.78rem', fontWeight: 700, lineHeight: 1,
                }}
              >?</button>
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {formData.is_paid
                ? 'Members pay you monthly to access this community. 10% platform fee.'
                : 'Toggle on to charge a monthly subscription. You can accept crypto (BTC / ETH / SOL).'}
            </p>

            {showPaidHelp && (
              <div style={{
                marginTop: '0.5rem',
                padding: '0.85rem 1rem',
                background: 'rgba(99, 91, 255, 0.08)',
                border: '1px solid rgba(99, 91, 255, 0.25)',
                borderRadius: 10,
                fontSize: '0.82rem',
                lineHeight: 1.55,
                color: '#cbd5e1',
              }}>
                <div style={{ fontWeight: 700, color: '#e6edf3', marginBottom: 6 }}>
                  What's a paid community?
                </div>
                A paid community is gated behind a monthly subscription. You set the price in
                USD; members can pay with a card (auto-renews every 30 days) or send crypto
                peer-to-peer (BTC / ETH / SOL) to your wallet. Only active subscribers see
                posts inside it.
                <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
                  <li><strong style={{ color: '#e6edf3' }}>10% platform fee</strong> - Prompted keeps 10%, you keep 90%.</li>
                  <li><strong style={{ color: '#e6edf3' }}>Crypto = manual approval.</strong> You eyeball the tx hash on a block explorer, then approve.</li>
                  <li><strong style={{ color: '#e6edf3' }}>Card = auto-approve + auto-renew.</strong> Stripe handles charging and refunds.</li>
                  <li><strong style={{ color: '#e6edf3' }}>Members get 30 days</strong> of access per payment, then re-subscribe.</li>
                </ul>
              </div>
            )}

            {formData.is_paid && (
              <div style={{
                marginTop: '0.75rem',
                padding: '1rem',
                background: 'var(--bg-tertiary, #161b22)',
                border: '1px solid var(--border-color, #30363d)',
                borderRadius: 10,
              }}>
                <div className="form-group">
                  <label className="form-label">What do you call your subscribers?</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Subscribers"
                    maxLength={32}
                    value={formData.tier_label}
                    onChange={e => setFormData({ ...formData, tier_label: e.target.value })}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>
                    Defaults to "Subscribers". Try "Members", "Patrons", "VIPs"…
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Monthly price (USD)</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>$</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      className="form-input"
                      placeholder="5.00"
                      value={formData.monthly_price_usd}
                      onChange={e => setFormData({ ...formData, monthly_price_usd: e.target.value })}
                      style={{ paddingLeft: 24 }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e6edf3', marginBottom: 4 }}>
                  Crypto wallet addresses
                </div>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 0, marginBottom: '0.75rem' }}>
                  Leave blank to skip a chain. You'll manually approve crypto payments after eyeballing the tx hash.
                </p>

                <div className="form-group">
                  <label className="form-label">BTC address</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="bc1q…"
                    value={formData.btc_address}
                    onChange={e => setFormData({ ...formData, btc_address: e.target.value.trim() })}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.82rem' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">ETH address</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="0x…"
                    value={formData.eth_address}
                    onChange={e => setFormData({ ...formData, eth_address: e.target.value.trim() })}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.82rem' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">SOL address</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Solana wallet…"
                    value={formData.sol_address}
                    onChange={e => setFormData({ ...formData, sol_address: e.target.value.trim() })}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.82rem' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">PayPal</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="paypal.me/you or email"
                    value={formData.paypal_handle}
                    onChange={e => setFormData({ ...formData, paypal_handle: e.target.value.trim() })}
                    style={{ fontSize: '0.82rem' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.is_private}
                onChange={e => setFormData({ ...formData, is_private: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span>Free Private Community</span>
            </label>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {formData.is_private
                ? 'Only users with an invite code can join. An invite code will be generated automatically.'
                : 'Anyone can find and join this community.'}
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || !formData.name.trim()}
          >
            {loading ? 'Creating...' : 'Create Community'}
          </button>
        </div>
      </div>

      {/* Icon Cropper */}
      {showIconCropper && iconCropUrl && (
        <ImageCropper
          imageUrl={iconCropUrl}
          aspectRatio={1}
          onCrop={handleIconCrop}
          onCancel={handleIconCropCancel}
          cropShape="circle"
        />
      )}

      {/* Cover Cropper */}
      {showCoverCropper && coverCropUrl && (
        <ImageCropper
          imageUrl={coverCropUrl}
          aspectRatio={2.5}
          onCrop={handleCoverCrop}
          onCancel={handleCoverCropCancel}
          cropShape="rectangle"
        />
      )}
    </div>
  );
};

export default CreateCommunityModal;
