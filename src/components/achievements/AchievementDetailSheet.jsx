import React, { useEffect } from 'react';
import { TIER_COLORS, CATEGORY_LABELS, getAchievementState } from '../../lib/achievements.js';

export default function AchievementDetailSheet({
  achievement,
  onClose,
  onClaim,
  claimable = false,
  claiming = false,
}) {
  useEffect(() => {
    if (!achievement) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [achievement, onClose]);

  if (!achievement) return null;

  const state = getAchievementState(achievement);
  const isUnlocked = state !== 'locked';
  const isUnclaimed = state === 'unclaimed';
  const isSecretLocked = achievement.is_secret && !isUnlocked;
  const tierColor = TIER_COLORS[achievement.tier] || TIER_COLORS.bronze;

  const displayName = isSecretLocked ? '???' : achievement.name;
  const displayDescription = isSecretLocked ? 'Hidden until unlocked' : achievement.description;
  const displayIcon = isSecretLocked ? '🔒' : achievement.icon;

  const progress = Math.max(0, Math.min(achievement.progress || 0, achievement.threshold || 1));
  const progressPercent = achievement.threshold > 0
    ? (progress / achievement.threshold) * 100
    : 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        zIndex: 9000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'achievementSheetBackdrop 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'linear-gradient(180deg, #16162A 0%, #0E0E1F 100%)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderRadius: window.innerWidth >= 768 ? 20 : '20px 20px 0 0',
          margin: window.innerWidth >= 768 ? 'auto' : 0,
          marginBottom: window.innerWidth >= 768 ? 'auto' : 0,
          padding: '24px 22px 32px',
          boxShadow: `0 -10px 60px ${tierColor}44, 0 0 60px rgba(0,0,0,0.6)`,
          border: `1px solid ${tierColor}55`,
          animation: 'achievementSheetIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          color: '#F1F5F9',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: 4,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              fontSize: 22,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 64,
              lineHeight: 1,
              filter: isUnlocked ? 'none' : 'grayscale(1) opacity(0.55)',
              marginBottom: 4,
            }}
          >
            {displayIcon}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              textAlign: 'center',
              color: '#F1F5F9',
            }}
          >
            {displayName}
          </div>
          {!isSecretLocked && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: `${tierColor}33`,
                  color: tierColor,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {achievement.tier}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.06)',
                  color: '#94A3B8',
                }}
              >
                {CATEGORY_LABELS[achievement.category] || achievement.category}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(74, 222, 128, 0.15)',
                  color: '#4ADE80',
                }}
              >
                +{achievement.points} pts
              </span>
            </div>
          )}
        </div>

        <p
          style={{
            fontSize: 14,
            color: '#CBD5E1',
            textAlign: 'center',
            lineHeight: 1.5,
            margin: '4px 4px 18px',
          }}
        >
          {displayDescription}
        </p>

        {isUnclaimed && claimable && (
          <button
            type="button"
            onClick={() => !claiming && onClaim && onClaim(achievement)}
            disabled={claiming}
            style={{
              display: 'block',
              width: '100%',
              marginBottom: 14,
              padding: '14px 16px',
              borderRadius: 12,
              border: 'none',
              background: '#FFE81F',
              color: '#000',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: '0.3px',
              cursor: claiming ? 'wait' : 'pointer',
              boxShadow: '0 0 24px rgba(255, 232, 31, 0.45)',
              animation: claiming ? 'none' : 'achievementClaimPulse 1.6s ease-in-out infinite',
            }}
          >
            {claiming ? 'Claiming…' : `Claim +${achievement.points} points`}
          </button>
        )}

        {!isSecretLocked && (
          <div
            style={{
              padding: '14px 14px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {isUnclaimed ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ color: '#94A3B8', fontSize: 13 }}>Unlocked</span>
                  <span style={{ color: tierColor, fontSize: 13, fontWeight: 600 }}>
                    {formatFullDate(achievement.unlocked_at)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#FFE81F', lineHeight: 1.5 }}>
                  Tap "Claim" to credit {achievement.points} builder points to your account.
                </div>
              </>
            ) : isUnlocked ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: '#94A3B8', fontSize: 13 }}>Claimed</span>
                <span style={{ color: tierColor, fontSize: 13, fontWeight: 600 }}>
                  {formatFullDate(achievement.claimed_at || achievement.unlocked_at)}
                </span>
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: '#94A3B8' }}>Progress</span>
                  <span style={{ color: '#F1F5F9', fontWeight: 600 }}>
                    {progress} / {achievement.threshold}
                  </span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: 6,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progressPercent}%`,
                      height: '100%',
                      background: tierColor,
                      borderRadius: 3,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    color: '#64748B',
                    lineHeight: 1.5,
                  }}
                >
                  {hintForAchievement(achievement)}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatFullDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function hintForAchievement(a) {
  const remaining = Math.max(0, (a.threshold || 0) - (a.progress || 0));
  switch (a.category) {
    case 'build':
      return remaining > 0
        ? `Share ${remaining} more build${remaining === 1 ? '' : 's'} to unlock this.`
        : 'Almost there!';
    case 'discussion':
      return 'Post and engage with discussions to unlock this.';
    case 'questions':
      return 'Ask or answer questions to unlock this.';
    case 'comments':
      return 'Add helpful comments to unlock this.';
    case 'engagement':
      return 'Keep using the app — engagement unlocks this.';
    case 'social':
      return 'Follow others or get followers to unlock this.';
    case 'community':
      return 'Join or grow communities to unlock this.';
    case 'tools':
      return 'Use AI tools in your builds to unlock this.';
    case 'profile':
      return 'Complete your profile to unlock this.';
    case 'special':
      return 'Special achievement — keep building!';
    default:
      return 'Keep going to unlock this achievement.';
  }
}
