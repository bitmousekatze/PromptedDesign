import { useEffect, useState, useCallback } from 'react';
import { ListItemSkeleton } from '../components/SkeletonLoader.jsx';
import {
  getReferralSummary,
  claimReferralReward,
  logReferralShare,
  referralLink,
} from '../lib/referrals.js';

// Reward-type → emoji, used on the ladder rows.
const REWARD_ICON = {
  bp: '⭐',
  contest: '🏆',
  pro: '💎',
  pro_lifetime: '👑',
  flair: '✨',
  cash: '💸',
};

export default function ReferralsPage({ currentUser, profile, onRequireAuth, addToast, onBack }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(null); // threshold currently being claimed

  const load = useCallback(async () => {
    try {
      setError('');
      const s = await getReferralSummary();
      setSummary(s);
    } catch (e) {
      setError(e?.message || 'Could not load your referrals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser?.id) {
      setLoading(false);
      return;
    }
    load();
  }, [currentUser?.id, load]);

  if (!currentUser?.id) {
    return (
      <div style={S.wrap}>
        <div style={S.hero}>
          <span style={S.kicker}>Referrals</span>
          <h1 style={S.h1}>Invite friends, earn Pro</h1>
          <p style={S.sub}>Sign in to get your invite link and start climbing the reward ladder.</p>
          <button style={S.primaryBtn} onClick={() => onRequireAuth?.()}>Sign in</button>
        </div>
      </div>
    );
  }

  const link = summary?.code ? referralLink(summary.code) : '';
  const qualified = summary?.qualified ?? 0;
  const tiers = summary?.tiers ?? [];
  const nextTier = tiers.find((t) => !t.reached);
  const progressTo = nextTier ? Math.min(100, Math.round((qualified / nextTier.threshold) * 100)) : 100;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      addToast?.('Invite link copied!', 'success');
      logReferralShare('copy');
    } catch {
      addToast?.('Could not copy - long-press the link to copy it.', 'error');
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on Prompted',
          text: 'Build with AI and share your prompts on Prompted.',
          url: link,
        });
        logReferralShare('native');
      } catch { /* user dismissed */ }
    } else {
      copyLink();
    }
  };

  const onClaim = async (threshold) => {
    setClaiming(threshold);
    try {
      const res = await claimReferralReward(threshold);
      addToast?.(rewardClaimedMsg(res?.reward_type), 'success');
      await load();
    } catch (e) {
      addToast?.(e?.message || 'Could not claim that reward.', 'error');
    } finally {
      setClaiming(null);
    }
  };

  return (
    <div style={S.wrap}>
      <div style={S.hero}>
        <span style={S.kicker}>Referrals</span>
        <h1 style={S.h1}>Invite friends, earn Pro</h1>
        <p style={S.sub}>
          Share your link. When someone signs up <b>and makes a post</b>, it counts as one referral.
          Climb the ladder for free Pro - all the way to Pro for life.
        </p>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      {loading ? (
        <div style={S.muted}>{[1,2,3].map(i => <ListItemSkeleton key={i} />)}</div>
      ) : (
        <>
          {/* Invite link */}
          <div style={S.card}>
            <div style={S.cardLabel}>Your invite link</div>
            <div style={S.linkRow}>
              <code style={S.linkCode}>{link}</code>
            </div>
            <div style={S.btnRow}>
              <button style={S.primaryBtn} onClick={copyLink}>Copy link</button>
              <button style={S.secondaryBtn} onClick={shareLink}>Share…</button>
            </div>
          </div>

          {/* Count + funnel */}
          <div style={S.statsRow}>
            <div style={{ ...S.stat, ...S.statBig }}>
              <div style={S.statNumBig}>{qualified}</div>
              <div style={S.statLabel}>Valid referrals</div>
            </div>
            <div style={S.stat}>
              <div style={S.statNum}>{summary?.shares ?? 0}</div>
              <div style={S.statLabel}>Times shared</div>
            </div>
            <div style={S.stat}>
              <div style={S.statNum}>{summary?.signups ?? 0}</div>
              <div style={S.statLabel}>Signups</div>
            </div>
          </div>

          {/* Progress to next rung */}
          {nextTier && (
            <div style={S.card}>
              <div style={S.progressTop}>
                <span>Next reward: <b style={{ color: '#f2f2f2' }}>{nextTier.label}</b></span>
                <span style={S.muted}>{qualified} / {nextTier.threshold}</span>
              </div>
              <div style={S.progressTrack}>
                <div style={{ ...S.progressFill, width: `${progressTo}%` }} />
              </div>
            </div>
          )}

          {/* Reward ladder */}
          <h2 style={S.h2}>Reward ladder</h2>
          <div style={S.ladder}>
            {tiers.map((t) => {
              const state = t.claimed ? 'claimed' : t.claimable ? 'claimable' : 'locked';
              return (
                <div
                  key={t.threshold}
                  style={{
                    ...S.rung,
                    ...(state === 'claimable' ? S.rungClaimable : null),
                    ...(state === 'claimed' ? S.rungClaimed : null),
                  }}
                >
                  <div style={S.rungN}>{t.threshold}</div>
                  <div style={S.rungIcon}>{REWARD_ICON[t.reward_type] || '🎁'}</div>
                  <div style={S.rungBody}>
                    <div style={S.rungLabel}>{t.label}</div>
                    <div style={S.rungSub}>
                      {t.threshold} valid referral{t.threshold === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div style={S.rungAction}>
                    {state === 'claimed' && <span style={S.claimedTag}>Claimed ✓</span>}
                    {state === 'claimable' && (
                      <button
                        style={S.claimBtn}
                        disabled={claiming === t.threshold}
                        onClick={() => onClaim(t.threshold)}
                      >
                        {claiming === t.threshold ? '…' : 'Claim'}
                      </button>
                    )}
                    {state === 'locked' && <span style={S.lockedTag}>🔒</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <p style={S.fineprint}>
            A referral only counts once the person you invited signs up and posts. One reward per rung.
            Earned Pro includes the Pro badge for its full duration. Suspicious activity gets one warning,
            then a ban - invite real people.
          </p>
          {onBack && (
            <button style={{ ...S.secondaryBtn, marginTop: 8 }} onClick={onBack}>← Back home</button>
          )}
        </>
      )}
    </div>
  );
}

function rewardClaimedMsg(type) {
  switch (type) {
    case 'bp': return 'Reward claimed - Builder Points added!';
    case 'contest': return 'Reward claimed - free contest entry unlocked!';
    case 'pro': return 'Reward claimed - Prompted Pro added to your account!';
    case 'pro_lifetime': return 'Reward claimed - Prompted Pro for LIFE. 👑';
    case 'flair': return 'Reward claimed - exclusive profile flair unlocked!';
    case 'cash': return 'Reward claimed - your cash payout request was submitted for review.';
    default: return 'Reward claimed!';
  }
}

// Neutral, ChatGPT-style grayscale palette - no blue. Near-black surfaces,
// light text, white primary actions. Typography uses the premium fonts the app
// already loads (Space Grotesk + JetBrains Mono) for a clean, refined feel.
const SANS = "'Space Grotesk', system-ui, -apple-system, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";
const ACCENT = '#ececec';   // light "accent" (text/links/emphasis)
const ACCENT2 = '#d1d1d1';  // secondary light gray (claim / progress end)
const TEXT = '#f2f2f2';
const MUTED = '#9a9a9a';
const BORDER = '#2a2a2a';
const CARD = '#181818';
const INSET = '#0f0f0f';
const S = {
  wrap: {
    maxWidth: 720, margin: '0 auto', padding: '32px 16px 96px',
    fontFamily: SANS, WebkitFontSmoothing: 'antialiased',
  },
  hero: { padding: '8px 0 24px' },
  kicker: {
    display: 'inline-block', fontFamily: MONO, fontWeight: 500, fontSize: 11, lineHeight: 1,
    letterSpacing: '.18em', textTransform: 'uppercase', color: '#cfcfcf',
    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)',
    padding: '7px 11px', borderRadius: 999, marginBottom: 18,
  },
  h1: { fontSize: 34, fontWeight: 600, margin: '0 0 10px', letterSpacing: '-.03em', color: TEXT, lineHeight: 1.1 },
  h2: { fontSize: 18, fontWeight: 600, margin: '32px 0 14px', color: TEXT, letterSpacing: '-.01em' },
  sub: { color: MUTED, fontSize: 15.5, margin: 0, lineHeight: 1.65, maxWidth: 560 },
  card: {
    background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16,
    padding: '20px 22px', margin: '14px 0',
    boxShadow: '0 1px 2px rgba(0,0,0,.4)',
  },
  cardLabel: { color: MUTED, fontSize: 11.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 },
  linkRow: { background: INSET, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '13px 15px', overflowX: 'auto' },
  linkCode: { fontFamily: MONO, fontWeight: 500, fontSize: 13.5, color: TEXT, whiteSpace: 'nowrap' },
  btnRow: { display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  primaryBtn: {
    background: '#ffffff', color: '#0d0d0d', border: 'none', borderRadius: 999,
    padding: '11px 20px', fontFamily: SANS, fontWeight: 600, fontSize: 14, cursor: 'pointer',
    transition: 'opacity .15s ease',
  },
  secondaryBtn: {
    background: 'transparent', color: TEXT, border: `1px solid ${BORDER}`,
    borderRadius: 999, padding: '11px 20px', fontFamily: SANS, fontWeight: 500, fontSize: 14, cursor: 'pointer',
    transition: 'background .15s ease',
  },
  statsRow: { display: 'flex', gap: 12, margin: '14px 0' },
  stat: {
    flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
    padding: '18px 12px', textAlign: 'center',
  },
  statBig: { borderColor: 'rgba(255,255,255,.22)', background: 'rgba(255,255,255,.04)' },
  statNum: { fontSize: 26, fontWeight: 600, color: TEXT, letterSpacing: '-.02em' },
  statNumBig: { fontSize: 38, fontWeight: 700, color: '#ffffff', letterSpacing: '-.03em' },
  statLabel: { fontSize: 12, color: MUTED, marginTop: 6 },
  progressTop: { display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#cfcfcf', marginBottom: 12 },
  progressTrack: { height: 8, background: INSET, border: `1px solid ${BORDER}`, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', background: `linear-gradient(90deg, #7a7a7a, ${ACCENT2})`, borderRadius: 999, transition: 'width .4s ease' },
  ladder: { display: 'flex', flexDirection: 'column', gap: 8 },
  rung: {
    display: 'flex', alignItems: 'center', gap: 14, background: CARD,
    border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px',
    transition: 'border-color .15s ease',
  },
  rungClaimable: { borderColor: 'rgba(255,255,255,.4)', boxShadow: '0 0 0 1px rgba(255,255,255,.14), 0 0 24px rgba(255,255,255,.06)' },
  rungClaimed: { opacity: 0.5 },
  rungN: { width: 38, textAlign: 'center', fontFamily: MONO, fontWeight: 700, fontSize: 17, color: ACCENT2, flexShrink: 0 },
  rungIcon: { fontSize: 22, width: 26, textAlign: 'center', flexShrink: 0 },
  rungBody: { flex: 1, minWidth: 0 },
  rungLabel: { color: TEXT, fontWeight: 600, fontSize: 15 },
  rungSub: { color: MUTED, fontSize: 12.5, marginTop: 3 },
  rungAction: { flexShrink: 0 },
  claimBtn: {
    background: '#ffffff', color: '#0d0d0d', border: 'none', borderRadius: 999,
    padding: '9px 18px', fontFamily: SANS, fontWeight: 600, fontSize: 13, cursor: 'pointer',
  },
  claimedTag: { color: '#bdbdbd', fontSize: 13, fontWeight: 500 },
  lockedTag: { color: '#5e5e5e', fontSize: 16 },
  muted: { color: MUTED, fontSize: 14, padding: '8px 0' },
  fineprint: { color: '#707070', fontSize: 12.5, lineHeight: 1.65, marginTop: 24, maxWidth: 600 },
  errorBox: {
    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.16)',
    color: '#e6e6e6', borderRadius: 12, padding: '13px 15px', margin: '12px 0', fontSize: 14,
  },
};
