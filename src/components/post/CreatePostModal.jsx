import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAuth, useToast, AI_TOOL_NAME_TO_ID, normalizeToolList, parseToolString, copyToClipboard } from '../../lib/appShared.js';
import { uploadMultiplePostImages, uploadMultiplePostVideos, validateFile, validateVideoFile, normalizePostVideoItem } from '../../lib/storage.js';
import { moderateContent } from '../../lib/moderation.js';
import { buildPostPath, extractPostId } from '../../lib/postUrl.js';
import { hostPostDesignDoc } from '../../lib/agentPosting.js';
import { RichText } from '../../lib/richText.jsx';
import { RichTextarea } from '../RichTextarea.jsx';
import OriginalPostCard from '../OriginalPostCard.jsx';
import BuiltWithSelector from '../BuiltWithSelector.jsx';
import CommunitySelector from '../CommunitySelector.jsx';
import { CheckIcon, ChevronDownIcon, UploadCloudIcon } from '../icons.jsx';

// ============================================
// CREATE POST MODAL
// ============================================
const CreatePostModal = ({ isOpen, onClose, categories, onSuccess, userCommunities = [], preSelectedCommunityId = null, defaultIsQuestion = false, askAboutPostId = null, remixFromPost = null, theme = 'mac', initialDraft = '', defaultPostType = null }) => {
  const { user, profile } = useAuth();
  const { addToast } = useToast();
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const [postType, setPostType] = useState(defaultPostType || (defaultIsQuestion || askAboutPostId ? 'question' : 'build')); // 'build', 'question', 'post', 'video'
  const isQuestion = postType === 'question';
  const isCasualPost = postType === 'post';
  const isVideoPost = postType === 'video';
  const [isAutomation, setIsAutomation] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    prompt: '',
    category_ids: [],
    demo_url: '',
    github_repo_url: '',
    design_doc_url: '',
    design_doc_html: '',
    remix_source_url: '',
    ai_tool: '',
    tool_models: {},
    images: [],
    videos: [],
    difficulty: ''
  });
  const [designDocFileName, setDesignDocFileName] = useState('');
  // Optional poll (Discussion posts). Up to 6 options; needs >=2 filled to attach.
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [selectedToolNames, setSelectedToolNames] = useState([]);
  // Multi-step prompt support
  const [promptSteps, setPromptSteps] = useState([{ step_number: 1, prompt_text: '' }]);
  const [showPromptsHelper, setShowPromptsHelper] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [communityDropdownOpen, setCommunityDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState([]);
  const [selectedVideoFiles, setSelectedVideoFiles] = useState([]);
  const [videoPreviewUrls, setVideoPreviewUrls] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedCommunityIds, setSelectedCommunityIds] = useState(preSelectedCommunityId ? [preSelectedCommunityId] : []);

  // "Ask a Question about [Post]" mode
  const [askAboutPost, setAskAboutPost] = useState(null);
  const [askAboutLoading, setAskAboutLoading] = useState(false);

  // Live "Preview Post" - sticks to the top of the composer so you can see
  // your post as it will appear before sharing. When a remix/repost link is
  // attached, the embedded original (with its image) shows in the preview too.
  const [showPreview, setShowPreview] = useState(false);
  const [previewOriginal, setPreviewOriginal] = useState(null);



  // Update selected communities when preSelectedCommunityId changes
  useEffect(() => {
    if (preSelectedCommunityId && !selectedCommunityIds.includes(preSelectedCommunityId)) {
      setSelectedCommunityIds(prev => prev.includes(preSelectedCommunityId) ? prev : [preSelectedCommunityId, ...prev]);
    }
  }, [preSelectedCommunityId]);

  // Sync postType with defaultPostType / defaultIsQuestion / askAboutPostId when modal opens
  useEffect(() => {
    if (isOpen) {
      setPostType(defaultPostType || ((defaultIsQuestion || askAboutPostId) ? 'question' : 'build'));
      setIsAutomation(false);
      setPollEnabled(false);
      setPollOptions(['', '']);
    }
  }, [isOpen, defaultPostType, defaultIsQuestion, askAboutPostId]);

  // Pre-fill description from inline composer draft when modal opens
  useEffect(() => {
    if (isOpen && initialDraft) {
      setFormData(prev => ({ ...prev, description: prev.description || initialDraft }));
    }
  }, [isOpen, initialDraft]);

  // Pre-fill remix attribution when launched via Remix Build flow
  useEffect(() => {
    if (isOpen && remixFromPost?.id) {
      setFormData(prev => ({
        ...prev,
        remix_source_url: `https://prmpted.com${buildPostPath(remixFromPost)}`,
      }));
    }
  }, [isOpen, remixFromPost]);

  // Fetch the original post when askAboutPostId is provided
  useEffect(() => {
    if (isOpen && askAboutPostId) {
      setAskAboutLoading(true);
      supabase
        .from('posts')
        .select('id, title, user_id, profiles:user_id (username, display_name, avatar_url, avatar_emoji, builder_points)')
        .eq('id', askAboutPostId)
        .single()
        .then(({ data, error }) => {
          if (data && !error) {
            setAskAboutPost(data);
          } else {
            setAskAboutPost(null);
          }
          setAskAboutLoading(false);
        });
    } else {
      setAskAboutPost(null);
      setAskAboutLoading(false);
    }
  }, [isOpen, askAboutPostId]);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
      videoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imagePreviewUrls, videoPreviewUrls]);

  // Resolve the embedded original post (repost / remix / question target) so
  // the live preview can show it as a quote-tweet card - with its image.
  // Source precedence mirrors handleSubmit: a question's askAbout link wins,
  // otherwise the pasted remix/repost URL (or Remix-flow source) is used.
  useEffect(() => {
    if (!isOpen) { setPreviewOriginal(null); return; }
    const sourceId = (isQuestion && askAboutPostId)
      ? askAboutPostId
      : (extractPostId(formData.remix_source_url) || remixFromPost?.id || null);
    if (!sourceId) { setPreviewOriginal(null); return; }
    let cancelled = false;
    supabase
      .from('posts')
      .select('id, title, prompt, images, videos, user_id, profiles:user_id (username, display_name, avatar_url, avatar_emoji)')
      .eq('id', sourceId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        setPreviewOriginal(data && !error ? data : null);
      });
    return () => { cancelled = true; };
  }, [isOpen, isQuestion, askAboutPostId, formData.remix_source_url, remixFromPost?.id]);

  // Close category dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setCategoryDropdownOpen(false);
      }
    };
    if (categoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [categoryDropdownOpen]);

  useEffect(() => {
    if (!categoryDropdownOpen) setCategorySearch('');
  }, [categoryDropdownOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedToolNames(parseToolString(formData.ai_tool));
  }, [isOpen, formData.ai_tool]);

  if (!isOpen) return null;

  const toggleCategory = (catId) => {
    setFormData(prev => ({
      ...prev,
      category_ids: prev.category_ids.includes(catId)
        ? prev.category_ids.filter(id => id !== catId)
        : [...prev.category_ids, catId]
    }));
  };

  const filteredCategories = categorySearch.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase().trim()))
    : categories;

  const renderCategoryDropdownMenu = () => (
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
      {filteredCategories.length > 0 ? filteredCategories.map(cat => (
        <div
          key={cat.id}
          className={`category-dropdown-item ${formData.category_ids.includes(cat.id) ? 'selected' : ''}`}
          onClick={() => toggleCategory(cat.id)}
        >
          <span className="category-dropdown-check">
            {formData.category_ids.includes(cat.id) ? '✓' : ''}
          </span>
          <span className="category-dropdown-name">
            {cat.name}
          </span>
        </div>
      )) : (
        <div className="category-dropdown-empty">No categories found</div>
      )}
    </div>
  );

  const handleImageSelect = (files) => {
    const fileArray = Array.from(files);
    const validFiles = [];
    const errors = [];

    fileArray.forEach(file => {
      const validation = validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        errors.push(`${file.name}: ${validation.error}`);
      }
    });

    if (errors.length > 0) {
      setUploadError(errors.join(', '));
    } else {
      setUploadError('');
    }

    if (validFiles.length > 0) {
      const newPreviewUrls = validFiles.map(file => URL.createObjectURL(file));
      setSelectedImageFiles(prev => [...prev, ...validFiles]);
      setImagePreviewUrls(prev => [...prev, ...newPreviewUrls]);
    }
  };

  const handleVideoSelect = (files) => {
    const fileArray = Array.from(files);
    const validFiles = [];
    const errors = [];

    fileArray.forEach(file => {
      const validation = validateVideoFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        errors.push(`${file.name}: ${validation.error}`);
      }
    });

    if (errors.length > 0) {
      setUploadError(errors.join(', '));
    } else {
      setUploadError('');
    }

    if (validFiles.length > 0) {
      const newPreviewUrls = validFiles.map(file => URL.createObjectURL(file));
      setSelectedVideoFiles(prev => [...prev, ...validFiles]);
      setVideoPreviewUrls(prev => [...prev, ...newPreviewUrls]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const videoFiles = files.filter(f => f.type.startsWith('video/'));
    if (imageFiles.length > 0) handleImageSelect(imageFiles);
    if (videoFiles.length > 0) handleVideoSelect(videoFiles);
  };

  const handleMediaSelect = (files) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(f => f.type.startsWith('image/'));
    const videoFiles = fileArray.filter(f => f.type.startsWith('video/'));
    if (imageFiles.length > 0) handleImageSelect(imageFiles);
    if (videoFiles.length > 0) handleVideoSelect(videoFiles);
  };

  const handleRemoveImage = (index) => {
    URL.revokeObjectURL(imagePreviewUrls[index]);
    setSelectedImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveVideo = (index) => {
    URL.revokeObjectURL(videoPreviewUrls[index]);
    setSelectedVideoFiles(prev => prev.filter((_, i) => i !== index));
    setVideoPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  // Tag handling
  // Prompt steps management
  const addPromptStep = () => {
    const newStep = { step_number: promptSteps.length + 1, prompt_text: '' };
    setPromptSteps(prev => [...prev, newStep]);
  };

  const updatePromptStep = (index, field, value) => {
    setPromptSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const removePromptStep = (index) => {
    if (promptSteps.length <= 1) return;
    setPromptSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_number: i + 1 })));
  };

  // Poll option management (Discussion posts)
  const updatePollOption = (index, value) => {
    setPollOptions(prev => prev.map((o, i) => i === index ? value : o));
  };
  const addPollOption = () => {
    setPollOptions(prev => prev.length >= 6 ? prev : [...prev, '']);
  };
  const removePollOption = (index) => {
    setPollOptions(prev => prev.length <= 2 ? prev : prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Different validation for each post type
    if (isQuestion) {
      if (!formData.title) {
        addToast('Please enter your question', 'error');
        return;
      }
    } else if (isCasualPost) {
      if (!formData.title || !formData.description) {
        addToast('Please fill in the title and body', 'error');
        return;
      }
      if (pollEnabled && pollOptions.filter(o => o.trim()).length < 2) {
        addToast('A poll needs at least two options.', 'error');
        return;
      }
    } else if (isVideoPost) {
      if (!formData.title) {
        addToast('Please give your video a title', 'error');
        return;
      }
      const hasVideos = selectedVideoFiles.length > 0 || (Array.isArray(formData.videos) && formData.videos.length > 0);
      if (!hasVideos) {
        addToast('Video posts require at least one video upload.', 'error');
        return;
      }
      if (formData.category_ids.length === 0) {
        addToast('Pick at least one topic so others can find your video.', 'error');
        return;
      }
    } else {
      // Build prompt from steps
      const combinedPrompt = promptSteps.map(s => s.prompt_text).filter(Boolean).join('\n\n---\n\n');
      if (!formData.title || !combinedPrompt) {
        addToast('Please fill in title and at least one prompt step', 'error');
        return;
      }
      // Builds require at least one attachment (image or video) and a demo_url
      if (postType === 'build') {
        const hasImages = selectedImageFiles.length > 0 || formData.images.length > 0;
        const hasVideos = selectedVideoFiles.length > 0 || (Array.isArray(formData.videos) && formData.videos.length > 0);
        if (!hasImages && !hasVideos) {
          addToast('Builds require at least one attachment. Please upload an image or video of what you built.', 'error');
          return;
        }
        if (!formData.demo_url || !formData.demo_url.trim()) {
          addToast('Builds require a link. Please add a link to your build.', 'error');
          return;
        }
      }
    }

    setLoading(true);
    setUploadError('');

    try {
      let imageUrls = [...formData.images];
      let videoItems = Array.isArray(formData.videos) ? [...formData.videos] : [];

      // Upload selected files
      const totalUploads = selectedImageFiles.length + selectedVideoFiles.length;
      if (totalUploads > 0) {
        setUploadProgress({ current: 0, total: totalUploads });
      }

      if (selectedImageFiles.length > 0) {
        const { urls, errors } = await uploadMultiplePostImages(
          supabase,
          selectedImageFiles,
          user.id,
          (current) => setUploadProgress(prev => ({ ...prev, current }))
        );

        if (errors.length > 0) {
          setUploadError(errors.join(', '));
          setLoading(false);
          return;
        }

        imageUrls = [...imageUrls, ...urls];
      }

      if (selectedVideoFiles.length > 0) {
        const currentOffset = selectedImageFiles.length;
        const { videos, errors } = await uploadMultiplePostVideos(
          supabase,
          selectedVideoFiles,
          user.id,
          (current, total) => setUploadProgress({ current: currentOffset + current, total: currentOffset + total })
        );

        if (errors.length > 0) {
          setUploadError(errors.join(', '));
          setLoading(false);
          return;
        }

        videoItems = [...videoItems, ...videos];
      }

      // Build combined prompt from steps
      const combinedPrompt = promptSteps.map(s => s.prompt_text).filter(Boolean).join('\n\n---\n\n');
      const cleanPromptSteps = promptSteps.filter(s => s.prompt_text.trim()).map((s, i) => ({
        step_number: i + 1,
        prompt_text: s.prompt_text
      }));

      // Content moderation check
      const textToModerate = [formData.title, formData.description, combinedPrompt].filter(Boolean).join(' ');
      try {
        const modResult = await moderateContent(textToModerate);
        if (!modResult.approved) {
          addToast(modResult.reason || 'Your content was not approved by moderation.', 'error');
          setLoading(false);
          return;
        }
      } catch (modErr) {
        addToast('Content moderation check failed. Please try again.', 'error');
        setLoading(false);
        return;
      }

      // post_type must ALWAYS be one of the DB-allowed values
      // ('build', 'post', 'discussion', 'question'). Video is NOT a post type
      // in our schema - it is stored in dedicated columns (has_video,
      // video_url, videos). The UI "video" selection maps to a build; never
      // derive post_type from the file/mime type or "is this a video" check.
      const ALLOWED_POST_TYPES = ['build', 'post', 'discussion', 'question'];
      const dbPostType = ALLOWED_POST_TYPES.includes(postType) ? postType : 'build';

      // Video data lives on its own columns, independent of post_type.
      const firstVideo = videoItems.length > 0 ? normalizePostVideoItem(videoItems[0]) : null;

      const normalizedSelectedToolNames = normalizeToolList(selectedToolNames);
      const selectedToolIds = normalizedSelectedToolNames.map(t => AI_TOOL_NAME_TO_ID[t] || t.trim().toLowerCase().replace(/\s+/g, '-'));
      const normalizedToolModels = normalizedSelectedToolNames.reduce((acc, toolName) => {
        const model = formData.tool_models?.[toolName];
        if (!model) return acc;
        const toolId = AI_TOOL_NAME_TO_ID[toolName] || toolName.trim().toLowerCase().replace(/\s+/g, '-');
        acc[toolId] = model;
        return acc;
      }, {});

      const insertData = {
          user_id: user.id,
          title: formData.title,
          description: formData.description,
          prompt: (isQuestion || isCasualPost || isVideoPost) ? null : combinedPrompt,
          prompt_steps: (isQuestion || isCasualPost || isVideoPost) ? null : (cleanPromptSteps.length > 0 ? cleanPromptSteps : null),
          category_id: isQuestion ? null : (formData.category_ids[0] || null),
          category_ids: formData.category_ids.length > 0 ? formData.category_ids : null,
          demo_url: formData.demo_url || null,
          github_repo_url: isCasualPost ? null : (formData.github_repo_url || null),
          design_doc_url: (isQuestion || isCasualPost || isVideoPost) ? null : (formData.design_doc_url || null),
          ai_tool: normalizedSelectedToolNames.join(', ') || null,
          tool_ids: selectedToolIds.length > 0 ? selectedToolIds : null,
          tool_models: Object.keys(normalizedToolModels).length > 0 ? normalizedToolModels : null,
          images: imageUrls.length > 0 ? imageUrls : null,
          videos: videoItems.length > 0 ? videoItems : null,
          has_video: videoItems.length > 0,
          video_url: firstVideo?.url || null,
          is_question: isQuestion,
          post_type: dbPostType,
          is_automation: isAutomation || false,
          difficulty: (isQuestion || isCasualPost || isVideoPost) ? null : (formData.difficulty || null)
      };

      // Attach an optional poll (Discussion posts only). Stable ids keep votes
      // bound to an option even if its label is later edited.
      if (isCasualPost && pollEnabled) {
        const opts = pollOptions
          .map(o => o.trim())
          .filter(Boolean)
          .slice(0, 6)
          .map((text, i) => ({ id: `opt${i + 1}`, text }));
        if (opts.length >= 2) insertData.poll_options = opts;
      }

      // Add fork fields when asking a question about a specific post
      if (askAboutPostId && isQuestion) {
        insertData.forked_from_post_id = askAboutPostId;
        insertData.fork_type = 'question';
      }

      // Add remix attribution when the user pasted a Prompted post URL.
      // Works for builds, discussions, and questions. Skips if the question
      // is already linked via askAboutPostId (that link takes precedence).
      if (formData.remix_source_url && !insertData.forked_from_post_id) {
        // extractPostId pulls the trailing UUID, so slugged URLs
        // (/post/my-title-{uuid}) resolve correctly too.
        const remixSourceId = extractPostId(formData.remix_source_url);
        if (remixSourceId) {
          insertData.forked_from_post_id = remixSourceId;
          insertData.fork_type = 'remix';
        }
      }

      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert(insertData)
        .select()
        .single();

      if (postError) throw postError;

      // Host an uploaded HTML design doc (post_design_docs -> /design-doc/:id)
      // and point the post at it. Non-fatal: the post is live regardless.
      if (formData.design_doc_html && formData.design_doc_html.trim()) {
        const hostedUrl = await hostPostDesignDoc(supabase, {
          postId: post.id,
          userId: user.id,
          html: formData.design_doc_html,
        });
        if (hostedUrl) {
          await supabase.from('posts').update({ design_doc_url: hostedUrl }).eq('id', post.id);
          post.design_doc_url = hostedUrl;
        }
      }

      // Add the post to selected communities
      if (selectedCommunityIds.length > 0) {
        const communityPostsData = selectedCommunityIds.map(communityId => ({
          community_id: communityId,
          post_id: post.id
        }));

        const { error: communityPostError } = await supabase
          .from('community_posts')
          .insert(communityPostsData);

        if (communityPostError) {
          console.error('Failed to add post to communities:', communityPostError);
        }
      }


      addToast(isQuestion ? 'Question posted!' : isCasualPost ? 'Post shared!' : isVideoPost ? 'Video posted!' : 'Build shared!', 'success');
      // Show builder points notification for builds
      if (!isQuestion && !isCasualPost) {
        setTimeout(() => addToast('+10 \uD83C\uDFD7\uFE0F Posted a build!', 'points'), 500);
      }
      // Cleanup
      imagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
      videoPreviewUrls.forEach(url => URL.revokeObjectURL(url));
      setFormData({ title: '', description: '', prompt: '', category_ids: [], demo_url: '', github_repo_url: '', design_doc_url: '', design_doc_html: '', remix_source_url: '', ai_tool: '', tool_models: {}, images: [], videos: [], difficulty: '' });
      setDesignDocFileName('');
      setSelectedToolNames([]);
      setPromptSteps([{ step_number: 1, prompt_text: '' }]);
      setSelectedImageFiles([]);
      setImagePreviewUrls([]);
      setSelectedVideoFiles([]);
      setVideoPreviewUrls([]);
      setUploadProgress({ current: 0, total: 0 });
      setSelectedCommunityIds([]);
      setPollEnabled(false);
      setPollOptions(['', '']);
      setPostType('build');
      setCategoryDropdownOpen(false);
      setCommunityDropdownOpen(false);
      onSuccess(selectedCommunityIds[0] || null, isQuestion);
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const headerCopy = isQuestion
    ? { eyebrow: 'New Post', title: 'Ask a Question', sub: 'Get help from people who’ve built with the same tools.' }
    : isCasualPost
      ? { eyebrow: 'New Post', title: 'Start a Discussion', sub: 'Share an idea, tip, or update for the community to riff on.' }
      : isAutomation
        ? { eyebrow: 'New Post', title: 'Share Your Automation', sub: 'Walk us through what it does and how to set it up.' }
        : { eyebrow: 'New Post', title: 'Share a Build', sub: 'Show what you made with AI. The prompt, the tools, and the result.' };

  const terminalTitle = isQuestion ? 'prompted@user: ~/new-question' : isCasualPost ? 'prompted@user: ~/new-post' : 'prompted@user: ~/new-build';
  const isTerminal = theme && theme !== 'prompted';

  return (
    <div className="modal-overlay create-post-overlay-fullscreen" onClick={onClose}>
      <div className={`modal create-post-modal-v2 create-post-modal-fullscreen ${isTerminal ? `terminal-themed terminal-theme-${theme}` : ''}`} onClick={e => e.stopPropagation()}>
        {isTerminal && (theme === 'windows' ? (
          <div className="terminal-titlebar windows-tabs">
            <div className="win-tab">
              <span className="win-tab-icon">▮</span>
              <span className="win-tab-title">Command Prompt</span>
              <span className="win-tab-close" onClick={onClose}>✕</span>
            </div>
            <button className="win-tab-add" title="New tab">+</button>
            <button className="win-tab-menu" title="Menu">▾</button>
            <div className="terminal-titlebar-spacer" />
            <div className="terminal-win-controls">
              <button title="Minimize">-</button>
              <button title="Maximize">▢</button>
              <button className="close" onClick={onClose} title="Close">✕</button>
            </div>
          </div>
        ) : (
          <div className="terminal-titlebar">
            <div className="terminal-dots">
              <span className="terminal-dot close" onClick={onClose} role="button" title="Close" style={{ cursor: 'pointer' }} />
              <span className="terminal-dot min" />
              <span className="terminal-dot max" />
            </div>
            <span className="terminal-titlebar-title">
              {terminalTitle} - {theme === 'linux' ? 'bash' : theme === 'retro' ? 'tty1' : 'zsh'}
            </span>
            <div style={{ width: 52 }} />
          </div>
        ))}
        <div className="modal-header">
          <div className="modal-title-block">
            <span className="modal-title-eyebrow">{headerCopy.eyebrow}</span>
            <h2 className="modal-title">{headerCopy.title}</h2>
            <p className="modal-title-sub">{headerCopy.sub}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Live Preview - sticks to the top of the composer when toggled on.
              Shows the post as it'll appear, including the embedded repost/remix
              (with its image) when a source link is attached. */}
          {showPreview && (() => {
            const previewName = profile?.display_name || profile?.username || 'You';
            const previewHandle = profile?.username || 'you';
            const previewAvatarUrl = profile?.avatar_url;
            const previewEmoji = profile?.avatar_emoji;
            const previewPrompt = (isQuestion || isCasualPost || isVideoPost)
              ? ''
              : promptSteps.map(s => s.prompt_text).filter(Boolean).join('\n\n---\n\n');
            const previewImages = [...(formData.images || []), ...imagePreviewUrls];
            const previewPollOptions = (isCasualPost && pollEnabled)
              ? pollOptions.map(o => o.trim()).filter(Boolean)
              : [];
            const previewForkType = (isQuestion && askAboutPostId) ? 'question' : 'remix';
            const hasContent = formData.title || formData.description || previewPrompt
              || previewImages.length > 0 || videoPreviewUrls.length > 0 || previewOriginal;
            return (
              <div className="post-preview-sticky">
                <div className="post-preview-bar">
                  <span className="post-preview-bar-label">👁 Preview</span>
                  <button
                    type="button"
                    className="post-preview-bar-close"
                    onClick={() => setShowPreview(false)}
                    title="Hide preview"
                  >Hide</button>
                </div>
                <div className="post-preview-card">
                  {!hasContent ? (
                    <p className="post-preview-empty">Start filling in your post and it'll show up here.</p>
                  ) : (
                    <>
                      <div className="post-preview-header">
                        <div className="post-preview-avatar">
                          {previewAvatarUrl ? (
                            <img src={previewAvatarUrl} alt="" />
                          ) : previewEmoji ? (
                            <span>{previewEmoji}</span>
                          ) : (
                            <span>👤</span>
                          )}
                        </div>
                        <div className="post-preview-author-block">
                          <span className="post-preview-author">{previewName}</span>
                          <span className="post-preview-handle">@{previewHandle}</span>
                        </div>
                      </div>
                      {formData.title && <div className="post-preview-title">{formData.title}</div>}
                      {formData.description && (
                        <div className="post-preview-desc"><RichText text={formData.description} /></div>
                      )}
                      {previewPrompt && (
                        <pre className="post-preview-prompt">{previewPrompt}</pre>
                      )}
                      {previewPollOptions.length > 0 && (
                        <div className="post-preview-poll">
                          {previewPollOptions.map((opt, i) => (
                            <div key={i} className="post-preview-poll-option">{opt}</div>
                          ))}
                        </div>
                      )}
                      {previewImages.length > 0 && (
                        <div className="post-preview-images">
                          {previewImages.slice(0, 4).map((img, i) => (
                            <img key={i} src={img} alt="" loading="lazy" />
                          ))}
                        </div>
                      )}
                      {videoPreviewUrls.length > 0 && (
                        <div className="post-preview-video">
                          <video src={videoPreviewUrls[0]} controls playsInline preload="metadata" />
                        </div>
                      )}
                      {previewOriginal && (
                        <div className="post-preview-embedded">
                          <OriginalPostCard
                            originalPost={previewOriginal}
                            forkType={previewForkType}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Post Type Picker */}
          {!defaultIsQuestion && (
            <div className="form-group">
              <div className="post-type-picker-label">What kind of post is this?</div>
              <div className="post-type-picker" role="radiogroup" aria-label="Post type">
                <button
                  type="button"
                  role="radio"
                  aria-checked={postType === 'build'}
                  className={`post-type-card ${postType === 'build' ? 'active' : ''}`}
                  onClick={() => { setPostType('build'); setIsAutomation(false); }}
                >
                  <span className="post-type-card-title">Share a Build</span>
                  <span className="post-type-card-desc">Show what you made with AI. The prompt, the tools, and the result.</span>
                  <span className="post-type-card-check" aria-hidden="true"><CheckIcon /></span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={postType === 'post'}
                  className={`post-type-card ${postType === 'post' ? 'active' : ''}`}
                  onClick={() => { setPostType('post'); setIsAutomation(false); }}
                >
                  <span className="post-type-card-title">Discussion</span>
                  <span className="post-type-card-desc">Share an idea, tip, or update. No build required.</span>
                  <span className="post-type-card-check" aria-hidden="true"><CheckIcon /></span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={postType === 'video'}
                  className={`post-type-card ${postType === 'video' ? 'active' : ''}`}
                  onClick={() => { setPostType('video'); setIsAutomation(false); }}
                >
                  <span className="post-type-card-title">Post a Video</span>
                  <span className="post-type-card-desc">Drop a short demo clip. Shows up in the Videos scroll feed.</span>
                  <span className="post-type-card-check" aria-hidden="true"><CheckIcon /></span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={postType === 'question'}
                  className={`post-type-card ${postType === 'question' ? 'active' : ''}`}
                  onClick={() => { setPostType('question'); setIsAutomation(false); }}
                >
                  <span className="post-type-card-title">Ask a Question</span>
                  <span className="post-type-card-desc">Stuck on something? Ask the community for help.</span>
                  <span className="post-type-card-check" aria-hidden="true"><CheckIcon /></span>
                </button>
              </div>
            </div>
          )}

          {isQuestion ? (
            <>
              {/* Ask About Banner */}
              {askAboutPostId && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: 'rgba(129, 140, 248, 0.1)',
                  border: '1px solid rgba(129, 140, 248, 0.25)',
                  borderRadius: '12px',
                  marginBottom: '1rem'
                }}>
                  <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>❓</span>
                  <div style={{ flex: 1, minWidth: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {askAboutLoading ? (
                      <span>Loading original post...</span>
                    ) : askAboutPost ? (
                      <span>
                        Asking a question about{' '}
                        <a
                          href={`https://prmpted.com${buildPostPath(askAboutPost)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#818cf8', fontWeight: '600', textDecoration: 'none' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {askAboutPost.title?.length > 40 ? askAboutPost.title.substring(0, 40) + '...' : askAboutPost.title}
                        </a>
                        {' '}by <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>@{askAboutPost.profiles?.username || 'unknown'}</span>
                      </span>
                    ) : (
                      <span>Asking a question about a post</span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px',
                      fontSize: '1.1rem',
                      lineHeight: 1,
                      flexShrink: 0
                    }}
                    title="Cancel question link"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Question Form */}
              <div className="form-group">
                <label className="form-label">Your Question *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={askAboutPostId ? "What's your question about this build?" : "e.g., How do I implement authentication with Supabase?"}
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Details (optional)</label>
                <RichTextarea
                  placeholder="Provide more context about your question. What have you tried? What are you trying to achieve?"
                  rows={6}
                  value={formData.description}
                  onChange={(v) => setFormData({ ...formData, description: v })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <div className="category-dropdown-container" ref={categoryDropdownRef}>
                  <div
                    className="category-dropdown-trigger form-input"
                    onClick={() => {
                      setCommunityDropdownOpen(false);
                      setCategoryDropdownOpen(!categoryDropdownOpen);
                    }}
                  >
                    {formData.category_ids.length === 0 ? (
                      <span className="category-dropdown-placeholder">Select categories...</span>
                    ) : (
                      <div className="category-dropdown-selected">
                        {formData.category_ids.map(catId => {
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
                  {categoryDropdownOpen && renderCategoryDropdownMenu()}
                </div>
              </div>

              <BuiltWithSelector
                selectedTools={selectedToolNames}
                selectedModels={formData.tool_models || {}}
                onChange={(tools) => { setSelectedToolNames(normalizeToolList(tools)); setFormData({ ...formData, ai_tool: normalizeToolList(tools).join(', ') }); }}
                onModelsChange={(models) => setFormData({ ...formData, tool_models: models })}
                label="Tools Mentioned"
              />

              {userCommunities.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Post to Community</label>
                  <CommunitySelector
                    userCommunities={userCommunities}
                    selectedCommunityIds={selectedCommunityIds}
                    onSelect={setSelectedCommunityIds}
                    preSelectedCommunityId={preSelectedCommunityId}
                    isOpen={communityDropdownOpen}
                    onOpenChange={(open) => {
                      if (open) setCategoryDropdownOpen(false);
                      setCommunityDropdownOpen(open);
                    }}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Remix / repost link <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem' }}>(optional - paste a Prompted post URL)</span></label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://prmpted.com/post/abc-123"
                  value={formData.remix_source_url}
                  onChange={e => setFormData({ ...formData, remix_source_url: e.target.value })}
                />
                <p className="prompt-helper-text" style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#6b7280' }}>
                  Linking a post embeds it under yours - like a repost or quote.
                </p>
              </div>

            </>
          ) : isVideoPost ? (
            <>
              {/* Video Post Form */}
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="What's the video about? (e.g., 'My AI portfolio in 30 sec')"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <RichTextarea
                  placeholder="Anything you'd say in the comments under your own video..."
                  rows={4}
                  value={formData.description}
                  onChange={(v) => setFormData({ ...formData, description: v })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Topics *</label>
                <p className="prompt-helper-text" style={{ marginBottom: '0.5rem' }}>Pick the topics builders would search to find this. Drives the Videos feed.</p>
                <div className="category-dropdown-container" ref={categoryDropdownRef}>
                  <div
                    className="category-dropdown-trigger form-input"
                    onClick={() => {
                      setCommunityDropdownOpen(false);
                      setCategoryDropdownOpen(!categoryDropdownOpen);
                    }}
                  >
                    {formData.category_ids.length === 0 ? (
                      <span className="category-dropdown-placeholder">Select topics...</span>
                    ) : (
                      <div className="category-dropdown-selected">
                        {formData.category_ids.map(catId => {
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
                  {categoryDropdownOpen && renderCategoryDropdownMenu()}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Demo URL (optional)</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://your-build.com"
                  value={formData.demo_url}
                  onChange={e => setFormData({ ...formData, demo_url: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">GitHub repo (optional)</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://github.com/you/project"
                  value={formData.github_repo_url}
                  onChange={e => setFormData({ ...formData, github_repo_url: e.target.value })}
                />
              </div>

              <BuiltWithSelector
                selectedTools={selectedToolNames}
                selectedModels={formData.tool_models || {}}
                onChange={(tools) => { setSelectedToolNames(normalizeToolList(tools)); setFormData({ ...formData, ai_tool: normalizeToolList(tools).join(', ') }); }}
                onModelsChange={(models) => setFormData({ ...formData, tool_models: models })}
                label="Built With (optional)"
              />

              {userCommunities.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Post to Community (optional)</label>
                  <CommunitySelector
                    userCommunities={userCommunities}
                    selectedCommunityIds={selectedCommunityIds}
                    onSelect={setSelectedCommunityIds}
                    preSelectedCommunityId={preSelectedCommunityId}
                    isOpen={communityDropdownOpen}
                    onOpenChange={(open) => {
                      if (open) setCategoryDropdownOpen(false);
                      setCommunityDropdownOpen(open);
                    }}
                  />
                </div>
              )}
            </>
          ) : isCasualPost ? (
            <>
              {/* Casual Post Form */}
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="What's on your mind?"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Body *</label>
                <RichTextarea
                  placeholder="Share an update, tip, resource, or anything on your mind..."
                  rows={8}
                  value={formData.description}
                  onChange={(v) => setFormData({ ...formData, description: v })}
                />
              </div>

              {/* Optional poll */}
              <div className="form-group">
                <label className="lrn-toggle poll-editor-toggle" style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={pollEnabled}
                    onChange={(e) => setPollEnabled(e.target.checked)}
                  />
                  <span style={{ fontWeight: 600 }}>📊 Add a poll</span>
                </label>
                {pollEnabled && (
                  <div className="poll-editor" style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {pollOptions.map((opt, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder={`Option ${i + 1}`}
                          maxLength={80}
                          value={opt}
                          onChange={(e) => updatePollOption(i, e.target.value)}
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            className="btn"
                            style={{ flexShrink: 0, padding: '0 0.7rem', fontSize: '1.1rem', lineHeight: 1 }}
                            onClick={() => removePollOption(i)}
                            title="Remove option"
                          >×</button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 6 && (
                      <button
                        type="button"
                        className="btn"
                        style={{ alignSelf: 'flex-start', fontSize: '0.82rem', padding: '5px 10px' }}
                        onClick={addPollOption}
                      >+ Add option</button>
                    )}
                    <p className="prompt-helper-text" style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                      People pick one option. You can add 2–6 choices.
                    </p>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Link (optional)</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://example.com"
                  value={formData.demo_url}
                  onChange={e => setFormData({ ...formData, demo_url: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <div className="category-dropdown-container" ref={categoryDropdownRef}>
                  <div
                    className="category-dropdown-trigger form-input"
                    onClick={() => {
                      setCommunityDropdownOpen(false);
                      setCategoryDropdownOpen(!categoryDropdownOpen);
                    }}
                  >
                    {formData.category_ids.length === 0 ? (
                      <span className="category-dropdown-placeholder">Select categories...</span>
                    ) : (
                      <div className="category-dropdown-selected">
                        {formData.category_ids.map(catId => {
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
                  {categoryDropdownOpen && renderCategoryDropdownMenu()}
                </div>
              </div>

              <BuiltWithSelector
                selectedTools={selectedToolNames}
                selectedModels={formData.tool_models || {}}
                onChange={(tools) => { setSelectedToolNames(normalizeToolList(tools)); setFormData({ ...formData, ai_tool: normalizeToolList(tools).join(', ') }); }}
                onModelsChange={(models) => setFormData({ ...formData, tool_models: models })}
                label="Tools Mentioned"
              />

              {userCommunities.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Post to Community (optional)</label>
                  <CommunitySelector
                    userCommunities={userCommunities}
                    selectedCommunityIds={selectedCommunityIds}
                    onSelect={setSelectedCommunityIds}
                    preSelectedCommunityId={preSelectedCommunityId}
                    isOpen={communityDropdownOpen}
                    onOpenChange={(open) => {
                      if (open) setCategoryDropdownOpen(false);
                      setCommunityDropdownOpen(open);
                    }}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Remix / repost link <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem' }}>(optional - paste a Prompted post URL)</span></label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://prmpted.com/post/abc-123"
                  value={formData.remix_source_url}
                  onChange={e => setFormData({ ...formData, remix_source_url: e.target.value })}
                />
                <p className="prompt-helper-text" style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#6b7280' }}>
                  Linking a post embeds it under yours - like a repost or quote.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Regular Post Form */}
              <div className="form-group">
                <label className="form-label">{isAutomation ? 'Automation Name *' : 'What did you build? *'}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={isAutomation ? "Name your automation (e.g., 'AI Lead Scoring Agent' or 'Auto-posting Social Media Workflow')" : "What did you build? (e.g., 'AI-powered recipe app' or 'Portfolio website with animations')"}
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
                {!isAutomation && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#888', lineHeight: 1.4 }}>
                    Share a real example of how you used AI - the prompt, the tool, and what came out. New here? Just describe something you did.
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <div className="category-dropdown-container" ref={categoryDropdownRef}>
                  <div
                    className="category-dropdown-trigger form-input"
                    onClick={() => {
                      setCommunityDropdownOpen(false);
                      setCategoryDropdownOpen(!categoryDropdownOpen);
                    }}
                  >
                    {formData.category_ids.length === 0 ? (
                      <span className="category-dropdown-placeholder">Select categories...</span>
                    ) : (
                      <div className="category-dropdown-selected">
                        {formData.category_ids.map(catId => {
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
                  {categoryDropdownOpen && renderCategoryDropdownMenu()}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{isAutomation ? 'How does it work?' : 'Explain your post'}</label>
                <RichTextarea
                  placeholder={isAutomation ? "Describe what your automation does, the workflow steps, and the problem it solves..." : "Give context about what this does, what inspired it, and what you learned..."}
                  value={formData.description}
                  onChange={(v) => setFormData({ ...formData, description: v })}
                />
              </div>

              <div className="form-group" style={{ marginTop: '1.25rem' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.95rem' }}>{isAutomation ? 'The Prompts / Setup Steps *' : 'The Prompt You Used *'}</label>
                <p className="prompt-helper-text">{isAutomation ? 'Share the prompts, configurations, or step-by-step setup instructions for your automation. Help others replicate it.' : 'Paste the exact prompt(s) you used to create this. This is what makes Prompted unique -- people come here to learn your process.'}</p>
                {!isAutomation && (
                  <button
                    type="button"
                    onClick={() => setShowPromptsHelper(true)}
                    className="prompts-helper-link"
                  >
                    What if I had too many prompts?
                  </button>
                )}
                {promptSteps.map((step, index) => (
                  <div key={index} className="prompt-step-container">
                    <div className="prompt-step-header">
                      <div className="prompt-step-label">
                        <span className="prompt-step-number">{step.step_number}</span>
                        {promptSteps.length > 1 ? `Step ${step.step_number}` : 'Your Prompt'}
                      </div>
                      {promptSteps.length > 1 && (
                        <button className="prompt-step-remove" onClick={() => removePromptStep(index)} type="button">x</button>
                      )}
                    </div>
                    <textarea
                      className="form-input form-textarea prompt-step-textarea expanding-textarea"
                      placeholder={index === 0 ? "Paste your prompt here..." : `Follow-up prompt (step ${step.step_number})...`}
                      rows={5}
                      value={step.prompt_text}
                      onChange={e => updatePromptStep(index, 'prompt_text', e.target.value)}
                    />
                  </div>
                ))}
                <button type="button" className="add-prompt-step-btn" onClick={addPromptStep}>
                  + Add another step
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Link to your build *</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://your-demo.vercel.app"
                  value={formData.demo_url}
                  onChange={e => setFormData({ ...formData, demo_url: e.target.value })}
                />
                {formData.demo_url && formData.demo_url.startsWith('http') && (
                  <div className="demo-url-preview">
                    <div className="demo-url-preview-bar">
                      <span>Preview:</span>
                      <a href={formData.demo_url} target="_blank" rel="noopener noreferrer">{formData.demo_url}</a>
                    </div>
                    <iframe src={formData.demo_url} sandbox="allow-scripts allow-same-origin" title="Demo preview" loading="lazy" />
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Design doc <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem' }}>(optional)</span></label>
                {formData.design_doc_html ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.8rem', background: 'rgba(78,205,196,0.08)', border: '1px solid rgba(78,205,196,0.35)', borderRadius: 8 }}>
                    <span style={{ fontSize: '0.85rem', color: '#cfeae8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📄 {designDocFileName || 'design.html'} attached
                    </span>
                    <button
                      type="button"
                      onClick={() => { setFormData({ ...formData, design_doc_html: '' }); setDesignDocFileName(''); }}
                      style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #2a2a2a', color: '#D97757', borderRadius: 6, padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer' }}
                    >Remove</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="file"
                      accept=".html,text/html"
                      className="form-input"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) {
                          addToast('Design doc must be under 2MB.', 'error');
                          e.target.value = '';
                          return;
                        }
                        try {
                          const html = await file.text();
                          setFormData(prev => ({ ...prev, design_doc_html: html, design_doc_url: '' }));
                          setDesignDocFileName(file.name);
                        } catch {
                          addToast('Could not read that file.', 'error');
                        }
                        e.target.value = '';
                      }}
                    />
                    <p className="prompt-helper-text" style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#6b7280' }}>
                      Upload a self-contained HTML design doc that narrates how you built this (prompts, bugs, fixes). We host it for you and link it from your build - this also enables the Remix Build button.
                    </p>
                  </>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Is this a remix? <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.8rem' }}>(optional - paste the original Prompted post URL)</span></label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://prmpted.com/post/abc-123"
                  value={formData.remix_source_url}
                  onChange={e => setFormData({ ...formData, remix_source_url: e.target.value })}
                />
              </div>

              <BuiltWithSelector
                selectedTools={selectedToolNames}
                selectedModels={formData.tool_models || {}}
                onChange={(tools) => { setSelectedToolNames(normalizeToolList(tools)); setFormData({ ...formData, ai_tool: normalizeToolList(tools).join(', ') }); }}
                onModelsChange={(models) => setFormData({ ...formData, tool_models: models })}
              />

              {userCommunities.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Post to Community (optional)</label>
                  <CommunitySelector
                    userCommunities={userCommunities}
                    selectedCommunityIds={selectedCommunityIds}
                    onSelect={setSelectedCommunityIds}
                    preSelectedCommunityId={preSelectedCommunityId}
                    isOpen={communityDropdownOpen}
                    onOpenChange={(open) => {
                      if (open) setCategoryDropdownOpen(false);
                      setCommunityDropdownOpen(open);
                    }}
                  />
                </div>
              )}


            </>
          )}

          {/* Media Upload - shared by both forms */}
          <div className="form-group">
            <label className="form-label">{isQuestion ? 'Media (optional)' : isCasualPost ? 'Media (optional)' : isVideoPost ? 'Video *' : isAutomation ? 'Screenshots / Workflow Media (optional)' : 'Project Media *'}</label>
            {!isQuestion && !isCasualPost && <p className="prompt-helper-text" style={{ marginBottom: '0.5rem' }}>{isVideoPost ? 'Upload at least one video. .mp4 / .webm / .mov.' : isAutomation ? 'Add screenshots or videos of your automation workflow, agent setup, or results.' : 'At least one attachment (image or video) is required for builds.'}</p>}

            <input
              type="file"
              ref={imageInputRef}
              className="file-input-hidden"
              accept="image/*"
              multiple
              onChange={(e) => handleImageSelect(e.target.files)}
            />
            <input
              type="file"
              ref={videoInputRef}
              className="file-input-hidden"
              accept="video/mp4,video/webm,video/quicktime"
              multiple
              onChange={(e) => handleVideoSelect(e.target.files)}
            />
            <input
              type="file"
              ref={mediaInputRef}
              className="file-input-hidden"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              multiple
              onChange={(e) => { handleMediaSelect(e.target.files); e.target.value = ''; }}
            />

            <div
              className={`image-upload-dropzone ${isDragging ? 'dragging' : ''} ${(imagePreviewUrls.length + videoPreviewUrls.length) > 0 ? 'has-images' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => mediaInputRef.current?.click()}
              style={{ cursor: 'pointer' }}
            >
              {(imagePreviewUrls.length + videoPreviewUrls.length) === 0 ? (
                <>
                  <div className="upload-icon"><UploadCloudIcon /></div>
                  <p className="upload-text">Drag and drop files here, or click to browse</p>
                  <p className="upload-hint">Images and videos supported</p>
                </>
              ) : (
                <p className="upload-text">Drag and drop or click to add more files</p>
              )}
            </div>

            {(imagePreviewUrls.length > 0 || videoPreviewUrls.length > 0) && (
              <div className="image-preview-grid">
                {imagePreviewUrls.map((url, index) => (
                  <div key={`img-${index}`} className="image-preview-item">
                    <img src={url} alt={`Preview image ${index + 1}`} />
                    <button
                      className="image-preview-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveImage(index);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {videoPreviewUrls.map((url, index) => (
                  <div key={`vid-${index}`} className="image-preview-item">
                    <video src={url} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      className="image-preview-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveVideo(index);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}


            {uploadProgress.total > 0 && loading && (
              <div className="image-upload-progress">
                <p className="upload-progress-text">
                  Uploading {uploadProgress.current} of {uploadProgress.total} media items...
                </p>
                <div className="upload-progress-bar">
                  <div
                    className="upload-progress-fill"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {uploadError && (
              <div className="upload-error">{uploadError}</div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={`btn btn-secondary post-preview-toggle ${showPreview ? 'active' : ''}`}
            onClick={() => setShowPreview(v => !v)}
            style={{ marginRight: 'auto' }}
          >
            {showPreview ? 'Hide preview' : '👁 Preview'}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? (uploadProgress.total > 0 ? 'Uploading...' : (isQuestion ? 'Posting...' : 'Sharing...')) : (isQuestion ? 'Post Question' : isCasualPost ? 'Share Post' : 'Share Build')}
          </button>
        </div>
      </div>
      {showPromptsHelper && (
        <PromptsHelperModal onClose={() => setShowPromptsHelper(false)} addToast={addToast} />
      )}
    </div>
  );
};
// Helper modal opened from the Build form's "What if I had too many
// prompts?" link. Shows a paste-ready instruction the user can drop
// into an AI chat so it picks the most-valuable prompts from their
// own history and packages them for sharing on Prompted.
const PROMPTS_HELPER_TEMPLATE = `I want to share my best prompts on Prompted (a platform for AI builders).
Based on our conversation history / this project, help me extract and
package the prompts that are actually worth sharing.

For each one, give me:

1. **Title** - short and punchy, what it does in 5-7 words
2. **The prompt** - clean, copy-paste ready, with [BRACKETS] where
   someone else would swap in their own details
3. **What it produces** - 1-2 sentences on the actual outcome
4. **Why it works** - the structural or framing trick that makes it
   effective (the thing someone wouldn't figure out on their own)
5. **When to use it** - 2-3 concrete situations
6. **Example input → example output** - short, real, illustrative

Pick 3-5 prompts max. Prioritize ones that are:
- Reusable across different contexts (not hyper-specific to me)
- Non-obvious in their wording or structure
- Actually proven - I got good results from them, not just one-shots
- Worth more than a one-liner (skip "make this better" type stuff)

If a prompt I used was part of a larger system (agent, workflow, app),
note that and include the surrounding context someone would need.

Format the output as clean markdown so I can paste it directly.`;

const PromptsHelperModal = ({ onClose, addToast }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(PROMPTS_HELPER_TEMPLATE);
    if (ok) {
      setCopied(true);
      if (addToast) addToast('Copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } else if (addToast) {
      addToast('Copy failed', 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Too many prompts?</h2>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '0.85rem', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Copy the text below and paste it into your AI (ChatGPT, Claude, etc.). It will sift through your history and pull out the prompts most worth sharing on Prompted.
          </p>
          <pre className="prompts-helper-template">{PROMPTS_HELPER_TEMPLATE}</pre>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy prompt'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePostModal;
