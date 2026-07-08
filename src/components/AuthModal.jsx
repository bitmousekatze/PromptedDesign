import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { useToast, isReservedTopLevelSegment } from '../lib/appShared.js';
import { validateUsername, validateDisplayName } from '../utils/bannedWords.js';
import { isNativeApp, OAUTH_REDIRECT } from '../lib/platform.js';

// ─── Palette for emoji-fallback tiles ──────────────────────────────────────
const FALLBACK_BG = [
  '#6366f1','#ec4899','#f97316','#10a37f','#8b5cf6',
  '#f43f5e','#0ea5e9','#eab308','#14b8a6','#a855f7',
  '#22c55e','#ef4444','#3b82f6','#d946ef','#84cc16',
  '#f59e0b','#06b6d4','#c026d3',
];

// ─── Single avatar tile ─────────────────────────────────────────────────────
function AvatarTile({ user, index }) {
  const bg = FALLBACK_BG[index % FALLBACK_BG.length];
  return (
    <div style={{
      width: 88, height: 88, borderRadius: 18, background: bg,
      flexShrink: 0, overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      border: '1.5px solid rgba(255,255,255,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {user?.avatar_url ? (
        <img src={user.avatar_url} alt="" aria-hidden="true"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          loading="lazy" />
      ) : (
        <span style={{ fontSize: 36, lineHeight: 1 }} aria-hidden="true">
          {user?.avatar_emoji || '👤'}
        </span>
      )}
    </div>
  );
}

// ─── Scrolling column ───────────────────────────────────────────────────────
function DiagonalColumn({ items, direction = 'up', offsetY = 0 }) {
  const ref = useRef(null);
  const raf = useRef(null);
  const pos = useRef(offsetY);
  const speed = direction === 'up' ? -0.4 : 0.4;
  const tileH = 88 + 12;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const totalH = items.length * tileH;
    const tick = () => {
      pos.current += speed;
      if (pos.current <= -totalH) pos.current += totalH;
      if (pos.current >= 0) pos.current -= totalH;
      el.style.transform = `translateY(${pos.current}px)`;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [items, speed, tileH]);

  const doubled = [...items, ...items];
  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 12, willChange: 'transform' }}>
      {doubled.map((user, i) => <AvatarTile key={i} user={user} index={i} />)}
    </div>
  );
}

// ─── Hero carousel panel ────────────────────────────────────────────────────
function AuthHeroPanel({ users }) {
  const fill = (start) => {
    const out = [];
    for (let i = 0; i < 6; i++) out.push(users[(start + i * 4) % Math.max(users.length, 1)]);
    return out;
  };
  const colA = fill(0), colB = fill(1), colC = fill(2), colD = fill(3);

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: 'linear-gradient(135deg, #0d0d14 0%, #12101e 100%)',
      overflow: 'hidden',
    }}>
      {users.length > 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', gap: 12, padding: '0 8px',
          transform: 'rotate(-8deg) scale(1.18)', transformOrigin: 'center center',
          alignItems: 'flex-start', overflow: 'hidden',
        }}>
          <DiagonalColumn items={colA} direction="up"   offsetY={-60} />
          <DiagonalColumn items={colB} direction="down" offsetY={-30} />
          <DiagonalColumn items={colC} direction="up"   offsetY={-90} />
          <DiagonalColumn items={colD} direction="down" offsetY={-15} />
        </div>
      )}
      {/* Dark overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(10,8,20,0.45) 0%, rgba(10,8,20,0.75) 60%, rgba(10,8,20,0.97) 100%)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      }} />
      {/* Indigo tint */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 85%, rgba(99,102,241,0.25) 0%, transparent 70%)',
      }} />
    </div>
  );
}

// ─── Step transition wrapper ────────────────────────────────────────────────
function StepPane({ visible, children }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(32px)',
      transition: 'opacity 0.28s ease, transform 0.28s ease',
      pointerEvents: visible ? 'auto' : 'none',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

// ─── Google SVG ─────────────────────────────────────────────────────────────
const GoogleSVG = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ marginRight: 8 }}>
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
    <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9.003 18z" fill="#34A853"/>
    <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
  </svg>
);

const GitHubSVG = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" style={{ marginRight: 8 }}>
    <path fillRule="evenodd" clipRule="evenodd" d="M9 0C4.0275 0 0 4.13211 0 9.22838C0 13.3065 2.5785 16.7648 6.15375 17.9841C6.60375 18.0709 6.76875 17.7853 6.76875 17.5403C6.76875 17.3212 6.76125 16.7405 6.7575 15.9712C4.254 16.5277 3.726 14.7332 3.726 14.7332C3.3165 13.6681 2.72475 13.3832 2.72475 13.3832C1.9095 12.8111 2.78775 12.8229 2.78775 12.8229C3.69 12.8871 4.16625 13.7737 4.16625 13.7737C4.96875 15.1847 6.273 14.777 6.7875 14.5414C6.8685 13.9443 7.10025 13.5381 7.3575 13.3073C5.35875 13.0764 3.258 12.2829 3.258 8.74709C3.258 7.73988 3.60825 6.91659 4.18425 6.27095C4.083 6.03774 3.77925 5.0994 4.263 3.82846C4.263 3.82846 5.01675 3.58116 6.738 4.77462C7.458 4.56958 8.223 4.46785 8.988 4.46315C9.753 4.46785 10.518 4.56958 11.238 4.77462C12.948 3.58116 13.7017 3.82846 13.7017 3.82846C14.1855 5.0994 13.8818 6.03774 13.7917 6.27095C14.3655 6.91659 14.7142 7.73988 14.7142 8.74709C14.7142 12.2923 12.6105 13.0725 10.608 13.2995C10.923 13.5765 11.2155 14.1423 11.2155 15.0071C11.2155 16.242 11.2043 17.2344 11.2043 17.5341C11.2043 17.7759 11.3617 18.0647 11.8267 17.9723C15.4207 16.7609 18 13.3002 18 9.22838C18 4.13211 13.9703 0 9 0Z"/>
  </svg>
);

// ─── Back arrow button ───────────────────────────────────────────────────────
const BackBtn = ({ onClick }) => (
  <button onClick={onClick} aria-label="Back" style={{
    background: 'none', border: 'none', cursor: 'pointer', padding: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'rgba(255,255,255,0.55)', transition: 'color 0.2s ease',
    marginLeft: -8,
    marginBottom: 8,
  }}
  onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  </button>
);

// ============================================
// AUTH MODAL COMPONENT
// ============================================
const AuthModal = ({ isOpen, onClose, onSuccess, heroUsers = [] }) => {
  // step: 'landing' | 'login' | 'signup' | 'forgot'
  const [step, setStep] = useState('landing');
  const [dir, setDir] = useState('forward');
  const [carouselCollapsed, setCarouselCollapsed] = useState(false);

  const goTo = (nextStep, direction = 'forward') => {
    if (step === 'landing' && nextStep !== 'landing') {
      // 1. Collapse carousel
      setCarouselCollapsed(true);
      // 2. Wait for height collapse transition to finish, then swipe step content
      setTimeout(() => {
        setDir('forward');
        setStep(nextStep);
      }, 380);
    } else if (nextStep === 'landing' && step !== 'landing') {
      // 1. Swipe step content back to landing
      setDir('back');
      setStep('landing');
      // 2. Wait for swipe to finish, then expand carousel
      setTimeout(() => {
        setCarouselCollapsed(false);
      }, 300);
    } else {
      // Between login <-> signup <-> forgot directly
      setDir(direction);
      setStep(nextStep);
    }
  };

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [username, setUsername]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [resetSent, setResetSent]   = useState(false);
  const { addToast } = useToast();

  const [usernameStatus, setUsernameStatus] = useState('idle');
  const [usernameError, setUsernameError]   = useState('');
  const usernameCheckTimeoutRef = useRef(null);

  // Dynamic height calculation refs
  const landingRef = useRef(null);
  const loginRef = useRef(null);
  const signupRef = useRef(null);
  const [paneHeight, setPaneHeight] = useState(180);

  useEffect(() => {
    let activeRef = null;
    if (step === 'landing') activeRef = landingRef;
    else if (step === 'login' || step === 'forgot') activeRef = loginRef;
    else if (step === 'signup') activeRef = signupRef;

    if (activeRef && activeRef.current) {
      // Set initial height
      setPaneHeight(activeRef.current.offsetHeight);

      const observer = new ResizeObserver((entries) => {
        for (let entry of entries) {
          // entry.target.offsetHeight includes padding and border
          const h = entry.target.offsetHeight;
          if (h > 0) setPaneHeight(h);
        }
      });
      observer.observe(activeRef.current);
      return () => observer.disconnect();
    }
  }, [step, isOpen]);

  // Reset all form state when step changes or modal closes
  useEffect(() => {
    setEmail(''); setPassword(''); setUsername(''); setDisplayName('');
    setError(''); setResetSent(false);
    setUsernameStatus('idle'); setUsernameError('');
  }, [step]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('landing');
        setCarouselCollapsed(false);
      }, 300);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Username validation ──────────────────────────────────────────────────
  const validateUsernameFormat = (value) => {
    if (!value)          return { valid: false, error: '' };
    if (value.length < 3)  return { valid: false, error: 'Username must be at least 3 characters' };
    if (value.length > 15) return { valid: false, error: 'Username must be 15 characters or less' };
    if (!/^[a-zA-Z0-9_]+$/.test(value)) return { valid: false, error: 'Letters, numbers, and underscores only' };
    return { valid: true, error: '' };
  };

  const checkUsernameAvailability = async (value) => {
    const v = value.trim().toLowerCase();
    const fmt = validateUsernameFormat(v);
    if (!fmt.valid) { setUsernameStatus('invalid'); setUsernameError(fmt.error); return; }
    const bannedError = validateUsername(v);
    if (bannedError) { setUsernameStatus('invalid'); setUsernameError(bannedError); return; }
    if (isReservedTopLevelSegment(v)) { setUsernameStatus('invalid'); setUsernameError('That username is reserved.'); return; }
    setUsernameStatus('checking'); setUsernameError('');
    try {
      const { data, error } = await supabase.rpc('is_username_available', { check_username: v });
      if (error) throw error;
      data === true ? setUsernameStatus('available') : (setUsernameStatus('taken'), setUsernameError('Username already taken'));
    } catch {
      try {
        const { data: ex } = await supabase.from('profiles').select('id').eq('username', v).single();
        ex ? (setUsernameStatus('taken'), setUsernameError('Username already taken')) : setUsernameStatus('available');
      } catch { setUsernameStatus('available'); }
    }
  };

  const handleUsernameChange = (e) => {
    const value = e.target.value;
    setUsername(value);
    clearTimeout(usernameCheckTimeoutRef.current);
    if (!value.trim()) { setUsernameStatus('idle'); setUsernameError(''); return; }
    const fmt = validateUsernameFormat(value.trim().toLowerCase());
    if (!fmt.valid) { setUsernameStatus('invalid'); setUsernameError(fmt.error); return; }
    setUsernameStatus('checking');
    usernameCheckTimeoutRef.current = setTimeout(() => checkUsernameAvailability(value), 400);
  };

  const isUsernameValid = usernameStatus === 'available';

  // ── OAuth ────────────────────────────────────────────────────────────────
  const handleOAuthLogin = async (provider, promptParam) => {
    if (isNativeApp()) {
      const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true } });
      if (error) { setError(error.message); return; }
      if (data?.url) { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url: data.url }); }
      return;
    }
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin, ...(isStandalone && promptParam ? { queryParams: { prompt: promptParam } } : {}) } });
    if (error) setError(error.message);
  };
  const handleGoogleLogin = () => handleOAuthLogin('google', 'select_account');
  const handleGitHubLogin = () => handleOAuthLogin('github', 'consent');

  // ── Forgot password ──────────────────────────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/?recovery=1` });
      if (error) throw error;
      setResetSent(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ── Login submit ─────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      addToast('Welcome back!', 'success');
      onSuccess(data.user);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ── Signup submit ────────────────────────────────────────────────────────
  const handleSignup = async (e) => {
    e.preventDefault();
    const usernameBanned = validateUsername(username);
    if (usernameBanned) { setError(usernameBanned); return; }
    if (isReservedTopLevelSegment(username.trim().toLowerCase())) { setError('That username is reserved. Try another.'); return; }
    const displayNameBanned = validateDisplayName(displayName);
    if (displayNameBanned) { setError(displayNameBanned); return; }
    if (!isUsernameValid) {
      if (usernameStatus === 'checking') { setError('Please wait while we verify your username'); return; }
      setError(usernameError || 'Please enter a valid username'); return;
    }
    setLoading(true); setError('');
    try {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username: username.toLowerCase().trim(), display_name: displayName || username } } });
      if (error) throw error;
      if (data.session) { addToast('Account created!', 'success'); onSuccess(data.user); } 
      else { addToast('Account created! Check your email to verify, then sign in.', 'success'); }
      onClose();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ── Shared social buttons ────────────────────────────────────────────────
  const SocialButtons = () => (
    <>
      <div className="auth-divider" style={{ margin: '20px 0 16px' }}>or</div>
      <div className="social-login" style={{ marginBottom: 4 }}>
        <button className="social-btn" style={{ borderRadius: 20 }} onClick={handleGoogleLogin}><GoogleSVG />Google</button>
        <button className="social-btn" style={{ borderRadius: 20 }} onClick={handleGitHubLogin}><GitHubSVG />GitHub</button>
      </div>
    </>
  );

  // ── Carousel height (only on landing step) ────────────────────────────────
  const carouselH = carouselCollapsed ? 0 : 320;
  const headerH = step !== 'landing' ? 52 : 0;
  const stepTitle = step === 'login' ? 'Welcome Back' : step === 'signup' ? 'Create your account' : step === 'forgot' ? 'Reset Password' : '';
  const scrollableStep = step === 'signup';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal auth-modal-redesign"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 420,
          padding: 0,
          borderRadius: 20,
          position: 'relative',
          height: Math.min(carouselH + headerH + paneHeight, typeof window !== 'undefined' ? window.innerHeight * 0.92 : 700) || 'auto',
          transition: 'height 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* ── Close X (visible only on landing step) ── */}
        {step === 'landing' && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute', top: 14, right: 14, zIndex: 20,
              background: 'none', border: 'none', padding: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(255,255,255,0.55)', transition: 'color 0.2s ease',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* ── Carousel hero (visible only on landing) ── */}
        <div style={{
          height: carouselH,
          opacity: carouselCollapsed ? 0 : 1,
          overflow: 'hidden',
          transition: 'height 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.18s ease-in-out',
          flexShrink: 0,
          position: 'relative',
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}>
          <AuthHeroPanel users={heroUsers} />

          {/* Fraunces wordmark over carousel */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 2, pointerEvents: 'none',
          }}>
            <span style={{
              fontFamily: "'Fraunces', Georgia, serif", fontSize: '2.4rem', fontWeight: 900,
              color: '#f5ebe0', WebkitTextStroke: '0.6px #1a1a1a', paintOrder: 'stroke fill',
              textShadow: '0 2px 12px rgba(0,0,0,0.7)', letterSpacing: '-0.5px', userSelect: 'none',
            }}>
              Prompted
            </span>
          </div>
        </div>

        {/* ── Step panes (scrollable on short viewports) ── */}
        <div className={`auth-modal-redesign__scroll${scrollableStep ? ' auth-modal-redesign__scroll--scrollable' : ' auth-modal-redesign__scroll--locked'}`}>
          {step !== 'landing' && (
            <div className="auth-modal-redesign__header">
              <button
                type="button"
                className="auth-modal-redesign__header-back"
                onClick={() => goTo('landing', 'back')}
                aria-label="Back"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <span className="auth-modal-redesign__header-title">{stepTitle}</span>
            </div>
          )}

          <div style={{ position: 'relative' }}>

          {/* ═══════════════════════════════════ LANDING ══ */}
          <div ref={landingRef} className="auth-modal-step" style={{
            opacity: step === 'landing' ? 1 : 0,
            transition: 'opacity 0.22s ease',
            pointerEvents: step === 'landing' ? 'auto' : 'none',
            position: step === 'landing' ? 'relative' : 'absolute',
            inset: 0,
            padding: '24px 28px 28px',
          }}>
            <p style={{
              fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 700,
              color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.2,
            }}>
              The home for AI builders.
            </p>
            <p style={{
              fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6,
            }}>
              Real prompts. Real builds. Real people. Join thousands sharing what they're making with AI.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '12px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'linear-gradient(180deg, #ffffff 0%, #f4f4f5 100%)',
                  color: '#0a0a0a',
                  boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.6), 0 10px 24px -8px rgba(255,215,0,0.35), 0 4px 12px rgba(0,0,0,0.3)',
                  transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.6), 0 12px 28px -6px rgba(255,215,0,0.5), 0 8px 20px -4px rgba(0,0,0,0.4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.6), 0 10px 24px -8px rgba(255,215,0,0.35), 0 4px 12px rgba(0,0,0,0.3)';
                }}
                onClick={() => goTo('signup', 'forward')}
              >
                Sign Up
              </button>
              <button
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '999px',
                  padding: '11px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'rgba(255, 255, 255, 0.02)',
                  color: 'rgba(255, 255, 255, 0.85)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  boxShadow: 'inset 0 2px 8px rgba(255, 255, 255, 0.05), inset 0 -4px 16px rgba(0, 0, 0, 0.4), inset 0 0 4px rgba(255, 255, 255, 0.02), 0 4px 16px rgba(0, 0, 0, 0.2)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderTopColor: 'rgba(255, 255, 255, 0.12)',
                  borderLeftColor: 'rgba(255, 255, 255, 0.06)',
                  borderBottomColor: 'rgba(255, 255, 255, 0.02)',
                  borderRightColor: 'rgba(255, 255, 255, 0.02)',
                  transition: 'transform 0.18s ease, background 0.18s ease, border-color 0.18s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderTopColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.borderLeftColor = 'rgba(255, 255, 255, 0.12)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                  e.currentTarget.style.borderTopColor = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.borderLeftColor = 'rgba(255, 255, 255, 0.06)';
                }}
                onClick={() => goTo('login', 'forward')}
              >
                Log In
              </button>
            </div>
          </div>

          {/* ═══════════════════════════════════ LOGIN ══ */}
          <div ref={loginRef} className="auth-modal-step" style={{
            opacity: step === 'login' || step === 'forgot' ? 1 : 0,
            transition: 'opacity 0.22s ease',
            pointerEvents: (step === 'login' || step === 'forgot') ? 'auto' : 'none',
            position: (step === 'login' || step === 'forgot') ? 'relative' : 'absolute',
            inset: 0,
            padding: '20px 36px 36px',
          }}>
            {step === 'forgot' ? (
              resetSent ? (
                <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                    If an account exists for <strong>{email}</strong>, we've sent a reset link. Check your inbox and spam folder.
                  </p>
                  <button
                    style={{
                      width: '100%',
                      marginTop: '1.25rem',
                      height: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '999px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: 'rgba(255, 255, 255, 0.02)',
                      color: 'rgba(255, 255, 255, 0.85)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      boxShadow: 'inset 0 2px 8px rgba(255, 255, 255, 0.05), inset 0 -4px 16px rgba(0, 0, 0, 0.4), inset 0 0 4px rgba(255, 255, 255, 0.02), 0 4px 16px rgba(0, 0, 0, 0.2)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderTopColor: 'rgba(255, 255, 255, 0.12)',
                      borderLeftColor: 'rgba(255, 255, 255, 0.06)',
                      borderBottomColor: 'rgba(255, 255, 255, 0.02)',
                      borderRightColor: 'rgba(255, 255, 255, 0.02)',
                      transition: 'transform 0.18s ease, background 0.18s ease, border-color 0.18s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderTopColor = 'rgba(255, 255, 255, 0.2)';
                      e.currentTarget.style.borderLeftColor = 'rgba(255, 255, 255, 0.12)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      e.currentTarget.style.borderTopColor = 'rgba(255, 255, 255, 0.12)';
                      e.currentTarget.style.borderLeftColor = 'rgba(255, 255, 255, 0.06)';
                    }}
                    onClick={() => goTo('login', 'back')}
                  >
                    Back to Log In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgot}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                    Enter the email you signed up with and we'll send a reset link.
                  </p>
                  <div className="form-group">
                    <label className="form-label">Email <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
                    <input type="email" className={`form-input ${error ? 'error' : ''}`} style={{ borderRadius: 20 }} placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                  {error && <p className="form-error">{error}</p>}
                  <button
                    type="submit"
                    style={{
                      width: '100%',
                      marginTop: '1rem',
                      height: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      borderRadius: '999px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: 'linear-gradient(180deg, #ffffff 0%, #f4f4f5 100%)',
                      color: '#0a0a0a',
                      boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.6), 0 10px 24px -8px rgba(255, 215, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.3)',
                      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 0 rgba(255, 255, 255, 0.6), 0 12px 28px -6px rgba(255, 215, 0, 0.5), 0 8px 20px -4px rgba(0, 0, 0, 0.4)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 0 rgba(255, 255, 255, 0.6), 0 10px 24px -8px rgba(255, 215, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.3)';
                    }}
                    disabled={loading}
                  >
                    {loading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                  <button
                    type="button"
                    style={{
                      width: '100%',
                      marginTop: '0.85rem',
                      height: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '999px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: 'rgba(255, 255, 255, 0.02)',
                      color: 'rgba(255, 255, 255, 0.85)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      boxShadow: 'inset 0 2px 8px rgba(255, 255, 255, 0.05), inset 0 -4px 16px rgba(0, 0, 0, 0.4), inset 0 0 4px rgba(255, 255, 255, 0.02), 0 4px 16px rgba(0, 0, 0, 0.2)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderTopColor: 'rgba(255, 255, 255, 0.12)',
                      borderLeftColor: 'rgba(255, 255, 255, 0.06)',
                      borderBottomColor: 'rgba(255, 255, 255, 0.02)',
                      borderRightColor: 'rgba(255, 255, 255, 0.02)',
                      transition: 'transform 0.18s ease, background 0.18s ease, border-color 0.18s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderTopColor = 'rgba(255, 255, 255, 0.2)';
                      e.currentTarget.style.borderLeftColor = 'rgba(255, 255, 255, 0.12)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      e.currentTarget.style.borderTopColor = 'rgba(255, 255, 255, 0.12)';
                      e.currentTarget.style.borderLeftColor = 'rgba(255, 255, 255, 0.06)';
                    }}
                    onClick={() => goTo('login', 'back')}
                  >
                    Back to Log In
                  </button>
                </form>
              )
            ) : (
              <>
                <form onSubmit={handleLogin}>
                  <div className="form-group">
                    <label className="form-label">Email <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
                    <input type="email" className={`form-input ${error ? 'error' : ''}`} style={{ borderRadius: 20 }} placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
                    <input type="password" className={`form-input ${error ? 'error' : ''}`} style={{ borderRadius: 20 }} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                  </div>
                  <div style={{ textAlign: 'right', marginTop: '-0.25rem', marginBottom: '1.25rem' }}>
                    <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem', padding: 0 }} onClick={() => goTo('forgot', 'forward')}>
                      Forgot password?
                    </button>
                  </div>
                  {error && <p className="form-error" style={{ marginBottom: '1rem' }}>{error}</p>}
                  <button
                    type="submit"
                    style={{
                      width: '100%',
                      marginTop: '0.5rem',
                      height: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      borderRadius: '999px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: 'linear-gradient(180deg, #ffffff 0%, #f4f4f5 100%)',
                      color: '#0a0a0a',
                      boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.6), 0 10px 24px -8px rgba(255,215,0,0.35), 0 4px 12px rgba(0,0,0,0.3)',
                      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.6), 0 12px 28px -6px rgba(255,215,0,0.5), 0 8px 20px -4px rgba(0,0,0,0.4)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.6), 0 10px 24px -8px rgba(255,215,0,0.35), 0 4px 12px rgba(0,0,0,0.3)';
                    }}
                    disabled={loading}
                  >
                    {loading ? 'Logging in…' : 'Log In'}
                  </button>
                </form>
                <SocialButtons />
                <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 16 }}>
                  No account?{' '}
                  <button style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: 13, padding: 0 }} onClick={() => goTo('signup', 'forward')}>
                    Sign up free
                  </button>
                </p>
              </>
            )}
          </div>

          {/* ═══════════════════════════════════ SIGN UP ══ */}
          <div ref={signupRef} className="auth-modal-step" style={{
            opacity: step === 'signup' ? 1 : 0,
            transition: 'opacity 0.22s ease',
            pointerEvents: step === 'signup' ? 'auto' : 'none',
            position: step === 'signup' ? 'relative' : 'absolute',
            inset: 0,
            padding: '20px 36px 36px',
          }}>

            <form onSubmit={handleSignup}>
              <div className="form-group">
                <label className="form-label">Display Name <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
                <input type="text" className="form-input" style={{ borderRadius: 20 }} placeholder="Your Name" value={displayName} onChange={e => setDisplayName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Username <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
                <div className="username-input-wrapper">
                  <input
                    type="text"
                    className={`form-input ${usernameStatus === 'available' ? 'input-success' : ''} ${usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'input-error' : ''}`}
                    style={{ borderRadius: 20 }}
                    placeholder="your_cool_name"
                    value={username}
                    onChange={handleUsernameChange}
                    required
                  />
                  {usernameStatus === 'checking' && <span className="username-status username-checking"><span className="spinner-small"></span></span>}
                  {usernameStatus === 'available' && (
                    <span className="username-status username-available">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                  )}
                  {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                    <span className="username-status username-error">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </span>
                  )}
                </div>
                {usernameStatus === 'available' && <p className="username-feedback feedback-success">Username available</p>}
                {usernameError && <p className="username-feedback feedback-error">{usernameError}</p>}
                <p className="form-hint" style={{ whiteSpace: 'nowrap', fontSize: '10.5px' }}>3–15 characters · letters, numbers, underscores</p>
              </div>
              <div className="form-group">
                <label className="form-label">Email <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
                <input type="email" className={`form-input ${error ? 'error' : ''}`} style={{ borderRadius: 20 }} placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Password <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
                <input type="password" className={`form-input ${error ? 'error' : ''}`} style={{ borderRadius: 20 }} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              </div>
              {error && <p className="form-error" style={{ marginBottom: '1rem' }}>{error}</p>}
              <button
                type="submit"
                style={{
                  width: '100%',
                  marginTop: '1.25rem',
                  height: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  borderRadius: '999px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'linear-gradient(180deg, #ffffff 0%, #f4f4f5 100%)',
                  color: '#0a0a0a',
                  boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.6), 0 10px 24px -8px rgba(255,215,0,0.35), 0 4px 12px rgba(0,0,0,0.3)',
                  transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.6), 0 12px 28px -6px rgba(255,215,0,0.5), 0 8px 20px -4px rgba(0,0,0,0.4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.6), 0 10px 24px -8px rgba(255,215,0,0.35), 0 4px 12px rgba(0,0,0,0.3)';
                }}
                disabled={loading || !isUsernameValid}
              >
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
            </form>
            <SocialButtons />
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 16 }}>
              Already have an account?{' '}
              <button style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: 13, padding: 0 }} onClick={() => goTo('login', 'back')}>
                Log in
              </button>
            </p>
          </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;