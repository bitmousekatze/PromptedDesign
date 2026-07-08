import React from 'react';

// -----------------------------------------------------------------------------
// Skeleton primitives - each renders a grey rounded placeholder with a shimmer
// animation.  Set width/height via inline style or className.
// -----------------------------------------------------------------------------

/** Generic rounded rectangle. */
export function SkeletonBlock({ className = '', style, ...props }) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{ borderRadius: 8, ...style }}
      {...props}
    />
  );
}

/** Perfect circle. */
export function SkeletonCircle({ size = 36, className = '', style, ...props }) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        ...style,
      }}
      {...props}
    />
  );
}

/** Text line - defaults to full width. */
export function SkeletonLine({ width = '100%', height = 14, className = '', style, ...props }) {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={{ width, height, borderRadius: 7, ...style }}
      {...props}
    />
  );
}

// -----------------------------------------------------------------------------
// PostCardSkeleton
// Minimal placeholder matching PostCard layout: avatar + name + title +
// description + action bar. No media/tool badges - those vary per post.
// -----------------------------------------------------------------------------
export function PostCardSkeleton({ className = '', style, ...props }) {
  return (
    <div
      className={`post-card-mobile ${className}`}
      style={{
        width: '100%',
        background: 'transparent',
        padding: '1rem 1.1rem',
        ...style,
      }}
      {...props}
    >
      {/* Header: 48px avatar + name / @handle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
        <SkeletonCircle size={48} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SkeletonLine width="35%" height={13} />
          <SkeletonLine width="22%" height={10} />
        </div>
      </div>

      {/* Title + description */}
      <SkeletonLine width="80%" height={16} style={{ marginBottom: 8 }} />
      <SkeletonLine width="60%" height={13} style={{ marginBottom: 12 }} />

      {/* Action bar: like + comment + save */}
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0' }}>
        <SkeletonBlock style={{ width: 36, height: 16, borderRadius: 4 }} />
        <SkeletonBlock style={{ width: 36, height: 16, borderRadius: 4 }} />
        <SkeletonBlock style={{ width: 36, height: 16, borderRadius: 4 }} />
      </div>
    </div>
  );
}

/** A simple skeleton for non-post-card content (e.g., workflows, lists). */
export function ListItemSkeleton({ className = '', style, ...props }) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--bg-card, #111)',
        border: '1px solid var(--border-color, #222)',
        borderRadius: 10,
        padding: '0.85rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '0.5rem',
        ...style,
      }}
      {...props}
    >
      <SkeletonCircle size={32} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonLine width="55%" height={14} />
        <SkeletonLine width="35%" height={11} />
      </div>
    </div>
  );
}

/** Sidebar skeleton: 3 section cards matching .sidebar-section layout (272px
 *  content width). Each card has a header + 3 mini-post-card rows with avatar.
 *  Relies on .right-sidebar CSS class for display/width (hidden on mobile). */
export function RightSidebarSkeleton({ className = '', style, ...props }) {
  const sectionCard = {
    background: 'var(--bg-card)',
    borderRadius: 16,
    padding: '1rem',
    marginBottom: '1rem',
  };
  const miniRow = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
    borderRadius: 12,
    border: '1px solid var(--border-color, #222)',
    marginBottom: '0.5rem',
  };

  return (
    <aside className={`right-sidebar ${className}`} style={style} {...props}>
      <div style={{ padding: '1rem 0' }}>
        {/* Section 1: Builds of the Day */}
        <div style={sectionCard}>
          <SkeletonLine width="50%" height={14} style={{ marginBottom: 12 }} />
          {[1, 2, 3].map(i => (
            <div key={i} style={miniRow}>
              <SkeletonCircle size={32} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <SkeletonLine width="65%" height={12} />
                <SkeletonLine width="40%" height={10} />
              </div>
            </div>
          ))}
        </div>

        {/* Section 2: Questions / Discussions */}
        <div style={sectionCard}>
          <SkeletonLine width="55%" height={14} style={{ marginBottom: 12 }} />
          {[1, 2, 3].map(i => (
            <div key={i} style={miniRow}>
              <SkeletonCircle size={32} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <SkeletonLine width="60%" height={12} />
                <SkeletonLine width="35%" height={10} />
              </div>
            </div>
          ))}
        </div>

        {/* Section 3: Recommended Accounts */}
        <div style={sectionCard}>
          <SkeletonLine width="60%" height={14} style={{ marginBottom: 12 }} />
          {[1, 2, 3].map(i => (
            <div key={i} style={miniRow}>
              <SkeletonCircle size={34} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <SkeletonLine width="55%" height={12} />
                <SkeletonLine width="35%" height={10} />
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
          <SkeletonLine width={50} height={10} />
          <SkeletonLine width={60} height={10} />
        </div>
      </div>
    </aside>
  );
}

export default PostCardSkeleton;
