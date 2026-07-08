import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { getToolDisplayName, parseToolString } from '../lib/appShared.js';
import BadgeSVG, { getBadgeForPoints } from './BadgeSVG.jsx';
import { BuilderRankBadge, UserBadge } from './sharedUI.jsx';
import { QuestionIcon, CommunityIcon } from './icons.jsx';

const formatPromptedAge = (dateString) => {
  if (!dateString) return 'New';
  const created = new Date(dateString);
  if (Number.isNaN(created.getTime())) return 'New';
  const ms = Date.now() - created.getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return 'Today';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
};

const UserProfileSidebarCard = ({ userId, builderRanks = [], onShowRanks, onCommunityClick, isOwnProfile = false, onEditProfile, onToolClick }) => {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ builds: 0, questionsAnswered: 0, followers: 0 });
  const [communities, setCommunities] = useState([]);
  const [topTools, setTopTools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, buildsRes, answersRes, followersRes, membershipsRes, toolPostsRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_question', false),
          // Top-level comments by this user on question posts. We dedupe by
          // post_id below so a user who left multiple answers on the same
          // question is only counted once.
          supabase
            .from('comments')
            .select('post_id, posts!inner(is_question)')
            .eq('user_id', userId)
            .is('parent_comment_id', null)
            .eq('posts.is_question', true),
          supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
          supabase.from('community_members').select('community_id').eq('user_id', userId),
          supabase.from('posts').select('ai_tool, tool_ids').eq('user_id', userId).eq('is_question', false),
        ]);

        if (cancelled) return;

        setProfile(profileRes.data || null);
        const answeredQuestionIds = new Set((answersRes.data || []).map(c => c.post_id));
        setStats({
          builds: buildsRes.count || 0,
          questionsAnswered: answeredQuestionIds.size,
          followers: followersRes.count || 0,
        });

        const toolCounts = new Map();
        (toolPostsRes.data || []).forEach(p => {
          const names = [];
          if (p.tool_ids && p.tool_ids.length > 0) {
            p.tool_ids.forEach(tid => {
              const name = getToolDisplayName(tid);
              if (name) names.push(name);
            });
          } else if (p.ai_tool) {
            parseToolString(p.ai_tool).forEach(name => names.push(name));
          }
          const seen = new Set();
          names.forEach(name => {
            const key = name.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            const entry = toolCounts.get(key);
            if (entry) entry.count += 1;
            else toolCounts.set(key, { name, count: 1 });
          });
        });
        const top3 = Array.from(toolCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);
        setTopTools(top3);

        const ids = (membershipsRes.data || []).map(m => m.community_id);
        if (ids.length > 0) {
          const { data: commsData } = await supabase
            .from('communities_with_stats')
            .select('id, name, slug, icon, icon_url, member_count, is_public')
            .in('id', ids)
            .eq('is_public', true)
            .order('member_count', { ascending: false })
            .limit(6);
          if (!cancelled) setCommunities(commsData || []);
        } else if (!cancelled) {
          setCommunities([]);
        }
      } catch (err) {
        console.error('UserProfileSidebarCard load error', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading || !profile) {
    return (
      <aside className="right-sidebar">
        <div className="sidebar-content sidebar-sticky">
          <div className="profile-card-sidebar">
            <div className="profile-card-skeleton" />
          </div>
        </div>
      </aside>
    );
  }

  const badge = getBadgeForPoints(profile.builder_points || 0);
  const ageLabel = formatPromptedAge(profile.created_at);

  const isSpacious = communities.length === 0;

  return (
    <aside className="right-sidebar">
      <div className="sidebar-content sidebar-sticky">
        <div className={`profile-card-sidebar${isSpacious ? ' profile-card-sidebar--spacious' : ''}`}>
          <div className="profile-card-name-block">
            <div
              className="profile-card-display-name"
              style={profile.name_color ? { color: profile.name_color } : undefined}
            >
              <span>{profile.display_name || profile.username}</span>
              <BuilderRankBadge points={profile.builder_points} ranks={builderRanks} onClick={onShowRanks} />
              <UserBadge username={profile.username} size={16} />
            </div>
            <div className="profile-card-username">@{profile.username}</div>
          </div>

          {isOwnProfile && onEditProfile && (
            <button
              type="button"
              className="profile-card-edit-btn"
              onClick={onEditProfile}
            >
              Settings
            </button>
          )}

          {profile.bio && <div className="profile-card-bio">{profile.bio}</div>}

          <div className="profile-card-stats-grid">
            <div className="profile-card-stat">
              <div className="profile-card-stat-value" title={profile.builder_points_display != null ? `Real score: ${(profile.builder_points || 0).toLocaleString()}` : undefined}>{(profile.builder_points_display ?? profile.builder_points ?? 0).toLocaleString()}</div>
              <div className="profile-card-stat-label">Builder Points</div>
            </div>
            <div className="profile-card-stat">
              <div className="profile-card-stat-value">{stats.builds.toLocaleString()}</div>
              <div className="profile-card-stat-label">{stats.builds === 1 ? 'Build' : 'Builds'}</div>
            </div>
            <div className="profile-card-stat">
              <div className="profile-card-stat-value">{ageLabel}</div>
              <div className="profile-card-stat-label">On Prompted</div>
            </div>
            <div className="profile-card-stat">
              <div className="profile-card-stat-value">{stats.followers.toLocaleString()}</div>
              <div className="profile-card-stat-label">{stats.followers === 1 ? 'Follower' : 'Followers'}</div>
            </div>
          </div>

          <div
            className="profile-card-rank"
            onClick={onShowRanks}
            style={{ cursor: onShowRanks ? 'pointer' : 'default' }}
            title={`${badge.name} - ${(profile.builder_points_display ?? profile.builder_points ?? 0).toLocaleString()} Builder Points`}
          >
            <span className="profile-card-rank-icon"><BadgeSVG badge={badge} size={48} /></span>
            <div className="profile-card-rank-info">
              <div className="profile-card-rank-label">Builder Rank</div>
              <div className="profile-card-rank-name" style={{ color: badge.color }}>{badge.name}</div>
            </div>
          </div>

          {topTools.length > 0 && (
            <div className="profile-card-section">
              <div className="profile-card-section-title">TOP AI TOOLS</div>
              <div className="profile-card-top-tools">
                {topTools.map((tool, idx) => {
                  const max = topTools[0].count || 1;
                  const pct = Math.max(18, Math.round((tool.count / max) * 100));
                  const clickable = typeof onToolClick === 'function';
                  return (
                    <div
                      key={tool.name}
                      className={`profile-card-top-tool rank-${idx + 1}${clickable ? ' profile-card-top-tool--clickable' : ''}`}
                      onClick={clickable ? () => onToolClick(tool.name) : undefined}
                      role={clickable ? 'button' : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToolClick(tool.name); } } : undefined}
                    >
                      <span className="profile-card-top-tool-rank">{idx + 1}</span>
                      <div className="profile-card-top-tool-body">
                        <div className="profile-card-top-tool-row">
                          <span className="profile-card-top-tool-name" title={tool.name}>{tool.name}</span>
                          <span className="profile-card-top-tool-count">{tool.count}</span>
                        </div>
                        <div className="profile-card-top-tool-bar">
                          <div className="profile-card-top-tool-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="profile-card-section">
            <div className="profile-card-section-title">ACTIVITY</div>
            <div className="profile-card-activity">
              <div className="profile-card-activity-item">
                <span className="profile-card-activity-icon"><QuestionIcon /></span>
                <span className="profile-card-activity-label">Questions Answered</span>
                <span className="profile-card-activity-value">{stats.questionsAnswered.toLocaleString()}</span>
              </div>
              <div className="profile-card-activity-item">
                <span className="profile-card-activity-icon"><CommunityIcon /></span>
                <span className="profile-card-activity-label">Communities</span>
                <span className="profile-card-activity-value">{communities.length}</span>
              </div>
            </div>
          </div>

          {communities.length > 0 && (
            <div className="profile-card-section">
              <div className="profile-card-section-title">COMMUNITIES</div>
              <div className="profile-card-communities">
                {communities.map(c => (
                  <div
                    key={c.id}
                    className="profile-card-community"
                    onClick={() => onCommunityClick && onCommunityClick(c)}
                  >
                    <span className="profile-card-community-icon">
                      {c.icon_url ? (
                        <img src={c.icon_url} alt="" />
                      ) : (
                        <span>{c.icon || '🌟'}</span>
                      )}
                    </span>
                    <div className="profile-card-community-info">
                      <div className="profile-card-community-name">{c.name}</div>
                      <div className="profile-card-community-meta">
                        {(c.member_count || 0).toLocaleString()} {c.member_count === 1 ? 'member' : 'members'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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

export default UserProfileSidebarCard;