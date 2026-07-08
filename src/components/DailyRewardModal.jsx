import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { ADSENSE_CLIENT, AD_SLOTS, adsEnabled, slotReady, loadAdSense } from '../lib/ads';
import PageLoader from './PageLoader.jsx';
import styles from './DailyRewardModal.module.css';

// A pre-filled X (Twitter) composer - just a convenience starting point. Users
// can edit it freely or post anything; the claim only needs a tweet link a mod
// can open and verify.
const composeTweetIntent = () => {
  const text = 'Building with AI on @prmpted 🚀';
  const url = 'https://prmpted.com';
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
};

// Reward ladder shown in the modal: day N of the streak pays
// 12 + 4*(N-1) BP, capped at 40 (mirrors _daily_reward_base in the DB -
// the server is authoritative, this is display only). The cycle is 14 days;
// every 14th day also grants a free Pro week.
const CYCLE_DAYS = 14;
const baseForDay = (day) => Math.min(12 + 4 * (Math.max(day, 1) - 1), 40);
const isBonusDay = (day) => day % CYCLE_DAYS === 0;

const formatCountdown = (totalSeconds) => {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
};

// Full-screen "watch an ad" gate: shows the rewarded ad unit (or a preview
// box until the AdSense slot is configured) behind a countdown. The reward
// is granted when the countdown finishes and the user hits Claim.
const AdGate = ({ title, rewardLabel, onDone, onCancel }) => {
  const [secondsLeft, setSecondsLeft] = useState(15);
  const insRef = useRef(null);
  const adLive = adsEnabled() && slotReady(AD_SLOTS.rewarded);

  useEffect(() => {
    if (adLive) {
      loadAdSense();
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        /* AdSense not ready yet */
      }
    }
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [adLive]);

  return (
    <div className="modal-overlay" style={{ zIndex: 10001 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-title-block">
            <span className="modal-title-eyebrow">Sponsored</span>
            <h2 className="modal-title">{title}</h2>
            <p className="modal-title-sub">{rewardLabel}</p>
          </div>
        </div>
        <div className="modal-body">
          {adLive ? (
            <ins
              ref={insRef}
              className="adsbygoogle"
              style={{ display: 'block', minHeight: 250 }}
              data-ad-client={ADSENSE_CLIENT}
              data-ad-slot={AD_SLOTS.rewarded}
              data-ad-format="auto"
              data-full-width-responsive="true"
            />
          ) : (
            <div className="ad-placeholder" style={{ minHeight: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span>Advertisement</span>
              <small>Ad preview · real ads start once AdSense approves the site</small>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem', alignItems: 'center' }}>
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" disabled={secondsLeft > 0} onClick={onDone}>
              {secondsLeft > 0 ? `Claim in ${secondsLeft}s…` : 'Claim reward'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const GiftGlyph = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13" />
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
  </svg>
);

const XGlyph = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
  </svg>
);

// Share-to-claim gate: the user posts on X (about their build on Prompted, or
// just about Prompted), pastes the link to their tweet, and submits it for
// review. A mod opens the link to verify before points are awarded. One share
// covers two days: the next day's reward is a direct claim, no tweet needed.
// The pasted link must be an x.com / twitter.com URL - mirrors the server-side
// check in submit_daily_reward so we fail fast in the UI.
const isTweetUrl = (v) => /^https?:\/\/([a-z0-9-]+\.)*(x|twitter)\.com\//i.test((v || '').trim());

const ShareGate = ({ rewardLabel, submitting, onSubmit, onCancel }) => {
  const [tweetUrl, setTweetUrl] = useState('');
  const urlOk = isTweetUrl(tweetUrl);

  return (
    <div className="modal-overlay" style={{ zIndex: 10001 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-title-block">
            <span className="modal-title-eyebrow">Share to claim</span>
            <h2 className="modal-title">Share on X to claim</h2>
            <p className="modal-title-sub">{rewardLabel}</p>
          </div>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.88rem', color: '#cbd5e1', marginTop: 0, lineHeight: 1.5 }}>
            1. Post on X about your build - or just about Prompted.<br />
            2. Paste the link to your tweet - a mod opens it to verify, then your Builder Points land.<br />
            One post covers two days: tomorrow you claim instantly, no tweet needed.
          </p>
          <button
            className="btn"
            onClick={() => window.open(composeTweetIntent(), '_blank', 'noopener,noreferrer,width=550,height=420')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <XGlyph /> Compose a post on X
          </button>
          <input
            type="url"
            value={tweetUrl}
            onChange={(e) => setTweetUrl(e.target.value)}
            placeholder="Paste your tweet link (https://x.com/…)"
            style={{ width: '100%', padding: '0.6rem', borderRadius: 8, marginTop: '0.75rem', background: '#1e293b', color: '#e2e8f0', border: `1px solid ${tweetUrl && !urlOk ? '#ef4444' : '#334155'}`, boxSizing: 'border-box' }}
          />
          {tweetUrl && !urlOk && (
            <div style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: 6 }}>
              That doesn’t look like an X / Twitter link.
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem', alignItems: 'center' }}>
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={!urlOk || submitting}
              onClick={() => onSubmit(tweetUrl.trim())}
            >
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Daily reward modal: claim today's builder points (ad doubles them), or
// recover yesterday's missed reward by watching an ad.
const DailyRewardModal = ({ isOpen, onClose, onClaimed, user }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [adGate, setAdGate] = useState(null); // null | 'today' | 'yesterday'
  const [shareGate, setShareGate] = useState(false); // share-to-claim gate for today
  const [submitting, setSubmitting] = useState(false); // submitting a claim for review
  const [result, setResult] = useState(null); // last successful claim payload
  const [error, setError] = useState('');

  const fetchStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('daily_reward_status');
      if (err) throw err;
      setStatus(data);
    } catch {
      setError('Could not load your daily reward. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setAdGate(null);
      setShareGate(false);
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const claim = async (day, watchedAd) => {
    if (claiming) return;
    setClaiming(true);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('claim_daily_reward', {
        p_day: day,
        p_watched_ad: watchedAd,
      });
      if (err) throw err;
      if (!data?.ok) {
        const msg = {
          already_claimed: 'Already claimed - come back tomorrow!',
          share_required: 'Today needs an X post - hit "Share on X" to claim.',
        }[data?.error] || 'Claim failed. Try again.';
        setError(msg);
        await fetchStatus();
        return;
      }
      setResult(data);
      if (onClaimed) onClaimed(data);
      await fetchStatus();
    } catch {
      setError('Claim failed. Try again.');
    } finally {
      setClaiming(false);
    }
  };

  // Share-to-claim: record a PENDING claim with the tweet link. No points yet -
  // an admin/mod confirms it from their notifications before BP is awarded.
  const submitForReview = async (tweetUrl) => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('submit_daily_reward', { p_tweet_url: tweetUrl });
      if (err) throw err;
      if (!data?.ok) {
        const msg = {
          already_claimed: 'Already claimed - come back tomorrow!',
          already_pending: "You've already submitted today - a mod is reviewing it.",
          bad_tweet_url: 'That doesn’t look like an X / Twitter link. Paste your tweet URL.',
          not_signed_in: 'Sign in to claim your daily reward.',
        }[data?.error] || 'Submit failed. Try again.';
        setError(msg);
        await fetchStatus();
        return;
      }
      setShareGate(false);
      await fetchStatus();
    } catch {
      setError('Submit failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const todayDay = status?.today_streak_day || 1;
  const todayBase = status?.today_base_points ?? baseForDay(todayDay);
  const yesterdayBase = status?.yesterday_base_points ?? 12;
  const todayPending = status?.today_pending;
  // Every-other-day cadence: an X share yesterday "covers" today, so the claim
  // is a straight button. Defaults to requiring the share if the server
  // doesn't say otherwise.
  const shareRequired = status?.today_share_required !== false;
  // Ad-gated actions (double + yesterday recovery) stay hidden until the
  // rewarded AdSense slot is live - they turn on by pasting the real slot
  // ID into AD_SLOTS.rewarded once Google approves the site.
  const adFeaturesOn = adsEnabled() && slotReady(AD_SLOTS.rewarded);

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <div className="modal-header">
            <div className="modal-title-block">
              <span className="modal-title-eyebrow">Daily Reward</span>
              <h2 className="modal-title">Your daily Builder Points</h2>
              <p className="modal-title-sub">
                Claim Builder Points every day. Every other day, back it up with a post on X about your build - or just about Prompted; a mod verifies it, then your points land. Keep the streak going and the reward grows.
              </p>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>

          <div className="modal-body">
            {loading && <div style={{ textAlign: 'center', padding: '2rem' }}><PageLoader size={24} text="" /></div>}

            {!loading && status?.signed_in && (
              <>
                {/* Streak ladder - current 14-day cycle (2 rows of 7) */}
                <div className={styles.ladder}>
                  {Array.from({ length: CYCLE_DAYS }, (_, i) => {
                    const dayNum = Math.max(todayDay - ((todayDay - 1) % CYCLE_DAYS) + i, i + 1);
                    const isCurrent = dayNum === todayDay;
                    const bonus = isBonusDay(dayNum);
                    return (
                      <div key={i} className={`${styles.chip} ${isCurrent ? styles.current : ''} ${dayNum < todayDay ? styles.done : ''} ${bonus ? styles.bonus : ''}`}>
                        <span className="daily-reward-chip-day">Day {dayNum}</span>
                        <span className={styles.chipPts}>+{baseForDay(dayNum)}</span>
                        {bonus && <span className={styles.chipBonus}>👑 Pro</span>}
                      </div>
                    );
                  })}
                </div>

                {result && (
                  <div className={styles.success}>
                    <GiftGlyph size={28} />
                    <div>
                      <strong>+{result.points} Builder Points!</strong>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        {result.recovered ? "Yesterday's reward recovered" : `Day ${result.streak_day} of your streak`}
                        {result.doubled ? ' · doubled by ad' : ''}
                      </div>
                      {result.free_pro_granted && (
                        <div style={{ fontSize: '0.82rem', color: '#f4c430', marginTop: 4, fontWeight: 700 }}>
                          👑 1 week of free Pro unlocked!
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Today's claim */}
                {todayPending ? (
                  <div className={`${styles.card} ${styles.recover}`}>
                    <div className="daily-reward-card-info">
                      <div className={styles.cardTitle}>Day {todayDay} · in review ⏳</div>
                      <div className={styles.cardSub}>
                        A mod is verifying your tweet. Your +{todayBase} Builder Points{isBonusDay(todayDay) ? ' + free Pro week 👑' : ''} land once it's confirmed - and tomorrow's reward is already covered, no post needed.
                      </div>
                    </div>
                  </div>
                ) : !status.today_claimed ? (
                  <div className={styles.card}>
                    <div className="daily-reward-card-info">
                      <div className={styles.cardTitle}>Day {todayDay} reward</div>
                      <div className={styles.cardSub}>
                        +{todayBase} Builder Points{isBonusDay(todayDay) ? ' + 1 week of free Pro 👑' : ''}
                        {!shareRequired && ' · covered by your X share ✓ - no post needed today'}
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      {shareRequired ? (
                        <button className="btn btn-primary" disabled={claiming || submitting} onClick={() => setShareGate(true)}>
                          Share on X · claim +{todayBase}
                        </button>
                      ) : (
                        <button className="btn btn-primary" disabled={claiming || submitting} onClick={() => claim('today', false)}>
                          {claiming ? 'Claiming…' : `Claim +${todayBase}`}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={`${styles.card} ${styles.claimed}`}>
                    <div className="daily-reward-card-info">
                      <div className={styles.cardTitle}>Claimed today ✓ (+{status.today_points_claimed} BP)</div>
                      <div className={styles.cardSub}>
                        Next reward in {formatCountdown(status.seconds_to_next_day)} - Day {todayDay + 1} pays +{baseForDay(todayDay + 1)}{isBonusDay(todayDay + 1) ? ' + free Pro week 👑' : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* Yesterday recovery - ad-gated, only ever yesterday */}
                {adFeaturesOn && status.yesterday_recoverable && (
                  <div className={`${styles.card} ${styles.recover}`}>
                    <div className="daily-reward-card-info">
                      <div className={styles.cardTitle}>Missed yesterday?</div>
                      <div className={styles.cardSub}>
                        Watch an ad to claim yesterday's +{yesterdayBase} BP and keep your streak. Today only - it expires at the next reset.
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      <button className="btn" disabled={claiming} onClick={() => setAdGate('yesterday')}>
                        ▶ Watch ad · recover +{yesterdayBase}
                      </button>
                    </div>
                  </div>
                )}

                {error && <div style={{ color: '#ff6b6b', fontSize: '0.85rem', marginTop: '0.75rem' }}>{error}</div>}
              </>
            )}

            {!loading && status && !status.signed_in && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                Sign in to claim your daily Builder Points.
              </div>
            )}

            {!loading && !status && error && (
              <div style={{ color: '#ff6b6b', fontSize: '0.85rem' }}>{error}</div>
            )}
          </div>
        </div>
      </div>

      {shareGate && (
        <ShareGate
          submitting={submitting}
          rewardLabel={`Share on X to claim +${todayBase} Builder Points`}
          onCancel={() => setShareGate(false)}
          onSubmit={submitForReview}
        />
      )}

      {adGate && (
        <AdGate
          title={adGate === 'today' ? 'Double your reward' : "Recover yesterday's reward"}
          rewardLabel={adGate === 'today'
            ? `Watch to claim +${todayBase * 2} Builder Points`
            : `Watch to claim yesterday's +${yesterdayBase} Builder Points`}
          onCancel={() => setAdGate(null)}
          onDone={() => {
            const day = adGate;
            setAdGate(null);
            claim(day, true);
          }}
        />
      )}
    </>
  );
};

export default DailyRewardModal;
