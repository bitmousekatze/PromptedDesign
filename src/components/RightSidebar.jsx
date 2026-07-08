import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HeartIcon, CommunityIcon, QuestionIcon, UsersIcon, UserIcon } from './icons.jsx';
import { RightSidebarSkeleton } from './SkeletonLoader.jsx';

const TrendingIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
    <polyline points="17 6 23 6 23 12"></polyline>
  </svg>
);
import { BuilderRankBadge, UserBadge } from './sharedUI.jsx';
import { SidebarAd } from './AdUnit.jsx';

// ============================================
// RIGHT SIDEBAR COMPONENT
// ============================================
const RightSidebar = ({ loading = false, topBuilds, topQuestions = [], topDiscussions = [], recommendedAccounts = [], onUserClick, onPostClick, onQuestionClick, onDiscussionClick, onExploreClick, categories, posts, allUsers, onCategoryClick, postCommunities = {}, userFollowedCategories = [], builderRanks = [], onFollowUser, currentUserFollows = [], currentUserId = null, communityMode = false, communityRandomPosts = [], onShuffleCommunityRandom = null, isAdmin = false, isPro = false }) => {
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const [sidebarSearchFocused, setSidebarSearchFocused] = useState(false);
  const [showMoreAccounts, setShowMoreAccounts] = useState(false);

  // Recommended Accounts cycling state.
  // Why: when the user hits "Follow" on a card, the followed account should
  // slide out and be replaced with the next un-shown user from the pool - so
  // the sidebar always offers fresh suggestions rather than a static list.
  // `displayedIds` is the ordered list of account IDs currently visible;
  // `slidingOutId` drives the slide-out CSS animation before swap-in.
  const [displayedIds, setDisplayedIds] = useState([]);
  const [slidingOutId, setSlidingOutId] = useState(null);

  // Seed / re-seed displayedIds whenever the underlying pool changes (e.g.
  // recommendations finish loading) or whenever the user expands "Show more".
  // We pick the first N IDs that the current user is NOT already following
  // and is NOT themselves - no point recommending people you already follow.
  // Track the in-flight follow target via a ref so the seeding effect can
  // see it synchronously and keep that card in displayedIds until our
  // slide-out animation finishes. Without this, the parent's optimistic
  // setUserFollows fires before our timeout, the seeding effect strips the
  // followed id from displayedIds *immediately*, the swap teleports with no
  // animation, and worse the slot can come back empty - which is the
  // "follow does nothing" symptom the user reported.
  const pendingFollowRef = useRef(null);

  useEffect(() => {
    const slotCount = showMoreAccounts ? 9 : 5;
    const pendingId = pendingFollowRef.current;
    const pool = recommendedAccounts.filter(a =>
      a.id !== currentUserId &&
      // Keep the currently-sliding-out account in the pool so it isn't
      // yanked from displayedIds the moment the optimistic follow lands.
      (a.id === pendingId || !currentUserFollows.includes(a.id))
    );
    setDisplayedIds(prev => {
      const kept = prev.filter(id => pool.some(p => p.id === id));
      const need = slotCount - kept.length;
      if (need <= 0) return kept.slice(0, slotCount);
      const taken = new Set(kept);
      const fillers = pool.filter(p => !taken.has(p.id)).slice(0, need).map(p => p.id);
      return [...kept, ...fillers];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendedAccounts, showMoreAccounts, currentUserFollows, currentUserId]);

  // Handle Follow click: trigger the real follow mutation, animate slide-out,
  // then replace the followed slot with the next unused pool entry.
  const handleFollowClick = (account) => {
    if (!onFollowUser) return;
    const isFollowing = currentUserFollows.includes(account.id);
    if (isFollowing) {
      onFollowUser(account.id, true); // unfollow path: just trigger DB write
      return;
    }
    // Mark this id as pending BEFORE calling onFollowUser so the seeding
    // effect (which fires synchronously on parent state update) keeps it.
    pendingFollowRef.current = account.id;
    setSlidingOutId(account.id);
    onFollowUser(account.id, false); // real DB write via parent
    setTimeout(() => {
      setDisplayedIds(prev => {
        const used = new Set(prev);
        const next = recommendedAccounts.find(a =>
          a.id !== currentUserId &&
          a.id !== account.id &&
          !currentUserFollows.includes(a.id) &&
          !used.has(a.id)
        );
        if (!next) return prev.filter(id => id !== account.id);
        return prev.map(id => (id === account.id ? next.id : id));
      });
      setSlidingOutId(null);
      pendingFollowRef.current = null;
    }, 280); // matches the .follow-card slide-out transition duration
  };

  const getSidebarSearchSuggestions = () => {
    if (!sidebarSearchQuery.trim()) return { categories: [], users: [] };

    const query = sidebarSearchQuery.toLowerCase().trim();

    // Search categories
    const matchingCategories = (categories || []).filter(cat =>
      cat.name.toLowerCase().includes(query)
    ).slice(0, 3);

    // Search all users from profiles (not just those with posts)
    const matchingUsers = (allUsers || []).filter(u =>
      u.username?.toLowerCase().includes(query) ||
      u.display_name?.toLowerCase().includes(query)
    ).slice(0, 3);

    return { categories: matchingCategories, users: matchingUsers };
  };

  // ── Sticky‑bottom sidebar via JS ──────────────────────────────────
  // When the user scrolls past the bottom of the sidebar content, pin
  // it to the viewport bottom so it travels with the page. Pure CSS
  // position:sticky;bottom fails in this layout due to nested flex
  // containers, so we do it directly in JS - clean, reliable, zero hacks.
  const sidebarContentRef = useRef(null);
  const sidebarAsideRef = useRef(null);
  // Cache the content's natural (non-fixed) height so we don't re-measure
  // while position:fixed is active (which would give wrong numbers).
  const naturalHeightRef = useRef(0);

  useEffect(() => {
    const content = sidebarContentRef.current;
    const aside = sidebarAsideRef.current;
    if (!content || !aside) return;

    const mql = window.matchMedia('(min-width: 1200px)');
    let ticking = false;
    let isFixed = false;

    // Measure the content's natural height (with position reset to static).
    const measureNaturalHeight = () => {
      if (isFixed) {
        // Temporarily unfix to get the real height
        content.style.position = '';
        content.style.top = '';
        content.style.bottom = '';
        content.style.left = '';
        content.style.width = '';
      }
      naturalHeightRef.current = content.offsetHeight;
    };

    // Initial measurement
    measureNaturalHeight();

    const update = () => {
      if (!mql.matches) {
        // Mobile - reset everything
        content.style.position = '';
        content.style.top = '';
        content.style.bottom = '';
        content.style.left = '';
        content.style.width = '';
        isFixed = false;
        return;
      }

      const contentH = naturalHeightRef.current;
      const viewportH = window.innerHeight;
      const scrollY = window.scrollY;

      // The aside container's position in the document.
      // When content is fixed, aside still occupies its natural space
      // (because aside has align-self:stretch and its height comes from
      // the flex container, not from content).
      const asideRect = aside.getBoundingClientRect();
      const asideTopInDoc = asideRect.top + scrollY;

      const compStyle = window.getComputedStyle(aside);
      const paddingLeft = parseFloat(compStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(compStyle.paddingRight) || 0;
      const targetLeft = asideRect.left + paddingLeft;
      const targetWidth = asideRect.width - paddingLeft - paddingRight;

      // Where the sidebar content's bottom would be in natural flow
      const naturalBottom = asideTopInDoc + contentH;

      // Current viewport bottom edge in document coordinates
      const viewportBottom = scrollY + viewportH;

      if (contentH <= viewportH) {
        // Sidebar fits in viewport - fix to top
        content.style.position = 'fixed';
        content.style.top = '20px';
        content.style.bottom = '';
        content.style.left = targetLeft + 'px';
        content.style.width = targetWidth + 'px';
        isFixed = true;
      } else if (viewportBottom >= naturalBottom) {
        // Scrolled past sidebar bottom - fix to viewport bottom
        content.style.position = 'fixed';
        content.style.top = '';
        content.style.bottom = '20px';
        content.style.left = targetLeft + 'px';
        content.style.width = targetWidth + 'px';
        isFixed = true;
      } else {
        // Still scrolling through sidebar content - natural flow
        content.style.position = '';
        content.style.top = '';
        content.style.bottom = '';
        content.style.left = '';
        content.style.width = '';
        isFixed = false;
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    };

    const onResize = () => {
      measureNaturalHeight();
      update();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    mql.addEventListener('change', onResize);

    // Re-measure after a tick to ensure the DOM has settled
    requestAnimationFrame(() => {
      measureNaturalHeight();
      update();
    });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      mql.removeEventListener('change', onResize);
      // Clean up styles on unmount
      content.style.position = '';
      content.style.top = '';
      content.style.bottom = '';
      content.style.left = '';
      content.style.width = '';
    };
  }, [loading]);

  // Show skeleton while parent is still fetching feed data so we never
  // flash empty-state text ("No builds yet", etc.) at the user.
  if (loading) {
    return <RightSidebarSkeleton />;
  }

  const sidebarSuggestions = getSidebarSearchSuggestions();

  return (
    <aside className="right-sidebar" ref={sidebarAsideRef}>
      <div className="sidebar-content sidebar-sticky" ref={sidebarContentRef}>
        {/* Search Bar */}
        <div className="sidebar-search" style={{ position: 'relative', marginBottom: '1rem', padding: '0 4px' }}>
          <div className="sidebar-search-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)', display: 'flex' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </span>
            <input
              type="text"
              placeholder="Search..."
              value={sidebarSearchQuery}
              onChange={(e) => setSidebarSearchQuery(e.target.value)}
              onFocus={() => setSidebarSearchFocused(true)}
              onBlur={() => setTimeout(() => setSidebarSearchFocused(false), 200)}
              style={{
                width: '100%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '50px',
                padding: '0.65rem 1rem 0.65rem 2.2rem',
                color: 'var(--text-primary)',
                fontSize: '0.95rem',
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocusCapture={(e) => {
                e.target.style.background = 'transparent';
                e.target.style.borderColor = 'var(--accent-primary)';
              }}
              onBlurCapture={(e) => {
                e.target.style.background = 'var(--bg-tertiary)';
                e.target.style.borderColor = 'var(--border-color)';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && sidebarSearchQuery.trim()) {
                  if (onExploreClick) {
                    onExploreClick();
                    window.dispatchEvent(new CustomEvent('prmpted:search', { detail: sidebarSearchQuery.trim() }));
                  }
                  setSidebarSearchQuery('');
                  setSidebarSearchFocused(false);
                }
              }}
            />
          </div>
          {sidebarSearchFocused && (sidebarSuggestions.categories.length > 0 || sidebarSuggestions.users.length > 0) && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '8px',
              background: 'var(--bg-card)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
              zIndex: 100,
              overflow: 'hidden'
            }}>
              {sidebarSuggestions.categories.length > 0 && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ padding: '0 12px 4px', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Categories</div>
                  {sidebarSuggestions.categories.map(cat => (
                    <div
                      key={cat.id}
                      onClick={() => {
                        if (onCategoryClick) onCategoryClick(cat.id);
                        setSidebarSearchQuery('');
                      }}
                      style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontSize: '1rem' }}>{cat.icon || '#'}</span>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{cat.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {sidebarSuggestions.users.length > 0 && (
                <div style={{ padding: '8px 0', borderTop: sidebarSuggestions.categories.length > 0 ? '1px solid var(--border-color)' : 'none' }}>
                  <div style={{ padding: '0 12px 4px', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Users</div>
                  {sidebarSuggestions.users.map(u => (
                    <div
                      key={u.id}
                      onClick={() => {
                        if (onUserClick) onUserClick(u.id);
                        setSidebarSearchQuery('');
                      }}
                      style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-tertiary)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {u.avatar_url ? <img src={u.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 
                         u.avatar_emoji ? <span style={{ fontSize: '0.8rem' }}>{u.avatar_emoji}</span> : 
                         <UserIcon size={14} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.9rem', color: u.name_color || 'var(--text-primary)', fontWeight: 600 }}>{u.display_name || u.username}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{u.username}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top Builds of the Day */}
        <div className="sidebar-section">
          <h3 className="sidebar-title">Builds of the Day</h3>
          {topBuilds.length > 0 ? (
            topBuilds.map((post, index) => {
              const communities = postCommunities[post.id] || [];
              return (
                <div
                  key={post.id}
                  className="mini-post-card"
                  onClick={() => onPostClick && onPostClick(post.id, post.user_id)}
                >
                  {/* Rank number removed per design: the section heading
                      "Builds of the Day" plus visual ordering already conveys
                      ranking - leading digits made cards feel like a list
                      rather than a feed, and were inconsistent with the
                      Discussions/Questions sections which never showed them. */}
                  <div className="mini-post-content">
                    <div className="mini-post-title">{post.title}</div>
                    <div className="mini-post-meta">
                      <span
                        className="mini-post-author"
                        style={post.name_color ? { color: post.name_color } : {}}
                        onClick={(e) => { e.stopPropagation(); onUserClick && onUserClick(post.user_id); }}
                        title={`View @${post.username}'s profile`}
                      >
                        {post.display_name || post.username}
                        <BuilderRankBadge points={post.builder_points} ranks={builderRanks} />
                        <UserBadge username={post.username} size={16} />
                      </span>
                      <span className="mini-post-likes">
                        <HeartIcon filled={false} />
                        {post.likes_count}
                      </span>
                    </div>
                    <div className="mini-post-badges">
                      {(() => {
                        // Get post categories - prefer category_ids array, fall back to single category_id
                        const postCategoryIds = post.category_ids && post.category_ids.length > 0
                          ? post.category_ids
                          : (post.category_id ? [post.category_id] : []);

                        // Look up full category objects
                        const postCategories = postCategoryIds
                          .map(catId => categories.find(c => c.id === catId))
                          .filter(Boolean);

                        // Sort to prefer followed categories first
                        const sortedCategories = [...postCategories].sort((a, b) => {
                          const aFollowed = userFollowedCategories.includes(a.id);
                          const bFollowed = userFollowedCategories.includes(b.id);
                          if (aFollowed && !bFollowed) return -1;
                          if (!aFollowed && bFollowed) return 1;
                          return 0;
                        });

                        // Show top 2 categories
                        const displayCategories = sortedCategories.slice(0, 2);

                        return displayCategories.length > 0 ? (
                          displayCategories.map(cat => {
                            return (
                              <span
                                key={cat.id}
                                className="mini-post-category"
                                style={{
                                  background: 'rgba(255, 255, 255, 0.1)',
                                  color: '#ffffff'
                                }}
                              >
                                {cat.name}
                              </span>
                            );
                          })
                        ) : (post.category_name && post.category_name !== '-' && post.category_name.trim() !== '') ? (
                          <span
                            className="mini-post-category"
                            style={{
                              background: 'rgba(255, 255, 255, 0.1)',
                              color: '#ffffff'
                            }}
                          >
                            {post.category_name}
                          </span>
                        ) : null;
                      })()}
                      {communities.length > 0 && (
                        <span
                          className="mini-post-community"
                          style={{
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                            fontSize: '0.7rem',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            marginLeft: '0.25rem'
                          }}
                        >
                          <CommunityIcon style={{ width: '10px', height: '10px' }} />
                          {communities[0].name}
                        </span>
                      )}
                    </div>
                    {/* Hover-expand preview: shows a short snippet of the post's
                        description on hover so users can scan the sidebar without
                        clicking through. Truncated to 200 chars to keep the
                        sidebar card compact. Falls back through description /
                        prompt / body so the snippet shows whichever field the
                        post happens to store its content in. */}
                    {(() => {
                      // Strip HTML tags before rendering - some posts store
                      // their description as rich-text HTML (<p>, <br>, etc.).
                      // Rendering that raw shows literal tags to the user, so
                      // we flatten to plain text first and collapse whitespace.
                      const raw = post.description || post.prompt || post.body || '';
                      const body = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                      if (!body) return null;
                      return (
                        <div className="mini-post-desc">
                          {body.length > 200 ? `${body.slice(0, 200)}...` : body}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="sidebar-empty">
              <div className="sidebar-empty-icon"><TrendingIcon /></div>
              <p>No builds yet</p>
            </div>
          )}
        </div>

        {/* Discussions of the Day
            Why: gives discussion-type posts a dedicated surface in the right
            sidebar, sandwiched between Builds (above) and Questions (below)
            so the three content pillars of the platform are all represented.
            Hidden entirely when there are no discussions yet to avoid an
            awkward empty section on a fresh feed. No rank numbers - the
            section title plus visual ordering is enough; rank digits add
            noise without information. */}
        {topDiscussions.length > 0 && (
          <div className="sidebar-section">
            <h3 className="sidebar-title">Discussions of the Day</h3>
            {topDiscussions.map((discussion) => (
              <div
                key={discussion.id}
                className="mini-post-card mini-discussion-card"
                onClick={() => onDiscussionClick && onDiscussionClick(discussion.id, discussion.user_id)}
              >
                <div className="mini-post-content">
                  <div className="mini-post-title">{discussion.title}</div>
                  <div className="mini-post-meta">
                    <span
                      className="mini-post-author"
                      style={discussion.name_color ? { color: discussion.name_color } : {}}
                      onClick={(e) => { e.stopPropagation(); onUserClick && onUserClick(discussion.user_id); }}
                      title={`View @${discussion.username}'s profile`}
                    >
                      {discussion.display_name || discussion.username}
                      <BuilderRankBadge points={discussion.builder_points} ranks={builderRanks} />
                      <UserBadge username={discussion.username} size={16} />
                    </span>
                    <span className="mini-post-comments">
                      💬 {discussion.comments_count || 0}
                    </span>
                  </div>
                  {/* Hover-preview snippet - see .mini-post-desc CSS. Same
                      pattern repeated on Builds and Questions cards so all
                      three card types behave consistently on hover. */}
                  {/* Hover-preview - falls back through description/prompt/body
                      so cards always have something to reveal on hover. */}
                  {(() => {
                    // Strip HTML tags so rich-text bodies render as plain text
                    // in the hover preview (avoids showing literal <p>/<br>).
                    const raw = discussion.description || discussion.prompt || discussion.body || '';
                    const body = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    if (!body) return null;
                    return (
                      <div className="mini-post-desc">
                        {body.length > 200 ? `${body.slice(0, 200)}...` : body}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Questions of the Day */}
        <div className="sidebar-section">
          <h3 className="sidebar-title">Questions of the Day</h3>
          {topQuestions.length > 0 ? (
            topQuestions.map((question, index) => (
              <div
                key={question.id}
                className="mini-post-card mini-question-card"
                onClick={() => onQuestionClick && onQuestionClick(question.id, question.user_id)}
              >
                {/* Question icon removed by design - the section heading
                    "Questions of the Day" plus the white left border on the
                    card is enough context; the leading glyph was redundant
                    and made these cards look heavier than Builds/Discussions. */}
                <div className="mini-post-content">
                  <div className="mini-post-title">{question.title}</div>
                  <div className="mini-post-meta">
                    <span
                      className="mini-post-author"
                      style={question.name_color ? { color: question.name_color } : {}}
                      onClick={(e) => { e.stopPropagation(); onUserClick && onUserClick(question.user_id); }}
                      title={`View @${question.username}'s profile`}
                    >
                      {question.display_name || question.username}
                      <BuilderRankBadge points={question.builder_points} ranks={builderRanks} />
                      <UserBadge username={question.username} size={16} />
                    </span>
                    <span className="mini-post-comments" style={{ color: '#ffffff' }}>
                      {question.comments_count || 0} answers
                    </span>
                  </div>
                  {/* Hover-preview snippet for questions.
                      Why fall through multiple fields: questions on Prompted
                      can store their body in several places depending on how
                      they were authored - `description` (rich-text body),
                      `prompt` (when the question itself reads like a prompt),
                      or `body` (legacy). We use whichever is populated so the
                      hover-expand actually has something to show on most
                      cards, not just the few with a description. */}
                  {(() => {
                    // Strip HTML so rich-text question bodies show as plain
                    // text in the hover preview rather than literal tags.
                    const raw = question.description || question.prompt || question.body || '';
                    const body = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    if (!body) return null;
                    return (
                      <div className="mini-post-desc">
                        {body.length > 200 ? `${body.slice(0, 200)}...` : body}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))
          ) : (
            <div className="sidebar-empty">
              <div className="sidebar-empty-icon"><QuestionIcon /></div>
              <p>No questions yet</p>
            </div>
          )}
        </div>

        {communityMode && (
          <div className="sidebar-section">
            <h3 className="sidebar-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Random Posts</span>
              <button
                type="button"
                onClick={() => onShuffleCommunityRandom && onShuffleCommunityRandom()}
                title="Shuffle"
                aria-label="Shuffle random posts"
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 8, padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                🔀
              </button>
            </h3>
            {communityRandomPosts.length > 0 ? (
              communityRandomPosts.map(post => (
                <div
                  key={post.id}
                  className="mini-post-card"
                  onClick={() => {
                    if (post.is_question) onQuestionClick && onQuestionClick(post.id, post.user_id);
                    else if (post.post_type === 'post') onDiscussionClick && onDiscussionClick(post.id, post.user_id);
                    else onPostClick && onPostClick(post.id, post.user_id);
                  }}
                >
                  <div className="mini-post-content">
                    <div className="mini-post-title">{post.title}</div>
                    <div className="mini-post-meta">
                      <span
                        className="mini-post-author"
                        style={post.name_color ? { color: post.name_color } : {}}
                        onClick={(e) => { e.stopPropagation(); onUserClick && onUserClick(post.user_id); }}
                        title={`View @${post.username}'s profile`}
                      >
                        {post.display_name || post.username}
                        <BuilderRankBadge points={post.builder_points} ranks={builderRanks} />
                        <UserBadge username={post.username} size={16} />
                      </span>
                      <span className="mini-post-comments">💬 {post.comments_count || 0}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="sidebar-empty"><p>No community posts yet</p></div>
            )}
          </div>
        )}

        {/* Recommended Accounts - hidden in community sidebar mode */}
        {!communityMode && (
        <div className="sidebar-section">
          <h3 className="sidebar-title">Recommended Accounts</h3>
          {recommendedAccounts.length > 0 ? (
            <>
              {/* Render the cycled `displayedIds` list rather than slicing
                  recommendedAccounts directly - this lets us swap individual
                  slots in/out as the user follows people, instead of
                  reflowing the whole list. */}
              {displayedIds.map(id => recommendedAccounts.find(a => a.id === id)).filter(Boolean).map(account => (
                <div
                  key={account.id}
                  className={`follow-card ${slidingOutId === account.id ? 'follow-card-out' : ''}`}
                  onClick={() => onUserClick && onUserClick(account.id)}
                >
                  <div className="follow-avatar">
                    {account.avatar_url ? (
                      <img src={account.avatar_url} alt="" />
                    ) : account.avatar_emoji ? (
                      <span>{account.avatar_emoji}</span>
                    ) : (
                      <UserIcon />
                    )}
                  </div>
                  <div className="follow-info">
                    <div
                      className="follow-name"
                      style={account.name_color ? { color: account.name_color } : {}}
                    >
                      {account.display_name || account.username}
                      <BuilderRankBadge points={account.builder_points} ranks={builderRanks} />
                      <UserBadge username={account.username} size={16} />
                    </div>
                    <div className="follow-username">@{account.username}</div>
                    {account.interests && (
                      <div className="follow-interests">{account.interests}</div>
                    )}
                  </div>
                  {/* Replaced the old "View" button with a real Follow button.
                      Why: a "View" CTA next to a recommendation is a weak ask
                      - the user can already click the card to view the profile.
                      A Follow button drives the actual social action this
                      section is for. After follow, the card slides out and is
                      replaced by the next unused recommendation from the pool. */}
                  <button
                    className={`follow-btn ${currentUserFollows.includes(account.id) ? 'follow-btn-following' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFollowClick(account);
                    }}
                  >
                    {currentUserFollows.includes(account.id) ? 'Following' : 'Follow'}
                  </button>
                </div>
              ))}
              {!showMoreAccounts && recommendedAccounts.length > 5 && (
                <button
                  className="sidebar-show-more-btn"
                  onClick={() => setShowMoreAccounts(true)}
                >
                  Show More Accounts
                </button>
              )}
            </>
          ) : (
            <div className="sidebar-empty">
              <div className="sidebar-empty-icon"><UsersIcon /></div>
              <p>No recommendations yet</p>
            </div>
          )}
        </div>
        )}

        <SidebarAd isAdmin={isAdmin} isPro={isPro} />

        <div className="sidebar-footer">
          <a href="/privacypolicy">Privacy Policy</a>
          <span className="sidebar-footer-sep">·</span>
          <a href="/termsandconditions">Terms of Service</a>
          <span className="sidebar-footer-copy">© 2026 Prompted</span>
        </div>

      </div>
    </aside>
  );
};

export default RightSidebar;