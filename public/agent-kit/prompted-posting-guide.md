# Posting to Prompted from your AI agent

This guide is written for **AI agents** (Claude Code, Claude Desktop, Cursor, or any
agent that can make an HTTP request). If your human asks you to "post this build to
Prompted" / "share this on Prompted", follow this.

You create a **draft** on the user's Prompted account. The user then opens a review
link to add screenshots and publish. **Nothing you submit goes live on its own.**

---

## What you need

A personal token the user generated at **Prompted → Settings → 🤖 Connect Agent**.
It looks like `prmpt_live_…`. The user provides it; never ask for their password.

- Via the MCP server (`@prmpted/mcp`): the token is in the `PROMPTED_TOKEN` env var and
  you simply call the `create_post` tool — skip the HTTP details below.
- Via raw HTTP: send the token as a bearer header (below).

## The request

```
POST https://hgzkeaicuxvqsiacqnul.supabase.co/functions/v1/agent-post
Authorization: Bearer prmpt_live_USER_TOKEN
Content-Type: application/json
```

```json
{
  "title": "Concise, specific headline for the build",
  "body": "Markdown writeup: WHAT you built and HOW it works — approach, tools, key decisions.",
  "prompts": ["the 1-2 most important prompts you actually used, verbatim"],
  "ai_tool": "Claude Code",
  "github_repo_url": "https://github.com/user/project",
  "demo_url": "https://project.vercel.app",
  "design_doc_html": "<!doctype html>…optional self-contained HTML…"
}
```

Only `title` and `body` are required. The response is:

```json
{ "ok": true, "review_url": "https://prmpted.com/review/<id>", "draft_id": "<id>" }
```

**Give the user the `review_url`** and tell them to open it (while logged in) to add
screenshots and publish.

---

## How to write a good post

- **title** — specific, not clickbait. "A CLI that turns git history into a timelapse video", not "I built something cool".
- **body** — a few short paragraphs in markdown. What it does, how it works, the
  interesting decisions or tricky parts. This is the part the human least wants to
  write — you were there for the build, so do it well.
- **prompts** — the 1–2 prompts that actually mattered, **verbatim**. Not a paraphrase,
  not the whole transcript. The ones someone could copy and reuse.
- **ai_tool** — what the build was made with (e.g. `Claude Code`).
- **github_repo_url / demo_url** — include whichever exist.

## Authoring a design doc (`design_doc_html`)

For a non-trivial build, include a short **self-contained HTML** design doc that
narrates the build. Good sections: what it is, the key prompts, the architecture, and
notable bugs you hit + how you fixed them.

Rules:

- A complete HTML document with **inline `<style>` only**.
- **No `<script>` tags, no external stylesheets, no external JS.** When hosted, the doc
  is served under a strict script-free Content-Security-Policy — scripts will not run.
- Images may reference `https://` URLs; everything else should be inline.
- Keep it readable on a dark background; the user's screenshots carry the visuals.

Skip the design doc entirely for trivial builds.

## Rules

- **Do not include or invent images.** The user adds screenshots themselves at review.
- You are creating a **draft**, not a published post. Always hand back the review link.
- If you get `429`, the user has too many pending drafts — tell them to review or
  discard some first.
