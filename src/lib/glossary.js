// Plain-English definitions for AI/Prompted terminology that appears in the UI.
// Used by the <JargonTerm> component (defined in App.jsx) to render hover tooltips
// next to jargon like "build", "prompt", "fork", etc.

export const GLOSSARY = {
  build: {
    term: 'Build',
    definition: 'A finished AI project someone made - often with the exact steps, prompt, and tools so you can copy it.',
  },
  prompt: {
    term: 'Prompt',
    definition: 'The instructions you give an AI to get what you want. Clearer prompts get better results.',
  },
  fork: {
    term: 'Fork',
    definition: 'Start your own version of someone else\'s build. You get the same starting point, then change it however you like.',
  },
  remix: {
    term: 'Remix',
    definition: 'Take someone else\'s build and make your own version of it.',
  },
  model: {
    term: 'Model',
    definition: 'The specific AI that runs your prompt (for example Claude, GPT-4, or Gemini). Different models are good at different things.',
  },
  tool: {
    term: 'Tool',
    definition: 'An AI service like ChatGPT, Claude, Midjourney, or Sora. Each tool has one or more models behind it.',
  },
  community: {
    term: 'Community',
    definition: 'A group on Prompted focused on one topic, field, or interest. Join the ones that match your world.',
  },
  question: {
    term: 'Question',
    definition: 'Ask the Prompted community anything - from "how do I get started with AI?" to "what tool should I use for this?"',
  },
  track: {
    term: 'Track',
    definition: 'One AI model\'s path through Learning - 10 projects you build with that specific model, from a single web page up to a small app.',
  },
  rubric: {
    term: 'Rubric',
    definition: 'The short checklist the community grades your project against - like "does it work?" and "can you explain it?"',
  },
  'few-shot': {
    term: 'Few-shot',
    definition: 'Showing the AI one or two examples of what you want before asking - it copies the pattern. Great for controlling the exact format of an answer.',
  },
  localstorage: {
    term: 'localStorage',
    definition: 'A small box of memory in your web browser where a page can save data so it\'s still there after you refresh or come back later.',
  },
  api: {
    term: 'API',
    definition: 'A way for your page to ask another service for live data - like asking a weather service "what\'s the forecast?" and getting an answer back.',
  },
};

// Convenience list of the top terms to feature in a first-run glossary card.
export const FEATURED_TERMS = ['prompt', 'build', 'fork', 'model', 'tool'];

export const getGlossaryEntry = (key) => GLOSSARY[key?.toLowerCase?.()] || null;
