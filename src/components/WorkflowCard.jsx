import React from 'react';

/**
 * WorkflowCard - displays a workflow in feed/listing views.
 * Visually distinct from PostCard with a "WORKFLOW" tag and step count badge.
 */
const WorkflowCard = ({
  workflow,
  onLike,
  onSave,
  isLiked = false,
  isSaved = false,
  onUserClick,
  onOpenWorkflow,
  onAuthRequired,
  currentUser,
  categories = [],
  getToolDisplayName,
}) => {
  const profile = workflow.profiles || {};
  const categoryNames = (workflow.category_ids || [])
    .map(id => categories.find(c => c.id === id))
    .filter(Boolean);

  const handleLike = (e) => {
    e.stopPropagation();
    if (!currentUser) { onAuthRequired && onAuthRequired(); return; }
    onLike && onLike(workflow.id, isLiked);
  };

  const handleSave = (e) => {
    e.stopPropagation();
    if (!currentUser) { onAuthRequired && onAuthRequired(); return; }
    onSave && onSave(workflow.id, isSaved);
  };

  const difficultyColors = {
    beginner: '#22c55e',
    intermediate: '#eab308',
    advanced: '#ef4444',
  };

  return (
    <div
      className="workflow-card"
      onClick={() => onOpenWorkflow && onOpenWorkflow(workflow)}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '1.25rem',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-color)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Workflow tag */}
      <div style={{
        position: 'absolute',
        top: '0.75rem',
        right: '0.75rem',
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(59, 130, 246, 0.25))',
        border: '1px solid rgba(139, 92, 246, 0.4)',
        color: '#a78bfa',
        fontSize: '0.65rem',
        fontWeight: '700',
        padding: '0.2rem 0.5rem',
        borderRadius: '6px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        Workflow
      </div>

      {/* Author row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-tertiary)',
            flexShrink: 0,
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onUserClick && onUserClick(profile.id || workflow.user_id);
          }}
        >
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : profile.avatar_emoji ? (
            <span>{profile.avatar_emoji}</span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          )}
        </div>
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: '600',
            color: profile.name_color || 'var(--text-secondary)',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onUserClick && onUserClick(profile.id || workflow.user_id);
          }}
        >
          {profile.display_name || profile.username || 'Unknown'}
        </span>
      </div>

      {/* Title */}
      <h3 style={{
        fontSize: '1.05rem',
        fontWeight: '700',
        color: 'var(--text-primary)',
        marginBottom: '0.4rem',
        lineHeight: 1.3,
        paddingRight: '4rem',
      }}>
        {workflow.title}
      </h3>

      {/* Outcome */}
      {workflow.outcome && (
        <p style={{
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          marginBottom: '0.75rem',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {workflow.outcome}
        </p>
      )}

      {/* Meta badges */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.4rem',
        marginBottom: '0.75rem',
        alignItems: 'center',
      }}>
        {/* Step count */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          background: 'rgba(139, 92, 246, 0.12)',
          color: '#a78bfa',
          padding: '0.2rem 0.55rem',
          borderRadius: '6px',
          fontSize: '0.72rem',
          fontWeight: '600',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9,11 12,14 22,4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          {workflow.step_count || 0} steps
        </span>

        {/* Estimated time */}
        {workflow.estimated_minutes && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            background: 'rgba(255, 255, 255, 0.06)',
            color: 'var(--text-secondary)',
            padding: '0.2rem 0.55rem',
            borderRadius: '6px',
            fontSize: '0.72rem',
            fontWeight: '500',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12,6 12,12 16,14" />
            </svg>
            ~{workflow.estimated_minutes} min
          </span>
        )}

        {/* Difficulty */}
        {workflow.difficulty && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: `${difficultyColors[workflow.difficulty]}20`,
            color: difficultyColors[workflow.difficulty],
            padding: '0.2rem 0.55rem',
            borderRadius: '6px',
            fontSize: '0.72rem',
            fontWeight: '600',
            textTransform: 'capitalize',
          }}>
            {workflow.difficulty}
          </span>
        )}

        {/* Tool badges */}
        {workflow.tool_ids && workflow.tool_ids.slice(0, 3).map(toolId => (
          <span key={toolId} style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.06)',
            color: 'var(--text-secondary)',
            padding: '0.2rem 0.55rem',
            borderRadius: '6px',
            fontSize: '0.72rem',
            fontWeight: '500',
          }}>
            {getToolDisplayName ? getToolDisplayName(toolId) : toolId}
          </span>
        ))}
      </div>

      {/* Category badges */}
      {categoryNames.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.75rem' }}>
          {categoryNames.slice(0, 2).map(cat => (
            <span key={cat.id} style={{
              fontSize: '0.7rem',
              padding: '0.15rem 0.45rem',
              borderRadius: '5px',
              background: 'rgba(255, 255, 255, 0.08)',
              color: 'var(--text-muted)',
            }}>
              {cat.icon} {cat.name}
            </span>
          ))}
        </div>
      )}

      {/* Bottom actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        paddingTop: '0.5rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
      }}>
        <button
          onClick={handleLike}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            background: 'none',
            border: 'none',
            color: isLiked ? '#ef4444' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.78rem',
            padding: '0.25rem 0',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          {workflow.like_count || 0}
        </button>

        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          color: 'var(--text-muted)',
          fontSize: '0.78rem',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {workflow.comment_count || 0}
        </span>

        <button
          onClick={handleSave}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            background: 'none',
            border: 'none',
            color: isSaved ? 'var(--accent-primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.78rem',
            padding: '0.25rem 0',
            marginLeft: 'auto',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default WorkflowCard;
