// User profile view (posts/questions/skills tabs, follow, badges) — extracted
// verbatim from App.jsx during the profile component split (July 2026).
// No behavior change. ProfileMessageButton and AddSkillModal are private
// helpers used only by this view.
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { useToast, ensureAbsoluteUrl, getRankForPoints, getNextRank, getToolDisplayName } from '../lib/appShared.js';
import { toPlainText } from '../lib/sanitize.js';
import { getUserWorkflows } from '../lib/workflows.js';
import { isVideoBannerUrl } from '../lib/storage.js';
import { UserBadge, BuilderRankBadge, PostGrid, SKILL_TYPE_META, SkillCard, useSkill, ProfileShareButton } from './sharedUI.jsx';
import { ArrowLeftIcon, InboxIcon, MessageIcon, UserIcon, XIcon } from './icons.jsx';
import BadgeSVG, { getBadgeForPoints } from './BadgeSVG.jsx';
import CommunitySelector from './CommunitySelector.jsx';
import { ProfileIconBadges, IconCollectionModal } from './IconBadges.jsx';
import ProfileChannels from './ProfileChannels.jsx';
import WorkflowCard from './WorkflowCard.jsx';
import PostCard from './post/PostCard.jsx';
import AccountDeletionModal from './AccountDeletionModal.jsx';
import { adminDeleteUser } from '../lib/accountDeletion.js';

// ============================================
// PROFILE MESSAGE BUTTON — opens (or creates) a 1-on-1 DM with the user
// whose profile is being viewed, then navigates to Messages with the
// conversation active.
// ============================================
const ProfileMessageButton = ({ targetUserId, currentUserId, onAuthRequired, onOpenMessages }) => {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!targetUserId || (currentUserId && targetUserId === currentUserId)) return null;

  const handleClick = async () => {
    if (busy) return;
    if (!currentUserId) { if (onAuthRequired) onAuthRequired(); return; }
    setBusy(true);
    try {
      const { data: mine, error: mineErr } = await supabase
        .from('conversation_participants')
        .select('conversation_id, conversations!inner(is_group)')
        .eq('user_id', currentUserId);
      if (mineErr) throw mineErr;
      const myConvIds = (mine || [])
        .filter(r => r.conversations && !r.conversations.is_group)
        .map(r => r.conversation_id);
      let convId = null;
      if (myConvIds.length > 0) {
        const { data: shared, error: sharedErr } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .in('conversation_id', myConvIds)
          .eq('user_id', targetUserId)
          .limit(1);
        if (sharedErr) throw sharedErr;
        if (shared && shared.length > 0) convId = shared[0].conversation_id;
      }
      if (!convId) {
        const { data: convo, error: convErr } = await supabase
          .from('conversations')
          .insert({ is_group: false, created_by: currentUserId })
          .select('id')
          .single();
        if (convErr) throw convErr;
        const { error: partErr } = await supabase
          .from('conversation_participants')
          .insert([
            { conversation_id: convo.id, user_id: currentUserId },
            { conversation_id: convo.id, user_id: targetUserId },
          ]);
        if (partErr) throw partErr;
        convId = convo.id;
      }
      if (onOpenMessages) onOpenMessages(convId);
    } catch (err) {
      console.error('Open profile chat failed', err);
      const detail = err?.message || err?.error_description || (err && JSON.stringify(err)) || '';
      if (addToast) addToast(`Could not open chat${detail ? ': ' + detail : ''}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className="profile-action-btn message-btn"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
      onClick={handleClick}
      disabled={busy}
      title="Send message"
    >
      <MessageIcon />
      {busy ? 'Opening…' : 'Message'}
    </button>
  );
};

const AddSkillModal = ({ isOpen, onClose, currentUserId, onSuccess, addToast, categories = [], userCommunities = [] }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [skillType, setSkillType] = useState('chatgpt_gpt');
  const [platformUrl, setPlatformUrl] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const categoryDropdownRef = useRef(null);
  const [selectedCommunityIds, setSelectedCommunityIds] = useState([]);
  const [communitySelectorOpen, setCommunitySelectorOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!categoryDropdownOpen) return;
    const handler = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [categoryDropdownOpen]);

  const reset = () => {
    setName(''); setDescription(''); setSkillType('chatgpt_gpt');
    setPlatformUrl(''); setPromptContent('');
    setCategoryId(''); setSelectedCommunityIds([]);
    setCommunitySelectorOpen(false);
    setCategoryDropdownOpen(false); setCategorySearch('');
  };

  const filteredCategories = categorySearch.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase().trim()))
    : categories;
  const selectedCategory = categoryId ? categories.find(c => c.id === categoryId) : null;

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUserId) { addToast && addToast('Sign in to add a skill', 'error'); return; }
    const trimmedName = name.trim();
    if (!trimmedName) { addToast && addToast('Name is required', 'error'); return; }
    const url = platformUrl.trim();
    const content = promptContent.trim();
    if (!url && !content) {
      addToast && addToast('Add a URL or prompt content', 'error');
      return;
    }

    setSaving(true);
    try {
      const { data: skill, error } = await supabase
        .from('skills')
        .insert({
          user_id: currentUserId,
          name: trimmedName,
          description: description.trim() || null,
          skill_type: skillType,
          platform_url: url || null,
          prompt_content: content || null,
          category_id: categoryId || null
        })
        .select()
        .single();
      if (error) throw error;

      if (selectedCommunityIds.length > 0) {
        const rows = selectedCommunityIds.map(cid => ({
          community_id: cid,
          skill_id: skill.id,
          added_by: currentUserId
        }));
        const { error: linkErr } = await supabase.from('community_skills').insert(rows);
        if (linkErr) console.error('Failed to link skill to communities:', linkErr);
      }

      addToast && addToast('Skill added!', 'success');
      onSuccess && onSuccess(skill);
      reset();
      onClose();
    } catch (err) {
      console.error('Error creating skill:', err);
      addToast && addToast(err.message || 'Failed to add skill', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const needsUrl = skillType === 'chatgpt_gpt' || skillType === 'gemini_gem';
  const needsContent = skillType === 'prompt' || skillType === 'claude_skill';

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal add-skill-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add a Skill</h2>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="add-skill-form">
          <label className="form-label">Type</label>
          <div className="skill-type-picker">
            {Object.entries(SKILL_TYPE_META).map(([key, meta]) => (
              <button
                type="button"
                key={key}
                className={`skill-type-option ${skillType === key ? 'active' : ''}`}
                onClick={() => setSkillType(key)}
                style={skillType === key ? { borderColor: meta.color, background: meta.color, color: meta.text } : {}}
              >
                {meta.label}
              </button>
            ))}
          </div>

          <label className="form-label">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. PR Description Writer"
            maxLength={120}
            className="form-input"
            required
          />

          <label className="form-label">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this skill do?"
            maxLength={500}
            rows={2}
            className="form-input"
          />

          {(needsUrl || skillType === 'claude_skill') && (
            <>
              <label className="form-label">{needsUrl ? 'Link *' : 'Link (optional)'}</label>
              <input
                type="url"
                value={platformUrl}
                onChange={(e) => setPlatformUrl(e.target.value)}
                placeholder={
                  skillType === 'chatgpt_gpt' ? 'https://chatgpt.com/g/g-...' :
                  skillType === 'gemini_gem'  ? 'https://gemini.google.com/...' :
                                                 'https://github.com/.../SKILL.md'
                }
                className="form-input"
              />
            </>
          )}

          {needsContent && (
            <>
              <label className="form-label">{skillType === 'prompt' ? 'Prompt content *' : 'Prompt / SKILL.md content (optional)'}</label>
              <textarea
                value={promptContent}
                onChange={(e) => setPromptContent(e.target.value)}
                placeholder={skillType === 'claude_skill' ? 'Paste your SKILL.md or instructions...' : 'Paste your prompt...'}
                rows={8}
                maxLength={20000}
                className="form-input"
              />
            </>
          )}

          <label className="form-label">Category</label>
          <div className="category-dropdown-container" ref={categoryDropdownRef}>
            <div
              className="form-input category-dropdown-trigger"
              onClick={() => setCategoryDropdownOpen(o => !o)}
            >
              {selectedCategory ? (
                <span className="category-dropdown-selected">
                  <span className="category-tag" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                    {selectedCategory.name}
                  </span>
                </span>
              ) : (
                <span className="category-dropdown-placeholder">Select a category (optional)</span>
              )}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: categoryDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            {categoryDropdownOpen && (
              <div className="category-dropdown-menu">
                <input
                  type="text"
                  className="category-dropdown-search"
                  placeholder="Search categories..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
                <div
                  className={`category-dropdown-item ${!categoryId ? 'selected' : ''}`}
                  onClick={() => { setCategoryId(''); setCategoryDropdownOpen(false); setCategorySearch(''); }}
                >
                  <span className="category-dropdown-check">{!categoryId ? '✓' : ''}</span>
                  <span className="category-dropdown-name" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No category</span>
                </div>
                {filteredCategories.length > 0 ? filteredCategories.map(cat => (
                  <div
                    key={cat.id}
                    className={`category-dropdown-item ${categoryId === cat.id ? 'selected' : ''}`}
                    onClick={() => { setCategoryId(cat.id); setCategoryDropdownOpen(false); setCategorySearch(''); }}
                  >
                    <span className="category-dropdown-check">{categoryId === cat.id ? '✓' : ''}</span>
                    <span className="category-dropdown-name">{cat.name}</span>
                  </div>
                )) : (
                  <div className="category-dropdown-empty">No categories found</div>
                )}
              </div>
            )}
          </div>

          {userCommunities.length > 0 && (
            <>
              <label className="form-label">Post to communities</label>
              <CommunitySelector
                userCommunities={userCommunities}
                selectedCommunityIds={selectedCommunityIds}
                onSelect={setSelectedCommunityIds}
                isOpen={communitySelectorOpen}
                onOpenChange={setCommunitySelectorOpen}
              />
            </>
          )}

          <div className="add-skill-actions">
            <button
              type="button"
              className="add-skill-cancel-btn"
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="add-skill-submit-btn"
              disabled={saving}
            >
              {saving ? 'Adding…' : 'Add Skill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================
// USER PROFILE VIEW COMPONENT
// ============================================
const UserProfileView = ({ userId, onBack, posts, onLike, userLikes, onCommentAdded, onSave, userSaves, currentUser, userFollows, onFollow, onEditProfile, onOpenCreatorPayments = null, onOpenDrafts = null, creatorPendingCount = 0, onAuthRequired, categories = [], onDelete, onViewUser, onOpenFullPost = null, onQuestionClick = null, onAskQuestion = null, initialTab = null, scrollToPostId = null, allPosts = [], forkedPostsMap = {}, onSchoolClick = null, onToolClick = null, onCategoryClick = null, schoolsData = [], onCommunityClick = null, builderRanks = [], onShowRanks = null, userCommunities = [], onPostCommunitiesChange = null, postCommunities = {}, userCommunityIds = [], onOpenMessages = null, feedViewMode = 'list', viewerIsAdmin = false }) => {
  const { addToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [avatarLightbox, setAvatarLightbox] = useState(null);
  const [showFollowModal, setShowFollowModal] = useState(null); // 'followers' or 'following'
  const [profileSchool, setProfileSchool] = useState(null);
  const [followList, setFollowList] = useState([]);
  const [loadingFollowList, setLoadingFollowList] = useState(false);
  const [followSearchQuery, setFollowSearchQuery] = useState('');
  const [profilePostsTab, setProfilePostsTab] = useState(initialTab || 'builds'); // 'builds', 'questions', 'communities', or 'workflows'
  const [bannerLightbox, setBannerLightbox] = useState(null);
  const [showBadgesModal, setShowBadgesModal] = useState(false);
  const [profileSortFilter, setProfileSortFilter] = useState('recent'); // 'recent' or 'liked'
  // profileViewMode replaced by global feedViewMode prop
  const [profilePosts, setProfilePosts] = useState([]);
  const [profilePostsLoading, setProfilePostsLoading] = useState(false);
  const [showAdminDelete, setShowAdminDelete] = useState(false);
  const [ownedCommunities, setOwnedCommunities] = useState([]);
  const [profileWorkflowsList, setProfileWorkflowsList] = useState([]);
  const [profileWorkflowsLoading, setProfileWorkflowsLoading] = useState(false);
  const [profileSkillsList, setProfileSkillsList] = useState([]);
  const [profileSkillsLoading, setProfileSkillsLoading] = useState(false);
  const [showAddSkillModal, setShowAddSkillModal] = useState(false);
  const [showAllTools, setShowAllTools] = useState(false);
  const [showAllCats, setShowAllCats] = useState(false);

  // Effect to scroll to specific post when component mounts or scrollToPostId changes
  useEffect(() => {
    if (scrollToPostId) {
      // Set the correct tab first if initialTab is provided
      if (initialTab) {
        setProfilePostsTab(initialTab);
      }

      // Attempt to scroll with retry logic
      let attempts = 0;
      const maxAttempts = 10;
      const scrollInterval = setInterval(() => {
        const element = document.getElementById(`post-${scrollToPostId}`);
        if (element) {
          clearInterval(scrollInterval);
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          element.style.boxShadow = '0 0 0 3px var(--accent-primary)';
          setTimeout(() => {
            element.style.boxShadow = '';
          }, 2000);
        } else {
          attempts++;
          if (attempts >= maxAttempts) {
            clearInterval(scrollInterval);
          }
        }
      }, 100);

      return () => clearInterval(scrollInterval);
    }
  }, [scrollToPostId, initialTab]);

  const [viewAsVisitor, setViewAsVisitor] = useState(false);
  const actuallyOwnProfile = currentUser?.id === userId;
  const isOwnProfile = actuallyOwnProfile && !viewAsVisitor;
  const isFollowing = userFollows?.includes(userId);
  // Claude advisor persona gets a mascot + a follow celebration
  const isClaudeBot = profile?.is_bot && profile?.username?.toLowerCase() === 'claude';
  const [claudeJumping, setClaudeJumping] = useState(false);
  const [claudeFireworks, setClaudeFireworks] = useState(false);

  const loadUserProfile = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error('Error loading user profile:', error);
        }
        setProfile(null);
        return;
      }

      // Suspended accounts are invisible to everyone except the account owner
      // and platform admins — render as "Profile not found" for other viewers.
      if (data?.is_suspended && data.id !== currentUser?.id && !viewerIsAdmin) {
        setProfile(null);
        return;
      }

      setProfile(data || null);
    } catch (err) {
      console.error('Error loading user profile:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const loadProfileUserWorkflows = async () => {
    setProfileWorkflowsLoading(true);
    try {
      const { data, error } = await getUserWorkflows(supabase, userId);
      if (error) {
        console.error('Error loading profile workflows:', error);
        setProfileWorkflowsList([]);
        return;
      }

      setProfileWorkflowsList(data || []);
    } catch (err) {
      console.error('Error loading profile workflows:', err);
      setProfileWorkflowsList([]);
    } finally {
      setProfileWorkflowsLoading(false);
    }
  };

  const loadProfileSkills = async () => {
    setProfileSkillsLoading(true);
    try {
      const { data, error } = await supabase
        .from('skills')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error loading skills:', error);
        setProfileSkillsList([]);
        return;
      }
      setProfileSkillsList(data || []);
    } catch (err) {
      console.error('Error loading skills:', err);
      setProfileSkillsList([]);
    } finally {
      setProfileSkillsLoading(false);
    }
  };

  const handleDeleteSkill = async (skill) => {
    if (!isOwnProfile) return;
    if (!window.confirm(`Delete "${skill.name}"?`)) return;
    try {
      const { error } = await supabase.from('skills').delete().eq('id', skill.id);
      if (error) throw error;
      setProfileSkillsList(list => list.filter(s => s.id !== skill.id));
      addToast && addToast('Skill deleted', 'success');
    } catch (err) {
      console.error('Error deleting skill:', err);
      addToast && addToast(err.message || 'Failed to delete skill', 'error');
    }
  };

  useEffect(() => {
    const handler = () => { if (currentUser?.id === userId) loadUserProfile(); };
    window.addEventListener('profile-updated', handler);
    return () => window.removeEventListener('profile-updated', handler);
  }, [currentUser?.id, userId]);

  useEffect(() => {
    loadUserProfile();
    loadFollowCounts();
    loadProfileSchool();
    loadOwnedCommunities();
    loadProfileUserWorkflows();
    loadProfileSkills();
  }, [userId]);

  useEffect(() => {
    loadProfilePosts();
  }, [userId, currentUser?.id]);

  // Refresh this profile's posts (incl. the Reposts tab) when the viewer toggles
  // a repost — only matters when looking at your own profile, but harmless else.
  useEffect(() => {
    const onReposted = () => { loadProfilePosts(); };
    window.addEventListener('prompted:reposted', onReposted);
    return () => window.removeEventListener('prompted:reposted', onReposted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentUser?.id]);

  const loadProfileSchool = async () => {
    try {
      const { data, error } = await supabase.rpc('get_user_school', { target_user_id: userId });
      if (!error && data && data.length > 0) {
        setProfileSchool(data[0]);
      } else {
        setProfileSchool(null);
      }
    } catch (err) {
      console.error('Error loading profile school:', err);
      setProfileSchool(null);
    }
  };

  const loadOwnedCommunities = async () => {
    try {
      const { data, error } = await supabase
        .from('communities_with_stats')
        .select('*')
        .eq('creator_id', userId)
        .order('member_count', { ascending: false });
      if (!error && data) {
        setOwnedCommunities(data);
      } else {
        setOwnedCommunities([]);
      }
    } catch (err) {
      console.error('Error loading owned communities:', err);
      setOwnedCommunities([]);
    }
  };

  const loadFollowCounts = async () => {
    // Get follower count (people who follow this user)
    const { count: followers } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);
    setFollowerCount(followers || 0);

    // Get following count (people this user follows)
    const { count: following } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId);
    setFollowingCount(following || 0);
  };

  const loadFollowers = async () => {
    setLoadingFollowList(true);
    try {
      // Step 1: Get the follows
      const { data: followsData, error: followsError } = await supabase
        .from('follows')
        .select('follower_id, created_at')
        .eq('following_id', userId)
        .order('created_at', { ascending: false });

      if (followsError) {
        console.error('Error loading followers:', followsError);
        setFollowList([]);
        setLoadingFollowList(false);
        return;
      }

      if (!followsData || followsData.length === 0) {
        setFollowList([]);
        setLoadingFollowList(false);
        return;
      }

      // Step 2: Get profiles for all follower IDs
      const followerIds = followsData.map(f => f.follower_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_emoji, avatar_url, bio, builder_points')
        .in('id', followerIds);

      if (profilesError) {
        console.error('Error loading follower profiles:', profilesError);
      }

      // Step 3: Combine the data
      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
      const combinedData = followsData.map(follow => ({
        follower_id: follow.follower_id,
        created_at: follow.created_at,
        profiles: profilesMap.get(follow.follower_id) || null
      }));

      setFollowList(combinedData);
    } catch (err) {
      console.error('Error in loadFollowers:', err);
      setFollowList([]);
    }
    setLoadingFollowList(false);
  };

  const loadFollowing = async () => {
    setLoadingFollowList(true);
    try {
      // Step 1: Get the follows
      const { data: followsData, error: followsError } = await supabase
        .from('follows')
        .select('following_id, created_at')
        .eq('follower_id', userId)
        .order('created_at', { ascending: false });

      if (followsError) {
        console.error('Error loading following:', followsError);
        setFollowList([]);
        setLoadingFollowList(false);
        return;
      }

      if (!followsData || followsData.length === 0) {
        setFollowList([]);
        setLoadingFollowList(false);
        return;
      }

      // Step 2: Get profiles for all following IDs
      const followingIds = followsData.map(f => f.following_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_emoji, avatar_url, bio, builder_points')
        .in('id', followingIds);

      if (profilesError) {
        console.error('Error loading following profiles:', profilesError);
      }

      // Step 3: Combine the data
      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
      const combinedData = followsData.map(follow => ({
        following_id: follow.following_id,
        created_at: follow.created_at,
        profiles: profilesMap.get(follow.following_id) || null
      }));

      setFollowList(combinedData);
    } catch (err) {
      console.error('Error in loadFollowing:', err);
      setFollowList([]);
    }
    setLoadingFollowList(false);
  };

  const handleShowFollowers = () => {
    setFollowSearchQuery('');
    setShowFollowModal('followers');
    loadFollowers();
  };

  const handleShowFollowing = () => {
    setFollowSearchQuery('');
    setShowFollowModal('following');
    loadFollowing();
  };

  const handleUserClick = (clickedUserId) => {
    setShowFollowModal(null);
    if (onViewUser) {
      onViewUser(clickedUserId);
    }
  };

  const handleFollowClick = () => {
    onFollow(userId, isFollowing);
    // Update counts locally for immediate feedback
    if (isFollowing) {
      setFollowerCount(prev => Math.max(0, prev - 1));
    } else {
      setFollowerCount(prev => prev + 1);
      // Following Claude → he jumps for joy and fireworks go off 🎆
      if (isClaudeBot) {
        setClaudeJumping(true);
        setClaudeFireworks(true);
        setTimeout(() => setClaudeJumping(false), 3000);
        setTimeout(() => setClaudeFireworks(false), 1400);
      }
    }
  };

  const normalizeProfilePosts = (rawPosts = []) => (
    rawPosts.map(post => {
      if (post.post_type) return post;
      if (post.is_question) return { ...post, post_type: 'question' };
      return post;
    })
  );

  const loadProfilePosts = async () => {
    setProfilePostsLoading(true);

    try {
      const rpcParamsToTry = [
        // Correct signature: get_user_posts_with_reposts(target_user_id, requesting_user_id).
        // The older guessed names below never matched, so this always fell back to
        // a plain posts query that omits reposts entirely.
        { target_user_id: userId, requesting_user_id: currentUser?.id || null },
        { p_user_id: userId, p_viewer_id: currentUser?.id || null },
        { user_id: userId, viewer_id: currentUser?.id || null },
        { target_user_id: userId, viewer_user_id: currentUser?.id || null },
        { user_id: userId }
      ];

      for (const params of rpcParamsToTry) {
        const { data, error } = await supabase.rpc('get_user_posts_with_reposts', params);
        if (!error && Array.isArray(data)) {
          setProfilePosts(normalizeProfilePosts(data));
          setProfilePostsLoading(false);
          return;
        }
        if (error?.code === '42883') break;
      }

      const { data: fallbackData, error: fallbackError } = await supabase
        .from('posts_with_stats')
        .select('*')
        .eq('user_id', userId)
        .neq('post_type', 'learning_submission')
        .neq('post_type', 'meme')
        .order('created_at', { ascending: false });

      if (fallbackError) {
        console.error('Error loading profile posts fallback:', fallbackError);
        setProfilePosts([]);
      } else {
        setProfilePosts(normalizeProfilePosts(fallbackData || []));
      }
    } catch (err) {
      console.error('Error loading profile posts:', err);
      setProfilePosts([]);
    } finally {
      setProfilePostsLoading(false);
    }
  };

  const userPosts = profilePosts;

  // Wrap onLike to also update local profilePosts state
  const handleProfileLike = (postId, isCurrentlyLiked) => {
    const likeDelta = isCurrentlyLiked ? -1 : 1;
    setProfilePosts(prev => prev.map(p =>
      p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + likeDelta } : p
    ));
    onLike(postId, isCurrentlyLiked);
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><XIcon /></div>
        <p className="empty-text">Profile not found</p>
      </div>
    );
  }

  return (
    <div className="user-profile-view">
      {/* Header Banner - 3:1 aspect ratio (Twitter standard) */}
      <div
        className="profile-header-banner"
        onClick={() => {
          if (profile.header_url) {
            setBannerLightbox({
              imageUrl: profile.header_url,
              username: profile.username
            });
          }
        }}
        style={{
          width: '100%',
          height: 0,
          paddingBottom: '33.33%',
          background: profile.header_url && !isVideoBannerUrl(profile.header_url)
            ? `url(${profile.header_url}) center/cover no-repeat`
            : profile.header_url
              ? 'var(--bg-tertiary)'
              : 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
          borderRadius: '16px 16px 0 0',
          position: 'relative',
          overflow: 'hidden',
          cursor: profile.header_url ? 'pointer' : 'default'
        }}
      >
        {/* Animated banner (Pro / contest winners): looping muted video */}
        {isVideoBannerUrl(profile.header_url) && (
          <video
            src={profile.header_url}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <button className="profile-back-btn" onClick={(e) => { e.stopPropagation(); onBack(); }} style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(8px)',
          color: 'white',
          border: 'none',
          padding: '0.5rem 1rem',
          borderRadius: '20px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.85rem',
          zIndex: 3
        }}>
          <ArrowLeftIcon /> Back
        </button>
      </div>

      <div className="profile-header" style={{ borderRadius: '0 0 16px 16px', borderTop: 'none' }}>
        <div className="profile-header-top">
          <div
            className="profile-avatar-large"
            onClick={() => {
              if (profile.avatar_url || profile.avatar_emoji) {
                setAvatarLightbox({
                  imageUrl: profile.avatar_url,
                  emoji: profile.avatar_emoji,
                  username: profile.username,
                  displayName: profile.display_name
                });
              }
            }}
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="profile-avatar-img" />
            ) : profile.avatar_emoji ? (
              <span className="profile-avatar-emoji">{profile.avatar_emoji}</span>
            ) : (
              <UserIcon />
            )}
          </div>
        </div>
        <div className="profile-info">
          <div className="profile-header-row">
            <div
              className="profile-display-name"
              style={profile.name_color ? { color: profile.name_color } : {}}
            >
              {profile.display_name || profile.username}
              <BuilderRankBadge points={profile.builder_points} ranks={builderRanks} size="medium" onClick={onShowRanks ? () => onShowRanks() : undefined} />
              <UserBadge username={profile.username} size={20} />
              {profileSchool && (
                <span
                  className="school-badge"
                  style={{ background: profileSchool.color, fontSize: '0.8rem', padding: '0.2rem 0.55rem', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); onSchoolClick && onSchoolClick(profileSchool.school_slug); }}
                >
                  {profileSchool.short_name || profileSchool.school_name}
                </span>
              )}
            </div>
            {/* Icon badges — earned via loot boxes, shown next to the name. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '4px' }}>
              <ProfileIconBadges slugs={profile.profile_icon_badges} color={profile.name_color} size={20} />
              {isOwnProfile && (
                <button
                  onClick={() => setShowBadgesModal(true)}
                  title="Manage your icon badges"
                  style={{ background: 'transparent', border: `1px solid var(--border-color)`, color: 'var(--text-secondary)', borderRadius: '8px', padding: '3px 9px', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  ✨ Badges
                </button>
              )}
            </div>
            {!isOwnProfile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className={`profile-action-btn ${isFollowing ? 'following-btn' : 'follow-btn'}`}
                  onClick={handleFollowClick}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
                {isClaudeBot && (
                  <img
                    src="/claude-mascot.png"
                    alt="Claude"
                    title="Claude says hi!"
                    className={`claude-mascot-icon ${claudeJumping ? 'jumping' : ''}`}
                  />
                )}
              </div>
            )}
          </div>
          {claudeFireworks && (
            <div className="claude-fireworks">
              {[
                { left: '30%', top: '32%' },
                { left: '62%', top: '26%' },
                { left: '48%', top: '44%' },
              ].map((origin, b) => (
                <div key={b} className="claude-firework" style={{ left: origin.left, top: origin.top }}>
                  {Array.from({ length: 16 }).map((_, i) => {
                    const angle = (i / 16) * Math.PI * 2;
                    const dist = 90 + (b % 2) * 30;
                    const colors = ['#D97757', '#C9A227', '#4ECDC4', '#ffffff'];
                    return (
                      <span
                        key={i}
                        style={{
                          '--dx': `${Math.cos(angle) * dist}px`,
                          '--dy': `${Math.sin(angle) * dist}px`,
                          '--spark': colors[i % colors.length],
                          animationDelay: `${b * 0.15}s`,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          <div className="profile-username">@{profile.username}</div>
          {profile.bio && <div className="profile-bio">{profile.bio}</div>}
          <div className="profile-stats">
            <div
              className="profile-stat profile-stat-clickable"
              onClick={handleShowFollowers}
              style={{ cursor: 'pointer' }}
            >
              <span className="profile-stat-value">{followerCount}</span>
              <span className="profile-stat-label"> Follower{followerCount !== 1 ? 's' : ''}</span>
            </div>
            <div
              className="profile-stat profile-stat-clickable"
              onClick={handleShowFollowing}
              style={{ cursor: 'pointer' }}
            >
              <span className="profile-stat-value">{followingCount}</span>
              <span className="profile-stat-label"> Following</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">{userPosts.length}</span>
              <span className="profile-stat-label"> Post{userPosts.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {/* Combined Tools & Categories Badges + share button.
              The share button always renders so users can share even
              empty profiles; badges flow on the left, share sits on
              the right corner. */}
          {(() => {
            const badges = [];
            const toolCounts = {};
            userPosts.filter(p => p.tool_ids).forEach(p => {
              (p.tool_ids || []).forEach(tid => {
                toolCounts[tid] = (toolCounts[tid] || 0) + 1;
              });
            });
            Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).forEach(([toolId, count]) => {
              badges.push({ type: 'tool', id: toolId, name: getToolDisplayName(toolId), count, onClick: () => onToolClick && onToolClick(getToolDisplayName(toolId)) });
            });
            const catCounts = {};
            userPosts.filter(p => p.category_ids).forEach(p => {
              (p.category_ids || []).forEach(cid => {
                catCounts[cid] = (catCounts[cid] || 0) + 1;
              });
            });
            Object.entries(catCounts).sort((a, b) => b[1] - a[1]).forEach(([catId, count]) => {
              const cat = categories.find(c => c.id === catId);
              badges.push({ type: 'cat', id: catId, name: cat ? cat.name : catId, count, onClick: () => onCategoryClick && onCategoryClick(catId) });
            });
            const displayBadges = showAllTools ? badges : badges.slice(0, 6);
            return (
              <div className="profile-bio-footer">
                {badges.length > 0 && (
                  <div className="profile-tools-badges">
                    {displayBadges.map(badge => (
                      <span key={`${badge.type}-${badge.id}`} className="profile-tool-badge" onClick={badge.onClick} style={{ cursor: badge.onClick ? 'pointer' : 'default' }}>
                        {badge.name} <span className="profile-tool-badge-count">({badge.count})</span>
                      </span>
                    ))}
                    {badges.length > 6 && !showAllTools && (
                      <span className="profile-tool-badge" onClick={() => setShowAllTools(true)} style={{ cursor: 'pointer', fontSize: '1rem', fontWeight: '700', letterSpacing: '1px' }}>
                        &hellip;
                      </span>
                    )}
                    {badges.length > 6 && showAllTools && (
                      <span className="profile-tool-badge" onClick={() => setShowAllTools(false)} style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        &#10005;
                      </span>
                    )}
                  </div>
                )}
                <ProfileShareButton
                  username={profile.username}
                  profileId={profile.id}
                  currentUserId={currentUser?.id}
                />
                <ProfileMessageButton
                  targetUserId={profile.id}
                  currentUserId={currentUser?.id}
                  onAuthRequired={onAuthRequired}
                  onOpenMessages={onOpenMessages}
                />
              </div>
            );
          })()}

          {/* Admin-only: delete this user (mirrors the admin post-delete pattern) */}
          {viewerIsAdmin && !actuallyOwnProfile && (
            <button
              className="btn-danger-outline"
              style={{ marginTop: 10 }}
              onClick={() => setShowAdminDelete(true)}
            >
              Delete this user…
            </button>
          )}
          <AccountDeletionModal
            isOpen={showAdminDelete}
            onClose={() => setShowAdminDelete(false)}
            username={profile.username}
            variant="admin"
            targetLabel={profile.display_name || `@${profile.username}`}
            onConfirm={async ({ contentMode, timing }) => {
              await adminDeleteUser({ targetUserId: userId, mode: contentMode, timing });
              addToast(
                timing === 'immediate'
                  ? `Deleted @${profile.username}.`
                  : `Scheduled @${profile.username} for deletion in 30 days.`,
                'success',
              );
              setShowAdminDelete(false);
              if (timing === 'immediate' && onBack) onBack();
            }}
          />

          {/* Profile bio links — sit beneath the tools/categories badges so
              they appear alongside the rest of the user's "what I'm about"
              row. Hidden entirely when neither URL is set. */}
          {(profile.github_url || profile.website_url) && (
            <div className="profile-links-row">
              {profile.github_url && (
                <a
                  className="profile-link-chip"
                  href={ensureAbsoluteUrl(profile.github_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  GitHub
                </a>
              )}
              {profile.website_url && (
                <a
                  className="profile-link-chip"
                  href={ensureAbsoluteUrl(profile.website_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={profile.website_url}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  {(() => {
                    try { return new URL(ensureAbsoluteUrl(profile.website_url)).hostname.replace(/^www\./, ''); }
                    catch { return 'Website'; }
                  })()}
                </a>
              )}
            </div>
          )}

          {/* Builder Rank Section - only show on own profile */}
          {isOwnProfile && profile.builder_points !== undefined && (() => {
            const badge = getBadgeForPoints(profile.builder_points || 0);
            const rank = builderRanks.length > 0 ? getRankForPoints(profile.builder_points || 0, builderRanks) : null;
            const next = rank ? getNextRank(rank, builderRanks) : null;
            const isMaxRank = !next;
            const progressPercent = isMaxRank ? 100 : (next ? Math.min(100, Math.round(((profile.builder_points || 0) - (rank?.min_points || 0)) / ((next?.min_points || 1) - (rank?.min_points || 0)) * 100)) : 0);
            const pointsToNext = next ? next.min_points - (profile.builder_points || 0) : 0;
            return (
              <div className="profile-rank-section" onClick={onShowRanks ? () => onShowRanks() : undefined} style={{ cursor: onShowRanks ? 'pointer' : 'default' }}>
                <div className="profile-rank-header">
                  <span className="profile-rank-icon"><BadgeSVG badge={badge} size={64} /></span>
                  <div className="profile-rank-info">
                    <div className="profile-rank-name" style={{ color: badge.color }}>
                      {badge.name}
                    </div>
                    <div className="profile-rank-points" title={profile.builder_points_display != null ? `Real score: ${(profile.builder_points || 0).toLocaleString()} builder points` : undefined}>{(profile.builder_points_display ?? profile.builder_points ?? 0).toLocaleString()} builder points</div>
                  </div>
                </div>
                {rank && next && !isMaxRank ? (
                  <div className="profile-rank-progress">
                    <div className="profile-rank-progress-bar">
                      <div className="profile-rank-progress-fill" style={{ width: `${progressPercent}%`, background: next.color || badge.accent }} />
                    </div>
                    <div className="profile-rank-next">
                      <span>{pointsToNext} points to {next.name}</span>
                      <span>{progressPercent}%</span>
                    </div>
                  </div>
                ) : isMaxRank ? (
                  <div className="profile-rank-max">
                    <span>&#10024;</span> Max rank achieved
                  </div>
                ) : null}
              </div>
            );
          })()}
          <div className="profile-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.75rem' }}>
          {isOwnProfile && (
            <button
              className="profile-action-btn edit-btn profile-edit-btn-desktop"
              onClick={() => onEditProfile()}
            >
              Settings
            </button>
          )}
          {isOwnProfile && (
            <button
              className="profile-action-btn edit-btn profile-edit-btn-mobile"
              onClick={() => onEditProfile()}
            >
              Settings
            </button>
          )}
          {actuallyOwnProfile && (
            <button
              className="profile-action-btn edit-btn"
              onClick={() => setViewAsVisitor(v => !v)}
              title={viewAsVisitor ? 'Return to your own profile view' : 'Preview how visitors see your profile'}
            >
              {viewAsVisitor ? '↩ Back to my view' : '👁 View as visitor'}
            </button>
          )}
          {isOwnProfile && onOpenCreatorPayments && (
            <button
              className="profile-action-btn edit-btn"
              onClick={() => onOpenCreatorPayments()}
              title="Manage paid communities and pending requests"
              style={{ position: 'relative' }}
            >
              💰 Payments
              {creatorPendingCount > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: 10, minWidth: 18, textAlign: 'center', border: '2px solid var(--bg-primary)' }}>
                  {creatorPendingCount}
                </span>
              )}
            </button>
          )}
          {isOwnProfile && onOpenDrafts && (
            <button
              className="profile-action-btn edit-btn"
              onClick={() => onOpenDrafts()}
              title="Review drafts your AI posted via Agent Posting"
            >
              📝 Drafts
            </button>
          )}
          </div>
        </div>
      </div>

      <div className="profile-posts-section">
        <div className="profile-posts-tabs" style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '0.5rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`profile-posts-tab ${profilePostsTab === 'builds' ? 'active' : ''}`}
              onClick={() => setProfilePostsTab('builds')}
              style={{
                padding: '0.5rem 1rem',
                background: profilePostsTab === 'builds' ? 'var(--accent-primary)' : 'transparent',
                color: profilePostsTab === 'builds' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease'
              }}
            >
              Builds
            </button>
            <button
              className={`profile-posts-tab ${profilePostsTab === 'posts' ? 'active' : ''}`}
              onClick={() => setProfilePostsTab('posts')}
              style={{
                padding: '0.5rem 1rem',
                background: profilePostsTab === 'posts' ? 'var(--accent-primary)' : 'transparent',
                color: profilePostsTab === 'posts' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease'
              }}
            >
              Discussion
            </button>
            <button
              className={`profile-posts-tab ${profilePostsTab === 'questions' ? 'active' : ''}`}
              onClick={() => setProfilePostsTab('questions')}
              style={{
                padding: '0.5rem 1rem',
                background: profilePostsTab === 'questions' ? 'var(--accent-primary)' : 'transparent',
                color: profilePostsTab === 'questions' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease'
              }}
            >
              Questions
            </button>
            {(isOwnProfile || userPosts.some(p => p.is_repost)) && (
              <button
                className={`profile-posts-tab ${profilePostsTab === 'reposts' ? 'active' : ''}`}
                onClick={() => setProfilePostsTab('reposts')}
                style={{
                  padding: '0.5rem 1rem',
                  background: profilePostsTab === 'reposts' ? 'var(--accent-primary)' : 'transparent',
                  color: profilePostsTab === 'reposts' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease'
                }}
              >
                Reposts{(() => { const n = userPosts.filter(p => p.is_repost).length; return n > 0 ? ` · ${n}` : ''; })()}
              </button>
            )}
            {profileWorkflowsList.length > 0 && (
              <button
                className={`profile-posts-tab ${profilePostsTab === 'workflows' ? 'active' : ''}`}
                onClick={() => setProfilePostsTab('workflows')}
                style={{
                  padding: '0.5rem 1rem',
                  background: profilePostsTab === 'workflows' ? 'var(--accent-primary)' : 'transparent',
                  color: profilePostsTab === 'workflows' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease'
                }}
              >
                Workflows
              </button>
            )}
            {(profileSkillsList.length > 0 || isOwnProfile) && (
              <button
                className={`profile-posts-tab ${profilePostsTab === 'skills' ? 'active' : ''}`}
                onClick={() => setProfilePostsTab('skills')}
                style={{
                  padding: '0.5rem 1rem',
                  background: profilePostsTab === 'skills' ? 'var(--accent-primary)' : 'transparent',
                  color: profilePostsTab === 'skills' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease'
                }}
              >
                Skills{profileSkillsList.length > 0 ? ` · ${profileSkillsList.length}` : ''}
              </button>
            )}
            <button
              className={`profile-posts-tab ${profilePostsTab === 'channel' ? 'active' : ''}`}
              onClick={() => setProfilePostsTab('channel')}
              style={{
                padding: '0.5rem 1rem',
                background: profilePostsTab === 'channel' ? 'var(--accent-primary)' : 'transparent',
                color: profilePostsTab === 'channel' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease'
              }}
            >
              {(profile?.display_name || profile?.username || 'User')}'s Channel
            </button>
            {ownedCommunities.length > 0 && (
              <button
                className={`profile-posts-tab ${profilePostsTab === 'communities' ? 'active' : ''}`}
                onClick={() => setProfilePostsTab('communities')}
                style={{
                  padding: '0.5rem 1rem',
                  background: profilePostsTab === 'communities' ? 'var(--accent-primary)' : 'transparent',
                  color: profilePostsTab === 'communities' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease'
                }}
              >
                Communities
              </button>
            )}
          </div>
          {profilePostsTab !== 'communities' && profilePostsTab !== 'workflows' && profilePostsTab !== 'channel' && profilePostsTab !== 'skills' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select
                value={profileSortFilter}
                onChange={(e) => setProfileSortFilter(e.target.value)}
                style={{
                  padding: '0.4rem 0.75rem',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '500',
                  outline: 'none'
                }}
              >
                <option value="recent">Most Recent</option>
                <option value="liked">Most Liked</option>
              </select>
              {/* Local profile toggle removed — global feedViewMode toggle in top nav */}
            </div>
          )}
        </div>
        {profilePostsTab === 'skills' ? (
          <div style={{ marginTop: '0.5rem' }}>
            {isOwnProfile && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <button
                  className="skill-add-btn"
                  onClick={() => setShowAddSkillModal(true)}
                >
                  + Add Skill
                </button>
              </div>
            )}
            {profileSkillsLoading ? (
              <div className="loading-state"><div className="spinner"></div><p>Loading skills...</p></div>
            ) : profileSkillsList.length > 0 ? (
              <div className="skills-grid">
                {profileSkillsList.map(skill => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    isOwner={isOwnProfile}
                    onUse={(s) => useSkill(s, addToast)}
                    onDelete={handleDeleteSkill}
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
                <p className="empty-text">
                  {isOwnProfile ? 'No skills yet — add a ChatGPT Skill, Claude Skill, Gem, or prompt to share' : 'No skills yet'}
                </p>
              </div>
            )}
          </div>
        ) : profilePostsTab === 'workflows' ? (
          <div style={{ marginTop: '0.5rem' }}>
            {profileWorkflowsLoading ? (
              <div className="loading-state"><div className="spinner"></div><p>Loading workflows...</p></div>
            ) : profileWorkflowsList.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                {profileWorkflowsList.map(wf => (
                  <WorkflowCard
                    key={wf.id}
                    workflow={wf}
                    onLike={() => {}}
                    onSave={() => {}}
                    isLiked={false}
                    isSaved={false}
                    onUserClick={onViewUser}
                    onOpenWorkflow={(w) => onOpenFullPost && onOpenFullPost({ __workflow: true, id: w.id })}
                    currentUser={currentUser}
                    categories={categories}
                    getToolDisplayName={getToolDisplayName}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                    <polyline points="9,11 12,14 22,4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
                <p className="empty-text">No workflows yet</p>
              </div>
            )}
          </div>
        ) : profilePostsTab === 'channel' ? (
          <div style={{ marginTop: '0.5rem' }}>
            <ProfileChannels
              profileUserId={userId}
              profileDisplayName={profile?.display_name || profile?.username || 'User'}
              currentUser={currentUser}
              onUserClick={onViewUser}
              profileNameColor={profile?.name_color}
              isFollowingOwner={isFollowing}
              onFollow={onFollow}
            />
          </div>
        ) : profilePostsTab === 'communities' ? (
          <div className="profile-communities-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '1rem',
            marginTop: '0.5rem'
          }}>
            {ownedCommunities.map(community => (
              <div
                key={community.id}
                onClick={() => onCommunityClick && onCommunityClick(community)}
                style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  border: '1px solid var(--border-color)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'var(--accent-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    flexShrink: 0,
                    overflow: 'hidden'
                  }}>
                    {community.icon_url ? (
                      <img src={community.icon_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      community.icon || community.name?.charAt(0)?.toUpperCase() || 'C'
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{community.name}</div>
                    {community.description && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{toPlainText(community.description)}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>{community.member_count || 0} members</span>
                  <span>{community.post_count || 0} posts</span>
                </div>
              </div>
            ))}
          </div>
        ) : (() => {
          const filteredPosts = userPosts
            .filter(post => {
              // Reposts (someone else's post re-shared) live only in their own
              // tab; every other tab shows the user's own authored content.
              if (profilePostsTab === 'reposts') return post.is_repost;
              if (post.is_repost) return false;
              if (profilePostsTab === 'questions') return post.is_question;
              if (profilePostsTab === 'posts') return post.post_type === 'post';
              return !post.is_question && post.post_type !== 'post';
            })
            .sort((a, b) => {
              if (profileSortFilter === 'liked') {
                return (b.likes_count || 0) - (a.likes_count || 0);
              }
              // The Reposts tab orders by when it was reposted, not authored.
              const aT = profilePostsTab === 'reposts' ? (a.reposted_at || a.created_at) : a.created_at;
              const bT = profilePostsTab === 'reposts' ? (b.reposted_at || b.created_at) : b.created_at;
              return new Date(bT) - new Date(aT);
            });

          if (profilePostsLoading) {
            return (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading posts...</p>
              </div>
            );
          }

          if (filteredPosts.length === 0) {
            return (
              <div className="empty-state">
                <div className="empty-icon"><InboxIcon /></div>
                <p className="empty-text">
                  {profilePostsTab === 'questions' ? 'No questions yet' : profilePostsTab === 'posts' ? 'No posts yet' : profilePostsTab === 'reposts' ? 'No reposts yet' : 'No builds yet'}
                </p>
              </div>
            );
          }

          // Grid view honors global feedViewMode
          if (feedViewMode === 'grid') {
            return <PostGrid posts={filteredPosts} onOpenFullPost={onOpenFullPost} />;
          }

          // List view
          return filteredPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onLike={handleProfileLike}
              userLikes={userLikes}
              onCommentAdded={onCommentAdded}
              onSave={onSave}
              userSaves={userSaves}
              onAuthRequired={onAuthRequired}
              categories={categories}
              onDelete={onDelete}
              onOpenFullPost={onOpenFullPost}
              onQuestionClick={onQuestionClick}
              onAskQuestion={onAskQuestion}
              onCategoryClick={onCategoryClick}
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
          ));
        })()}
      </div>

      {/* Avatar Lightbox Modal */}
      {avatarLightbox && (
        <div
          className="avatar-lightbox-overlay"
          onClick={() => setAvatarLightbox(null)}
        >
          <div className="avatar-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="avatar-lightbox-close"
              onClick={() => setAvatarLightbox(null)}
            >
              ×
            </button>
            {avatarLightbox.imageUrl ? (
              <img src={avatarLightbox.imageUrl} alt="Profile" className="avatar-lightbox-image" />
            ) : (
              <div className="avatar-lightbox-emoji">{avatarLightbox.emoji || '😀'}</div>
            )}
            {avatarLightbox.username && (
              <div className="avatar-lightbox-username">@{avatarLightbox.username}</div>
            )}
          </div>
        </div>
      )}

      {/* Banner Lightbox Modal */}
      {bannerLightbox && (
        <div
          className="banner-lightbox-overlay"
          onClick={() => setBannerLightbox(null)}
        >
          <div className="banner-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="banner-lightbox-close"
              onClick={() => setBannerLightbox(null)}
            >
              ×
            </button>
            {bannerLightbox.imageUrl ? (
              isVideoBannerUrl(bannerLightbox.imageUrl) ? (
                <video
                  src={bannerLightbox.imageUrl}
                  className="banner-lightbox-image"
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                />
              ) : (
                <img src={bannerLightbox.imageUrl} alt="Banner" className="banner-lightbox-image" />
              )
            ) : (
              <div
                className="banner-lightbox-gradient"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)'
                }}
              />
            )}
            {bannerLightbox.username && (
              <div className="banner-lightbox-username">@{bannerLightbox.username}'s banner</div>
            )}
          </div>
        </div>
      )}

      <IconCollectionModal
        isOpen={showBadgesModal}
        onClose={() => { setShowBadgesModal(false); loadUserProfile(); }}
        onUpgrade={() => { setShowBadgesModal(false); window.location.hash = '#pro'; }}
      />

      <AddSkillModal
        isOpen={showAddSkillModal}
        onClose={() => setShowAddSkillModal(false)}
        currentUserId={currentUser?.id}
        addToast={addToast}
        onSuccess={(newSkill) => setProfileSkillsList(list => [newSkill, ...list])}
        categories={categories}
        userCommunities={userCommunities}
      />

      {/* Followers/Following Modal */}
      {showFollowModal && (
        <div className="modal-overlay" onClick={() => setShowFollowModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2 className="modal-title">
                {showFollowModal === 'followers' ? 'Followers' : 'Following'}
              </h2>
              <button className="modal-close" onClick={() => setShowFollowModal(null)}>×</button>
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
                  placeholder={`Search ${showFollowModal === 'followers' ? 'followers' : 'following'}...`}
                  value={followSearchQuery}
                  onChange={(e) => setFollowSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                {followSearchQuery && (
                  <button
                    onClick={() => setFollowSearchQuery('')}
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
              {loadingFollowList ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="spinner"></div>
                  <p>Loading...</p>
                </div>
              ) : followList.length > 0 ? (
                (() => {
                  const filteredList = followSearchQuery.trim()
                    ? followList.filter(item => {
                        const profile = item.profiles;
                        const query = followSearchQuery.toLowerCase();
                        return (
                          profile?.username?.toLowerCase().includes(query) ||
                          profile?.display_name?.toLowerCase().includes(query)
                        );
                      })
                    : followList;

                  if (filteredList.length === 0) {
                    return (
                      <div style={{
                        textAlign: 'center',
                        padding: '2rem',
                        color: 'var(--text-muted)'
                      }}>
                        <p>No users found matching "{followSearchQuery}"</p>
                      </div>
                    );
                  }

                  return (
                    <div>
                      {filteredList.map((item) => {
                        const userProfile = item.profiles;
                        const itemUserId = showFollowModal === 'followers' ? item.follower_id : item.following_id;
                        return (
                          <div
                            key={itemUserId}
                            onClick={() => handleUserClick(itemUserId)}
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
                              {userProfile?.avatar_url ? (
                                <img src={userProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : userProfile?.avatar_emoji ? (
                                <span style={{ fontSize: '1.4rem' }}>{userProfile.avatar_emoji}</span>
                              ) : (
                                <UserIcon />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: '600', color: userProfile?.name_color || 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                {userProfile?.display_name || userProfile?.username || 'Unknown'}
                                <BuilderRankBadge points={userProfile?.builder_points} ranks={builderRanks} />
                                <UserBadge username={userProfile?.username} size={16} />
                              </div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                @{userProfile?.username || 'unknown'}
                              </div>
                              {userProfile?.bio && (
                                <div style={{
                                  fontSize: '0.8rem',
                                  color: 'var(--text-secondary)',
                                  marginTop: '0.25rem',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {userProfile.bio}
                                </div>
                              )}
                            </div>
                            {currentUser && itemUserId !== currentUser.id ? (
                              userFollows?.includes(itemUserId) ? (
                                <button
                                  className="profile-action-btn following-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onFollow(itemUserId, true);
                                    if (isOwnProfile && showFollowModal === 'following') {
                                      setFollowList(prev => prev.filter(i => i.following_id !== itemUserId));
                                    }
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.textContent = 'Unfollow'; }}
                                  onMouseLeave={(e) => { e.currentTarget.textContent = 'Following'; }}
                                >
                                  Following
                                </button>
                              ) : (
                                <button
                                  className="profile-action-btn follow-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onFollow(itemUserId);
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
                      })}
                    </div>
                  );
                })()
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '2rem',
                  color: 'var(--text-muted)'
                }}>
                  <p>
                    {showFollowModal === 'followers'
                      ? 'No followers yet'
                      : 'Not following anyone yet'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default UserProfileView;
