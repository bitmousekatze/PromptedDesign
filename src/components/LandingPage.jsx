import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, useInView, useReducedMotion, animate, useMotionValue, AnimatePresence } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { BadgeSVG, BADGE_TIERS } from './BadgeSVG.jsx';
import { Stories, StoriesContent, Story } from './StoriesCarousel.jsx';
import { supabase } from '../lib/supabase.js';
import claudeLogo from '../assets/models/claude.svg';
import cursorLogo from '../assets/models/cursor.svg';
import chatgptLogo from '../assets/models/openai.svg';
import lovableLogo from '../assets/models/lovable.svg';
import replitLogo from '../assets/models/replit.svg';
import base44Logo from '../assets/models/base44.svg';
// ── Field data for the interactive picker ──
const FIELDS = {
  marketer: {
    label: "marketer",
    build: {
      name: "Mollie", handle: "@mollie", emoji: "\u{1F469}‍\u{1F4BC}", age: "4d ago",
      tags: ["APPS","SOCIAL MEDIA"],
      title: "SparkForge - AI Marketing Co-Founder for Solana",
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
      desc: "ConceptELI5 turns complex concepts into clear explanations - beginner, student, and expert levels. Powered by Claude.",
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
      title: "The EYEBALL - a classroom reading-level checker",
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
      title: "Vibe Coding 101 - a starter kit for Claude Code",
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
      title: "Portrait studies in rainy Kyoto - a Midjourney v6 prompt I reuse",
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
  { badge: "\u{1F4DA}", members: 38104,  name: "Study Hacks", desc: "Flashcards, study guides, drills. The prompts that make hard material stick - K–12 through certifications.", stats: ["1,520 builds", "2,640 questions"], tone: "#D9A8FF" },
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
  { name: "Claude", color: "#cc785c", code: 94, ui: 93, rating: 4.8, logo: claudeLogo },
  { name: "Cursor", color: "#6366f1", code: 96, ui: 86, rating: 4.9, logo: cursorLogo },
  { name: "ChatGPT", color: "#10a37f", code: 90, ui: 84, rating: 4.6, logo: chatgptLogo },
  { name: "Lovable", color: "#ec4899", code: 85, ui: 97, rating: 4.7, logo: lovableLogo },
  { name: "Replit", color: "#f97316", code: 88, ui: 82, rating: 4.5, logo: replitLogo },
  { name: "Base44", color: "#3b82f6", code: 68, ui: 72, rating: 3.9, logo: base44Logo },
];

const PILLARS = [
  { 
    key: "builds",      
    title: "Builds",      
    desc: "Full AI projects people shipped, with the tools, steps, and demos attached.", 
    tags: ["Apps", "Chatbots", "Sites"],
    tone: "#FFD700" 
  },
  { 
    key: "discussion",  
    title: "Discussion",  
    desc: "Long-form posts and threads on what’s changing in AI. Reviews, deep-dives, and war stories from real builds.", 
    tags: ["Deep-Dives", "Reviews", "Stories"],
    tone: "#76F7FF" 
  },
  { 
    key: "questions",   
    title: "Questions",   
    desc: "Ask anything. Beginner or expert. Real humans answer, not a wiki. Voted by usefulness, indexed by tool and topic.", 
    tags: ["Beginners", "Experts", "Help"],
    tone: "#6FCF97" 
  },
  { 
    key: "communities", 
    title: "Communities", 
    desc: "Niche corners for the work you actually do.", 
    tags: ["Vibe Coding", "Study Hacks", "Interviews"],
    tone: "#D9A8FF" 
  },
];

const RANKS = [
  { num: "01", name: "Newbie",      perks: "Just getting started. Welcome!",                            pts: "0+ pts" },
  { num: "02", name: "Tinkerer",    perks: "Ask questions, comment, save builds.",                     pts: "250+ pts" },
  { num: "03", name: "Builder",     perks: "Post builds, run workflows, join any community.",         pts: "1,000+ pts" },
  { num: "04", name: "Craftsman",   perks: "Recognized contributor. Unlocks advanced features.",      pts: "2,500+ pts" },
  { num: "05", name: "Architect",   perks: "Featured on Builds of the Day.",                          pts: "6,000+ pts" },
  { num: "06", name: "Innovator",   perks: "Top-tier builder. Community leader.",                     pts: "12,000+ pts" },
  { num: "07", name: "Visionary",   perks: "Start Communities · early tool access.",              pts: "22,000+ pts" },
  { num: "08", name: "Grandmaster", perks: "Elite status. Shape the platform.",                       pts: "45,000+ pts" },
  { num: "09", name: "Legend",      perks: "The highest rank. Permanent recognition.",                pts: "100,000+ pts" },
];

// ── Motion primitives ──

// Scroll-reveal wrapper - fades + lifts content as it enters the viewport.
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

// Animated number counter - counts up once when in view.
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

// ── AI logo carousel SVGs ──

const ClaudeLogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg">
    <title>Claude</title>
    <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619c-.034-.243-.07-.486-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fillRule="nonzero"/>
  </svg>
);

const CodexLogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg">
    <title>Codex</title>
    <defs>
      <linearGradient id="lp-codex-grad" x1="12" x2="12" y1="3" y2="21" gradientUnits="userSpaceOnUse">
        <stop stopColor="#B1A7FF"/><stop offset=".5" stopColor="#7A9DFF"/><stop offset="1" stopColor="#3941FF"/>
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="4.5" fill="#fff"/>
    <path d="M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388zm3.482 10.565a.637.637 0 000 1.272h3.636a.637.637 0 100-1.272h-3.636zM8.462 9.23a.637.637 0 00-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 101.095.649l1.454-2.455a.636.636 0 00.005-.64L8.462 9.23z" fill="url(#lp-codex-grad)"/>
  </svg>
);

const GrokLogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg">
    <title>Grok</title>
    <path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"/>
  </svg>
);

const AntigravityLogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg">
    <title>Antigravity</title>
    <mask id="lp-ag-m0" maskUnits="userSpaceOnUse" width="24" height="23" x="0" y="1"><path d="M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z" fill="#fff"/></mask>
    <g mask="url(#lp-ag-m0)">
      <g filter="url(#lp-ag-f1)"><path d="M-1.018-3.992c-.408 3.591 2.686 6.89 6.91 7.37 4.225.48 7.98-2.043 8.387-5.633.408-3.59-2.686-6.89-6.91-7.37-4.225-.479-7.98 2.043-8.387 5.633z" fill="#FFE432"/></g>
      <g filter="url(#lp-ag-f2)"><path d="M15.269 7.747c1.058 4.557 5.691 7.374 10.348 6.293 4.657-1.082 7.575-5.653 6.516-10.21-1.058-4.556-5.691-7.374-10.348-6.292-4.657 1.082-7.575 5.653-6.516 10.21z" fill="#FC413D"/></g>
      <g filter="url(#lp-ag-f3)"><path d="M-12.443 10.804c1.338 4.703 7.36 7.11 13.453 5.378 6.092-1.733 9.947-6.95 8.61-11.652C8.282-.173 2.26-2.58-3.833-.848-9.925.884-13.78 6.1-12.443 10.804z" fill="#00B95C"/></g>
      <g filter="url(#lp-ag-f4)"><path d="M-12.443 10.804c1.338 4.703 7.36 7.11 13.453 5.378 6.092-1.733 9.947-6.95 8.61-11.652C8.282-.173 2.26-2.58-3.833-.848-9.925.884-13.78 6.1-12.443 10.804z" fill="#00B95C"/></g>
      <g filter="url(#lp-ag-f5)"><path d="M-7.608 14.703c3.352 3.424 9.126 3.208 12.896-.483 3.77-3.69 4.108-9.459.756-12.883C2.69-2.087-3.083-1.871-6.853 1.82c-3.77 3.69-4.108 9.458-.755 12.883z" fill="#00B95C"/></g>
      <g filter="url(#lp-ag-f6)"><path d="M9.932 27.617c1.04 4.482 5.384 7.303 9.7 6.3 4.316-1.002 6.971-5.448 5.93-9.93-1.04-4.483-5.384-7.304-9.7-6.301-4.316 1.002-6.971 5.448-5.93 9.93z" fill="#3186FF"/></g>
      <g filter="url(#lp-ag-f7)"><path d="M2.572-8.185C.392-3.329 2.778 2.472 7.9 4.771c5.122 2.3 11.042.227 13.222-4.63 2.18-4.855-.205-10.656-5.327-12.955-5.122-2.3-11.042-.227-13.222 4.63z" fill="#FBBC04"/></g>
      <g filter="url(#lp-ag-f8)"><path d="M-3.267 38.686c-5.277-2.072 3.742-19.117 5.984-24.83 2.243-5.712 8.34-8.664 13.616-6.592 5.278 2.071 11.533 13.482 9.29 19.195-2.242 5.713-23.613 14.298-28.89 12.227z" fill="#3186FF"/></g>
      <g filter="url(#lp-ag-f9)"><path d="M28.71 17.471c-1.413 1.649-5.1.808-8.236-1.878-3.135-2.687-4.531-6.201-3.118-7.85 1.412-1.649 5.1-.808 8.235 1.878s4.532 6.2 3.119 7.85z" fill="#749BFF"/></g>
      <g filter="url(#lp-ag-f10)"><path d="M18.163 9.077c5.81 3.93 12.502 4.19 14.946.577 2.443-3.612-.287-9.727-6.098-13.658-5.81-3.931-12.502-4.19-14.946-.577-2.443 3.612.287 9.727 6.098 13.658z" fill="#FC413D"/></g>
      <g filter="url(#lp-ag-f11)"><path d="M-.915 2.684c-1.44 3.473-.97 6.967 1.05 7.804 2.02.837 4.824-1.3 6.264-4.772 1.44-3.473.97-6.967-1.05-7.804-2.02-.837-4.824 1.3-6.264 4.772z" fill="#FFEE48"/></g>
    </g>
    <defs>
      <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="17.587" id="lp-ag-f1" width="19.838" x="-3.288" y="-11.917"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="fx" stdDeviation="1.117"/></filter>
      <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="38.565" id="lp-ag-f2" width="38.9" x="4.251" y="-13.493"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="fx" stdDeviation="5.4"/></filter>
      <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="36.517" id="lp-ag-f3" width="40.955" x="-21.889" y="-10.592"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="fx" stdDeviation="4.591"/></filter>
      <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="36.517" id="lp-ag-f4" width="40.955" x="-21.889" y="-10.592"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="fx" stdDeviation="4.591"/></filter>
      <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="36.595" id="lp-ag-f5" width="36.632" x="-19.099" y="-10.278"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="fx" stdDeviation="4.591"/></filter>
      <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="34.087" id="lp-ag-f6" width="33.533" x=".981" y="8.758"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="fx" stdDeviation="4.363"/></filter>
      <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="35.276" id="lp-ag-f7" width="35.978" x="-6.143" y="-21.659"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="fx" stdDeviation="3.954"/></filter>
      <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="46.523" id="lp-ag-f8" width="45.114" x="-11.96" y="-.46"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="fx" stdDeviation="3.531"/></filter>
      <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="24.054" id="lp-ag-f9" width="25.094" x="10.485" y=".58"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="fx" stdDeviation="3.159"/></filter>
      <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="30.007" id="lp-ag-f10" width="33.508" x="5.833" y="-12.467"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="fx" stdDeviation="2.669"/></filter>
      <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="26.151" id="lp-ag-f11" width="22.194" x="-8.355" y="-8.876"><feFlood floodOpacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="fx" stdDeviation="3.303"/></filter>
    </defs>
  </svg>
);

// ── New logo components from Downloads ──

const CursorLogo = () => (
  <svg fill="currentColor" fillRule="evenodd" width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>Cursor</title><path d="M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z"/></svg>
);

const AiStudioLogo = () => (
  <svg fill="currentColor" fillRule="evenodd" width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>Google AI Studio</title><path d="M9.921 4.196H6.328A2.705 2.705 0 003.623 6.9v11.362a2.705 2.705 0 002.705 2.705h11.363a2.705 2.705 0 002.705-2.705v-4.756l1.623-1.113v5.87a4.329 4.329 0 01-4.328 4.328H6.328A4.329 4.329 0 012 18.263V6.901a4.328 4.328 0 014.328-4.329h4.545l-.952 1.624z"/><path d="M17.82 0c.145 0 .268.104.299.246a7 7 0 001.9 3.484 7 7 0 003.485 1.901c.142.031.246.154.246.3a.308.308 0 01-.246.298A7 7 0 0020.02 8.13a7 7 0 00-1.912 3.535.297.297 0 01-.288.238.297.297 0 01-.288-.238A7 7 0 0015.62 8.13a7 7 0 00-3.535-1.912.297.297 0 01-.238-.288c0-.14.1-.26.238-.288A7 7 0 0015.62 3.73 7.001 7.001 0 0017.521.246.308.308 0 0117.82 0z"/></svg>
);

const OpenAILogo = () => (
  <svg fill="currentColor" fillRule="evenodd" width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>OpenAI</title><path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"/></svg>
);

const ClaudeCodeLogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>Claude Code</title><path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd"/></svg>
);

const CommandALogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>CommandA</title><path clipRule="evenodd" d="M8.128 14.099c.592 0 1.77-.033 3.398-.703 1.897-.781 5.672-2.2 8.395-3.656 1.905-1.018 2.74-2.366 2.74-4.18A4.56 4.56 0 0018.1 1H7.549A6.55 6.55 0 001 7.55c0 3.617 2.745 6.549 7.128 6.549z" fill="#39594D" fillRule="evenodd"/><path clipRule="evenodd" d="M9.912 18.61a4.387 4.387 0 012.705-4.052l3.323-1.38c3.361-1.394 7.06 1.076 7.06 4.715a5.104 5.104 0 01-5.105 5.104l-3.597-.001a4.386 4.386 0 01-4.386-4.387z" fill="#D18EE2" fillRule="evenodd"/><path d="M4.776 14.962A3.775 3.775 0 001 18.738v.489a3.776 3.776 0 007.551 0v-.49a3.775 3.775 0 00-3.775-3.775z" fill="#FF7759"/></svg>
);

const DeepSeekLogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>DeepSeek</title><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" fill="#4D6BFE"/></svg>
);

const OllamaLogo = () => (
  <svg fill="currentColor" fillRule="evenodd" width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>Ollama</title><path d="M7.905 1.09c.216.085.411.225.588.41.295.306.544.744.734 1.263.191.522.315 1.1.362 1.68a5.054 5.054 0 012.049-.636l.051-.004c.87-.07 1.73.087 2.48.474.101.053.2.11.297.17.05-.569.172-1.134.36-1.644.19-.52.439-.957.733-1.264a1.67 1.67 0 01.589-.41c.257-.1.53-.118.796-.042.401.114.745.368 1.016.737.248.337.434.769.561 1.287.23.934.27 2.163.115 3.645l.053.04.026.019c.757.576 1.284 1.397 1.563 2.35.435 1.487.216 3.155-.534 4.088l-.018.021.002.003c.417.762.67 1.567.724 2.4l.002.03c.064 1.065-.2 2.137-.814 3.19l-.007.01.01.024c.472 1.157.62 2.322.438 3.486l-.006.039a.651.651 0 01-.747.536.648.648 0 01-.54-.742c.167-1.033.01-2.069-.48-3.123a.643.643 0 01.04-.617l.004-.006c.604-.924.854-1.83.8-2.72-.046-.779-.325-1.544-.8-2.273a.644.644 0 01.18-.886l.009-.006c.243-.159.467-.565.58-1.12a4.229 4.229 0 00-.095-1.974c-.205-.7-.58-1.284-1.105-1.683-.595-.454-1.383-.673-2.38-.61a.653.653 0 01-.632-.371c-.314-.665-.772-1.141-1.343-1.436a3.288 3.288 0 00-1.772-.332c-1.245.099-2.343.801-2.67 1.686a.652.652 0 01-.61.425c-1.067.002-1.893.252-2.497.703-.522.39-.878.935-1.066 1.588a4.07 4.07 0 00-.068 1.886c.112.558.331 1.02.582 1.269l.008.007c.212.207.257.53.109.785-.36.622-.629 1.549-.673 2.44-.05 1.018.186 1.902.719 2.536l.016.019a.643.643 0 01.095.69c-.576 1.236-.753 2.252-.562 3.052a.652.652 0 01-1.269.298c-.243-1.018-.078-2.184.473-3.498l.014-.035-.008-.012a4.339 4.339 0 01-.598-1.309l-.005-.019a5.764 5.764 0 01-.177-1.785c.044-.91.278-1.842.622-2.59l.012-.026-.002-.002c-.293-.418-.51-.953-.63-1.545l-.005-.024a5.352 5.352 0 01.093-2.49c.262-.915.777-1.701 1.536-2.269.06-.045.123-.09.186-.132-.159-1.493-.119-2.73.112-3.67.127-.518.314-.95.562-1.287.27-.368.614-.622 1.015-.737.266-.076.54-.059.797.042zm4.116 9.09c.936 0 1.8.313 2.446.855.63.527 1.005 1.235 1.005 1.94 0 .888-.406 1.58-1.133 2.022-.62.375-1.451.557-2.403.557-1.009 0-1.871-.259-2.493-.734-.617-.47-.963-1.13-.963-1.845 0-.707.398-1.417 1.056-1.946.668-.537 1.55-.849 2.485-.849zm0 .896a3.07 3.07 0 00-1.916.65c-.461.37-.722.835-.722 1.25 0 .428.21.829.61 1.134.455.347 1.124.548 1.943.548.799 0 1.473-.147 1.932-.426.463-.28.7-.686.7-1.257 0-.423-.246-.89-.683-1.256-.484-.405-1.14-.643-1.864-.643zm.662 1.21l.004.004c.12.151.095.37-.056.49l-.292.23v.446a.375.375 0 01-.376.373.375.375 0 01-.376-.373v-.46l-.271-.218a.347.347 0 01-.052-.49.353.353 0 01.494-.051l.215.172.22-.174a.353.353 0 01.49.051zm-5.04-1.919c.478 0 .867.39.867.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zm8.706 0c.48 0 .868.39.868.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zM7.44 2.3l-.003.002a.659.659 0 00-.285.238l-.005.006c-.138.189-.258.467-.348.832-.17.692-.216 1.631-.124 2.782.43-.128.899-.208 1.404-.237l.01-.001.019-.034c.046-.082.095-.161.148-.239.123-.771.022-1.692-.253-2.444-.134-.364-.297-.65-.453-.813a.628.628 0 00-.107-.09L7.44 2.3zm9.174.04l-.002.001a.628.628 0 00-.107.09c-.156.163-.32.45-.453.814-.29.794-.387 1.776-.23 2.572l.058.097.008.014h.03a5.184 5.184 0 011.466.212c.086-1.124.038-2.043-.128-2.722-.09-.365-.21-.643-.349-.832l-.004-.006a.659.659 0 00-.285-.239h-.004z"/></svg>
);

const CopilotLogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>Copilot</title>
    <defs>
      <radialGradient cx="85.44%" cy="100.653%" fx="85.44%" fy="100.653%" gradientTransform="scale(-.8553 -1) rotate(50.927 2.041 -1.946)" id="lp-cop-g0" r="105.116%"><stop offset="9.6%" stopColor="#00AEFF"/><stop offset="77.3%" stopColor="#2253CE"/><stop offset="100%" stopColor="#0736C4"/></radialGradient>
      <radialGradient cx="18.143%" cy="32.928%" fx="18.143%" fy="32.928%" gradientTransform="scale(.8897 1) rotate(52.069 .193 .352)" id="lp-cop-g1" r="95.612%"><stop offset="0%" stopColor="#FFB657"/><stop offset="63.4%" stopColor="#FF5F3D"/><stop offset="92.3%" stopColor="#C02B3C"/></radialGradient>
      <radialGradient cx="82.987%" cy="-9.792%" fx="82.987%" fy="-9.792%" gradientTransform="scale(-1 -.9441) rotate(-70.872 .142 1.17)" id="lp-cop-g2" r="140.622%"><stop offset="6.6%" stopColor="#8C48FF"/><stop offset="50%" stopColor="#F2598A"/><stop offset="89.6%" stopColor="#FFB152"/></radialGradient>
      <linearGradient id="lp-cop-g3" x1="39.465%" x2="46.884%" y1="12.117%" y2="103.774%"><stop offset="15.6%" stopColor="#0D91E1"/><stop offset="48.7%" stopColor="#52B471"/><stop offset="65.2%" stopColor="#98BD42"/><stop offset="93.7%" stopColor="#FFC800"/></linearGradient>
      <linearGradient id="lp-cop-g4" x1="45.949%" x2="50%" y1="0%" y2="100%"><stop offset="0%" stopColor="#3DCBFF"/><stop offset="24.7%" stopColor="#0588F7" stopOpacity="0"/></linearGradient>
      <linearGradient id="lp-cop-g5" x1="83.507%" x2="83.453%" y1="-6.106%" y2="21.131%"><stop offset="5.8%" stopColor="#F8ADFA"/><stop offset="70.8%" stopColor="#A86EDD" stopOpacity="0"/></linearGradient>
    </defs>
    <path d="M17.533 1.829A2.528 2.528 0 0015.11 0h-.737a2.531 2.531 0 00-2.484 2.087l-1.263 6.937.314-1.08a2.528 2.528 0 012.424-1.833h4.284l1.797.706 1.731-.706h-.505a2.528 2.528 0 01-2.423-1.829l-.715-2.453z" fill="url(#lp-cop-g0)" transform="translate(0 1)"/>
    <path d="M6.726 20.16A2.528 2.528 0 009.152 22h1.566c1.37 0 2.49-1.1 2.525-2.48l.17-6.69-.357 1.228a2.528 2.528 0 01-2.423 1.83h-4.32l-1.54-.842-1.667.843h.497c1.124 0 2.113.75 2.426 1.84l.697 2.432z" fill="url(#lp-cop-g1)" transform="translate(0 1)"/>
    <path d="M15 0H6.252c-2.5 0-4 3.331-5 6.662-1.184 3.947-2.734 9.225 1.75 9.225H6.78c1.13 0 2.12-.753 2.43-1.847.657-2.317 1.809-6.359 2.713-9.436.46-1.563.842-2.906 1.43-3.742A1.97 1.97 0 0115 0" fill="url(#lp-cop-g3)" transform="translate(0 1)"/>
    <path d="M15 0H6.252c-2.5 0-4 3.331-5 6.662-1.184 3.947-2.734 9.225 1.75 9.225H6.78c1.13 0 2.12-.753 2.43-1.847.657-2.317 1.809-6.359 2.713-9.436.46-1.563.842-2.906 1.43-3.742A1.97 1.97 0 0115 0" fill="url(#lp-cop-g4)" transform="translate(0 1)"/>
    <path d="M9 22h8.749c2.5 0 4-3.332 5-6.663 1.184-3.948 2.734-9.227-1.75-9.227H17.22c-1.129 0-2.12.754-2.43 1.848a1149.2 1149.2 0 01-2.713 9.437c-.46 1.564-.842 2.907-1.43 3.743A1.97 1.97 0 019 22" fill="url(#lp-cop-g2)" transform="translate(0 1)"/>
    <path d="M9 22h8.749c2.5 0 4-3.332 5-6.663 1.184-3.948 2.734-9.227-1.75-9.227H17.22c-1.129 0-2.12.754-2.43 1.848a1149.2 1149.2 0 01-2.713 9.437c-.46 1.564-.842 2.907-1.43 3.743A1.97 1.97 0 019 22" fill="url(#lp-cop-g5)" transform="translate(0 1)"/>
  </svg>
);

const KlingLogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>Kling</title>
    <defs>
      <radialGradient cx="0" cy="0" gradientTransform="matrix(7.47772 -12.51022 17.14368 10.24728 5.173 13.637)" id="lp-kl-g0" r="1"><stop offset=".095" stopColor="#FFF959"/><stop offset=".326" stopColor="#0DF35E"/><stop offset=".64" stopColor="#0BF2F9"/><stop offset="1" stopColor="#04A6F0"/></radialGradient>
      <radialGradient cx="0" cy="0" gradientTransform="rotate(120.868 6.491 10.491) scale(14.5747 19.9728)" id="lp-kl-g1" r="1"><stop offset=".095" stopColor="#FFF959"/><stop offset=".326" stopColor="#0DF35E"/><stop offset=".64" stopColor="#0BF2F9"/><stop offset="1" stopColor="#04A6F0"/></radialGradient>
      <linearGradient id="lp-kl-g2" x1="15.578" x2="18.062" y1="1.798" y2="9.861"><stop stopColor="#003EFF"/><stop offset="1" stopColor="#0BFFE7"/></linearGradient>
      <linearGradient id="lp-kl-g3" x1="8.422" x2="5.938" y1="22.142" y2="14.079"><stop stopColor="#003EFF"/><stop offset="1" stopColor="#0BFFE7"/></linearGradient>
    </defs>
    <path d="M5.412 13.775A23.193 23.193 0 017.41 9.32c3.17-5.492 7.795-8.757 10.33-7.294C12.038-1.266 4.598.944 1.122 6.964A13.378 13.378 0 00.085 9.22c-.259.739.092 1.534.77 1.926l4.557 2.63z" fill="url(#lp-kl-g0)"/>
    <path d="M18.588 10.164a23.188 23.188 0 01-1.999 4.455c-3.17 5.492-7.795 8.758-10.33 7.294 5.703 3.293 13.143 1.082 16.619-4.938a13.392 13.392 0 001.037-2.255c.259-.738-.092-1.534-.77-1.925l-4.557-2.63z" fill="url(#lp-kl-g1)"/>
    <path d="M16.59 14.62c3.17-5.492 3.686-11.13 1.15-12.594C15.207.563 10.582 3.83 7.41 9.32c2.074-3.59 5.809-5.315 8.344-3.852 2.534 1.464 2.908 5.56.835 9.151z" fill="url(#lp-kl-g2)"/>
    <path d="M7.41 9.32c-3.17 5.492-3.686 11.13-1.15 12.593 2.534 1.464 7.159-1.802 10.33-7.294-2.074 3.591-5.809 5.316-8.344 3.852-2.534-1.463-2.908-5.56-.835-9.15z" fill="url(#lp-kl-g3)"/>
  </svg>
);

const DevinLogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>Devin</title><path d="M2.033 9.867l2.554 1.483a.589.589 0 00.592 0l2.554-1.483.01-.008a.608.608 0 00.11-.084l.013-.015a.631.631 0 00.076-.1c.003-.005.008-.01.01-.016a.558.558 0 00.052-.125l.007-.028a.611.611 0 00.019-.14V7.868c0-.572.307-1.105.8-1.392a1.595 1.595 0 011.598 0l1.277.742a.54.54 0 00.129.053l.028.01c.044.01.088.015.133.016h.006l.013-.002a.587.587 0 00.27-.074l.011-.004 2.554-1.483a.596.596 0 00.297-.516V2.253a.595.595 0 00-.297-.516L12.293.257a.587.587 0 00-.591 0L9.148 1.737l-.01.01a.609.609 0 00-.109.083l-.014.015a.632.632 0 00-.076.1c-.003.005-.008.01-.01.016a.57.57 0 00-.052.124l-.007.028a.612.612 0 00-.018.14v1.483c0 .572-.307 1.105-.8 1.393a1.597 1.597 0 01-1.599 0l-1.276-.742a.603.603 0 00-.13-.053l-.028-.008a.658.658 0 00-.133-.018h-.02a.57.57 0 00-.269.074c-.003.002-.008.002-.012.005L2.033 5.872a.596.596 0 00-.297.515v2.966c0 .213.113.41.297.515z" fill="#3969CA"/><path d="M15.943 10.607a1.596 1.596 0 011.599 0l1.276.74c.041.025.085.04.13.055l.028.008c.043.01.088.016.133.018h.005c.005 0 .01-.002.014-.003a.474.474 0 00.122-.016l.021-.005a.616.616 0 00.126-.052c.004-.002.009-.002.013-.005l2.554-1.482a.597.597 0 00.297-.516V6.383a.596.596 0 00-.297-.515l-2.552-1.483a.587.587 0 00-.592 0l-2.553 1.482-.011.008a.61.61 0 00-.108.084l-.014.016a.637.637 0 00-.076.1c-.003.005-.008.01-.01.016a.57.57 0 00-.052.124l-.007.029a.612.612 0 00-.018.14v1.482c0 .572-.307 1.105-.8 1.393a1.597 1.597 0 01-1.599 0l-1.276-.742a.584.584 0 00-.13-.053l-.028-.008a.62.62 0 00-.133-.018h-.02a.587.587 0 00-.269.074l-.012.004L9.15 10a.596.596 0 00-.296.516v2.966c0 .212.112.409.296.515l2.554 1.483s.008.002.012.005c.04.022.082.04.126.052l.02.004a.57.57 0 00.123.017l.014.002h.006c.054 0 .108-.01.16-.025a.587.587 0 00.13-.054l1.277-.741a1.597 1.597 0 012.398 1.392v1.482c0 .049.007.095.019.14l.007.028a.619.619 0 00.051.125c.004.006.008.01.01.016a.6.6 0 00.076.1l.014.015c.033.032.069.06.108.084.004.002.006.006.011.008l2.554 1.483a.59.59 0 00.593 0l2.554-1.483a.597.597 0 00.296-.516v-2.965a.595.595 0 00-.296-.516l-2.554-1.483s-.008-.002-.012-.005a.54.54 0 00-.126-.051c-.007-.003-.013-.003-.02-.005a.635.635 0 00-.125-.017h-.018a.557.557 0 00-.16.026.588.588 0 00-.13.053l-1.276.742a1.595 1.595 0 01-1.598 0 1.615 1.615 0 010-2.785l-.005-.001z" fill="#21C19A"/><path d="M14.848 18.265l-2.554-1.482-.012-.005a.526.526 0 00-.126-.052c-.007-.002-.014-.002-.02-.005a.64.64 0 00-.124-.017h-.02a.56.56 0 00-.16.026.588.588 0 00-.13.053l-1.276.742a1.594 1.594 0 01-1.598 0c-.493-.286-.8-.82-.8-1.393V14.65a.563.563 0 00-.018-.14l-.008-.028a.604.604 0 00-.051-.124l-.01-.017a.603.603 0 00-.076-.1l-.014-.015a.596.596 0 00-.109-.084c-.003-.002-.005-.006-.01-.008L5.178 12.65a.587.587 0 00-.591 0l-2.554 1.483a.596.596 0 00-.297.516v2.965c0 .213.113.41.297.516l2.554 1.483.012.004a.618.618 0 00.267.074l.016.002h.007a.55.55 0 00.16-.026.584.584 0 00.129-.053l1.277-.742a1.597 1.597 0 012.398 1.393v1.482c0 .05.007.095.019.14l.007.028c.013.044.03.085.051.125l.01.016c.022.036.047.07.076.1l.014.015c.032.032.069.06.109.084l.01.008 2.554 1.483a.587.587 0 00.593 0l2.554-1.483a.596.596 0 00.296-.515v-2.966a.596.596 0 00-.296-.516h-.002z" fill="#0294DE"/></svg>
);

const MistralLogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>Mistral</title><path d="M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z" fill="gold"/><path d="M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z" fill="#FFAF00"/><path d="M3.428 10.258h17.144v3.428H3.428v-3.428z" fill="#FF8205"/><path d="M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z" fill="#FA500F"/><path d="M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z" fill="#E10500"/></svg>
);

const ClineLogo = () => (
  <svg fill="currentColor" fillRule="evenodd" width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>Cline</title><path d="M17.035 3.991c2.75 0 4.98 2.24 4.98 5.003v1.667l1.45 2.896a1.01 1.01 0 01-.002.909l-1.448 2.864v1.668c0 2.762-2.23 5.002-4.98 5.002H7.074c-2.751 0-4.98-2.24-4.98-5.002V17.33l-1.48-2.855a1.01 1.01 0 01-.003-.927l1.482-2.887V8.994c0-2.763 2.23-5.003 4.98-5.003h9.962zM8.265 9.6a2.274 2.274 0 00-2.274 2.274v4.042a2.274 2.274 0 004.547 0v-4.042A2.274 2.274 0 008.265 9.6zm7.326 0a2.274 2.274 0 00-2.274 2.274v4.042a2.274 2.274 0 104.548 0v-4.042A2.274 2.274 0 0015.59 9.6z"/><path d="M12.054 5.558a2.779 2.779 0 100-5.558 2.779 2.779 0 000 5.558z"/></svg>
);

const GeminiLogo = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" style={{flex:'none',lineHeight:1}} xmlns="http://www.w3.org/2000/svg"><title>Gemini</title>
    <defs>
      <linearGradient id="lp-gm-g0" x1="7" x2="11" y1="15.5" y2="12" gradientUnits="userSpaceOnUse"><stop stopColor="#08B962"/><stop offset="1" stopColor="#08B962" stopOpacity="0"/></linearGradient>
      <linearGradient id="lp-gm-g1" x1="8" x2="11.5" y1="5.5" y2="11" gradientUnits="userSpaceOnUse"><stop stopColor="#F94543"/><stop offset="1" stopColor="#F94543" stopOpacity="0"/></linearGradient>
      <linearGradient id="lp-gm-g2" x1="3.5" x2="17.5" y1="13.5" y2="12" gradientUnits="userSpaceOnUse"><stop stopColor="#FABC12"/><stop offset=".46" stopColor="#FABC12" stopOpacity="0"/></linearGradient>
    </defs>
    <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"/>
    <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lp-gm-g0)"/>
    <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lp-gm-g1)"/>
    <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lp-gm-g2)"/>
  </svg>
);

// ── Logo SETS for looping carousel ──
const LOGO_SETS = [
  [ClaudeLogo, CodexLogo, GrokLogo, AntigravityLogo],
  [CursorLogo, AiStudioLogo, OpenAILogo, ClaudeCodeLogo],
  [CommandALogo, DeepSeekLogo, OllamaLogo, CopilotLogo],
  [KlingLogo, DevinLogo, MistralLogo, ClineLogo],
  [GeminiLogo, GrokLogo, CursorLogo, ClaudeLogo],
];

const ARCH_POSITIONS = [
  { x: -46, y: -12, r: -14, scale: 0.45 },
  { x: -22, y: -20, r: -5, scale: 0.4 },
  { x: 2, y: -20, r: 5, scale: 0.4 },
  { x: 26, y: -12, r: 14, scale: 0.45 },
];

function AiBurst() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const [started, setStarted] = useState(false);
  const [setIdx, setSetIdx] = useState(0);

  // Start after hero entrance
  useEffect(() => {
    if (!inView || reduce) return;
    const t = setTimeout(() => setStarted(true), 800);
    return () => clearTimeout(t);
  }, [inView, reduce]);

  // Advance to next set - controls timing
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => {
      setSetIdx(i => (i + 1) % LOGO_SETS.length);
    }, 10500);
    return () => clearInterval(t);
  }, [started]);

  if (reduce) return <span ref={ref} className="lp-ai-burst" aria-hidden="true" />;

  const logos = LOGO_SETS[setIdx];

  return (
    <span ref={ref} className="lp-ai-burst" aria-hidden="true">
      {started && (
        <AnimatePresence mode="wait">
          <motion.span
            key={setIdx}
            className="lp-ai-burst-group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.01 }}
          >
            {logos.map((Logo, i) => {
              const p = ARCH_POSITIONS[i];
              return (
                <motion.span
                  key={i}
                  className="lp-ai-burst-particle"
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0.2, rotate: 0 }}
                  animate={{
                    opacity: [0, 1, 1, 1, 0],
                    x: [0, p.x, p.x, 0, 0],
                    y: [0, p.y, p.y, 0, 0],
                    scale: [0.2, p.scale, p.scale, 0.2, 0.2],
                    rotate: [0, p.r, p.r, 0, 0],
                  }}
                  transition={{
                    duration: 9.4,
                    delay: i * 0.12,
                    times: [0, 0.128, 0.85, 0.97, 1],
                    ease: [0.2, 0.7, 0.2, 1],
                  }}
                >
                  <span><Logo /></span>
                </motion.span>
              );
            })}
          </motion.span>
        </AnimatePresence>
      )}
    </span>
  );
}

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

function HeroPreview() {
  return (
    <div className="lp-hero-preview" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img
        src="/hero.webp"
        alt="Prompted Dashboard Preview"
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          imageRendering: 'high-quality',
          WebkitFontSmoothing: 'antialiased'
        }}
      />
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const toolData = payload[0].payload;
    return (
      <div style={{
        background: 'rgba(11, 11, 12, 0.96)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        fontSize: '13.5px',
        borderRadius: '12px',
        padding: '12px 14px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)'
      }}>
        {/* Tooltip Header with Logo + Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
          {toolData.logo && (
            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: toolData.color || 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '3px',
              boxSizing: 'border-box',
              flexShrink: 0
            }}>
              <img 
                src={toolData.logo} 
                alt="" 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain', 
                  display: 'block',
                  margin: 0,
                  filter: 'brightness(0) invert(1)',
                  opacity: 0.95
                }} 
              />
            </div>
          )}
          <span style={{ fontWeight: 600, color: 'white', letterSpacing: '-0.01em' }}>{label}</span>
        </div>

        {/* Tooltip Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {payload.map((item, i) => {
            const isRating = item.name === "Rating";
            const val = isRating ? toolData.rating : item.value;
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '28px', alignItems: 'center' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: '12px' }}>{item.name}</span>
                <span style={{ color: 'white', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '12.5px' }}>
                  {val}{isRating ? ' ★' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

function ChartSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });

  const chartData = COMPARE_ROWS.map(r => ({
    ...r,
    ratingScaled: r.rating * 20,
  }));

  return (
    <div className="lp-chart-container-row" ref={ref}>
      {/* Left side with the models - redesigned as interactive dashboards rows */}
      <div className="lp-models-comparison-sidebar">
        {COMPARE_ROWS.map(row => (
          <div 
            key={row.name} 
            className="lp-model-comp-row" 
            style={{ '--model-color': row.color }}
          >
            <div className="lp-model-comp-header">
              <div className="lp-model-comp-logo" style={{ background: row.color }}>
                {row.logo && <img src={row.logo} alt={row.name} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', filter: 'brightness(0) invert(1)', opacity: 0.95 }} />}
              </div>
              <span className="lp-model-comp-name">{row.name}</span>
              <span className="lp-model-comp-rating">{row.rating} ★</span>
            </div>
            <div className="lp-model-comp-bar-bg">
              <div className="lp-model-comp-bar-fill" style={{ width: `${(row.rating - 3) * 50}%` }} />
            </div>
          </div>
        ))}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: 'var(--text-muted)',
          textAlign: 'center',
          padding: '4px 0 0',
          opacity: 0.4,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          width: '100%'
        }}>
          + 114 more
        </div>
      </div>

      {/* The chart itself */}
      <div className="lp-chart-card" style={{ flex: 1, minHeight: 400, minWidth: 0, backgroundColor: 'rgba(255, 255, 255, 0.02)', boxShadow: 'inset 0 12px 48px rgba(255, 255, 255, 0.05), inset 0 -32px 128px rgba(0, 0, 0, 0.8), inset 0 0 32px rgba(255, 255, 255, 0.02), 0 24px 64px rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(48px)', WebkitBackdropFilter: 'blur(48px)', borderTop: '1px solid rgba(255, 255, 255, 0.1)', borderLeft: '1px solid rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.01)', borderRight: '1px solid rgba(255, 255, 255, 0.01)', padding: '32px 24px', borderRadius: '24px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Custom Legend */}
        <div className="lp-chart-legend" style={{ display: 'flex', gap: '24px', justifyContent: 'flex-end', marginBottom: '16px', paddingRight: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 16, height: 3, background: 'rgba(255,255,255,0.8)', borderRadius: 2 }} />
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)' }}>Ships Code</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 16, height: 2, borderBottom: '2px dashed rgba(255,255,255,0.6)' }} />
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)' }}>Complex UI</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 16, height: 2, borderBottom: '2px dotted rgba(255,255,255,0.6)' }} />
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)' }}>Rating</span>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          {inView && (
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <AreaChart data={chartData} margin={{ top: 8, right: 28, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="modelGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#cc785c" />
                    <stop offset="20%" stopColor="#6366f1" />
                    <stop offset="40%" stopColor="#10a37f" />
                    <stop offset="60%" stopColor="#ec4899" />
                    <stop offset="80%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  <linearGradient id="modelGradFill" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#cc785c" stopOpacity={0.25} />
                    <stop offset="20%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="40%" stopColor="#10a37f" stopOpacity={0.25} />
                    <stop offset="60%" stopColor="#ec4899" stopOpacity={0.25} />
                    <stop offset="80%" stopColor="#f97316" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 13 }} tickMargin={12} tickLine={false} axisLine={false} minTickGap={10} />
                <YAxis width={28} tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 13 }} tickLine={false} axisLine={false} allowDecimals={false} domain={[60, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Area className="shimmer-line-1" type="monotone" dataKey="code" name="Ships Code" stroke="url(#modelGrad)" fill="url(#modelGradFill)" strokeWidth={3} activeDot={{ r: 5, fill: '#fff', stroke: '#070707', strokeWidth: 2 }} />
                <Area className="shimmer-line-2" type="monotone" dataKey="ui" name="Complex UI" stroke="url(#modelGrad)" fill="none" strokeWidth={2} strokeDasharray="6 6" activeDot={{ r: 5, fill: '#fff', stroke: '#070707', strokeWidth: 2 }} />
                <Area className="shimmer-line-3" type="monotone" dataKey="ratingScaled" name="Rating" stroke="url(#modelGrad)" fill="none" strokeWidth={2} strokeDasharray="2 4" activeDot={{ r: 5, fill: '#fff', stroke: '#070707', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function CommunityCard({ c, idx }) {
  const spot = useSpotlight();
  return (
    <Reveal delay={idx * 0.05}>
      <div
        className="lp-community-wrap"
        style={{ ['--community-tone']: c.tone }}
      >
        <div
          className="lp-community"
          ref={spot.ref}
          onMouseMove={spot.onMouseMove}
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
      </div>
    </Reveal>
  );
}

function PillarCard({ p, idx, onPillarClick }) {
  const spot = useSpotlight();
  return (
    <Reveal delay={idx * 0.05}>
      <div
        ref={spot.ref}
        onMouseMove={spot.onMouseMove}
        className="lp-pillar-new"
        style={{ 
          '--pillar-color': p.tone 
        }}
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
        <div className="lp-pillar-new-glow" aria-hidden="true" />
        
        <div className="lp-pillar-new-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="lp-pillar-new-icon" aria-hidden="true">
              <PillarIcon name={p.key} />
            </span>
            <h3>{p.title}</h3>
          </div>
          <span className="lp-pillar-new-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
        </div>
        
        <p className="lp-pillar-new-desc">{p.desc}</p>
        
        <div className="lp-pillar-new-tags">
          {p.tags.map(tag => (
            <span key={tag} className="lp-pillar-new-tag">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

const MOCK_LEADERBOARD = [
  { id: '1', display_name: 'Jolie Joie', username: 'jolie', points: 100000, avatar_emoji: '👱🏻‍♀️' },
  { id: '2', display_name: 'Brian Ngo', username: 'brian', points: 50000, avatar_emoji: '🦍' },
  { id: '3', display_name: 'David Do', username: 'david', points: 20000, avatar_emoji: '👑' },
  { id: '4', display_name: "Henrietta O'Connell", username: 'henrietta', points: 15424, avatar_emoji: '👩🏽' },
  { id: '5', display_name: 'Darrel Bins', username: 'darrel', points: 12241, avatar_emoji: '👨🏼' },
  { id: '6', display_name: 'Mollie', username: 'mollie', points: 9842, avatar_emoji: '👩🏻' },
  { id: '7', display_name: 'Maxim Build', username: 'maxiagent', points: 8320, avatar_emoji: '🎓' },
  { id: '8', display_name: 'Zaineee', username: 'zaineee', points: 7540, avatar_emoji: '🧑‍🏫' },
  { id: '9', display_name: 'Jack H', username: 'herz', points: 6420, avatar_emoji: '🚀' },
  { id: '10', display_name: 'Elena Rostova', username: 'elena_r', points: 5120, avatar_emoji: '👩🏼‍💻' }
];

const AvatarPlaceholder = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%', opacity: 0.4 }}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

// ── Main LandingPage ──

export default function LandingPage({ onLogin, onSignup, onBrowseAsGuest, onStartExploring, onSeeTrending, onPillarClick, onFooterLink }) {
  const scrollTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const handleStartExploring = onSignup;
  const handleSeeTrending = onSignup;

  const [leaderboard, setLeaderboard] = useState(MOCK_LEADERBOARD);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [showTiers, setShowTiers] = useState(false);
  const [flippedCards, setFlippedCards] = useState({});
  const tiersGridRef = useRef(null);

  const handleTiersMouseMove = (e) => {
    if (!tiersGridRef.current) return;
    const cards = tiersGridRef.current.querySelectorAll('.lp-tier-card-container');
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mx', `${x}px`);
      card.style.setProperty('--my', `${y}px`);
    });
  };

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        const { data, error } = await supabase.rpc('get_builder_leaderboard', { p_limit: 10 });
        if (!error && data && data.length > 0) {
          setLeaderboard(data);
        } else {
          setLeaderboard(MOCK_LEADERBOARD);
        }
      } catch (err) {
        console.error('Error fetching landing page leaderboard:', err);
        setLeaderboard(MOCK_LEADERBOARD);
      } finally {
        setLeaderboardLoading(false);
      }
    }
    loadLeaderboard();
  }, []);


  // Hero video: slow cinematic loop.
  const videoRef = useRef(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => { video.playbackRate = 0.3; };
    video.addEventListener('loadedmetadata', onLoaded);
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, []);

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

          <div className="lp-nav-cta">
            <button className="lp-btn lp-btn-ghost" onClick={onLogin}>Log in</button>
            <button className="lp-btn lp-btn-primary" onClick={onSignup}>Join free</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        {/* Background video */}
        <video
          ref={videoRef}
          className="lp-hero-video"
          autoPlay
          loop
          muted
          playsInline
        >
          <source src="/video.webm" type="video/webm" />
        </video>
        <div className="lp-hero-overlay" aria-hidden="true" />
        <div className="lp-wrap lp-hero-wrap">
          <Reveal delay={0.08}>
            <h1 className="lp-hero-title">
              The social hub for <em>everyone&nbsp;learning&nbsp;AI<AiBurst /></em>
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="lp-hero-sub">
              The place where people actually share what works with AI.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="lp-hero-trust">
              <span className="lp-live-dot" />
              <strong><CountUp value={104287} /></strong> builders shipping today
            </div>
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
          <Reveal delay={0.44}>
            <HeroPreview />
          </Reveal>
        </div>
        <div className="lp-hero-bottom-fade" aria-hidden="true" />
      </section>

      {/* TOOLS / COMPARE */}
      <section className="lp-band" id="lp-tools">
        <div className="lp-wrap">
          <Reveal>
            <div className="lp-section-lead">
              <h2 className="lp-tools-head">
                <span className="lp-tools-h1">Every tool.</span>
                <span className="lp-tools-h2">What it&rsquo;s actually good at.</span>
              </h2>
              <p>Posts on Prompted are tagged with the tools that built them. Filter the feed by tool, see which one a community prefers for what, and compare the ones you&apos;re deciding between.</p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <ChartSection />
          </Reveal>
        </div>
      </section>

      {/* COMMUNITIES */}
      <section className="lp-band" id="lp-communities">
        <div className="lp-wrap">
          <Reveal>
            <div className="lp-section-lead" style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <h2>Find <em>your people</em>.<br />See what works for your world.</h2>
              <p style={{ marginLeft: 'auto' }}>Niche communities inside Prompted, where the tools, questions, and builds are specific to the work you actually do. Jump in, lurk, or start one.</p>
            </div>
          </Reveal>
          <div className="lp-communities-carousel" style={{ marginTop: '48px', display: 'flex', flexWrap: 'nowrap', gap: '18px', width: '100%' }}>
            {COMMUNITIES.map((c, i) => (
              <Reveal key={c.name} delay={0.15 + i * 0.08} style={{ flex: '0 0 auto' }}>
                <Story style={{ 
                  '--community-tone': c.tone, 
                  width: '256px',
                  '--anim-delay': `-${i * 3.7}s`
                }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.2))', zIndex: 10 }} />
                  <div className="lp-story-glow" style={{ position: 'absolute', top: 0, right: 0, width: '192px', height: '192px', opacity: 0.2, filter: 'blur(40px)', zIndex: 0, background: c.tone }} />
                  
                  <div style={{ position: 'absolute', inset: 0, padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 20 }}>
                    <div style={{ position: 'absolute', top: '24px', right: '24px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                         {c.members.toLocaleString()}
                      </span>
                    </div>

                    <span style={{ fontSize: '36px', lineHeight: 1, marginBottom: '16px' }}>{c.badge}</span>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'white', lineHeight: 1.2 }}>{c.name}</h3>
                    </div>
                    
                    <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginBottom: '20px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>{c.desc}</p>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {c.stats?.map(s => (
                        <span key={s} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', background: 'rgba(255, 255, 255, 0.02)', padding: '6px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)', boxShadow: 'inset 0 2px 6px rgba(255, 255, 255, 0.1), inset 0 -4px 12px rgba(0, 0, 0, 0.4), inset 0 0 8px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0,0,0,0.2)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', letterSpacing: '0.02em', fontWeight: 500 }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </Story>
              </Reveal>
            ))}
            <div style={{ flex: '0 0 auto', width: '1px' }} aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* FOUR PILLARS */}
      <section className="lp-band" id="lp-builds">
        <div className="lp-wrap">
          <Reveal>
            <div className="lp-section-lead" style={{ maxWidth: '900px' }}>
              <h2>Four layers.<br />One community <em>figuring out AI</em> together.</h2>
              <p>Not just prompts. Prompted is a full community layer, the builds people ship, the discussions they have, the questions they ask, and the tools they swear by.</p>
            </div>
          </Reveal>
          <div className="lp-pillars">
            {PILLARS.map((p, i) => (
              <PillarCard key={p.title} p={p} idx={i} onPillarClick={onPillarClick} />
            ))}
          </div>
        </div>
      </section>

      {/* BUILDER RANK & LEADERBOARD */}
      <section className="lp-band" id="lp-rank">
        <div className="lp-wrap">
          <Reveal>
            <div className="lp-section-lead" style={{ marginLeft: 'auto', textAlign: 'right', marginBottom: '56px' }}>
              <h2>Post what you tried.<br /><em>Earn your rank.</em></h2>
              <p style={{ marginLeft: 'auto' }}>Every build you share, question you answer, or discussion you start moves your Builder Rank. Work your way up the leaderboard, earn points, and climb the rank ladder.</p>
            </div>
          </Reveal>

          <div style={{ width: '100%' }}>
            <div className="lp-leaderboard-card">
                {/* Tiers Overlay */}
                <AnimatePresence>
                  {showTiers && (
                    <motion.div 
                      className="lp-tiers-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="lp-tiers-overlay-content">
                        <div className="lp-tiers-overlay-header">
                          <h3>Builder Rank Tiers</h3>
                          <button className="lp-tiers-close-btn" onClick={() => setShowTiers(false)} aria-label="Close rank tiers">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '24px', height: '24px' }}>
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                        <div 
                          ref={tiersGridRef} 
                          className="lp-tiers-grid"
                          onMouseMove={handleTiersMouseMove}
                        >
                          {RANKS.map((r, i) => {
                            const tones = ["#9e9e9e", "#a1887f", "#4db6ac", "#81c784", "#ffb74d", "#64b5f6", "#ba68c8", "#ff8a65", "#ffd54f"];
                            const rankTone = tones[i];
                            const isFlipped = !!flippedCards[r.num];
                            return (
                              <div 
                                key={r.num} 
                                className="lp-tier-card-container"
                                style={{ '--rank-tone': rankTone }}
                                onClick={() => setFlippedCards(prev => ({ ...prev, [r.num]: !prev[r.num] }))}
                              >
                                <div className={`lp-tier-card-flipper ${isFlipped ? 'flipped' : ''}`}>
                                  {/* FRONT */}
                                  <div className="lp-tier-card lp-tier-card-front">
                                    <div className="lp-tier-card-border-glow" />
                                    <div className="lp-tier-card-inner">
                                      <h4 className="lp-tier-card-front-title">{r.name.toUpperCase()}</h4>
                                      <div className="lp-tier-card-badge-wrap">
                                        <BadgeSVG badge={BADGE_TIERS[i]} size={84} />
                                      </div>
                                      <span className="lp-tier-card-pts">{r.pts}</span>
                                      <span className="lp-tier-card-click-hint">Click to flip</span>
                                    </div>
                                  </div>

                                  {/* BACK */}
                                  <div className="lp-tier-card lp-tier-card-back">
                                    <div className="lp-tier-card-border-glow" />
                                    <div className="lp-tier-card-inner">
                                      <div className="lp-tier-card-back-badge">
                                        <BadgeSVG badge={BADGE_TIERS[i]} size={24} />
                                      </div>
                                      <div className="lp-tier-card-back-info">
                                        <p className="lp-tier-card-back-perks">{r.perks}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Header Row */}
                <Reveal delay={0.08} style={{ width: '100%' }}>
                  <div className="lp-leaderboard-header-row">
                    <h3 className="lp-leaderboard-title">Live Rankings</h3>
                    <button className="lp-leaderboard-tier-btn" onClick={() => setShowTiers(true)}>
                      <span style={{ marginRight: '10px', display: 'inline-flex', alignItems: 'center' }}>
                        <BadgeSVG badge={BADGE_TIERS[8]} size={20} />
                      </span>
                      View Rank Tiers
                    </button>
                  </div>
                </Reveal>

                {/* 3D Podium for Top 3 */}
                <div className="lp-podium-container">
                  {/* 2nd Place (Left) - rises second */}
                  {leaderboard[1] && (
                    <Reveal delay={0.25} className="lp-podium-column place-2">
                      <div className="lp-podium-avatar-wrapper">
                        {leaderboard[1].avatar_url ? (
                          <img src={leaderboard[1].avatar_url} alt="" className="lp-podium-avatar" />
                        ) : (
                          <div className="lp-podium-avatar-text">{leaderboard[1].avatar_emoji || '🥈'}</div>
                        )}
                      </div>
                      <div className="lp-podium-name">{leaderboard[1].display_name || leaderboard[1].username}</div>
                      <div className="lp-podium-box">
                        <div className="lp-podium-bg-num">2</div>
                        <div className="lp-podium-pts-label">Earned points</div>
                        <div className="lp-podium-pts">{(leaderboard[1].points || leaderboard[1].builder_points || 0).toLocaleString()}</div>
                      </div>
                    </Reveal>
                  )}

                  {/* 1st Place (Center - Highest) - rises first */}
                  {leaderboard[0] && (
                    <Reveal delay={0.1} className="lp-podium-column place-1">
                      <div className="lp-podium-avatar-wrapper">
                        <div className="lp-podium-crown">👑</div>
                        {leaderboard[0].avatar_url ? (
                          <img src={leaderboard[0].avatar_url} alt="" className="lp-podium-avatar" />
                        ) : (
                          <div className="lp-podium-avatar-text">{leaderboard[0].avatar_emoji || '🥇'}</div>
                        )}
                      </div>
                      <div className="lp-podium-name">{leaderboard[0].display_name || leaderboard[0].username}</div>
                      <div className="lp-podium-box">
                        <div className="lp-podium-bg-num">1</div>
                        <div className="lp-podium-pts-label">Earned points</div>
                        <div className="lp-podium-pts">{(leaderboard[0].points || leaderboard[0].builder_points || 0).toLocaleString()}</div>
                      </div>
                    </Reveal>
                  )}

                  {/* 3rd Place (Right) - rises third */}
                  {leaderboard[2] && (
                    <Reveal delay={0.4} className="lp-podium-column place-3">
                      <div className="lp-podium-avatar-wrapper">
                        {leaderboard[2].avatar_url ? (
                          <img src={leaderboard[2].avatar_url} alt="" className="lp-podium-avatar" />
                        ) : (
                          <div className="lp-podium-avatar-text">{leaderboard[2].avatar_emoji || '🥉'}</div>
                        )}
                      </div>
                      <div className="lp-podium-name">{leaderboard[2].display_name || leaderboard[2].username}</div>
                      <div className="lp-podium-box">
                        <div className="lp-podium-bg-num">3</div>
                        <div className="lp-podium-pts-label">Earned points</div>
                        <div className="lp-podium-pts">{(leaderboard[2].points || leaderboard[2].builder_points || 0).toLocaleString()}</div>
                      </div>
                    </Reveal>
                  )}
                </div>

                {/* Summary Pill */}
                <Reveal delay={0.55} style={{ width: '100%' }}>
                  <div className="lp-leaderboard-summary-pill">
                    <span className="lp-summary-dot" />
                    <div className="lp-marquee-container">
                      <div className="lp-marquee-content">
                        <span>Top builders ranked by total likes, questions answered, and shipping frequency</span>
                        <span>Top builders ranked by total likes, questions answered, and shipping frequency</span>
                      </div>
                    </div>
                  </div>
                </Reveal>

                {/* Leaderboard List (Ranks 4-10) */}
                <div className="lp-leaderboard-list">
                  {leaderboard.slice(3, 10).map((entry, idx) => (
                    <Reveal key={entry.id || idx} delay={0.6 + idx * 0.04} style={{ width: '100%' }}>
                      <div className="lp-leaderboard-row">
                        <div className="lp-leaderboard-pos">#{idx + 4}</div>
                        <div className="lp-leaderboard-user">
                          <div className="lp-leaderboard-avatar-small">
                            {entry.avatar_url ? (
                              <img src={entry.avatar_url} alt="" />
                            ) : (
                              <span>{entry.avatar_emoji || '👤'}</span>
                            )}
                          </div>
                          <div className="lp-leaderboard-names">
                            <span className="display-name">{entry.display_name || entry.username}</span>
                            <span className="username">@{entry.username}</span>
                          </div>
                        </div>
                        <div className="lp-leaderboard-pts">
                          <span>{(entry.points || entry.builder_points || 0).toLocaleString()} pts</span>
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-cta-band">
        {leaderboard && leaderboard.length > 0 && (
          <>
            <CollabCursorAnimator
              name={leaderboard[0]?.display_name || leaderboard[0]?.username || 'Alex'}
              status="Building a Solana bot"
              color="#a855f7"
              delay={0}
              startPos={{ left: 12, top: 20 }}
              endPos={{ left: 24, top: 22 }}
              borderTexture="solid"
            />
 
            <CollabCursorAnimator
              name={leaderboard[1]?.display_name || leaderboard[1]?.username || 'Mollie'}
              status="Editing Pump.fun copy"
              color="#10b981"
              delay={1500}
              startPos={{ left: 65, top: 72 }}
              endPos={{ left: 78, top: 74 }}
              borderTexture="dashed"
            />
 
            <CollabCursorAnimator
              name={leaderboard[2]?.display_name || leaderboard[2]?.username || 'Vision'}
              status="Checking Live Rankings"
              color="#ec4899"
              delay={3000}
              startPos={{ left: 72, top: 38 }}
              endPos={{ left: 86, top: 40 }}
              borderTexture="dotted"
            />
 
            <CollabCursorAnimator
              name={leaderboard[3]?.display_name || leaderboard[3]?.username || 'Arqon'}
              status="Answering a study question"
              color="#3b82f6"
              delay={4500}
              startPos={{ left: 18, top: 68 }}
              endPos={{ left: 31, top: 70 }}
              borderTexture="dashed"
            />
 
            <CollabCursorAnimator
              name={leaderboard[4]?.display_name || leaderboard[4]?.username || 'mousedevv'}
              status="Sharing a new build"
              color="#f59e0b"
              delay={6000}
              startPos={{ left: 45, top: 12 }}
              endPos={{ left: 58, top: 14 }}
              borderTexture="dotted"
            />
          </>
        )}

        <div className="lp-wrap" style={{ position: 'relative', zIndex: 5 }}>
          <Reveal>
            <h2 className="lp-cta-title">Come see <em>what&rsquo;s working.</em></h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="lp-cta-sub">Free to join. No AI experience required.</p>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="lp-cta-actions">
              <button className="lp-cta-hero lp-cta-hero-primary" onClick={onSignup}>
                <span className="lp-cta-hero-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </span>
                Join free
              </button>
              <button className="lp-cta-hero lp-cta-hero-secondary" onClick={onBrowseAsGuest}>
                <span className="lp-cta-hero-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </span>
                Browse as guest
              </button>
            </div>
          </Reveal>
        </div>
        <div className="lp-cta-disclaimer">
          Collaborator activity simulated for demonstration.
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <nav className="lp-footer-links" style={{ justifyContent: 'center', width: '100%' }}>
            <a onClick={() => scrollTo('lp-tools')}>Tools</a>
            <a onClick={() => scrollTo('lp-builds')}>What&apos;s on Prompted</a>
            <a onClick={() => scrollTo('lp-communities')}>Communities</a>
            <a onClick={() => scrollTo('lp-rank')}>Builder Rank</a>
            <a href="/privacypolicy" onClick={(e) => { e.preventDefault(); onFooterLink && onFooterLink('privacy'); }}>Privacy</a>
            <a href="/termsandconditions" onClick={(e) => { e.preventDefault(); onFooterLink && onFooterLink('terms'); }}>Terms</a>
          </nav>
        </div>
        <div 
          className="lp-footer-big-brand" 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          role="button"
          tabIndex={0}
          aria-label="Scroll to top"
        >
          PROMPTED
        </div>
      </footer>

    </div>
  );
}

// Cursors for collaborative UI effect
export const Cursor = ({ className, children, style }) => (
  <span
    className={`lp-collab-cursor-container ${className || ''}`}
    style={style}
  >
    {children}
  </span>
);

export const CursorPointer = ({ className, color }) => (
  <svg
    aria-hidden="true"
    focusable="false"
    className={`lp-collab-cursor-pointer ${className || ''}`}
    style={{ color: color || 'currentColor' }}
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    fill="none"
    viewBox="0 0 20 20"
  >
    <path
      fill="currentColor"
      d="M19.438 6.716 1.115.05A.832.832 0 0 0 .05 1.116L6.712 19.45a.834.834 0 0 0 1.557.025l3.198-8 7.995-3.2a.833.833 0 0 0 0-1.559h-.024Z"
    />
  </svg>
);

export const CursorBody = ({ children, className, style }) => (
  <span
    className={`lp-collab-cursor-body ${className || ''}`}
    style={style}
  >
    {children}
  </span>
);

export const CursorName = ({ children, style }) => (
  <span className="lp-collab-cursor-name" style={style}>
    {children}
  </span>
);

export const CursorMessage = ({ children }) => (
  <span className="lp-collab-cursor-msg">
    {children}
  </span>
);

// Bounding box selection dragging + typing micro-interaction animator
export const CollabCursorAnimator = ({ name, status, color, delay, startPos, endPos, borderTexture }) => {
  const [phase, setPhase] = React.useState('idle'); // idle -> moving -> dragging -> typing -> active
  const [typedText, setTypedText] = React.useState('');
  const [cursorPos, setCursorPos] = React.useState(startPos);

  React.useEffect(() => {
    // Stagger starts randomly to decouple cursors
    const initialDelay = delay + Math.random() * 6000;
    
    let startTimeout = setTimeout(() => {
      runAnimationCycle();
    }, initialDelay);

    let interval;
    
    function runAnimationCycle() {
      // 1. Move to start position (takes 1.2s)
      setPhase('moving');
      setCursorPos(startPos);
      setTypedText('');

      // After 1.2s, start dragging
      setTimeout(() => {
        setPhase('dragging');
        // Animate dragging from startPos to endPos
        let step = 0;
        const steps = 35;
        
        interval = setInterval(() => {
          step++;
          const t = step / steps;
          // Eased drag interpolation
          const currentX = startPos.left + (endPos.left - startPos.left) * t;
          const currentY = startPos.top + (endPos.top - startPos.top) * t;
          setCursorPos({ left: currentX, top: currentY });
          
          if (step >= steps) {
            clearInterval(interval);
            // 2. Start typing phase after drag completes
            setPhase('typing');
            let charIndex = 0;
            const typingInterval = setInterval(() => {
              charIndex++;
              setTypedText(status.substring(0, charIndex));
              if (charIndex >= status.length) {
                clearInterval(typingInterval);
                setPhase('active');
                
                // 3. Stay active for 12 seconds
                setTimeout(() => {
                  // 4. Backspace phase: erase characters one-by-one
                  setPhase('backspacing');
                  let backIndex = status.length;
                  const deleteInterval = setInterval(() => {
                    backIndex--;
                    setTypedText(status.substring(0, backIndex));
                    if (backIndex <= 0) {
                      clearInterval(deleteInterval);
                      
                      // 5. Shrink phase: drag cursor back to startPos, shrinking the box
                      setPhase('shrinking');
                      let shrinkStep = 0;
                      const shrinkSteps = 35;
                      
                      const shrinkInterval = setInterval(() => {
                        shrinkStep++;
                        const t = shrinkStep / shrinkSteps;
                        const reverseT = 1 - t; // goes from 1 to 0
                        const currentX = startPos.left + (endPos.left - startPos.left) * reverseT;
                        const currentY = startPos.top + (endPos.top - startPos.top) * reverseT;
                        setCursorPos({ left: currentX, top: currentY });
                        
                        if (shrinkStep >= shrinkSteps) {
                          clearInterval(shrinkInterval);
                          // 6. Reset to idle phase and trigger cooldown
                          setPhase('idle');
                          const nextCooldown = 12000 + Math.random() * 10000;
                          setTimeout(runAnimationCycle, nextCooldown);
                        }
                      }, 25);
                    }
                  }, 40); // slightly faster deletion speed (40ms/char)
                }, 12000);
              }
            }, 60); // 60ms typing speed
          }
        }, 25); // 25ms step updates
      }, 1200); // 1.2 seconds movement duration
    }

    return () => {
      clearTimeout(startTimeout);
      clearInterval(interval);
    };
  }, [name, status, delay]);

  if (phase === 'idle') return null;

  // Calculate selection box parameters in percentages to prevent layout drifting
  const boxLeft = Math.min(startPos.left, cursorPos.left);
  const boxTop = Math.min(startPos.top, cursorPos.top);
  const boxWidth = Math.max(0.5, Math.abs(cursorPos.left - startPos.left));
  
  // Box height grows to a fixed 38px height (vertical squish guard)
  const totalDragWidth = Math.abs(endPos.left - startPos.left);
  const currentDragWidth = Math.abs(cursorPos.left - startPos.left);
  const dragRatio = totalDragWidth > 0 ? (currentDragWidth / totalDragWidth) : 1;
  const boxHeight = (phase === 'dragging' || phase === 'shrinking') ? Math.max(4, 38 * dragRatio) : 38;

  const boxStyle = {
    position: 'absolute',
    left: `${boxLeft}%`,
    top: `${boxTop}%`,
    width: `${boxWidth}%`,
    minWidth: (phase === 'dragging' || phase === 'shrinking') ? 'auto' : '190px',
    height: `${boxHeight}px`,
    border: `1.5px ${borderTexture || 'dashed'} ${color}`,
    background: `color-mix(in srgb, ${color} 4%, rgba(12, 12, 14, 0.4))`,
    borderRadius: '6px',
    pointerEvents: 'none',
    display: phase === 'moving' ? 'none' : 'flex',
    alignItems: 'center',
    padding: '0 10px',
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    boxShadow: `0 8px 32px rgba(0, 0, 0, 0.4)`,
    zIndex: 4,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  };

  return (
    <>
      {/* The Drawn Input Box */}
      <div className="lp-collab-box" style={boxStyle}>
        <span>{typedText}</span>
        {(phase === 'typing' || phase === 'backspacing' || phase === 'active') && (
          <span 
            style={{
              display: 'inline-block',
              width: '2.5px',
              height: '13px',
              background: color,
              marginLeft: '3.5px',
              animation: 'blink 0.8s infinite',
              verticalAlign: 'middle'
            }}
          />
        )}
      </div>

      {/* The Cursor Pointer */}
      <div
        className="lp-collab-cursor-container"
        style={{
          left: `${cursorPos.left}%`,
          top: `${cursorPos.top}%`,
          transition: phase === 'moving' ? 'left 1.2s cubic-bezier(0.25, 1, 0.5, 1), top 1.2s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
          zIndex: 10,
        }}
      >
        <CursorPointer color={color} />
        {/* Name pill next to the pointer */}
        <span
          className="lp-collab-cursor-body"
          style={{
            marginTop: '8px',
            marginLeft: '4px',
            padding: '2px 6px',
            fontSize: '9.5px',
            background: color,
            color: '#000',
            fontWeight: 800,
            borderRadius: '4px',
            border: 'none',
            backdropFilter: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}
        >
          {name}
        </span>
      </div>
    </>
  );
};

// ── Scoped styles (all prefixed with lp-) ──
const landingStyles = `
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
  --font-sans: 'Urbanist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-display: 'Instrument Serif', ui-serif, Georgia, 'Times New Roman', serif;
  --font-accent: 'Instrument Serif', ui-serif, Georgia, 'Times New Roman', serif;
  --font-mono: ui-monospace, 'SF Mono', 'Menlo', 'Consolas', monospace;

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
.lp-wrap { max-width: 1692px; margin: 0 auto; padding: 0 28px; position: relative; }

/* Nav */
.lp-nav { position: sticky; top: 0; z-index: 50; background: transparent; }
.lp-nav .lp-wrap { max-width: none; padding: 0 44px; display: flex; align-items: center; height: 76px; gap: 40px; }
.lp-brand { display: flex; align-items: center; gap: 12px; font-family: 'Fraunces', Georgia, serif; font-weight: 900; font-size: 24px; color: #f5ebe0; -webkit-text-stroke: 0.6px #1a1a1a; paint-order: stroke fill; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.55); letter-spacing: -0.5px; flex-shrink: 0; transition: opacity .2s ease; text-decoration: none; }
.lp-brand:hover { opacity: 0.85; }
.lp-brand-icon { width: 28px; height: 28px; }
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
.lp-hero { padding: 80px 0 100px; position: relative; isolation: isolate; overflow: hidden; }
.lp-hero-wrap { position: relative; z-index: 2; text-align: center; }

/* Hero background video */
.lp-hero-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  pointer-events: none;
}
.lp-hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(5,5,5,0.55) 0%, rgba(5,5,5,0.75) 40%, rgba(5,5,5,0.92) 100%);
  z-index: 1;
  pointer-events: none;
}
.lp-hero-bottom-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 250px;
  background: linear-gradient(to bottom, rgba(5, 5, 5, 0) 0%, #050505 100%);
  z-index: 3;
  pointer-events: none;
}


.lp-hero-trust {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 40px;
}
.lp-hero-trust strong { color: var(--text-secondary); font-weight: 600; }
.lp-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0; box-shadow: 0 0 6px rgba(34,197,94,0.4); }

.lp-hero-title { font-family: var(--font-display); font-weight: 400; font-size: clamp(48px, 7.4vw, 96px); line-height: 1.04; letter-spacing: -0.018em; margin: 0 auto 28px; max-width: 22ch; color: var(--text-primary); }
.lp-hero-title em { font-family: var(--font-accent); font-style: italic; font-weight: 400; letter-spacing: -0.012em; padding-right: 0.02em; background: linear-gradient(135deg, #F5C518 0%, #E0A815 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.lp-ai-burst { position: relative; display: inline; pointer-events: none; }
.lp-ai-burst-particle { position: absolute; font-size: 0.35em; line-height: 1; pointer-events: none; color: var(--text-primary); }
.lp-ai-burst-particle > span { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: inline-flex; }
.lp-hero-sub { font-size: 20px; line-height: 1.5; color: var(--text-tertiary); max-width: 540px; margin: 0 auto 40px; }
.lp-hero-ctas { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; justify-content: center; }
.lp-cta-hero { position: relative; display: inline-flex; align-items: center; gap: 10px; border: 1px solid transparent; border-radius: 999px; padding: 14px 28px; font-family: inherit; font-size: 15px; font-weight: 600; letter-spacing: -0.005em; cursor: pointer; overflow: hidden; transition: transform .22s cubic-bezier(.2,.7,.2,1), box-shadow .22s cubic-bezier(.2,.7,.2,1), border-color .2s ease, background-color .2s ease; will-change: transform; isolation: isolate; }
.lp-cta-hero:active { transform: translateY(1px) scale(.99); transition-duration: .08s; }
.lp-cta-hero-icon { display: inline-flex; align-items: center; flex-shrink: 0; transition: transform .25s cubic-bezier(.2,.7,.2,1); }
.lp-cta-hero-icon svg { width: 16px; height: 16px; }
.lp-cta-hero-primary { background: linear-gradient(180deg, #ffffff 0%, #f4f4f5 100%); color: #0a0a0a; box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.6), 0 10px 24px -8px rgba(255,215,0,0.35), 0 4px 12px rgba(0,0,0,0.3); }
.lp-cta-hero-primary:hover { transform: translateY(-2px); box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.6), 0 22px 44px -10px rgba(255,215,0,0.5), 0 10px 22px rgba(0,0,0,0.4); }
.lp-cta-hero-primary::before { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, rgba(255,255,255,0) 10%, rgba(255, 215, 0, 0.1) 25%, rgba(255, 225, 0, 0.6) 40%, rgba(255, 255, 255, 1) 50%, rgba(255, 225, 0, 0.6) 60%, rgba(255, 215, 0, 0.1) 75%, rgba(255,255,255,0) 90%); transform: translateX(-160%); transition: transform 2.8s cubic-bezier(0.15, 0.85, 0.35, 1); pointer-events: none; mix-blend-mode: screen; }
.lp-cta-hero-primary:hover::before { transform: translateX(160%); }
.lp-cta-hero-primary:hover .lp-cta-hero-icon { transform: translateX(4px); }
.lp-cta-hero-secondary { background: rgba(255, 255, 255, 0.02); color: rgba(255, 255, 255, 0.8); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: inset 0 2px 8px rgba(255, 255, 255, 0.05), inset 0 -4px 16px rgba(0, 0, 0, 0.4), inset 0 0 4px rgba(255, 255, 255, 0.02), 0 4px 16px rgba(0, 0, 0, 0.2); border-top-color: rgba(255, 255, 255, 0.1); border-left-color: rgba(255, 255, 255, 0.05); border-bottom-color: rgba(255, 255, 255, 0.01); border-right-color: rgba(255, 255, 255, 0.01); }
.lp-cta-hero-secondary:hover { background: rgba(255, 255, 255, 0.04); transform: translateY(-2px); box-shadow: inset 0 4px 12px rgba(255, 255, 255, 0.1), inset 0 -8px 24px rgba(0, 0, 0, 0.5), inset 0 0 8px rgba(255, 255, 255, 0.05), 0 12px 24px rgba(0, 0, 0, 0.4); border-top-color: rgba(255, 255, 255, 0.2); border-left-color: rgba(255, 255, 255, 0.1); }
.lp-cta-hero-secondary:hover .lp-cta-hero-icon { transform: translateY(-2px); }
@media (prefers-reduced-motion: reduce) {
  .lp-cta-hero, .lp-cta-hero-icon, .lp-cta-hero-primary::before { transition: none; animation: none; }
  .lp-cta-hero:hover { transform: none; }
  .lp-cta-hero-primary:hover::before { transform: translateX(-120%); }
  .lp-cta-hero-primary:hover .lp-cta-hero-icon, .lp-cta-hero-secondary:hover .lp-cta-hero-icon { transform: none; }
}

/* Hero Preview - dashboard card */
.lp-hero-preview { margin-top: 72px; background: rgba(255, 255, 255, 0.02); border-radius: 24px; position: relative; overflow: hidden; backdrop-filter: blur(48px); -webkit-backdrop-filter: blur(48px); box-shadow: inset 0 12px 48px rgba(255, 255, 255, 0.05), inset 0 -32px 128px rgba(0, 0, 0, 0.8), inset 0 0 32px rgba(255, 255, 255, 0.02), 0 24px 64px rgba(0, 0, 0, 0.3); border-top: 1px solid rgba(255, 255, 255, 0.1); border-left: 1px solid rgba(255, 255, 255, 0.05); border-bottom: 1px solid rgba(255, 255, 255, 0.01); border-right: 1px solid rgba(255, 255, 255, 0.01); width: 100%; }



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
.lp-band::before { display: none; }
.lp-section-lead { max-width: 720px; margin-bottom: 52px; }
.lp-eyebrow-tag { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--text-muted); margin-bottom: 18px; }
.lp-eyebrow-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent-gold); box-shadow: 0 0 8px rgba(255,215,0,0.6); }
.lp-section-lead h2 { font-family: var(--font-display); font-weight: 400; font-size: clamp(36px, 5vw, 64px); line-height: 1.06; letter-spacing: -0.015em; margin: 0 0 18px; color: var(--text-primary); }
.lp-section-lead h2 em { font-family: var(--font-accent); font-style: italic; font-weight: 400; letter-spacing: -0.01em; padding-right: 0.02em; background: linear-gradient(135deg, #F5C518 0%, #E0A815 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.lp-section-lead p { font-size: 17px; color: var(--text-tertiary); line-height: 1.55; margin: 0; max-width: 64ch; }

/* Section headline */
.lp-tools-head { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin: 0 0 18px; }
.lp-tools-h1 { font-family: var(--font-display); font-weight: 400; font-size: clamp(36px, 5vw, 64px); line-height: 1.06; letter-spacing: -0.015em; color: var(--text-primary); }
.lp-tools-h2 { font-family: var(--font-accent); font-style: italic; font-weight: 400; font-size: clamp(36px, 5vw, 64px); line-height: 1.06; letter-spacing: -0.01em; background: linear-gradient(135deg, #F5C518 0%, #E0A815 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }

/* Chart section */
.lp-chart { margin-top: 40px; background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%); border: 1px solid var(--border-color); border-radius: 20px; overflow: hidden; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: var(--shadow-card); }
.lp-chart-header { padding: 14px 22px; border-bottom: 1px solid var(--border-color); }
.lp-chart-context { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.2em; }
.lp-chart-context svg { width: 14px; height: 14px; opacity: 0.5; }

.lp-chart-body { display: flex; }

/* Left - model list */
.lp-chart-models { width: 25%; min-width: 140px; flex-shrink: 0; padding: 18px 16px; border-right: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 14px; justify-content: center; }
.lp-chart-model-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.lp-chart-model-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.lp-chart-model-name { font-size: 13px; font-weight: 600; color: var(--text-secondary); letter-spacing: -0.005em; }

/* Right - bar chart */
.lp-chart-bars { flex: 1; padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; }
.lp-chart-bar-headers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 2px; }
.lp-chart-bar-hd { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 9.5px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; }
.lp-chart-hd-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

.lp-chart-bar-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: center; }
.lp-bar-wrap { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); }
.lp-bar { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.05); flex: 1; overflow: hidden; position: relative; min-width: 40px; }
.lp-bar-fill { height: 100%; border-radius: 999px; }
.lp-bar-val { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); width: 24px; text-align: right; flex-shrink: 0; }

/* Pillars */
.lp-pillars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
@media (max-width: 980px) { .lp-pillars { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .lp-pillars { grid-template-columns: 1fr; } }
.lp-pillar-new {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 240px;
  background: rgba(255, 255, 255, 0.02); 
  border: 1px solid rgba(255, 255, 255, 0.03);
  box-shadow: 
    inset 0 6px 16px rgba(255, 255, 255, 0.1),
    inset 0 -16px 32px rgba(0, 0, 0, 0.6),
    inset 0 0 16px rgba(255, 255, 255, 0.05),
    0 12px 32px rgba(0, 0, 0, 0.2);
  border-radius: 24px;
  padding: 32px 28px;
  cursor: pointer;
  overflow: hidden;
  isolation: isolate;
  transition: transform .35s cubic-bezier(.2,.7,.2,1), border-color .3s ease, box-shadow .35s ease, background-color .3s ease;
  will-change: transform;
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  --pillar-color: #FFD700;
}
.lp-pillar-new-glow { 
  position: absolute; 
  pointer-events: none; 
  inset: 0; 
  background: radial-gradient(280px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, var(--pillar-color) 12%, transparent), transparent 60%); 
  opacity: 0; 
  transition: opacity .3s ease; 
  z-index: 0; 
}
.lp-pillar-new:hover {
  transform: translateY(-6px);
  border-color: rgba(255, 255, 255, 0.05); 
  box-shadow: 
    inset 0 8px 24px rgba(255, 255, 255, 0.15), 
    inset 0 -20px 40px rgba(0, 0, 0, 0.7), 
    inset 0 0 20px rgba(255, 255, 255, 0.08), 
    0 25px 50px -12px rgba(0, 0, 0, 0.6),
    0 12px 24px -6px color-mix(in srgb, var(--pillar-color) 35%, transparent);
}
.lp-pillar-new:hover .lp-pillar-new-glow {
  opacity: 1;
}
.lp-pillar-new-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  position: relative;
  z-index: 2;
}
.lp-pillar-new-header h3 {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 400;
  color: white;
  margin: 0;
  letter-spacing: -0.01em;
}
.lp-pillar-new-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--pillar-color) 12%, transparent);
  color: var(--pillar-color);
  transition: transform .4s cubic-bezier(.2,.7,.2,1), background-color .3s ease;
  border: 1px solid color-mix(in srgb, var(--pillar-color) 22%, transparent);
}
.lp-pillar-new-icon svg {
  width: 18px;
  height: 18px;
}
.lp-pillar-new:hover .lp-pillar-new-icon {
  transform: scale(1.15) rotate(-8deg);
  background: color-mix(in srgb, var(--pillar-color) 22%, transparent);
}
.lp-pillar-new-arrow {
  color: rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
}
.lp-pillar-new:hover .lp-pillar-new-arrow {
  color: var(--pillar-color);
  transform: scale(1.1) rotate(-45deg);
  opacity: 1;
}
.lp-pillar-new-desc {
  font-size: 13.5px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.65);
  margin: 0 0 24px 0;
  flex-grow: 1;
  position: relative;
  z-index: 2;
}
.lp-pillar-new-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
  position: relative;
  z-index: 2;
}
.lp-pillar-new-tag {
  font-size: 10.5px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.03);
  box-shadow: 
    inset 0 2px 6px rgba(255, 255, 255, 0.05), 
    inset 0 -4px 12px rgba(0, 0, 0, 0.4), 
    inset 0 0 8px rgba(255, 255, 255, 0.01);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 5px 10px;
  border-radius: 8px;
  transition: all 0.25s ease;
}
.lp-pillar-new:hover .lp-pillar-new-tag {
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow: 
    inset 0 3px 8px rgba(255, 255, 255, 0.08), 
    inset 0 -6px 16px rgba(0, 0, 0, 0.5), 
    inset 0 0 10px rgba(255, 255, 255, 0.02);
}
@media (prefers-reduced-motion: reduce) { .lp-pillar-new, .lp-pillar-new::before, .lp-pillar-new-icon, .lp-pillar-new-arrow { transition: none; } .lp-pillar-new:hover { transform: none; } .lp-pillar-new:hover .lp-pillar-new-icon { transform: none; } .lp-pillar-new:hover .lp-pillar-new-arrow { transform: none; } }

/* Communities */
.lp-communities { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 36px; }
@media (max-width: 860px) { .lp-communities { grid-template-columns: 1fr; } }
.lp-community-wrap { position: relative; border-radius: 18px; transition: transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .3s ease; cursor: pointer; }
.lp-community-wrap:hover { transform: translateY(-3px); box-shadow: 0 24px 48px -12px color-mix(in srgb, var(--community-tone) 35%, transparent), 0 10px 20px rgba(0,0,0,0.4); }
.lp-community { position: relative; background: linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.005) 100%); border: 1px solid var(--border-color); border-radius: 18px; padding: 22px; overflow: hidden; transition: border-color .3s ease; --community-tone: #FFD700; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.lp-community-glow { position: absolute; pointer-events: none; inset: 0; background: radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, var(--community-tone) 12%, transparent), transparent 60%); opacity: 0; transition: opacity .3s ease; z-index: 0; }
.lp-community-wrap:hover .lp-community { border-color: color-mix(in srgb, var(--community-tone) 40%, transparent); }
.lp-community-wrap:hover .lp-community-glow { opacity: 1; }
.lp-community > * { position: relative; z-index: 1; }
.lp-community-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
.lp-community-emoji { font-size: 22px; line-height: 1; }
.lp-community-members { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.lp-community h4 { font-family: var(--font-display); font-weight: 400; font-size: 26px; letter-spacing: -0.015em; margin: 0 0 8px; line-height: 1.1; }
.lp-community p { font-size: 13.5px; color: var(--text-tertiary); line-height: 1.5; margin: 0 0 16px; }
.lp-community-stats { display: flex; gap: 14px; font-size: 11.5px; color: var(--text-muted); font-family: var(--font-mono); }

/* Leaderboard Redesign */
.lp-leaderboard-card {
  position: relative;
  background: rgba(255, 255, 255, 0.02); 
  border: 1px solid rgba(255, 255, 255, 0.03);
  box-shadow: 
    inset 0 6px 16px rgba(255, 255, 255, 0.08),
    inset 0 -20px 40px rgba(0, 0, 0, 0.7),
    0 12px 32px rgba(0, 0, 0, 0.4);
  border-radius: 28px;
  padding: 18px 24px;
  backdrop-filter: blur(32px);
  -webkit-backdrop-filter: blur(32px);
  overflow: hidden;
}

.lp-leaderboard-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 16px;
}
@media (max-width: 500px) {
  .lp-leaderboard-header-row {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
    text-align: center;
  }
}

.lp-leaderboard-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 500;
  color: white;
  margin: 0;
  letter-spacing: -0.01em;
}

.lp-leaderboard-tier-btn {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.7);
  font-size: 15px;
  font-weight: 500;
  padding: 12px 24px;
  border-radius: 28px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  transition: all 0.25s ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
@media (max-width: 500px) {
  .lp-leaderboard-tier-btn {
    justify-content: center;
  }
}
.lp-leaderboard-tier-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

/* 3D Podium Container */
.lp-podium-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  align-items: end;
  margin-bottom: 10px;
  padding-top: 0px;
}

.lp-podium-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  text-align: center;
}

.lp-podium-avatar-wrapper {
  position: relative;
  margin-bottom: 12px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}
.lp-podium-crown {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%) rotate(4deg);
  font-size: 14px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
  animation: crownPulse 3s ease-in-out infinite;
}
@keyframes crownPulse {
  0%, 100% { transform: translateX(-50%) rotate(4deg) scale(1); }
  50% { transform: translateX(-50%) rotate(8deg) scale(1.1); }
}

.lp-podium-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.lp-podium-avatar-text {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

.place-1 .lp-podium-avatar {
  width: 56px;
  height: 56px;
  border-color: #F5C518;
  box-shadow: 0 0 16px rgba(245, 197, 24, 0.25);
}
.place-1 .lp-podium-avatar-wrapper {
  width: 56px;
  height: 56px;
}
.place-1 .lp-podium-avatar-text {
  width: 56px;
  height: 56px;
  border-color: #F5C518;
  box-shadow: 0 0 16px rgba(245, 197, 24, 0.25);
}

.place-2 .lp-podium-avatar {
  border-color: #E2E8F0;
  box-shadow: 0 0 12px rgba(226, 232, 240, 0.2);
}
.place-2 .lp-podium-avatar-text {
  border-color: #E2E8F0;
  box-shadow: 0 0 12px rgba(226, 232, 240, 0.2);
}

.place-3 .lp-podium-avatar {
  border-color: #C57836;
  box-shadow: 0 0 12px rgba(197, 120, 54, 0.2);
}
.place-3 .lp-podium-avatar-text {
  border-color: #C57836;
  box-shadow: 0 0 12px rgba(197, 120, 54, 0.2);
}

.lp-podium-name {
  font-size: 13px;
  font-weight: 500;
  color: white;
  margin-bottom: 8px;
  max-width: 100px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lp-podium-box {
  width: 100%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.002) 100%);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-bottom: none;
  border-radius: 16px 16px 0 0;
  padding: 24px 12px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  gap: 4px;
  box-shadow: 
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 -8px 24px rgba(0, 0, 0, 0.4);
}

.lp-podium-bg-num {
  position: absolute;
  right: 12px;
  font-family: var(--font-display);
  font-weight: 900;
  color: rgba(255, 255, 255, 0.015);
  line-height: 1;
  pointer-events: none;
  user-select: none;
}
.place-1 .lp-podium-bg-num {
  font-size: 240px;
  bottom: -40px;
  color: rgba(245, 197, 24, 0.018);
}
.place-2 .lp-podium-bg-num {
  font-size: 175px;
  bottom: -25px;
}
.place-3 .lp-podium-bg-num {
  font-size: 125px;
  bottom: -15px;
}

.place-1 .lp-podium-box {
  height: 200px;
  border-top: 2px solid #F5C518;
  border-color: rgba(245, 197, 24, 0.2);
  background: linear-gradient(180deg, rgba(245, 197, 24, 0.06) 0%, rgba(0, 0, 0, 0) 100%);
}
.place-2 .lp-podium-box {
  height: 155px;
  border-top: 2px solid rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.08);
}
.place-3 .lp-podium-box {
  height: 125px;
  border-top: 2px solid rgba(197, 120, 54, 0.3);
  border-color: rgba(197, 120, 54, 0.12);
}

.lp-podium-badge {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 20px;
  margin-bottom: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  z-index: 2;
}
.lp-podium-badge.gold {
  background: rgba(245, 197, 24, 0.08);
  color: #F5C518;
  border-color: rgba(245, 197, 24, 0.2);
  box-shadow: 0 4px 12px rgba(245, 197, 24, 0.1);
}
.lp-podium-badge.silver {
  background: rgba(255, 255, 255, 0.06);
  color: #E2E8F0;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(255, 255, 255, 0.05);
}
.lp-podium-badge.bronze {
  background: rgba(197, 120, 54, 0.08);
  color: #C57836;
  border-color: rgba(197, 120, 54, 0.2);
  box-shadow: 0 4px 12px rgba(197, 120, 54, 0.1);
}

.lp-podium-pts-label {
  font-size: 9px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.08em;
  margin-bottom: 2px;
  z-index: 2;
}
.lp-podium-pts {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 700;
  color: white;
  margin-bottom: 12px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  z-index: 2;
}
.place-1 .lp-podium-pts {
  font-size: 24px;
  color: #F5C518;
  text-shadow: 0 0 16px rgba(245, 197, 24, 0.3);
}
.place-2 .lp-podium-pts {
  color: #E2E8F0;
}
.place-3 .lp-podium-pts {
  color: #C57836;
}

.lp-podium-prize-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 600;
  z-index: 2;
}

/* Info Pill */
.lp-leaderboard-summary-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid rgba(255, 255, 255, 0.03);
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 10px;
  min-width: 0;
}
.lp-marquee-container {
  overflow: hidden;
  white-space: nowrap;
  display: flex;
  flex: 1;
  min-width: 0;
}
.lp-marquee-content {
  display: inline-flex;
  gap: 32px;
}
.lp-marquee-content span {
  flex-shrink: 0;
}
.lp-marquee-content span:last-child {
  display: none;
}
.lp-summary-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #F5C518;
  box-shadow: 0 0 8px #F5C518;
  flex-shrink: 0;
}

/* Leaderboard List */
.lp-leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lp-leaderboard-row {
  display: flex;
  align-items: center;
  padding: 5px 10px;
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid rgba(255, 255, 255, 0.02);
  border-radius: 14px;
  transition: all 0.2s ease;
  cursor: pointer;
}
.lp-leaderboard-row:hover {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.06);
  transform: translateX(4px);
}

.lp-leaderboard-pos {
  width: 32px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.lp-leaderboard-user {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.lp-leaderboard-avatar-small {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  overflow: hidden;
}
.lp-leaderboard-avatar-small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lp-leaderboard-names {
  display: flex;
  flex-direction: column;
}
.lp-leaderboard-names .display-name {
  font-size: 13.5px;
  font-weight: 500;
  color: white;
}
.lp-leaderboard-names .username {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 1px;
}

.lp-leaderboard-pts {
  font-family: var(--font-mono);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

/* Rank Tiers Overlay */
.lp-tiers-overlay {
  position: absolute;
  inset: 0;
  background: #070707;
  border: 1px solid rgba(255, 255, 255, 0.03);
  box-shadow: 
    inset 0 6px 16px rgba(255, 255, 255, 0.08),
    inset 0 -20px 40px rgba(0, 0, 0, 0.7);
  z-index: 100;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  border-radius: 28px;
}

.lp-tiers-overlay-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.lp-tiers-overlay-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 10px;
  flex: none;
}
.lp-tiers-overlay-header h3 {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 400;
  color: white;
  margin: 0;
}

.lp-tiers-close-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
  border-radius: 0;
}
.lp-tiers-close-btn:hover {
  color: white;
}

.lp-tiers-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  overflow-y: hidden;
  overflow-x: hidden;
  padding: 12px 16px;
  flex: 1;
}
@media (max-width: 1100px) {
  .lp-tiers-grid {
    grid-template-columns: repeat(2, 1fr);
    padding: 10px 12px;
    gap: 12px;
    overflow-y: auto;
  }
}
@media (max-width: 760px) {
  .lp-tiers-grid {
    grid-template-columns: 1fr;
    padding: 10px 8px;
    gap: 12px;
    overflow-y: auto;
  }
}

.lp-tier-card-container {
  perspective: 1000px;
  height: 200px;
  cursor: pointer;
  position: relative;
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.lp-tier-card-flipper {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}
.lp-tier-card-flipper.flipped {
  transform: rotateY(180deg);
}

.lp-tier-card-front, .lp-tier-card-back {
  position: absolute !important;
  inset: 0;
  width: 100%;
  height: 100%;
  backface-visibility: hidden !important;
  -webkit-backface-visibility: hidden !important;
  transform-style: preserve-3d;
}
.lp-tier-card-front {
  transform: rotateY(0deg) !important;
}
.lp-tier-card-back {
  transform: rotateY(180deg) !important;
}

.lp-tier-card {
  position: relative;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px;
  overflow: hidden;
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.3s ease;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  -webkit-font-smoothing: subpixel-antialiased;
}
.lp-tier-card-container:hover {
  transform: translateY(-8px);
}
.lp-tier-card-container:hover .lp-tier-card {
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.85);
}

.lp-tier-card-border-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(300px circle at var(--mx, 0px) var(--my, 0px), color-mix(in srgb, var(--rank-tone) 85%, white) 0%, var(--rank-tone) 45%, transparent 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 1;
}
.lp-tiers-grid:hover .lp-tier-card-border-glow {
  opacity: 1;
}

.lp-tier-card-inner {
  background: #0d0d0e;
  border-radius: 18px;
  padding: 16px 12px 12px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 2;
  overflow: hidden;
  flex: 1;
}

.lp-tier-card-front-title {
  position: absolute;
  top: 14px;
  left: 18px;
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.35);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.lp-tier-card-badge-wrap {
  margin-bottom: 8px;
  transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 84px;
  position: relative;
  z-index: 1;
  will-change: transform;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
}
.lp-tier-card-badge-wrap svg {
  will-change: transform;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
}
.lp-tier-card-container:hover .lp-tier-card-badge-wrap {
  transform: scale(1.16) rotate(4deg);
}

.lp-tier-card-pts {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--rank-tone);
  background: #070708;
  border: 1px solid color-mix(in srgb, var(--rank-tone) 40%, transparent);
  padding: 3px 10px;
  border-radius: 6px;
  display: inline-block;
  margin-top: 10px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
}

/* Card Back Details */
.lp-tier-card-back-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 10;
  opacity: 0.75;
}

.lp-tier-card-back-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

.lp-tier-card-back-perks {
  font-size: 16px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.95);
  margin: 0;
  font-weight: 400;
  max-width: 200px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.lp-tier-card-click-hint {
  position: absolute;
  bottom: 12px;
  right: 14px;
  font-family: var(--font-mono);
  font-size: 8px;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.1em;
  opacity: 0.65;
  pointer-events: none;
  z-index: 10;
}
/* Final CTA */
.lp-cta-band { padding: 140px 0 148px; text-align: center; position: relative; overflow: hidden; isolation: isolate; }
.lp-cta-band::before { display: none; }
.lp-cta-title { font-family: var(--font-display); font-weight: 400; font-size: clamp(44px, 5.6vw, 72px); line-height: 1.06; letter-spacing: -0.018em; margin: 0 0 20px; color: var(--text-primary); }
.lp-cta-title em { font-family: var(--font-accent); font-style: italic; font-weight: 400; letter-spacing: -0.01em; padding-right: 0.02em; background: linear-gradient(135deg, #F5C518 0%, #E0A815 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.lp-cta-sub { font-size: 18px; line-height: 1.5; color: var(--text-tertiary); margin: 0 auto 32px; max-width: 520px; }
.lp-cta-actions { display: inline-flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.lp-cta-btn { min-width: 168px; padding: 14px 26px; font-size: 15px; }
.lp-cta-disclaimer {
  position: absolute;
  bottom: 24px;
  left: 24px;
  font-size: 9px;
  font-family: var(--font-mono);
  color: rgba(255, 255, 255, 0.18);
  pointer-events: none;
  letter-spacing: 0.05em;
  z-index: 5;
}

@media (max-width: 768px) {
  .lp-cta-disclaimer {
    left: 0;
    right: 0;
    text-align: center;
    bottom: 16px;
  }
}

/* Collab Cursors styling */
.lp-collab-cursor-container {
  pointer-events: none;
  position: absolute;
  display: flex;
  align-items: flex-start;
  z-index: 1;
  user-select: none;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4));
}

.lp-collab-cursor-pointer {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  transform: rotate(-5deg);
}

.lp-collab-cursor-body {
  margin-left: 4px;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--cursor-color) 8%, rgba(12, 12, 14, 0.8));
  border: 1px solid color-mix(in srgb, var(--cursor-color) 20%, rgba(255, 255, 255, 0.06));
  border-radius: 8px 12px 12px 12px;
  padding: 4px 10px;
  font-size: 11px;
  white-space: nowrap;
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 10;
}

.lp-collab-cursor-name {
  font-weight: 700;
  color: var(--cursor-color, #fff);
  font-size: 11px;
}

.lp-collab-cursor-msg {
  color: rgba(255, 255, 255, 0.7);
  font-size: 10px;
  margin-top: 2px;
}

.lp-cursor-1 {
  animation: floatCursor1 8s ease-in-out infinite alternate;
}
.lp-cursor-2 {
  animation: floatCursor2 6s ease-in-out infinite alternate;
}
.lp-cursor-3 {
  animation: floatCursor3 7s ease-in-out infinite alternate;
}

.lp-cursor-4 {
  animation: floatCursor4 9s ease-in-out infinite alternate;
}
.lp-cursor-5 {
  animation: floatCursor5 5s ease-in-out infinite alternate;
}

@keyframes floatCursor1 {
  0% { transform: translate(0, 0); }
  50% { transform: translate(16px, -12px); }
  100% { transform: translate(-8px, 16px); }
}

@keyframes floatCursor2 {
  0% { transform: translate(0, 0); }
  50% { transform: translate(-18px, 14px); }
  100% { transform: translate(10px, -14px); }
}

@keyframes floatCursor3 {
  0% { transform: translate(0, 0); }
  50% { transform: translate(14px, 14px); }
  100% { transform: translate(-16px, -12px); }
}

@keyframes floatCursor4 {
  0% { transform: translate(0, 0); }
  50% { transform: translate(-12px, -14px); }
  100% { transform: translate(14px, 12px); }
}

@keyframes floatCursor5 {
  0% { transform: translate(0, 0); }
  50% { transform: translate(15px, -10px); }
  100% { transform: translate(-10px, 15px); }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* Models Comparison Sidebar Layout */
.lp-chart-container-row {
  display: flex;
  flex-direction: row;
  gap: 32px;
  align-items: stretch;
  width: 100%;
  margin-top: 40px;
}

.lp-models-comparison-sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 220px;
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid rgba(255, 255, 255, 0.03);
  padding: 16px;
  border-radius: 20px;
  box-shadow: 
    inset 0 4px 12px rgba(255, 255, 255, 0.02),
    0 12px 32px rgba(0, 0, 0, 0.3);
}

.lp-model-comp-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  transition: all 0.25s ease;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.lp-model-comp-row:hover {
  background: rgba(255, 255, 255, 0.035);
  border-color: rgba(255, 255, 255, 0.06);
  transform: translateX(4px);
}

.lp-model-comp-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lp-model-comp-logo {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  padding: 4px;
  box-sizing: border-box;
  flex-shrink: 0;
}

.lp-model-comp-name {
  font-size: 13.5px;
  font-weight: 600;
  color: white;
}

.lp-model-comp-rating {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--model-color);
  background: rgba(255, 255, 255, 0.03);
  padding: 2px 6px;
  border-radius: 6px;
}

.lp-model-comp-bar-bg {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.lp-model-comp-bar-fill {
  height: 100%;
  background: var(--model-color);
  border-radius: 2px;
}

@media (max-width: 768px) {
  .lp-chart-container-row {
    flex-direction: column;
    gap: 24px;
  }
  .lp-models-comparison-sidebar {
    min-width: 0;
    width: 100%;
  }
}

/* Footer */
.lp-footer { 
  padding: 60px 0 20px; 
  border-top: 1px solid rgba(255, 255, 255, 0.03); 
  color: var(--text-muted); 
  font-family: 'Geist Pixel', monospace;
  font-size: 11px;
  letter-spacing: 0.03em;
  position: relative;
  overflow: hidden;
}
.lp-footer .lp-wrap { max-width: none; padding: 0 36px; display: flex; gap: 24px; align-items: center; flex-wrap: wrap; justify-content: center; }
.lp-footer-links { display: flex; gap: 28px; flex-wrap: wrap; justify-content: center; }
.lp-footer-links a { color: var(--text-muted); transition: color .15s ease; cursor: pointer; text-transform: uppercase; }
.lp-footer-links a:hover { color: var(--text-primary); }
.lp-footer-big-brand {
  font-family: 'Geist Pixel', monospace;
  font-size: clamp(48px, 12.8vw, 200px);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.38em;
  text-indent: 0.38em;
  text-align: center;
  line-height: 0.8;
  margin-top: 56px;
  margin-bottom: -6px;
  user-select: none;
  pointer-events: auto;
  cursor: pointer;
  background: linear-gradient(110deg, rgba(255, 255, 255, 0.02) 25%, rgba(255, 255, 255, 0.05) 50%, rgba(255, 255, 255, 0.02) 75%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-mask-image: linear-gradient(to bottom, black 25%, transparent 95%);
  mask-image: linear-gradient(to bottom, black 25%, transparent 95%);
  width: 100%;
  animation: textShimmer 9s linear infinite;
  transition: filter 0.25s ease;
}
.lp-footer-big-brand:hover {
  filter: brightness(1.35);
}

@keyframes textShimmer {
  0% { background-position: 200% center; }
  100% { background-position: -200% center; }
}
@media (max-width: 600px) { 
  .lp-footer .lp-wrap { padding: 0 20px; } 
  .lp-footer-links { gap: 16px; }
  .lp-footer-big-brand { margin-top: 40px; margin-bottom: -4px; }
}

/* Mobile hero tuning */
@media (max-width: 760px) {
  .lp-hero { padding: 80px 0 60px; }
  .lp-field-picker { padding: 22px; }
  .lp-band { padding: 88px 0; }
  .lp-cta-band { padding: 100px 0 110px; }
}
@media (max-width: 640px) {
  .lp-hero-title { font-size: clamp(30px, 9vw, 48px) !important; max-width: 100%; overflow-wrap: break-word; }
  .lp-hero-title em { padding-right: 0.08em; }
  .lp-hero-sub { font-size: 16px !important; line-height: 1.45 !important; margin-bottom: 28px !important; }
}

@keyframes flow {
  from { stroke-dashoffset: 200; }
  to { stroke-dashoffset: 0; }
}
@keyframes pulseGlow {
  0%, 100% { filter: drop-shadow(0 0 2px rgba(255,255,255,0.1)); opacity: 0.95; }
  50% { filter: drop-shadow(0 0 12px rgba(255,255,255,0.45)); opacity: 1; }
}
.shimmer-line-1 { animation: pulseGlow 4s ease-in-out infinite; }
.shimmer-line-2 path.recharts-area-curve { animation: flow 4s linear infinite; }
.shimmer-line-3 path.recharts-area-curve { animation: flow 6s linear infinite reverse; }

.lp-communities-carousel {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 12px 4px 28px 4px;
}
.lp-communities-carousel::-webkit-scrollbar {
  display: none;
}
@media (min-width: 1692px) {
  .lp-communities-carousel {
    overflow: visible;
    justify-content: space-between;
  }
}

/* Responsive Nav Padding */
@media (max-width: 768px) {
  .lp-nav .lp-wrap {
    padding: 0 16px;
    gap: 16px;
  }
}

/* Responsive Container Padding */
@media (max-width: 480px) {
  .lp-wrap {
    padding: 0 16px;
  }
}

/* Mobile Nav Adjustments to prevent overflow */
@media (max-width: 480px) {
  .lp-nav .lp-wrap {
    padding: 0 16px !important;
    gap: 8px !important;
  }
  .lp-nav-cta .lp-btn {
    padding: 8px 12px !important;
    font-size: 13.5px !important;
  }
  .lp-brand {
    font-size: 20px !important;
    gap: 8px !important;
  }
  .lp-brand-icon {
    width: 22px !important;
    height: 22px !important;
  }
}

/* Hide Hero Preview Image on Mobile */
@media (max-width: 768px) {
  .lp-hero-preview {
    display: none !important;
  }
}

/* Hero CTAs side-by-side on Mobile */
@media (max-width: 480px) {
  .lp-hero-ctas {
    flex-wrap: nowrap !important;
    width: 100%;
    gap: 8px !important;
  }
  .lp-cta-hero {
    padding: 10px 12px !important;
    font-size: 12.5px !important;
    flex: 1 1 50%;
    justify-content: center;
    gap: 4px !important;
    white-space: nowrap;
  }
  .lp-cta-hero-icon svg {
    width: 12px !important;
    height: 12px !important;
  }
}

/* Hide Large Chart, Cursors & Boxes on Mobile */
@media (max-width: 768px) {
  .lp-chart-card,
  .lp-collab-cursor-container,
  .lp-collab-box {
    display: none !important;
  }
  .lp-hero-bottom-fade {
    display: block !important;
    height: 120px !important;
    z-index: 1 !important;
  }
}
@media (max-width: 500px) {
  .lp-chart-legend {
    gap: 12px !important;
    justify-content: center !important;
    flex-wrap: wrap;
    padding-right: 0 !important;
  }
}

/* Push Leaderboard Podium down away from crown */
@media (max-width: 768px) {
  .lp-leaderboard-header-row {
    margin-bottom: 48px !important;
  }
}

/* Responsive Leaderboard Podium */
@media (max-width: 480px) {
  .lp-podium-pts {
    font-size: 15px !important;
  }
  .place-1 .lp-podium-pts {
    font-size: 17px !important;
  }
  .lp-podium-pts-label, .lp-podium-prize-label {
    font-size: 8px !important;
  }
  .lp-podium-name {
    font-size: 11px !important;
  }
  .lp-podium-box {
    padding: 12px 6px 10px !important;
  }
  .lp-podium-avatar-wrapper, .lp-podium-avatar, .lp-podium-avatar-text {
    width: 38px !important;
    height: 38px !important;
  }
  .place-1 .lp-podium-avatar-wrapper, .place-1 .lp-podium-avatar, .place-1 .lp-podium-avatar-text {
    width: 48px !important;
    height: 48px !important;
  }
  .lp-leaderboard-summary-pill {
    font-size: 10.5px !important;
    padding: 6px 10px !important;
  }
}

/* Responsive Pillar cards padding */
@media (max-width: 480px) {
  .lp-pillar-new {
    padding: 20px 16px !important;
  }
}

@keyframes lp-marquee {
  0% { transform: translate3d(0, 0, 0); }
  100% { transform: translate3d(calc(-50% - 16px), 0, 0); }
}

@media (max-width: 768px) {
  .lp-marquee-content {
    animation: lp-marquee 20s linear infinite;
  }
  .lp-marquee-content span:last-child {
    display: inline !important;
  }
}

`;
