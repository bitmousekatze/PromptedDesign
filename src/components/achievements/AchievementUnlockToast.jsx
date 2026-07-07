import React, { useEffect } from 'react';
import { TIER_COLORS } from '../../lib/achievements.js';

const TOAST_DURATION_MS = 4500;

export default function AchievementUnlockToast({ achievement, onDismiss }) {
  useEffect(() => {
    if (!achievement) return undefined;
    const t = setTimeout(() => onDismiss && onDismiss(), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [achievement, onDismiss]);

  if (!achievement) return null;

  const tierColor = TIER_COLORS[achievement.tier] || TIER_COLORS.gold;

  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        padding: '14px 20px 14px 16px',
        borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(22, 22, 42, 0.97) 0%, rgba(14, 14, 31, 0.97) 100%)',
        border: `1.5px solid ${tierColor}`,
        boxShadow: `0 12px 60px ${tierColor}66, 0 0 30px rgba(0,0,0,0.6)`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minWidth: 280,
        maxWidth: 'calc(100vw - 32px)',
        cursor: 'pointer',
        animation: 'achievementUnlockPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        color: '#F1F5F9',
      }}
      onClick={() => onDismiss && onDismiss(true)}
      role="alert"
    >
      <div
        style={{
          fontSize: 40,
          lineHeight: 1,
          flexShrink: 0,
          filter: `drop-shadow(0 0 8px ${tierColor}80)`,
        }}
      >
        {achievement.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: tierColor,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: 2,
          }}
        >
          Achievement Unlocked!
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: '#F1F5F9',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {achievement.name}
        </div>
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          padding: '4px 10px',
          borderRadius: 999,
          background: `${tierColor}33`,
          color: tierColor,
          flexShrink: 0,
        }}
      >
        +{achievement.points}
      </span>
    </div>
  );
}
