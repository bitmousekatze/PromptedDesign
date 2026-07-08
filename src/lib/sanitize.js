// Tiny HTML sanitizer for description fields written by the WYSIWYG
// editor. Browsers (and pasted clipboard data) can produce a much wider set
// of tags than we allow on display, and we serve descriptions back to other
// users - so we whitelist a small formatting-only tag set and drop everything
// else, including all event handlers and javascript: URLs.

const ALLOWED_TAGS = new Set([
  'B', 'STRONG',
  'I', 'EM',
  'U',
  'UL', 'OL', 'LI',
  'BR',
  'P', 'DIV', 'SPAN',
  'A',
]);

// Per-tag allow-listed attributes. Anything not in here gets stripped.
// `style` is allowed on inline formatting tags but the value is filtered
// further down - we only let a `color: <safe-value>` declaration through.
const ALLOWED_ATTRS = {
  A: new Set(['href', 'target', 'rel']),
  SPAN: new Set(['class', 'style']),
  B: new Set(['style']),
  STRONG: new Set(['style']),
  I: new Set(['style']),
  EM: new Set(['style']),
  U: new Set(['style']),
};

const SAFE_HREF_RE = /^(?:https?:|mailto:|\/|#)/i;

// Color values we accept inside style="color: …". Keeps things tight so we
// can't smuggle `url(javascript:…)` or expression() payloads through the
// style attribute.
//   - #rgb / #rrggbb hex
//   - rgb()/rgba() with plain numeric channels
//   - a short allowlist of named colors used by the comment editor swatches
const SAFE_NAMED_COLORS = new Set([
  'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink',
  'white', 'black', 'gray', 'grey', 'inherit', 'currentcolor'
]);
const SAFE_COLOR_RE = /^(?:#(?:[0-9a-f]{3}|[0-9a-f]{6})|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\))$/i;

function sanitizeStyle(value) {
  // Parse `style="color: red; foo: bar"` and keep ONLY a valid color decl.
  if (!value || typeof value !== 'string') return '';
  const decls = value.split(';');
  for (const decl of decls) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim().toLowerCase();
    if (prop !== 'color') continue;
    if (SAFE_NAMED_COLORS.has(val) || SAFE_COLOR_RE.test(val)) {
      return `color: ${val}`;
    }
  }
  return '';
}

function sanitizeNode(node) {
  // Walk children in reverse so removals don't perturb the loop.
  const kids = Array.from(node.childNodes);
  for (let i = kids.length - 1; i >= 0; i--) {
    const child = kids[i];
    if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const tag = child.tagName;
      if (!ALLOWED_TAGS.has(tag)) {
        // Disallowed wrapper: unwrap, keep children
        const parent = child.parentNode;
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        parent.removeChild(child);
        continue;
      }
      // Strip every attribute that isn't on the allow-list for this tag.
      const allowed = ALLOWED_ATTRS[tag] || new Set();
      const attrs = Array.from(child.attributes);
      for (const attr of attrs) {
        if (!allowed.has(attr.name)) {
          child.removeAttribute(attr.name);
          continue;
        }
        // For `style` we run a value-level filter - only a valid `color: …`
        // declaration survives, everything else (background, url(), etc.) is
        // dropped. If nothing valid remains we remove the attr entirely.
        if (attr.name === 'style') {
          const clean = sanitizeStyle(attr.value);
          if (clean) child.setAttribute('style', clean);
          else child.removeAttribute('style');
        }
      }
      if (tag === 'A') {
        const href = child.getAttribute('href') || '';
        if (!SAFE_HREF_RE.test(href)) {
          child.removeAttribute('href');
        }
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
      sanitizeNode(child);
    } else if (child.nodeType === 8 /* COMMENT_NODE */) {
      child.parentNode.removeChild(child);
    }
  }
}

export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  if (typeof document === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;
  if (!root) return '';
  sanitizeNode(root);
  return root.innerHTML;
}

// Strip all HTML tags and decode entities, returning plain text. Used for
// compact, single-line surfaces (cards, share text) where we want the words
// but not the markup - rendering full rich text there would break ellipsis
// truncation or leak tags into copied/shared strings.
export function toPlainText(html) {
  if (!html || typeof html !== 'string') return '';
  if (!looksLikeHtml(html)) return html;
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, '');
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

// Heuristic: does this string look like it came from the WYSIWYG editor
// (HTML), as opposed to plain text or the older markdown era? We check for
// any of the formatting tags we ever produce.
export function looksLikeHtml(s) {
  if (!s || typeof s !== 'string') return false;
  return /<\/?(?:b|strong|i|em|u|ul|ol|li|br|p|div|span|a)\b[^>]*>/i.test(s);
}

// Convert legacy markdown content (the **bold** / *italic* / "- bullet"
// dialect from the prior PR) to the same HTML the WYSIWYG editor produces.
// Used both when seeding the editor with old content and when rendering it
// for display alongside fresh HTML posts.
export function markdownToHtml(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Bold first so the italic pass doesn't eat the surrounding asterisks.
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  // Bullets, line by line.
  const lines = s.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if (m) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${m[1]}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(line);
    }
  }
  if (inList) out.push('</ul>');
  // Join with explicit <br> for non-list lines so newlines render visually
  // even inside containers without white-space: pre-wrap.
  return out.join('').replace(/\n/g, '<br>');
}
