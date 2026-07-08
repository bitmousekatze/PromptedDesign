import React from 'react';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../lib/achievements.js';

export default function CategoryFilterChips({ categories, activeCategory, onChange }) {
  const visible = CATEGORY_ORDER.filter((c) => c === 'all' || categories.includes(c));

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '4px 2px 12px',
        marginBottom: 8,
        scrollbarWidth: 'none',
      }}
      className="achievements-filter-chips"
    >
      {visible.map((cat) => {
        const isActive = activeCategory === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            style={{
              flexShrink: 0,
              padding: '6px 14px',
              borderRadius: 999,
              border: isActive
                ? '1px solid var(--accent-primary, #FFE81F)'
                : '1px solid rgba(255,255,255,0.08)',
              background: isActive
                ? 'var(--accent-primary, #FFE81F)'
                : 'rgba(15, 15, 35, 0.5)',
              color: isActive ? '#000' : '#E2E8F0',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {CATEGORY_LABELS[cat] || cat}
          </button>
        );
      })}
    </div>
  );
}
