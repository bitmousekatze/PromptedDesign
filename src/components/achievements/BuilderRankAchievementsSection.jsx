import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAchievementsWithProgress,
  TIER_COLORS,
  getAchievementState,
} from '../../lib/achievements.js';

const SHOW_COUNT = 4;

export default function BuilderRankAchievementsSection({ userId, onViewAll }) {
  const { data: achievements = [], isLoading } = useQuery({
    queryKey: ['achievements', 'progress', userId],
    queryFn: () => fetchAchievementsWithProgress(userId),
    staleTime: 1000 * 30,
    enabled: !!userId,
  });

  const { unlockedCount, totalCount, featured, featuredKind } = useMemo(() => {
    const total = achievements.length;
    const unlocked = achievements.filter((a) => !!a.unlocked_at).length;

    // 1) Unclaimed unlocks first - these have points the user can collect now.
    const unclaimed = achievements
      .filter((a) => getAchievementState(a) === 'unclaimed')
      .sort((a, b) => new Date(b.unlocked_at) - new Date(a.unlocked_at));

    if (unclaimed.length > 0) {
      return {
        unlockedCount: unlocked,
        totalCount: total,
        featured: unclaimed.slice(0, SHOW_COUNT),
        featuredKind: 'unclaimed',
      };
    }

    // 2) Otherwise show locked achievements closest to their threshold,
    //    excluding secret ones (no progress leaks).
    const closest = achievements
      .filter((a) => !a.unlocked_at && !a.is_secret && a.threshold > 0)
      .map((a) => ({
        ach: a,
        ratio: Math.min(1, (a.progress || 0) / a.threshold),
      }))
      .filter((x) => x.ratio > 0)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, SHOW_COUNT)
      .map((x) => x.ach);

    return {
      unlockedCount: unlocked,
      totalCount: total,
      featured: closest,
      featuredKind: closest.length > 0 ? 'closest' : 'none',
    };
  }, [achievements]);

  if (!userId) return null;

  const heading =
    featuredKind === 'unclaimed'
      ? 'Unclaimed achievements'
      : featuredKind === 'closest'
        ? 'Closest to unlocking'
        : 'Achievements';

  return (
    <div
      style={{
        marginTop: 32,
        padding: '20px 18px',
        borderRadius: 14,
        background: 'rgba(15, 15, 35, 0.4)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          gap: 12,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#F1F5F9',
              margin: '0 0 2px',
            }}
          >
            Achievements
          </h3>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>
            {isLoading ? 'Loading…' : `${unlockedCount} / ${totalCount} unlocked`}
          </div>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          style={{
            padding: '7px 14px',
            borderRadius: 999,
            border: '1px solid rgba(255, 232, 31, 0.4)',
            background: 'rgba(255, 232, 31, 0.12)',
            color: '#FFE81F',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          View all
        </button>
      </div>

      {featured.length > 0 ? (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: featuredKind === 'unclaimed' ? '#FFE81F' : '#94A3B8',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: 10,
            }}
          >
            {heading}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 10,
            }}
          >
            {featured.map((a) => (
              <MiniAchievementRow
                key={a.id}
                achievement={a}
                kind={featuredKind}
                onClick={onViewAll}
              />
            ))}
          </div>
        </>
      ) : isLoading ? null : unlockedCount === totalCount && totalCount > 0 ? (
        <div style={{ fontSize: 13, color: '#FFE81F' }}>
          🏆 All achievements unlocked!
        </div>
      ) : (
        <div style={{ fontSize: 13, color: '#64748B' }}>
          No progress yet - keep building to unlock achievements!
        </div>
      )}
    </div>
  );
}

function MiniAchievementRow({ achievement, kind, onClick }) {
  const tierColor = TIER_COLORS[achievement.tier] || TIER_COLORS.bronze;
  const isUnclaimed = kind === 'unclaimed';

  const progress = Math.max(0, Math.min(achievement.progress || 0, achievement.threshold || 1));
  const progressPercent = achievement.threshold > 0
    ? (progress / achievement.threshold) * 100
    : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      title={achievement.name}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: isUnclaimed
          ? '1.5px solid #FFE81F'
          : `1px solid ${tierColor}55`,
        background: isUnclaimed
          ? 'rgba(255, 232, 31, 0.1)'
          : `${tierColor}12`,
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: isUnclaimed ? '0 0 14px rgba(255, 232, 31, 0.25)' : 'none',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          background: 'rgba(0,0,0,0.25)',
          filter: isUnclaimed ? 'none' : 'grayscale(0.2)',
        }}
      >
        {achievement.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#F1F5F9',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {achievement.name}
        </div>
        {isUnclaimed ? (
          <div style={{ fontSize: 11, color: '#FFE81F', fontWeight: 700, marginTop: 2 }}>
            Tap to claim +{achievement.points}
          </div>
        ) : (
          <>
            <div
              style={{
                marginTop: 4,
                width: '100%',
                height: 3,
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
                }}
              />
            </div>
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 3 }}>
              {progress} / {achievement.threshold}
            </div>
          </>
        )}
      </div>
    </button>
  );
}
