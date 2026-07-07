import React, { useState, useEffect, useRef } from 'react';
import { validateFile, uploadAvatar, uploadHeader } from '../lib/storage.js';
import { validateUsername, validateDisplayName } from '../utils/bannedWords.js';

// ============================================
// ONBOARDING WIZARD - 3-Step Full-Screen Flow
// ============================================

// Intro slides shown in Step 0 — plain-English explainer of what Prompted is
// for people who've never used AI before.
const INTRO_SLIDES = [
  {
    emoji: '👋',
    title: 'Welcome to Prompted',
    body: 'A community for learning how real people use AI — for work, school, and everyday life.',
  },
  {
    emoji: '🧠',
    title: "What's a prompt?",
    body: "It's just the instructions you give an AI. Here you'll find prompts real people use every day — copy them, tweak them, make them your own.",
  },
  {
    emoji: '🧩',
    title: "What's a build?",
    body: "A build is a finished AI project someone shared — with the exact prompt, tools, and steps. Think: recipes, but for AI.",
  },
  {
    emoji: '🎯',
    title: "Pick your field, see what works",
    body: "Whether you're a teacher, a student, a small-business owner, or just curious — we'll show you prompts and builds for your world.",
  },
];

const OnboardingWizard = ({ user, profile, supabase, onComplete, addToast }) => {
  // Step 0 is the "what is this?" intro. Existing users who have already seen
  // the intro (`has_seen_intro` on the profile) skip directly to step 1.
  const [step, setStep] = useState(profile?.has_seen_intro ? 1 : 0);
  const [introSlide, setIntroSlide] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Step 1 state
  const [username, setUsername] = useState(profile?.username || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [usernameStatus, setUsernameStatus] = useState(null); // null | 'checking' | 'available' | 'taken' | 'invalid'
  const [usernameError, setUsernameError] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || null);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState(profile?.avatar_url || null);
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(profile?.header_url || null);
  const [uploadedBannerUrl, setUploadedBannerUrl] = useState(profile?.header_url || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const usernameCheckTimeout = useRef(null);

  // Step 2 state
  const [schools, setSchools] = useState([]);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState(null);
  const [loadingSchools, setLoadingSchools] = useState(false);

  // Step 3 state
  const [categories, setCategories] = useState([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Animation state
  const [slideDirection, setSlideDirection] = useState('right');
  const [animating, setAnimating] = useState(false);

  // Username validation regex
  const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

  // Validate username on change with debounce
  useEffect(() => {
    if (!username) {
      setUsernameStatus(null);
      setUsernameError('');
      return;
    }

    if (!USERNAME_REGEX.test(username)) {
      setUsernameStatus('invalid');
      if (username.length < 3) {
        setUsernameError('Username must be at least 3 characters');
      } else if (username.length > 30) {
        setUsernameError('Username must be 30 characters or fewer');
      } else {
        setUsernameError('Only letters, numbers, and underscores allowed');
      }
      return;
    }

    // Check for banned words before hitting the database
    const bannedError = validateUsername(username);
    if (bannedError) {
      setUsernameStatus('invalid');
      setUsernameError(bannedError);
      return;
    }

    setUsernameStatus('checking');
    setUsernameError('');

    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }

    usernameCheckTimeout.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('check_username_available', {
          p_username: username.toLowerCase(),
          p_current_user_id: user.id
        });

        if (error) {
          setUsernameStatus('invalid');
          setUsernameError('Error checking username');
          return;
        }

        if (data) {
          setUsernameStatus('available');
          setUsernameError('');
        } else {
          setUsernameStatus('taken');
          setUsernameError('Username is already taken');
        }
      } catch (err) {
        setUsernameStatus('invalid');
        setUsernameError('Error checking username');
      }
    }, 300);

    return () => {
      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
    };
  }, [username, user.id, supabase]);

  // Load schools on mount
  useEffect(() => {
    const loadSchools = async () => {
      setLoadingSchools(true);
      const { data, error } = await supabase
        .from('schools')
        .select('id, name, slug, short_name, location, color')
        .order('name');
      if (data) setSchools(data);
      setLoadingSchools(false);
    };
    loadSchools();
  }, [supabase]);

  // Load categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      setLoadingCategories(true);
      const { data } = await supabase
        .from('categories')
        .select('id, name, icon')
        .order('display_order');
      if (data) setCategories(data);
      setLoadingCategories(false);
    };

    loadCategories();
  }, [supabase]);

  // Image upload handlers
  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      addToast(validation.error, 'error');
      return;
    }

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setAvatarFile(file);

    // Upload immediately
    setUploadingAvatar(true);
    const result = await uploadAvatar(supabase, file, user.id);
    setUploadingAvatar(false);

    if (result.error) {
      addToast(result.error, 'error');
      setAvatarPreview(null);
      setAvatarFile(null);
      return;
    }

    setUploadedAvatarUrl(result.url);
  };

  const handleBannerSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      addToast(validation.error, 'error');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setBannerPreview(previewUrl);
    setBannerFile(file);

    setUploadingBanner(true);
    const result = await uploadHeader(supabase, file, user.id);
    setUploadingBanner(false);

    if (result.error) {
      addToast(result.error, 'error');
      setBannerPreview(null);
      setBannerFile(null);
      return;
    }

    setUploadedBannerUrl(result.url);
  };

  // Step navigation
  const goNext = () => {
    setSlideDirection('right');
    setAnimating(true);
    setTimeout(() => {
      setStep(s => s + 1);
      setAnimating(false);
    }, 200);
  };

  const goBack = () => {
    setSlideDirection('left');
    setAnimating(true);
    setTimeout(() => {
      setStep(s => s - 1);
      setAnimating(false);
    }, 200);
  };


  const filteredSchools = schools.filter(s =>
    !schoolSearch ||
    s.name.toLowerCase().includes(schoolSearch.toLowerCase()) ||
    s.short_name.toLowerCase().includes(schoolSearch.toLowerCase()) ||
    s.location?.toLowerCase().includes(schoolSearch.toLowerCase())
  );

  const isStep1Valid = username && USERNAME_REGEX.test(username) && usernameStatus === 'available';

  // Toggle category selection
  const toggleCategory = (id) => {
    setSelectedCategoryIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // Handle finish
  const handleFinish = async () => {
    setSubmitting(true);
    setError(null);

    // Check for banned words in username and display name
    const usernameBanned = validateUsername(username);
    if (usernameBanned) {
      setError(usernameBanned);
      setStep(1);
      setSubmitting(false);
      return;
    }
    const displayNameBanned = validateDisplayName(displayName);
    if (displayNameBanned) {
      setError(displayNameBanned);
      setStep(1);
      setSubmitting(false);
      return;
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('complete_onboarding', {
        p_user_id: user.id,
        p_username: username.toLowerCase(),
        p_display_name: displayName || null,
        p_avatar_url: uploadedAvatarUrl || null,
        p_header_url: uploadedBannerUrl || null,
        p_school_id: selectedSchoolId || null,
        p_category_ids: selectedCategoryIds,
        p_tool_ids: []
      });

      if (rpcError) {
        // Check if it's a username conflict
        if (rpcError.message?.includes('username')) {
          setError('That username was just taken. Please go back and choose another.');
          setStep(1);
          setUsernameStatus('taken');
          setUsernameError('Username is already taken');
        } else {
          setError(rpcError.message || 'Something went wrong. Please try again.');
        }
        setSubmitting(false);
        return;
      }

      addToast("You're all set! 🎉", 'success');
      onComplete();
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleAvatarDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      // Create a synthetic event
      handleAvatarSelect({ target: { files: [file] } });
    }
  };

  const handleBannerDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleBannerSelect({ target: { files: [file] } });
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">
        {/* Progress indicator — only for the 3 real setup steps, not the intro */}
        {step > 0 && (
          <div className="onboarding-progress">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`onboarding-progress-dot ${s === step ? 'active' : ''} ${s < step ? 'completed' : ''}`}
              />
            ))}
          </div>
        )}

        {/* Step content */}
        <div className={`onboarding-step-wrapper ${animating ? `slide-out-${slideDirection}` : 'slide-in'}`}>

          {/* Step 0: Welcome / What is Prompted? */}
          {step === 0 && (
            <div className="onboarding-step" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', lineHeight: 1, marginBottom: '1rem' }}>
                {INTRO_SLIDES[introSlide].emoji}
              </div>
              <h1 className="onboarding-title">{INTRO_SLIDES[introSlide].title}</h1>
              <p className="onboarding-subtitle" style={{ maxWidth: '520px', margin: '0.5rem auto 1.5rem' }}>
                {INTRO_SLIDES[introSlide].body}
              </p>

              {/* Slide dots */}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '2rem' }}>
                {INTRO_SLIDES.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: i === introSlide ? '24px' : '8px',
                      height: '8px',
                      borderRadius: '4px',
                      background: i === introSlide ? '#fff' : '#444',
                      transition: 'all 0.25s ease',
                    }}
                  />
                ))}
              </div>

              <div className="onboarding-actions">
                <button
                  className="onboarding-skip-link"
                  onClick={() => {
                    setSlideDirection('right');
                    setAnimating(true);
                    setTimeout(() => {
                      setStep(1);
                      setAnimating(false);
                    }, 200);
                  }}
                >
                  Skip intro
                </button>
                <button
                  className="onboarding-btn onboarding-btn-primary"
                  onClick={() => {
                    if (introSlide < INTRO_SLIDES.length - 1) {
                      setIntroSlide(introSlide + 1);
                    } else {
                      setSlideDirection('right');
                      setAnimating(true);
                      setTimeout(() => {
                        setStep(1);
                        setAnimating(false);
                      }, 200);
                    }
                  }}
                >
                  {introSlide < INTRO_SLIDES.length - 1 ? 'Next →' : "Let's set up your profile →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Profile Setup */}
          {step === 1 && (
            <div className="onboarding-step">
              <h1 className="onboarding-title">Welcome to Prompted!</h1>
              <p className="onboarding-subtitle">Let's set up your profile</p>

              <div className="onboarding-form">
                {/* Username */}
                <div className="onboarding-field">
                  <label className="onboarding-label">Username</label>
                  <div className="onboarding-input-wrapper">
                    <span className="onboarding-input-prefix">@</span>
                    <input
                      type="text"
                      className={`onboarding-input onboarding-input-with-prefix ${
                        usernameStatus === 'available' ? 'input-valid' :
                        usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'input-invalid' : ''
                      }`}
                      value={username}
                      onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      placeholder="your_username"
                      maxLength={30}
                    />
                    <div className="onboarding-input-status">
                      {usernameStatus === 'checking' && (
                        <div className="onboarding-spinner-small" />
                      )}
                      {usernameStatus === 'available' && (
                        <span className="onboarding-status-icon valid">✓</span>
                      )}
                      {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                        <span className="onboarding-status-icon invalid">✗</span>
                      )}
                    </div>
                  </div>
                  {usernameError && (
                    <div className="onboarding-field-error">{usernameError}</div>
                  )}
                </div>

                {/* Display Name */}
                <div className="onboarding-field">
                  <label className="onboarding-label">
                    Display Name <span className="onboarding-optional">(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="onboarding-input"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your Name"
                    maxLength={50}
                  />
                </div>

                {/* Profile Picture */}
                <div className="onboarding-field">
                  <label className="onboarding-label">
                    Profile Picture <span className="onboarding-optional">(optional)</span>
                  </label>
                  <input
                    type="file"
                    ref={avatarInputRef}
                    className="onboarding-file-input"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleAvatarSelect}
                  />
                  <div
                    className="onboarding-avatar-upload"
                    onClick={() => avatarInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDrop={handleAvatarDrop}
                  >
                    {uploadingAvatar ? (
                      <div className="onboarding-upload-loading">
                        <div className="onboarding-spinner-small" />
                        <span>Uploading...</span>
                      </div>
                    ) : avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar preview" className="onboarding-avatar-preview" />
                    ) : (
                      <div className="onboarding-avatar-placeholder">
                        <span className="onboarding-avatar-emoji">🧑‍💻</span>
                        <span className="onboarding-upload-hint">Click or drag to upload</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Banner Image */}
                <div className="onboarding-field">
                  <label className="onboarding-label">
                    Banner Image <span className="onboarding-optional">(optional)</span>
                  </label>
                  <input
                    type="file"
                    ref={bannerInputRef}
                    className="onboarding-file-input"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleBannerSelect}
                  />
                  <div
                    className="onboarding-banner-upload"
                    onClick={() => bannerInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDrop={handleBannerDrop}
                  >
                    {uploadingBanner ? (
                      <div className="onboarding-upload-loading">
                        <div className="onboarding-spinner-small" />
                        <span>Uploading...</span>
                      </div>
                    ) : bannerPreview ? (
                      <img src={bannerPreview} alt="Banner preview" className="onboarding-banner-preview" />
                    ) : (
                      <div className="onboarding-banner-placeholder">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <span className="onboarding-upload-hint">Click or drag to upload a banner</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="onboarding-actions">
                <div /> {/* spacer */}
                <button
                  className="onboarding-btn onboarding-btn-primary"
                  onClick={goNext}
                  disabled={!isStep1Valid}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: School Selection */}
          {step === 2 && (
            <div className="onboarding-step">
              <h1 className="onboarding-title">Are you a student? 🎓</h1>
              <p className="onboarding-subtitle">Join your school's community and compete on the leaderboard!</p>

              <div className="onboarding-search-wrapper">
                <svg className="onboarding-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  className="onboarding-input onboarding-search-input"
                  value={schoolSearch}
                  onChange={e => setSchoolSearch(e.target.value)}
                  placeholder="Search schools..."
                />
              </div>

              <div className="onboarding-schools-grid">
                {loadingSchools ? (
                  <div className="onboarding-loading">
                    <div className="onboarding-spinner-small" />
                    <span>Loading schools...</span>
                  </div>
                ) : filteredSchools.length === 0 ? (
                  <div className="onboarding-empty">No schools found</div>
                ) : (
                  filteredSchools.map(school => (
                    <div
                      key={school.id}
                      className={`onboarding-school-card ${selectedSchoolId === school.id ? 'selected' : ''}`}
                      style={{
                        borderLeftColor: school.color || '#333',
                        ...(selectedSchoolId === school.id ? {
                          borderColor: school.color || '#fff',
                          background: `${school.color}15`
                        } : {})
                      }}
                      onClick={() => setSelectedSchoolId(
                        selectedSchoolId === school.id ? null : school.id
                      )}
                    >
                      <div className="onboarding-school-short">{school.short_name}</div>
                      <div className="onboarding-school-name">{school.name}</div>
                      {school.location && (
                        <div className="onboarding-school-location">{school.location}</div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="onboarding-actions">
                <button className="onboarding-btn onboarding-btn-secondary" onClick={goBack}>
                  ← Back
                </button>
                <div className="onboarding-actions-right">
                  <button
                    className="onboarding-skip-link"
                    onClick={() => {
                      setSelectedSchoolId(null);
                      goNext();
                    }}
                  >
                    Skip — I'm not a student
                  </button>
                  <button
                    className="onboarding-btn onboarding-btn-primary"
                    onClick={goNext}
                  >
                    Next →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Interests */}
          {step === 3 && (() => {
            // Group seeded "field/use-case" categories by their ID prefix so
            // newcomers can scan "Work / School / Life" at a glance, rather
            // than seeing one flat list of unlabelled topics.
            const workCats = categories.filter(c => c.id?.startsWith?.('field_work_'));
            const schoolCats = categories.filter(c => c.id?.startsWith?.('field_school_'));
            const lifeCats = categories.filter(c => c.id?.startsWith?.('field_life_'));
            const topicCats = categories.filter(c =>
              !c.id?.startsWith?.('field_work_') &&
              !c.id?.startsWith?.('field_school_') &&
              !c.id?.startsWith?.('field_life_')
            );
            const renderChip = (cat) => (
              <button
                key={cat.id}
                className={`onboarding-chip ${selectedCategoryIds.includes(cat.id) ? 'selected' : ''}`}
                onClick={() => toggleCategory(cat.id)}
              >
                {cat.icon && <span className="onboarding-chip-icon">{cat.icon}</span>}
                {cat.name}
              </button>
            );
            return (
            <div className="onboarding-step">
              <h1 className="onboarding-title">What do you want AI to help with? 📌</h1>
              <p className="onboarding-subtitle">Pick your field and a few topics — we'll personalize your feed.</p>

              {loadingCategories ? (
                <div className="onboarding-loading">
                  <div className="onboarding-spinner-small" />
                </div>
              ) : (
                <>
                  {workCats.length > 0 && (
                    <div className="onboarding-section">
                      <h3 className="onboarding-section-title">For Work</h3>
                      <div className="onboarding-chips">{workCats.map(renderChip)}</div>
                    </div>
                  )}
                  {schoolCats.length > 0 && (
                    <div className="onboarding-section">
                      <h3 className="onboarding-section-title">For School</h3>
                      <div className="onboarding-chips">{schoolCats.map(renderChip)}</div>
                    </div>
                  )}
                  {lifeCats.length > 0 && (
                    <div className="onboarding-section">
                      <h3 className="onboarding-section-title">For Life</h3>
                      <div className="onboarding-chips">{lifeCats.map(renderChip)}</div>
                    </div>
                  )}
                  {topicCats.length > 0 && (
                    <div className="onboarding-section">
                      <h3 className="onboarding-section-title">Topics</h3>
                      <div className="onboarding-chips">{topicCats.map(renderChip)}</div>
                    </div>
                  )}
                </>
              )}

              {selectedCategoryIds.length < 3 && (
                <div className="onboarding-nudge">
                  Select at least 3 to get started
                </div>
              )}

              {error && (
                <div className="onboarding-error">{error}</div>
              )}

              <div className="onboarding-actions">
                <button className="onboarding-btn onboarding-btn-secondary" onClick={goBack}>
                  ← Back
                </button>
                <button
                  className="onboarding-btn onboarding-btn-primary onboarding-btn-finish"
                  onClick={handleFinish}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <div className="onboarding-spinner-small onboarding-spinner-dark" />
                      Setting up...
                    </>
                  ) : (
                    'Finish Setup 🎉'
                  )}
                </button>
              </div>
            </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
