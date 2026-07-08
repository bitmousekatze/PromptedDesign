import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { normalizePostVideoItem, getPlayablePostVideoUrl } from '../lib/storage.js';

/**
 * OriginalPostCard - compact "quote tweet" style card for displaying the original post
 * that had a question asked about it.
 *
 * Props:
 *   originalPost - the original post object (with user/profile data)
 *   forkType - 'question' | 'remix' | 'repost'
 *   onOpenFullPost - callback to open the original post in full view
 *   onUserClick - callback when the original author is clicked
 *   UserIcon - fallback user icon component
 */
const OriginalPostCard = ({ originalPost, forkType, onOpenFullPost, onUserClick, UserIcon }) => {
  const origVideos = Array.isArray(originalPost?.videos)
    ? originalPost.videos.map(normalizePostVideoItem).filter(Boolean)
    : [];
  const [playableVideos, setPlayableVideos] = useState(origVideos);

  // post-videos is a private bucket - swap stored URLs for signed ones.
  useEffect(() => {
    let cancelled = false;

    const resolvePlayableUrls = async () => {
      if (origVideos.length === 0) {
        setPlayableVideos([]);
        return;
      }
      const resolved = await Promise.all(
        origVideos.map(async (video) => ({
          ...video,
          url: await getPlayablePostVideoUrl(supabase, video)
        }))
      );
      if (!cancelled) setPlayableVideos(resolved);
    };

    resolvePlayableUrls();

    return () => {
      cancelled = true;
    };
  }, [originalPost?.videos]);

  if (!originalPost) return null;

  const origUsername = originalPost?.profiles?.username || originalPost?.user?.username || originalPost?.username || 'unknown';
  const origDisplayName = originalPost?.profiles?.display_name || originalPost?.user?.display_name || originalPost?.display_name;
  const origAvatar = originalPost?.profiles?.avatar_url || originalPost?.user?.avatar_url || originalPost?.avatar_url;
  const origEmoji = originalPost?.profiles?.avatar_emoji || originalPost?.user?.avatar_emoji || originalPost?.avatar_emoji;

  const isRemix = forkType === 'remix';
  const isRepost = forkType === 'repost';

  return (
    <>
      {/* Fork type badge */}
      <div className={`fork-type-badge ${isRepost ? 'remix-badge' : isRemix ? 'remix-badge' : 'question-badge'}`}>
        <span>{isRepost ? '🔁' : isRemix ? '' : '❓'}</span>
        <span>
          {isRepost ? 'Reposted from ' : isRemix ? 'Remixed from ' : 'Asked a question about '}
          <span className="fork-badge-user" onClick={(e) => { e.stopPropagation(); if (originalPost && onUserClick) onUserClick(originalPost.user_id); }}>@{origUsername}</span>
          {isRepost || isRemix ? '' : "'s post"}
        </span>
      </div>

      {/* Embedded original post card */}
      <div
        className="embedded-original-post"
        onClick={(e) => { e.stopPropagation(); if (onOpenFullPost) onOpenFullPost(originalPost); }}
      >
        {/* Original post images at top */}
        {originalPost.images && originalPost.images.length > 0 && (
          <div className="embedded-post-images">
            {originalPost.images.slice(0, 3).map((img, idx) => (
              <img key={idx} src={img} alt="" loading="lazy" />
            ))}
          </div>
        )}
        {/* Original post video - stopPropagation so the controls don't open the full post */}
        {playableVideos.length > 0 && playableVideos[0].url && (
          <div className="embedded-post-videos" onClick={(e) => e.stopPropagation()}>
            <video src={playableVideos[0].url} controls playsInline preload="metadata" />
          </div>
        )}
        <div className="embedded-post-header">
          <div className="embedded-post-avatar">
            {origAvatar ? (
              <img src={origAvatar} alt="" />
            ) : origEmoji ? (
              <span>{origEmoji}</span>
            ) : (
              UserIcon ? <UserIcon /> : <span>👤</span>
            )}
          </div>
          <span className="embedded-post-author">{origDisplayName || origUsername}</span>
          <span className="embedded-post-username">@{origUsername}</span>
        </div>
        <div className="embedded-post-body">
          <div className="embedded-post-title">{originalPost.title}</div>
          {originalPost.prompt && (
            <div className="embedded-post-prompt">
              {originalPost.prompt.length > 120
                ? originalPost.prompt.substring(0, 120) + '...'
                : originalPost.prompt}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OriginalPostCard;
