import React from 'react';
import { TIER_COLORS, TIER_GLOW, getAchievementState } from '../../lib/achievements.js';

export default function AchievementCard({
  achievement,
  onClick,
  onClaim,
  highlighted = false,
  animationDelay = 0,
  claimable = false,
  claiming = false,
}) {
  const state = getAchievementState(achievement);
  const isUnlocked = state !== 'locked';
  const isUnclaimed = state === 'unclaimed';
  const isSecretLocked = achievement.is_secret && !isUnlocked;
  const tierColor = TIER_COLORS[achievement.tier] || TIER_COLORS.bronze;
  const tierGlow = TIER_GLOW[achievement.tier] || TIER_GLOW.bronze;

  const progress = Math.max(0, Math.min(achievement.progress || 0, achievement.threshold || 1));
  const progressPercent = achievement.threshold > 0
    ? (progress / achievement.threshold) * 100
    : 0;

  const displayName = isSecretLocked ? '???' : achievement.name;
  const displayDescription = isSecretLocked ? 'Hidden until unlocked' : achievement.description;
  const displayIcon = isSecretLocked ? '🔒' : achievement.icon;

  const borderColor = isUnclaimed
    ? '#FFE81F'
    : isUnlocked
      ? tierColor
      : `${tierColor}66`;

  const bgGradient = isUnclaimed
    ? 'linear-gradient(160deg, rgba(255, 232, 31, 0.18) 0%, rgba(15, 15, 35, 0.55) 60%)'
    : isUnlocked
      ? `linear-gradient(160deg, ${tierColor}18 0%, rgba(15, 15, 35, 0.4) 60%)`
      : 'rgba(15, 15, 35, 0.45)';

  const innerShadow = isUnclaimed
    ? '0 0 22px rgba(255, 232, 31, 0.35), inset 0 0 22px rgba(255, 232, 31, 0.18)'
    : isUnlocked
      ? `inset 0 0 24px ${tierGlow}`
      : 'none';

  const iconStyle = isUnlocked
    ? {}
    : { filter: 'grayscale(1) opacity(0.55)' };

  const handleClick = () => {
    if (isUnclaimed && claimable && onClaim && !claiming) {
      onClaim(achievement);
      return;
    }
    if (onClick) onClick(achievement);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={claiming}
      className={
        highlighted
          ? 'achievement-card achievement-card-highlight'
          : isUnclaimed
            ? 'achievement-card achievement-card-unclaimed'
            : 'achievement-card'
      }
      style={{
        position: 'relative',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '14px 12px 12px',
        borderRadius: '14px',
        border: `1.5px solid ${borderColor}`,
        background: bgGradient,
        boxShadow: innerShadow,
        cursor: claiming ? 'wait' : 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
        opacity: claiming ? 0.85 : isUnlocked ? 1 : 0.92,
        animation: `achievementFadeIn 0.4s ease ${animationDelay}ms both`,
        color: 'inherit',
        font: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!claiming) e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
      }}
    >
      {isUnclaimed && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '2px 7px',
            borderRadius: 999,
            background: '#FFE81F',
            color: '#000',
            fontSize: 9,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          New
        </div>
      )}
      {isUnlocked && !isUnclaimed && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: tierColor,
            color: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 800,
          }}
          title="Claimed"
        >
          ✓
        </div>
      )}

      <div
        style={{
          fontSize: 36,
          lineHeight: 1,
          marginBottom: 2,
          ...iconStyle,
        }}
      >
        {displayIcon}
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: '#F1F5F9',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {displayName}
      </div>

      <div
        style={{
          fontSize: 12,
          color: '#94A3B8',
          lineHeight: 1.35,
          minHeight: 32,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {displayDescription}
      </div>

      {isUnclaimed ? (
        <div
          style={{
            marginTop: 4,
            padding: '6px 10px',
            borderRadius: 8,
            background: '#FFE81F',
            color: '#000',
            fontWeight: 800,
            fontSize: 12,
            textAlign: 'center',
            letterSpacing: '0.3px',
          }}
        >
          {claiming ? 'Claiming…' : `Tap to claim +${achievement.points}`}
        </div>
      ) : isUnlocked ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 4,
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: '#64748B',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {formatUnlockedDate(achievement.unlocked_at)}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 10,
              background: `${tierColor}26`,
              color: tierColor,
            }}
          >
            +{achievement.points}
          </span>
        </div>
      ) : (
        <div style={{ marginTop: 4 }}>
          <div
            style={{
              width: '100%',
              height: 4,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: tierColor,
                borderRadius: 2,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
          <div
            style={{
              fontSize: 10,
              color: '#64748B',
              marginTop: 4,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>
              {isSecretLocked ? '???' : `${progress} / ${achievement.threshold}`}
            </span>
            <span style={{ color: tierColor, fontWeight: 600 }}>
              +{achievement.points}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}

function formatUnlockedDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}
