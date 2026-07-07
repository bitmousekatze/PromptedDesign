import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getArenaCategories,
  getArenaLeaderboard,
  getUserArenaVotes,
  castArenaVote,
  removeArenaVote,
  groupLeaderboardByCategory,
  getToolCategoryRanks,
  getToolBrandColor,
  getReadableTextOn,
  getToolDisplayLabel,
} from '../lib/arena';

const arenaStyles = `
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,500;1,600;1,700;1,800&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

.arena {
  --gold: #FFD700;
  --gold-warm: #F5C518;
  --gold-deep: #C9A227;
  --gold-fire: #FF9500;
  --gold-wash: rgba(255, 215, 0, 0.08);
  --gold-edge: rgba(255, 215, 0, 0.24);
  --silver: #D1D5DB;
  --bronze: #D97757;
  --ink: #FFFFFF;
  --ink-2: #C8C8C8;
  --ink-3: #8A8A8A;
  --ink-4: #5C5C5C;
  --ink-5: #3A3A3A;
  --bg-0: #000000;
  --bg-1: #080808;
  --bg-2: #111111;
  --line: rgba(255, 255, 255, 0.07);
  --line-2: rgba(255, 255, 255, 0.14);
  --font-display: 'Inter Tight', ui-sans-serif, system-ui, sans-serif;
  --font-serif: 'Instrument Serif', Georgia, serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  color: var(--ink);
  max-width: 1160px;
  margin: 0 auto;
  padding: 0 24px 120px;
  position: relative;
}
.arena *, .arena *::before, .arena *::after { box-sizing: border-box; }

/* Blacken the entire page background while the Arena is mounted —
   adds a fixed backdrop behind everything so the content area reads
   true black instead of the app's dark-grey body color */
body.arena-active { background: #000000 !important; }
.arena-bg {
  position: fixed;
  inset: 0;
  background: #000000;
  z-index: -1;
  pointer-events: none;
}

/* ───────── Ticker ───────── */
.arena-ticker {
  margin-top: 18px;
  overflow: hidden; position: relative;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-1);
  display: flex; align-items: center;
}
.arena-ticker::before, .arena-ticker::after {
  content: ''; position: absolute; top: 0; bottom: 0; width: 52px; z-index: 2;
  pointer-events: none;
}
.arena-ticker::before { left: 0; background: linear-gradient(90deg, var(--bg-1), transparent); }
.arena-ticker::after { right: 0; background: linear-gradient(270deg, var(--bg-1), transparent); }
.arena-ticker-track {
  display: inline-flex; gap: 0; white-space: nowrap;
  animation: arena-ticker 55s linear infinite;
  padding-left: 16px;
}
.arena-ticker:hover .arena-ticker-track { animation-play-state: paused; }
.arena-tick {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
  padding: 0 22px;
  display: inline-flex; align-items: center; gap: 10px;
  cursor: pointer;
  background: none; border: none;
}
.arena-tick:hover { color: var(--ink); }
.arena-tick b { color: var(--gold); font-weight: 700; letter-spacing: 0.04em; }
.arena-tick-sep { color: var(--ink-5); }
.arena-tick-dot {
  width: 5px; height: 5px; border-radius: 50%; background: var(--gold);
  box-shadow: 0 0 0 3px rgba(255,215,0,0.15);
  flex-shrink: 0;
}
@keyframes arena-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }

/* ───────── Hero ───────── */
.arena-hero {
  padding: 44px 0 36px;
  border-bottom: 1px solid var(--line);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 56px;
  align-items: center;
}
@media (max-width: 820px) {
  .arena-hero { grid-template-columns: 1fr; gap: 28px; padding: 32px 0 24px; align-items: start; }
}

.arena-hero-sub {
  font-family: var(--font-display);
  font-size: clamp(20px, 2.4vw, 26px);
  line-height: 1.4;
  letter-spacing: -0.012em;
  color: var(--ink-2);
  max-width: 46ch;
  margin: 0;
  font-weight: 500;
}
.arena-hero-sub strong {
  color: var(--ink);
  font-weight: 700;
}
.arena-hero-meta {
  display: flex; gap: 24px; margin-top: 22px;
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--ink-4);
}
.arena-hero-meta strong { color: var(--ink-2); font-weight: 600; letter-spacing: 0.04em; }

/* Podium */
.arena-podium {
  display: grid; gap: 10px;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: end;
}
.arena-podium-card {
  position: relative;
  padding: 18px 14px 16px;
  border-radius: 14px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 8px;
  min-height: 120px;
  text-align: left;
  cursor: pointer;
  transition: border-color .25s ease, transform .25s ease, background .25s ease;
  overflow: hidden;
}
.arena-podium-card:hover { border-color: var(--line-2); transform: translateY(-2px); }
.arena-podium-card.p1 {
  background: linear-gradient(180deg, rgba(255,215,0,0.10), rgba(255,215,0,0.02));
  border-color: var(--gold-edge);
  min-height: 160px;
  padding-top: 22px;
}
.arena-podium-card.p1::after {
  content: ''; position: absolute; inset: -1px; border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 45%, rgba(255,215,0,0.18) 50%, transparent 55%);
  transform: translateX(-100%);
  transition: transform 1.2s cubic-bezier(.2,.7,.2,1);
}
.arena-podium-card.p1:hover::after { transform: translateX(100%); }
.arena-podium-card.p2 { min-height: 140px; }
.arena-podium-rank {
  font-family: var(--font-mono);
  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--ink-4); font-weight: 600;
}
.arena-podium-card.p1 .arena-podium-rank { color: var(--gold); }
.arena-podium-card.p2 .arena-podium-rank { color: var(--silver); }
.arena-podium-card.p3 .arena-podium-rank { color: var(--bronze); }
.arena-podium-name {
  font-family: var(--font-display);
  font-weight: 700; font-size: 19px;
  letter-spacing: -0.02em; line-height: 1.15;
  color: var(--ink);
  margin-top: auto;
}
.arena-podium-card.p1 .arena-podium-name { font-size: 22px; }
.arena-podium-meta {
  font-family: var(--font-mono); font-size: 10.5px;
  color: var(--ink-4); letter-spacing: 0.06em;
  display: flex; align-items: center; gap: 6px;
}
.arena-podium-meta b { color: var(--ink-2); font-weight: 600; }

/* ───────── Filter bar (sticky) ───────── */
.arena-filterbar {
  position: sticky; top: 0; z-index: 10;
  padding: 14px 0;
  background: rgba(10,10,10,0.82);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--line);
  margin: 0 -24px;
  padding-left: 24px; padding-right: 24px;
}
.arena-filterbar-inner {
  max-width: 1112px; margin: 0 auto;
  display: flex; flex-direction: column; gap: 10px;
}

.arena-search {
  width: 100%;
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 12px;
  transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
}
.arena-search:hover { border-color: var(--line-2); }
.arena-search:focus-within {
  border-color: var(--gold-edge);
  background: rgba(255, 215, 0, 0.03);
  box-shadow: 0 0 0 3px rgba(255,215,0,0.08);
}
.arena-search svg { color: var(--ink-4); flex-shrink: 0; }
.arena-search input {
  flex: 1; min-width: 0;
  background: none; border: none; outline: none;
  color: var(--ink); font-size: 14.5px; font-family: inherit;
  letter-spacing: -0.005em;
}
.arena-search input::placeholder { color: var(--ink-4); }
.arena-search-x {
  background: none; border: none; color: var(--ink-4);
  cursor: pointer; font-size: 14px; padding: 2px;
}
.arena-search-x:hover { color: var(--ink-2); }

.arena-chiprow {
  flex: 1 1 auto;
  display: flex; gap: 6px;
  overflow-x: auto; overflow-y: hidden;
  scrollbar-width: none;
  padding: 2px 0;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent);
          mask-image: linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 24px), transparent);
}
.arena-chiprow::-webkit-scrollbar { display: none; }
.arena-chip {
  font-family: inherit;
  padding: 7px 14px;
  border-radius: 8px; white-space: nowrap;
  background: transparent; border: 1px solid var(--line);
  color: var(--ink-3); font-size: 12.5px; font-weight: 500;
  cursor: pointer;
  transition: all .15s ease;
  display: inline-flex; align-items: center;
}
.arena-chip:hover { color: var(--ink); border-color: var(--line-2); }
.arena-chip.active {
  background: var(--ink); color: var(--bg-0);
  border-color: var(--ink); font-weight: 600;
}

/* ───────── Search results panel ───────── */
.arena-searchpanel {
  margin: 20px 0 0;
  padding: 16px 18px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 14px;
  animation: arena-fade .22s ease;
}
.arena-searchpanel-label {
  font-family: var(--font-mono);
  font-size: 10.5px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--ink-4);
  margin-bottom: 10px;
}
.arena-searchpanel-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.arena-searchpanel-tool {
  font-family: inherit;
  padding: 9px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-2); color: var(--ink);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all .15s ease;
  display: inline-flex; align-items: center; gap: 10px;
}
.arena-searchpanel-tool:hover { border-color: var(--gold-edge); }
.arena-searchpanel-tool.active {
  border-color: var(--gold); background: var(--gold-wash);
}
.arena-searchpanel-tool .votes {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--ink-4); font-weight: 500;
}
.arena-searchpanel-tool.active .votes { color: var(--gold); }

.arena-searchpanel-section + .arena-searchpanel-section { margin-top: 16px; }

.arena-searchpanel-cat {
  font-family: inherit;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-2); color: var(--ink);
  cursor: pointer;
  transition: border-color .15s ease, transform .15s ease, background .15s ease;
  display: inline-flex; align-items: center; gap: 12px;
  text-align: left;
}
.arena-searchpanel-cat:hover { border-color: var(--line-2); transform: translateY(-1px); }
.arena-searchpanel-cat-emoji { font-size: 20px; line-height: 1; }
.arena-searchpanel-cat-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.arena-searchpanel-cat-name { font-size: 13.5px; font-weight: 600; letter-spacing: -0.005em; }
.arena-searchpanel-cat-leader {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--ink-3);
  display: inline-flex; align-items: center; gap: 6px;
}
.arena-searchpanel-cat-dot {
  width: 6px; height: 6px; border-radius: 50%;
  flex-shrink: 0;
}

/* ───────── Tool profile panel ───────── */
.arena-tool-panel {
  position: relative;
  margin: 22px 0;
  padding: 28px 28px 26px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 20px;
  overflow: hidden;
  animation: arena-fade .3s ease;
}
.arena-tool-panel::before {
  content: ''; position: absolute; top: -140px; left: -80px;
  width: 360px; height: 360px;
  background: radial-gradient(circle, rgba(255,215,0,0.14), transparent 60%);
  pointer-events: none;
}
.arena-tool-head {
  position: relative;
  display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;
  padding-bottom: 20px; margin-bottom: 20px;
  border-bottom: 1px solid var(--line);
}
.arena-tool-kicker {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--gold); font-weight: 600;
}
.arena-tool-name {
  font-family: var(--font-display);
  font-weight: 800; font-size: 38px;
  letter-spacing: -0.034em; line-height: 1;
  margin: 8px 0 12px; color: var(--ink);
}
.arena-tool-summary {
  color: var(--ink-2); font-size: 14.5px; line-height: 1.5;
  max-width: 52ch;
}
.arena-tool-summary strong {
  color: var(--ink);
  font-weight: 700;
}
.arena-tool-stats {
  display: flex; gap: 0;
  margin-top: 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  width: fit-content;
}
.arena-tool-stat {
  padding: 10px 20px 10px 16px;
  border-right: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 2px;
}
.arena-tool-stat:last-child { border-right: none; }
.arena-tool-stat b {
  font-family: var(--font-mono);
  font-size: 18px; font-weight: 700;
  color: var(--ink);
  line-height: 1;
}
.arena-tool-stat.gold b { color: var(--gold); }
.arena-tool-stat span {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--ink-4);
}
.arena-close {
  font-family: var(--font-mono);
  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  background: transparent; border: 1px solid var(--line);
  border-radius: 8px; padding: 7px 12px;
  color: var(--ink-3); cursor: pointer;
  transition: all .15s ease;
  flex-shrink: 0;
}
.arena-close:hover { border-color: var(--line-2); color: var(--ink); }

.arena-tool-grid {
  position: relative;
  display: grid; gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}
.arena-rankpill {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-2);
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
  transition: border-color .15s ease, transform .15s ease, background .15s ease;
}
.arena-rankpill:hover { border-color: var(--gold-edge); transform: translateY(-1px); }
.arena-rankpill:active { transform: translateY(0); }
.arena-rankpill.gold { border-color: var(--gold-edge); background: var(--gold-wash); }
.arena-rankpill.gold:hover { background: rgba(255, 215, 0, 0.14); }
.arena-rankpill-icon { font-size: 20px; flex-shrink: 0; }
.arena-rankpill-body { min-width: 0; flex: 1; }
.arena-rankpill-name { font-size: 13.5px; font-weight: 600; color: var(--ink); line-height: 1.25; letter-spacing: -0.005em; }
.arena-rankpill-meta {
  font-family: var(--font-display);
  font-size: 12px; font-weight: 500;
  color: var(--ink-3);
  margin-top: 4px;
  letter-spacing: -0.002em;
}
.arena-rankpill-meta .arena-rankpill-sep { color: var(--ink-5); margin: 0 6px; }
.arena-rankpill-num {
  font-family: var(--font-mono); font-weight: 700;
  font-size: 15px; min-width: 40px; text-align: right;
}
.arena-rankpill-num.r1 { color: var(--gold); }
.arena-rankpill-num.r2 { color: var(--silver); }
.arena-rankpill-num.r3 { color: var(--bronze); }
.arena-rankpill-num.rN { color: var(--ink-4); }

/* ───────── Sections ───────── */
.arena-sectionlead {
  margin: 36px 0 20px;
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 16px; flex-wrap: wrap;
}
.arena-sectionlead h2 {
  font-family: var(--font-display);
  font-weight: 700; font-size: 22px;
  letter-spacing: -0.025em;
  margin: 0; color: var(--ink);
}
.arena-sectionlead-note {
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--ink-4);
}

/* ───────── Grid of category cards ───────── */
.arena-grid {
  display: grid; gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
}
@media (max-width: 620px) {
  .arena-grid { grid-template-columns: 1fr; gap: 12px; }
}

.arena-card {
  position: relative;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 22px 22px 18px;
  transition: border-color .25s ease, transform .25s ease;
  animation: arena-rise .4s cubic-bezier(.2,.7,.2,1) both;
}
.arena-card:hover { border-color: var(--line-2); }

.arena-card-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 12px; margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.arena-card-title {
  display: flex; align-items: center; gap: 12px;
  margin: 0;
  font-family: var(--font-display);
  font-size: 17px; font-weight: 700;
  letter-spacing: -0.02em; color: var(--ink);
}
.arena-card-emoji { font-size: 20px; line-height: 1; }
.arena-card-leader {
  text-align: right; flex-shrink: 0;
  padding-top: 2px;
  display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
}
.arena-card-leader-label {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--ink-4);
}
.arena-card-leader-name {
  font-family: var(--font-display);
  font-size: 13px; font-weight: 700;
  color: var(--leader-text-color, #FFFFFF);
  letter-spacing: -0.005em;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--leader-color, var(--ink-3));
  border: none;
  display: inline-flex; align-items: center;
  box-shadow: 0 2px 12px -4px color-mix(in srgb, var(--leader-color, #8A8A8A) 60%, transparent);
  transition: filter .2s ease, transform .15s ease;
}
.arena-card:hover .arena-card-leader-name { filter: brightness(1.08); transform: translateY(-1px); }

.arena-rows { display: flex; flex-direction: column; gap: 2px; }

.arena-row {
  display: grid;
  grid-template-columns: 26px 1fr auto auto;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: background .18s ease, border-color .18s ease;
  position: relative;
}
.arena-row:hover { background: var(--bg-2); }
.arena-row.r1 { background: var(--gold-wash); border-color: var(--gold-edge); }
.arena-row.r1:hover { background: rgba(255,215,0,0.14); }

.arena-row-rank {
  font-family: var(--font-mono);
  font-size: 12.5px; font-weight: 700;
  color: var(--ink-5);
  text-align: center;
}
.arena-row.r1 .arena-row-rank { color: var(--gold); }
.arena-row.r2 .arena-row-rank { color: var(--silver); }
.arena-row.r3 .arena-row-rank { color: var(--bronze); }

.arena-row-tool {
  min-width: 0; display: flex; align-items: center; gap: 8px;
}
.arena-row-tool-btn {
  font-family: inherit;
  background: none; border: none; padding: 0; cursor: pointer;
  color: var(--ink);
  font-size: 14.5px; font-weight: 600;
  line-height: 1.2; text-align: left;
  transition: color .15s ease;
  letter-spacing: -0.005em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.arena-row-tool-btn:hover { color: var(--gold); }

.arena-row-count {
  font-family: var(--font-mono); font-size: 12.5px;
  color: var(--ink-3); min-width: 36px; text-align: right;
  font-weight: 500;
  position: relative;
}
.arena-plusone {
  position: absolute; top: -16px; left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono); font-size: 11px; font-weight: 700;
  color: var(--gold);
  animation: arena-plus 0.8s cubic-bezier(.2,.7,.2,1) forwards;
  pointer-events: none;
}
@keyframes arena-plus {
  0% { opacity: 0; transform: translate(-50%, 6px); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -14px); }
}

.arena-vote {
  font-family: var(--font-mono);
  font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase;
  padding: 7px 14px; border-radius: 999px; cursor: pointer;
  background: transparent;
  color: var(--ink-3);
  border: 1px solid var(--line-2);
  transition: all .18s cubic-bezier(.2,.7,.2,1);
  white-space: nowrap;
}
.arena-vote:hover:not(:disabled) {
  color: var(--gold);
  border-color: var(--gold-edge);
  background: var(--gold-wash);
}
.arena-vote:active:not(:disabled) { transform: scale(0.94); }
.arena-vote.voted {
  background: var(--gold); color: var(--bg-0); border-color: var(--gold);
  box-shadow: 0 4px 18px -6px rgba(255,215,0,0.6);
}
.arena-vote.voted:hover:not(:disabled) {
  background: var(--gold-warm); border-color: var(--gold-warm);
}
.arena-vote:disabled { cursor: wait; opacity: 0.55; }
.arena-vote-check {
  display: inline-flex; margin-right: 4px; transform: translateY(-0.5px);
}

.arena-showmore {
  margin-top: 6px;
  width: 100%;
  padding: 8px 0;
  background: none; border: none;
  color: var(--ink-4);
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.2em; text-transform: uppercase;
  cursor: pointer; transition: color .15s ease;
}
.arena-showmore:hover { color: var(--gold); }

.arena-empty {
  padding: 20px; text-align: center;
  color: var(--ink-4); font-size: 13px;
}

/* ───────── Loading + error ───────── */
.arena-loading, .arena-error {
  margin-top: 48px; text-align: center;
  font-family: var(--font-mono);
  font-size: 11.5px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-3);
  padding: 40px 20px;
}
.arena-error { color: #FF8080; }

/* ───────── Footnote ───────── */
.arena-footnote {
  margin: 56px auto 0;
  padding: 0 20px;
  text-align: center;
  color: var(--ink-2);
  font-size: 16.5px;
  line-height: 1.6;
  max-width: 720px;
  background: transparent;
  border: none;
}
.arena-footnote strong {
  color: var(--ink);
  font-weight: 700;
}
.arena-footnote-label {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--gold); margin-bottom: 12px;
}

/* ───────── Compare ───────── */
.arena-compare {
  margin-top: 22px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #000000;
  padding: 18px 20px;
}
.arena-compare-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 14px;
  background: transparent;
}
.arena-compare-kicker {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.24em; text-transform: uppercase; color: var(--ink);
  background: transparent;
}
.arena-compare-hint {
  font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
  background: transparent;
}
.arena-compare-clear {
  background: transparent; border: 1px solid rgba(255, 255, 255, 0.35);
  color: var(--ink); padding: 4px 10px; border-radius: 6px;
  font-family: var(--font-mono); font-size: 11px; cursor: pointer;
  transition: all .15s ease;
}
.arena-compare-clear:hover { border-color: #ffffff; }

.arena-compare-slots {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
  background: transparent;
}
@media (max-width: 720px) {
  .arena-compare-slots { grid-template-columns: 1fr; }
}

.arena-compare-slot {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  min-height: 52px; padding: 10px 14px;
  border: 1.5px solid #ffffff;
  border-radius: 10px;
  background: transparent;
  color: #ffffff;
  font-family: var(--font-display); font-size: 13px; font-weight: 500;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
.arena-compare-slot:hover {
  background: rgba(255, 255, 255, 0.05);
}
.arena-compare-slot.filled {
  border-style: solid; border-width: 2px;
  background: transparent;
  cursor: default;
  justify-content: space-between;
}
.arena-compare-slot-name {
  font-family: var(--font-display); font-size: 15px; font-weight: 700;
  letter-spacing: -0.01em;
}
.arena-compare-slot-remove {
  background: transparent; border: none; color: var(--ink-3);
  font-size: 14px; cursor: pointer; padding: 4px 6px; border-radius: 4px;
  line-height: 1;
}
.arena-compare-slot-remove:hover { color: var(--ink); background: rgba(255, 255, 255, 0.08); }

.arena-compare-picker {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0;
  background: var(--bg-2); border: 1px solid var(--line-2);
  border-radius: 10px; padding: 6px; z-index: 20;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
  max-height: 280px; overflow-y: auto;
}
.arena-compare-picker-item {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 8px 10px;
  background: transparent; border: none; cursor: pointer;
  border-radius: 6px;
  color: var(--ink); font-family: var(--font-display); font-size: 13px;
  text-align: left;
}
.arena-compare-picker-item:hover { background: var(--line); }
.arena-compare-picker-item .votes {
  font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
}
.arena-compare-picker-empty {
  padding: 10px; color: var(--ink-3); font-size: 12px; text-align: center;
}

/* Comparison panel (grid of category × tool) */
.arena-compare-panel {
  margin-top: 18px;
  border: 1px solid var(--line); border-radius: 14px;
  background: var(--bg-1); overflow: hidden;
}
.arena-compare-summary {
  display: grid; gap: 10px; padding: 14px 16px;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, var(--bg-2), var(--bg-1));
}
.arena-compare-summary-tools {
  display: flex; flex-wrap: wrap; gap: 14px;
}
.arena-compare-sumcell {
  display: flex; align-items: baseline; gap: 8px;
}
.arena-compare-sumcell-name { font-weight: 700; font-size: 14px; }
.arena-compare-sumcell-wins {
  font-family: var(--font-mono); font-size: 12px; color: var(--ink-2);
}
.arena-compare-sumcell-wins b { color: var(--gold); }
.arena-compare-summary-note {
  font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
}

.arena-compare-table {
  width: 100%;
  overflow-x: auto;
}
.arena-compare-thead, .arena-compare-trow {
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) repeat(var(--compare-cols, 3), minmax(120px, 1fr));
  align-items: stretch;
}
.arena-compare-thead {
  background: var(--bg-2);
  border-bottom: 1px solid var(--line);
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-3);
}
.arena-compare-thead > div {
  padding: 10px 14px;
}
.arena-compare-thead-tool {
  text-transform: none; letter-spacing: -0.01em;
  font-family: var(--font-display); font-size: 13px; font-weight: 700;
  color: var(--ink);
}
.arena-compare-trow { border-top: 1px solid var(--line); }
.arena-compare-cat {
  padding: 12px 14px;
  display: flex; align-items: center; gap: 10px;
  color: var(--ink); font-size: 13px; font-weight: 500;
  border-right: 1px solid var(--line);
}
.arena-compare-cell {
  padding: 12px 14px;
  display: flex; flex-direction: column; justify-content: center; gap: 2px;
  border-right: 1px solid var(--line);
  position: relative;
}
.arena-compare-cell:last-child { border-right: none; }
.arena-compare-cell-rank {
  font-family: var(--font-display); font-size: 16px; font-weight: 700;
  color: var(--ink);
}
.arena-compare-cell-votes {
  font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
}
.arena-compare-cell-empty { color: var(--ink-4); font-size: 14px; }
.arena-compare-cell.winner {
  background: var(--gold-wash);
  box-shadow: inset 2px 0 0 var(--winner-color, var(--gold));
}
.arena-compare-cell.winner .arena-compare-cell-rank {
  color: var(--winner-color, var(--gold));
}
.arena-compare-cell-crown {
  position: absolute; top: 6px; right: 8px;
  font-size: 11px; line-height: 1; color: var(--winner-color, var(--gold));
}

.arena-compare-empty {
  padding: 22px; text-align: center; color: var(--ink-3);
  font-family: var(--font-mono); font-size: 12px;
}

/* ───────── Animations ───────── */
@keyframes arena-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes arena-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .arena-card, .arena-searchpanel, .arena-tool-panel { animation: none; }
  .arena-ticker-track { animation: none; }
  .arena-vote, .arena-chip, .arena-row, .arena-rankpill, .arena-podium-card { transition: none; }
}
`;

/* ─── Glyphs ─── */
const SearchGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);
const CheckGlyph = () => (
  <svg className="arena-vote-check" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
function rankClass(i) {
  if (i === 0) return 'r1';
  if (i === 1) return 'r2';
  if (i === 2) return 'r3';
  return 'rN';
}

/* ─── Ticker ─── */
function LeaderTicker({ categories, grouped, onJump }) {
  const items = useMemo(() => {
    const out = [];
    for (const c of categories) {
      const rows = grouped.get(c.id) || [];
      if (rows[0]) out.push({ id: c.id, name: c.name, tool: rows[0].tool_name });
    }
    return out;
  }, [categories, grouped]);

  if (items.length === 0) return null;

  const Row = () => (
    <>
      {items.map((it, i) => (
        <span key={`${it.id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
          <button
            type="button"
            className="arena-tick"
            onClick={() => onJump(it.id)}
            title={`Jump to ${it.name}`}
          >
            <span className="arena-tick-dot" />
            <span><b style={{ color: getToolBrandColor(it.tool) }}>{getToolDisplayLabel(it.tool)}</b> leads {it.name.replace(/^Best for |^Fastest /i, '')}</span>
          </button>
          {i < items.length - 1 && <span className="arena-tick-sep">·</span>}
        </span>
      ))}
    </>
  );

  return (
    <div className="arena-ticker" aria-hidden="false">
      <div className="arena-ticker-track">
        <Row />
        <Row />
      </div>
    </div>
  );
}

/* ─── Podium ─── */
function Podium({ tools, ranksByTool, onPick }) {
  const top = tools.slice(0, 3);
  while (top.length < 3) top.push(null);
  const order = [1, 0, 2];

  return (
    <div className="arena-podium">
      {order.map(idx => {
        const t = top[idx];
        const pos = idx + 1;
        if (!t) {
          return (
            <div key={`p-${idx}`} className={`arena-podium-card p${pos}`} style={{ opacity: 0.35 }}>
              <div className="arena-podium-rank">— {pos === 1 ? '1st' : pos === 2 ? '2nd' : '3rd'} —</div>
              <div className="arena-podium-name">TBD</div>
            </div>
          );
        }
        const wins = ranksByTool.get(t.id)?.wins || 0;
        return (
          <button
            key={t.id}
            type="button"
            className={`arena-podium-card p${pos}`}
            onClick={() => onPick({ id: t.id, name: t.name })}
          >
            <div className="arena-podium-rank">
              {pos === 1 ? '★ 1st overall' : pos === 2 ? '2nd overall' : '3rd overall'}
            </div>
            <div className="arena-podium-name">{t.name}</div>
            <div className="arena-podium-meta">
              <b>{t.total.toLocaleString()}</b> votes
              {wins > 0 && <>&nbsp;· {wins} {wins === 1 ? 'win' : 'wins'}</>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Category card ─── */
function CategoryCard({
  category,
  rows,
  userVoteToolId,
  onVote,
  onToolClick,
  voting,
  signedIn,
  onRequireAuth,
  expanded,
  onToggleExpand,
  lastVoted,
  style,
  cardRef,
}) {
  const visible = expanded ? rows : rows.slice(0, 5);
  const leader = rows[0];

  return (
    <div className="arena-card" style={style} ref={cardRef}>
      <div className="arena-card-head">
        <h3 className="arena-card-title">
          <span className="arena-card-emoji">{category.emoji}</span>
          {category.name.replace(/^Best for /, '')}
        </h3>
        {leader && (() => {
          const brand = getToolBrandColor(leader.tool_name) || '#8A8A8A';
          return (
            <div className="arena-card-leader">
              <div className="arena-card-leader-label">Leader</div>
              <div
                className="arena-card-leader-name"
                style={{
                  '--leader-color': brand,
                  '--leader-text-color': getReadableTextOn(brand),
                }}
              >
                {getToolDisplayLabel(leader.tool_name)}
              </div>
            </div>
          );
        })()}
      </div>

      <div className="arena-rows">
        {visible.map((row, i) => {
          const voted = userVoteToolId === row.tool_id;
          const rc = rankClass(i);
          const flash = lastVoted?.categoryId === category.id && lastVoted?.toolId === row.tool_id;
          return (
            <div key={row.tool_id} className={`arena-row ${rc}`}>
              <div className="arena-row-rank">{String(i + 1).padStart(2, '0')}</div>
              <div className="arena-row-tool">
                <button
                  type="button"
                  className="arena-row-tool-btn"
                  onClick={() => onToolClick?.(row.tool_id, row.tool_name)}
                  title={`See ${row.tool_name} profile`}
                >
                  {getToolDisplayLabel(row.tool_name)}
                </button>
              </div>
              <div className="arena-row-count">
                {row.total_votes.toLocaleString()}
                {flash && <span className="arena-plusone">+1</span>}
              </div>
              <button
                type="button"
                className={`arena-vote ${voted ? 'voted' : ''}`}
                disabled={voting}
                onClick={() => {
                  if (!signedIn) return onRequireAuth?.();
                  onVote(category.id, row.tool_id, voted);
                }}
                aria-pressed={voted}
              >
                {voted ? <><CheckGlyph />Voted</> : 'Vote'}
              </button>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="arena-empty">No tools yet. Be the first to vote.</div>
        )}
      </div>

      {rows.length > 5 && (
        <button type="button" className="arena-showmore" onClick={onToggleExpand}>
          {expanded ? '— Show less —' : `— Show all ${rows.length} —`}
        </button>
      )}
    </div>
  );
}

/* ─── Tool profile panel ─── */
function ToolRanksPanel({ toolName, toolId, rows, onClose, onCategoryClick }) {
  const ranks = useMemo(() => getToolCategoryRanks(rows, toolId), [rows, toolId]);
  const wins = ranks.filter(r => r.rank === 1).length;
  const totalVotes = useMemo(
    () => rows.filter(r => r.tool_id === toolId).reduce((a, r) => a + r.total_votes, 0),
    [rows, toolId]
  );

  return (
    <div className="arena-tool-panel">
      <div className="arena-tool-head">
        <div style={{ minWidth: 0 }}>
          <div className="arena-tool-kicker">Tool profile</div>
          <h2 className="arena-tool-name">{getToolDisplayLabel(toolName)}</h2>
          <div className="arena-tool-summary">
            {wins > 0
              ? <>Ranked <strong>#1</strong> in {wins} {wins === 1 ? 'category' : 'categories'} · appearing in {ranks.length} of the Arena.</>
              : <>Appearing in {ranks.length} {ranks.length === 1 ? 'category' : 'categories'}. No wins yet — <strong>your vote could change that.</strong></>}
          </div>
          <div className="arena-tool-stats">
            <div className={`arena-tool-stat ${wins > 0 ? 'gold' : ''}`}>
              <b>{wins}</b><span>#1 wins</span>
            </div>
            <div className="arena-tool-stat">
              <b>{ranks.length}</b><span>Categories</span>
            </div>
            <div className="arena-tool-stat">
              <b>{totalVotes.toLocaleString()}</b><span>Total votes</span>
            </div>
          </div>
        </div>
        <button type="button" className="arena-close" onClick={onClose}>Close</button>
      </div>

      <div className="arena-tool-grid">
        {ranks.map(r => (
          <button
            type="button"
            key={r.category_id}
            className={`arena-rankpill ${r.rank === 1 ? 'gold' : ''}`}
            onClick={() => onCategoryClick?.(r.category_id)}
            title={`Jump to ${r.category_name}`}
          >
            <span className="arena-rankpill-icon">{r.category_emoji}</span>
            <div className="arena-rankpill-body">
              <div className="arena-rankpill-name">{r.category_name.replace(/^Best for /, '')}</div>
              <div className="arena-rankpill-meta">
                {r.total_votes.toLocaleString()} votes
                <span className="arena-rankpill-sep">·</span>
                #{r.rank} of {r.total_tools}
              </div>
            </div>
            <div className={`arena-rankpill-num ${rankClass(r.rank - 1)}`}>
              #{r.rank}
            </div>
          </button>
        ))}
        {ranks.length === 0 && (
          <div className="arena-empty">No votes for this tool yet.</div>
        )}
      </div>
    </div>
  );
}

/* ─── Compare (pick up to 3 tools, see what each is best at) ─── */
const MAX_COMPARE = 3;

function CompareSlot({ tool, pickerOpen, onOpenPicker, onClosePicker, onPick, onRemove, pickerOptions }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClosePicker();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClosePicker(); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen, onClosePicker]);

  if (tool) {
    const brand = getToolBrandColor(tool.name) || '#8A8A8A';
    return (
      <div className="arena-compare-slot filled" style={{ borderColor: brand }}>
        <span className="arena-compare-slot-name" style={{ color: brand }}>{getToolDisplayLabel(tool.name)}</span>
        <button
          type="button"
          className="arena-compare-slot-remove"
          onClick={onRemove}
          aria-label={`Remove ${tool.name}`}
          title="Remove"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="arena-compare-slot"
        onClick={() => (pickerOpen ? onClosePicker() : onOpenPicker())}
        aria-expanded={pickerOpen}
      >
        + Add a tool
      </button>
      {pickerOpen && (
        <div className="arena-compare-picker" role="listbox">
          {pickerOptions.length === 0 ? (
            <div className="arena-compare-picker-empty">No more tools to add</div>
          ) : (
            pickerOptions.map(t => (
              <button
                key={t.id}
                type="button"
                className="arena-compare-picker-item"
                onClick={() => { onPick(t); }}
                role="option"
              >
                <span style={{ color: getToolBrandColor(t.name) || 'var(--ink)' }}>{getToolDisplayLabel(t.name)}</span>
                <span className="votes">{t.total.toLocaleString()}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CompareSection({ tools, categories, rows, comparedIds, onAdd, onRemove, onClear, onCategoryClick }) {
  const [openSlot, setOpenSlot] = useState(null);

  const comparedTools = useMemo(
    () => comparedIds
      .map(id => tools.find(t => t.id === id))
      .filter(Boolean),
    [comparedIds, tools]
  );

  const availableOptions = useMemo(
    () => tools.filter(t => !comparedIds.includes(t.id)),
    [tools, comparedIds]
  );

  // For each compared tool, build a map<categoryId, {rank, total_votes, total_tools}>
  // so the comparison cells are O(1) lookups as we iterate the category list.
  const toolRankMaps = useMemo(() => {
    return comparedTools.map(t => {
      const ranks = getToolCategoryRanks(rows, t.id);
      const map = new Map();
      for (const r of ranks) map.set(r.category_id, r);
      return { tool: t, map };
    });
  }, [comparedTools, rows]);

  // Per category, determine the winner among the compared tools (highest
  // total_votes; ties resolve to no winner). Also track wins per tool.
  const { winnerByCategory, winsByTool } = useMemo(() => {
    const winnerByCategory = new Map();
    const winsByTool = new Map();
    for (const cat of categories) {
      let bestToolId = null;
      let bestVotes = -1;
      let tied = false;
      for (const { tool, map } of toolRankMaps) {
        const r = map.get(cat.id);
        const votes = r ? r.total_votes : 0;
        if (votes > bestVotes) {
          bestToolId = tool.id;
          bestVotes = votes;
          tied = false;
        } else if (votes === bestVotes && bestVotes > 0) {
          tied = true;
        }
      }
      if (!tied && bestVotes > 0 && bestToolId) {
        winnerByCategory.set(cat.id, bestToolId);
        winsByTool.set(bestToolId, (winsByTool.get(bestToolId) || 0) + 1);
      } else {
        winnerByCategory.set(cat.id, null);
      }
    }
    return { winnerByCategory, winsByTool };
  }, [categories, toolRankMaps]);

  const slots = [];
  for (let i = 0; i < MAX_COMPARE; i++) slots.push(comparedTools[i] || null);

  return (
    <>
      <div className="arena-compare">
        <div className="arena-compare-head">
          <span className="arena-compare-kicker">Compare up to {MAX_COMPARE} AI tools</span>
          <span className="arena-compare-hint">
            {comparedTools.length < 2
              ? `Pick ${2 - comparedTools.length} more tool${2 - comparedTools.length === 1 ? '' : 's'} to see what each is best at`
              : `${comparedTools.length} of ${MAX_COMPARE} picked`}
          </span>
          {comparedTools.length > 0 && (
            <button type="button" className="arena-compare-clear" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
        <div className="arena-compare-slots">
          {slots.map((t, i) => (
            <CompareSlot
              key={i}
              tool={t}
              pickerOpen={openSlot === i}
              onOpenPicker={() => setOpenSlot(i)}
              onClosePicker={() => setOpenSlot(null)}
              onPick={(picked) => { onAdd(picked); setOpenSlot(null); }}
              onRemove={() => onRemove(t.id)}
              pickerOptions={availableOptions}
            />
          ))}
        </div>
      </div>

      {comparedTools.length >= 2 && (
        <div className="arena-compare-panel" style={{ '--compare-cols': comparedTools.length }}>
          <div className="arena-compare-summary">
            <div className="arena-compare-summary-tools">
              {comparedTools.map(t => {
                const wins = winsByTool.get(t.id) || 0;
                const brand = getToolBrandColor(t.name) || 'var(--ink)';
                return (
                  <div key={t.id} className="arena-compare-sumcell">
                    <span className="arena-compare-sumcell-name" style={{ color: brand }}>
                      {getToolDisplayLabel(t.name)}
                    </span>
                    <span className="arena-compare-sumcell-wins">
                      best at <b>{wins}</b> {wins === 1 ? 'category' : 'categories'}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="arena-compare-summary-note">
              Winner per row = most votes among the picked tools. Tap a row to jump to that category.
            </div>
          </div>

          <div className="arena-compare-table" role="table">
            <div className="arena-compare-thead" role="row">
              <div>Category</div>
              {comparedTools.map(t => (
                <div key={t.id} className="arena-compare-thead-tool" style={{ color: getToolBrandColor(t.name) || 'var(--ink)' }}>
                  {getToolDisplayLabel(t.name)}
                </div>
              ))}
            </div>
            {categories.map(cat => {
              const winnerId = winnerByCategory.get(cat.id);
              return (
                <div
                  key={cat.id}
                  className="arena-compare-trow"
                  role="row"
                  onClick={() => onCategoryClick?.(cat.id)}
                  style={{ cursor: onCategoryClick ? 'pointer' : 'default' }}
                >
                  <div className="arena-compare-cat">
                    <span>{cat.name.replace(/^Best for /, '')}</span>
                  </div>
                  {comparedTools.map((t, idx) => {
                    const r = toolRankMaps[idx].map.get(cat.id);
                    const isWinner = winnerId === t.id;
                    const brand = getToolBrandColor(t.name);
                    const cellStyle = isWinner && brand ? { '--winner-color': brand } : undefined;
                    return (
                      <div
                        key={t.id}
                        className={`arena-compare-cell ${isWinner ? 'winner' : ''}`}
                        style={cellStyle}
                        role="cell"
                      >
                        {isWinner && <span className="arena-compare-cell-crown" aria-label="Winner">★</span>}
                        {r ? (
                          <>
                            <div className="arena-compare-cell-rank">#{r.rank}</div>
                            <div className="arena-compare-cell-votes">
                              {r.total_votes.toLocaleString()} {r.total_votes === 1 ? 'vote' : 'votes'}
                            </div>
                          </>
                        ) : (
                          <div className="arena-compare-cell-empty">—</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Main page ─── */
export default function ArenaPage({
  currentUser,
  onToolClick,
  onRequireAuth,
  initialFocusedTool,
  initialJumpCategoryId,
  onInitialConsumed,
}) {
  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [userVotes, setUserVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [voting, setVoting] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [focusedTool, setFocusedTool] = useState(initialFocusedTool || null);
  const [comparedToolIds, setComparedToolIds] = useState([]);
  const [lastVoted, setLastVoted] = useState(null);
  const cardRefs = useRef(new Map());
  const searchRef = useRef(null);

  const userId = currentUser?.id;
  const signedIn = Boolean(userId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [cats, lb] = await Promise.all([getArenaCategories(), getArenaLeaderboard()]);
        if (cancelled) return;
        setCategories(cats);
        setRows(lb);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load Arena');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadVotes() {
      if (!userId) return setUserVotes([]);
      try {
        const votes = await getUserArenaVotes(userId);
        if (!cancelled) setUserVotes(votes);
      } catch {
        if (!cancelled) setUserVotes([]);
      }
    }
    loadVotes();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Flip the body to a pure-black backdrop while the Arena is mounted
  useEffect(() => {
    document.body.classList.add('arena-active');
    return () => document.body.classList.remove('arena-active');
  }, []);

  // Deep-link: when the caller pre-sets a focused tool, adopt it. After
  // leaderboard has loaded, optionally scroll to a specific category card.
  // We notify the parent via onInitialConsumed so the deep-link state is
  // cleared and later remounts don't re-apply stale selections.
  useEffect(() => {
    if (loading) return;
    if (!initialFocusedTool && !initialJumpCategoryId) return;
    if (initialFocusedTool?.id) setFocusedTool(initialFocusedTool);
    if (initialJumpCategoryId) {
      const node = cardRefs.current.get(initialJumpCategoryId);
      if (node) {
        const t = setTimeout(() => {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
          node.style.animation = 'none';
          requestAnimationFrame(() => {
            node.style.animation = 'arena-rise 0.5s cubic-bezier(.2,.7,.2,1) both';
          });
        }, 80);
        onInitialConsumed?.();
        return () => clearTimeout(t);
      }
    }
    onInitialConsumed?.();
  }, [loading, initialFocusedTool?.id, initialJumpCategoryId, onInitialConsumed]);

  const grouped = useMemo(() => groupLeaderboardByCategory(rows), [rows]);

  const userVoteByCategory = useMemo(() => {
    const map = new Map();
    for (const v of userVotes) map.set(v.category_id, v.tool_id);
    return map;
  }, [userVotes]);

  const tools = useMemo(() => {
    const seen = new Map();
    for (const r of rows) {
      if (!seen.has(r.tool_id)) {
        seen.set(r.tool_id, { id: r.tool_id, name: r.tool_name, total: 0 });
      }
      seen.get(r.tool_id).total += r.total_votes;
    }
    return Array.from(seen.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const ranksByTool = useMemo(() => {
    const map = new Map();
    for (const t of tools) {
      const ranks = getToolCategoryRanks(rows, t.id);
      map.set(t.id, {
        wins: ranks.filter(r => r.rank === 1).length,
        ranks,
      });
    }
    return map;
  }, [tools, rows]);

  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(t => t.name.toLowerCase().includes(q));
  }, [tools, query]);

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return categories.filter(c =>
      c.name.toLowerCase().includes(q)
      || (c.description || '').toLowerCase().includes(q)
    );
  }, [categories, query]);

  const focusedToolCategoryIds = useMemo(() => {
    if (!focusedTool) return null;
    const ids = new Set();
    for (const r of rows) {
      if (r.tool_id === focusedTool.id) ids.add(r.category_id);
    }
    return ids;
  }, [focusedTool, rows]);

  const visibleCategories = useMemo(() => {
    let result = categories;
    if (activeCategory !== 'all') {
      result = result.filter(c => c.id === activeCategory);
    }
    if (focusedToolCategoryIds) {
      result = result.filter(c => focusedToolCategoryIds.has(c.id));
    }
    return result;
  }, [categories, activeCategory, focusedToolCategoryIds]);

  const totalVotes = useMemo(
    () => rows.reduce((acc, r) => acc + r.total_votes, 0),
    [rows]
  );

  function jumpToCategory(catId) {
    setActiveCategory('all');
    requestAnimationFrame(() => {
      const node = cardRefs.current.get(catId);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        node.style.animation = 'none';
        requestAnimationFrame(() => {
          node.style.animation = 'arena-rise 0.5s cubic-bezier(.2,.7,.2,1) both';
        });
      }
    });
  }

  async function handleVote(categoryId, toolId, alreadyVoted) {
    if (!userId || voting) return;
    setVoting(true);
    if (!alreadyVoted) {
      setLastVoted({ categoryId, toolId, stamp: Date.now() });
      setTimeout(() => setLastVoted(null), 900);
    }
    const prevUserVotes = userVotes;
    const prevRows = rows;

    const priorToolId = userVoteByCategory.get(categoryId);
    const nextVotes = userVotes.filter(v => v.category_id !== categoryId);
    if (!alreadyVoted) nextVotes.push({ category_id: categoryId, tool_id: toolId });
    setUserVotes(nextVotes);

    setRows(rs =>
      rs.map(r => {
        if (r.category_id !== categoryId) return r;
        if (r.tool_id === priorToolId && priorToolId !== toolId) {
          return { ...r, user_votes: Math.max(0, r.user_votes - 1), total_votes: Math.max(0, r.total_votes - 1) };
        }
        if (r.tool_id === toolId) {
          if (alreadyVoted) {
            return { ...r, user_votes: Math.max(0, r.user_votes - 1), total_votes: Math.max(0, r.total_votes - 1) };
          }
          return { ...r, user_votes: r.user_votes + 1, total_votes: r.total_votes + 1 };
        }
        return r;
      })
    );

    try {
      if (priorToolId && priorToolId !== toolId) {
        await removeArenaVote({ userId, categoryId, toolId: priorToolId });
      }
      if (alreadyVoted) {
        await removeArenaVote({ userId, categoryId, toolId });
      } else {
        await castArenaVote({ userId, categoryId, toolId });
      }
      const fresh = await getArenaLeaderboard();
      setRows(fresh);
    } catch (err) {
      setUserVotes(prevUserVotes);
      setRows(prevRows);
      setError(err.message || 'Vote failed');
      setTimeout(() => setError(null), 3000);
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className="arena">
      <style>{arenaStyles}</style>
      <div className="arena-bg" aria-hidden="true" />

      <LeaderTicker categories={categories} grouped={grouped} onJump={jumpToCategory} />

      <header className="arena-hero">
        <div>
          <p className="arena-hero-sub">
            Real rankings from real builders. Find what works.
          </p>
          <div className="arena-hero-meta">
            <span><strong>{categories.length || '—'}</strong> categories</span>
            <span><strong>{tools.length || '—'}</strong> tools</span>
            <span><strong>{totalVotes.toLocaleString()}</strong> votes</span>
          </div>
        </div>
        <Podium
          tools={tools}
          ranksByTool={ranksByTool}
          onPick={setFocusedTool}
        />
      </header>

      <CompareSection
        tools={tools}
        categories={categories}
        rows={rows}
        comparedIds={comparedToolIds}
        onAdd={(picked) => {
          setComparedToolIds(ids =>
            ids.includes(picked.id) || ids.length >= MAX_COMPARE ? ids : [...ids, picked.id]
          );
        }}
        onRemove={(id) => {
          setComparedToolIds(ids => ids.filter(x => x !== id));
        }}
        onClear={() => setComparedToolIds([])}
        onCategoryClick={jumpToCategory}
      />

      {/* data-no-swipe: the category chiprow scrolls horizontally to pick an
          option; without this the app's drawer swipe-gesture hijacks the drag
          and opens the sidebar instead of letting the user scroll/select. */}
      <div className="arena-filterbar" data-no-swipe>
        <div className="arena-filterbar-inner">
          <div className="arena-search">
            <SearchGlyph />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search tools or categories — Claude, coding, marketing…"
            />
            {query && (
              <button
                type="button"
                className="arena-search-x"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <div className="arena-chiprow" role="tablist">
            <button
              type="button"
              className={`arena-chip ${activeCategory === 'all' ? 'active' : ''}`}
              onClick={() => setActiveCategory('all')}
              role="tab"
              aria-selected={activeCategory === 'all'}
            >
              All
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                className={`arena-chip ${activeCategory === c.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(activeCategory === c.id ? 'all' : c.id)}
                role="tab"
                aria-selected={activeCategory === c.id}
              >
                {c.name.replace(/^Best for |^Fastest |^Best /i, '')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {query.trim() && (
        <div className="arena-searchpanel">
          {filteredCategories.length > 0 && (
            <div className="arena-searchpanel-section">
              <div className="arena-searchpanel-label">
                {filteredCategories.length} {filteredCategories.length === 1 ? 'category' : 'categories'} match “{query}”
              </div>
              <div className="arena-searchpanel-grid">
                {filteredCategories.map(c => {
                  const leader = grouped.get(c.id)?.[0];
                  const leaderColor = leader ? getToolBrandColor(leader.tool_name) : null;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="arena-searchpanel-cat"
                      onClick={() => jumpToCategory(c.id)}
                    >
                      <span className="arena-searchpanel-cat-emoji">{c.emoji}</span>
                      <span className="arena-searchpanel-cat-body">
                        <span className="arena-searchpanel-cat-name">
                          {c.name.replace(/^Best for |^Fastest |^Best /i, '')}
                        </span>
                        {leader && (
                          <span className="arena-searchpanel-cat-leader">
                            <span
                              className="arena-searchpanel-cat-dot"
                              style={{ background: leaderColor || 'var(--ink-3)' }}
                            />
                            <span>
                              <strong style={{ color: leaderColor || 'var(--ink)' }}>
                                {getToolDisplayLabel(leader.tool_name)}
                              </strong> leads
                            </span>
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="arena-searchpanel-section">
            <div className="arena-searchpanel-label">
              {filteredTools.length} {filteredTools.length === 1 ? 'tool' : 'tools'} match “{query}”
            </div>
            {filteredTools.length === 0 ? (
              <div className="arena-empty">No tools match that search yet.</div>
            ) : (
              <div className="arena-searchpanel-grid">
                {filteredTools.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`arena-searchpanel-tool ${focusedTool?.id === t.id ? 'active' : ''}`}
                    onClick={() => setFocusedTool({ id: t.id, name: t.name })}
                  >
                    {t.name}
                    <span className="votes">{t.total.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {focusedTool && (
        <ToolRanksPanel
          toolId={focusedTool.id}
          toolName={focusedTool.name}
          rows={rows}
          onClose={() => setFocusedTool(null)}
          onCategoryClick={(catId) => {
            setActiveCategory('all');
            requestAnimationFrame(() => {
              const node = cardRefs.current.get(catId);
              if (node) {
                node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                node.style.animation = 'none';
                requestAnimationFrame(() => {
                  node.style.animation = 'arena-rise 0.5s cubic-bezier(.2,.7,.2,1) both';
                });
              }
            });
          }}
        />
      )}

      <div className="arena-sectionlead">
        <h2>
          {focusedTool
            ? `Where ${focusedTool.name} competes`
            : activeCategory === 'all'
              ? 'All categories'
              : categories.find(c => c.id === activeCategory)?.name || 'Category'}
        </h2>
        <div className="arena-sectionlead-note">
          {focusedTool
            ? `${visibleCategories.length} of ${categories.length} categories · close the profile to see all`
            : activeCategory === 'all'
              ? 'Each card is a live vote. Change your mind anytime.'
              : `Viewing 1 of ${categories.length} · tap a chip to switch`}
        </div>
      </div>

      {loading ? (
        <div className="arena-loading">Loading the arena…</div>
      ) : error ? (
        <div className="arena-error">{error}</div>
      ) : (
        <div className="arena-grid">
          {visibleCategories.map((cat, i) => (
            <CategoryCard
              key={cat.id}
              cardRef={(el) => { if (el) cardRefs.current.set(cat.id, el); }}
              style={{ animationDelay: `${Math.min(i * 45, 320)}ms` }}
              category={cat}
              rows={grouped.get(cat.id) || []}
              userVoteToolId={userVoteByCategory.get(cat.id)}
              onVote={handleVote}
              onToolClick={(id, name) => {
                if (onToolClick) onToolClick(name);
                else setFocusedTool({ id, name });
              }}
              voting={voting}
              signedIn={signedIn}
              onRequireAuth={onRequireAuth}
              expanded={expandedCategory === cat.id}
              onToggleExpand={() =>
                setExpandedCategory(expandedCategory === cat.id ? null : cat.id)
              }
              lastVoted={lastVoted}
            />
          ))}
        </div>
      )}

      <div className="arena-footnote">
        <div className="arena-footnote-label">Why the arena exists</div>
        Benchmarks go stale the day they ship. The only honest signal is <strong>what real builders reach for</strong> when the work actually has to get done. Every vote here is one more data point.
      </div>
    </div>
  );
}
