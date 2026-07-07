import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import {
  fetchAchievementsWithProgress,
  refreshMyAchievements,
  claimAchievement,
} from '../lib/achievements.js';
import AchievementCard from '../components/achievements/AchievementCard.jsx';
import AchievementDetailSheet from '../components/achievements/AchievementDetailSheet.jsx';
import CategoryFilterChips from '../components/achievements/CategoryFilterChips.jsx';

export default function AchievementsPage({
  currentUser,
  viewingUserId,
  initialHighlightId,
  onAuthRequired,
  onBack,
  addToast,
}) {
  const isOwnPage = !!currentUser && (!viewingUserId || viewingUserId === currentUser.id);
  const targetUserId = viewingUserId || currentUser?.id || null;

  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState('all');
  const [selected, setSelected] = useState(null);
  const [profilePoints, setProfilePoints] = useState(null);
  const [highlightId, setHighlightId] = useState(initialHighlightId || null);
  const [claimingId, setClaimingId] = useState(null);

  const { data: achievements = [], isLoading } = useQuery({
    queryKey: ['achievements', 'progress', targetUserId],
    queryFn: () => fetchAchievementsWithProgress(targetUserId),
    staleTime: 1000 * 30,
    enabled: true,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      if (!targetUserId) {
        setProfilePoints(null);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('builder_points')
        .eq('id', targetUserId)
        .maybeSingle();
      if (active) setProfilePoints(data?.builder_points || 0);
    })();
    return () => {
      active = false;
    };
  }, [targetUserId]);

  useEffect(() => {
    if (!isOwnPage || !currentUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const awarded = await refreshMyAchievements();
        if (!cancelled && awarded && awarded.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['achievements', 'progress', currentUser.id] });
        }
      } catch (e) {
        console.error('[achievements] refresh on mount failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOwnPage, currentUser?.id, queryClient]);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(t);
  }, [highlightId]);

  const handleClaim = useCallback(async (achievement) => {
    if (!isOwnPage || !currentUser?.id || !achievement) {
      if (onAuthRequired) onAuthRequired();
      return;
    }
    if (achievement.claimed_at) return;
    setClaimingId(achievement.id);
    try {
      const result = await claimAchievement(achievement.id);
      const awarded = result?.awarded_points || 0;
      const claimedAtIso = result?.claimed_at || new Date().toISOString();
      queryClient.setQueryData(
        ['achievements', 'progress', currentUser.id],
        (prev) => Array.isArray(prev)
          ? prev.map((a) => a.id === achievement.id
              ? { ...a, claimed_at: claimedAtIso }
              : a)
          : prev
      );
      setSelected((s) => (s && s.id === achievement.id ? { ...s, claimed_at: claimedAtIso } : s));
      if (typeof result?.new_total_points === 'number') {
        setProfilePoints(result.new_total_points);
      } else if (awarded > 0 && profilePoints != null) {
        setProfilePoints(profilePoints + awarded);
      }
      if (addToast) {
        if (awarded > 0) {
          addToast(`Claimed +${awarded} builder points!`, 'success');
        } else {
          addToast('Already claimed.', 'info');
        }
      }
      queryClient.invalidateQueries({ queryKey: ['achievements', 'progress', currentUser.id] });
    } catch (e) {
      console.error('[achievements] claim failed', e);
      if (addToast) addToast('Could not claim achievement.', 'error');
    } finally {
      setClaimingId(null);
    }
  }, [isOwnPage, currentUser?.id, queryClient, addToast, profilePoints, onAuthRequired]);

  const totalCount = achievements.length;
  const unlockedCount = achievements.filter((a) => !!a.unlocked_at).length;

  const presentCategories = useMemo(() => {
    const set = new Set();
    for (const a of achievements) set.add(a.category);
    return Array.from(set);
  }, [achievements]);

  const filtered = useMemo(() => {
    const list = activeCategory === 'all'
      ? achievements
      : achievements.filter((a) => a.category === activeCategory);

    const progressRatio = (a) => {
      if (!a.threshold || a.threshold <= 0) return a.unlocked_at ? 1 : 0;
      const p = Math.max(0, Math.min(a.progress || 0, a.threshold));
      return p / a.threshold;
    };

    return [...list].sort((a, b) => {
      const aClaimed = !!a.claimed_at;
      const bClaimed = !!b.claimed_at;
      if (aClaimed !== bClaimed) return aClaimed ? 1 : -1;
      if (aClaimed && bClaimed) {
        const aT = a.claimed_at ? new Date(a.claimed_at).getTime() : 0;
        const bT = b.claimed_at ? new Date(b.claimed_at).getTime() : 0;
        if (aT !== bT) return bT - aT;
        return (a.display_order || 0) - (b.display_order || 0);
      }
      const aRatio = progressRatio(a);
      const bRatio = progressRatio(b);
      if (aRatio !== bRatio) return bRatio - aRatio;
      return (a.display_order || 0) - (b.display_order || 0);
    });
  }, [achievements, activeCategory]);

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '32px 16px 100px',
        maxWidth: 1100,
        margin: '0 auto',
      }}
    >
      <style>{`
        @keyframes achievementFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes achievementUnlockPop {
          0% { opacity: 0; transform: translateX(-50%) scale(0.6); }
          60% { opacity: 1; transform: translateX(-50%) scale(1.06); }
          100% { opacity: 1; transform: translateX(-50%) scale(1); }
        }
        @keyframes achievementSheetIn {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: none; opacity: 1; }
        }
        @keyframes achievementSheetBackdrop {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes achievementHighlightPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 232, 31, 0); }
          50% { box-shadow: 0 0 0 6px rgba(255, 232, 31, 0.35); }
        }
        @keyframes achievementClaimPulse {
          0%, 100% { box-shadow: 0 0 16px rgba(255, 232, 31, 0.4); }
          50% { box-shadow: 0 0 28px rgba(255, 232, 31, 0.7); }
        }
        .achievement-card-unclaimed {
          animation: achievementHighlightPulse 1.8s ease-in-out infinite, achievementFadeIn 0.4s ease both;
        }
        .achievements-filter-chips::-webkit-scrollbar { display: none; }
        .achievement-card-highlight {
          animation: achievementHighlightPulse 1.6s ease-in-out 2 !important;
        }
        .achievements-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        @media (min-width: 640px) {
          .achievements-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        }
        @media (min-width: 1024px) {
          .achievements-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
        }
      `}</style>

      <div style={{ marginBottom: 24 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px 6px 8px',
              marginBottom: 14,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(15, 15, 35, 0.5)',
              color: '#CBD5E1',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(15, 15, 35, 0.8)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(15, 15, 35, 0.5)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to Ranks
          </button>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: '#F1F5F9',
                margin: '0 0 6px',
              }}
            >
              Achievements
            </h1>
            <p style={{ color: '#94A3B8', fontSize: 14, margin: 0 }}>
              {isOwnPage
                ? 'Earn achievements by building, sharing, and engaging with the community.'
                : 'Achievements earned by this builder.'}
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 16,
            marginTop: 16,
            flexWrap: 'wrap',
          }}
        >
          <StatTile
            label="Unlocked"
            value={`${unlockedCount} / ${totalCount}`}
            accent="#FFE81F"
          />
          <StatTile
            label="Builder Points"
            value={profilePoints != null ? profilePoints.toLocaleString() : '—'}
            accent="#4ADE80"
          />
        </div>
      </div>

      <CategoryFilterChips
        categories={presentCategories}
        activeCategory={activeCategory}
        onChange={setActiveCategory}
      />

      {isLoading ? (
        <div
          style={{
            textAlign: 'center',
            color: '#64748B',
            padding: '80px 20px',
          }}
        >
          Loading achievements…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState isOwnPage={isOwnPage} hasUnlocks={unlockedCount > 0} />
      ) : (
        <div className="achievements-grid">
          {filtered.map((a, idx) => (
            <AchievementCard
              key={a.id}
              achievement={a}
              onClick={(ach) => setSelected(ach)}
              onClaim={handleClaim}
              claimable={isOwnPage}
              claiming={claimingId === a.id}
              highlighted={highlightId === a.id}
              animationDelay={Math.min(idx * 25, 600)}
            />
          ))}
        </div>
      )}

      <AchievementDetailSheet
        achievement={selected}
        onClose={() => setSelected(null)}
        onClaim={handleClaim}
        claimable={isOwnPage}
        claiming={selected ? claimingId === selected.id : false}
      />
    </div>
  );
}

function StatTile({ label, value, accent }) {
  return (
    <div
      style={{
        flex: '1 1 140px',
        minWidth: 140,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(15, 15, 35, 0.5)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#64748B',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent }}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ isOwnPage, hasUnlocks }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '60px 20px',
        color: '#64748B',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
      <p style={{ fontSize: 15, color: '#CBD5E1', margin: '0 0 6px' }}>
        {hasUnlocks ? 'No achievements in this category yet.' : 'No achievements unlocked yet.'}
      </p>
      {isOwnPage && (
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
          Share a build or comment on a post to start earning achievements.
        </p>
      )}
    </div>
  );
}
