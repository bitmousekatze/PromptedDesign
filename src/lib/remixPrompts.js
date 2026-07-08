// Prompt templates for the Remix Build feature.
// Each builder takes { designDocUrl, githubRepoUrl, postUrl, postTitle, author, twist }
// and returns a string the user can paste into their chosen AI tool.

const fallbackTwist = (twist) =>
  (twist && twist.trim()) || 'build my own version of this as a learning exercise';

const webLLMTemplate = ({ designDocUrl, githubRepoUrl, postUrl, postTitle, author, twist }) => `I want to remix an existing build from Prompted${postTitle ? ` - "${postTitle}"${author ? ` by @${author}` : ''}` : ''}.

Here is the design doc that describes how the original was made (the prompts used, bugs hit, and how they were fixed):
${designDocUrl || '(no design doc URL provided)'}

${githubRepoUrl ? `Original source code: ${githubRepoUrl}\n\n` : ''}${postUrl ? `Original Prompted post: ${postUrl}\n\n` : ''}Please fetch and read the design doc above. Use it as context for the architecture decisions and prior pitfalls the original builder already solved.

What I want to build: ${fallbackTwist(twist)}.

Start by asking me clarifying questions, then propose a plan.`;

const terminalAgentTemplate = ({ designDocUrl, githubRepoUrl, twist }) => `Clone this repo: ${githubRepoUrl || '(no repo URL provided - ask me for it)'}.

Then save the design doc at ${designDocUrl || '(no design doc URL provided)'} to \`DESIGN.html\` in the project root. Read it carefully - it's a narrative of how the original was built, including prompts, bugs, and fixes.

Once you've read it, help me ${fallbackTwist(twist)}.`;

export const REMIX_TOOLS = [
  { id: 'claude-web', label: 'Claude (web)', kind: 'web' },
  { id: 'chatgpt', label: 'ChatGPT', kind: 'web' },
  { id: 'gemini', label: 'Gemini', kind: 'web' },
  { id: 'claude-code', label: 'Claude Code', kind: 'terminal' },
  { id: 'cursor', label: 'Cursor', kind: 'terminal' },
  { id: 'codex', label: 'Codex', kind: 'terminal' },
];

export function buildRemixPrompt(toolId, params) {
  const tool = REMIX_TOOLS.find(t => t.id === toolId);
  if (!tool) return webLLMTemplate(params);
  return tool.kind === 'terminal' ? terminalAgentTemplate(params) : webLLMTemplate(params);
}
