// Description renderer. Accepts either:
//   - HTML produced by the WYSIWYG editor (RichTextarea), or
//   - the older markdown dialect (**bold** / *italic* / "- bullet"), or
//   - plain text (with @mentions and URLs).
//
// In all cases @mentions and bare URLs in text content are turned into
// React components that handle clicks, so descriptions can mix formatting
// with social affordances. Bullets render as <ul>/<li>, so the call sites
// mount this in a <div>, not a <p>.

import React from 'react';
import { supabase } from './supabase';
import { sanitizeHtml, looksLikeHtml } from './sanitize.js';
import { EmbeddedLink, safeHttpUrl, LINKIFY_RE } from '../components/EmbeddedLink.jsx';

// Group 1: ***bold+italic***, group 2: **bold**, group 3: *italic*.
// The triple alternative must come first so it wins over the shorter ones.
const INLINE_MD_RE = /\*\*\*([^*\n]+?)\*\*\*|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g;

// Tokenizes markdown links `[label](https://url)` (groups 1+2), bare URLs
// (group 3), and @mentions (groups 4+5) - shared regex in EmbeddedLink.jsx.
// URLs render as EmbeddedLink (hover reveals the destination, click-to-load
// preview); anything that fails safeHttpUrl stays plain text.
function renderMentionsAndUrls(text, onUserClick, keyPrefix, { suppressLinks = false } = {}) {
  if (!text) return null;
  const parts = [];
  let lastIndex = 0;
  let match;
  let i = 0;
  const re = new RegExp(LINKIFY_RE.source, 'g');
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2] !== undefined) {
      // Markdown link - label shown, destination revealed on hover.
      if (suppressLinks) {
        parts.push(match[0]);
      } else {
        const href = safeHttpUrl(match[2]);
        if (href) {
          parts.push(
            <EmbeddedLink key={`${keyPrefix}-l${i++}`} href={href}>{match[1]}</EmbeddedLink>
          );
        } else {
          parts.push(match[0]);
        }
      }
    } else if (match[3]) {
      if (suppressLinks) {
        parts.push(match[3]);
      } else {
        const href = safeHttpUrl(match[3]);
        if (href) {
          parts.push(
            <EmbeddedLink key={`${keyPrefix}-l${i++}`} href={href}>{match[3]}</EmbeddedLink>
          );
        } else {
          parts.push(match[3]);
        }
      }
    } else if (match[4] && onUserClick) {
      const username = match[5];
      parts.push(
        <span
          key={`${keyPrefix}-m${i++}`}
          className="mention-link"
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            try {
              const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', username)
                .single();
              if (data?.id) onUserClick(data.id);
            } catch {
              // unknown username - leave click as a no-op
            }
          }}
        >
          @{username}
        </span>
      );
    } else if (match[4]) {
      parts.push(match[4]);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 0 ? text : parts;
}

// Markdown branch: parse **bold** and *italic* inline.
function renderInlineMarkdown(text, onUserClick, keyPrefix, options = {}) {
  if (!text) return null;
  const out = [];
  let lastIndex = 0;
  let match;
  let i = 0;
  const re = new RegExp(INLINE_MD_RE.source, 'g');
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      const inner = renderMentionsAndUrls(plain, onUserClick, `${keyPrefix}-p${i}`, options);
      if (Array.isArray(inner)) out.push(...inner);
      else if (inner != null) out.push(inner);
    }
    const inner = match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3];
    const innerNodes = renderMentionsAndUrls(inner, onUserClick, `${keyPrefix}-fmt${i}`, options);
    if (match[1] !== undefined) {
      out.push(<strong key={`${keyPrefix}-bi${i++}`}><em>{innerNodes}</em></strong>);
    } else if (match[2] !== undefined) {
      out.push(<strong key={`${keyPrefix}-b${i++}`}>{innerNodes}</strong>);
    } else {
      out.push(<em key={`${keyPrefix}-i${i++}`}>{innerNodes}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    const plain = text.slice(lastIndex);
    const inner = renderMentionsAndUrls(plain, onUserClick, `${keyPrefix}-tail`, options);
    if (Array.isArray(inner)) out.push(...inner);
    else if (inner != null) out.push(inner);
  }
  return out;
}

function renderMarkdown(text, onUserClick) {
  const lines = text.split('\n');
  const blocks = [];
  let bullets = null;
  let blockKey = 0;

  const flushBullets = () => {
    if (bullets && bullets.length) {
      const k = blockKey++;
      blocks.push(
        <ul key={`ul-${k}`} className="rich-text-list">
          {bullets.map((line, i) => (
            <li key={i}>{renderInlineMarkdown(line, onUserClick, `ul${k}-li${i}`)}</li>
          ))}
        </ul>
      );
      bullets = null;
    }
  };

  lines.forEach((line, idx) => {
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if (m) {
      if (!bullets) bullets = [];
      bullets.push(m[1]);
    } else {
      flushBullets();
      const k = blockKey++;
      blocks.push(
        <React.Fragment key={`ln-${k}`}>
          {renderInlineMarkdown(line, onUserClick, `l${k}`)}
          {idx < lines.length - 1 ? '\n' : null}
        </React.Fragment>
      );
    }
  });
  flushBullets();
  return blocks;
}

// HTML branch: walk a sanitized DOM tree and rebuild as React, linkifying
// any @mentions / URLs found inside text nodes. We map both <b>/<strong>
// and <i>/<em> to React's strong/em so the output is consistent regardless
// of which tag the browser produced.
const TAG_TO_REACT = {
  STRONG: 'strong', B: 'strong',
  EM: 'em', I: 'em',
  U: 'u',
  UL: 'ul', OL: 'ol', LI: 'li',
  BR: 'br',
  P: 'div', DIV: 'div',
  SPAN: 'span',
  A: 'a',
};

function walkDomToReact(node, onUserClick, key, { insideLink = false } = {}) {
  const children = [];
  const kids = Array.from(node.childNodes);
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const ck = `${key}-${i}`;
    if (child.nodeType === 3 /* TEXT_NODE */) {
      // Parse inline markdown (**bold** / *italic*) in text nodes too, so
      // asterisk formatting renders as bold/italic everywhere - even inside
      // HTML-dialect posts and agent-authored markdown that lands in this
      // branch - instead of showing literal stars. renderInlineMarkdown also
      // linkifies @mentions and URLs in the non-formatted spans.
      const inner = renderInlineMarkdown(child.textContent, onUserClick, ck, {
        suppressLinks: insideLink,
      });
      if (Array.isArray(inner)) children.push(...inner);
      else if (inner != null) children.push(inner);
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const reactTag = TAG_TO_REACT[child.tagName];
      if (!reactTag) {
        // Unknown tag - drop wrapper, keep walking children
        const inner = walkDomToReact(child, onUserClick, ck, { insideLink });
        children.push(...inner);
      } else if (reactTag === 'br') {
        children.push(<br key={ck} />);
      } else if (reactTag === 'a') {
        const href = child.getAttribute('href');
        const inner = walkDomToReact(child, onUserClick, ck, { insideLink: true });
        if (insideLink) {
          // Invalid nested <a> in stored HTML - unwrap so we never render <a> inside <a>.
          children.push(...inner);
        } else {
          const safeHref = safeHttpUrl(href);
          if (safeHref) {
            // http(s) anchors get the anti-phishing hover treatment - the
            // display text may differ from the destination, so the tooltip
            // reveals the real URL.
            children.push(
              <EmbeddedLink key={ck} href={safeHref}>{inner}</EmbeddedLink>
            );
          } else if (href) {
            // Non-http(s) but sanitizer-approved (mailto:, relative, #) - keep
            // the plain anchor exactly as before.
            children.push(
              <a key={ck} href={href} target="_blank" rel="noopener noreferrer"
                className="post-inline-link" onClick={(e) => e.stopPropagation()}>
                {inner}
              </a>
            );
          } else {
            children.push(...inner);
          }
        }
      } else {
        const inner = walkDomToReact(child, onUserClick, ck, { insideLink });
        const className = reactTag === 'ul' || reactTag === 'ol' ? 'rich-text-list' : undefined;
        // Preserve inline color from the sanitized style attr - without this,
        // user-picked text colors get dropped and the parent's color rule wins.
        let styleProp;
        const rawStyle = child.getAttribute && child.getAttribute('style');
        if (rawStyle) {
          const m = rawStyle.match(/color\s*:\s*([^;]+)/i);
          if (m) styleProp = { color: m[1].trim() };
        }
        children.push(React.createElement(reactTag, { key: ck, className, style: styleProp }, ...inner));
      }
    }
  }
  return children;
}

function renderHtml(text, onUserClick) {
  if (typeof document === 'undefined') return text;
  const safe = sanitizeHtml(text);
  const doc = new DOMParser().parseFromString(`<div>${safe}</div>`, 'text/html');
  const root = doc.body.firstChild;
  if (!root) return null;
  return walkDomToReact(root, onUserClick, 'r');
}

export const RichText = ({ text, onUserClick }) => {
  if (!text) return null;
  // The plain-text branch doesn't parse HTML entities, so a stored "&nbsp;"
  // would show literally. Normalize it (and the raw nbsp char) to a regular
  // space before either branch picks up - historical posts written before
  // RichTextarea stripped these can carry them.
  const normalized = looksLikeHtml(text)
    ? text
    : text.replace(/&nbsp;/g, ' ').replace(/ /g, ' ');
  const blocks = looksLikeHtml(normalized)
    ? renderHtml(normalized, onUserClick)
    : renderMarkdown(normalized, onUserClick);
  return <span className="rendered-rich-text">{blocks}</span>;
};
