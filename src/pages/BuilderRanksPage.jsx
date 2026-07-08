import { useState, useEffect } from 'react';
import { BadgeSVG, getBadgeForPoints, getAllBadgeTiers } from '../components/BadgeSVG';
import BuilderRankAchievementsSection from '../components/achievements/BuilderRankAchievementsSection.jsx';

export default function BuilderRanksPage({ currentUser, onShowAchievements }) {
  const [hoveredTier, setHoveredTier] = useState(null);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 768
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const tiers = getAllBadgeTiers();

  const userPoints = currentUser?.builder_points || 0;
  const userBadge = getBadgeForPoints(userPoints);
  const currentTierIndex = tiers.findIndex(t => t.name === userBadge.name);

  const currentThreshold = tiers[currentTierIndex]?.minPoints || 0;
  const nextThreshold = tiers[currentTierIndex]?.nextThreshold;
  const progressPercent = nextThreshold
    ? ((userPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100
    : 100;

  return (
    <div style={{
      minHeight: '100vh',
      padding: '40px 20px 80px',
      maxWidth: '900px',
      margin: '0 auto',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 700,
          color: '#F1F5F9',
          margin: '0 0 8px',
        }}>
          Builder Rank
        </h1>
        <p style={{
          fontSize: '15px',
          color: '#FFE81F',
          margin: 0,
          maxWidth: '500px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          Earn Builder Points by sharing builds, getting likes, and helping others.
          Start climbing the ranks, the race to Legend has begun!
        </p>
      </div>

      {currentUser && (
        <div style={{
          background: 'transparent',
          border: 'none',
          borderRadius: '0',
          padding: '0 0 24px',
          marginBottom: '40px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap',
        }}>
          <BadgeSVG badge={userBadge} size={56} />
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#F1F5F9' }}>
                {userBadge.name}
              </span>
              <span style={{ fontSize: '13px', color: '#64748B' }}>
                {userPoints.toLocaleString()} points
              </span>
            </div>
            {nextThreshold ? (
              <>
                <div style={{
                  width: '100%',
                  height: '6px',
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  marginBottom: '4px',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(progressPercent, 100)}%`,
                    background: `linear-gradient(90deg, ${userBadge.color}, ${userBadge.accent})`,
                    borderRadius: '3px',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  {(nextThreshold - userPoints).toLocaleString()} points to{' '}
                  <span style={{ color: tiers[currentTierIndex + 1]?.color }}>
                    {tiers[currentTierIndex + 1]?.name}
                  </span>
                </span>
              </>
            ) : (
              <span style={{ fontSize: '12px', color: userBadge.color }}>
                Maximum rank achieved!
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: isDesktop
          ? 'repeat(4, 1fr)'
          : 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '16px',
      }}>
        {tiers.map((tier, i) => {
          const isCurrentRank = tier.name === userBadge.name;
          const isUnlocked = currentUser && userPoints >= tier.minPoints;
          const isLegendRow = isDesktop && tier.name === 'Legend';

          return (
            <div
              key={tier.name}
              onMouseEnter={() => setHoveredTier(i)}
              onMouseLeave={() => setHoveredTier(null)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: isLegendRow ? '16px' : '10px',
                padding: isLegendRow ? '36px 24px' : '20px 12px',
                borderRadius: '14px',
                background: isCurrentRank
                  ? `${tier.color}10`
                  : 'rgba(15, 15, 35, 0.4)',
                border: isCurrentRank
                  ? `1px solid ${tier.color}40`
                  : '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                transform: hoveredTier === i ? 'translateY(-4px) scale(1.03)' : 'none',
                opacity: currentUser && !isUnlocked ? 0.5 : 1,
                position: 'relative',
                gridColumn: isLegendRow ? '1 / -1' : 'auto',
              }}
            >
              {isCurrentRank && (
                <div style={{
                  position: 'absolute',
                  top: '-8px',
                  background: tier.color,
                  color: '#000',
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}>
                  Your Rank
                </div>
              )}

              <BadgeSVG badge={tier} size={isLegendRow ? 112 : 56} />

              <span style={{
                fontSize: isLegendRow ? '18px' : '11px',
                fontWeight: 600,
                color: tier.color,
                letterSpacing: isLegendRow ? '2px' : '1px',
                textTransform: 'uppercase',
                textAlign: 'center',
              }}>
                {tier.name}
              </span>

              <span style={{
                fontSize: isLegendRow ? '14px' : '11px',
                color: '#64748B',
              }}>
                {tier.minPoints.toLocaleString()}+ pts
              </span>
            </div>
          );
        })}
      </div>

      {currentUser && (
        <BuilderRankAchievementsSection
          userId={currentUser.id}
          onViewAll={() => onShowAchievements && onShowAchievements()}
        />
      )}

      <div style={{
        marginTop: '48px',
        padding: '0 4px',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#F1F5F9', margin: '0 0 16px' }}>
          How to Earn Builder Points
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '12px',
        }}>
          {[
            { action: 'Share a Build', points: '+10' },
            { action: 'Your build gets liked', points: '+2' },
            { action: 'Answer a question', points: '+3' },
          ].map((item) => (
            <div key={item.action} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 0',
            }}>
              <div>
                <div style={{ fontSize: '13px', color: '#E2E8F0' }}>{item.action}</div>
                <div style={{ fontSize: '12px', color: '#4ADE80', fontWeight: 600 }}>{item.points}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
