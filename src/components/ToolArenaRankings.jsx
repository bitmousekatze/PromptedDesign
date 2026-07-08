import { useEffect, useMemo, useState } from 'react';
import { getArenaLeaderboard, getToolCategoryRanks, getToolDisplayLabel } from '../lib/arena';

const tarStyles = `
.tar {
  --gold: #FFD700;
  --gold-wash: rgba(255, 215, 0, 0.08);
  --gold-edge: rgba(255, 215, 0, 0.24);
  --silver: #D1D5DB;
  --bronze: #D97757;
  --bg-1: #0F0F0F;
  --bg-2: #141414;
  --ink: #FFFFFF;
  --ink-2: #C8C8C8;
  --ink-3: #8A8A8A;
  --ink-4: #5C5C5C;
  --ink-5: #3A3A3A;
  --line: rgba(255, 255, 255, 0.07);
  --line-2: rgba(255, 255, 255, 0.14);
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  margin: 0 1.5rem 1.25rem;
  padding: 20px 22px 18px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 16px;
  color: var(--ink);
  font-family: inherit;
}
.tar *, .tar *::before, .tar *::after { box-sizing: border-box; }

.tar-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; flex-wrap: wrap;
  padding-bottom: 14px; margin-bottom: 14px;
  border-bottom: 1px solid var(--line);
}
.tar-headline { min-width: 0; flex: 1 1 auto; }
.tar-eyebrow {
  font-family: var(--font-mono);
  font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--gold);
  display: inline-flex; align-items: center; gap: 8px;
}
.tar-eyebrow::before {
  content: ''; width: 5px; height: 5px; border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 0 3px rgba(255,215,0,0.15);
}
.tar-title {
  font-size: 15.5px; font-weight: 700; letter-spacing: -0.015em;
  color: var(--ink); margin: 8px 0 2px;
}
.tar-summary {
  font-size: 13px; color: var(--ink-3); line-height: 1.45;
  letter-spacing: -0.002em;
}
.tar-summary strong { color: var(--ink); font-weight: 700; }

.tar-cta {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase;
  padding: 9px 16px;
  border-radius: 999px;
  background: var(--gold); color: #0a0a0a;
  border: 1px solid var(--gold);
  cursor: pointer;
  transition: all .18s ease;
  white-space: nowrap;
  display: inline-flex; align-items: center; gap: 8px;
}
.tar-cta:hover {
  background: #FFE245; border-color: #FFE245;
  transform: translateY(-1px);
  box-shadow: 0 6px 18px -6px rgba(255,215,0,0.6);
}
.tar-cta:active { transform: translateY(0); }

.tar-grid {
  display: grid; gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.tar-pill {
  display: flex; align-items: center; gap: 11px;
  padding: 11px 13px;
  border-radius: 11px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
  transition: border-color .15s ease, transform .15s ease, background .15s ease;
}
.tar-pill:hover { border-color: var(--gold-edge); transform: translateY(-1px); }
.tar-pill:active { transform: translateY(0); }
.tar-pill.gold { border-color: var(--gold-edge); background: var(--gold-wash); }
.tar-pill.gold:hover { background: rgba(255, 215, 0, 0.14); }

.tar-pill-emoji { font-size: 18px; flex-shrink: 0; }
.tar-pill-body { min-width: 0; flex: 1; }
.tar-pill-name {
  font-size: 13px; font-weight: 600; color: var(--ink);
  line-height: 1.2; letter-spacing: -0.005em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tar-pill-meta {
  font-size: 11.5px; color: var(--ink-3);
  margin-top: 3px;
  letter-spacing: -0.002em;
}
.tar-pill-meta-sep { color: var(--ink-5); margin: 0 5px; }
.tar-pill-num {
  font-family: var(--font-mono); font-weight: 700;
  font-size: 14px; min-width: 34px; text-align: right;
  flex-shrink: 0;
}
.tar-pill-num.r1 { color: var(--gold); }
.tar-pill-num.r2 { color: var(--silver); }
.tar-pill-num.r3 { color: var(--bronze); }
.tar-pill-num.rN { color: var(--ink-4); }

.tar-showmore {
  margin-top: 10px;
  width: 100%;
  background: none; border: none;
  color: var(--ink-4);
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.2em; text-transform: uppercase;
  padding: 6px 0;
  cursor: pointer; transition: color .15s ease;
}
.tar-showmore:hover { color: var(--gold); }

.tar-empty {
  display: flex; justify-content: space-between; align-items: center; gap: 14px;
  padding: 6px 0;
  color: var(--ink-3); font-size: 13.5px; line-height: 1.4;
  flex-wrap: wrap;
}
.tar-empty strong { color: var(--ink); font-weight: 700; }

.tar-loading {
  padding: 14px 0;
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--ink-4);
}
`;

function rankClass(i) {
  if (i === 0) return 'r1';
  if (i === 1) return 'r2';
  if (i === 2) return 'r3';
  return 'rN';
}

const ArrowGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export default function ToolArenaRankings({ toolId, toolName, onGoToArena }) {
  const [rows, setRows] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const lb = await getArenaLeaderboard();
        if (!cancelled) setRows(lb);
      } catch {
        if (!cancelled) setRows([]);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const ranks = useMemo(() => {
    if (!rows || !toolId) return [];
    return getToolCategoryRanks(rows, toolId);
  }, [rows, toolId]);

  const wins = useMemo(() => ranks.filter(r => r.rank === 1).length, [ranks]);

  const totalCategories = useMemo(() => {
    if (!rows) return 0;
    return new Set(rows.map(r => r.category_id)).size;
  }, [rows]);

  const visibleRanks = expanded ? ranks : ranks.slice(0, 6);

  return (
    <div className="tar">
      <style>{tarStyles}</style>

      <div className="tar-head">
        <div className="tar-headline">
          <div className="tar-eyebrow">Arena Rankings · Live</div>
          <div className="tar-title">Where {getToolDisplayLabel(toolName)} stands</div>
          {rows === null ? (
            <div className="tar-loading">Loading ranks…</div>
          ) : ranks.length === 0 ? null : (
            <div className="tar-summary">
              {wins > 0
                ? <>Ranked <strong>#1</strong> in {wins} {wins === 1 ? 'category' : 'categories'} · appearing in <strong>{ranks.length}</strong> of {totalCategories}.</>
                : <>Appearing in <strong>{ranks.length}</strong> of {totalCategories} categories. No wins yet.</>}
            </div>
          )}
        </div>
        {rows !== null && ranks.length > 0 && (
          <button
            type="button"
            className="tar-cta"
            onClick={() => onGoToArena?.()}
            title={`Open ${toolName} in the Arena`}
          >
            Vote in the Arena <ArrowGlyph />
          </button>
        )}
      </div>

      {rows === null ? null : ranks.length === 0 ? (
        <div className="tar-empty">
          <span>
            <strong>{getToolDisplayLabel(toolName)}</strong> isn't ranked in the Arena yet. Be the first.
          </span>
          <button
            type="button"
            className="tar-cta"
            onClick={() => onGoToArena?.()}
          >
            Open the Arena <ArrowGlyph />
          </button>
        </div>
      ) : (
        <>
          <div className="tar-grid">
            {visibleRanks.map(r => (
              <button
                type="button"
                key={r.category_id}
                className={`tar-pill ${r.rank === 1 ? 'gold' : ''}`}
                onClick={() => onGoToArena?.(r.category_id)}
                title={`Open ${r.category_name} in the Arena`}
              >
                <span className="tar-pill-emoji">{r.category_emoji}</span>
                <div className="tar-pill-body">
                  <div className="tar-pill-name">{r.category_name.replace(/^Best for /, '')}</div>
                  <div className="tar-pill-meta">
                    {r.total_votes.toLocaleString()} votes
                    <span className="tar-pill-meta-sep">·</span>
                    #{r.rank} of {r.total_tools}
                  </div>
                </div>
                <div className={`tar-pill-num ${rankClass(r.rank - 1)}`}>
                  #{r.rank}
                </div>
              </button>
            ))}
          </div>
          {ranks.length > 6 && (
            <button
              type="button"
              className="tar-showmore"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? '- Show less -' : `- Show all ${ranks.length} categories -`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
