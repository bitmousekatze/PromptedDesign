import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAuth, useToast, ADMIN_USERNAMES, AI_TOOL_NAME_TO_ID, copyToClipboard, getModelForTool, getToolDisplayName, normalizeToolKey, formatTimeAgo, ensureAbsoluteUrl, buildPostShareUrl } from '../../lib/appShared.js';
import { normalizePostVideoItem, getPlayablePostVideoUrl } from '../../lib/storage.js';
import { moderateContent } from '../../lib/moderation.js';
import { sanitizeHtml } from '../../lib/sanitize.js';
import { observeImpression, recordProfileVisit } from '../../lib/postEvents.js';
import { RichText } from '../../lib/richText.jsx';
import CommentEditor from '../CommentEditor.jsx';
import OriginalPostCard from '../OriginalPostCard.jsx';
import RemixBuildModal from '../RemixBuildModal.jsx';
import { UserBadge, BuilderRankBadge, ShareToChatModal } from '../sharedUI.jsx';
import { CommentContent, CommentImage, MentionText, AdvisorMentionHint, uploadCommentImage, PollWidget, ReportModal, RepostButton } from './postShared.jsx';
import EditPostModal from './EditPostModal.jsx';
import { BookmarkIcon, ChevronDownIcon, ChevronUpIcon, CommentIcon, CommunityIcon, CopyIcon, EditIcon, EyeIcon, FlagIcon, HeartIcon, MessageIcon, PlayIcon, QuestionIcon, ShareIcon, TrashIcon, UserIcon, VinylIcon } from '../icons.jsx';

// ============================================
// POST CARD COMPONENT
// ============================================
const PostCard = ({ post, onLike, userLikes, onCommentAdded, onUserClick, onSave, userSaves = [], onAuthRequired, categories = [], onDelete, communityCreatorId = null, onRemoveFromCommunity = null, onOpenFullPost = null, onQuestionClick = null, onAskQuestion = null, onCategoryClick = null, postCommunities = {}, onCommunityClick = null, allPosts = [], forkedPostsMap = {}, schoolsData = [], onSchoolClick = null, onToolClick = null, onPinPost = null, pinnedPostIds = [], userCommunityIds = [], builderRanks = [], userCommunities = [], onPostCommunitiesChange = null }) => {
  const { user, userSchoolIdMap = {}, savedPromptIds = [], toggleSavePrompt } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Impression analytics: count the post as "seen" once half the card is on
  // screen (deduped per session inside postEvents).
  const impressionRef = useRef(null);
  useEffect(() => observeImpression(impressionRef.current, post.id), [post.id]);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showRemixBuildModal, setShowRemixBuildModal] = useState(false);
  // Fallback lookup for the embedded original post. forkedPostsMap is
  // populated by loadForkedPostOriginals, but if this card renders before
  // that completes (or the parent doesn't thread the map), fetch directly.
  const [fetchedOriginal, setFetchedOriginal] = useState(null);
  useEffect(() => {
    if (!post.forked_from_post_id) return;
    if (post.original_post) return;
    if (forkedPostsMap && forkedPostsMap[post.forked_from_post_id]) return;
    if (allPosts && allPosts.find(p => p.id === post.forked_from_post_id)) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('posts')
        .select('*, profiles:user_id (id, username, display_name, avatar_emoji, avatar_url, name_color, builder_points)')
        .eq('id', post.forked_from_post_id)
        .maybeSingle();
      if (cancelled || !data) return;
      setFetchedOriginal({
        ...data,
        username: data.profiles?.username,
        display_name: data.profiles?.display_name,
        avatar_emoji: data.profiles?.avatar_emoji,
        avatar_url: data.profiles?.avatar_url,
      });
    })();
    return () => { cancelled = true; };
  }, [post.forked_from_post_id, post.original_post, forkedPostsMap, allPosts]);
  const [removing, setRemoving] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showCategoryOverlay, setShowCategoryOverlay] = useState(false);
  const [showAllPostCommunities, setShowAllPostCommunities] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); // null | { type: 'post'|'comment', id }
  const [deleteCommentId, setDeleteCommentId] = useState(null);
  const [deletingComment, setDeletingComment] = useState(false);
  const [editing, setEditing] = useState(false);

  const { profile: authProfile } = useAuth();
  // Pro entitlement (respects expiry) — gates the image-attach control in the
  // comment/reply composers. Server-side trigger enforces it for real.
  const isProMemberForImages = !!authProfile?.is_pro && (!authProfile?.pro_expires_at || new Date(authProfile.pro_expires_at) > new Date());
  const [commentImage, setCommentImage] = useState(null); // { file, preview } | null
  const [replyImage, setReplyImage] = useState(null);     // { file, preview } | null
  const pickCommentImage = (file) => setCommentImage({ file, preview: URL.createObjectURL(file) });
  const pickReplyImage = (file) => setReplyImage({ file, preview: URL.createObjectURL(file) });
  const isOwner = user && user.id === post.user_id;
  const postVideos = Array.isArray(post.videos)
    ? post.videos.map(normalizePostVideoItem).filter(Boolean)
    : [];
  const [playableVideos, setPlayableVideos] = useState(postVideos);
  const isAdmin = ADMIN_USERNAMES.includes(authProfile?.username);

  useEffect(() => {
    let cancelled = false;

    const resolvePlayableUrls = async () => {
      if (postVideos.length === 0) {
        setPlayableVideos([]);
        return;
      }

      const resolvedUrls = await Promise.all(
        postVideos.map(async (video) => ({
          ...video,
          url: await getPlayablePostVideoUrl(supabase, video)
        }))
      );

      if (!cancelled) {
        setPlayableVideos(resolvedUrls);
      }
    };

    resolvePlayableUrls();

    return () => {
      cancelled = true;
    };
  }, [post.videos]);

  const isCommunityCreator = user && communityCreatorId && user.id === communityCreatorId;
  const canRemoveFromCommunity = isCommunityCreator && onRemoveFromCommunity && !isOwner;

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    await onDelete(post);
    setDeleting(false);
    setShowDeleteConfirm(false);
  };

  const handleRemoveFromCommunity = async () => {
    if (!onRemoveFromCommunity) return;
    setRemoving(true);
    await onRemoveFromCommunity(post);
    setRemoving(false);
    setShowRemoveConfirm(false);
  };

  const handleDeleteComment = async (commentId) => {
    try {
      // Likes/replies/notifications cascade on delete. Select the deleted row back:
      // RLS-filtered deletes return no error but zero rows, so we must check.
      const { data, error } = await supabase.from('comments').delete().eq('id', commentId).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('You do not have permission to delete this comment.');
      setComments(prev => prev.filter(c => c.id !== commentId));
      // Builder-points deduction handled server-side by trg_builder_points_comments
    } catch (err) {
      console.error('Error deleting comment:', err);
      addToast(err.message || 'Failed to delete comment', 'error');
    }
  };

  const { addToast } = useToast();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [visibleCommentsCount, setVisibleCommentsCount] = useState(3);
  const [expandedPrompt, setExpandedPrompt] = useState(false);
  const [showPromptDropdown, setShowPromptDropdown] = useState(false);
  const [promptChunksVisible, setPromptChunksVisible] = useState(1);
  const [showFullPost, setShowFullPost] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [avatarLightbox, setAvatarLightbox] = useState(null);
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showCardShareMenu, setShowCardShareMenu] = useState(false);
  const [showShareToChat, setShowShareToChat] = useState(false);
  const cardShareMenuRef = useRef(null);

  // Close card share menu when clicking outside
  useEffect(() => {
    if (!showCardShareMenu) return;
    const handleClickOutside = (e) => {
      if (cardShareMenuRef.current && !cardShareMenuRef.current.contains(e.target)) {
        setShowCardShareMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCardShareMenu]);

  // Mobile enhanced image lightbox state
  const [mobileFeedLightbox, setMobileFeedLightbox] = useState(false);
  const [mobileFeedImageIndex, setMobileFeedImageIndex] = useState(0);
  const [mobileFeedZoom, setMobileFeedZoom] = useState(1);
  const [mobileFeedZoomPos, setMobileFeedZoomPos] = useState({ x: 0, y: 0 });
  const mobileFeedTouchStartRef = useRef(null);
  const mobileFeedLastDistRef = useRef(null);
  const mobileFeedLastCenterRef = useRef(null);
  const mobileFeedContainerRef = useRef(null);
  const mobileFeedSwipeRef = useRef(null);
  const [commentLikes, setCommentLikes] = useState({});
  const [userCommentLikes, setUserCommentLikes] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [expandedReplies, setExpandedReplies] = useState({});
  const [expandedDescription, setExpandedDescription] = useState(false);
  // Guard against duplicate submissions: a single in-flight request blocks
  // further presses of Enter or the Send button until the server replies.
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Mobile feed lightbox handlers (mobile only)
  const isMobileDevice = () => window.innerWidth <= 768;

  const handleMobileFeedImageClick = (imageIndex) => {
    if (isMobileDevice()) {
      setMobileFeedImageIndex(imageIndex);
      setMobileFeedLightbox(true);
      setMobileFeedZoom(1);
      setMobileFeedZoomPos({ x: 0, y: 0 });
    }
  };

  const closeMobileFeedLightbox = () => {
    setMobileFeedLightbox(false);
    setMobileFeedZoom(1);
    setMobileFeedZoomPos({ x: 0, y: 0 });
  };

  const getMobileFeedDistance = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleMobileFeedTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      mobileFeedLastDistRef.current = getMobileFeedDistance(e.touches[0], e.touches[1]);
      mobileFeedSwipeRef.current = null;
    } else if (e.touches.length === 1 && mobileFeedZoom > 1) {
      mobileFeedTouchStartRef.current = {
        x: e.touches[0].clientX - mobileFeedZoomPos.x,
        y: e.touches[0].clientY - mobileFeedZoomPos.y
      };
      mobileFeedSwipeRef.current = null;
    } else if (e.touches.length === 1 && mobileFeedZoom === 1) {
      mobileFeedSwipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
    }
  };

  const handleMobileFeedTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getMobileFeedDistance(e.touches[0], e.touches[1]);
      if (mobileFeedLastDistRef.current) {
        const scale = dist / mobileFeedLastDistRef.current;
        const newZoom = Math.min(Math.max(mobileFeedZoom * scale, 1), 4);
        setMobileFeedZoom(newZoom);
        if (newZoom === 1) setMobileFeedZoomPos({ x: 0, y: 0 });
      }
      mobileFeedLastDistRef.current = dist;
    } else if (e.touches.length === 1 && mobileFeedZoom > 1 && mobileFeedTouchStartRef.current) {
      const newX = e.touches[0].clientX - mobileFeedTouchStartRef.current.x;
      const newY = e.touches[0].clientY - mobileFeedTouchStartRef.current.y;
      const maxPan = (mobileFeedZoom - 1) * 150;
      setMobileFeedZoomPos({
        x: Math.min(Math.max(newX, -maxPan), maxPan),
        y: Math.min(Math.max(newY, -maxPan), maxPan)
      });
    }
  };

  const handleMobileFeedTouchEnd = (e) => {
    if (e.touches.length < 2) {
      mobileFeedLastDistRef.current = null;
      mobileFeedLastCenterRef.current = null;
    }
    if (e.touches.length === 0) {
      if (mobileFeedSwipeRef.current && mobileFeedZoom === 1 && post.images && post.images.length > 1) {
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - mobileFeedSwipeRef.current.x;
        const deltaY = touch.clientY - mobileFeedSwipeRef.current.y;
        const deltaTime = Date.now() - mobileFeedSwipeRef.current.time;
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50 && deltaTime < 300) {
          if (deltaX < 0) {
            setMobileFeedImageIndex((mobileFeedImageIndex + 1) % post.images.length);
          } else {
            setMobileFeedImageIndex((mobileFeedImageIndex - 1 + post.images.length) % post.images.length);
          }
        }
      }
      mobileFeedSwipeRef.current = null;
      mobileFeedTouchStartRef.current = null;
    }
  };

  const handleMobileFeedDoubleTap = (e) => {
    e.preventDefault();
    if (mobileFeedZoom > 1) {
      setMobileFeedZoom(1);
      setMobileFeedZoomPos({ x: 0, y: 0 });
    } else {
      setMobileFeedZoom(2.5);
    }
  };

  const isLiked = userLikes.includes(post.id);
  const isSaved = userSaves.includes(post.id);
  const isOwnPost = user && user.id === post.user_id;

  const loadComments = async () => {
    setLoadingComments(true);
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(username, display_name, avatar_emoji, avatar_url, name_color, builder_points)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    setComments(data || []);
    // Comments render now — like counts hydrate right after. This used to be
    // three sequential round trips before anything showed (~200-400ms each);
    // now it's one visible RTT plus one background RTT.
    setLoadingComments(false);

    if (data && data.length > 0) {
      const commentIds = data.map(c => c.id);
      // One query covers both per-comment totals and which ones I liked.
      const { data: likesData } = await supabase
        .from('comment_likes')
        .select('comment_id, user_id')
        .in('comment_id', commentIds);

      const likeCounts = {};
      (likesData || []).forEach(like => {
        likeCounts[like.comment_id] = (likeCounts[like.comment_id] || 0) + 1;
      });
      setCommentLikes(likeCounts);
      if (user) {
        setUserCommentLikes((likesData || []).filter(l => l.user_id === user.id).map(l => l.comment_id));
      }
    }
  };

  const handleLikeComment = async (commentId) => {
    if (!user) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    const isLiked = userCommentLikes.includes(commentId);
    const previousLikes = [...userCommentLikes];
    const previousCounts = { ...commentLikes };

    // Find the comment owner for notification
    const comment = comments.find(c => c.id === commentId);
    const commentOwnerId = comment?.user_id;

    try {
      if (isLiked) {
        setUserCommentLikes(prev => prev.filter(id => id !== commentId));
        setCommentLikes(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 1) - 1) }));
        const { error } = await supabase.from('comment_likes').delete().eq('user_id', user.id).eq('comment_id', commentId);
        if (error) throw error;
        // Delete the comment like notification
        if (commentOwnerId && commentOwnerId !== user.id) {
          await supabase.from('notifications').delete()
            .eq('user_id', commentOwnerId)
            .eq('actor_id', user.id)
            .eq('type', 'comment_like')
            .eq('comment_id', commentId);
        }
      } else {
        setUserCommentLikes(prev => [...prev, commentId]);
        setCommentLikes(prev => ({ ...prev, [commentId]: (prev[commentId] || 0) + 1 }));
        const { error } = await supabase.from('comment_likes').insert({ user_id: user.id, comment_id: commentId });
        if (error) throw error;
        // Create a comment like notification for the comment owner (don't notify yourself)
        if (commentOwnerId && commentOwnerId !== user.id) {
          await supabase.from('notifications').upsert({
            user_id: commentOwnerId,
            actor_id: user.id,
            type: 'comment_like',
            comment_id: commentId
          }, {
            onConflict: 'user_id,actor_id,type,comment_id',
            ignoreDuplicates: true
          });
        }
      }
    } catch (err) {
      console.error('Error liking comment:', err);
      setUserCommentLikes(previousLikes);
      setCommentLikes(previousCounts);
    }
  };

  const handleSubmitReply = async (parentCommentId) => {
    if (!user) {
      if (onAuthRequired) onAuthRequired();
      return;
    }
    // replyText is HTML from CommentEditor — strip tags for the empty check.
    // Allow an image-only reply (Pro) with no text.
    const replyPlain = (replyText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!replyPlain && !replyImage) return;
    if (isSubmittingReply) return;

    // Verify the parent comment still exists before replying
    const parentComment = comments.find(c => c.id === parentCommentId);
    if (!parentComment) {
      addToast('This comment may have been deleted. Refreshing...', 'error');
      setReplyText('');
      setReplyingTo(null);
      loadComments();
      return;
    }

    setIsSubmittingReply(true);
    // Snapshot and clear input synchronously so a second Enter/click can't
    // re-submit the same text while the first request is still in flight.
    // Persist sanitized HTML so reply formatting survives (parity with comments).
    const replyContent = sanitizeHtml(replyText);
    const replyImg = replyImage;
    const restoreReply = () => { setReplyText(replyContent); setReplyingTo(parentCommentId); setReplyImage(replyImg); };
    setReplyText('');
    setReplyingTo(null);
    setReplyImage(null);

    try {
      // Content moderation check (skip when there's no text — image-only reply)
      if (replyPlain) {
        try {
          const modResult = await moderateContent(replyPlain);
          if (!modResult.approved) {
            addToast(modResult.reason || 'Your reply was not approved by moderation.', 'error');
            restoreReply();
            return;
          }
        } catch (modErr) {
          addToast('Content moderation check failed. Please try again.', 'error');
          restoreReply();
          return;
        }
      }

      const replyImageUrl = await uploadCommentImage(replyImg, user.id);

      // For nested replies, always set parent_comment_id to the top-level comment
      // so the foreign key references a direct child of the post
      const topLevelParentId = parentComment.parent_comment_id || parentComment.id;

      const { data: newReplyData, error } = await supabase.from('comments').insert({
        user_id: user.id,
        post_id: post.id,
        content: replyContent,
        image_url: replyImageUrl,
        parent_comment_id: topLevelParentId
      }).select().single();

      if (error) {
        if (error.message?.includes('foreign key')) {
          addToast('This comment may have been deleted. Refreshing...', 'error');
          loadComments();
        } else if (error.code === '23505' || /duplicate/i.test(error.message || '')) {
          // Server-side dedupe trigger fired — message is already saved.
          addToast('Message sent', 'success');
          loadComments();
          onCommentAdded(post.id);
        } else {
          addToast(error.message, 'error');
          restoreReply();
        }
        return;
      }

      // Create notification for the comment author being replied to (don't notify yourself)
      if (parentComment.user_id && parentComment.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: parentComment.user_id,
          from_user_id: user.id,
          actor_id: user.id,
          type: 'reply',
          post_id: post.id,
          comment_id: newReplyData?.id
        });
      }
      // Also notify post owner if they're not the parent comment author and not the replier
      if (post.user_id && post.user_id !== user.id && post.user_id !== parentComment?.user_id) {
        await supabase.from('notifications').insert({
          user_id: post.user_id,
          from_user_id: user.id,
          actor_id: user.id,
          type: 'comment',
          post_id: post.id,
          comment_id: newReplyData?.id
        });
      }
      addToast('Message sent', 'success');
      loadComments();
      onCommentAdded(post.id);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const toggleReplies = (commentId) => {
    setExpandedReplies(prev => ({ ...prev, [commentId]: !prev[commentId] }));
  };

  // Organize comments into threads (top-level and replies)
  const topLevelComments = comments.filter(c => !c.parent_comment_id);
  const getReplies = (commentId) => comments.filter(c => c.parent_comment_id === commentId);
  const getAllReplies = (commentId) => {
    const direct = comments.filter(c => c.parent_comment_id === commentId);
    let all = [...direct];
    direct.forEach(r => { all = all.concat(getAllReplies(r.id)); });
    return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  };

  const handleToggleComments = () => {
    if (!showComments) {
      loadComments();
      setVisibleCommentsCount(3);
    }
    setShowComments(!showComments);
  };

  const handleShowMoreComments = () => {
    setVisibleCommentsCount(prev => prev + 6);
  };

  const handleShowLessComments = () => {
    setVisibleCommentsCount(3);
  };

  const handleSubmitComment = async () => {
    if (!user) {
      if (onAuthRequired) onAuthRequired();
      return;
    }
    // newComment is now HTML from CommentEditor — strip tags for the empty
    // check and for moderation, but persist the sanitized HTML so formatting
    // (bold/italic/underline/color) survives the round-trip.
    const commentPlain = (newComment || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!commentPlain && !commentImage) return; // allow image-only comments (Pro)
    if (isSubmittingComment) return;

    setIsSubmittingComment(true);
    // Snapshot and clear input synchronously so a second Enter/click can't
    // re-submit the same text while the first request is still in flight.
    const commentContent = sanitizeHtml(newComment);
    const commentImg = commentImage;
    const restoreComment = () => { setNewComment(commentContent); setCommentImage(commentImg); };
    setNewComment('');
    setCommentImage(null);

    try {
      // Content moderation check — run against plaintext so the LLM sees the
      // actual words, not the surrounding <span style="color: red"> wrappers.
      // Skip when there's no text (image-only comment).
      if (commentPlain) {
        try {
          const modResult = await moderateContent(commentPlain);
          if (!modResult.approved) {
            addToast(modResult.reason || 'Your comment was not approved by moderation.', 'error');
            restoreComment();
            return;
          }
        } catch (modErr) {
          addToast('Content moderation check failed. Please try again.', 'error');
          restoreComment();
          return;
        }
      }

      const commentImageUrl = await uploadCommentImage(commentImg, user.id);

      const { data: newCommentData, error } = await supabase.from('comments').insert({
        user_id: user.id,
        post_id: post.id,
        content: commentContent,
        image_url: commentImageUrl
      }).select().single();

      if (error) {
        if (error.code === '23505' || /duplicate/i.test(error.message || '')) {
          // Server-side dedupe trigger fired \u2014 message is already saved.
          addToast('Message sent', 'success');
          loadComments();
          onCommentAdded(post.id);
        } else {
          addToast(error.message, 'error');
          restoreComment();
        }
        return;
      }

      // Create notification for post owner (don't notify yourself)
      if (post.user_id && post.user_id !== user.id) {
        await supabase.from('notifications').insert({
          user_id: post.user_id,
          actor_id: user.id,
          type: 'comment',
          post_id: post.id,
          comment_id: newCommentData?.id
        });
      }
      addToast('Message sent', 'success');
      loadComments();
      onCommentAdded(post.id);
      // Builder points are awarded server-side by trg_builder_points_comments.
      // Show the +3 toast only on the user's first top-level answer to mirror trigger gating.
      if (post.is_question && post.user_id !== user.id) {
        try {
          const { count } = await supabase
            .from('comments')
            .select('id', { count: 'exact', head: true })
            .eq('post_id', post.id)
            .eq('user_id', user.id)
            .is('parent_comment_id', null);
          if (count === 1) {
            setTimeout(() => addToast('+3 \uD83D\uDCAC Answered a question!', 'points'), 300);
          }
        } catch (err) {
          console.error('Error checking answer count for points toast:', err);
        }
      }
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(post.prompt);
    addToast('Prompt copied!', 'success');
  };

  return (
    <div
      id={`post-${post.id}`}
      ref={impressionRef}
      className={`post-card-mobile ${post.is_trending ? 'trending' : ''} ${showFullPost ? 'expanded' : ''} ${post.is_question ? 'is-question' : ''} ${post.post_type === 'post' ? 'is-casual-post' : ''}`}
      onClick={() => onOpenFullPost && onOpenFullPost(post)}
      style={{ cursor: onOpenFullPost ? 'pointer' : 'default' }}
    >
      {/* Post Header */}
      <div className="post-header-mobile" onClick={(e) => e.stopPropagation()}>
        <div className="post-author-section" onClick={() => { if (onUserClick) { recordProfileVisit(post.id); onUserClick(post.user_id); } }} style={{ cursor: onUserClick ? 'pointer' : 'default' }}>
          <div
            className="post-avatar-mobile"
            onClick={(e) => {
              e.stopPropagation();
              // If onUserClick is provided, navigate to profile; otherwise show lightbox (for profile pages)
              if (onUserClick) {
                recordProfileVisit(post.id);
                onUserClick(post.user_id);
              } else if (post.avatar_url || post.avatar_emoji) {
                setAvatarLightbox({
                  imageUrl: post.avatar_url,
                  emoji: post.avatar_emoji,
                  username: post.username,
                  displayName: post.display_name
                });
              }
            }}
          >
            {post.avatar_url ? (
              <img src={post.avatar_url} alt="" className="post-avatar-img" />
            ) : post.avatar_emoji ? (
              <span className="post-avatar-emoji">{post.avatar_emoji}</span>
            ) : (
              <UserIcon />
            )}
          </div>
          <div className="post-author-info-mobile">
            <div
              className={`post-author-mobile ${post.name_color ? 'custom-color' : ''}`}
              style={post.name_color ? { color: post.name_color } : {}}
            >
              {post.display_name || post.username}
              <BuilderRankBadge points={post.builder_points ?? post.profiles?.builder_points} ranks={builderRanks} />
              <UserBadge username={post.username} size={16} />
              {(() => {
                const effectiveSchoolId = post.school_id || userSchoolIdMap[post.user_id];
                if (!effectiveSchoolId || !schoolsData.length) return null;
                const school = schoolsData.find(s => s.id === effectiveSchoolId);
                if (!school) return null;
                return (
                  <span
                    className="school-badge"
                    style={{ background: school.color, marginLeft: '-0.15rem', fontSize: '0.55rem', padding: '0.1rem 0.3rem' }}
                    onClick={(e) => { e.stopPropagation(); onSchoolClick && onSchoolClick(school.slug); }}
                  >
                    {school.short_name || school.name}
                  </span>
                );
              })()}
            </div>
            <div className="post-timestamp-mobile">
              @{post.username} · {formatTimeAgo(post.created_at)}
              {post.feed_source && (
                <span style={{ marginLeft: '0.4rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                  {post.feed_source === 'following' && '· From someone you follow'}
                  {post.feed_source === 'community' && '· From your communities'}
                  {post.feed_source === 'interest' && '· Based on your interests'}
                </span>
              )}
            </div>
          </div>
        </div>
        {post.is_question && (
          <span
            className="question-label-prominent"
            style={{
              cursor: onQuestionClick ? 'pointer' : 'default',
              backgroundColor: post.name_color || '#ffffff',
              color: '#000000',
              padding: '0.2rem 0.5rem',
              fontSize: '0.65rem',
              fontWeight: '700',
              borderRadius: '5px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
              flexShrink: 0,
              whiteSpace: 'nowrap'
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (onQuestionClick) onQuestionClick(post.id);
            }}
          >
            <QuestionIcon style={{ width: '12px', height: '12px' }} />
            Question
          </span>
        )}
        {post.is_automation && (
          <span
            className="automation-label-prominent"
            style={{
              backgroundColor: '#667eea',
              color: '#ffffff',
              padding: '0.2rem 0.5rem',
              fontSize: '0.65rem',
              fontWeight: '700',
              borderRadius: '5px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
              flexShrink: 0,
              whiteSpace: 'nowrap'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            Automation
          </span>
        )}
        <div className="post-header-right" onClick={(e) => e.stopPropagation()}>
          <div className="post-categories-container">
            {post.category_ids && post.category_ids.length > 0 && categories.length > 0 ? (
              (() => {
                const postCategories = post.category_ids
                  .map(catId => categories.find(c => c.id === catId))
                  .filter(Boolean);
                // Show only 1 category on mobile, 2-3 on desktop
                const isMobileView = window.innerWidth < 768;
                const maxVisible = isMobileView ? 1 : ((post.images && post.images.length > 0) ? 2 : 3);
                const displayCategories = showAllCategories ? postCategories : postCategories.slice(0, maxVisible);
                const remainingCount = postCategories.length - maxVisible;

                return (
                  <>
                    {displayCategories.map(cat => {
                      return (
                        <span
                          key={cat.id}
                          className="post-category-badge-mobile clickable"
                          style={{
                            background: '#000000',
                            color: '#ffffff'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onCategoryClick) {
                              onCategoryClick(cat.id);
                            }
                          }}
                        >
                          {cat.name}
                        </span>
                      );
                    })}
                    {postCategories.length > maxVisible && !showAllCategories && (
                      <span
                        className="post-category-badge-mobile more-categories"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isMobileView) {
                            setShowCategoryOverlay(true);
                          } else {
                            setShowAllCategories(true);
                          }
                        }}
                      >
                        +{remainingCount}
                      </span>
                    )}
                  </>
                );
              })()
            ) : post.category_name ? (
              <span
                className="post-category-badge-mobile clickable"
                style={{
                  background: '#000000',
                  color: '#ffffff'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onCategoryClick && post.category_id) {
                    onCategoryClick(post.category_id);
                  }
                }}
              >
                {post.category_name}
              </span>
            ) : null}
          </div>
          {(isOwner || isAdmin) && (
            <button
              className="post-delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              title="Edit post"
              style={{ color: 'var(--text-muted)' }}
            >
              <EditIcon />
            </button>
          )}
          {(isOwner || isAdmin) && (
            <button
              className="post-delete-btn"
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete post"
            >
              <TrashIcon />
            </button>
          )}
          {canRemoveFromCommunity && (
            <button
              className="post-delete-btn"
              onClick={() => setShowRemoveConfirm(true)}
              title="Remove from community"
              style={{ color: 'var(--text-muted)' }}
            >
              <TrashIcon />
            </button>
          )}
          {/* Share + report live up here in the corner to declutter the action bar. */}
          <div style={{ position: 'relative' }} ref={cardShareMenuRef}>
            <button className="post-header-action-btn" onClick={(e) => { e.stopPropagation(); setShowCardShareMenu(!showCardShareMenu); }} title="Share">
              <ShareIcon />
            </button>
            {showCardShareMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0,
                marginTop: '8px', background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px',
                padding: '6px', minWidth: '180px', zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
              }}>
                <button
                  onClick={() => {
                    const postUrl = buildPostShareUrl(post);
                    const title = post.title || 'AI Build';
                    const tool = post.ai_tool || 'AI';
                    const promptSnippet = (post.prompt || '').slice(0, 80);
                    const text = `${title}\n\n${promptSnippet ? `"${promptSnippet}${post.prompt && post.prompt.length > 80 ? '...' : ''}"` : ''}\n\nMade with ${tool} on @prmpted`;
                    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(postUrl)}`, '_blank', 'noopener,noreferrer,width=550,height=420');
                    setShowCardShareMenu(false);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px',
                    background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', borderRadius: '8px',
                    fontSize: '0.8rem', textAlign: 'left'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2d1b69'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  Share to X
                </button>
                <button
                  onClick={async () => {
                    const postUrl = buildPostShareUrl(post);
                    const ok = await copyToClipboard(postUrl);
                    addToast(ok ? 'Link copied!' : `Copy failed — ${postUrl}`, ok ? 'success' : 'error');
                    setShowCardShareMenu(false);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px',
                    background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', borderRadius: '8px',
                    fontSize: '0.8rem', textAlign: 'left'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2d1b69'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  Copy Link
                </button>
                <button
                  onClick={() => { setShowCardShareMenu(false); setShowRemixBuildModal(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px',
                    background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', borderRadius: '8px',
                    fontSize: '0.8rem', textAlign: 'left'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2d1b69'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <VinylIcon size={15} />
                  Remix this build
                </button>
                {user && (
                  <button
                    onClick={() => { setShowCardShareMenu(false); setShowShareToChat(true); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px',
                      background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', borderRadius: '8px',
                      fontSize: '0.8rem', textAlign: 'left'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#2d1b69'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <MessageIcon />
                    Send to chat
                  </button>
                )}
              </div>
            )}
          </div>
          {user && !isOwner && (
            <button
              className="post-header-action-btn"
              onClick={(e) => { e.stopPropagation(); setReportTarget({ type: 'post', id: post.id }); }}
              title="Report post"
            >
              <FlagIcon />
            </button>
          )}
        </div>
      </div>


      {/* Community Indicator */}
      {postCommunities[post.id] && postCommunities[post.id].length > 0 && (() => {
        const communities = postCommunities[post.id];
        const userMatch = communities.find(c => userCommunityIds.includes(c.id));
        const displayCommunity = userMatch || communities[0];
        const remainingCount = communities.length - 1;

        return (
          <div
            className="post-community-indicator"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              marginBottom: '0.75rem',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              position: 'relative',
              flexWrap: 'wrap'
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>Posted in</span>
            <span
              className="community-link"
              onClick={(e) => {
                e.stopPropagation();
                if (onCommunityClick) {
                  onCommunityClick(displayCommunity);
                }
              }}
              style={{
                cursor: onCommunityClick ? 'pointer' : 'default',
                color: 'var(--accent-primary)',
                fontWeight: '600',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: 'var(--bg-tertiary)',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                transition: 'all 0.2s ease'
              }}
            >
              <CommunityIcon style={{ width: '12px', height: '12px' }} />
              {displayCommunity.name}
            </span>
            {remainingCount > 0 && (
              <span
                className="community-more-badge"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAllPostCommunities(!showAllPostCommunities);
                }}
                style={{
                  cursor: 'pointer',
                  color: 'var(--accent-primary)',
                  fontWeight: '600',
                  fontSize: '0.75rem',
                  background: 'var(--bg-tertiary)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  transition: 'all 0.2s ease'
                }}
              >
                +{remainingCount}
              </span>
            )}
            {showAllPostCommunities && remainingCount > 0 && (
              <div
                className="community-all-popup"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '0.35rem',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                  padding: '0.5rem',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  minWidth: '180px'
                }}
              >
                <div style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.25rem 0.5rem' }}>
                  Posted in {communities.length} communities
                </div>
                {communities.map(community => (
                  <span
                    key={community.id}
                    className="community-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAllPostCommunities(false);
                      if (onCommunityClick) {
                        onCommunityClick(community);
                      }
                    }}
                    style={{
                      cursor: onCommunityClick ? 'pointer' : 'default',
                      color: 'var(--accent-primary)',
                      fontWeight: '600',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      background: 'var(--bg-tertiary)',
                      padding: '0.35rem 0.5rem',
                      borderRadius: '4px',
                      transition: 'all 0.2s ease',
                      fontSize: '0.8rem'
                    }}
                  >
                    <CommunityIcon style={{ width: '12px', height: '12px' }} />
                    {community.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Question Badge + Embedded Original Post (Quote Tweet Style).
          The is_question fallback only fires when fork_type isn't an explicit
          remix — otherwise questions/discussions that include a remix link
          would trip this branch and render with the wrong badge. */}
      {post.forked_from_post_id && (post.fork_type === 'question' || (post.is_question && !['remix', 'repost'].includes(post.fork_type))) && (() => {
        const originalPost = post.original_post || forkedPostsMap[post.forked_from_post_id] || allPosts.find(p => p.id === post.forked_from_post_id) || fetchedOriginal;
        return originalPost ? (
          <OriginalPostCard
            originalPost={originalPost}
            forkType="question"
            onOpenFullPost={onOpenFullPost}
            onUserClick={onUserClick}
            UserIcon={UserIcon}
          />
        ) : null;
      })()}

      {/* Remix / Repost Badge + Embedded Original Post */}
      {post.forked_from_post_id && (post.fork_type === 'remix' || post.fork_type === 'repost') && (() => {
        const originalPost = post.original_post || forkedPostsMap[post.forked_from_post_id] || allPosts.find(p => p.id === post.forked_from_post_id) || fetchedOriginal;
        return originalPost ? (
          <OriginalPostCard
            originalPost={originalPost}
            forkType={post.fork_type}
            onOpenFullPost={onOpenFullPost}
            onUserClick={onUserClick}
            UserIcon={UserIcon}
          />
        ) : null;
      })()}

      {/* Post Content */}
      <div className="post-content-mobile">
        <h2
          className="post-title-mobile"
          onClick={() => onOpenFullPost && onOpenFullPost(post)}
          style={{ cursor: onOpenFullPost ? 'pointer' : 'default' }}
        >
          <MentionText text={post.title} onUserClick={onUserClick} />
        </h2>
        {post.description && (
          <div className="post-description-wrapper">
            <div
              className="post-description-mobile"
              onClick={() => onOpenFullPost && onOpenFullPost(post)}
              style={{ cursor: onOpenFullPost ? 'pointer' : 'default' }}
            >
              <RichText text={post.description.length > 300 && !expandedDescription
                ? `${post.description.slice(0, 300)}...`
                : post.description} onUserClick={onUserClick} />
            </div>
            {post.description.length > 300 && (
              <button
                className="read-more-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedDescription(!expandedDescription);
                }}
              >
                {expandedDescription ? '▲ Read less' : '▼ Read more'}
              </button>
            )}
          </div>
        )}

        {/* Poll */}
        {Array.isArray(post.poll_options) && post.poll_options.length > 0 && (
          <PollWidget post={post} onAuthRequired={onAuthRequired} />
        )}


        {/* AI Tool Used */}
        {(post.ai_tool || (post.tool_ids && post.tool_ids.length > 0)) && (
          <div className="ai-tool-badge" onClick={(e) => e.stopPropagation()}>
            {post.post_type === 'post' || post.is_question ? 'Tools Mentioned' : 'Built with'}{' '}
            {post.tool_ids && post.tool_ids.length > 0 ? (
              <span className="tool-chips" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem', marginLeft: '0.25rem' }}>
                {post.tool_ids.map(toolId => {
                  const toolName = getToolDisplayName(toolId);
                  const model = getModelForTool(post, toolId, toolName);
                  return (
                    <span key={toolId} className="ai-tool-link" style={{ cursor: 'pointer', fontSize: '0.75rem' }} onClick={() => onToolClick && onToolClick(toolName, model)}>{toolName}{model ? ` (${model})` : ''}</span>
                  );
                })}
              </span>
            ) : post.ai_tool ? post.ai_tool.split(/,\s*/).map((tool, i, arr) => {
              const trimmed = tool.trim();
              if (!trimmed) return null;
              const toolId = AI_TOOL_NAME_TO_ID[trimmed] || normalizeToolKey(trimmed);
              const model = getModelForTool(post, toolId, trimmed);
              return (
                <span key={`${trimmed}-${i}`}>
                  <span className="ai-tool-link" style={{ cursor: 'pointer' }} onClick={() => onToolClick && onToolClick(trimmed, model)}>{trimmed}{model ? ` (${model})` : ''}</span>
                  {i < arr.length - 1 && ', '}
                </span>
              );
            }) : null}
          </div>
        )}

        {/* Project Media */}
        {post.images && post.images.length > 0 && (
          <div className={`post-images-container ${post.is_question ? 'question-images' : ''}`}>
            {post.images.length === 1 ? (
              <img
                src={post.images[0]}
                alt="Project preview"
                className={`post-image-single ${post.is_question ? 'question-image' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isMobileDevice()) {
                    handleMobileFeedImageClick(0);
                  } else {
                    setLightboxImage(post.images[0]);
                  }
                }}
              />
            ) : (
              <div className="post-images-grid">
                {post.images.slice(0, 2).map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt={`Project preview ${idx + 1}`}
                    className={`post-image-grid ${post.is_question ? 'question-image' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isMobileDevice()) {
                        handleMobileFeedImageClick(idx);
                      } else {
                        setGalleryIndex(idx);
                        setShowImageGallery(true);
                      }
                    }}
                  />
                ))}
                {post.images.length > 2 && (
                  <button
                    className="view-more-images-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isMobileDevice()) {
                        handleMobileFeedImageClick(0);
                      } else {
                        setGalleryIndex(0);
                        setShowImageGallery(true);
                      }
                    }}
                  >
                    +{post.images.length - 2} more
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {playableVideos.length > 0 && (
          <div className={`post-images-container ${post.is_question ? 'question-images' : ''}`}>
            <div className="post-images-grid single-row" style={{ position: 'relative' }}>
              <video
                key={playableVideos[0].path || playableVideos[0].url || 0}
                src={playableVideos[0].url}
                controls
                preload="metadata"
                playsInline
                className="post-image-grid"
                style={{ height: 'auto', maxHeight: '500px', objectFit: 'contain', background: '#000' }}
                onClick={(e) => e.stopPropagation()}
              />
              {playableVideos.length > 1 && (
                <div
                  style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.72)', color: '#fff', padding: '6px 12px', borderRadius: 14, fontSize: 12, fontWeight: 600, pointerEvents: 'none', letterSpacing: 0.2 }}
                >
                  +{playableVideos.length - 1} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Try it Now / Open Link Button */}
        {post.demo_url && (
          <a
            href={ensureAbsoluteUrl(post.demo_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="try-it-now-btn"
            onClick={(e) => e.stopPropagation()}
          >
            {post.post_type === 'post' ? (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Open Link</>
            ) : (
              <><PlayIcon /> Try it now</>
            )}
          </a>
        )}

        {/* View GitHub Repo Button - hide for casual posts */}
        {post.github_repo_url && post.post_type !== 'post' && (
          <a
            href={ensureAbsoluteUrl(post.github_repo_url)}
            rel="noopener noreferrer"
            className="github-repo-btn"
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            View code
          </a>
        )}

        {/* Design doc link */}
        {post.design_doc_url && post.post_type !== 'post' && (
          <a
            href={ensureAbsoluteUrl(post.design_doc_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="github-repo-btn"
            onClick={(e) => e.stopPropagation()}
            title="Read the design doc for this build"
          >
            📄 Design doc
          </a>
        )}

        {/* Remix Build button — only when design doc is present */}
        {post.design_doc_url && post.post_type !== 'post' && (
          <button
            type="button"
            className="github-repo-btn"
            onClick={(e) => { e.stopPropagation(); setShowRemixBuildModal(true); }}
            title="Generate a starter prompt to remix this build with your AI"
          >
            <VinylIcon size={16} /> Remix Build
          </button>
        )}

        {/* View Prompt(s) Collapsible Dropdown - Only for builds with prompts */}
        {!post.is_question && post.post_type !== 'post' && post.prompt && (
        <div className="prompt-dropdown-wrapper" onClick={(e) => e.stopPropagation()}>
          <button className="view-prompt-btn" onClick={(e) => { e.stopPropagation(); setShowPromptDropdown(!showPromptDropdown); setPromptChunksVisible(1); }}>
            <span style={post.name_color ? { color: post.name_color } : {}}>
              @{post.username}'s prompt(s)
            </span>
            <span style={post.name_color ? { color: post.name_color } : {}}>{showPromptDropdown ? <ChevronUpIcon /> : <ChevronDownIcon />}</span>
          </button>
          {showPromptDropdown && (() => {
            const CHUNK_SIZE = 500;
            const chunks = [];
            for (let i = 0; i < post.prompt.length; i += CHUNK_SIZE) {
              chunks.push(post.prompt.slice(i, i + CHUNK_SIZE));
            }
            const visibleText = chunks.slice(0, promptChunksVisible).join('');
            const hasMore = promptChunksVisible < chunks.length;
            return (
              <div className="prompt-dropdown-content">
                <div className="prompt-header">
                  <div className="prompt-label-mobile" style={post.name_color ? { color: post.name_color } : {}}>
                    @{post.username}'s prompt(s)
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button className="copy-prompt-btn" onClick={(e) => { e.stopPropagation(); handleCopyPrompt(); }}>
                      <CopyIcon /> copy prompts
                    </button>
                    <button
                      className="copy-prompt-btn"
                      onClick={(e) => { e.stopPropagation(); toggleSavePrompt && toggleSavePrompt(post.id, savedPromptIds.includes(post.id)); }}
                      title={savedPromptIds.includes(post.id) ? 'Saved to your prompts — click to remove' : 'Save this prompt'}
                    >
                      <BookmarkIcon filled={savedPromptIds.includes(post.id)} /> {savedPromptIds.includes(post.id) ? 'saved' : 'save'}
                    </button>
                  </div>
                </div>
                <p className="prompt-text-mobile">{visibleText}{hasMore ? '...' : ''}</p>
                <div className="prompt-chunk-controls">
                  {hasMore && (
                    <button className="expand-prompt-mobile" onClick={() => setPromptChunksVisible(promptChunksVisible + 1)}>
                      <ChevronDownIcon /> Read more
                    </button>
                  )}
                  {promptChunksVisible > 1 && (
                    <button className="expand-prompt-mobile" onClick={() => setPromptChunksVisible(Math.max(1, promptChunksVisible - 1))}>
                      <ChevronUpIcon /> View less
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="post-actions-mobile" onClick={(e) => e.stopPropagation()}>
        <button
          className={`action-btn-mobile like-btn ${isLiked ? 'liked' : ''}`}
          onClick={() => onLike(post.id, isLiked)}
        >
          <HeartIcon filled={isLiked} />
          <span>{post.likes_count || 0}</span>
        </button>
        <button className={`action-btn-mobile ${showComments ? 'active' : ''}`} onClick={handleToggleComments}>
          <CommentIcon />
          <span>{post.comments_count}</span>
        </button>
        {post.view_count > 0 && (
          <span className="view-count">
            <EyeIcon /> {post.view_count}
          </span>
        )}
        {post.difficulty && (
          <span className={`difficulty-badge ${post.difficulty}`}>
            {post.difficulty}
          </span>
        )}
        <button
          className="action-btn-mobile"
          onClick={(e) => { e.stopPropagation(); if (!user) { onAuthRequired && onAuthRequired(); return; } setShowRemixBuildModal(true); }}
          title="Remix"
        >
          <VinylIcon size={18} />
        </button>
        <RepostButton post={post} onAuthRequired={onAuthRequired} className="action-btn-mobile" size={18} />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <button
          className={`action-btn-mobile ${isSaved ? 'saved' : ''}`}
          onClick={() => onSave && onSave(post.id, isSaved)}
        >
          <BookmarkIcon filled={isSaved} />
          <span>{isSaved ? 'Saved' : 'Save'}</span>
        </button>
        </div>
      </div>

      {/* Report Modal */}
      <ReportModal
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        contentType={reportTarget?.type || 'post'}
        contentId={reportTarget?.id}
        userId={user?.id}
        supabase={supabase}
      />

      {/* Share-to-chat Modal */}
      <ShareToChatModal
        isOpen={showShareToChat}
        onClose={() => setShowShareToChat(false)}
        entity={{ kind: 'post', id: post.id }}
        currentUserId={user?.id}
      />

      {/* Comments Section */}
      {showComments && (
        <div className="comments-section-mobile" onClick={(e) => e.stopPropagation()}>
          <div className="comments-header-mobile"><CommentIcon /> Comments ({post.comments_count})</div>

          {loadingComments ? (
            <div className="loading-comments">Loading...</div>
          ) : comments.length === 0 ? (
            <div className="no-comments">No comments yet. Be the first!</div>
          ) : (
            <>
              <div className="comments-list">
                {topLevelComments.slice(0, visibleCommentsCount).map(comment => {
                  const replies = getAllReplies(comment.id);
                  const isCommentLiked = userCommentLikes.includes(comment.id);
                  const likeCount = commentLikes[comment.id] || 0;

                  return (
                    <div key={comment.id} className="comment-thread">
                      <div className="comment-mobile">
                        <div
                          className="comment-avatar-mobile"
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onUserClick && comment.user_id) {
                              onUserClick(comment.user_id);
                            } else if (comment.profiles?.avatar_url || comment.profiles?.avatar_emoji) {
                              setAvatarLightbox({
                                imageUrl: comment.profiles?.avatar_url,
                                emoji: comment.profiles?.avatar_emoji,
                                username: comment.profiles?.username
                              });
                            }
                          }}
                        >
                          {comment.profiles?.avatar_url ? (
                            <img src={comment.profiles.avatar_url} alt="" className="comment-avatar-img" />
                          ) : comment.profiles?.avatar_emoji ? (
                            <span className="comment-avatar-emoji">{comment.profiles.avatar_emoji}</span>
                          ) : (
                            <UserIcon />
                          )}
                        </div>
                        <div className="comment-content-mobile">
                          <div
                            className="comment-author-mobile"
                            style={{ ...(comment.profiles?.name_color ? { color: comment.profiles.name_color } : {}), cursor: onUserClick ? 'pointer' : 'default' }}
                            onClick={(e) => { e.stopPropagation(); if (onUserClick && comment.user_id) onUserClick(comment.user_id); }}
                          >
                            {comment.profiles?.display_name || comment.profiles?.username || 'unknown'}
                            <BuilderRankBadge points={comment.profiles?.builder_points} ranks={builderRanks} />
                            <UserBadge username={comment.profiles?.username} size={15} />
                          </div>
                          <div className="comment-text-mobile"><CommentContent text={comment.content} onUserClick={onUserClick} /></div>
                          <CommentImage url={comment.image_url} />
                          <div className="comment-actions-row">
                            <span className="comment-time-mobile">{formatTimeAgo(comment.created_at)}</span>
                            <button
                              className={`comment-action-btn ${isCommentLiked ? 'liked' : ''}`}
                              onClick={() => handleLikeComment(comment.id)}
                            >
                              <HeartIcon filled={isCommentLiked} /> {likeCount > 0 && likeCount}
                            </button>
                            <button
                              className="comment-action-btn"
                              onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                            >
                              <CommentIcon /> Reply
                            </button>
                            {replies.length > 0 && (
                              <button
                                className="comment-action-btn"
                                onClick={() => toggleReplies(comment.id)}
                              >
                                {expandedReplies[comment.id] ? 'Hide' : 'View'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                              </button>
                            )}
                            {user && user.id !== comment.user_id && (
                              <button
                                className="comment-action-btn"
                                onClick={() => setReportTarget({ type: 'comment', id: comment.id })}
                                title="Report comment"
                              >
                                <FlagIcon />
                              </button>
                            )}
                            {(isAdmin || isOwner || (user && user.id === comment.user_id)) && (
                              <button
                                className="comment-action-btn"
                                onClick={() => setDeleteCommentId(comment.id)}
                                title="Delete comment"
                                style={{ color: 'var(--accent-red, #ef4444)' }}
                              >
                                <TrashIcon />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Reply form */}
                      {replyingTo === comment.id && (
                        <div className="reply-form">
                          <CommentEditor
                            className="reply-input"
                            placeholder={`Reply to @${comment.profiles?.username || 'user'}...`}
                            value={replyText}
                            onChange={setReplyText}
                            onSubmit={() => !isSubmittingReply && handleSubmitReply(comment.id)}
                            disabled={isSubmittingReply}
                            allowImage={isProMemberForImages}
                            image={replyImage}
                            onPickImage={pickReplyImage}
                            onClearImage={() => setReplyImage(null)}
                          />
                          <button
                            className="reply-submit-btn"
                            onClick={() => handleSubmitReply(comment.id)}
                            disabled={!replyText.trim() || isSubmittingReply}
                          >
                            {isSubmittingReply ? 'Sending…' : 'Reply'}
                          </button>
                          <button
                            className="reply-cancel-btn"
                            onClick={() => { setReplyingTo(null); setReplyText(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Replies */}
                      {expandedReplies[comment.id] && replies.length > 0 && (
                        <div className="replies-list">
                          {replies.map(reply => {
                            const isReplyLiked = userCommentLikes.includes(reply.id);
                            const replyLikeCount = commentLikes[reply.id] || 0;

                            return (
                              <div key={reply.id}>
                                <div className="comment-mobile reply">
                                  <div
                                    className="comment-avatar-mobile"
                                    style={{ cursor: 'pointer' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onUserClick && reply.user_id) {
                                        onUserClick(reply.user_id);
                                      } else if (reply.profiles?.avatar_url || reply.profiles?.avatar_emoji) {
                                        setAvatarLightbox({
                                          imageUrl: reply.profiles?.avatar_url,
                                          emoji: reply.profiles?.avatar_emoji,
                                          username: reply.profiles?.username
                                        });
                                      }
                                    }}
                                  >
                                    {reply.profiles?.avatar_url ? (
                                      <img src={reply.profiles.avatar_url} alt="" className="comment-avatar-img" />
                                    ) : reply.profiles?.avatar_emoji ? (
                                      <span className="comment-avatar-emoji">{reply.profiles.avatar_emoji}</span>
                                    ) : (
                                      <UserIcon />
                                    )}
                                  </div>
                                  <div className="comment-content-mobile">
                                    <div
                                      className="comment-author-mobile"
                                      style={{ ...(reply.profiles?.name_color ? { color: reply.profiles.name_color } : {}), cursor: onUserClick ? 'pointer' : 'default' }}
                                      onClick={(e) => { e.stopPropagation(); if (onUserClick && reply.user_id) onUserClick(reply.user_id); }}
                                    >
                                      {reply.profiles?.display_name || reply.profiles?.username || 'unknown'}
                                      <BuilderRankBadge points={reply.profiles?.builder_points} ranks={builderRanks} />
                                      <UserBadge username={reply.profiles?.username} size={15} />
                                    </div>
                                    <div className="comment-text-mobile"><CommentContent text={reply.content} onUserClick={onUserClick} /></div>
                                    <CommentImage url={reply.image_url} />
                                    <div className="comment-actions-row">
                                      <span className="comment-time-mobile">{formatTimeAgo(reply.created_at)}</span>
                                      <button
                                        className={`comment-action-btn ${isReplyLiked ? 'liked' : ''}`}
                                        onClick={() => handleLikeComment(reply.id)}
                                      >
                                        <HeartIcon filled={isReplyLiked} /> {replyLikeCount > 0 && replyLikeCount}
                                      </button>
                                      <button
                                        className="comment-action-btn"
                                        onClick={() => setReplyingTo(replyingTo === reply.id ? null : reply.id)}
                                      >
                                        <CommentIcon /> Reply
                                      </button>
                                      {user && user.id !== reply.user_id && (
                                        <button
                                          className="comment-action-btn"
                                          onClick={() => setReportTarget({ type: 'comment', id: reply.id })}
                                          title="Report reply"
                                        >
                                          <FlagIcon />
                                        </button>
                                      )}
                                      {(isAdmin || isOwner || (user && user.id === reply.user_id)) && (
                                        <button
                                          className="comment-action-btn"
                                          onClick={() => setDeleteCommentId(reply.id)}
                                          title="Delete reply"
                                          style={{ color: 'var(--accent-red, #ef4444)' }}
                                        >
                                          <TrashIcon />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {replyingTo === reply.id && (
                                  <div className="reply-form">
                                    <CommentEditor
                                      className="reply-input"
                                      placeholder={`Reply to @${reply.profiles?.username || 'user'}...`}
                                      value={replyText}
                                      onChange={setReplyText}
                                      onSubmit={() => !isSubmittingReply && handleSubmitReply(reply.id)}
                                      disabled={isSubmittingReply}
                                      allowImage={isProMemberForImages}
                                      image={replyImage}
                                      onPickImage={pickReplyImage}
                                      onClearImage={() => setReplyImage(null)}
                                    />
                                    <button
                                      className="reply-submit-btn"
                                      onClick={() => handleSubmitReply(reply.id)}
                                      disabled={!replyText.trim() || isSubmittingReply}
                                    >
                                      {isSubmittingReply ? 'Sending…' : 'Reply'}
                                    </button>
                                    <button
                                      className="reply-cancel-btn"
                                      onClick={() => { setReplyingTo(null); setReplyText(''); }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="comments-show-more-less">
                {topLevelComments.length > visibleCommentsCount && (
                  <button className="show-more-comments-btn" onClick={handleShowMoreComments}>
                    Show more ({topLevelComments.length - visibleCommentsCount} more)
                  </button>
                )}
                {visibleCommentsCount > 3 && (
                  <button className="show-less-comments-btn" onClick={handleShowLessComments}>
                    Show less
                  </button>
                )}
              </div>
            </>
          )}

          <div className="comment-form-mobile">
            {/* Replaced the plain <textarea> with the rich CommentEditor so
                users can apply Bold / Italic / Underline / color to their
                comment text. Output is sanitized HTML stored back in
                `comments.content` — same column, no schema change. */}
            <CommentEditor
              className="comment-input-mobile"
              placeholder="Add a comment..."
              value={newComment}
              onChange={setNewComment}
              onSubmit={handleSubmitComment}
              disabled={isSubmittingComment}
              allowImage={isProMemberForImages}
              image={commentImage}
              onPickImage={pickCommentImage}
              onClearImage={() => setCommentImage(null)}
            />
            <button
              className="comment-submit-mobile"
              onClick={handleSubmitComment}
              disabled={!newComment.trim() || isSubmittingComment}
            >
              {isSubmittingComment ? 'Sending…' : 'Send'}
            </button>
            <AdvisorMentionHint text={newComment} />
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="image-lightbox-overlay"
          onClick={() => setLightboxImage(null)}
        >
          <div className="image-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="image-lightbox-close"
              onClick={() => setLightboxImage(null)}
            >
              ×
            </button>
            <img src={lightboxImage} alt="Full size preview" />
          </div>
        </div>
      )}

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

      {/* Image Gallery Modal */}
      {showImageGallery && post.images && post.images.length > 0 && (
        <div
          className="image-gallery-overlay"
          onClick={() => setShowImageGallery(false)}
        >
          <div className="image-gallery-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="image-gallery-close"
              onClick={() => setShowImageGallery(false)}
            >
              ×
            </button>
            <div className="image-gallery-main">
              <button
                className="image-gallery-nav prev"
                onClick={() => setGalleryIndex((galleryIndex - 1 + post.images.length) % post.images.length)}
                disabled={post.images.length <= 1}
              >
                ‹
              </button>
              <img
                src={post.images[galleryIndex]}
                alt={`Image ${galleryIndex + 1} of ${post.images.length}`}
                className="image-gallery-image"
              />
              <button
                className="image-gallery-nav next"
                onClick={() => setGalleryIndex((galleryIndex + 1) % post.images.length)}
                disabled={post.images.length <= 1}
              >
                ›
              </button>
            </div>
            <div className="image-gallery-counter">
              {galleryIndex + 1} / {post.images.length}
            </div>
            <div className="image-gallery-thumbnails">
              {post.images.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`Thumbnail ${idx + 1}`}
                  className={`image-gallery-thumb ${idx === galleryIndex ? 'active' : ''}`}
                  onClick={() => setGalleryIndex(idx)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Feed Image Lightbox with Pinch-to-Zoom */}
      {mobileFeedLightbox && post.images && post.images.length > 0 && (
        <div className="mobile-image-lightbox" onClick={mobileFeedZoom === 1 ? closeMobileFeedLightbox : undefined}>
          <button className="mobile-lightbox-close" onClick={closeMobileFeedLightbox}>✕</button>

          <div className="mobile-lightbox-zoom-hint">
            {mobileFeedZoom > 1 ? `${Math.round(mobileFeedZoom * 100)}%` : 'Pinch to zoom'}
          </div>

          <div
            className="mobile-lightbox-image-container"
            ref={mobileFeedContainerRef}
            onTouchStart={handleMobileFeedTouchStart}
            onTouchMove={handleMobileFeedTouchMove}
            onTouchEnd={handleMobileFeedTouchEnd}
            onDoubleClick={handleMobileFeedDoubleTap}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={post.images[mobileFeedImageIndex]}
              alt={post.title}
              className="mobile-lightbox-image"
              style={{
                transform: `scale(${mobileFeedZoom}) translate(${mobileFeedZoomPos.x / mobileFeedZoom}px, ${mobileFeedZoomPos.y / mobileFeedZoom}px)`,
                transition: mobileFeedZoom === 1 ? 'transform 0.2s ease' : 'none'
              }}
              draggable={false}
            />
          </div>

          {post.images.length > 1 && mobileFeedZoom === 1 && (
            <>
              <button
                className="mobile-lightbox-nav prev"
                onClick={(e) => { e.stopPropagation(); setMobileFeedImageIndex((mobileFeedImageIndex - 1 + post.images.length) % post.images.length); }}
              >
                ‹
              </button>
              <button
                className="mobile-lightbox-nav next"
                onClick={(e) => { e.stopPropagation(); setMobileFeedImageIndex((mobileFeedImageIndex + 1) % post.images.length); }}
              >
                ›
              </button>
              <div className="mobile-lightbox-counter" onClick={(e) => e.stopPropagation()}>
                {mobileFeedImageIndex + 1} / {post.images.length}
              </div>
            </>
          )}

          {mobileFeedZoom > 1 && (
            <button
              className="mobile-lightbox-reset-zoom"
              onClick={(e) => { e.stopPropagation(); setMobileFeedZoom(1); setMobileFeedZoomPos({ x: 0, y: 0 }); }}
            >
              Reset Zoom
            </button>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="delete-confirm-overlay" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Post?</h3>
            <p>Are you sure you want to delete this post? This action cannot be undone.</p>
            <div className="delete-confirm-actions">
              <button
                className="delete-confirm-cancel"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="delete-confirm-delete"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Comment Confirmation Modal */}
      {deleteCommentId && (
        <div className="delete-confirm-overlay" onClick={() => !deletingComment && setDeleteCommentId(null)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Comment?</h3>
            <p>Are you sure you want to delete this comment? This action cannot be undone.</p>
            <div className="delete-confirm-actions">
              <button
                className="delete-confirm-cancel"
                onClick={() => setDeleteCommentId(null)}
                disabled={deletingComment}
              >
                Cancel
              </button>
              <button
                className="delete-confirm-delete"
                onClick={async () => {
                  setDeletingComment(true);
                  await handleDeleteComment(deleteCommentId);
                  setDeletingComment(false);
                  setDeleteCommentId(null);
                }}
                disabled={deletingComment}
              >
                {deletingComment ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Post Modal (shared component) */}
      {editing && (
        <EditPostModal
          post={post}
          categories={categories}
          userCommunities={userCommunities}
          postCommunities={postCommunities}
          onPostCommunitiesChange={onPostCommunitiesChange}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Remove from Community Confirmation Modal */}
      {showRemoveConfirm && (
        <div className="delete-confirm-overlay" onClick={() => !removing && setShowRemoveConfirm(false)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Remove from Community?</h3>
            <p>Are you sure you want to remove this post from your community? The post will still exist in the main feed.</p>
            <div className="delete-confirm-actions">
              <button
                className="delete-confirm-cancel"
                onClick={() => setShowRemoveConfirm(false)}
                disabled={removing}
              >
                Cancel
              </button>
              <button
                className="delete-confirm-delete"
                onClick={handleRemoveFromCommunity}
                disabled={removing}
              >
                {removing ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Category Overlay */}
      {showCategoryOverlay && post.category_ids && post.category_ids.length > 0 && categories.length > 0 && (
        <div className="category-overlay-backdrop" onClick={(e) => { e.stopPropagation(); setShowCategoryOverlay(false); }}>
          <div className="category-overlay-content" onClick={(e) => e.stopPropagation()}>
            <div className="category-overlay-header">
              <h3 className="category-overlay-title">Categories</h3>
              <button className="category-overlay-close" onClick={() => setShowCategoryOverlay(false)}>
                &times;
              </button>
            </div>
            <div className="category-overlay-list">
              {post.category_ids
                .map(catId => categories.find(c => c.id === catId))
                .filter(Boolean)
                .map(cat => (
                  <button
                    key={cat.id}
                    className="category-overlay-item"
                    onClick={() => {
                      setShowCategoryOverlay(false);
                      if (onCategoryClick) onCategoryClick(cat.id);
                    }}
                  >
                    {cat.name}
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      )}

      <RemixBuildModal
        isOpen={showRemixBuildModal}
        post={post}
        onClose={() => setShowRemixBuildModal(false)}
      />

    </div>
  );
};

export default PostCard;
