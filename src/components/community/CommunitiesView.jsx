// Communities browse/discover view + single community view - extracted
// verbatim from App.jsx during the community component split (July 2026).
// No behavior change. ScrollableCommunityRow and CommunityCard are private
// helpers used only by this view.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useToast } from '../../lib/appShared.js';
import { RichText } from '../../lib/richText.jsx';
import { isVerifiedUser, PostGrid, SkillCard, useSkill } from '../sharedUI.jsx';
import { BackArrowIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, CommunityIcon, FireIcon, PlusIcon, SearchIcon, UsersIcon } from '../icons.jsx';
import CommunityHeader from './CommunityHeader.jsx';
const CommunityChannels = React.lazy(() => import('../CommunityChannels.jsx'));
import PostCard from '../post/PostCard.jsx';

// Scrollable Row Component for horizontal community card rows
const ScrollableCommunityRow = ({ children }) => {
  const scrollRef = useRef(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 10);
    setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll, children]);

  const scroll = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.75;
    el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  };

  return (
    <div className="communities-scroll-wrapper">
      <button
        className={`communities-scroll-arrow left ${!showLeft ? 'hidden' : ''}`}
        onClick={() => scroll('left')}
      >
        <ChevronLeftIcon />
      </button>
      <div className="communities-scroll-row" ref={scrollRef}>
        {children}
      </div>
      <button
        className={`communities-scroll-arrow right ${!showRight ? 'hidden' : ''}`}
        onClick={() => scroll('right')}
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
};

// Community Card Component
const CommunityCard = ({ community, isMember, onJoin, onLeave, onClick, onJoinWithCode }) => {
  const formatCount = (count) => {
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'k';
    }
    return count;
  };

  const handleJoinClick = (e) => {
    e.stopPropagation();
    if (isMember) {
      onLeave(community.id);
    } else if (community.is_private && onJoinWithCode) {
      onJoinWithCode(community);
    } else {
      onJoin(community.id);
    }
  };

  const coverImage = community.cover_image || community.header_url;
  const creatorName = community.creator_display_name || community.creator_username;

  return (
    <div className="community-card" onClick={() => onClick(community)}>
      <div className="community-card-cover">
        {coverImage && (
          <img src={coverImage} alt="" />
        )}
      </div>
      {community.is_private && (
        <span className="community-card-private-badge">Private</span>
      )}
      <div className="community-card-body">
        <div className="community-card-icon">
          {community.icon_url ? (
            <img src={community.icon_url} alt="" />
          ) : (
            <span className="community-card-icon-emoji">{community.icon || '🌟'}</span>
          )}
        </div>
        <div className="community-card-info">
          <div className="community-card-name">
            <span className="community-card-name-text">{community.name}</span>
            {community.is_paid && (
              <span className="community-card-price">
                ${Number(community.monthly_price_usd || 0).toFixed(0)}/mo
              </span>
            )}
          </div>
          {creatorName && (
            <div className="community-card-creator" title={`Created by ${creatorName}`}>
              <span className="community-card-creator-name">by {creatorName}</span>
            </div>
          )}
          <div className="community-card-description">
            {community.description
              ? <RichText text={community.description} />
              : 'A community for sharing and learning'}
          </div>
        </div>
        <div className="community-card-footer">
          <div className="community-card-stats">
            <span className="community-card-stat">
              <UsersIcon /> {formatCount(community.member_count || 0)}
            </span>
            <span className="community-card-stat">
              {formatCount(community.post_count || 0)} posts
            </span>
          </div>
          <button
            className={`btn-join-community ${isMember ? 'joined' : ''}`}
            onClick={handleJoinClick}
          >
            {isMember ? 'Joined' : community.is_paid ? 'Subscribe' : community.is_private ? 'Code' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Communities View Component
const CommunitiesView = ({
  user,
  communities,
  userCommunities,
  activeCommunity,
  communityPosts,
  communityPostSort,
  setCommunityPostSort,
  onJoinCommunity,
  onLeaveCommunity,
  onSelectCommunity,
  onBackToCommunities,
  onCreateCommunity,
  onPostToCommunity,
  onLike,
  userLikes,
  onCommentAdded,
  onUserClick,
  onSave,
  userSaves,
  onAuthRequired,
  loading,
  categories = [],
  onDeletePost,
  onDeleteCommunity,
  onJoinWithCode,
  onEditCommunity,
  communityRules = [],
  onRemovePostFromCommunity,
  onOpenFullPost = null,
  onQuestionClick = null,
  onAskQuestion = null,
  userFollows = [],
  onFollow,
  allPosts = [],
  forkedPostsMap = {},
  schoolsData = [],
  onSchoolClick = null,
  onToolClick = null,
  builderRanks = [],
  onPostCommunitiesChange = null,
  postCommunities = {},
  feedViewMode = 'list'
}) => {
  const { addToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [communitiesLayout, setCommunitiesLayout] = useState(() => {
    try { return localStorage.getItem('communitiesLayout') || 'rows'; } catch { return 'rows'; }
  });
  useEffect(() => { try { localStorage.setItem('communitiesLayout', communitiesLayout); } catch {} }, [communitiesLayout]);
  const [chipFilter, setChipFilter] = useState('all');     // chips layout active filter
  const [subnavFilter, setSubnavFilter] = useState('all'); // subnav layout active filter
  const [communityContentTab, setCommunityContentTab] = useState('channels'); // 'channels', 'builds', 'posts', 'questions', or 'skills'
  const [communitySkills, setCommunitySkills] = useState([]);
  const [communitySkillsLoading, setCommunitySkillsLoading] = useState(false);

  // Reset tab to channels when a new community is selected so user sees community header first
  useEffect(() => {
    if (activeCommunity) {
      setCommunityContentTab('channels');
    }
  }, [activeCommunity?.id]);

  useEffect(() => {
    if (!activeCommunity || communityContentTab !== 'skills') return;
    let cancelled = false;
    (async () => {
      setCommunitySkillsLoading(true);
      try {
        const { data, error } = await supabase
          .from('community_skills')
          .select('skill_id, created_at, skills(*)')
          .eq('community_id', activeCommunity.id)
          .order('created_at', { ascending: false });
        if (cancelled) return;
        if (error) {
          console.error('Error loading community skills:', error);
          setCommunitySkills([]);
        } else {
          setCommunitySkills((data || []).map(r => r.skills).filter(Boolean));
        }
      } finally {
        if (!cancelled) setCommunitySkillsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeCommunity?.id, communityContentTab]);

  // Filter communities based on search
  const filteredCommunities = communities.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Get autocomplete suggestions (all communities matching search)
  const allMatchingCommunities = [...communities, ...userCommunities.filter(uc => !communities.find(c => c.id === uc.id))];
  const autocompleteSuggestions = searchQuery.trim()
    ? allMatchingCommunities.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  const userCommunityIds = userCommunities.map(c => c.id);

  // If viewing a specific community
  if (activeCommunity) {
    const isMember = userCommunityIds.includes(activeCommunity.id);

    return (
      <div className={`community-view${communityContentTab !== 'channels' ? ' community-view-fullwidth' : ''}`}>
        <div className={communityContentTab !== 'channels' ? 'community-view-constrained' : undefined}>
          <button className="community-back-btn" onClick={onBackToCommunities}>
            <BackArrowIcon /> Back to Communities
          </button>

          <CommunityHeader
            community={activeCommunity}
            isMember={isMember}
            onJoin={() => user ? onJoinCommunity(activeCommunity.id) : onAuthRequired()}
            onLeave={() => onLeaveCommunity(activeCommunity.id)}
            onDelete={onDeleteCommunity}
            onJoinWithCode={onJoinWithCode}
            onEdit={onEditCommunity}
            rules={communityRules}
            onViewUser={onUserClick}
            userFollows={userFollows}
            onFollow={onFollow}
          />

          {/* Content Type Tabs - Channels, Builds, Posts, Questions */}
          <div className="community-content-tabs">
            <button
              className={`community-content-tab ${communityContentTab === 'channels' ? 'active' : ''}`}
              onClick={() => setCommunityContentTab('channels')}
            >
              Channels
            </button>
            <button
              className={`community-content-tab ${communityContentTab === 'builds' ? 'active' : ''}`}
              onClick={() => setCommunityContentTab('builds')}
            >
              Builds
            </button>
            <button
              className={`community-content-tab ${communityContentTab === 'posts' ? 'active' : ''}`}
              onClick={() => setCommunityContentTab('posts')}
            >
              Discussion
            </button>
            <button
              className={`community-content-tab ${communityContentTab === 'questions' ? 'active' : ''}`}
              onClick={() => setCommunityContentTab('questions')}
            >
              Questions
            </button>
            <button
              className={`community-content-tab ${communityContentTab === 'skills' ? 'active' : ''}`}
              onClick={() => setCommunityContentTab('skills')}
            >
              Skills
            </button>
          </div>
        </div>

        {/* Channels View */}              {communityContentTab === 'channels' && (
                <React.Suspense fallback={null}>
                  <CommunityChannels
            community={activeCommunity}
            user={user}
            isMember={isMember}                  onUserClick={onUserClick}
                  builderRanks={builderRanks}
                />
                </React.Suspense>
              )}

        {/* Skills View */}
        {communityContentTab === 'skills' && (
          <div className="community-view-constrained" style={{ marginTop: '1rem' }}>
            {communitySkillsLoading ? (
              <div className="loading-state"><div className="spinner"></div><p>Loading skills...</p></div>
            ) : communitySkills.length > 0 ? (
              <div className="skills-grid">
                {communitySkills.map(skill => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    isOwner={false}
                    onUse={(s) => useSkill(s, addToast)}
                    onDelete={null}
                    categories={categories}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                    <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
                  </svg>
                </div>
                <p className="empty-text">No skills in this community yet.</p>
              </div>
            )}
          </div>
        )}

        {/* Feed View (Builds, Posts, Questions) */}
        {communityContentTab !== 'channels' && communityContentTab !== 'skills' && (
          <>
            <div className="community-feed-controls community-view-constrained">
              <div className="community-sort-tabs">
                <button
                  className={`community-sort-tab ${communityPostSort === 'new' ? 'active' : ''}`}
                  onClick={() => setCommunityPostSort('new')}
                >
                  New <ClockIcon />
                </button>
                <button
                  className={`community-sort-tab ${communityPostSort === 'hot' ? 'active' : ''}`}
                  onClick={() => setCommunityPostSort('hot')}
                >
                  Hot <FireIcon />
                </button>
              </div>
              {isMember && (
                <button className="btn-post-to-community" onClick={onPostToCommunity}>
                  <PlusIcon /> New Post
                </button>
              )}
            </div>

            <div className="feed-container">
              {loading ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Loading posts...</p>
                </div>
              ) : (() => {
                // Filter posts based on active content tab
                const filteredPosts = communityContentTab === 'builds'
                  ? communityPosts.filter(p => !p.is_question && p.post_type !== 'post')
                  : communityContentTab === 'posts'
                  ? communityPosts.filter(p => p.post_type === 'post')
                  : communityPosts.filter(p => p.is_question);

                return filteredPosts.length > 0 ? (
                  feedViewMode === 'grid' ? (
                    <PostGrid posts={filteredPosts} onOpenFullPost={onOpenFullPost} />
                  ) : (
                  filteredPosts.map(post => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onLike={onLike}
                      userLikes={userLikes}
                      onCommentAdded={onCommentAdded}
                      onUserClick={onUserClick}
                      onSave={onSave}
                      userSaves={userSaves}
                      onAuthRequired={onAuthRequired}
                      categories={categories}
                      onDelete={onDeletePost}
                      communityCreatorId={activeCommunity?.creator_id}
                      onRemoveFromCommunity={onRemovePostFromCommunity}
                      onOpenFullPost={onOpenFullPost}
                      onQuestionClick={onQuestionClick}
                      onAskQuestion={onAskQuestion}
                      allPosts={allPosts}
                  forkedPostsMap={forkedPostsMap}
                      schoolsData={schoolsData}
              builderRanks={builderRanks}
                      onSchoolClick={onSchoolClick}
                      onToolClick={onToolClick}
                      userCommunities={userCommunities}
                      onPostCommunitiesChange={onPostCommunitiesChange}
                      postCommunities={postCommunities}
                      userCommunityIds={userCommunityIds}
                    />
                  ))
                  )
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">{communityContentTab === 'builds' ? '' : ''}</div>
                    <p className="empty-text">
                      {communityContentTab === 'builds'
                        ? 'No builds in this community yet.'
                        : communityContentTab === 'posts'
                        ? 'No posts in this community yet.'
                        : 'No questions in this community yet.'}
                    </p>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    );
  }

  // Paid Channels = every paid community (used to be the hand-picked
  // "Featured" list). Verified-only communities surface separately below.
  const paidChannels = communities.filter(c => c.is_paid);
  // Featured = communities owned by a verified creator (excluding paid,
  // which already get their own row above so we don't double-list them).
  // Past contest communities stay on the site but are hidden from Featured;
  // the active contest is pinned to the front.
  const PINNED_FEATURED_SLUG = 'july-1000-creator-of-the-month';
  const PAST_CONTEST_SLUGS = new Set([
    'june-1000-creator-of-the-month',
    'march-300-creator-of-the-month-giveaway',
    'february-250-creator-of-the-month-giveaway',
  ]);
  const featuredCommunities = communities
    .filter(c => !c.is_paid && isVerifiedUser(c.creator_username))
    .filter(c => !PAST_CONTEST_SLUGS.has(c.slug))
    .sort((a, b) => {
      if (a.slug === PINNED_FEATURED_SLUG) return -1;
      if (b.slug === PINNED_FEATURED_SLUG) return 1;
      return 0;
    });
  const featuredIds = new Set([...paidChannels, ...featuredCommunities].map(c => c.id));

  // Discover = communities user hasn't joined, excluding paid + featured
  const discoverCommunities = filteredCommunities
    .filter(c => !userCommunityIds.includes(c.id))
    .filter(c => !featuredIds.has(c.id));

  // If user is in every community, no discover or featured needed
  const allJoined = discoverCommunities.length === 0
    && paidChannels.every(c => userCommunityIds.includes(c.id))
    && featuredCommunities.every(c => userCommunityIds.includes(c.id));

  // Communities discovery view
  return (
    <div className="communities-tab">
      <div className="communities-header">
        <h1 className="communities-title">Communities</h1>
        <div className="communities-search" style={{ position: 'relative' }}>
          {searchFocused && searchQuery.trim() && autocompleteSuggestions.length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              marginBottom: '0.5rem',
              overflow: 'hidden',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
              zIndex: 100
            }}>
              {autocompleteSuggestions.map(community => (
                <div
                  key={community.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color)',
                    transition: 'background 0.15s'
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectCommunity(community);
                    setSearchQuery('');
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}>
                    {community.icon_url ? (
                      <img src={community.icon_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '1.2rem' }}>{community.icon || '🌟'}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{community.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {community.member_count || 0} members
                    </div>
                  </div>
                  {userCommunityIds.includes(community.id) && (
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '0.15rem 0.4rem',
                      background: 'var(--accent-primary)',
                      color: 'white',
                      borderRadius: '4px'
                    }}>Joined</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <span className="search-icon"><SearchIcon /></span>
          <input
            type="text"
            placeholder="Search communities..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
          />
        </div>
        <button className="btn-create-community" onClick={() => user ? onCreateCommunity() : onAuthRequired()}>
          <PlusIcon /> Create
        </button>
      </div>

      {/* Layout style switcher */}
      <div className="communities-layout-switch">
        {[
          { id: 'rows',   label: '☰ Rows' },
          { id: 'chips',  label: '⊞ Grid + Chips' },
          { id: 'subnav', label: '▤ Sidebar' },
        ].map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setCommunitiesLayout(opt.id)}
            className={`communities-layout-btn ${communitiesLayout === opt.id ? 'active' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* === LAYOUT: CHIPS === */}
      {communitiesLayout === 'chips' && !searchQuery && (
        <div className="communities-section">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {[
              { id: 'all',      label: 'All' },
              { id: 'joined',   label: 'Joined', count: userCommunities.length },
              { id: 'paid',     label: '💰 Paid', count: paidChannels.length },
              { id: 'featured', label: '⭐ Featured', count: featuredCommunities.length },
              { id: 'discover', label: 'Discover', count: discoverCommunities.length },
            ].map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChipFilter(c.id)}
                className={`communities-filter-chip ${chipFilter === c.id ? 'active' : ''}`}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.8rem' }}
              >
                {c.label}{c.count != null ? ` (${c.count})` : ''}
              </button>
            ))}
          </div>
          <div className="communities-grid">
            {(() => {
              let list = communities;
              if (chipFilter === 'joined') list = userCommunities;
              else if (chipFilter === 'paid') list = paidChannels;
              else if (chipFilter === 'featured') list = featuredCommunities;
              else if (chipFilter === 'discover') list = discoverCommunities;
              return list.map(community => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  isMember={userCommunityIds.includes(community.id)}
                  onJoin={() => user ? onJoinCommunity(community.id) : onAuthRequired()}
                  onLeave={onLeaveCommunity}
                  onClick={onSelectCommunity}
                  onJoinWithCode={onJoinWithCode}
                />
              ));
            })()}
          </div>
        </div>
      )}

      {/* === LAYOUT: SUBNAV === */}
      {communitiesLayout === 'subnav' && !searchQuery && (
        <div style={{ display: 'flex', gap: '1rem', padding: '0 1rem', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 140, flexShrink: 0 }}>
            {[
              { id: 'all',      label: 'All',         count: communities.length },
              { id: 'joined',   label: 'Joined',      count: userCommunities.length },
              { id: 'paid',     label: '💰 Paid',     count: paidChannels.length },
              { id: 'featured', label: '⭐ Featured', count: featuredCommunities.length },
              { id: 'discover', label: 'Discover',   count: discoverCommunities.length },
            ].map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSubnavFilter(c.id)}
                className={`communities-filter-chip ${subnavFilter === c.id ? 'active' : ''}`}
                style={{ justifyContent: 'space-between', display: 'flex', fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
              >
                <span>{c.label}</span>
                <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>{c.count}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="communities-grid">
              {(() => {
                let list = communities;
                if (subnavFilter === 'joined') list = userCommunities;
                else if (subnavFilter === 'paid') list = paidChannels;
                else if (subnavFilter === 'featured') list = featuredCommunities;
                else if (subnavFilter === 'discover') list = discoverCommunities;
                return list.map(community => (
                  <CommunityCard
                    key={community.id}
                    community={community}
                    isMember={userCommunityIds.includes(community.id)}
                    onJoin={() => user ? onJoinCommunity(community.id) : onAuthRequired()}
                    onLeave={onLeaveCommunity}
                    onClick={onSelectCommunity}
                    onJoinWithCode={onJoinWithCode}
                  />
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* === LAYOUT: ROWS (default - original 4-row design) === */}
      {communitiesLayout === 'rows' && !searchQuery && paidChannels.length > 0 && (
        <div className="communities-section">
          <h2 className="communities-section-title">Paid Channels</h2>
          <ScrollableCommunityRow>
            {paidChannels.map(community => (
              <CommunityCard
                key={community.id}
                community={community}
                isMember={userCommunityIds.includes(community.id)}
                onJoin={() => user ? onJoinCommunity(community.id) : onAuthRequired()}
                onLeave={onLeaveCommunity}
                onClick={onSelectCommunity}
                onJoinWithCode={onJoinWithCode}
              />
            ))}
          </ScrollableCommunityRow>
        </div>
      )}

      {/* Featured Communities - verified creators only */}
      {communitiesLayout === 'rows' && !searchQuery && featuredCommunities.length > 0 && (
        <div className="communities-section">
          <h2 className="communities-section-title">Featured Communities</h2>
          <ScrollableCommunityRow>
            {featuredCommunities.map(community => (
              <CommunityCard
                key={community.id}
                community={community}
                isMember={userCommunityIds.includes(community.id)}
                onJoin={() => user ? onJoinCommunity(community.id) : onAuthRequired()}
                onLeave={onLeaveCommunity}
                onClick={onSelectCommunity}
                onJoinWithCode={onJoinWithCode}
              />
            ))}
          </ScrollableCommunityRow>
        </div>
      )}

      {/* My Communities Section */}
      {communitiesLayout === 'rows' && user && userCommunities.length > 0 && (
        <div className="communities-section">
          <h2 className="communities-section-title">
            <span className="section-icon"><UsersIcon /></span>
            My Communities
          </h2>
          {allJoined ? (
            <div className="communities-grid">
              {userCommunities.map(community => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  isMember={true}
                  onJoin={onJoinCommunity}
                  onLeave={onLeaveCommunity}
                  onClick={onSelectCommunity}
                  onJoinWithCode={onJoinWithCode}
                />
              ))}
            </div>
          ) : (
            <ScrollableCommunityRow>
              {userCommunities.map(community => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  isMember={true}
                  onJoin={onJoinCommunity}
                  onLeave={onLeaveCommunity}
                  onClick={onSelectCommunity}
                  onJoinWithCode={onJoinWithCode}
                />
              ))}
            </ScrollableCommunityRow>
          )}
        </div>
      )}

      {/* Discover Communities Section - always shows for search; in non-search mode only on Rows layout */}
      {(searchQuery || (communitiesLayout === 'rows' && discoverCommunities.length > 0)) && (
        <div className="communities-section communities-section-discover">
          <h2 className="communities-section-title">
            <span className="section-icon"><SearchIcon /></span>
            {searchQuery ? 'Search Results' : 'Discover Communities'}
          </h2>
          {(searchQuery ? filteredCommunities.filter(c => !userCommunityIds.includes(c.id)) : discoverCommunities).length > 0 ? (
            <ScrollableCommunityRow>
              {(searchQuery
                ? filteredCommunities.filter(c => !userCommunityIds.includes(c.id))
                : discoverCommunities
              ).map(community => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  isMember={false}
                  onJoin={() => user ? onJoinCommunity(community.id) : onAuthRequired()}
                  onLeave={onLeaveCommunity}
                  onClick={onSelectCommunity}
                  onJoinWithCode={onJoinWithCode}
                />
              ))}
            </ScrollableCommunityRow>
          ) : (
            <div className="communities-empty">
              <div className="communities-empty-icon"><CommunityIcon /></div>
              <p className="communities-empty-text">
                {searchQuery ? 'No communities found matching your search.' : 'No communities to discover yet.'}
              </p>
              {!searchQuery && (
                <button className="btn btn-primary" onClick={() => user ? onCreateCommunity() : onAuthRequired()}>
                  Create the first one!
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state when no communities exist at all */}
      {!searchQuery && communities.length === 0 && userCommunities.length === 0 && (
        <div className="communities-empty">
          <div className="communities-empty-icon"><CommunityIcon /></div>
          <p className="communities-empty-text">No communities yet.</p>
          <button className="btn btn-primary" onClick={() => user ? onCreateCommunity() : onAuthRequired()}>
            Create the first one!
          </button>
        </div>
      )}
    </div>
  );
};


export default CommunitiesView;
