import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAuth, AI_TOOL_NAME_TO_ID, normalizeToolList, parseToolString } from '../../lib/appShared.js';
import { uploadMultiplePostImages, uploadMultiplePostVideos, validateFile, validateVideoFile, normalizePostVideoItem } from '../../lib/storage.js';
import { RichTextarea } from '../RichTextarea.jsx';
import BuiltWithSelector from '../BuiltWithSelector.jsx';
import CommunitySelector from '../CommunitySelector.jsx';
import { ChevronDownIcon } from '../icons.jsx';

// ============================================
// EDIT POST MODAL (shared)
// ============================================
// Reusable "Edit Post" modal so a post owner can edit from anywhere they see
// the post - the feed PostCard *and* the FullPostView detail view. It owns its
// own form state (initialized from `post`), saves to Supabase, patches the
// passed `post` object in place, then calls onSaved/onClose. Rendered
// conditionally by each caller, so it remounts fresh every time it opens.
const EditPostModal = ({ post, categories = [], userCommunities = [], postCommunities = {}, onPostCommunitiesChange = null, onClose, onSaved = null }) => {
  const { user } = useAuth();
  const [editTitle, setEditTitle] = useState(post.title || '');
  const [editDescription, setEditDescription] = useState(post.description || '');
  const [editPrompt, setEditPrompt] = useState(post.prompt || '');
  const [editDemoUrl, setEditDemoUrl] = useState(post.demo_url || '');
  const [editGithubUrl, setEditGithubUrl] = useState(post.github_repo_url || '');
  const [editDesignDocUrl, setEditDesignDocUrl] = useState(post.design_doc_url || '');
  const [editDifficulty, setEditDifficulty] = useState(post.difficulty || '');
  const [editCategoryIds, setEditCategoryIds] = useState(post.category_ids || (post.category_id ? [post.category_id] : []));
  const [editToolNames, setEditToolNames] = useState(post.ai_tool ? normalizeToolList(parseToolString(post.ai_tool)) : []);
  const [editToolModels, setEditToolModels] = useState(post.tool_models || {});
  const [editExistingImages, setEditExistingImages] = useState(Array.isArray(post.images) ? [...post.images] : []);
  const [editNewImageFiles, setEditNewImageFiles] = useState([]);
  const [editNewImagePreviews, setEditNewImagePreviews] = useState([]);
  const [editExistingVideos, setEditExistingVideos] = useState(
    Array.isArray(post.videos) ? post.videos.map(normalizePostVideoItem).filter(Boolean) : []
  );
  const [editNewVideoFiles, setEditNewVideoFiles] = useState([]);
  const [editNewVideoPreviews, setEditNewVideoPreviews] = useState([]);
  const [editUploadError, setEditUploadError] = useState('');
  const [editCategoryDropdownOpen, setEditCategoryDropdownOpen] = useState(false);
  const editCategoryDropdownRef = useRef(null);
  const editImageInputRef = useRef(null);
  const editVideoInputRef = useRef(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editCommunityIds, setEditCommunityIds] = useState((postCommunities[post.id] || []).map(c => c.id));
  const [editCommunityDropdownOpen, setEditCommunityDropdownOpen] = useState(false);

  // Close edit category dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (editCategoryDropdownRef.current && !editCategoryDropdownRef.current.contains(e.target)) {
        setEditCategoryDropdownOpen(false);
      }
    };
    if (editCategoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editCategoryDropdownOpen]);

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    setEditUploadError('');
    try {
      // Upload new images if any
      let finalImages = [...editExistingImages];
      if (editNewImageFiles.length > 0) {
        const { urls, errors } = await uploadMultiplePostImages(
          supabase,
          editNewImageFiles,
          user.id
        );
        if (errors.length > 0) {
          setEditUploadError(errors.join(', '));
          setSavingEdit(false);
          return;
        }
        finalImages = [...finalImages, ...urls];
      }

      // Upload new videos if any, then merge with the kept existing ones.
      let finalVideos = [...editExistingVideos];
      if (editNewVideoFiles.length > 0) {
        const { videos, errors } = await uploadMultiplePostVideos(
          supabase,
          editNewVideoFiles,
          user.id
        );
        if (errors.length > 0) {
          setEditUploadError(errors.join(', '));
          setSavingEdit(false);
          return;
        }
        finalVideos = [...finalVideos, ...videos];
      }
      const firstVideo = finalVideos.length > 0 ? normalizePostVideoItem(finalVideos[0]) : null;

      // Build tool IDs from names
      const normalizedToolNames = normalizeToolList(editToolNames);
      const selectedToolIds = normalizedToolNames.map(t => AI_TOOL_NAME_TO_ID[t] || t.trim().toLowerCase().replace(/\s+/g, '-'));
      const normalizedToolModels = normalizedToolNames.reduce((acc, toolName) => {
        const model = editToolModels?.[toolName];
        if (!model) return acc;
        const toolId = AI_TOOL_NAME_TO_ID[toolName] || toolName.trim().toLowerCase().replace(/\s+/g, '-');
        acc[toolId] = model;
        return acc;
      }, {});

      const updateData = {
        title: editTitle,
        description: editDescription,
        prompt: editPrompt || null,
        demo_url: editDemoUrl || null,
        github_repo_url: editGithubUrl || null,
        design_doc_url: editDesignDocUrl || null,
        difficulty: editDifficulty || null,
        category_id: editCategoryIds[0] || null,
        category_ids: editCategoryIds.length > 0 ? editCategoryIds : null,
        ai_tool: normalizedToolNames.join(', ') || null,
        tool_ids: selectedToolIds.length > 0 ? selectedToolIds : null,
        tool_models: Object.keys(normalizedToolModels).length > 0 ? normalizedToolModels : null,
        images: finalImages.length > 0 ? finalImages : null,
        videos: finalVideos.length > 0 ? finalVideos : null,
        has_video: finalVideos.length > 0,
        video_url: firstVideo?.url || null
      };

      const { error } = await supabase.from('posts').update(updateData).eq('id', post.id);
      if (error) throw error;

      // Sync community_posts: diff existing vs selected, insert/delete as needed
      const existingCommunityIds = (postCommunities[post.id] || []).map(c => c.id);
      const toAdd = editCommunityIds.filter(id => !existingCommunityIds.includes(id));
      const toRemove = existingCommunityIds.filter(id => !editCommunityIds.includes(id));
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('community_posts')
          .delete()
          .eq('post_id', post.id)
          .in('community_id', toRemove);
        if (removeError) console.error('Failed to remove post from communities:', removeError);
      }
      if (toAdd.length > 0) {
        const { error: addError } = await supabase
          .from('community_posts')
          .insert(toAdd.map(communityId => ({ community_id: communityId, post_id: post.id })));
        if (addError) console.error('Failed to add post to communities:', addError);
      }
      if (onPostCommunitiesChange && (toAdd.length > 0 || toRemove.length > 0)) {
        const updatedCommunities = editCommunityIds
          .map(id => userCommunities.find(c => c.id === id) || (postCommunities[post.id] || []).find(c => c.id === id))
          .filter(Boolean);
        onPostCommunitiesChange(post.id, updatedCommunities);
      }

      // Update local post object
      post.title = editTitle;
      post.description = editDescription;
      post.prompt = editPrompt || null;
      post.demo_url = editDemoUrl || null;
      post.github_repo_url = editGithubUrl || null;
      post.design_doc_url = editDesignDocUrl || null;
      post.difficulty = editDifficulty || null;
      post.category_id = editCategoryIds[0] || null;
      post.category_ids = editCategoryIds.length > 0 ? editCategoryIds : null;
      post.ai_tool = normalizedToolNames.join(', ') || null;
      post.tool_ids = selectedToolIds.length > 0 ? selectedToolIds : null;
      post.tool_models = Object.keys(normalizedToolModels).length > 0 ? normalizedToolModels : null;
      post.images = finalImages.length > 0 ? finalImages : null;
      post.videos = finalVideos.length > 0 ? finalVideos : null;
      post.has_video = finalVideos.length > 0;
      post.video_url = firstVideo?.url || null;

      // Cleanup previews
      editNewImagePreviews.forEach(url => URL.revokeObjectURL(url));
      editNewVideoPreviews.forEach(url => URL.revokeObjectURL(url));
      setEditNewImageFiles([]);
      setEditNewImagePreviews([]);
      setEditNewVideoFiles([]);
      setEditNewVideoPreviews([]);
      if (onSaved) onSaved(post);
      onClose();
    } catch (err) {
      console.error('Error editing post:', err);
      setEditUploadError(err.message || 'Failed to save changes');
    }
    setSavingEdit(false);
  };

  return (
    <div className="modal-overlay" onClick={() => !savingEdit && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Edit Post</h2>
          <button className="modal-close" onClick={() => !savingEdit && onClose()}>×</button>
        </div>
        <div className="modal-body">
          {/* Title */}
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              type="text"
              className="form-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Description</label>
            <RichTextarea
              value={editDescription}
              onChange={(v) => setEditDescription(v)}
              rows={4}
            />
          </div>

          {/* Prompt - only for non-question posts */}
          {!post.is_question && post.post_type !== 'post' && (
            <div className="form-group">
              <label className="form-label">Prompts Used</label>
              <textarea
                className="form-input form-textarea expanding-textarea"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={4}
                placeholder="What prompts did you use?"
              />
            </div>
          )}

          {/* Demo URL */}
          <div className="form-group">
            <label className="form-label">{post.post_type === 'post' ? 'Link (optional)' : 'Link to your build'}</label>
            <input
              type="url"
              className="form-input"
              placeholder="https://your-demo.vercel.app"
              value={editDemoUrl}
              onChange={(e) => setEditDemoUrl(e.target.value)}
            />
          </div>

          {/* GitHub URL - only for builds */}
          {post.post_type !== 'post' && !post.is_question && (
            <div className="form-group">
              <label className="form-label">GitHub Repo (optional)</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://github.com/user/repo"
                value={editGithubUrl}
                onChange={(e) => setEditGithubUrl(e.target.value)}
              />
            </div>
          )}

          {/* Design doc URL - only for builds */}
          {post.post_type !== 'post' && !post.is_question && (
            <div className="form-group">
              <label className="form-label">Design doc URL (optional)</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://you.github.io/project/DESIGN.html"
                value={editDesignDocUrl}
                onChange={(e) => setEditDesignDocUrl(e.target.value)}
              />
            </div>
          )}

          {/* Categories */}
          <div className="form-group">
            <label className="form-label">Category</label>
            <div className="category-dropdown-container" ref={editCategoryDropdownRef}>
              <div
                className="category-dropdown-trigger form-input"
                onClick={() => setEditCategoryDropdownOpen(!editCategoryDropdownOpen)}
              >
                {editCategoryIds.length === 0 ? (
                  <span className="category-dropdown-placeholder">Select categories...</span>
                ) : (
                  <div className="category-dropdown-selected">
                    {editCategoryIds.map(catId => {
                      const cat = categories.find(c => c.id === catId);
                      if (!cat) return null;
                      return (
                        <span key={cat.id} className="category-tag" style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff' }}>
                          {cat.name}
                        </span>
                      );
                    })}
                  </div>
                )}
                <ChevronDownIcon />
              </div>
              {editCategoryDropdownOpen && (
                <div className="category-dropdown-menu">
                  {categories.map(cat => (
                    <div
                      key={cat.id}
                      className={`category-dropdown-item ${editCategoryIds.includes(cat.id) ? 'selected' : ''}`}
                      onClick={() => {
                        setEditCategoryIds(prev =>
                          prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                        );
                      }}
                    >
                      <span className="category-dropdown-check">
                        {editCategoryIds.includes(cat.id) ? '✓' : ''}
                      </span>
                      <span className="category-dropdown-name">{cat.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Built With (Tools) */}
          <BuiltWithSelector
            selectedTools={editToolNames}
            selectedModels={editToolModels}
            onChange={(tools) => setEditToolNames(normalizeToolList(tools))}
            onModelsChange={(models) => setEditToolModels(models)}
            label={post.is_question || post.post_type === 'post' ? 'Tools Mentioned' : 'Built With'}
          />

          {/* Difficulty - only for builds */}
          {post.post_type !== 'post' && !post.is_question && (
            <div className="form-group">
              <label className="form-label">Difficulty</label>
              <select
                className="form-input"
                value={editDifficulty}
                onChange={(e) => setEditDifficulty(e.target.value)}
              >
                <option value="">Select difficulty...</option>
                <option value="beginner">Beginner</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          )}

          {/* Images */}
          <div className="form-group">
            <label className="form-label">Images</label>
            <input
              type="file"
              ref={editImageInputRef}
              className="file-input-hidden"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files);
                const validFiles = [];
                const errors = [];
                files.forEach(file => {
                  const validation = validateFile(file);
                  if (validation.valid) validFiles.push(file);
                  else errors.push(`${file.name}: ${validation.error}`);
                });
                if (errors.length > 0) setEditUploadError(errors.join(', '));
                else setEditUploadError('');
                if (validFiles.length > 0) {
                  const newPreviews = validFiles.map(f => URL.createObjectURL(f));
                  setEditNewImageFiles(prev => [...prev, ...validFiles]);
                  setEditNewImagePreviews(prev => [...prev, ...newPreviews]);
                }
                e.target.value = '';
              }}
            />

            {/* Existing + new image previews */}
            {(editExistingImages.length > 0 || editNewImagePreviews.length > 0) && (
              <div className="image-preview-grid" style={{ marginBottom: '8px' }}>
                {editExistingImages.map((url, index) => (
                  <div key={`existing-${index}`} className="image-preview-item">
                    <img src={url} alt={`Image ${index + 1}`} />
                    <button
                      className="image-preview-remove"
                      onClick={() => setEditExistingImages(prev => prev.filter((_, i) => i !== index))}
                    >×</button>
                  </div>
                ))}
                {editNewImagePreviews.map((url, index) => (
                  <div key={`new-${index}`} className="image-preview-item">
                    <img src={url} alt={`New image ${index + 1}`} />
                    <button
                      className="image-preview-remove"
                      onClick={() => {
                        URL.revokeObjectURL(url);
                        setEditNewImageFiles(prev => prev.filter((_, i) => i !== index));
                        setEditNewImagePreviews(prev => prev.filter((_, i) => i !== index));
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => editImageInputRef.current?.click()}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
            >
              + Add Images
            </button>

            {editUploadError && (
              <div className="upload-error" style={{ marginTop: '8px' }}>{editUploadError}</div>
            )}
          </div>

          {/* Videos */}
          <div className="form-group">
            <label className="form-label">Videos</label>
            <input
              type="file"
              ref={editVideoInputRef}
              className="file-input-hidden"
              accept="video/mp4,video/webm,video/quicktime"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files);
                const validFiles = [];
                const errors = [];
                files.forEach(file => {
                  const validation = validateVideoFile(file);
                  if (validation.valid) validFiles.push(file);
                  else errors.push(`${file.name}: ${validation.error}`);
                });
                if (errors.length > 0) setEditUploadError(errors.join(', '));
                else setEditUploadError('');
                if (validFiles.length > 0) {
                  const newPreviews = validFiles.map(f => URL.createObjectURL(f));
                  setEditNewVideoFiles(prev => [...prev, ...validFiles]);
                  setEditNewVideoPreviews(prev => [...prev, ...newPreviews]);
                }
                e.target.value = '';
              }}
            />

            {/* Existing + new video previews */}
            {(editExistingVideos.length > 0 || editNewVideoPreviews.length > 0) && (
              <div className="image-preview-grid" style={{ marginBottom: '8px' }}>
                {editExistingVideos.map((video, index) => (
                  <div key={`existing-vid-${index}`} className="image-preview-item">
                    <video src={video.url} controls style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
                    <button
                      className="image-preview-remove"
                      onClick={() => setEditExistingVideos(prev => prev.filter((_, i) => i !== index))}
                    >×</button>
                  </div>
                ))}
                {editNewVideoPreviews.map((url, index) => (
                  <div key={`new-vid-${index}`} className="image-preview-item">
                    <video src={url} controls style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
                    <button
                      className="image-preview-remove"
                      onClick={() => {
                        URL.revokeObjectURL(url);
                        setEditNewVideoFiles(prev => prev.filter((_, i) => i !== index));
                        setEditNewVideoPreviews(prev => prev.filter((_, i) => i !== index));
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => editVideoInputRef.current?.click()}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
            >
              + Add Videos
            </button>
            <p className="prompt-helper-text" style={{ marginTop: '6px' }}>MP4 / WebM / MOV, up to 150MB each.</p>
          </div>

          {/* Communities */}
          {userCommunities.length > 0 && (
            <div className="form-group">
              <label className="form-label">Post to Community</label>
              <CommunitySelector
                userCommunities={userCommunities}
                selectedCommunityIds={editCommunityIds}
                onSelect={setEditCommunityIds}
                isOpen={editCommunityDropdownOpen}
                onOpenChange={(open) => {
                  if (open) setEditCategoryDropdownOpen(false);
                  setEditCommunityDropdownOpen(open);
                }}
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onClose()} disabled={savingEdit}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSaveEdit}
            disabled={savingEdit}
          >
            {savingEdit ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPostModal;
