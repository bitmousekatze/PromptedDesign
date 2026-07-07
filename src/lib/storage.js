// ============================================
// STORAGE HELPER FUNCTIONS
// ============================================

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
// Animated profile banners: mp4/webm only (quicktime won't autoplay everywhere)
const ALLOWED_BANNER_VIDEO_TYPES = ['video/mp4', 'video/webm'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_FILE_SIZE = 150 * 1024 * 1024; // 150MB
const MAX_BANNER_VIDEO_SIZE = 30 * 1024 * 1024; // 30MB

/**
 * True when a stored header_url points at a video banner. Must stay in sync
 * with the enforce_animated_banner_gate trigger regex on profiles.
 * @param {string|null|undefined} url
 */
export const isVideoBannerUrl = (url) =>
  typeof url === 'string' && /\.(mp4|webm|mov)([?#]|$)/i.test(url);

/**
 * Validates a video file for use as an animated profile banner
 * @param {File} file - The file to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateBannerVideoFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!ALLOWED_BANNER_VIDEO_TYPES.includes(file.type)) {
    return { valid: false, error: 'Invalid banner video type. Allowed: MP4, WebM' };
  }

  if (file.size > MAX_BANNER_VIDEO_SIZE) {
    return { valid: false, error: 'Video too large. Maximum banner size is 30MB' };
  }

  return { valid: true };
};

/**
 * Validates a file for upload
 * @param {File} file - The file to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File too large. Maximum size is 5MB' };
  }

  return { valid: true };
};

/**
 * Validates a video file for upload
 * @param {File} file - The file to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateVideoFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return { valid: false, error: 'Invalid video type. Allowed: MP4, WebM, MOV' };
  }

  if (file.size > MAX_VIDEO_FILE_SIZE) {
    return { valid: false, error: 'Video too large. Maximum size is 150MB' };
  }

  return { valid: true };
};

/**
 * Generates a unique file path for storage
 * @param {string} userId - The user's ID
 * @param {File} file - The file being uploaded
 * @param {boolean} isAvatar - Whether this is an avatar upload
 * @returns {string} The file path
 */
const generateFilePath = (userId, file, isAvatar = false) => {
  const ext = file.name.split('.').pop().toLowerCase();

  if (isAvatar) {
    return `${userId}/avatar.${ext}`;
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${userId}/${timestamp}-${random}.${ext}`;
};

/**
 * Uploads an image for a post
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {File} file - The file to upload
 * @param {string} userId - The user's ID
 * @returns {Promise<{ url?: string, error?: string }>}
 */
export const uploadPostImage = async (supabase, file, userId) => {
  const validation = validateFile(file);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const filePath = generateFilePath(userId, file, false);

  try {
    const { data, error } = await supabase.storage
      .from('post-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Upload error:', error);
      return { error: error.message };
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('post-images')
      .getPublicUrl(data.path);

    return { url: urlData.publicUrl };
  } catch (err) {
    console.error('Upload exception:', err);
    return { error: 'Failed to upload image' };
  }
};

/**
 * Uploads an avatar image
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {File} file - The file to upload
 * @param {string} userId - The user's ID
 * @returns {Promise<{ url?: string, error?: string }>}
 */
export const uploadAvatar = async (supabase, file, userId) => {
  const validation = validateFile(file);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const filePath = generateFilePath(userId, file, true);

  try {
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true // Overwrite existing avatar
      });

    if (error) {
      console.error('Avatar upload error:', error);
      return { error: error.message };
    }

    // Get the public URL with cache buster
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(data.path);

    // Add cache buster to force refresh
    const url = `${urlData.publicUrl}?t=${Date.now()}`;
    return { url };
  } catch (err) {
    console.error('Avatar upload exception:', err);
    return { error: 'Failed to upload avatar' };
  }
};

/**
 * Uploads a header image
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {File} file - The file to upload
 * @param {string} userId - The user's ID
 * @returns {Promise<{ url?: string, error?: string }>}
 */
export const uploadHeader = async (supabase, file, userId) => {
  // Animated banners (Pro / contest winners): videos go to the post-videos
  // bucket — avatars is image-only at the bucket level. The real entitlement
  // gate is the animated_banner_gate trigger on profiles.header_url.
  const isVideo = file?.type?.startsWith('video/');
  const validation = isVideo ? validateBannerVideoFile(file) : validateFile(file);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const ext = file.name.split('.').pop().toLowerCase();
  const bucket = isVideo ? 'post-videos' : 'avatars';
  const filePath = isVideo ? `${userId}/profile-banner.${ext}` : `${userId}/header.${ext}`;

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true // Overwrite existing header
      });

    if (error) {
      console.error('Header upload error:', error);
      return { error: error.message };
    }

    // Get the public URL with cache buster
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    // Add cache buster to force refresh
    const url = `${urlData.publicUrl}?t=${Date.now()}`;
    return { url };
  } catch (err) {
    console.error('Header upload exception:', err);
    return { error: 'Failed to upload header' };
  }
};

/**
 * Loads an image File/Blob and re-renders it center-cropped to a square
 * PNG of the given size. Shrinks large uploads down to icon dimensions.
 * @param {Blob} file
 * @param {number} size - output width/height in px
 * @returns {Promise<Blob>}
 */
const shrinkToSquareIcon = (file, size = 256) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    try {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    } catch (e) {
      URL.revokeObjectURL(url);
      reject(e);
    }
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
  img.src = url;
});

/**
 * Uploads a custom badge icon image (stored in the public avatars bucket,
 * scoped to the user's folder). Returns a public URL with a cache buster.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {File} file - The file to upload
 * @param {string} userId - The user's ID
 * @param {string} badgeId - The badge being customized (keeps icons separate)
 * @returns {Promise<{ url?: string, error?: string }>}
 */
export const uploadBadgeIcon = async (supabase, file, userId, badgeId) => {
  if (!file || !file.type?.startsWith('image/')) {
    return { error: 'Please choose an image file' };
  }

  // Shrink any image down to a small square icon (center-cropped) so big
  // pictures become a crisp, lightweight badge icon regardless of input size.
  let blob;
  try {
    blob = await shrinkToSquareIcon(file, 256);
  } catch {
    return { error: 'Could not process that image' };
  }

  const filePath = `${userId}/badge-${badgeId}.png`;

  try {
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(filePath, blob, { cacheControl: '3600', upsert: true, contentType: 'image/png' });

    if (error) {
      console.error('Badge icon upload error:', error);
      return { error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(data.path);

    return { url: `${urlData.publicUrl}?t=${Date.now()}` };
  } catch (err) {
    console.error('Badge icon upload exception:', err);
    return { error: 'Failed to upload badge icon' };
  }
};

/**
 * Uploads a community icon image
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {File} file - The file to upload
 * @param {string} userId - The uploader's user ID
 * @param {string} communityId - The community ID
 * @returns {Promise<{ url?: string, error?: string }>}
 */
export const uploadCommunityIcon = async (supabase, file, userId, communityId) => {
  const validation = validateFile(file);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const ext = file.name ? file.name.split('.').pop().toLowerCase() : 'jpg';
  const filePath = `${communityId}/icon.${ext}`;

  try {
    const { data, error } = await supabase.storage
      .from('community-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('Community icon upload error:', error);
      return { error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from('community-images')
      .getPublicUrl(data.path);

    const url = `${urlData.publicUrl}?t=${Date.now()}`;
    return { url };
  } catch (err) {
    console.error('Community icon upload exception:', err);
    return { error: 'Failed to upload community icon' };
  }
};

/**
 * Uploads a community banner/header image
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {File} file - The file to upload
 * @param {string} userId - The uploader's user ID
 * @param {string} communityId - The community ID
 * @returns {Promise<{ url?: string, error?: string }>}
 */
export const uploadCommunityBanner = async (supabase, file, userId, communityId) => {
  const validation = validateFile(file);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const ext = file.name ? file.name.split('.').pop().toLowerCase() : 'jpg';
  const filePath = `${communityId}/banner.${ext}`;

  try {
    const { data, error } = await supabase.storage
      .from('community-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('Community banner upload error:', error);
      return { error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from('community-images')
      .getPublicUrl(data.path);

    const url = `${urlData.publicUrl}?t=${Date.now()}`;
    return { url };
  } catch (err) {
    console.error('Community banner upload exception:', err);
    return { error: 'Failed to upload community banner' };
  }
};

/**
 * Deletes an image from storage
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} url - The public URL of the image
 * @param {string} bucket - The bucket name ('post-images' or 'avatars')
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const deleteImage = async (supabase, url, bucket) => {
  try {
    // Extract the file path from the URL
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split(`/storage/v1/object/public/${bucket}/`);

    if (pathParts.length < 2) {
      return { success: false, error: 'Invalid image URL' };
    }

    // Remove query params from path
    const filePath = pathParts[1].split('?')[0];

    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      console.error('Delete error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Delete exception:', err);
    return { success: false, error: 'Failed to delete image' };
  }
};

/**
 * Uploads multiple post images
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {File[]} files - Array of files to upload
 * @param {string} userId - The user's ID
 * @param {function} onProgress - Optional progress callback (current, total)
 * @returns {Promise<{ urls: string[], errors: string[] }>}
 */
export const uploadMultiplePostImages = async (supabase, files, userId, onProgress) => {
  const urls = [];
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = await uploadPostImage(supabase, file, userId);

    if (result.url) {
      urls.push(result.url);
    } else if (result.error) {
      errors.push(`${file.name}: ${result.error}`);
    }

    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }

  return { urls, errors };
};

/**
 * Uploads a video for a post
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {File} file - The file to upload
 * @param {string} userId - The user's ID
 * @returns {Promise<{ video?: { url: string, path: string, type: 'video' }, error?: string }>}
 */
export const uploadPostVideo = async (supabase, file, userId) => {
  const validation = validateVideoFile(file);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const filePath = generateFilePath(userId, file, false);

  try {
    const { data, error } = await supabase.storage
      .from('post-videos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Video upload error:', error);
      return { error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from('post-videos')
      .getPublicUrl(data.path);

    return {
      video: {
        url: urlData.publicUrl,
        path: data.path,
        type: 'video'
      }
    };
  } catch (err) {
    console.error('Video upload exception:', err);
    return { error: 'Failed to upload video' };
  }
};

/**
 * Uploads multiple post videos
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {File[]} files - Array of files to upload
 * @param {string} userId - The user's ID
 * @param {function} onProgress - Optional progress callback (current, total)
 * @returns {Promise<{ videos: Array<{ url: string, path: string, type: 'video' }>, errors: string[] }>}
 */
export const uploadMultiplePostVideos = async (supabase, files, userId, onProgress) => {
  const videos = [];
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = await uploadPostVideo(supabase, file, userId);

    if (result.video) {
      videos.push(result.video);
    } else if (result.error) {
      errors.push(`${file.name}: ${result.error}`);
    }

    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }

  return { videos, errors };
};

/**
 * Normalizes Supabase signed video URLs to public bucket URLs.
 * This keeps older posts (saved with signed links) playable once bucket access is public.
 * @param {string} url
 * @returns {string}
 */
export const normalizePostVideoUrl = (url) => {
  if (!url || typeof url !== 'string') return '';

  try {
    const parsed = new URL(url);
    const signedPrefix = '/storage/v1/object/sign/post-videos/';
    const idx = parsed.pathname.indexOf(signedPrefix);

    if (idx !== -1) {
      const objectPath = parsed.pathname.slice(idx + signedPrefix.length);
      return `${parsed.origin}/storage/v1/object/public/post-videos/${objectPath}`;
    }
  } catch {
    return url;
  }

  return url;
};

/**
 * Normalizes stored video payload shape and URL.
 * @param {string|{url?: string, type?: string, path?: string}} video
 * @returns {{ url: string, type: 'video', path: string }|null}
 */
export const normalizePostVideoItem = (video) => {
  const rawUrl = typeof video === 'string' ? video : video?.url;
  const normalizedUrl = normalizePostVideoUrl(rawUrl);
  if (!normalizedUrl) return null;

  return {
    url: normalizedUrl,
    type: 'video',
    path: typeof video === 'object' && video?.path ? video.path : ''
  };
};

/**
 * Extracts a `post-videos` bucket object path from a storage URL.
 * @param {string} url
 * @returns {string}
 */
export const extractPostVideoPath = (url) => {
  if (!url || typeof url !== 'string') return '';

  try {
    const parsed = new URL(url);
    const publicPrefix = '/storage/v1/object/public/post-videos/';
    const signedPrefix = '/storage/v1/object/sign/post-videos/';

    if (parsed.pathname.includes(publicPrefix)) {
      return parsed.pathname.split(publicPrefix)[1] || '';
    }

    if (parsed.pathname.includes(signedPrefix)) {
      return parsed.pathname.split(signedPrefix)[1] || '';
    }
  } catch {
    return '';
  }

  return '';
};

/**
 * Returns a playable post video URL.
 * For private buckets, this creates a fresh signed URL using the stored path.
 * Falls back to the normalized URL when signing is unavailable.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string|{url?: string, path?: string}} video
 * @returns {Promise<string>}
 */
export const getPlayablePostVideoUrl = async (supabase, video) => {
  const normalizedVideo = normalizePostVideoItem(video);
  if (!normalizedVideo) return '';

  const videoPath = normalizedVideo.path || extractPostVideoPath(normalizedVideo.url);
  if (!videoPath) return normalizedVideo.url;

  try {
    const { data, error } = await supabase.storage
      .from('post-videos')
      .createSignedUrl(videoPath, 60 * 60);

    if (error || !data?.signedUrl) {
      return normalizedVideo.url;
    }

    return data.signedUrl;
  } catch {
    return normalizedVideo.url;
  }
};
