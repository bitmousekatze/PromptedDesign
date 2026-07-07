import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, useInView, useReducedMotion, animate, useMotionValue } from 'framer-motion';
import { BadgeSVG, BADGE_TIERS } from './BadgeSVG.jsx';

// ── Field data for the interactive picker ──
const FIELDS = {
  marketer: {
    label: "marketer",
    build: {
      name: "Mollie", handle: "@mollie", emoji: "\u{1F469}‍\u{1F4BC}", age: "4d ago",
      tags: ["APPS","SOCIAL MEDIA"],
      title: "SparkForge — AI Marketing Co-Founder for Solana",
      desc: "An AI copilot that generates tweets, Pump.fun copy, and launch content tuned to each brand. Built in a weekend.",
      tools: [["ChatGPT","#10a37f"],["Claude","#cc785c"],["Claude Code","#ec4899"],["Grok","#111"],["Vercel","#111"]],
      likes: 342, comments: 28, rankTier: 5,
    },
    questions: [
      { q: "Best tool for on-brand tweet gen?", a: 14 },
      { q: "How do you A/B test Pump.fun copy?", a: 7 },
      { q: "Claude vs GPT for long-form ads?", a: 22 },
    ],
  },
  student: {
    label: "student",
    build: {
      name: "Maxim Build", handle: "@maxiagent", emoji: "\u{1F393}", age: "1w ago",
      tags: ["APPS","EDUCATION"],
      title: "Built an AI learning tool with Replit",
      desc: "ConceptELI5 turns complex concepts into clear explanations — beginner, student, and expert levels. Powered by Claude.",
      tools: [["Replit","#f97316"],["Claude","#cc785c"]],
      likes: 189, comments: 14, rankTier: 3,
    },
    questions: [
      { q: "Replit free tier enough for a school project?", a: 31 },
      { q: "How do you cite an AI-built tool in a paper?", a: 12 },
      { q: "Best prompt for ACT math drills?", a: 44 },
    ],
  },
  teacher: {
    label: "teacher",
    build: {
      name: "Zaineee", handle: "@zaineee", emoji: "\u{1F9D1}‍\u{1F3EB}", age: "2d ago",
      tags: ["WEBSITES","EDUCATION"],
      title: "The EYEBALL — a classroom reading-level checker",
      desc: "Drop in any passage, get 3 scaffolded versions for different reading levels. Teachers are using it for differentiation.",
      tools: [["Claude","#cc785c"],["Lovable","#ec4899"]],
      likes: 276, comments: 31, rankTier: 4,
    },
    questions: [
      { q: "Can I get students to cite AI correctly?", a: 19 },
      { q: "Best tool to detect AI-generated essays?", a: 53 },
      { q: "How do other teachers grade AI-assisted work?", a: 28 },
    ],
  },
  founder: {
    label: "founder",
    build: {
      name: "Jack H", handle: "@herz", emoji: "\u{1F680}", age: "3d ago",
      tags: ["APPS","CHATBOTS"],
      title: "Customer-success chatbot trained on our docs in 2 hours",
      desc: "Scraped docs + support transcripts, dropped them into a Claude-backed bot, wired it to Intercom. Free tier covered 300 daily queries.",
      tools: [["Claude","#cc785c"],["Cursor","#6366f1"],["Vercel","#111"]],
      likes: 421, comments: 47, rankTier: 6,
    },
    questions: [
      { q: "Cheapest way to deploy a Claude chatbot?", a: 41 },
      { q: "Rate limits across OpenAI / Anthropic / xAI?", a: 18 },
      { q: "Best model for support-ticket summarization?", a: 25 },
    ],
  },
  developer: {
    label: "developer",
    build: {
      name: "Emily", handle: "@emythedev", emoji: "\u{1F9D1}‍\u{1F4BB}", age: "6d ago",
      tags: ["APPS","RESEARCH"],
      title: "Vibe Coding 101 — a starter kit for Claude Code",
      desc: "My 6-prompt starter I use every time I open Claude Code. Cuts boilerplate time in half. Comments welcome.",
      tools: [["Claude Code","#ec4899"],["Cursor","#6366f1"],["Replit","#f97316"]],
      likes: 812, comments: 94, rankTier: 7,
    },
    questions: [
      { q: "Cursor vs Claude Code for refactors?", a: 67 },
      { q: "Best prompt to get Claude to write tests?", a: 38 },
      { q: "How do you handle huge context windows?", a: 14 },
    ],
  },
  designer: {
    label: "designer",
    build: {
      name: "Maya Chen", handle: "@maya_makes", emoji: "\u{1F3A8}", age: "5h ago",
      tags: ["IMAGES","DESIGN"],
      title: "Portrait studies in rainy Kyoto — a Midjourney v6 prompt I reuse",
      desc: "My base prompt + 4 variations. Works great for character sheets and mood boards.",
      tools: [["Midjourney","#fff"],["DALL·E","#D4A017"]],
      likes: 540, comments: 38, rankTier: 5,
    },
    questions: [
      { q: "MJ v6 vs v5 for consistent characters?", a: 22 },
      { q: "Getting Flux to look less AI-generated?", a: 17 },
      { q: "Best tool for image-to-image at scale?", a: 9 },
    ],
  },
  parent: {
    label: "parent",
    build: {
      name: "Dana", handle: "@dana_irl", emoji: "\u{1F9F8}", age: "1d ago",
      tags: ["APPS","FAMILY"],
      title: "A bedtime-story generator my 6-yr-old actually asks for",
      desc: "Picks a character, a problem, and a lesson. Claude writes it, ElevenLabs reads it. 4 minutes end to end.",
      tools: [["Claude","#cc785c"],["ElevenLabs","#D4A017"]],
      likes: 198, comments: 22, rankTier: 4,
    },
    questions: [
      { q: "Safest AI chatbot for kids doing homework?", a: 51 },
      { q: "Is Khanmigo worth it?", a: 29 },
      { q: "Screen-time limits for AI tutors?", a: 12 },
    ],
  },
  writer: {
    label: "writer",
    build: {
      name: "Sam Rivers", handle: "@samrivers", emoji: "✍️", age: "8h ago",
      tags: ["APPS","WRITING"],
      title: "A critique partner that actually disagrees with me",
      desc: "System prompt forces Claude to push back on clichés and vague sentences. Makes my drafts 2× tighter.",
      tools: [["Claude","#cc785c"],["ChatGPT","#10a37f"]],
      likes: 312, comments: 41, rankTier: 5,
    },
    questions: [
      { q: "Best model for narrative voice consistency?", a: 18 },
      { q: "AI that handles 30k-word manuscripts?", a: 24 },
      { q: "Ghost-editing: model recommendations?", a: 11 },
    ],
  },
};

const FIELD_ORDER = ["marketer","student","teacher","founder","developer","designer","parent","writer"];

const COMMUNITIES = [
  { badge: "\u{1FAA9}", members: 101284, name: "Vibe Coding 101", desc: "Ship a working app by describing it in English. Replit, Lovable, Base44, and Emergent.", stats: ["4,218 builds", "921 questions"], tone: "#FFD700" },
  { badge: "\u{1F393}", members: 34580,  name: "Teachers Using AI", desc: "Differentiation, grading, prompt libraries. Free lesson plans swapped daily.", stats: ["1,104 builds", "2,890 questions"], tone: "#76F7FF" },
  { badge: "\u{1F4DD}", members: 52718,  name: "Resume & Interviews", desc: "Tailored resumes, cover letters, interview drills. Real feedback on what actually landed offers.", stats: ["2,840 builds", "3,102 questions"], tone: "#6FCF97" },
  { badge: "\u{1F4DA}", members: 38104,  name: "Study Hacks", desc: "Flashcards, study guides, drills. The prompts that make hard material stick — K–12 through certifications.", stats: ["1,520 builds", "2,640 questions"], tone: "#D9A8FF" },
  { badge: "\u{1F3AC}", members: 47203,  name: "Content Creators", desc: "Scripts, thumbnails, hooks. The workflow people use to ship more without sounding like a bot.", stats: ["2,960 builds", "1,180 questions"], tone: "#FF8FB1" },
  { badge: "\u{1F4BC}", members: 28401,  name: "Solo Founders", desc: "One-person companies shipping with AI. Tools, costs, and survival posts.", stats: ["1,890 builds", "980 questions"], tone: "#E8A854" },
];

const TOOL_BUTTONS = [
  ["ChatGPT","#10a37f"], ["Claude","#cc785c"], ["Claude Code","#ec4899"],
  ["Replit","#f97316"], ["Lovable","#ec4899"], ["Base44","#3b82f6"],
  ["Grok","#000"], ["Cursor","#6366f1"], ["Vercel","#000"],
  ["Gemini","#4285F4"], ["DeepSeek","#4D6BFE"], ["Devin","#C9A876"],
];

const COMPARE_ROWS = [
  { name: "Claude", color: "#cc785c", code: 96, ui: 94, rating: 4.9 },
  { name: "Lovable", color: "#ec4899", code: 87, ui: 92, rating: 4.7 },
  { name: "Replit", color: "#f97316", code: 88, ui: 72, rating: 4.6 },
  { name: "Base44", color: "#3b82f6", code: 72, ui: 78, rating: 4.1 },
];

const PILLARS = [
  { key: "builds",      title: "Builds",      desc: "Full AI projects people shipped — with the tools, steps, and demos attached. Apps, chatbots, sites, study guides.", tone: "#FFD700" },
  { key: "discussion",  title: "Discussion",  desc: "Long-form posts and threads on what’s changing in AI. Reviews, deep-dives, and war stories from real builds.", tone: "#76F7FF" },
  { key: "questions",   title: "Questions",   desc: "Ask anything. Beginner or expert. Real humans answer — not a wiki. Voted by usefulness, indexed by tool and topic.", tone: "#6FCF97" },
  { key: "communities", title: "Communities", desc: "Niche corners for the work you actually do — Vibe Coding 101, Teachers Using AI, Study Hacks, Resume & Interviews.", tone: "#D9A8FF" },
];

const RANKS = [
  { num: "01", name: "Newbie",      perks: "Just getting started. Welcome!",                            pts: "0 pts" },
  { num: "02", name: "Tinkerer",    perks: "Ask questions, comment, save builds.",                     pts: "100 pts" },
  { num: "03", name: "Builder",     perks: "Post builds, run workflows, join any community.",         pts: "500 pts" },
  { num: "04", name: "Craftsman",   perks: "Recognized contributor. Unlocks advanced features.",      pts: "1,000 pts" },
  { num: "05", name: "Architect",   perks: "Featured on Builds of the Day.",                          pts: "2,500 pts" },
  { num: "06", name: "Innovator",   perks: "Top-tier builder. Community leader.",                     pts: "5,000 pts" },
  { num: "07", name: "Visionary",   perks: "Start Communities · early tool access.",              pts: "7,500 pts" },
  { num: "08", name: "Grandmaster", perks: "Elite status. Shape the platform.",                       pts: "15,000 pts" },
  { num: "09", name: "Legend",      perks: "The highest rank. Permanent recognition.",                pts: "30,000 pts" },
];

// ── Motion primitives ──

// Scroll-reveal wrapper — fades + lifts content as it enters the viewport.
function Reveal({ children, delay = 0, y = 16, className, style }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-8% 0px' });
  const reduce = useReducedMotion();
  if (reduce) {
    return <div ref={ref} className={className} style={style}>{children}</div>;
  }
  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.55, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// Animated number counter — counts up once when in view.
function CountUp({ value, duration = 1.6 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState('0');
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!inView) return;
    if (reduce) { setDisplay(Math.round(value).toLocaleString()); return; }
    const controls = animate(mv, value, {
      duration,
      ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (v) => setDisplay(Math.round(v).toLocaleString()),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce, mv]);
  return <span ref={ref}>{display}</span>;
}

// Mouse-tracked spotlight inside an element.
function useSpotlight() {
  const ref = useRef(null);
  const onMouseMove = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }, []);
  return { ref, onMouseMove };
}

// ── Sub-components ──

const HeartGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);
const CommentGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const QuestionGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const BookmarkGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

function PillarIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "builds") return (
    <svg {...common}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
  );
  if (name === "discussion") return (
    <svg {...common}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
  );
  if (name === "questions") return (
    <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
  );
  if (name === "communities") return (
    <svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  );
  return null;
}

function BuildCard({ build }) {
  const primaryCategory = build.tags?.[0] || null;
  const rankBadge = BADGE_TIERS[Math.max(0, (build.rankTier ?? 3) - 1)];
  const handle = build.handle.startsWith("@") ? build.handle : "@" + build.handle;
  return (
    <div className="lp-post-card">
      <div className="lp-post-header">
        <div className="lp-post-author-section">
          <div className="lp-post-avatar">{build.emoji}</div>
          <div className="lp-post-author-info">
            <div className="lp-post-author-name">
              <span className="lp-post-author-display">{build.name}</span>
              <span className="lp-post-rank-badge">
                <BadgeSVG badge={rankBadge} size={22} />
              </span>
            </div>
            <div className="lp-post-timestamp">{handle} · {build.age}</div>
          </div>
        </div>
        {primaryCategory && (
          <span className="lp-post-category">{primaryCategory}</span>
        )}
      </div>
      <div className="lp-post-title">{build.title}</div>
      <div className="lp-post-desc">{build.desc}</div>
      <div className="lp-tools-row">
        <span className="lp-built-with-label">Built with</span>
        {build.tools.map(([n, c]) => (
          <span key={n} className="lp-tool-chip">
            <span className="lp-tool-dot" style={{ background: c }} />{n}
          </span>
        ))}
      </div>
      <div className="lp-post-actions">
        <button className="lp-post-action lp-post-action-like" type="button">
          <HeartGlyph /><span>{build.likes}</span>
        </button>
        <button className="lp-post-action" type="button">
          <CommentGlyph /><span>{build.comments}</span>
        </button>
        <button className="lp-post-action" type="button">
          <QuestionGlyph /><span>Ask</span>
        </button>
        <div className="lp-post-actions-right">
          <button className="lp-post-action" type="button">
            <BookmarkGlyph /><span>Save</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldPicker() {
  const [activeField, setActiveField] = useState('marketer');
  const field = FIELDS[activeField];
  const spot = useSpotlight();

  return (
    <div className="lp-field-picker" ref={spot.ref} onMouseMove={spot.onMouseMove}>
      <div className="lp-field-picker-glow" aria-hidden="true" />
      <div className="lp-picker-label">Show me what&apos;s working for a <strong>{field.label}</strong>.</div>
      <div className="lp-chips">
        {FIELD_ORDER.map(k => (
          <button
            key={k}
            className={`lp-chip ${activeField === k ? 'active' : ''}`}
            onClick={() => setActiveField(k)}
          >
            {FIELDS[k].label.charAt(0).toUpperCase() + FIELDS[k].label.slice(1)}
          </button>
        ))}
      </div>
      <motion.div
        key={activeField}
        className="lp-picker-panel"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
      >
        <BuildCard build={field.build} />
        <div className="lp-side-panel">
          <div className="lp-panel">
            <h4>Tools they&apos;re using <span className="lp-count">{field.build.tools.length} in this build</span></h4>
            <div className="lp-tools-row">
              {field.build.tools.map(([n, c]) => (
                <span key={n} className="lp-tool-chip">
                  <span className="lp-tool-dot" style={{ background: c }} />{n}
                </span>
              ))}
            </div>
          </div>
          <div className="lp-panel">
            <h4>Questions from this world <span className="lp-count">today</span></h4>
            {field.questions.map((q, i) => (
              <div key={i} className="lp-panel-row">
                <span className={`lp-rank ${i === 0 ? 'top' : ''}`}>{i + 1}</span>
                <span className="lp-q">{q.q}</span>
                <span className="lp-ans">{q.a} answers</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function CompareTable() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  return (
    <div className="lp-compare" ref={ref}>
      <div className="lp-compare-context">Building a web app</div>
      <div className="lp-compare-head">
        <div />
        <div className="lp-h-hide">Ships code</div>
        <div className="lp-h-hide">Complex UI</div>
        <div className="lp-h-hide">Rating</div>
      </div>
      {COMPARE_ROWS.map((row, i) => (
        <div key={row.name} className="lp-compare-row">
          <div className="lp-compare-tool">
            <span className="lp-tool-dot" style={{ background: row.color, width: 10, height: 10, borderRadius: '50%' }} />
            {row.name}
          </div>
          <div className="lp-bar-wrap lp-r-hide">
            <div className="lp-bar">
              <motion.div
                className="lp-bar-fill"
                initial={{ width: 0 }}
                animate={inView ? { width: `${row.code}%` } : { width: 0 }}
                transition={{ duration: 0.9, delay: 0.1 + i * 0.08, ease: [0.2, 0.7, 0.2, 1] }}
                style={{ background: row.code > 85 ? 'linear-gradient(90deg, #22c55e, #84cc16)' : '#84cc16' }}
              />
            </div>
          </div>
          <div className="lp-bar-wrap lp-r-hide">
            <div className="lp-bar">
              <motion.div
                className="lp-bar-fill"
                initial={{ width: 0 }}
                animate={inView ? { width: `${row.ui}%` } : { width: 0 }}
                transition={{ duration: 0.9, delay: 0.18 + i * 0.08, ease: [0.2, 0.7, 0.2, 1] }}
                style={{ background: row.ui > 85 ? '#22c55e' : '#eab308' }}
              />
            </div>
          </div>
          <div className="lp-bar-wrap">
            <div className="lp-bar">
              <motion.div
                className="lp-bar-fill"
                initial={{ width: 0 }}
                animate={inView ? { width: `${(row.rating / 5) * 100}%` } : { width: 0 }}
                transition={{ duration: 0.9, delay: 0.26 + i * 0.08, ease: [0.2, 0.7, 0.2, 1] }}
                style={{ background: 'linear-gradient(90deg, #D4A017, #FFD700)' }}
              />
            </div>
            <div className="lp-score">{row.rating}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CommunityCard({ c, idx }) {
  const spot = useSpotlight();
  return (
    <Reveal delay={idx * 0.05}>
      <div
        className="lp-community"
        ref={spot.ref}
        onMouseMove={spot.onMouseMove}
        style={{ ['--community-tone']: c.tone }}
      >
        <div className="lp-community-glow" aria-hidden="true" />
        <div className="lp-community-head">
          <span className="lp-community-emoji">{c.badge}</span>
          <span className="lp-community-members">
            <CountUp value={c.members} /> members
          </span>
        </div>
        <h4>{c.name}</h4>
        <p>{c.desc}</p>
        <div className="lp-community-stats">{c.stats.map(s => <span key={s}>{s}</span>)}</div>
      </div>
    </Reveal>
  );
}

function PillarCard({ p, idx, onPillarClick }) {
  const spot = useSpotlight();
  return (
    <Reveal delay={idx * 0.06}>
      <div
        ref={spot.ref}
        onMouseMove={spot.onMouseMove}
        className="lp-pillar"
        style={{ ['--pillar-tone']: p.tone }}
        role="button"
        tabIndex={0}
        onClick={() => onPillarClick && onPillarClick(p.key)}
        onKeyDown={(e) => {
          if (onPillarClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onPillarClick(p.key);
          }
        }}
      >
        <div className="lp-pillar-glow" aria-hidden="true" />
        <span className="lp-pillar-icon" aria-hidden="true">
          <PillarIcon name={p.key} />
        </span>
        <h3>{p.title}</h3>
        <p>{p.desc}</p>
        <span className="lp-pillar-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </span>
      </div>
    </Reveal>
  );
}

// ── Main LandingPage ──

export default function LandingPage({ onLogin, onSignup, onStartExploring, onSeeTrending, onPillarClick, onFooterLink }) {
  const scrollTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const handleStartExploring = onStartExploring || onSignup;
  const handleSeeTrending = onSeeTrending || (() => scrollTo('lp-builds'));

  return (
    <div className="lp-root">
      <style>{landingStyles}</style>

      {/* NAV */}
      <nav className="lp-nav">
        <div className="lp-wrap">
          <a href="#" className="lp-brand">
            <img src="/logo-icon.svg" alt="" className="lp-brand-icon" />
            Prompted
          </a>
          <div className="lp-nav-sections">
            <a onClick={() => scrollTo('lp-tools')}>Tools</a>
            <a onClick={() => scrollTo('lp-builds')}>What&apos;s on Prompted</a>
            <a onClick={() => scrollTo('lp-communities')}>Communities</a>
            <a onClick={() => scrollTo('lp-rank')}>Builder Rank</a>
          </div>
          <div className="lp-nav-cta">
            <button className="lp-btn lp-btn-ghost" onClick={onLogin}>Log in</button>
            <button className="lp-btn lp-btn-primary" onClick={onSignup}>Join free</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-wrap">
          <Reveal delay={0.05}>
            <div className="lp-hero-eyebrow">
              <span className="lp-live-dot" />
              <span>Live community</span>
              <span className="lp-eyebrow-sep">·</span>
              <span><CountUp value={104287} /> builders shipping today</span>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <h1 className="lp-hero-title">
              The social hub for <em>everyone&nbsp;learning&nbsp;AI</em>.
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="lp-hero-sub">
              Prompted is where builders, students, teachers, founders, and curious beginners share the AI tools they&apos;re actually using, the projects they&apos;ve shipped, and the questions they&apos;re still working through. Scroll to see what&apos;s working, try it yourself, and post what you build.
            </p>
          </Reveal>
          <Reveal delay={0.28}>
            <div className="lp-hero-ctas">
              <button className="lp-cta-hero lp-cta-hero-primary" onClick={handleStartExploring}>
                <span>Start exploring</span>
                <span className="lp-cta-hero-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </span>
              </button>
              <button className="lp-cta-hero lp-cta-hero-secondary" onClick={handleSeeTrending}>
                <span className="lp-cta-hero-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                </span>
                <span>See what&apos;s trending</span>
              </button>
            </div>
          </Reveal>
          <Reveal delay={0.36}>
            <div className="lp-hero-meta">
              <span><strong>Free</strong> to join</span>
              <span className="lp-meta-sep" />
              <span>No AI experience required</span>
              <span className="lp-meta-sep" />
              <span>Builder Rank on signup</span>
            </div>
          </Reveal>
          <Reveal delay={0.44}>
            <FieldPicker />
          </Reveal>
        </div>
      </section>

      {/* TOOLS / COMPARE */}
      <section className="lp-band" id="lp-tools">
        <div className="lp-wrap">
          <Reveal>
            <div className="lp-section-lead">
              <div className="lp-eyebrow-tag"><span className="lp-eyebrow-dot" />Browse by tool</div>
              <h2>Every tool. <em>What it&rsquo;s actually good at.</em></h2>
              <p>Posts on Prompted are tagged with the tools that built them. Filter the feed by tool, see which one a community prefers for what, and compare the ones you&apos;re deciding between.</p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="lp-tools-strip">
              {TOOL_BUTTONS.map(([name, color]) => (
                <button key={name} className="lp-tool-btn" style={{ ['--tool-color']: color }}>
                  <span className="lp-tool-dot" style={{ background: color, border: color === '#000' ? '1px solid #555' : 'none' }} />{name}
                </button>
              ))}
              <span className="lp-tool-btn lp-tool-more" style={{ cursor: 'default' }}>+ 114 more</span>
            </div>
          </Reveal>
          <Reveal delay={0.18}>
            <CompareTable />
          </Reveal>
        </div>
      </section>

      {/* COMMUNITIES */}
      <section className="lp-band" id="lp-communities">
        <div className="lp-wrap">
          <Reveal>
            <div className="lp-section-lead">
              <div className="lp-eyebrow-tag"><span className="lp-eyebrow-dot" />Communities</div>
              <h2>Find <em>your people</em>. See what works for your world.</h2>
              <p>Niche communities inside Prompted. Where the tools, questions, and builds are specific to the work you actually do. Jump into one, lurk, or start one for something you don&apos;t see.</p>
            </div>
          </Reveal>
          <div className="lp-communities">
            {COMMUNITIES.map((c, i) => (
              <CommunityCard key={c.name} c={c} idx={i} />
            ))}
          </div>
        </div>
      </section>

      {/* FOUR PILLARS */}
      <section className="lp-band" id="lp-builds">
        <div className="lp-wrap">
          <Reveal>
            <div className="lp-section-lead">
              <div className="lp-eyebrow-tag"><span className="lp-eyebrow-dot" />What lives on Prompted</div>
              <h2>Four layers. One community <em>figuring out AI</em> together.</h2>
              <p>Not just prompts. Prompted is a full community layer &mdash; the builds people ship, the discussions they have, the questions they ask, and the tools they swear by.</p>
            </div>
          </Reveal>
          <div className="lp-pillars">
            {PILLARS.map((p, i) => (
              <PillarCard key={p.title} p={p} idx={i} onPillarClick={onPillarClick} />
            ))}
          </div>
        </div>
      </section>

      {/* BUILDER RANK */}
      <section className="lp-band" id="lp-rank">
        <div className="lp-wrap">
          <Reveal>
            <div className="lp-section-lead">
              <div className="lp-eyebrow-tag"><span className="lp-eyebrow-dot" />Builder Rank</div>
              <h2>Post what you tried. <em>Earn your rank.</em></h2>
              <p>Every build you share, question you answer, or discussion you start moves your Builder Rank. Higher ranks unlock featured slots in Builds of the Day, early access to new tools, and the occasional invite.</p>
            </div>
          </Reveal>
          <div className="lp-rank-band">
            <Reveal>
              <div className="lp-rank-ladder">
                {RANKS.map((r, i) => (
                  <motion.div
                    key={r.num}
                    className="lp-rank-row"
                    initial={{ opacity: 0, x: -12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-5% 0px' }}
                    transition={{ duration: 0.4, delay: i * 0.04, ease: [0.2, 0.7, 0.2, 1] }}
                  >
                    <div className="lp-rank-badge">
                      <BadgeSVG badge={BADGE_TIERS[i]} size={44} />
                    </div>
                    <div className="lp-rank-info">
                      <div className="lp-rank-level">{r.name}</div>
                      <div className="lp-rank-perks">{r.perks}</div>
                    </div>
                    <div className="lp-rank-pts">{r.pts}</div>
                  </motion.div>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div>
                <h3 className="lp-rank-headline">You&rsquo;re here to figure something out. <em>We reward that.</em></h3>
                <p className="lp-rank-body">Answer a question and someone less experienced than you gets unstuck. Post a build, and the tool you used gets better context on what it&apos;s good at. Ask a question, and that question becomes the next person&apos;s search result.</p>
                <p className="lp-rank-body" style={{ marginTop: 0 }}>The community compounds.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-cta-band">
        <div className="lp-wrap">
          <Reveal>
            <h2 className="lp-cta-title">Come see <em>what&rsquo;s working.</em></h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="lp-cta-sub">Free to join. No AI experience required.</p>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="lp-cta-actions">
              <button className="lp-btn lp-btn-primary lp-cta-btn" onClick={onSignup}>Join free</button>
              <button className="lp-btn lp-btn-secondary lp-cta-btn" onClick={onLogin}>Browse as guest</button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <a href="#" className="lp-brand lp-footer-brand" onClick={(e) => e.preventDefault()}>
            <img src="/logo-icon.svg" alt="" className="lp-brand-icon" />
            Prompted
          </a>
          <nav className="lp-footer-links">
            <a href="#" onClick={(e) => { e.preventDefault(); onFooterLink && onFooterLink('about'); }}>About</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onFooterLink && onFooterLink('privacy'); }}>Privacy</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onFooterLink && onFooterLink('terms'); }}>Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// ── Scoped styles (all prefixed with lp-) ──
const landingStyles = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Space+Grotesk:wght@500;600;700&display=swap');

.lp-root {
  --bg-primary: #050505;
  --bg-secondary: #0a0a0b;
  --bg-card: #0e0e10;
  --bg-card-hover: #15151a;
  --bg-tertiary: #131316;
  --bg-glass: rgba(255,255,255,0.025);
  --text-primary: #ffffff;
  --text-secondary: #e4e4e7;
  --text-tertiary: #a1a1aa;
  --text-muted: #71717a;
  --text-dim: #52525b;
  --border-color: rgba(255,255,255,0.06);
  --border-hover: rgba(255,255,255,0.20);
  --border-strong: rgba(255,255,255,0.12);
  --accent-gold: #FFD700;
  --accent-gold-soft: rgba(255,215,0,0.18);
  --shadow-card: 0 1px 2px rgba(0,0,0,0.4), 0 10px 28px -10px rgba(0,0,0,0.5), 0 24px 56px -24px rgba(0,0,0,0.7);
  --shadow-card-hover: 0 1px 2px rgba(0,0,0,0.4), 0 20px 40px -12px rgba(0,0,0,0.55), 0 40px 80px -24px rgba(0,0,0,0.8), inset 0 1px 0 0 rgba(255,255,255,0.05);
  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-display: 'Instrument Serif', 'Times New Roman', Georgia, serif;
  --font-accent: 'Fraunces', 'Instrument Serif', Georgia, serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  font-feature-settings: 'cv02','cv03','cv04','cv11';

  margin: 0;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
  min-height: 100vh;
  position: relative;
}
.lp-root *, .lp-root *::before, .lp-root *::after { box-sizing: border-box; }
.lp-root a { text-decoration: none; color: inherit; cursor: pointer; }
.lp-root button { font-family: inherit; }
.lp-root ::selection { background: rgba(255,215,0,0.35); color: #fff; }
.lp-wrap { max-width: 1200px; margin: 0 auto; padding: 0 28px; position: relative; }

/* Nav */
.lp-nav { position: sticky; top: 0; z-index: 50; background: transparent; }
.lp-nav .lp-wrap { max-width: none; padding: 0 44px; display: flex; align-items: center; height: 76px; gap: 40px; }
.lp-brand { display: flex; align-items: center; gap: 12px; font-family: 'Space Grotesk', var(--font-sans); font-weight: 700; font-size: 24px; letter-spacing: -0.02em; flex-shrink: 0; color: var(--text-primary); transition: opacity .2s ease; }
.lp-brand:hover { opacity: 0.85; }
.lp-brand-icon { width: 28px; height: 28px; }
.lp-nav-sections { display: flex; gap: 36px; margin: 0 auto; }
.lp-nav-sections a { color: var(--text-tertiary); font-size: 15.5px; font-weight: 500; padding: 8px 2px; letter-spacing: -0.005em; transition: color .35s cubic-bezier(.22,.61,.36,1); }
.lp-nav-sections a:hover { color: var(--text-primary); }
@media (max-width: 960px) { .lp-nav-sections { display: none; } .lp-nav .lp-wrap { padding: 0 20px; height: 64px; gap: 16px; } .lp-brand { font-size: 22px; } .lp-brand-icon { width: 24px; height: 24px; } }
.lp-nav-cta { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.lp-nav-cta .lp-btn { padding: 10px 20px; font-size: 15px; }
.lp-nav-cta .lp-btn-ghost { color: var(--text-secondary); border-radius: 999px; }
.lp-nav-cta .lp-btn-ghost:hover { color: var(--text-primary); background: rgba(255,255,255,0.06); }
.lp-nav-cta .lp-btn-primary { padding: 10px 22px; border-radius: 999px; font-size: 15px; }

/* Buttons */
.lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid transparent; border-radius: 999px; font-weight: 600; font-size: 14px; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, background-color .18s ease, color .18s ease, border-color .18s ease; padding: 10px 18px; letter-spacing: -0.005em; }
.lp-btn-primary { background: #fff; color: #0a0a0a; box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.4), 0 6px 14px -4px rgba(255,255,255,0.18); }
.lp-btn-primary:hover { transform: translateY(-1px); box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.4), 0 12px 28px -6px rgba(255,215,0,0.28), 0 8px 20px -4px rgba(255,255,255,0.16); }
.lp-btn-secondary { background: var(--bg-card); color: var(--text-primary); border-color: var(--border-strong); }
.lp-btn-secondary:hover { border-color: var(--border-hover); background: var(--bg-card-hover); }
.lp-btn-ghost { background: transparent; color: var(--text-secondary); }
.lp-btn-ghost:hover { color: var(--text-primary); }

/* Hero */
.lp-hero { padding: 40px 0 80px; position: relative; isolation: isolate; }
.lp-hero-wrap { position: relative; z-index: 2; }

.lp-hero-eyebrow { display: inline-flex; align-items: center; gap: 10px; padding: 7px 14px 7px 12px; border-radius: 999px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); font-size: 12.5px; color: var(--text-tertiary); font-weight: 500; margin-bottom: 28px; }
.lp-eyebrow-sep { color: var(--text-dim); }
.lp-live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; position: relative; box-shadow: 0 0 10px rgba(34,197,94,0.55); flex-shrink: 0; }
.lp-live-dot::after { content: ''; position: absolute; inset: -3px; border-radius: 50%; background: rgba(34,197,94,0.35); animation: lp-pulse 3.6s ease-out infinite; }
@keyframes lp-pulse { 0% { transform: scale(.7); opacity: .55; } 100% { transform: scale(2); opacity: 0; } }

.lp-hero-title { font-family: var(--font-display); font-weight: 400; font-size: clamp(48px, 7.4vw, 96px); line-height: 1.02; letter-spacing: -0.018em; margin: 0 0 28px; max-width: 18ch; color: var(--text-primary); }
.lp-hero-title em { font-family: var(--font-accent); font-style: normal; font-weight: 400; letter-spacing: -0.012em; padding-right: 0.02em; background: linear-gradient(135deg, #F5C518 0%, #E0A815 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.lp-hero-sub { font-size: 19px; line-height: 1.55; color: var(--text-tertiary); max-width: 640px; margin: 0 0 36px; }
.lp-hero-ctas { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
.lp-cta-hero { position: relative; display: inline-flex; align-items: center; gap: 10px; border: 1px solid transparent; border-radius: 999px; padding: 14px 28px; font-family: inherit; font-size: 15px; font-weight: 600; letter-spacing: -0.005em; cursor: pointer; overflow: hidden; transition: transform .22s cubic-bezier(.2,.7,.2,1), box-shadow .22s cubic-bezier(.2,.7,.2,1), border-color .2s ease, background-color .2s ease; will-change: transform; isolation: isolate; }
.lp-cta-hero:active { transform: translateY(1px) scale(.99); transition-duration: .08s; }
.lp-cta-hero-icon { display: inline-flex; align-items: center; flex-shrink: 0; transition: transform .25s cubic-bezier(.2,.7,.2,1); }
.lp-cta-hero-icon svg { width: 16px; height: 16px; }
.lp-cta-hero-primary { background: linear-gradient(180deg, #ffffff 0%, #f4f4f5 100%); color: #0a0a0a; box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.6), 0 10px 24px -8px rgba(255,215,0,0.35), 0 4px 12px rgba(0,0,0,0.3); }
.lp-cta-hero-primary:hover { transform: translateY(-2px); box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.6), 0 22px 44px -10px rgba(255,215,0,0.5), 0 10px 22px rgba(0,0,0,0.4); }
.lp-cta-hero-primary::before { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,215,0,0.42) 50%, transparent 70%); transform: translateX(-120%); transition: transform .7s cubic-bezier(.2,.7,.2,1); pointer-events: none; }
.lp-cta-hero-primary:hover::before { transform: translateX(120%); }
.lp-cta-hero-primary:hover .lp-cta-hero-icon { transform: translateX(4px); }
.lp-cta-hero-secondary { background: rgba(255,255,255,0.04); color: var(--text-primary); border-color: var(--border-strong); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.lp-cta-hero-secondary:hover { border-color: rgba(255,215,0,0.45); background: rgba(255,255,255,0.07); transform: translateY(-2px); box-shadow: 0 14px 28px -10px rgba(0,0,0,0.5); }
.lp-cta-hero-secondary:hover .lp-cta-hero-icon { transform: translateY(-2px); }
@media (prefers-reduced-motion: reduce) {
  .lp-cta-hero, .lp-cta-hero-icon, .lp-cta-hero-primary::before { transition: none; animation: none; }
  .lp-cta-hero:hover { transform: none; }
  .lp-cta-hero-primary:hover::before { transform: translateX(-120%); }
  .lp-cta-hero-primary:hover .lp-cta-hero-icon, .lp-cta-hero-secondary:hover .lp-cta-hero-icon { transform: none; }
}
.lp-hero-meta { display: flex; gap: 16px; margin-top: 36px; font-size: 13px; color: var(--text-muted); flex-wrap: wrap; align-items: center; }
.lp-hero-meta strong { color: var(--text-secondary); font-weight: 600; }
.lp-meta-sep { width: 3px; height: 3px; border-radius: 50%; background: var(--text-dim); display: inline-block; }

/* Field picker — glass card */
.lp-field-picker { margin-top: 72px; padding: 28px; background: linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.015) 100%); border: 1px solid var(--border-color); border-radius: 24px; position: relative; overflow: hidden; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: var(--shadow-card); }
.lp-field-picker-glow { position: absolute; pointer-events: none; inset: 0; background: radial-gradient(360px circle at var(--mx, 50%) var(--my, 50%), rgba(255,215,0,0.08), transparent 60%); opacity: 0; transition: opacity .3s ease; }
.lp-field-picker:hover .lp-field-picker-glow { opacity: 1; }
.lp-picker-label { font-size: 13px; color: var(--text-muted); margin-bottom: 16px; position: relative; }
.lp-picker-label strong { color: var(--text-secondary); font-weight: 600; }
.lp-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 22px; position: relative; }
.lp-chip { padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,0.03); color: var(--text-secondary); border: 1px solid var(--border-color); font-size: 13px; font-weight: 500; cursor: pointer; transition: all .18s ease; font-family: inherit; }
.lp-chip:hover { border-color: var(--border-hover); color: var(--text-primary); background: rgba(255,255,255,0.06); }
.lp-chip.active { background: #fff; color: #0a0a0a; border-color: #fff; font-weight: 600; box-shadow: 0 4px 14px rgba(255,255,255,0.18); }
.lp-picker-panel { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; position: relative; }
@media (max-width: 860px) { .lp-picker-panel { grid-template-columns: 1fr; } }

/* Post card */
.lp-post-card { background: rgba(10,10,12,0.7); border: 1px solid var(--border-color); border-radius: 16px; padding: 18px 20px 14px; position: relative; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }

.lp-post-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.lp-post-author-section { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1 1 auto; }
.lp-post-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 22px; border: 2px solid var(--border-color); flex-shrink: 0; overflow: hidden; line-height: 1; }
.lp-post-author-info { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.lp-post-author-name { font-weight: 600; font-size: 15px; color: var(--text-primary); display: flex; align-items: center; gap: 6px; line-height: 1.2; }
.lp-post-author-display { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-post-rank-badge { display: inline-flex; align-items: center; flex-shrink: 0; }
.lp-post-timestamp { font-size: 12.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-post-category { background: #000; color: #fff; padding: 5px 12px; border-radius: 999px; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; border: 1px solid var(--border-color); flex-shrink: 0; }

.lp-post-title { font-family: var(--font-display); font-size: 26px; font-weight: 400; font-style: italic; line-height: 1.15; color: var(--text-primary); margin: 6px 0 10px; letter-spacing: -0.015em; }
.lp-post-desc { color: #D4AF37; font-size: 14px; line-height: 1.55; margin: 0 0 12px; }

.lp-tools-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
.lp-tool-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border-radius: 999px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); font-size: 11.5px; color: var(--text-secondary); font-weight: 500; }
.lp-tool-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.lp-built-with-label { font-size: 10.5px; color: var(--text-muted); margin-right: 4px; align-self: center; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }

.lp-post-actions { display: flex; align-items: center; gap: 6px; padding-top: 6px; }
.lp-post-action { display: inline-flex; align-items: center; gap: 5px; color: var(--text-muted); font-size: 12.5px; font-weight: 500; background: none; border: none; cursor: pointer; padding: 6px 8px; border-radius: 8px; transition: color .15s ease, background .15s ease; font-family: inherit; }
.lp-post-action:hover { color: var(--text-secondary); background: rgba(255,255,255,0.04); }
.lp-post-action svg { width: 16px; height: 16px; }
.lp-post-action-like { color: #c41e3a; }
.lp-post-actions-right { margin-left: auto; display: flex; align-items: center; gap: 4px; }

/* Side panel */
.lp-side-panel { display: flex; flex-direction: column; gap: 14px; }
.lp-panel { background: rgba(10,10,12,0.7); border: 1px solid var(--border-color); border-radius: 16px; padding: 16px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.lp-panel h4 { margin: 0 0 10px; font-size: 13px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; justify-content: space-between; letter-spacing: -0.005em; }
.lp-count { font-size: 10.5px; color: var(--text-muted); font-weight: 500; }
.lp-panel-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 12.5px; color: var(--text-secondary); }
.lp-rank { font-family: var(--font-mono); color: var(--text-muted); font-size: 11px; width: 14px; }
.lp-rank.top { color: var(--accent-gold); }
.lp-q { flex: 1; color: var(--text-primary); font-weight: 500; }
.lp-ans { font-size: 11px; color: var(--text-muted); }

/* Sections */
.lp-band { padding: 120px 0; position: relative; }
.lp-band::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.08) 75%, transparent 100%); pointer-events: none; }
.lp-section-lead { max-width: 720px; margin-bottom: 52px; }
.lp-eyebrow-tag { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--text-muted); margin-bottom: 18px; }
.lp-eyebrow-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent-gold); box-shadow: 0 0 8px rgba(255,215,0,0.6); }
.lp-section-lead h2 { font-family: var(--font-display); font-weight: 400; font-size: clamp(36px, 5vw, 64px); line-height: 1.06; letter-spacing: -0.015em; margin: 0 0 18px; color: var(--text-primary); }
.lp-section-lead h2 em { font-family: var(--font-accent); font-style: normal; font-weight: 400; letter-spacing: -0.01em; padding-right: 0.02em; background: linear-gradient(135deg, #F5C518 0%, #E0A815 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.lp-section-lead p { font-size: 17px; color: var(--text-tertiary); line-height: 1.55; margin: 0; max-width: 64ch; }

/* Tools strip */
.lp-tools-strip { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 32px; }
.lp-tool-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 999px; font-size: 13px; font-weight: 500; color: var(--text-secondary); cursor: pointer; transition: all .2s ease; font-family: inherit; position: relative; --tool-color: #fff; }
.lp-tool-btn:hover { border-color: color-mix(in srgb, var(--tool-color) 50%, transparent); color: var(--text-primary); transform: translateY(-2px); box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--tool-color) 45%, transparent); }
.lp-tool-more { color: var(--text-muted) !important; }
.lp-tool-more:hover { transform: none; box-shadow: none; border-color: var(--border-color) !important; color: var(--text-muted) !important; }

/* Compare table */
.lp-compare { margin-top: 40px; background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%); border: 1px solid var(--border-color); border-radius: 20px; overflow: hidden; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: var(--shadow-card); }
.lp-compare-context { padding: 14px 22px; text-align: center; background: rgba(255,255,255,0.015); border-bottom: 1px solid var(--border-color); font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.2em; }
.lp-compare-head { display: grid; grid-template-columns: 200px repeat(3, 1fr); align-items: center; padding: 14px 22px; border-bottom: 1px solid var(--border-color); font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.16em; }
.lp-compare-row { display: grid; grid-template-columns: 200px repeat(3, 1fr); padding: 18px 22px; border-bottom: 1px solid rgba(255,255,255,0.04); align-items: center; transition: background-color .2s ease; }
.lp-compare-row:hover { background: rgba(255,255,255,0.015); }
.lp-compare-row:last-child { border-bottom: none; }
.lp-compare-tool { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 14px; }
.lp-bar-wrap { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-secondary); }
.lp-bar { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.05); flex: 1; overflow: hidden; position: relative; }
.lp-bar-fill { height: 100%; border-radius: 999px; }
.lp-score { width: 40px; font-family: var(--font-mono); font-size: 12px; color: var(--text-primary); text-align: right; }
@media (max-width: 720px) {
  .lp-compare-head, .lp-compare-row { grid-template-columns: 140px 1fr; gap: 8px; padding-left: 16px; padding-right: 16px; }
  .lp-h-hide, .lp-r-hide { display: none; }
}

/* Pillars */
.lp-pillars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
@media (max-width: 980px) { .lp-pillars { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .lp-pillars { grid-template-columns: 1fr; } }
.lp-pillar { position: relative; background: linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.005) 100%); border: 1px solid var(--border-color); border-radius: 20px; padding: 28px 26px; cursor: pointer; overflow: hidden; isolation: isolate; transition: transform .35s cubic-bezier(.2,.7,.2,1), border-color .3s ease, box-shadow .35s ease, background-color .3s ease; will-change: transform; --pillar-tone: #FFD700; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.lp-pillar::before { content: ''; position: absolute; inset: -1px; border-radius: 21px; padding: 1px; background: radial-gradient(circle at 30% 0%, color-mix(in srgb, var(--pillar-tone) 70%, transparent) 0%, transparent 65%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; opacity: 0; transition: opacity .35s ease; pointer-events: none; z-index: 1; }
.lp-pillar::after { content: ''; position: absolute; inset: 0; background: radial-gradient(120% 80% at 50% -20%, color-mix(in srgb, var(--pillar-tone) 16%, transparent) 0%, transparent 55%); opacity: 0; transition: opacity .35s ease; pointer-events: none; z-index: -1; }
.lp-pillar-glow { position: absolute; pointer-events: none; inset: 0; background: radial-gradient(280px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, var(--pillar-tone) 10%, transparent), transparent 60%); opacity: 0; transition: opacity .3s ease; z-index: 0; }
.lp-pillar:hover { transform: translateY(-6px); border-color: color-mix(in srgb, var(--pillar-tone) 55%, transparent); box-shadow: 0 24px 50px -18px color-mix(in srgb, var(--pillar-tone) 45%, transparent), 0 14px 28px rgba(0,0,0,0.4); }
.lp-pillar:focus { outline: none; }
.lp-pillar:focus-visible { outline: none; border-color: var(--pillar-tone); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pillar-tone) 35%, transparent); }
.lp-pillar:hover::before, .lp-pillar:hover::after, .lp-pillar:hover .lp-pillar-glow { opacity: 1; }
.lp-pillar > * { position: relative; z-index: 1; }
.lp-pillar-icon { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 14px; background: color-mix(in srgb, var(--pillar-tone) 14%, transparent); color: var(--pillar-tone); margin-bottom: 20px; transition: transform .4s cubic-bezier(.2,.7,.2,1), background-color .3s ease; border: 1px solid color-mix(in srgb, var(--pillar-tone) 25%, transparent); }
.lp-pillar-icon svg { width: 22px; height: 22px; }
.lp-pillar:hover .lp-pillar-icon { transform: scale(1.1) rotate(-6deg); background: color-mix(in srgb, var(--pillar-tone) 22%, transparent); }
.lp-pillar h3 { font-family: var(--font-display); font-weight: 400; font-size: 30px; line-height: 1.05; margin: 0 0 10px; letter-spacing: -0.015em; }
.lp-pillar p { font-size: 13.5px; color: var(--text-tertiary); line-height: 1.55; margin: 0; padding-right: 28px; }
.lp-pillar-arrow { position: absolute; right: 18px; bottom: 18px; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; color: var(--text-muted); opacity: 0; transform: translateX(-6px); transition: opacity .25s ease, transform .3s cubic-bezier(.2,.7,.2,1), color .2s ease; pointer-events: none; z-index: 2; }
.lp-pillar-arrow svg { width: 16px; height: 16px; }
.lp-pillar:hover .lp-pillar-arrow { opacity: 1; transform: translateX(0); color: var(--pillar-tone); }
@media (prefers-reduced-motion: reduce) { .lp-pillar, .lp-pillar::before, .lp-pillar::after, .lp-pillar-icon, .lp-pillar-arrow { transition: none; } .lp-pillar:hover { transform: none; } .lp-pillar:hover .lp-pillar-icon { transform: none; } .lp-pillar:hover .lp-pillar-arrow { transform: none; } }

/* Communities */
.lp-communities { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 36px; }
@media (max-width: 860px) { .lp-communities { grid-template-columns: 1fr; } }
.lp-community { position: relative; background: linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.005) 100%); border: 1px solid var(--border-color); border-radius: 18px; padding: 22px; cursor: pointer; overflow: hidden; transition: transform .35s cubic-bezier(.2,.7,.2,1), border-color .3s ease, box-shadow .3s ease; --community-tone: #FFD700; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.lp-community-glow { position: absolute; pointer-events: none; inset: 0; background: radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, var(--community-tone) 12%, transparent), transparent 60%); opacity: 0; transition: opacity .3s ease; z-index: 0; }
.lp-community:hover { border-color: color-mix(in srgb, var(--community-tone) 40%, transparent); transform: translateY(-3px); box-shadow: 0 20px 40px -16px color-mix(in srgb, var(--community-tone) 30%, transparent), 0 10px 20px rgba(0,0,0,0.35); }
.lp-community:hover .lp-community-glow { opacity: 1; }
.lp-community > * { position: relative; z-index: 1; }
.lp-community-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
.lp-community-emoji { font-size: 22px; line-height: 1; }
.lp-community-members { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.lp-community h4 { font-family: var(--font-display); font-weight: 400; font-size: 26px; letter-spacing: -0.015em; margin: 0 0 8px; line-height: 1.1; }
.lp-community p { font-size: 13.5px; color: var(--text-tertiary); line-height: 1.5; margin: 0 0 16px; }
.lp-community-stats { display: flex; gap: 14px; font-size: 11.5px; color: var(--text-muted); font-family: var(--font-mono); }

/* Builder Rank */
.lp-rank-band { display: grid; grid-template-columns: 1fr 1.2fr; gap: 44px; align-items: center; }
@media (max-width: 860px) { .lp-rank-band { grid-template-columns: 1fr; } }
.lp-rank-ladder { background: linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.005) 100%); border: 1px solid var(--border-color); border-radius: 20px; padding: 24px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: var(--shadow-card); }
.lp-rank-row { display: flex; align-items: center; gap: 14px; padding: 12px 8px; border-bottom: 1px dashed rgba(255,255,255,0.05); transition: background-color .2s ease; border-radius: 8px; }
.lp-rank-row:hover { background: rgba(255,255,255,0.02); }
.lp-rank-row:last-child { border-bottom: none; }
.lp-rank-badge { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; flex: none; }
.lp-rank-info { flex: 1; }
.lp-rank-level { font-weight: 600; font-size: 14.5px; color: var(--text-primary); letter-spacing: -0.005em; }
.lp-rank-perks { font-size: 12.5px; color: var(--text-tertiary); margin-top: 2px; }
.lp-rank-pts { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }
.lp-rank-headline { font-family: var(--font-display); font-size: clamp(28px, 3.6vw, 42px); margin: 0 0 18px; font-weight: 400; letter-spacing: -0.015em; line-height: 1.1; }
.lp-rank-headline em { font-family: var(--font-accent); font-style: normal; font-weight: 400; letter-spacing: -0.01em; padding-right: 0.02em; background: linear-gradient(135deg, #F5C518 0%, #E0A815 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.lp-rank-body { font-size: 16px; line-height: 1.6; color: var(--text-tertiary); margin-bottom: 18px; }

/* Final CTA */
.lp-cta-band { padding: 140px 0 148px; text-align: center; position: relative; overflow: hidden; isolation: isolate; }
.lp-cta-band::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.08) 75%, transparent 100%); pointer-events: none; }
.lp-cta-title { font-family: var(--font-display); font-weight: 400; font-size: clamp(44px, 5.6vw, 72px); line-height: 1.06; letter-spacing: -0.018em; margin: 0 0 20px; color: var(--text-primary); }
.lp-cta-title em { font-family: var(--font-accent); font-style: normal; font-weight: 400; letter-spacing: -0.01em; padding-right: 0.02em; background: linear-gradient(135deg, #F5C518 0%, #E0A815 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.lp-cta-sub { font-size: 18px; line-height: 1.5; color: var(--text-tertiary); margin: 0 auto 32px; max-width: 520px; }
.lp-cta-actions { display: inline-flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.lp-cta-btn { min-width: 168px; padding: 14px 26px; font-size: 15px; }

/* Footer */
.lp-footer { padding: 48px 0 60px; border-top: 1px solid var(--border-color); color: var(--text-muted); font-size: 13px; }
.lp-footer .lp-wrap { max-width: none; padding: 0 36px; display: flex; gap: 24px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
.lp-footer-brand { font-size: 18px; gap: 10px; }
.lp-footer-brand .lp-brand-icon { width: 22px; height: 22px; }
.lp-footer-links { display: flex; gap: 24px; }
.lp-footer-links a { color: var(--text-muted); transition: color .15s ease; }
.lp-footer-links a:hover { color: var(--text-primary); }
.lp-footer a:hover { color: var(--text-secondary); }
@media (max-width: 600px) { .lp-footer .lp-wrap { padding: 0 20px; } }

/* Mobile hero tuning */
@media (max-width: 760px) {
  .lp-hero { padding: 80px 0 60px; }
  .lp-field-picker { padding: 22px; }
  .lp-band { padding: 88px 0; }
  .lp-cta-band { padding: 100px 0 110px; }
}
@media (max-width: 640px) {
  .lp-hero-title { font-size: clamp(22px, 7.5vw, 48px); max-width: 100%; overflow-wrap: break-word; }
  .lp-hero-title em { padding-right: 0.08em; }
}
`;
