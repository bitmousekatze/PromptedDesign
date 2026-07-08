import React, { useState, useEffect, useRef } from 'react';
import { createWorkflow } from '../lib/workflows.js';
import { moderateContent } from '../lib/moderation.js';
import { uploadMultiplePostImages, validateFile } from '../lib/storage.js';

/**
 * CreateWorkflow - Full-page form for creating a new workflow.
 * Includes workflow info section and dynamic step builder.
 */
const CreateWorkflow = ({
  supabase,
  user,
  categories = [],
  aiTools = [],
  getToolDisplayName,
  addToast,
  onSuccess,
  onClose,
}) => {
  // Workflow info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [outcome, setOutcome] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedToolIds, setSelectedToolIds] = useState([]);
  const [difficulty, setDifficulty] = useState('beginner');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [images, setImages] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [demoUrl, setDemoUrl] = useState('');

  // Steps
  const [steps, setSteps] = useState([
    { title: '', prompt_text: '', why_this_step: '', what_to_expect: '', tips: '', ai_tool: '', tool_id: '', estimated_minutes: '' },
    { title: '', prompt_text: '', why_this_step: '', what_to_expect: '', tips: '', ai_tool: '', tool_id: '', estimated_minutes: '' },
  ]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState({ 0: true, 1: true });
  const categoryDropdownRef = useRef(null);
  const toolDropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setCategoryDropdownOpen(false);
      }
      if (toolDropdownRef.current && !toolDropdownRef.current.contains(e.target)) {
        setToolDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup preview URLs
  useEffect(() => {
    return () => previewUrls.forEach(url => URL.revokeObjectURL(url));
  }, [previewUrls]);

  const toggleCategory = (catId) => {
    setSelectedCategories(prev =>
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  };

  const toggleTool = (toolId) => {
    setSelectedToolIds(prev =>
      prev.includes(toolId) ? prev.filter(id => id !== toolId) : [...prev, toolId]
    );
  };

  const handleFileSelect = (files) => {
    const fileArray = Array.from(files);
    const validFiles = [];
    fileArray.forEach(file => {
      const validation = validateFile(file);
      if (validation.valid) validFiles.push(file);
      else addToast(`${file.name}: ${validation.error}`, 'error');
    });
    if (validFiles.length > 0) {
      const newPreviews = validFiles.map(f => URL.createObjectURL(f));
      setImages(prev => [...prev, ...validFiles]);
      setPreviewUrls(prev => [...prev, ...newPreviews]);
    }
  };

  const removeImage = (index) => {
    URL.revokeObjectURL(previewUrls[index]);
    setImages(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  // Step management
  const addStep = () => {
    const newIndex = steps.length;
    setSteps(prev => [...prev, { title: '', prompt_text: '', why_this_step: '', what_to_expect: '', tips: '', ai_tool: '', tool_id: '', estimated_minutes: '' }]);
    setExpandedSteps(prev => ({ ...prev, [newIndex]: true }));
  };

  const removeStep = (index) => {
    if (steps.length <= 2) {
      addToast('Minimum 2 steps required', 'error');
      return;
    }
    setSteps(prev => prev.filter((_, i) => i !== index));
    // Re-index expanded steps
    setExpandedSteps(prev => {
      const newExpanded = {};
      Object.keys(prev).forEach(key => {
        const k = parseInt(key);
        if (k < index) newExpanded[k] = prev[k];
        else if (k > index) newExpanded[k - 1] = prev[k];
      });
      return newExpanded;
    });
  };

  const updateStep = (index, field, value) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const moveStep = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= steps.length) return;
    setSteps(prev => {
      const newSteps = [...prev];
      [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
      return newSteps;
    });
  };

  const toggleStepExpanded = (index) => {
    setExpandedSteps(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleSubmit = async () => {
    // Validation
    if (!title.trim()) {
      addToast('Please enter a workflow title', 'error');
      return;
    }

    const validSteps = steps.filter(s => s.title.trim() && s.prompt_text.trim());
    if (validSteps.length < 2) {
      addToast('Please add at least 2 steps with title and prompt', 'error');
      return;
    }

    // Content moderation
    const allText = [title, description, outcome, ...validSteps.map(s => `${s.title} ${s.prompt_text} ${s.tips || ''}`)].filter(Boolean).join(' ');
    try {
      const modResult = await moderateContent(allText);
      if (!modResult.approved) {
        addToast(modResult.reason || 'Content was not approved by moderation.', 'error');
        return;
      }
    } catch {
      addToast('Content moderation check failed. Please try again.', 'error');
      return;
    }

    setLoading(true);

    try {
      // Upload images if any
      let imageUrls = [];
      if (images.length > 0) {
        const { urls, errors } = await uploadMultiplePostImages(supabase, images, user.id);
        if (errors.length > 0) {
          addToast(errors.join(', '), 'error');
          setLoading(false);
          return;
        }
        imageUrls = urls;
      }

      const workflowData = {
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        outcome: outcome.trim() || null,
        category_ids: selectedCategories.length > 0 ? selectedCategories : null,
        category_id: selectedCategories[0] || null,
        tool_ids: selectedToolIds.length > 0 ? selectedToolIds : null,
        difficulty,
        estimated_minutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
        images: imageUrls.length > 0 ? imageUrls : [],
        demo_url: demoUrl.trim() || null,
        moderation_status: 'approved',
      };

      const { data, error } = await createWorkflow(supabase, workflowData, validSteps);

      if (error) {
        console.error('Error creating workflow:', error);
        addToast('Failed to create workflow: ' + (error.message || 'Unknown error'), 'error');
        setLoading(false);
        return;
      }

      addToast('Workflow created!', 'success');
      onSuccess && onSuccess(data);
    } catch (err) {
      console.error('Workflow creation error:', err);
      addToast('Failed to create workflow', 'error');
    }

    setLoading(false);
  };

  const inputStyle = {
    width: '100%',
    padding: '0.75rem 1rem',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: '80px',
    resize: 'vertical',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.82rem',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    marginBottom: '0.4rem',
  };

  const sectionStyle = {
    marginBottom: '1.25rem',
  };

  return (
    <div style={{
      maxWidth: '720px',
      margin: '0 auto',
      padding: '1.5rem 1rem 6rem',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2 style={{
          fontSize: '1.3rem',
          fontWeight: '700',
          color: 'var(--text-primary)',
          fontFamily: "'Fraunces', serif",
          margin: 0,
        }}>
          Create Workflow
        </h2>
      </div>

      {/* ====== WORKFLOW INFO SECTION ====== */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '14px',
        padding: '1.25rem',
        border: '1px solid var(--border-color)',
        marginBottom: '1.5rem',
      }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '1rem' }}>
          Workflow Info
        </h3>

        {/* Title */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Title *</label>
          <input
            type="text"
            placeholder="e.g., Write a week of social media posts"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
            maxLength={200}
          />
        </div>

        {/* Description */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Description</label>
          <textarea
            placeholder="What does this workflow help you accomplish?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={textareaStyle}
            maxLength={1000}
          />
        </div>

        {/* Outcome */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Outcome</label>
          <textarea
            placeholder="What specific result will the user have when done?"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            style={{ ...textareaStyle, minHeight: '60px' }}
            maxLength={500}
          />
        </div>

        {/* Category selector */}
        <div style={sectionStyle} ref={categoryDropdownRef}>
          <label style={labelStyle}>Categories</label>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
              style={{
                ...inputStyle,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ color: selectedCategories.length ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {selectedCategories.length ? `${selectedCategories.length} selected` : 'Select categories'}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {categoryDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                marginTop: '0.25rem',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 50,
              }}>
                {categories.map(cat => (
                  <div
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    style={{
                      padding: '0.6rem 0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.85rem',
                      background: selectedCategories.includes(cat.id) ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: selectedCategories.includes(cat.id) ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                    {selectedCategories.includes(cat.id) && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginLeft: 'auto' }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AI Tools selector */}
        <div style={sectionStyle} ref={toolDropdownRef}>
          <label style={labelStyle}>AI Tools Used</label>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setToolDropdownOpen(!toolDropdownOpen)}
              style={{
                ...inputStyle,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ color: selectedToolIds.length ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {selectedToolIds.length
                  ? selectedToolIds.map(id => getToolDisplayName ? getToolDisplayName(id) : id).join(', ')
                  : 'Select AI tools'}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {toolDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                marginTop: '0.25rem',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 50,
              }}>
                {aiTools.map(tool => (
                  <div
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    style={{
                      padding: '0.6rem 0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.85rem',
                      background: selectedToolIds.includes(tool.id) ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: selectedToolIds.includes(tool.id) ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    <span>{tool.name}</span>
                    {selectedToolIds.includes(tool.id) && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginLeft: 'auto' }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Difficulty & Time row */}
        <div style={{ display: 'flex', gap: '1rem', ...sectionStyle }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Difficulty</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['beginner', 'advanced'].map(level => (
                <button
                  key={level}
                  onClick={() => setDifficulty(level)}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.4rem',
                    borderRadius: '8px',
                    border: difficulty === level ? '2px solid' : '1px solid var(--border-color)',
                    borderColor: difficulty === level
                      ? (level === 'beginner' ? '#22c55e' : level === 'intermediate' ? '#eab308' : '#ef4444')
                      : 'var(--border-color)',
                    background: difficulty === level
                      ? (level === 'beginner' ? 'rgba(34,197,94,0.12)' : level === 'intermediate' ? 'rgba(234,179,8,0.12)' : 'rgba(239,68,68,0.12)')
                      : 'var(--bg-tertiary)',
                    color: difficulty === level
                      ? (level === 'beginner' ? '#22c55e' : level === 'intermediate' ? '#eab308' : '#ef4444')
                      : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    textTransform: 'capitalize',
                    fontFamily: 'inherit',
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
          <div style={{ width: '120px' }}>
            <label style={labelStyle}>Est. Minutes</label>
            <input
              type="number"
              placeholder="15"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              style={inputStyle}
              min="1"
              max="999"
            />
          </div>
        </div>

        {/* Images */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Images (optional)</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-color)',
              borderRadius: '10px',
              padding: '1.25rem',
              textAlign: 'center',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              transition: 'border-color 0.2s',
            }}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
            onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-color)'; }}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-color)'; handleFileSelect(e.dataTransfer.files); }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginBottom: '0.25rem' }}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <div>Drop images or click to browse</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          {previewUrls.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {previewUrls.map((url, i) => (
                <div key={i} style={{ position: 'relative', width: '64px', height: '64px' }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                  <button
                    onClick={() => removeImage(i)}
                    style={{
                      position: 'absolute', top: '-4px', right: '-4px',
                      width: '18px', height: '18px', borderRadius: '50%',
                      background: '#ef4444', border: 'none', color: 'white',
                      cursor: 'pointer', fontSize: '0.6rem', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Demo URL */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Demo URL (optional)</label>
          <input
            type="url"
            placeholder="https://..."
            value={demoUrl}
            onChange={(e) => setDemoUrl(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* ====== STEPS SECTION ====== */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '14px',
        padding: '1.25rem',
        border: '1px solid var(--border-color)',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
            Steps ({steps.length})
          </h3>
          <button
            onClick={addStep}
            style={{
              background: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              color: '#a78bfa',
              padding: '0.4rem 0.75rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: '600',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Step
          </button>
        </div>

        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Minimum 2 steps required. Each step should have a title and prompt text.
        </p>

        {steps.map((step, index) => (
          <div
            key={index}
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              marginBottom: '0.75rem',
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            {/* Step header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                cursor: 'pointer',
                background: expandedSteps[index] ? 'rgba(139, 92, 246, 0.06)' : 'transparent',
              }}
              onClick={() => toggleStepExpanded(index)}
            >
              <span style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))',
                color: '#a78bfa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: '700',
                flexShrink: 0,
              }}>
                {index + 1}
              </span>
              <span style={{
                flex: 1,
                fontSize: '0.88rem',
                fontWeight: '600',
                color: step.title ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
                {step.title || `Step ${index + 1}`}
              </span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); moveStep(index, -1); }}
                  disabled={index === 0}
                  style={{
                    background: 'none', border: 'none', color: index === 0 ? 'var(--border-color)' : 'var(--text-muted)',
                    cursor: index === 0 ? 'default' : 'pointer', padding: '0.2rem',
                  }}
                  title="Move up"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); moveStep(index, 1); }}
                  disabled={index === steps.length - 1}
                  style={{
                    background: 'none', border: 'none', color: index === steps.length - 1 ? 'var(--border-color)' : 'var(--text-muted)',
                    cursor: index === steps.length - 1 ? 'default' : 'pointer', padding: '0.2rem',
                  }}
                  title="Move down"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); removeStep(index); }}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', padding: '0.2rem',
                  }}
                  title="Remove step"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ transform: expandedSteps[index] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--text-muted)' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* Step content */}
            {expandedSteps[index] && (
              <div style={{ padding: '0 1rem 1rem' }}>
                {/* Step title */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ ...labelStyle, fontSize: '0.78rem' }}>Step Title *</label>
                  <input
                    type="text"
                    placeholder="e.g., Research your topic"
                    value={step.title}
                    onChange={(e) => updateStep(index, 'title', e.target.value)}
                    style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.6rem 0.75rem' }}
                  />
                </div>

                {/* Prompt text */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ ...labelStyle, fontSize: '0.78rem' }}>Prompt Text *</label>
                  <textarea
                    placeholder="The actual prompt to copy/paste into the AI tool..."
                    value={step.prompt_text}
                    onChange={(e) => updateStep(index, 'prompt_text', e.target.value)}
                    style={{ ...textareaStyle, minHeight: '100px', fontSize: '0.85rem', fontFamily: "'JetBrains Mono', monospace", padding: '0.6rem 0.75rem' }}
                  />
                </div>

                {/* Why this step */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ ...labelStyle, fontSize: '0.78rem' }}>Why This Step (optional)</label>
                  <textarea
                    placeholder="Why does this step matter in the sequence?"
                    value={step.why_this_step}
                    onChange={(e) => updateStep(index, 'why_this_step', e.target.value)}
                    style={{ ...textareaStyle, minHeight: '50px', fontSize: '0.85rem', padding: '0.6rem 0.75rem' }}
                  />
                </div>

                {/* What to expect */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ ...labelStyle, fontSize: '0.78rem' }}>What to Expect (optional)</label>
                  <textarea
                    placeholder="What output should the user get?"
                    value={step.what_to_expect}
                    onChange={(e) => updateStep(index, 'what_to_expect', e.target.value)}
                    style={{ ...textareaStyle, minHeight: '50px', fontSize: '0.85rem', padding: '0.6rem 0.75rem' }}
                  />
                </div>

                {/* Tips */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ ...labelStyle, fontSize: '0.78rem' }}>Tips (optional)</label>
                  <textarea
                    placeholder="Pro tips, gotchas, things to customize..."
                    value={step.tips}
                    onChange={(e) => updateStep(index, 'tips', e.target.value)}
                    style={{ ...textareaStyle, minHeight: '50px', fontSize: '0.85rem', padding: '0.6rem 0.75rem' }}
                  />
                </div>

                {/* AI Tool & Time */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...labelStyle, fontSize: '0.78rem' }}>AI Tool for this step</label>
                    <select
                      value={step.tool_id}
                      onChange={(e) => {
                        const toolId = e.target.value;
                        const toolName = getToolDisplayName ? getToolDisplayName(toolId) : toolId;
                        updateStep(index, 'tool_id', toolId);
                        updateStep(index, 'ai_tool', toolName);
                      }}
                      style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.6rem 0.75rem', cursor: 'pointer' }}
                    >
                      <option value="">Any / Not specified</option>
                      {aiTools.map(tool => (
                        <option key={tool.id} value={tool.id}>{tool.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ width: '100px' }}>
                    <label style={{ ...labelStyle, fontSize: '0.78rem' }}>Minutes</label>
                    <input
                      type="number"
                      placeholder="5"
                      value={step.estimated_minutes}
                      onChange={(e) => updateStep(index, 'estimated_minutes', e.target.value ? parseInt(e.target.value) : '')}
                      style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.6rem 0.75rem' }}
                      min="1"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        <button
          onClick={addStep}
          style={{
            width: '100%',
            padding: '0.6rem',
            border: '2px dashed rgba(139, 92, 246, 0.3)',
            borderRadius: '10px',
            background: 'transparent',
            color: '#a78bfa',
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: '600',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.3rem',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Another Step
        </button>
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          width: '100%',
          padding: '0.9rem',
          background: loading ? 'var(--text-muted)' : 'var(--accent-primary)',
          color: 'var(--bg-primary)',
          border: 'none',
          borderRadius: '12px',
          fontSize: '0.95rem',
          fontWeight: '700',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.2s ease',
        }}
      >
        {loading ? 'Creating Workflow...' : 'Create Workflow'}
      </button>
    </div>
  );
};

export default CreateWorkflow;
