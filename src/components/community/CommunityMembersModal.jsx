// Community members list modal — extracted verbatim from App.jsx during the
// community component split (July 2026). No behavior change.
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/appShared.js';
import { UserIcon } from '../icons.jsx';

const CommunityMembersModal = ({ isOpen, onClose, community, onViewUser, userFollows = [], onFollow }) => {
  const { user: currentUser } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen && community) {
      loadMembers();
    }
  }, [isOpen, community?.id]);

  const loadMembers = async () => {
    if (!community) return;
    setLoading(true);
    try {
      // Step 1: Get all community members
      const { data: membersData, error: membersError } = await supabase
        .from('community_members')
        .select('id, user_id, role, joined_at')
        .eq('community_id', community.id)
        .order('joined_at', { ascending: true });

      if (membersError) {
        console.error('Error loading members:', membersError);
        setMembers([]);
        setLoading(false);
        return;
      }

      if (!membersData || membersData.length === 0) {
        setMembers([]);
        setLoading(false);
        return;
      }

      // Step 2: Get profiles for all member user IDs
      const userIds = membersData.map(m => m.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_emoji, avatar_url, bio, builder_points')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error loading member profiles:', profilesError);
      }

      // Step 3: Combine the data
      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
      const combinedData = membersData.map(member => ({
        ...member,
        profiles: profilesMap.get(member.user_id) || null
      }));

      setMembers(combinedData);
    } catch (err) {
      console.error('Error loading members:', err);
      setMembers([]);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  // Separate members by role
  const owner = members.find(m => m.user_id === community.creator_id);
  const moderators = members.filter(m => m.role === 'moderator' && m.user_id !== community.creator_id);
  const regularMembers = members.filter(m => m.role !== 'moderator' && m.user_id !== community.creator_id);

  // Filter by search query
  const filterBySearch = (memberList) => {
    if (!searchQuery.trim()) return memberList;
    const query = searchQuery.toLowerCase();
    return memberList.filter(m => {
      const profile = m.profiles;
      return (
        profile?.username?.toLowerCase().includes(query) ||
        profile?.display_name?.toLowerCase().includes(query)
      );
    });
  };

  const filteredModerators = filterBySearch(moderators);
  const filteredRegularMembers = filterBySearch(regularMembers);
  const ownerMatchesSearch = !searchQuery.trim() || (owner && (
    owner.profiles?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    owner.profiles?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  ));

  const handleUserClick = (userId) => {
    onClose();
    if (onViewUser) {
      onViewUser(userId);
    }
  };

  const renderMemberItem = (member, badge = null) => {
    const profile = member.profiles;
    return (
      <div
        key={member.id}
        onClick={() => handleUserClick(member.user_id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-color)',
          cursor: 'pointer',
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0
        }}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : profile?.avatar_emoji ? (
            <span style={{ fontSize: '1.4rem' }}>{profile.avatar_emoji}</span>
          ) : (
            <UserIcon />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: '600', color: profile?.name_color || 'var(--text-primary)' }}>
              {profile?.display_name || profile?.username || 'Unknown'}
            </span>
            {badge}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            @{profile?.username || 'unknown'}
          </div>
          {profile?.bio && (
            <div style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              marginTop: '0.25rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {profile.bio}
            </div>
          )}
        </div>
        {currentUser && member.user_id !== currentUser.id && onFollow ? (
          userFollows.includes(member.user_id) ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFollow(member.user_id, true);
              }}
              onMouseEnter={(e) => { e.currentTarget.textContent = 'Unfollow'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444'; }}
              onMouseLeave={(e) => { e.currentTarget.textContent = 'Following'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
              style={{
                padding: '0.35rem 0.75rem',
                background: 'transparent',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 0.2s'
              }}
            >
              Following
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFollow(member.user_id, false);
              }}
              style={{
                padding: '0.35rem 0.75rem',
                background: '#000000',
                color: '#ffffff',
                border: '1px solid #000000',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              Follow
            </button>
          )
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
        )}
      </div>
    );
  };

  const ownerBadge = (
    <span style={{
      fontSize: '0.7rem',
      padding: '0.2rem 0.5rem',
      background: '#000000',
      color: '#ffffff',
      borderRadius: '12px',
      fontWeight: '600'
    }}>Owner</span>
  );

  const modBadge = (
    <span style={{
      fontSize: '0.7rem',
      padding: '0.15rem 0.4rem',
      background: 'var(--bg-tertiary)',
      color: 'var(--accent-primary)',
      borderRadius: '4px',
      fontWeight: '600',
      border: '1px solid var(--accent-primary)'
    }}>Mod</span>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Members</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '0 1rem 0.75rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            background: 'var(--bg-tertiary)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)'
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto', padding: '0' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="spinner"></div>
              <p>Loading members...</p>
            </div>
          ) : (
            <>
              {/* Owner Section */}
              {owner && ownerMatchesSearch && (
                <div>
                  <div style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--bg-secondary)',
                    fontWeight: '600',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border-color)'
                  }}>
                    Owner (1)
                  </div>
                  {renderMemberItem(owner, ownerBadge)}
                </div>
              )}

              {/* Moderators Section */}
              {filteredModerators.length > 0 && (
                <div>
                  <div style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--bg-secondary)',
                    fontWeight: '600',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border-color)'
                  }}>
                    Moderators ({moderators.length})
                  </div>
                  {filteredModerators.map(m => renderMemberItem(m, modBadge))}
                </div>
              )}

              {/* Regular Members Section */}
              {filteredRegularMembers.length > 0 && (
                <div>
                  <div style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--bg-secondary)',
                    fontWeight: '600',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border-color)'
                  }}>
                    Members ({regularMembers.length})
                  </div>
                  {filteredRegularMembers.map(m => renderMemberItem(m, null))}
                </div>
              )}

              {/* No results message */}
              {searchQuery && !ownerMatchesSearch && filteredModerators.length === 0 && filteredRegularMembers.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '2rem',
                  color: 'var(--text-muted)'
                }}>
                  <p>No members found matching "{searchQuery}"</p>
                </div>
              )}

              {/* Empty state */}
              {!searchQuery && members.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '2rem',
                  color: 'var(--text-muted)'
                }}>
                  <p>No members yet</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommunityMembersModal;
