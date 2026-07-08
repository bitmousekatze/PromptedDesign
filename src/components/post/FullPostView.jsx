import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../../lib/supabase.js';
import { useAuth, useToast, ADMIN_USERNAMES, AI_TOOL_NAME_TO_ID, copyToClipboard, getModelForTool, getToolDisplayName, normalizeToolKey, formatTimeAgo, buildPostShareUrl, OG_IMAGE_URL } from '../../lib/appShared.js';
import { normalizePostVideoItem, getPlayablePostVideoUrl } from '../../lib/storage.js';
import { moderateContent } from '../../lib/moderation.js';
import { sanitizeHtml } from '../../lib/sanitize.js';
import { recordProfileVisit } from '../../lib/postEvents.js';
import { buildPostPath } from '../../lib/postUrl.js';
import { RichText } from '../../lib/richText.jsx';
import CommentEditor from '../CommentEditor.jsx';
import OriginalPostCard from '../OriginalPostCard.jsx';
import RemixBuildModal from '../RemixBuildModal.jsx';
import { UserBadge, BuilderRankBadge } from '../sharedUI.jsx';
import { COMMENT_EMOJIS, CommentContent, CommentImage, MentionText, AdvisorMentionHint, uploadCommentImage, PollWidget, ReportModal, RepostButton } from './postShared.jsx';
import EditPostModal from './EditPostModal.jsx';
import { BookmarkIcon, ChevronDownIcon, ChevronLeftIcon, CommentIcon, CopyIcon, EditIcon, FlagIcon, HeartIcon, PlayIcon, ShareIcon, TrashIcon, UserIcon, VinylIcon } from '../icons.jsx';

// Build the unified [...images, ...videos] array consumed by both the feed
// preview and the full-post carousel, so multiple videos behave like
// multiple images instead of fighting for the layout slot.
const buildPostMediaItems = (post, playableVideos) => {
  const items = [];
  if (post && Array.isArray(post.images)) {
    post.images.forEach((url, idx) => {
      if (url) items.push({ kind: 'image', url, key: `img-${idx}` });
    });
  }
  if (Array.isArray(playableVideos)) {
    playableVideos.forEach((video, idx) => {
      if (video?.url) items.push({ kind: 'video', url: video.url, path: video.path, key: `vid-${video.path || video.url || idx}` });
    });
  }
  return items;
};

// ============================================
// FULL POST VIEW COMPONENT (Twitter-style expanded view)
// ============================================
const FullPostView = ({ post, onClose, onLike, userLikes, onCommentAdded, onUserClick, onSave, userSaves = [], onAuthRequired, categories = [], allPosts = [], forkedPostsMap = {}, onCategoryClick = null, onDelete = null, onToolClick = null, schoolsData = [], onSchoolClick = null, onRecordView = null, onOpenFullPost = null, onAskQuestion = null, builderRanks = [] }) => {
  const { user, profile: authProfile, savedPromptIds = [], toggleSavePrompt } = useAuth();
  const isAdmin = ADMIN_USERNAMES.includes(authProfile?.username);
  // Pro entitlement (respects expiry) gates the comment/reply image-attach control.
  const isProMemberForImages = !!authProfile?.is_pro && (!authProfile?.pro_expires_at || new Date(authProfile.pro_expires_at) > new Date());
  const [commentImage, setCommentImage] = useState(null); // { file, preview } | null
  const [replyImage, setReplyImage] = useState(null);     // { file, preview } | null
  const pickCommentImage = (file) => setCommentImage({ file, preview: URL.createObjectURL(file) });
  const pickReplyImage = (file) => setReplyImage({ file, preview: URL.createObjectURL(file) });
  const { addToast } = useToast();
  const [mediaIndex, setMediaIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [showRemixBuildModalFP, setShowRemixBuildModalFP] = useState(false);
  // Fallback fetch for the embedded original - mirrors the one in PostCard.
  const [fetchedOriginalFP, setFetchedOriginalFP] = useState(null);
  useEffect(() => {
    if (!post?.forked_from_post_id) return;
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
      setFetchedOriginalFP({
        ...data,
        username: data.profiles?.username,
        display_name: data.profiles?.display_name,
        avatar_emoji: data.profiles?.avatar_emoji,
        avatar_url: data.profiles?.avatar_url,
      });
    })();
    return () => { cancelled = true; };
  }, [post?.forked_from_post_id, post?.original_post, forkedPostsMap, allPosts]);

  // Record view when post is opened
  useEffect(() => {
    if (post?.id && onRecordView) {
      onRecordView(post.id, 'detail');
    }
  }, [post?.id]);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const commentInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const [commentLikes, setCommentLikes] = useState({});
  const [userCommentLikes, setUserCommentLikes] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [expandedReplies, setExpandedReplies] = useState({});
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [mobileImageExpanded, setMobileImageExpanded] = useState(false);
  // Guard against duplicate submissions: a single in-flight request blocks
  // further presses of Enter or the Post/Reply button until the server replies.
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const insertEmojiIntoComment = (emoji) => {
    const ta = commentInputRef.current;
    if (!ta) {
      setNewComment((prev) => prev + emoji);
      return;
    }
    const start = ta.selectionStart ?? newComment.length;
    const end = ta.selectionEnd ?? newComment.length;
    const next = newComment.slice(0, start) + emoji + newComment.slice(end);
    setNewComment(next);
    requestAnimationFrame(() => {
      if (commentInputRef.current) {
        commentInputRef.current.focus();
        const cursor = start + emoji.length;
        commentInputRef.current.setSelectionRange(cursor, cursor);
      }
    });
  };

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleDown = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showEmojiPicker]);

  // Mobile zoom state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef(null);
  const lastTouchDistanceRef = useRef(null);
  const lastTouchCenterRef = useRef(null);
  const imageContainerRef = useRef(null);
  const swipeStartRef = useRef(null);

  const isLiked = userLikes.includes(post.id);
  const isSaved = userSaves.includes(post.id);
  const isOwner = user && user.id === post.user_id;
  const postVideos = Array.isArray(post.videos)
    ? post.videos.map(normalizePostVideoItem).filter(Boolean)
    : [];
  const [playableVideos, setPlayableVideos] = useState(postVideos);
  const mediaItems = buildPostMediaItems(post, playableVideos);
  // Positions of image-kind items inside mediaItems, so the mobile lightbox
  // (which can only display images) can navigate without landing on a video.
  const imagePositions = mediaItems
    .map((m, idx) => (m.kind === 'image' ? idx : -1))
    .filter((i) => i >= 0);
  const safeMediaIndex = mediaItems.length > 0 ? Math.min(mediaIndex, mediaItems.length - 1) : 0;
  const activeMedia = mediaItems[safeMediaIndex];
  const currentImagePosIdx = imagePositions.indexOf(safeMediaIndex);
  const goImageRelative = (delta) => {
    if (imagePositions.length === 0) return;
    const cur = currentImagePosIdx >= 0 ? currentImagePosIdx : 0;
    const next = (cur + delta + imagePositions.length) % imagePositions.length;
    setMediaIndex(imagePositions[next]);
  };

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

  // Author bio links (github / personal site). The `posts` join in the feed
  // doesn't pull these columns to keep card payloads small, so we lazy-load
  // them when the full post opens. Falls through silently if the columns
  // aren't populated or the migration hasn't been applied yet.
  const [authorLinks, setAuthorLinks] = useState({
    github_url: post.profiles?.github_url || null,
    website_url: post.profiles?.website_url || null,
  });
  useEffect(() => {
    let cancelled = false;
    if (!post.user_id) return undefined;
    if (post.profiles?.github_url || post.profiles?.website_url) return undefined;
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('github_url, website_url')
          .eq('id', post.user_id)
          .maybeSingle();
        if (!cancelled && data) {
          setAuthorLinks({
            github_url: data.github_url || null,
            website_url: data.website_url || null,
          });
        }
      } catch {
        // Migration not applied yet, or permissions issue - render nothing.
      }
    })();
    return () => { cancelled = true; };
  }, [post.user_id]);

  // Load comments on mount
  useEffect(() => {
    loadComments();
  }, [post.id]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const loadComments = async () => {
    setLoadingComments(true);
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(username, display_name, avatar_emoji, avatar_url, name_color, builder_points)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    setComments(data || []);
    // Comments render now - like counts hydrate right after. This used to be
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

  const handleLikeComment = async (commentId) => {
    if (!user) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    const isCommentLiked = userCommentLikes.includes(commentId);
    const previousLikes = [...userCommentLikes];
    const previousCounts = { ...commentLikes };

    const comment = comments.find(c => c.id === commentId);
    const commentOwnerId = comment?.user_id;

    try {
      if (isCommentLiked) {
        setUserCommentLikes(prev => prev.filter(id => id !== commentId));
        setCommentLikes(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] || 1) - 1) }));
        const { error } = await supabase.from('comment_likes').delete().eq('user_id', user.id).eq('comment_id', commentId);
        if (error) throw error;
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

  const handleSubmitComment = async () => {
    if (!user) {
      if (onAuthRequired) onAuthRequired();
      return;
    }
    // newComment is now HTML from CommentEditor - strip tags for the empty
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
      // Content moderation check - run against plaintext so the LLM sees the
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
          if (onCommentAdded) onCommentAdded(post.id);
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
      if (onCommentAdded) onCommentAdded(post.id);
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

  const handleSubmitReply = async (parentCommentId) => {
    if (!user) {
      if (onAuthRequired) onAuthRequired();
      return;
    }
    const replyPlain = (replyText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!replyPlain && !replyImage) return; // allow image-only replies (Pro)
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
      // Content moderation check (skip when there's no text \u2014 image-only reply)
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
          // Server-side dedupe trigger fired \u2014 message is already saved.
          addToast('Message sent', 'success');
          loadComments();
          if (onCommentAdded) onCommentAdded(post.id);
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
      if (onCommentAdded) onCommentAdded(post.id);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const toggleReplies = (commentId) => {
    setExpandedReplies(prev => ({ ...prev, [commentId]: !prev[commentId] }));
  };

  const topLevelComments = comments.filter(c => !c.parent_comment_id);
  const getReplies = (commentId) => comments.filter(c => c.parent_comment_id === commentId);
  const getAllReplies = (commentId) => {
    const direct = comments.filter(c => c.parent_comment_id === commentId);
    let all = [...direct];
    direct.forEach(r => { all = all.concat(getAllReplies(r.id)); });
    return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(post.prompt || '');
    addToast('Prompt copied to clipboard!', 'success');
  };

  const [showShareMenu, setShowShareMenu] = useState(false);
  const shareMenuRef = useRef(null);

  // Close share menu when clicking outside
  useEffect(() => {
    if (!showShareMenu) return;
    const handleClickOutside = (e) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target)) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showShareMenu]);

  const handleShare = async () => {
    const postUrl = buildPostShareUrl(post);
    if (navigator.share) {
      try {
        await navigator.share({
          title: post.title || 'Check out this post on Prompted',
          text: post.description || post.prompt || 'Check out this post on Prompted',
          url: postUrl
        });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        // share() failed for non-cancel reasons - fall through to clipboard
      }
    }
    const ok = await copyToClipboard(postUrl);
    addToast(ok ? 'Link copied!' : `Copy failed - ${postUrl}`, ok ? 'success' : 'error');
  };

  const handleShareTwitter = () => {
    const postUrl = buildPostShareUrl(post);
    const title = post.title || 'AI Build';
    const tool = post.ai_tool || 'AI';
    const promptSnippet = (post.prompt || '').slice(0, 80);
    const text = `${title}\n\n${promptSnippet ? `"${promptSnippet}${post.prompt && post.prompt.length > 80 ? '...' : ''}"` : ''}\n\nMade with ${tool} on @prmpted`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(postUrl)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=550,height=420');
    setShowShareMenu(false);
  };

  const handleCopyLink = async () => {
    const postUrl = buildPostShareUrl(post);
    const ok = await copyToClipboard(postUrl);
    addToast(ok ? 'Link copied!' : `Copy failed - ${postUrl}`, ok ? 'success' : 'error');
    setShowShareMenu(false);
  };

  const generateShareImage = async () => {
    if (!post.images || post.images.length === 0) {
      addToast('No image to share', 'error');
      return;
    }

    setShowShareMenu(false);
    addToast('Generating share image...', 'info');

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Load the post image
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = post.images[0];
      });

      // Canvas size: use image dimensions, min 1080px wide for social
      const scale = Math.max(1, 1080 / img.width);
      const imgW = Math.round(img.width * scale);
      const imgH = Math.round(img.height * scale);
      const overlayH = 200;
      canvas.width = imgW;
      canvas.height = imgH + overlayH;

      // Draw the image
      ctx.drawImage(img, 0, 0, imgW, imgH);

      // Draw overlay background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, imgH, imgW, overlayH);

      // Draw gradient fade from image to overlay
      const grad = ctx.createLinearGradient(0, imgH - 40, 0, imgH);
      grad.addColorStop(0, 'rgba(10,10,10,0)');
      grad.addColorStop(1, 'rgba(10,10,10,1)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, imgH - 40, imgW, 40);

      // Draw prompt text
      const promptText = (post.prompt || post.description || '').slice(0, 200);
      if (promptText) {
        ctx.fillStyle = '#d4d4d4';
        ctx.font = `${Math.round(imgW * 0.018)}px -apple-system, BlinkMacSystemFont, sans-serif`;
        const maxTextWidth = imgW - 80;
        const words = promptText.split(' ');
        let line = '';
        let y = imgH + 35;
        const lineHeight = Math.round(imgW * 0.025);
        let lineCount = 0;
        const maxLines = 4;

        // Draw quotation mark
        ctx.fillStyle = '#7c3aed';
        ctx.font = `bold ${Math.round(imgW * 0.035)}px Georgia, serif`;
        ctx.fillText('\u201C', 30, y + 5);
        ctx.fillStyle = '#d4d4d4';
        ctx.font = `${Math.round(imgW * 0.018)}px -apple-system, BlinkMacSystemFont, sans-serif`;

        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxTextWidth && i > 0) {
            ctx.fillText(line.trim(), 60, y);
            line = words[i] + ' ';
            y += lineHeight;
            lineCount++;
            if (lineCount >= maxLines) {
              ctx.fillText(line.trim() + '...', 60, y);
              break;
            }
          } else {
            line = testLine;
          }
        }
        if (lineCount < maxLines) {
          ctx.fillText(line.trim(), 60, y);
        }
      }

      // Draw branding bar at bottom
      const brandY = imgH + overlayH - 45;
      ctx.fillStyle = '#888';
      ctx.font = `${Math.round(imgW * 0.015)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      const author = post.profiles?.display_name || post.profiles?.username || post.display_name || post.username || 'Creator';
      ctx.fillText(`@${author}`, 40, brandY);

      // Tool badge
      if (post.ai_tool) {
        ctx.fillStyle = '#7c3aed';
        const toolText = post.ai_tool;
        const toolMetrics = ctx.measureText(toolText);
        const badgeX = imgW - toolMetrics.width - 60;
        const badgeW = toolMetrics.width + 20;
        ctx.beginPath();
        ctx.roundRect(badgeX, brandY - 14, badgeW, 22, 11);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(toolText, badgeX + 10, brandY + 2);
      }

      // Prompted branding
      ctx.fillStyle = '#a78bfa';
      ctx.font = `bold ${Math.round(imgW * 0.016)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      const brandText = 'prmpted.com';
      const brandMetrics = ctx.measureText(brandText);
      ctx.fillText(brandText, imgW / 2 - brandMetrics.width / 2, brandY + 2);

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (!blob) {
          addToast('Failed to generate image', 'error');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prompted-${(post.title || 'build').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Also copy caption to clipboard for TikTok/Instagram
        const caption = `${post.title || 'AI Build'}\n\n${(post.prompt || '').slice(0, 200)}\n\nMade with ${post.ai_tool || 'AI'} | prmpted.com${buildPostPath(post)}\n\n#Prompted #AIArt #${(post.ai_tool || 'AI').replace(/\s+/g, '')}`;
        navigator.clipboard.writeText(caption).then(() => {
          addToast('Image downloaded & caption copied!', 'success');
        }).catch(() => {
          addToast('Image downloaded!', 'success');
        });
      }, 'image/png');
    } catch (err) {
      console.error('Error generating share image:', err);
      // Fallback: if CORS blocks image loading, offer text-only share
      const postUrl = buildPostShareUrl(post);
      const ok = await copyToClipboard(postUrl);
      addToast(ok
        ? 'Could not generate image (cross-origin). Link copied instead.'
        : `Could not generate image. Link: ${postUrl}`, 'error');
    }
  };

  // Mobile lightbox zoom handlers
  const handleMobileLightboxClose = () => {
    setMobileImageExpanded(false);
    setZoomLevel(1);
    setZoomPosition({ x: 0, y: 0 });
  };

  const getDistance = (touch1, touch2) => {
    return Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
  };

  const getCenter = (touch1, touch2) => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const distance = getDistance(e.touches[0], e.touches[1]);
      const center = getCenter(e.touches[0], e.touches[1]);
      lastTouchDistanceRef.current = distance;
      lastTouchCenterRef.current = center;
      swipeStartRef.current = null;
    } else if (e.touches.length === 1 && zoomLevel > 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX - zoomPosition.x,
        y: e.touches[0].clientY - zoomPosition.y
      };
      swipeStartRef.current = null;
    } else if (e.touches.length === 1 && zoomLevel === 1) {
      // Track swipe start for horizontal navigation when not zoomed
      swipeStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const distance = getDistance(e.touches[0], e.touches[1]);
      const center = getCenter(e.touches[0], e.touches[1]);

      if (lastTouchDistanceRef.current) {
        const scale = distance / lastTouchDistanceRef.current;
        const newZoom = Math.min(Math.max(zoomLevel * scale, 1), 4);
        setZoomLevel(newZoom);

        if (newZoom === 1) {
          setZoomPosition({ x: 0, y: 0 });
        }
      }

      lastTouchDistanceRef.current = distance;
      lastTouchCenterRef.current = center;
    } else if (e.touches.length === 1 && zoomLevel > 1 && touchStartRef.current) {
      const newX = e.touches[0].clientX - touchStartRef.current.x;
      const newY = e.touches[0].clientY - touchStartRef.current.y;

      // Limit panning based on zoom level
      const maxPan = (zoomLevel - 1) * 150;
      setZoomPosition({
        x: Math.min(Math.max(newX, -maxPan), maxPan),
        y: Math.min(Math.max(newY, -maxPan), maxPan)
      });
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      lastTouchDistanceRef.current = null;
      lastTouchCenterRef.current = null;
    }
    if (e.touches.length === 0) {
      // Handle horizontal swipe for image navigation when not zoomed
      if (swipeStartRef.current && zoomLevel === 1 && imagePositions.length > 1) {
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - swipeStartRef.current.x;
        const deltaY = touch.clientY - swipeStartRef.current.y;
        const deltaTime = Date.now() - swipeStartRef.current.time;

        // Only trigger swipe if horizontal movement is greater than vertical
        // and swipe distance is at least 50px within 300ms
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50 && deltaTime < 300) {
          goImageRelative(deltaX < 0 ? 1 : -1);
        }
      }
      swipeStartRef.current = null;
      touchStartRef.current = null;
    }
  };

  const handleDoubleTap = (e) => {
    e.preventDefault();
    if (zoomLevel > 1) {
      setZoomLevel(1);
      setZoomPosition({ x: 0, y: 0 });
    } else {
      setZoomLevel(2.5);
    }
  };

  const getCategoryColor = (category) => {
    // Simple black and white styling
    return { bg: 'rgba(255, 255, 255, 0.1)', text: '#ffffff' };
  };

  const ensureAbsoluteUrl = (url) => {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `https://${url}`;
  };

  return (
    <>
    <div className="full-post-overlay" onClick={onClose}>
      <Helmet>
        <title>{`${post.title || 'Post'} | ${post.ai_tool ? post.ai_tool + ' Prompt' : 'AI Prompt'} - Prompted`}</title>
        <meta name="description" content={`${post.ai_tool ? post.ai_tool + ' prompt' : 'AI prompt'}${post.category_name ? ' in ' + post.category_name : ''} by ${post.profiles?.display_name || post.profiles?.username || 'Creator'} - ${(post.description || post.prompt || 'Check out this build on Prompted').slice(0, 120)}`} />
        <link rel="canonical" href={`https://prmpted.com${buildPostPath(post)}`} />
        <meta property="og:title" content={post.title || 'Post on Prompted'} />
        <meta property="og:description" content={(post.description || post.prompt || 'Check out this build on Prompted').slice(0, 160)} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`https://prmpted.com${buildPostPath(post)}`} />
        <meta property="og:site_name" content="Prompted" />
        {post.images && post.images[0] && <meta property="og:image" content={post.images[0]} />}
        {post.created_at && <meta property="article:published_time" content={new Date(post.created_at).toISOString()} />}
        {post.ai_tool && <meta property="article:tag" content={post.ai_tool} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title || 'Post on Prompted'} />
        <meta name="twitter:description" content={(post.description || post.prompt || 'Check out this build on Prompted').slice(0, 160)} />
        {post.images && post.images[0] && <meta name="twitter:image" content={post.images[0]} />}
        <meta name="twitter:site" content="@prmpted" />
        <meta name="robots" content="index, follow" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          "name": post.title || 'AI Build',
          "description": (post.description || post.prompt || '').slice(0, 500),
          "url": `https://prmpted.com${buildPostPath(post)}`,
          "mainEntityOfPage": { "@type": "WebPage", "@id": `https://prmpted.com${buildPostPath(post)}` },
          "datePublished": post.created_at,
          ...(post.updated_at ? { "dateModified": post.updated_at } : {}),
          "author": {
            "@type": "Person",
            "name": post.profiles?.display_name || post.profiles?.username || post.display_name || post.username || 'Creator'
          },
          "publisher": {
            "@type": "Organization",
            "name": "Prompted",
            "url": "https://prmpted.com",
            "logo": { "@type": "ImageObject", "url": OG_IMAGE_URL }
          },
          ...(post.images && post.images[0] ? { "image": post.images[0] } : {}),
          ...(post.ai_tool ? { "tool": post.ai_tool, "keywords": [post.ai_tool, 'AI prompt', 'AI art'].join(', ') } : {}),
          "interactionStatistic": [
            { "@type": "InteractionCounter", "interactionType": "https://schema.org/LikeAction", "userInteractionCount": post.likes_count || 0 },
            { "@type": "InteractionCounter", "interactionType": "https://schema.org/CommentAction", "userInteractionCount": post.comments_count || 0 }
          ]
        })}</script>
      </Helmet>
      <button className="full-post-back-btn" onClick={onClose}>
        <ChevronLeftIcon /> Back
      </button>

      <div className={`full-post-container${mediaItems.length === 0 ? ' no-image' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Unified media carousel - images and videos share the same flex slot
            so the layout no longer breaks when both kinds are attached. */}
        {mediaItems.length > 0 && (() => {
          const safeIndex = Math.min(mediaIndex, mediaItems.length - 1);
          const active = mediaItems[safeIndex];
          return (
            <div className="full-post-image-section">
              {active.kind === 'image' ? (
                <img
                  src={active.url}
                  alt={post.title}
                  className="full-post-image"
                  onClick={() => { if (window.innerWidth <= 1024) setMobileImageExpanded(true); }}
                />
              ) : (
                <video
                  key={active.key}
                  src={active.url}
                  controls
                  preload="metadata"
                  playsInline
                  style={{ width: '100%', height: '100%', maxHeight: '100%', objectFit: 'contain', background: '#000' }}
                />
              )}
              {mediaItems.length > 1 && (
                <>
                  <button
                    className="full-post-image-nav prev"
                    onClick={() => setMediaIndex((safeIndex - 1 + mediaItems.length) % mediaItems.length)}
                  >
                    ‹
                  </button>
                  <button
                    className="full-post-image-nav next"
                    onClick={() => setMediaIndex((safeIndex + 1) % mediaItems.length)}
                  >
                    ›
                  </button>
                  <div className="full-post-image-dots desktop-only">
                    {mediaItems.map((_, idx) => (
                      <div
                        key={idx}
                        className={`full-post-image-dot ${idx === safeIndex ? 'active' : ''}`}
                        onClick={() => setMediaIndex(idx)}
                      />
                    ))}
                  </div>
                  <div className="mobile-image-thumbnails">
                    {mediaItems.map((m, idx) => (
                      m.kind === 'image' ? (
                        <img
                          key={m.key}
                          src={m.url}
                          alt={`Thumbnail ${idx + 1}`}
                          className={`mobile-image-thumbnail ${idx === safeIndex ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setMediaIndex(idx); }}
                        />
                      ) : (
                        <div
                          key={m.key}
                          className={`mobile-image-thumbnail ${idx === safeIndex ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setMediaIndex(idx); }}
                          style={{ background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}
                          aria-label={`Video thumbnail ${idx + 1}`}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        </div>
                      )
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Mobile Image Lightbox with Pinch-to-Zoom - image-only; videos
            stay in the inline carousel since they have native controls. */}
        {mobileImageExpanded && activeMedia?.kind === 'image' && (
          <div className="mobile-image-lightbox" onClick={zoomLevel === 1 ? handleMobileLightboxClose : undefined}>
            <button className="mobile-lightbox-close" onClick={handleMobileLightboxClose}>✕</button>

            {/* Zoom hint */}
            <div className="mobile-lightbox-zoom-hint">
              {zoomLevel > 1 ? `${Math.round(zoomLevel * 100)}%` : 'Pinch to zoom'}
            </div>

            <div
              className="mobile-lightbox-image-container"
              ref={imageContainerRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onDoubleClick={handleDoubleTap}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={activeMedia.url}
                alt={post.title}
                className="mobile-lightbox-image"
                style={{
                  transform: `scale(${zoomLevel}) translate(${zoomPosition.x / zoomLevel}px, ${zoomPosition.y / zoomLevel}px)`,
                  transition: zoomLevel === 1 ? 'transform 0.2s ease' : 'none'
                }}
                draggable={false}
              />
            </div>

            {imagePositions.length > 1 && zoomLevel === 1 && (
              <>
                <button
                  className="mobile-lightbox-nav prev"
                  onClick={(e) => { e.stopPropagation(); goImageRelative(-1); }}
                >
                  ‹
                </button>
                <button
                  className="mobile-lightbox-nav next"
                  onClick={(e) => { e.stopPropagation(); goImageRelative(1); }}
                >
                  ›
                </button>
                <div className="mobile-lightbox-counter" onClick={(e) => e.stopPropagation()}>
                  {(currentImagePosIdx >= 0 ? currentImagePosIdx : 0) + 1} / {imagePositions.length}
                </div>
              </>
            )}

            {/* Reset zoom button when zoomed in */}
            {zoomLevel > 1 && (
              <button
                className="mobile-lightbox-reset-zoom"
                onClick={(e) => { e.stopPropagation(); setZoomLevel(1); setZoomPosition({ x: 0, y: 0 }); }}
              >
                Reset Zoom
              </button>
            )}
          </div>
        )}

        {/* Content Section */}
        <div className="full-post-content">
          {/* Author Header */}
          <div className="full-post-header">
            <div
              className="full-post-author"
              onClick={() => {
                onClose();
                if (onUserClick) { recordProfileVisit(post.id); onUserClick(post.user_id); }
              }}
            >
              <div className="full-post-avatar">
                {(post.profiles?.avatar_url || post.avatar_url) ? (
                  <img src={post.profiles?.avatar_url || post.avatar_url} alt="" />
                ) : (post.profiles?.avatar_emoji || post.avatar_emoji) ? (
                  <span className="full-post-avatar-emoji">{post.profiles?.avatar_emoji || post.avatar_emoji}</span>
                ) : (
                  <UserIcon />
                )}
              </div>
              <div className="full-post-author-info">
                <span
                  className="full-post-display-name"
                  style={post.name_color ? { color: post.name_color } : {}}
                >
                  {post.display_name || post.profiles?.display_name || post.username || post.profiles?.username || 'unknown'}
                  <BuilderRankBadge points={post.builder_points ?? post.profiles?.builder_points} ranks={builderRanks} />
                  <UserBadge username={post.profiles?.username || post.username} size={16} />
                </span>
                <span className="full-post-username-time">
                  @{post.profiles?.username || post.username || 'unknown'} · {formatTimeAgo(post.created_at)}
                </span>
                {(authorLinks.github_url || authorLinks.website_url) && (
                  <div className="full-post-author-links" onClick={(e) => e.stopPropagation()}>
                    {authorLinks.github_url && (
                      <a
                        className="profile-link-chip"
                        href={ensureAbsoluteUrl(authorLinks.github_url)}
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
                    {authorLinks.website_url && (
                      <a
                        className="profile-link-chip"
                        href={ensureAbsoluteUrl(authorLinks.website_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={authorLinks.website_url}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                        {(() => {
                          try { return new URL(ensureAbsoluteUrl(authorLinks.website_url)).hostname.replace(/^www\./, ''); }
                          catch { return 'Link'; }
                        })()}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* Share + report sit in the header corner, out of the action bar. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ position: 'relative' }} ref={shareMenuRef}>
                <button className="post-header-action-btn" onClick={() => setShowShareMenu(!showShareMenu)} title="Share">
                  <ShareIcon />
                </button>
                {showShareMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0,
                    marginTop: '8px', background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px',
                    padding: '8px', minWidth: '200px', zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                  }}>
                    <button
                      onClick={handleShareTwitter}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px',
                        background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', borderRadius: '8px',
                        fontSize: '0.875rem', textAlign: 'left'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#2d1b69'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      Share to X / Twitter
                    </button>
                    {post.images && post.images.length > 0 && (
                      <button
                        onClick={generateShareImage}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px',
                          background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', borderRadius: '8px',
                          fontSize: '0.875rem', textAlign: 'left'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#2d1b69'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        Download for TikTok
                      </button>
                    )}
                    <button
                      onClick={handleCopyLink}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px',
                        background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', borderRadius: '8px',
                        fontSize: '0.875rem', textAlign: 'left'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#2d1b69'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      Copy Link
                    </button>
                    <button
                      onClick={() => { setShowShareMenu(false); setShowRemixBuildModalFP(true); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px',
                        background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', borderRadius: '8px',
                        fontSize: '0.875rem', textAlign: 'left'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#2d1b69'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <VinylIcon size={18} />
                      Remix this build
                    </button>
                  </div>
                )}
              </div>
              {user && !isOwner && (
                <button
                  className="post-header-action-btn"
                  onClick={() => setReportTarget({ type: 'post', id: post.id })}
                  title="Report post"
                >
                  <FlagIcon />
                </button>
              )}
            </div>
          </div>

          {/* Owner actions - edit your own post directly from the detail view */}
          {(isOwner || isAdmin) && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', marginBottom: '4px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setEditing(true)}
              >
                <EditIcon /> Edit post
              </button>
            </div>
          )}

          {/* Title */}
          <h1 className="full-post-title"><MentionText text={post.title} onUserClick={onUserClick} /></h1>

          {/* Description */}
          {post.description && (
            <div className="full-post-description"><RichText text={post.description} onUserClick={onUserClick} /></div>
          )}

          {/* Poll */}
          {Array.isArray(post.poll_options) && post.poll_options.length > 0 && (
            <PollWidget post={post} onAuthRequired={onAuthRequired} />
          )}

          {/* Categories */}
          {post.category_id && categories.length > 0 && (
            <div className="full-post-categories">
              {(() => {
                const cat = categories.find(c => c.id === post.category_id);
                if (cat) {
                  const colors = getCategoryColor(cat);
                  return (
                    <span
                      className="full-post-category"
                      style={{ background: colors.bg, color: colors.text }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onCategoryClick) {
                          onClose();
                          onCategoryClick(cat.id);
                        }
                      }}
                    >
                      {cat.name}
                    </span>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* AI Tool */}
          {(post.ai_tool || (post.tool_ids && post.tool_ids.length > 0)) && (
            <div className="full-post-ai-tool" onClick={(e) => e.stopPropagation()}>
              {post.post_type === 'post' || post.is_question ? 'Tools Mentioned' : 'Built with'}{' '}
              {post.tool_ids && post.tool_ids.length > 0 ? (
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem', marginLeft: '0.25rem' }}>
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

          {/* Demo Button / Open Link */}
          {post.demo_url && (
            <a
              href={ensureAbsoluteUrl(post.demo_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="full-post-demo-btn"
            >
              {post.post_type === 'post' ? (
                <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> Open Link</>
              ) : (
                <><PlayIcon /> Try it now</>
              )}
            </a>
          )}

          {/* GitHub Repo Button - hide for casual posts */}
          {post.github_repo_url && post.post_type !== 'post' && (
            <a
              href={ensureAbsoluteUrl(post.github_repo_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="full-post-github-btn"
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
              className="full-post-github-btn"
              title="Read the design doc for this build"
            >
              📄 Design doc
            </a>
          )}

          {/* Remix Build button - only when design doc is present */}
          {post.design_doc_url && post.post_type !== 'post' && (
            <button
              type="button"
              className="full-post-github-btn"
              onClick={() => setShowRemixBuildModalFP(true)}
              title="Generate a starter prompt to remix this build with your AI"
            >
              <VinylIcon size={16} /> Remix Build
            </button>
          )}

          {/* Question About - Embedded Card (Quote Tweet Style).
              See PostCard note: don't catch fork_type='remix' here. */}
          {post.forked_from_post_id && (post.fork_type === 'question' || (post.is_question && !['remix', 'repost'].includes(post.fork_type))) && (() => {
            const originalPost = post.original_post || forkedPostsMap[post.forked_from_post_id] || allPosts.find(p => p.id === post.forked_from_post_id) || fetchedOriginalFP;
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

          {/* Remix / Repost - Embedded Card */}
          {post.forked_from_post_id && (post.fork_type === 'remix' || post.fork_type === 'repost') && (() => {
            const originalPost = post.original_post || forkedPostsMap[post.forked_from_post_id] || allPosts.find(p => p.id === post.forked_from_post_id) || fetchedOriginalFP;
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

          {/* Question Counts */}
          {post.question_count > 0 && (
            <div className="post-fork-counts">
              <button className="post-fork-count-btn" onClick={() => {
                const qSection = document.getElementById(`questions-section-${post.id}`);
                if (qSection) qSection.scrollIntoView({ behavior: 'smooth' });
              }}>
                <CommentIcon /> {post.question_count} {post.question_count === 1 ? 'Question' : 'Questions'}
              </button>
            </div>
          )}

          {/* Prompt Section - Only for builds */}
          {!post.is_question && post.post_type !== 'post' && post.prompt && (
            <div className="full-post-prompt-section">
              <div className="full-post-prompt-header">
                <div className="full-post-prompt-label" style={post.name_color ? { color: post.name_color } : {}}>
                  @{post.profiles?.username || post.username}'s prompt(s)
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button className="full-post-copy-btn" onClick={handleCopyPrompt}>
                    <CopyIcon /> Copy
                  </button>
                  <button
                    className="full-post-copy-btn"
                    onClick={() => toggleSavePrompt && toggleSavePrompt(post.id, savedPromptIds.includes(post.id))}
                    title={savedPromptIds.includes(post.id) ? 'Saved to your prompts - click to remove' : 'Save this prompt'}
                  >
                    <BookmarkIcon filled={savedPromptIds.includes(post.id)} /> {savedPromptIds.includes(post.id) ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Prompt steps display - rich view with tools and notes */}
              {post.prompt_steps && post.prompt_steps.length >= 1 ? (
                <div className="prompt-steps-display">
                  {post.prompt_steps.map((step, idx) => (
                    <div key={idx} className="prompt-step-display-item" style={{ marginBottom: idx < post.prompt_steps.length - 1 ? '1rem' : 0, paddingBottom: idx < post.prompt_steps.length - 1 ? '1rem' : 0, borderBottom: idx < post.prompt_steps.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                      <div className="prompt-step-label" style={{ marginBottom: '0.4rem' }}>
                        <span className="prompt-step-number">{step.step_number}</span>
                        {post.prompt_steps.length > 1 ? `Step ${step.step_number}` : 'Prompt'}
                        {step.tool_used && (
                          <span className="prompt-step-tool-badge">{step.tool_used}</span>
                        )}
                      </div>
                      {step.note && (
                        <p className="prompt-step-note-display">
                          {step.note}
                        </p>
                      )}
                      <p className={`full-post-prompt-text ${!promptExpanded ? 'collapsed' : ''}`} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.85rem' }}>{step.prompt_text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`full-post-prompt-text ${!promptExpanded ? 'collapsed' : ''}`}>{post.prompt}</p>
              )}

              <button
                className={`full-post-prompt-toggle ${promptExpanded ? 'expanded' : ''}`}
                onClick={() => setPromptExpanded(!promptExpanded)}
              >
                <ChevronDownIcon />
                {promptExpanded ? 'Show less' : 'Show full prompt'}
              </button>
            </div>
          )}


          {/* Action Buttons */}
          <div className="full-post-actions">
            <button
              className={`full-post-action-btn like-btn ${isLiked ? 'liked' : ''}`}
              onClick={() => onLike(post.id, isLiked)}
            >
              <HeartIcon filled={isLiked} />
              <span>{post.likes_count || 0}</span>
            </button>
            <button className="full-post-action-btn">
              <CommentIcon />
              <span>{post.comments_count}</span>
            </button>
            <button
              className="full-post-action-btn"
              onClick={() => { if (!user) { onAuthRequired && onAuthRequired(); return; } setShowRemixBuildModalFP(true); }}
              title="Remix"
            >
              <VinylIcon size={20} />
            </button>
            <RepostButton post={post} onAuthRequired={onAuthRequired} className="full-post-action-btn" size={20} fetchStatus />
            <button
              className={`full-post-action-btn ${isSaved ? 'saved' : ''}`}
              onClick={() => onSave && onSave(post.id, isSaved)}
            >
              <BookmarkIcon filled={isSaved} />
              <span>{isSaved ? 'Saved' : 'Save'}</span>
            </button>
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

          {/* Comments Section */}
          <div className="full-post-comments-section">
            <div className="full-post-comments-header">
              <CommentIcon /> Comments ({comments.length})
            </div>

            {/* Comment Input Form - pinned above the list so the reply box
                is always reachable without scrolling down past the comments */}
            <div className="full-post-comment-form full-post-comment-form-top">
              {/* Rich CommentEditor (B/I/U/color). Replaces the plain
                  textarea - newComment now holds sanitized HTML, and the
                  submit path sanitize-checks it before insert. */}
              <CommentEditor
                inputRef={commentInputRef}
                className="full-post-comment-input"
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
              <div className="full-post-emoji-wrap" ref={emojiPickerRef}>
                <button
                  type="button"
                  className="full-post-emoji-trigger"
                  aria-label="Insert emoji"
                  aria-expanded={showEmojiPicker}
                  onClick={() => setShowEmojiPicker((s) => !s)}
                >
                  😊
                </button>
                {showEmojiPicker && (
                  <div className="full-post-emoji-picker" role="dialog" aria-label="Emoji picker">
                    {COMMENT_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="full-post-emoji-option"
                        onClick={() => {
                          insertEmojiIntoComment(emoji);
                          setShowEmojiPicker(false);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="full-post-comment-submit"
                onClick={handleSubmitComment}
                disabled={!newComment.trim() || isSubmittingComment}
              >
                {isSubmittingComment ? 'Sending…' : 'Post'}
              </button>
            </div>
            <AdvisorMentionHint text={newComment} />

            {loadingComments ? (
              <div className="full-post-loading-comments">Loading comments...</div>
            ) : topLevelComments.length === 0 ? (
              <div className="full-post-no-comments">No comments yet. Be the first to comment!</div>
            ) : (
              <div className="full-post-comments-list">
                {topLevelComments.map(comment => {
                  const replies = getAllReplies(comment.id);
                  const isCommentLiked = userCommentLikes.includes(comment.id);
                  const likeCount = commentLikes[comment.id] || 0;

                  return (
                    <div key={comment.id}>
                      <div className="full-post-comment">
                        <div
                          className="full-post-comment-avatar"
                          onClick={() => {
                            onClose();
                            if (onUserClick) onUserClick(comment.user_id);
                          }}
                        >
                          {comment.profiles?.avatar_url ? (
                            <img src={comment.profiles.avatar_url} alt="" />
                          ) : comment.profiles?.avatar_emoji ? (
                            <span style={{ fontSize: '1rem' }}>{comment.profiles.avatar_emoji}</span>
                          ) : (
                            <UserIcon />
                          )}
                        </div>
                        <div className="full-post-comment-content">
                          <div className="full-post-comment-header">
                            <span
                              className="full-post-comment-author"
                              style={comment.profiles?.name_color ? { color: comment.profiles.name_color } : {}}
                            >
                              {comment.profiles?.display_name || comment.profiles?.username || 'unknown'}
                              <BuilderRankBadge points={comment.profiles?.builder_points} ranks={builderRanks} />
                              <UserBadge username={comment.profiles?.username} size={15} />
                            </span>
                            <span className="full-post-comment-time">{formatTimeAgo(comment.created_at)}</span>
                          </div>
                          <p className="full-post-comment-text"><CommentContent text={comment.content} onUserClick={onUserClick} /></p>
                          <CommentImage url={comment.image_url} />
                          <div className="full-post-comment-actions">
                            <button
                              className={`full-post-comment-action ${isCommentLiked ? 'liked' : ''}`}
                              onClick={() => handleLikeComment(comment.id)}
                            >
                              <HeartIcon filled={isCommentLiked} /> {likeCount > 0 && likeCount}
                            </button>
                            <button
                              className="full-post-comment-action"
                              onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                            >
                              <CommentIcon /> Reply
                            </button>
                            {replies.length > 0 && (
                              <button
                                className="full-post-comment-action"
                                onClick={() => toggleReplies(comment.id)}
                              >
                                {expandedReplies[comment.id] ? 'Hide' : 'View'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                              </button>
                            )}
                            {user && user.id !== comment.user_id && (
                              <button
                                className="full-post-comment-action"
                                onClick={() => setReportTarget({ type: 'comment', id: comment.id })}
                                title="Report comment"
                              >
                                <FlagIcon />
                              </button>
                            )}
                            {(isAdmin || isOwner || (user && user.id === comment.user_id)) && (
                              <button
                                className="full-post-comment-action"
                                onClick={() => handleDeleteComment(comment.id)}
                                title="Delete comment"
                                style={{ color: 'var(--accent-red, #ef4444)' }}
                              >
                                <TrashIcon />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Reply Form */}
                      {replyingTo === comment.id && (
                        <div className="full-post-reply-form">
                          <CommentEditor
                            className="full-post-reply-input"
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
                            className="full-post-reply-submit"
                            onClick={() => handleSubmitReply(comment.id)}
                            disabled={!replyText.trim() || isSubmittingReply}
                          >
                            {isSubmittingReply ? 'Sending…' : 'Reply'}
                          </button>
                        </div>
                      )}

                      {/* Replies */}
                      {expandedReplies[comment.id] && replies.length > 0 && (
                        <div className="full-post-replies">
                          {replies.map(reply => {
                            const isReplyLiked = userCommentLikes.includes(reply.id);
                            const replyLikeCount = commentLikes[reply.id] || 0;

                            return (
                              <div key={reply.id}>
                                <div className="full-post-comment">
                                  <div
                                    className="full-post-comment-avatar"
                                    onClick={() => {
                                      onClose();
                                      if (onUserClick) onUserClick(reply.user_id);
                                    }}
                                  >
                                    {reply.profiles?.avatar_url ? (
                                      <img src={reply.profiles.avatar_url} alt="" />
                                    ) : reply.profiles?.avatar_emoji ? (
                                      <span style={{ fontSize: '1rem' }}>{reply.profiles.avatar_emoji}</span>
                                    ) : (
                                      <UserIcon />
                                    )}
                                  </div>
                                  <div className="full-post-comment-content">
                                    <div className="full-post-comment-header">
                                      <span
                                        className="full-post-comment-author"
                                        style={reply.profiles?.name_color ? { color: reply.profiles.name_color } : {}}
                                      >
                                        {reply.profiles?.display_name || reply.profiles?.username || 'unknown'}
                                        <BuilderRankBadge points={reply.profiles?.builder_points} ranks={builderRanks} />
                                        <UserBadge username={reply.profiles?.username} size={15} />
                                      </span>
                                      <span className="full-post-comment-time">{formatTimeAgo(reply.created_at)}</span>
                                    </div>
                                    <p className="full-post-comment-text"><CommentContent text={reply.content} onUserClick={onUserClick} /></p>
                                    <CommentImage url={reply.image_url} />
                                    <div className="full-post-comment-actions">
                                      <button
                                        className={`full-post-comment-action ${isReplyLiked ? 'liked' : ''}`}
                                        onClick={() => handleLikeComment(reply.id)}
                                      >
                                        <HeartIcon filled={isReplyLiked} /> {replyLikeCount > 0 && replyLikeCount}
                                      </button>
                                      <button
                                        className="full-post-comment-action"
                                        onClick={() => setReplyingTo(replyingTo === reply.id ? null : reply.id)}
                                      >
                                        <CommentIcon /> Reply
                                      </button>
                                      {user && user.id !== reply.user_id && (
                                        <button
                                          className="full-post-comment-action"
                                          onClick={() => setReportTarget({ type: 'comment', id: reply.id })}
                                          title="Report reply"
                                        >
                                          <FlagIcon />
                                        </button>
                                      )}
                                      {(isAdmin || isOwner || (user && user.id === reply.user_id)) && (
                                        <button
                                          className="full-post-comment-action"
                                          onClick={() => handleDeleteComment(reply.id)}
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
                                  <div className="full-post-reply-form">
                                    <CommentEditor
                                      className="full-post-reply-input"
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
                                      className="full-post-reply-submit"
                                      onClick={() => handleSubmitReply(reply.id)}
                                      disabled={!replyText.trim() || isSubmittingReply}
                                    >
                                      {isSubmittingReply ? 'Sending…' : 'Reply'}
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
            )}

            {/* Linked Questions Section */}
            {(() => {
              const linkedQuestions = allPosts.filter(p => p.forked_from_post_id === post.id && (p.fork_type === 'question' || p.is_question));
              if (linkedQuestions.length === 0) return null;
              return (
                <div className="linked-questions-section" id={`questions-section-${post.id}`}>
                  <div className="linked-questions-title">
                    <CommentIcon /> Questions about this post ({linkedQuestions.length})
                  </div>
                  {linkedQuestions.map(q => (
                    <div key={q.id} className="linked-question-item" onClick={() => { if (onOpenFullPost) onOpenFullPost(q); }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
                        {(q.profiles?.avatar_url || q.avatar_url) ? (
                          <img src={q.profiles?.avatar_url || q.avatar_url} alt="" />
                        ) : (q.profiles?.avatar_emoji || q.avatar_emoji) ? (
                          <span>{q.profiles?.avatar_emoji || q.avatar_emoji}</span>
                        ) : (
                          <UserIcon />
                        )}
                      </div>
                      <div className="linked-question-item-info">
                        <div className="linked-question-item-title">{q.title}</div>
                        <div className="linked-question-item-meta">by @{q.profiles?.username || q.username || 'unknown'} · {formatTimeAgo(q.created_at)} · {q.comments_count || 0} comments</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
      <RemixBuildModal
        isOpen={showRemixBuildModalFP}
        post={post}
        onClose={() => setShowRemixBuildModalFP(false)}
      />
    </div>
    {editing && (
      <EditPostModal
        post={post}
        categories={categories}
        onClose={() => setEditing(false)}
      />
    )}
    </>
  );
};

export default FullPostView;
