import { useEffect, useState } from 'react';
import {
  getArenaLeaderboard,
  groupLeaderboardByCategory,
  getArenaCategoryForCommunityCategory,
  getToolBrandColor,
  getReadableTextOn,
  getToolDisplayLabel,
} from '../lib/arena';

const styles = `
.cat-arena {
  margin: 16px 0 20px;
  padding: 16px 18px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px;
  display: flex; flex-direction: column; gap: 12px;
  font-family: 'Inter Tight', ui-sans-serif, system-ui, sans-serif;
}
.cat-arena-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}
.cat-arena-label {
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.7);
}
.cat-arena-link {
  background: none; border: none; padding: 0; cursor: pointer;
  font-family: inherit;
  font-size: 12px; font-weight: 600;
  letter-spacing: 0.02em;
  color: rgba(255,255,255,0.75);
  display: inline-flex; align-items: center; gap: 4px;
  transition: color .15s ease;
}
.cat-arena-link:hover { color: #fff; }
.cat-arena-rows {
  display: flex; gap: 10px;
  flex-wrap: wrap;
}
.cat-arena-row {
  border: none;
  border-radius: 999px;
  padding: 7px 14px;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex; align-items: center; gap: 10px;
  background: var(--brand, #8A8A8A);
  color: var(--brand-text, #FFFFFF);
  font-size: 13px; font-weight: 700;
  letter-spacing: -0.005em;
  box-shadow: 0 2px 14px -4px color-mix(in srgb, var(--brand, #8A8A8A) 60%, transparent);
  transition: filter .2s ease, transform .15s ease;
}
.cat-arena-row:hover { filter: brightness(1.1); transform: translateY(-1px); }
.cat-arena-rank {
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 11px; font-weight: 700;
  opacity: 0.72;
  letter-spacing: 0.06em;
}
.cat-arena-votes {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 12px; font-weight: 600;
  opacity: 0.85;
  letter-spacing: 0.01em;
}
.cat-arena-votes::before {
  content: '';
  width: 3px; height: 3px; border-radius: 50%;
  background: currentColor;
  opacity: 0.5;
}
`;

export default function CategoryArenaLeaders({ communityCategoryId, onJumpToArena }) {
  const [rows, setRows] = useState(null);
  const arenaCategoryId = getArenaCategoryForCommunityCategory(communityCategoryId);

  useEffect(() => {
    if (!arenaCategoryId) {
      setRows(null);
      return;
    }
    let cancelled = false;
    getArenaLeaderboard()
      .then((all) => {
        if (cancelled) return;
        const grouped = groupLeaderboardByCategory(all);
        const list = grouped.get(arenaCategoryId) || [];
        setRows(list.slice(0, 3));
      })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [arenaCategoryId]);

  if (!arenaCategoryId || !rows || rows.length === 0) return null;

  const categoryName = rows[0]?.category_name?.replace(/^Best for |^Fastest |^Best /i, '') || 'this area';

  return (
    <div className="cat-arena">
      <style>{styles}</style>
      <div className="cat-arena-head">
        <div className="cat-arena-label">Top AIs for {categoryName}</div>
        <button
          type="button"
          className="cat-arena-link"
          onClick={() => onJumpToArena?.(arenaCategoryId)}
        >
          See all in Arena →
        </button>
      </div>
      <div className="cat-arena-rows">
        {rows.map((r, i) => {
          const brand = getToolBrandColor(r.tool_name) || '#8A8A8A';
          const text = getReadableTextOn(brand);
          return (
            <button
              key={r.tool_id}
              type="button"
              className="cat-arena-row"
              style={{ '--brand': brand, '--brand-text': text }}
              onClick={() => onJumpToArena?.(arenaCategoryId)}
              title={`${getToolDisplayLabel(r.tool_name)} · ${r.total_votes.toLocaleString()} votes`}
            >
              <span className="cat-arena-rank">#{i + 1}</span>
              <span>{getToolDisplayLabel(r.tool_name)}</span>
              <span className="cat-arena-votes">{r.total_votes.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
