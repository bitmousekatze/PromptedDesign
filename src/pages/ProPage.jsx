import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { isNativeApp } from '../lib/platform.js';
import { SkeletonBlock } from '../components/SkeletonLoader.jsx';
import PageLoader from '../components/PageLoader.jsx';
import ProContests from '../components/pro/ProContests.jsx';
import ProLibrary from '../components/pro/ProLibrary.jsx';
const ProAnalytics = React.lazy(() => import('../components/pro/ProAnalytics.jsx'));

// ── Platform payment targets ────────────────────────────────────────────────
// Stripe is the primary path (card checkout via /api/pro-checkout). The crypto
// / PayPal options reuse the manual "submit a tx hash → admin approves" flow.
// EDIT these to the platform's real receiving addresses before going live.
const STRIPE_PAYMENT_LINK = import.meta.env.VITE_PRO_STRIPE_LINK || ''; // optional fallback if /api is unavailable
// Toggle the crypto / PayPal "submit a tx hash → admin approves" upgrade path.
// Hidden for now; flip back to true to re-enable without restoring any code.
const SHOW_MANUAL_UPGRADE = false;
const PRO_INTRO_USD = 0.99;    // first month
const PRO_MONTHLY_USD = 4.99;  // every month after
const PRO_LIFETIME_USD = 40;   // one-time, limited-time early lifetime deal
const PLATFORM_WALLETS = [
  { id: 'sol', label: 'Solana (SOL)', address: 'REPLACE_WITH_PLATFORM_SOL_ADDRESS' },
  { id: 'btc', label: 'Bitcoin (BTC)', address: 'REPLACE_WITH_PLATFORM_BTC_ADDRESS' },
  { id: 'eth', label: 'Ethereum (ETH)', address: 'REPLACE_WITH_PLATFORM_ETH_ADDRESS' },
];
const PAYPAL_HANDLE = 'REPLACE_WITH_PLATFORM_PAYPAL';

const FEATURES = [
  {
    num: '01',
    title: 'Badge Customization',
    items: [
      'Set your badge icon to any color',
      'Use any image as your badge icon',
      'Or flex an NFT you own - connect MetaMask or Phantom',
      'Up to 10 icon-badge slots (vs 3 free)',
      'Animated Pro badge on profile, comments & leaderboards',
    ],
  },
  {
    num: '02',
    title: 'Exclusive Access',
    items: [
      'Post analytics - see who viewed, opened & clicked through your posts',
      'Higher AI Advisor quota',
      'Daily icon loot boxes',
      'Early access to new features',
      'Ad-free browsing',
    ],
  },
  {
    num: '03',
    title: 'Contests & Status',
    items: [
      'Access to every Builder Challenge - forever',
      'Pro-gated contests with real build prizes',
      'Builder-Points bonus for Pro members',
      'Featured placement & early submission windows',
      'Founding-member status for early adopters',
    ],
  },
];

// The Pro hub's internal tabs. Everything except Overview is a member-only
// area: non-Pros can click around but see a locked panel with the upgrade CTA.
const HUB_TABS = [
  { id: 'overview', label: 'Overview', gated: false },
  { id: 'contests', label: 'Contests', gated: true },
  { id: 'library', label: 'Skill Library', gated: true },
  { id: 'analytics', label: 'Analytics', gated: true },
];

export default function ProPage({ currentUser, profile, isPlatformAdmin, onBack, onRequireAuth, addToast, onOpenCommunity }) {
  const isPro = !!profile?.is_pro && (!profile?.pro_expires_at || new Date(profile.pro_expires_at) > new Date());
  const nativeApp = isNativeApp(); // hide purchase UI in the Play Store app (billing policy)
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [hubTab, setHubTab] = useState('overview');
  const hasAccess = isPro || isPlatformAdmin;

  // Handle the return from Stripe exactly once. (The previous version depended
  // on addToast, which the parent recreates every render, so the effect re-ran
  // constantly and spammed toasts across the screen.) We strip the query params
  // immediately, then verify the session server-side via /api/pro-verify so Pro
  // is granted even if the Stripe webhook never fires.
  const handledReturn = useRef(false);
  useEffect(() => {
    if (handledReturn.current) return;
    handledReturn.current = true;
    const params = new URLSearchParams(window.location.search);
    const u = params.get('upgrade');
    if (!u) return;
    const sessionId = params.get('session_id');
    window.history.replaceState({}, '', '/pro');
    if (u === 'cancelled') { addToast?.('Checkout cancelled.', 'info'); return; }
    if (u !== 'success') return;
    if (!sessionId) {
      addToast?.('Payment received - your Pro badge will appear shortly!', 'success');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/pro-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        if (res.ok) {
          addToast?.('Payment confirmed - welcome to Prompted Pro!', 'success');
          // Full reload so the freshly granted is_pro reaches the app state.
          setTimeout(() => window.location.replace('/pro'), 1400);
          return;
        }
      } catch {}
      addToast?.('Payment received - your Pro badge will appear shortly!', 'success');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToPlans = () => {
    setHubTab('overview');
    // The plans section only exists once the Overview tab has rendered.
    setTimeout(() => document.getElementById('pro-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const startStripeCheckout = async (plan = 'monthly') => {
    // Google Play forbids non-Play billing for in-app digital goods. In the
    // native app we never run Stripe checkout - direct members to the web.
    if (isNativeApp()) {
      addToast?.('Upgrade to Pro on the web at prmpted.com, then sign in here.', 'info');
      return;
    }
    if (!currentUser) { onRequireAuth?.(); return; }
    setCheckoutLoading(plan);
    try {
      const res = await fetch('/api/pro-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, username: profile?.username, plan }),
      });
      if (res.ok) {
        const { url } = await res.json();
        if (url) { window.location.href = url; return; }
      }
      // Graceful fallback: a configured Stripe Payment Link.
      if (STRIPE_PAYMENT_LINK) { window.location.href = STRIPE_PAYMENT_LINK; return; }
      const body = await res.json().catch(() => ({}));
      addToast?.(body.error || 'Stripe checkout is not configured yet. Add STRIPE_SECRET_KEY in Vercel.', 'error');
    } catch {
      if (STRIPE_PAYMENT_LINK) { window.location.href = STRIPE_PAYMENT_LINK; return; }
      addToast?.('Could not reach the checkout service.', 'error');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Cancel an active monthly subscription (stops next month's charge; Pro stays
  // live until the paid period ends, when the Stripe webhook flips is_pro off).
  // Lifetime / admin-granted members have no subscription, so this is a no-op for
  // them - the backend reports that and we show a friendly note.
  const cancelPro = async () => {
    if (!currentUser) { onRequireAuth?.(); return; }
    if (!window.confirm(
      "Cancel Prompted Pro?\n\nYou'll keep Pro until the end of the month you've already paid for, then it won't renew."
    )) return;
    setCancelLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/pro-cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        if (body.cancelled) {
          const when = body.endsAt
            ? new Date(body.endsAt * 1000).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
            : 'the end of your billing period';
          addToast?.(`Pro cancelled. You'll keep access until ${when}, then it won't renew.`, 'success');
        } else {
          addToast?.("Nothing to cancel - you're on a lifetime or manually-granted membership, so there's no recurring charge.", 'info');
        }
      } else {
        addToast?.(body.error || 'Could not cancel your subscription. Please try again.', 'error');
      }
    } catch {
      addToast?.('Could not reach the cancellation service.', 'error');
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="pro-page" style={pageStyle}>
      <div style={innerStyle}>
      {onBack && (
        <button className="community-back-btn" onClick={onBack}>
          <span aria-hidden="true">←</span> Back
        </button>
      )}

      {/* Hub tabs */}
      <nav style={hubTabBar}>
        {HUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setHubTab(t.id)}
            style={{ ...hubTabBtn, ...(hubTab === t.id ? hubTabActive : {}) }}
          >
            {t.label}
            {t.gated && !hasAccess && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>🔒</span>}
          </button>
        ))}
      </nav>

      {/* Gated tabs for non-members: a locked panel that sells the upgrade */}
      {hubTab !== 'overview' && !hasAccess && (
        <div style={lockedPanel}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>🔒</div>
          <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 26, margin: '0 0 10px' }}>
            {hubTab === 'contests' && 'Pro-only contests'}
            {hubTab === 'library' && 'The Skill Library'}
            {hubTab === 'analytics' && 'Post analytics'}
          </h2>
          <p style={{ ...pStyle, maxWidth: 480, margin: '0 auto 22px' }}>
            {hubTab === 'contests' && 'Members-only contests with real prizes. Submit your build, see every entry, win bragging rights (and the prize).'}
            {hubTab === 'library' && 'A growing, curated library of skills, prompts, and agents - battle-tested and one click to copy.'}
            {hubTab === 'analytics' && 'See exactly how your posts perform: who saw them, who opened them, and who clicked through to your profile.'}
          </p>
          {nativeApp ? (
            <p style={{ ...pStyle, maxWidth: 480, margin: '0 auto' }}>
              Pro is purchased on the web - visit <strong>prmpted.com</strong> to upgrade,
              then sign in here and this unlocks automatically.
            </p>
          ) : (
            <button style={{ ...ctaStripe, width: 'auto' }} onClick={scrollToPlans}>
              See plans
            </button>
          )}
        </div>
      )}

      {hubTab === 'contests' && hasAccess && (
        <section style={{ marginTop: 8 }}>
          <h2 style={h2Style}>Pro contests</h2>
          <ProContests
            currentUser={currentUser}
            isPro={isPro}
            isPlatformAdmin={isPlatformAdmin}
            addToast={addToast}
            onRequireAuth={onRequireAuth}
            onOpenCommunity={onOpenCommunity}
          />
        </section>
      )}

      {hubTab === 'library' && hasAccess && (
        <section style={{ marginTop: 8 }}>
          <h2 style={h2Style}>Skill Library</h2>
          <ProLibrary isPro={isPro} isPlatformAdmin={isPlatformAdmin} addToast={addToast} />
        </section>
      )}

      {hubTab === 'analytics' && hasAccess && (
        <section style={{ marginTop: 8 }}>
          <h2 style={h2Style}>Your post analytics</h2>              <React.Suspense fallback={null}>
                <ProAnalytics currentUser={currentUser} />
              </React.Suspense>
        </section>
      )}

      {hubTab === 'overview' && (
      <>
      <header style={heroStyle}>
        <div style={kickerStyle}>Prompted Pro</div>
        <h1 style={h1Style}>
          Less noise. <em>More signal.</em>
        </h1>
        {isPro ? (
          <p style={leadStyle}>
            You're in. Pro contests, the Skill Library, and your post analytics are
            live in the tabs above.
          </p>
        ) : (
          <p style={leadStyle}>
            Members-only contests, a curated Skill Library, and detailed post analytics.
            Nothing you already have gets paywalled.
          </p>
        )}

        {isPro ? (
          profile?.pro_expires_at ? (
            <ProExpiryCountdown
              expiresAt={profile.pro_expires_at}
              loading={checkoutLoading}
              onPrepay={() => startStripeCheckout('extend')}
            />
          ) : (
            <div style={proBadgeBanner}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>✦</span>
              <div>
                <div style={{ fontWeight: 600, letterSpacing: 0.3 }}>You're a Pro member</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                  Lifetime - thank you for supporting Prompted.
                </div>
              </div>
            </div>
          )
        ) : nativeApp ? (
          <div style={webOnlyCallout}>
            <div style={{ fontWeight: 600, letterSpacing: 0.3, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>✦</span> Pro is purchased on the web
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(255,255,255,0.62)' }}>
              To keep Prompted free on the Play Store, upgrades aren't sold inside the app.
              Head to <strong>prmpted.com</strong> to go Pro - then sign in here and
              every Pro feature unlocks automatically.
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 28 }}>
            <button style={{ ...ctaStripe, width: 'auto' }} onClick={scrollToPlans}>
              See plans ↓
            </button>
          </div>
        )}
      </header>

      <section style={sectionStyle}>
        <h2 style={h2Style}>What Pro unlocks</h2>
        <div style={featureGrid}>
          {FEATURES.map((f) => (
            <div key={f.title} style={featureCard}>
              <div style={{ fontSize: 11, letterSpacing: 3, color: 'rgba(255,255,255,0.35)' }}>{f.num}</div>
              <h3 style={{ margin: '12px 0 14px', fontSize: 20, fontWeight: 500, fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: 0.2 }}>{f.title}</h3>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {f.items.map((it) => (
                  <li key={it} style={{ padding: '9px 0', borderTop: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.72)', fontSize: 13.5, lineHeight: 1.55 }}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Plans - at the very bottom: the page sells with features first, asks
          for money last. Hidden entirely for members. */}
      {!isPro && !nativeApp && (
        <section style={sectionStyle} id="pro-plans">
          <h2 style={h2Style}>Plans</h2>
          <p style={leadStyle}>
            ${PRO_INTRO_USD} for your first month, then ${PRO_MONTHLY_USD}/month - cancel anytime.
            Or ${PRO_LIFETIME_USD} once for lifetime Pro, including every Builder Challenge, forever.
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'stretch' }}>
            <div style={planCard}>
              <div>
                <div style={planLabel}>Monthly</div>
                <div style={planPrice}>${PRO_INTRO_USD}</div>
                <div style={planMeta}>first month, then ${PRO_MONTHLY_USD}/mo · cancel anytime</div>
              </div>
              <button
                onClick={() => startStripeCheckout('monthly')}
                disabled={!!checkoutLoading}
                style={{ ...ctaStripe, opacity: checkoutLoading ? 0.55 : 1 }}
              >
                {checkoutLoading === 'monthly' ? <PageLoader size={16} text="" /> : 'Start Pro'}
              </button>
            </div>
            <div style={planCardInverse}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ ...planLabel, opacity: 0.6 }}>Lifetime</div>
                  <span style={lifetimeTag}>Early deal</span>
                </div>
                <div style={planPrice}>${PRO_LIFETIME_USD}</div>
                <div style={planMeta}>one payment · Pro forever · every Builder Challenge included</div>
              </div>
              <button
                onClick={() => startStripeCheckout('lifetime')}
                disabled={!!checkoutLoading}
                style={{ ...ctaInverse, opacity: checkoutLoading ? 0.55 : 1 }}
              >
                {checkoutLoading === 'lifetime' ? <PageLoader size={16} text="" /> : 'Get Lifetime'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Crypto / PayPal manual upgrade - temporarily hidden (set SHOW_MANUAL_UPGRADE
          back to true to re-enable). Code is intentionally kept for later. */}
      {SHOW_MANUAL_UPGRADE && !isPro && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>Prefer crypto or PayPal?</h2>
          <p style={{ ...pStyle, opacity: 0.8 }}>
            Pay any of the addresses below, then submit your transaction hash. An admin verifies and
            unlocks Pro - usually within a day.
          </p>
          <ManualUpgradeForm currentUser={currentUser} onRequireAuth={onRequireAuth} addToast={addToast} />
        </section>
      )}

      {isPlatformAdmin && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>Pro upgrade queue (admin)</h2>
          <AdminProQueue addToast={addToast} />
        </section>
      )}

      {/* Cancel - lives at the very bottom for current members. Cancels the
          monthly subscription's auto-renewal; access stays until the paid
          period ends. No-op (with a friendly note) for lifetime/manual grants. */}
      {isPro && (
        <section style={cancelSection}>
          <button
            onClick={cancelPro}
            disabled={cancelLoading}
            style={{ ...cancelProBtn, opacity: cancelLoading ? 0.55 : 1 }}
          >
            {cancelLoading ? <PageLoader size={16} text="" /> : 'Cancel Pro'}
          </button>
          <p style={cancelNote}>
            Stops auto-renewal - you keep Pro until the end of the month you've already paid for.
            Lifetime and manually-granted memberships have no recurring charge to cancel.
          </p>
        </section>
      )}
      </>
      )}
      </div>
    </div>
  );
}

// ── Expiry countdown - for Pros on a timer (admin grants / crypto approvals).
// The whole banner is the prepay button: one click → Stripe checkout for a
// one-time month that gets ADDED to the current expiry (see /api/pro-checkout
// plan="extend"), so prepaying early never wastes the time already paid for. ──
function ProExpiryCountdown({ expiresAt, loading, onPrepay }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = Math.max(0, new Date(expiresAt).getTime() - now);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const expired = ms === 0;

  return (
    <button
      onClick={onPrepay}
      disabled={!!loading}
      style={{ ...countdownBanner, opacity: loading ? 0.6 : 1 }}
      title="Prepay your next month of Pro"
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>✦</span>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontWeight: 600, letterSpacing: 0.3 }}>
          {expired ? 'Pro expired' : 'Pro active'}
          <span style={countdownDigits}>
            {expired ? '' : ` ${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`}
          </span>
          {!expired && <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}> left</span>}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
          {loading === 'extend'
            ? 'Starting checkout…'
            : `Click to prepay your next month ($${PRO_MONTHLY_USD}) - 30 days get added to the timer`}
        </div>
      </div>
    </button>
  );
}

// ── Manual (crypto / PayPal) upgrade - mirrors the Paid Community Join Modal ──
function ManualUpgradeForm({ currentUser, onRequireAuth, addToast }) {
  const [method, setMethod] = useState('sol');
  const [txHash, setTxHash] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);

  const options = [
    { id: 'paypal', label: 'PayPal', value: PAYPAL_HANDLE, isLink: /^https?:\/\//i.test(PAYPAL_HANDLE) },
    ...PLATFORM_WALLETS.map((w) => ({ id: w.id, label: w.label, value: w.address })),
  ];

  const copyAddr = async (addr, id) => {
    try { await navigator.clipboard.writeText(addr); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch {}
  };

  const submit = async () => {
    if (!currentUser) { onRequireAuth?.(); return; }
    if (!txHash.trim()) { addToast?.('Transaction hash is required so we can verify your payment.', 'error'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.from('pro_upgrade_requests').insert({
        user_id: currentUser.id,
        payment_method: method,
        amount: PRO_INTRO_USD,
        tx_hash: txHash.trim(),
        payment_note: note.trim() || null,
      });
      if (error && error.code !== '23505') throw error;
      addToast?.('Request submitted! An admin will approve once payment is verified.', 'success');
      setTxHash(''); setNote('');
    } catch (e) {
      addToast?.(e.message || 'Failed to submit request', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ ...featureCard, maxWidth: 560 }}>
      {options.map((a) => (
        <div key={a.id} style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '0.6rem 0.8rem', marginBottom: 8, background: method === a.id ? 'rgba(255,255,255,0.06)' : 'transparent' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="radio" name="promethod" checked={method === a.id} onChange={() => setMethod(a.id)} />
            {a.label}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {a.isLink ? (
              <a href={a.value} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ fontSize: 12, padding: '5px 10px' }}>Open PayPal ↗</a>
            ) : (
              <>
                <code style={{ flex: 1, fontSize: 12, opacity: 0.8, wordBreak: 'break-all' }}>{a.value}</code>
                <button type="button" className="btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => copyAddr(a.value, a.id)}>{copied === a.id ? 'Copied' : 'Copy'}</button>
              </>
            )}
          </div>
        </div>
      ))}

      <div className="form-group" style={{ marginTop: 8 }}>
        <label className="form-label">Transaction hash <span style={{ color: '#fca5a5', fontWeight: 400, fontSize: 12 }}>(required)</span></label>
        <input className="form-input" value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="e.g. 5x9...abc" />
      </div>
      <div className="form-group">
        <label className="form-label">Note <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 12 }}>(optional)</span></label>
        <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything we should know" />
      </div>
      <button className="btn btn-primary" disabled={loading} onClick={submit}>
        {loading ? 'Submitting…' : 'Submit upgrade request'}
      </button>
    </div>
  );
}

// ── Admin queue ──────────────────────────────────────────────────────────────
function AdminProQueue({ addToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pro_upgrade_requests')
      .select('id, user_id, status, payment_method, amount, tx_hash, payment_note, created_at, profiles:user_id(username, display_name, avatar_emoji)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) setErr(error.message); else { setErr(null); setRows(data || []); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const decide = async (id, approve) => {
    const note = window.prompt(approve ? 'Optional message to the buyer:' : 'Reason for denial (sent to the buyer):', '');
    if (note === null) return;
    const fn = approve ? 'approve_pro_upgrade_request' : 'deny_pro_upgrade_request';
    const { error } = await supabase.rpc(fn, { p_request_id: id, p_note: note.trim() || null });
    if (error) { addToast?.(error.message, 'error'); return; }
    addToast?.(approve ? 'Approved - Pro granted' : 'Denied', 'success');
    load();
  };

  if (loading) return <div style={pStyle}><SkeletonBlock height={80} /></div>;
  if (err) return <p style={{ ...pStyle, color: '#fca5a5' }}>Queue unavailable: {err} (has the migration been applied?)</p>;
  if (!rows.length) return <p style={{ ...pStyle, opacity: 0.7 }}>No pending requests.</p>;

  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 640 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 0.9rem', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{r.profiles?.display_name || r.profiles?.username || r.user_id}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>@{r.profiles?.username || '-'} · ${Number(r.amount).toFixed(2)} via {(r.payment_method || '-').toUpperCase()}</div>
            {r.tx_hash && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2, wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' }}>tx: {r.tx_hash}</div>}
            {r.payment_note && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>"{r.payment_note}"</div>}
          </div>
          <button className="btn btn-primary" style={{ padding: '0.35rem 0.6rem', fontSize: 12 }} onClick={() => decide(r.id, true)}>Approve</button>
          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: 12, color: 'var(--error-color)' }} onClick={() => decide(r.id, false)}>Deny</button>
        </div>
      ))}
    </div>
  );
}

// ── styles - monochrome, editorial, deliberately spare ──────────────────────
const SERIF = "Georgia, 'Times New Roman', serif";
// Full-bleed black canvas: fills the content column edge-to-edge and the full
// viewport height; the inner container centers and constrains the content.
const pageStyle = { width: '100%', minHeight: '100vh', margin: 0, background: '#050505', color: '#fff' };
const innerStyle = { maxWidth: 1100, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 4vw, 48px) 110px' };
const heroStyle = { padding: '8px 0 4px' };
const kickerStyle = { fontSize: 11, fontWeight: 600, letterSpacing: 5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' };
const h1Style = { fontFamily: SERIF, fontSize: 'clamp(34px, 5.5vw, 56px)', lineHeight: 1.08, margin: '18px 0 18px', fontWeight: 400, letterSpacing: '-0.01em', color: '#fff' };
const leadStyle = { fontSize: 16, lineHeight: 1.75, color: 'rgba(255,255,255,0.62)', maxWidth: 640, margin: 0 };
const sectionStyle = { marginTop: 56 };
const h2Style = { fontSize: 12, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', margin: '0 0 18px' };
const pStyle = { fontSize: 15, lineHeight: 1.7, margin: '0 0 12px', color: 'rgba(255,255,255,0.62)' };
// Hairline grid: 1px gaps over a faint white background read as etched rules.
const featureGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.09)' };
const featureCard = { background: '#070707', padding: '26px 26px 22px' };
const proBadgeBanner = { marginTop: 28, display: 'inline-flex', alignItems: 'center', gap: 14, padding: '14px 22px', border: '1px solid rgba(255,255,255,0.25)', background: 'transparent' };
const webOnlyCallout = { marginTop: 28, padding: '18px 22px', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.03)', maxWidth: 560 };
const countdownBanner = { ...proBadgeBanner, cursor: 'pointer', color: '#fff', fontFamily: 'inherit', fontSize: 'inherit' };
const countdownDigits = { fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontVariantNumeric: 'tabular-nums', marginLeft: 6 };
const ctaStripe = { background: '#fff', color: '#0a0a0a', fontWeight: 600, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', padding: '14px 22px', border: '1px solid #fff', borderRadius: 0, cursor: 'pointer', width: '100%' };
const ctaInverse = { ...ctaStripe, background: '#0a0a0a', color: '#fff', border: '1px solid #0a0a0a' };
const planCard = { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 260, flex: '1 1 260px', maxWidth: 340, padding: '26px 26px 22px', border: '1px solid rgba(255,255,255,0.16)', background: '#070707' };
const planCardInverse = { ...planCard, background: '#fff', border: '1px solid #fff', color: '#0a0a0a' };
const planLabel = { fontSize: 11, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.5 };
const planPrice = { fontFamily: SERIF, fontSize: 44, lineHeight: 1, margin: '16px 0 4px' };
const planMeta = { fontSize: 13, opacity: 0.6, margin: '8px 0 24px', lineHeight: 1.55 };
const lifetimeTag = { fontSize: 9, fontWeight: 700, letterSpacing: 2, padding: '3px 8px', border: '1px solid currentColor', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const hubTabBar = { display: 'flex', gap: 2, margin: '6px 0 30px', border: '1px solid rgba(255,255,255,0.15)', width: 'fit-content', maxWidth: '100%', overflowX: 'auto' };
const hubTabBtn = { background: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none', padding: '10px 18px', fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' };
const hubTabActive = { background: '#fff', color: '#0a0a0a' };
const lockedPanel = { textAlign: 'center', padding: '60px 24px', border: '1px dashed rgba(255,255,255,0.2)', marginTop: 8 };
const cancelSection = { marginTop: 64, paddingTop: 28, borderTop: '1px solid rgba(255,255,255,0.08)' };
const cancelProBtn = { background: 'transparent', color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 11, letterSpacing: 2.5, textTransform: 'uppercase', padding: '12px 20px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 0, cursor: 'pointer' };
const cancelNote = { fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.4)', margin: '12px 0 0', maxWidth: 440 };
