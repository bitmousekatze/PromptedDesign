import React, { useState, useEffect, useRef } from 'react';
import {
  getWorkflow,
  likeWorkflow,
  unlikeWorkflow,
  saveWorkflow,
  unsaveWorkflow,
  deleteWorkflow,
  forkWorkflow,
  getWorkflowComments,
  addWorkflowComment,
} from '../lib/workflows.js';
import { moderateContent } from '../lib/moderation.js';

/**
 * WorkflowDetail - Full-page view of a workflow with steps, copy prompt, comments.
 */
const WorkflowDetail = ({
  workflowId,
  supabase,
  currentUser,
  addToast,
  onClose,
  onUserClick,
  onAuthRequired,
  categories = [],
  getToolDisplayName,
  onWorkflowDeleted,
  onWorkflowForked,
}) => {
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completedSteps, setCompletedSteps] = useState({});
  const [expandedStepDetails, setExpandedStepDetails] = useState({});
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [forking, setForking] = useState(false);
  const commentInputRef = useRef(null);

  useEffect(() => {
    loadWorkflowData();
  }, [workflowId]);

  // Update URL
  useEffect(() => {
    if (workflow) {
      window.history.pushState({ workflowId: workflow.id }, '', `/workflow/${workflow.id}`);
    }
    return () => {
      if (window.location.pathname.startsWith('/workflow/')) {
        window.history.pushState({}, '', '/');
      }
    };
  }, [workflow]);

  const loadWorkflowData = async () => {
    setLoading(true);
    const { data, error } = await getWorkflow(supabase, workflowId, currentUser?.id);
    if (error) {
      console.error('Error loading workflow:', error);
      addToast('Failed to load workflow', 'error');
      setLoading(false);
      return;
    }
    setWorkflow(data);
    setIsLiked(data.is_liked || false);
    setIsSaved(data.is_saved || false);
    setLikeCount(data.like_count || 0);
    setLoading(false);
  };

  const handleLike = async () => {
    if (!currentUser) { onAuthRequired(); return; }
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikeCount(prev => wasLiked ? prev - 1 : prev + 1);

    const { error } = wasLiked
      ? await unlikeWorkflow(supabase, currentUser.id, workflowId)
      : await likeWorkflow(supabase, currentUser.id, workflowId);

    if (error) {
      setIsLiked(wasLiked);
      setLikeCount(prev => wasLiked ? prev + 1 : prev - 1);
      if (error.code !== '23505') console.error('Like error:', error);
    }
  };

  const handleSave = async () => {
    if (!currentUser) { onAuthRequired(); return; }
    const wasSaved = isSaved;
    setIsSaved(!wasSaved);

    const { error } = wasSaved
      ? await unsaveWorkflow(supabase, currentUser.id, workflowId)
      : await saveWorkflow(supabase, currentUser.id, workflowId);

    if (error) {
      setIsSaved(wasSaved);
      if (error.code !== '23505') console.error('Save error:', error);
    }
  };

  const handleFork = async () => {
    if (!currentUser) { onAuthRequired(); return; }
    setForking(true);
    const { data, error } = await forkWorkflow(supabase, workflowId, currentUser.id);
    setForking(false);
    if (error) {
      addToast('Failed to fork workflow', 'error');
      return;
    }
    addToast('Workflow forked! Opening your copy...', 'success');
    onWorkflowForked && onWorkflowForked(data);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await deleteWorkflow(supabase, workflowId);
    setDeleting(false);
    if (error) {
      addToast('Failed to delete workflow', 'error');
      return;
    }
    addToast('Workflow deleted', 'success');
    onWorkflowDeleted && onWorkflowDeleted(workflowId);
    onClose();
  };

  const handleShare = () => {
    const url = `${window.location.origin}/workflow/${workflowId}`;
    navigator.clipboard.writeText(url).then(() => {
      addToast('Link copied to clipboard!', 'success');
    }).catch(() => {
      addToast('Failed to copy link', 'error');
    });
  };

  const copyPrompt = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      addToast('Prompt copied!', 'success');
    }).catch(() => {
      addToast('Failed to copy', 'error');
    });
  };

  const toggleStepComplete = (stepNumber) => {
    setCompletedSteps(prev => ({ ...prev, [stepNumber]: !prev[stepNumber] }));
  };

  const toggleStepDetails = (stepNumber) => {
    setExpandedStepDetails(prev => ({ ...prev, [stepNumber]: !prev[stepNumber] }));
  };

  // Comments
  const loadComments = async () => {
    setLoadingComments(true);
    const { data } = await getWorkflowComments(supabase, workflowId);
    setComments(data || []);
    setLoadingComments(false);
  };

  const handleToggleComments = () => {
    if (!showComments) {
      loadComments();
    }
    setShowComments(!showComments);
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;
    if (!currentUser) { onAuthRequired(); return; }

    const modResult = await moderateContent(newComment);
    if (!modResult.approved) {
      addToast(modResult.reason || 'Comment not approved', 'error');
      return;
    }

    setSubmittingComment(true);
    const { data, error } = await addWorkflowComment(supabase, currentUser.id, workflowId, newComment.trim());
    setSubmittingComment(false);

    if (error) {
      addToast('Failed to post comment', 'error');
      return;
    }

    setComments(prev => [...prev, data]);
    setNewComment('');
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="spinner" />
        <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Loading workflow...</p>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Workflow not found</p>
        <button onClick={onClose} style={{ marginTop: '1rem', background: 'var(--accent-primary)', color: 'var(--bg-primary)', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600' }}>
          Go Back
        </button>
      </div>
    );
  }

  const profile = workflow.profiles || {};
  const steps = workflow.steps || [];
  const isOwner = currentUser?.id === workflow.user_id;

  const difficultyColors = {
    beginner: '#22c55e',
    intermediate: '#eab308',
    advanced: '#ef4444',
  };

  const categoryNames = (workflow.category_ids || [])
    .map(id => categories.find(c => c.id === id))
    .filter(Boolean);

  return (
    <div style={{
      maxWidth: '720px',
      margin: '0 auto',
      padding: '1rem 1rem 6rem',
    }}>
      {/* Back button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
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
            gap: '0.4rem',
            fontSize: '0.85rem',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>
      </div>

      {/* ====== HEADER ====== */}
      <div style={{ marginBottom: '1.5rem' }}>
        {/* Workflow badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2))',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          color: '#a78bfa',
          fontSize: '0.68rem',
          fontWeight: '700',
          padding: '0.25rem 0.6rem',
          borderRadius: '6px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: '0.75rem',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9,11 12,14 22,4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Workflow
        </div>

        {/* Forked from */}
        {workflow.forked_from && (
          <div style={{
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/>
              <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/><path d="M12 12v3"/>
            </svg>
            Forked from{' '}
            <span
              style={{ color: 'var(--accent-primary)', cursor: 'pointer' }}
              onClick={() => {
                // Could navigate to original workflow
              }}
            >
              {workflow.forked_from.title}
            </span>
            {' '}by {workflow.forked_from.profiles?.display_name || workflow.forked_from.profiles?.username || 'Unknown'}
          </div>
        )}

        {/* Title */}
        <h1 style={{
          fontSize: '1.6rem',
          fontWeight: '800',
          color: 'var(--text-primary)',
          fontFamily: "'Fraunces', serif",
          lineHeight: 1.25,
          marginBottom: '0.75rem',
        }}>
          {workflow.title}
        </h1>

        {/* Author */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
            cursor: 'pointer',
          }}
          onClick={() => onUserClick && onUserClick(profile.id || workflow.user_id)}
        >
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-tertiary)',
            flexShrink: 0,
            fontSize: '1rem',
          }}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : profile.avatar_emoji ? (
              <span>{profile.avatar_emoji}</span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            )}
          </div>
          <div>
            <span style={{ fontSize: '0.88rem', fontWeight: '600', color: profile.name_color || 'var(--text-primary)' }}>
              {profile.display_name || profile.username || 'Unknown'}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
              @{profile.username}
            </span>
          </div>
        </div>

        {/* Meta badges row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
          {/* Difficulty */}
          {workflow.difficulty && (
            <span style={{
              padding: '0.3rem 0.65rem',
              borderRadius: '8px',
              fontSize: '0.75rem',
              fontWeight: '700',
              background: `${difficultyColors[workflow.difficulty]}18`,
              color: difficultyColors[workflow.difficulty],
              textTransform: 'capitalize',
            }}>
              {workflow.difficulty}
            </span>
          )}

          {/* Time */}
          {workflow.estimated_minutes && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.3rem 0.65rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '600',
              background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
              </svg>
              ~{workflow.estimated_minutes} min
            </span>
          )}

          {/* Step count */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.3rem 0.65rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '600',
            background: 'rgba(139, 92, 246, 0.12)', color: '#a78bfa',
          }}>
            {steps.length} steps
          </span>

          {/* Tool badges */}
          {workflow.tool_ids && workflow.tool_ids.map(toolId => (
            <span key={toolId} style={{
              padding: '0.3rem 0.65rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '600',
              background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
            }}>
              {getToolDisplayName ? getToolDisplayName(toolId) : toolId}
            </span>
          ))}

          {/* Category badges */}
          {categoryNames.map(cat => (
            <span key={cat.id} style={{
              padding: '0.3rem 0.65rem', borderRadius: '8px', fontSize: '0.75rem',
              background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
            }}>
              {cat.icon} {cat.name}
            </span>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}>
          <button onClick={handleLike} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.5rem 0.9rem', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.82rem', fontWeight: '600',
            background: isLiked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.06)',
            border: isLiked ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-color)',
            color: isLiked ? '#ef4444' : 'var(--text-secondary)',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {likeCount}
          </button>

          <button onClick={handleSave} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.5rem 0.9rem', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.82rem', fontWeight: '600',
            background: isSaved ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
            border: isSaved ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
            color: isSaved ? 'var(--accent-primary)' : 'var(--text-secondary)',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            Save
          </button>

          <button onClick={handleShare} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.5rem 0.9rem', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.82rem', fontWeight: '600',
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>

          <button onClick={handleFork} disabled={forking} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.5rem 0.9rem', borderRadius: '10px', cursor: forking ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            fontSize: '0.82rem', fontWeight: '600',
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)', opacity: forking ? 0.5 : 1,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/>
              <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/><path d="M12 12v3"/>
            </svg>
            {forking ? 'Forking...' : 'Fork'}
          </button>

          {isOwner && (
            <button onClick={() => setShowDeleteConfirm(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.5rem 0.9rem', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.82rem', fontWeight: '600', marginLeft: 'auto',
              background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* ====== DESCRIPTION & OUTCOME ====== */}
      {(workflow.description || workflow.outcome) && (
        <div style={{
          marginBottom: '1.5rem',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '14px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)',
        }}>
          {workflow.description && (
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: workflow.outcome ? '1rem' : 0 }}>
              {workflow.description}
            </p>
          )}
          {workflow.outcome && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(59, 130, 246, 0.08))',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: '10px',
              padding: '1rem',
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                What you'll get
              </div>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
                {workflow.outcome}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ====== STEPS ====== */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{
          fontSize: '1.1rem',
          fontWeight: '700',
          color: 'var(--text-primary)',
          marginBottom: '1rem',
          fontFamily: "'Fraunces', serif",
        }}>
          Steps
        </h2>

        {/* Progress bar */}
        <div style={{
          background: 'rgba(255,255,255,0.06)',
          borderRadius: '6px',
          height: '4px',
          marginBottom: '1.25rem',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${steps.length > 0 ? (Object.values(completedSteps).filter(Boolean).length / steps.length) * 100 : 0}%`,
            background: 'linear-gradient(90deg, #a78bfa, #3b82f6)',
            borderRadius: '6px',
            transition: 'width 0.3s ease',
          }} />
        </div>

        {steps.map((step, index) => {
          const isComplete = completedSteps[step.step_number];
          const isExpanded = expandedStepDetails[step.step_number] !== false; // default expanded
          const hasDetails = step.why_this_step || step.what_to_expect || step.tips;

          return (
            <div
              key={step.id || index}
              style={{
                position: 'relative',
                marginBottom: '0.75rem',
              }}
            >
              {/* Vertical connector line */}
              {index < steps.length - 1 && (
                <div style={{
                  position: 'absolute',
                  left: '19px',
                  top: '44px',
                  bottom: '-12px',
                  width: '2px',
                  background: isComplete ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.08)',
                }} />
              )}

              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${isComplete ? 'rgba(139, 92, 246, 0.25)' : 'var(--border-color)'}`,
                borderRadius: '14px',
                overflow: 'hidden',
                transition: 'border-color 0.2s ease',
              }}>
                {/* Step header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '1rem 1.25rem',
                }}>
                  {/* Step number / check */}
                  <button
                    onClick={() => toggleStepComplete(step.step_number)}
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      border: `2px solid ${isComplete ? '#a78bfa' : 'rgba(255,255,255,0.15)'}`,
                      background: isComplete ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(59, 130, 246, 0.25))' : 'transparent',
                      color: isComplete ? '#a78bfa' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.82rem',
                      fontWeight: '700',
                      flexShrink: 0,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {isComplete ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ) : (
                      step.step_number
                    )}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                      fontSize: '0.95rem',
                      fontWeight: '700',
                      color: isComplete ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: isComplete ? 'line-through' : 'none',
                      margin: 0,
                    }}>
                      {step.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', alignItems: 'center' }}>
                      {step.ai_tool && (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: '600',
                          color: 'var(--text-muted)',
                          background: 'rgba(255,255,255,0.06)',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                        }}>
                          {step.ai_tool}
                        </span>
                      )}
                      {step.estimated_minutes && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          ~{step.estimated_minutes} min
                        </span>
                      )}
                    </div>
                  </div>

                  {hasDetails && (
                    <button
                      onClick={() => toggleStepDetails(step.step_number)}
                      style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        cursor: 'pointer', padding: '0.25rem',
                      }}
                    >
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                  )}
                </div>

                {/* Prompt block */}
                <div style={{
                  margin: '0 1.25rem 1rem',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '10px',
                  padding: '1rem',
                  position: 'relative',
                }}>
                  <pre style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.82rem',
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.6,
                    margin: 0,
                  }}>
                    {step.prompt_text}
                  </pre>
                  <button
                    onClick={() => copyPrompt(step.prompt_text)}
                    style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.35rem 0.7rem',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))',
                      border: '1px solid rgba(139, 92, 246, 0.4)',
                      color: '#c4b5fd',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      fontFamily: 'inherit',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.5), rgba(59, 130, 246, 0.5))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))';
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copy
                  </button>
                </div>

                {/* Details (why, expect, tips) */}
                {hasDetails && isExpanded && (
                  <div style={{ margin: '0 1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {step.why_this_step && (
                      <div style={{
                        background: 'rgba(59, 130, 246, 0.06)',
                        border: '1px solid rgba(59, 130, 246, 0.15)',
                        borderRadius: '8px',
                        padding: '0.75rem',
                      }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#60a5fa', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          Why this step
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                          {step.why_this_step}
                        </p>
                      </div>
                    )}

                    {step.what_to_expect && (
                      <div style={{
                        background: 'rgba(34, 197, 94, 0.06)',
                        border: '1px solid rgba(34, 197, 94, 0.15)',
                        borderRadius: '8px',
                        padding: '0.75rem',
                      }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#22c55e', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          What to expect
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                          {step.what_to_expect}
                        </p>
                      </div>
                    )}

                    {step.tips && (
                      <div style={{
                        background: 'rgba(234, 179, 8, 0.06)',
                        border: '1px solid rgba(234, 179, 8, 0.15)',
                        borderRadius: '8px',
                        padding: '0.75rem',
                      }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#eab308', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          Tips
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                          {step.tips}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ====== IMAGES ====== */}
      {workflow.images && workflow.images.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
            {workflow.images.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                style={{
                  height: '200px',
                  borderRadius: '12px',
                  objectFit: 'cover',
                  border: '1px solid var(--border-color)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ====== COMMENTS ====== */}
      <div style={{
        borderTop: '1px solid var(--border-color)',
        paddingTop: '1rem',
      }}>
        <button
          onClick={handleToggleComments}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.88rem',
            fontWeight: '600',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 0',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {showComments ? 'Hide Comments' : `Comments (${workflow.comment_count || 0})`}
        </button>

        {showComments && (
          <div style={{ marginTop: '0.75rem' }}>
            {loadingComments ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Loading comments...
              </div>
            ) : (
              <>
                {comments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                    {comments.map(comment => {
                      const cp = comment.profiles || {};
                      return (
                        <div key={comment.id} style={{
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: '10px',
                          padding: '0.75rem',
                          border: '1px solid rgba(255,255,255,0.05)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                            <div style={{
                              width: '24px', height: '24px', borderRadius: '50%', overflow: 'hidden',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'var(--bg-tertiary)', flexShrink: 0, fontSize: '0.7rem',
                            }}>
                              {cp.avatar_url ? (
                                <img src={cp.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : cp.avatar_emoji ? (
                                <span>{cp.avatar_emoji}</span>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                              )}
                            </div>
                            <span style={{ fontSize: '0.78rem', fontWeight: '600', color: cp.name_color || 'var(--text-primary)' }}>
                              {cp.display_name || cp.username || 'Unknown'}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {new Date(comment.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                            {comment.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem 0 1rem' }}>
                    No comments yet. Be the first!
                  </p>
                )}

                {/* Comment input */}
                {currentUser && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      ref={commentInputRef}
                      type="text"
                      placeholder="Write a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitComment(); }}
                      style={{
                        flex: 1,
                        padding: '0.6rem 0.75rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        color: 'var(--text-primary)',
                        fontFamily: 'inherit',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={handleSubmitComment}
                      disabled={submittingComment || !newComment.trim()}
                      style={{
                        padding: '0.6rem 1rem',
                        background: newComment.trim() ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                        color: newComment.trim() ? 'var(--bg-primary)' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: newComment.trim() ? 'pointer' : 'default',
                        fontFamily: 'inherit',
                        fontWeight: '600',
                        fontSize: '0.82rem',
                      }}
                    >
                      {submittingComment ? '...' : 'Post'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setShowDeleteConfirm(false)}>
          <div style={{
            background: 'var(--bg-tertiary)', borderRadius: '16px', padding: '1.5rem',
            maxWidth: '360px', width: '90%', border: '1px solid var(--border-color)',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem', fontSize: '1.05rem' }}>Delete Workflow?</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.88rem', lineHeight: 1.4 }}>
              This will permanently delete this workflow and all its steps. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)', fontFamily: 'inherit', fontWeight: '600', fontSize: '0.85rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '8px', cursor: deleting ? 'not-allowed' : 'pointer',
                  background: '#ef4444', border: 'none',
                  color: 'white', fontFamily: 'inherit', fontWeight: '600', fontSize: '0.85rem',
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowDetail;
