// WYSIWYG description editor. Built on a contentEditable div so users see
// bold / italic / underline / bullets in the box as they type, instead of
// raw markdown markers. Stores HTML, sanitized via src/lib/sanitize.js
// before rendering on display.
//
// We keep the component name `RichTextarea` so the App.jsx call sites that
// shipped in PR #512 don't need to change. The auto-grow-on-focus behavior
// is preserved via .rich-text-editor:focus CSS.

import React, { useEffect, useRef, useState } from 'react';
import { sanitizeHtml, looksLikeHtml, markdownToHtml } from '../lib/sanitize.js';

function execFormat(cmd, arg = null, withCss = false) {
  // document.execCommand is marked deprecated in spec but is still the
  // simplest cross-browser way to apply bold / italic / underline / list
  // formatting to the current selection inside a contentEditable element.
  // The replacement (Selection / Range APIs + manual DOM mutations) is
  // dramatically more code with no behavioral upside for our four buttons.
  // styleWithCSS=true makes foreColor emit <span style="color:…"> instead
  // of the legacy <font color> tag, which our sanitizer accepts.
  try { document.execCommand('styleWithCSS', false, withCss); } catch { /* not all browsers */ }
  document.execCommand(cmd, false, arg);
}

// Mirror of the swatches in CommentEditor so post composition uses the same
// palette as comments. null = remove color.
const COLOR_SWATCHES = [
  { value: null,      label: 'Default' },
  { value: '#ff6b6b', label: 'Red' },
  { value: '#ffa94d', label: 'Orange' },
  { value: '#ffd43b', label: 'Yellow' },
  { value: '#51cf66', label: 'Green' },
  { value: '#4ecdc4', label: 'Teal' },
  { value: '#4dabf7', label: 'Blue' },
  { value: '#c084fc', label: 'Purple' },
  { value: '#f783ac', label: 'Pink' },
];

if (typeof document !== 'undefined' && !document.getElementById('rich-textarea-color-styles')) {
  const tag = document.createElement('style');
  tag.id = 'rich-textarea-color-styles';
  tag.textContent = `
    .rich-text-color-wrap { position: relative; display: inline-flex; }
    .rich-text-color-swatch {
      display: inline-block; width: 14px; height: 14px; border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.2);
      background: linear-gradient(135deg,#ff6b6b,#4dabf7,#51cf66);
    }
    .rich-text-color-popover {
      position: absolute; top: calc(100% + 6px); left: 0; z-index: 50;
      display: grid; grid-template-columns: repeat(5, 22px); gap: 6px;
      padding: 8px;
      background: var(--bg-secondary, #141414);
      border: 1px solid var(--border, #2a2a2a);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .rich-text-color-dot {
      width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
      border: 1px solid rgba(255,255,255,0.15);
      transition: transform 0.12s ease;
      padding: 0;
    }
    .rich-text-color-dot:hover { transform: scale(1.15); }
    .rich-text-color-dot[data-default="true"] {
      background: repeating-linear-gradient(45deg,#444 0 4px,#222 4px 8px);
    }
  `;
  document.head.appendChild(tag);
}

export const RichTextarea = ({
  value,
  onChange,
  placeholder = '',
  rows,           // ignored: contentEditable can't honor `rows`; min-height comes from CSS
  maxLength,      // soft-enforced on input (browsers don't support it on contenteditable)
  className = '',
  id,
  ...rest
}) => {
  const ref = useRef(null);
  const savedRangeRef = useRef(null);
  const [hasFocus, setHasFocus] = useState(false);
  const [showColors, setShowColors] = useState(false);

  // Snapshot caret/selection before a toolbar click steals focus, so we can
  // restore it before running the format command.
  const saveSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (ref.current && ref.current.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };
  const restoreSelection = () => {
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // Seed the editor with the incoming value. We only do this when the
  // editor isn't focused so we don't fight the user's caret while they're
  // typing — onInput pushes their edits up via onChange, and React's
  // value-prop round-trip would otherwise reset the selection on every
  // keystroke.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (hasFocus) return;
    const incoming = looksLikeHtml(value)
      ? value
      : markdownToHtml(value || '');
    if (el.innerHTML !== incoming) {
      el.innerHTML = incoming || '';
    }
  }, [value, hasFocus]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    let html = el.innerHTML;
    // Browsers insert &nbsp; /   to preserve trailing or consecutive
    // spaces in contentEditable. We don't want non-breaking semantics — the
    // user just typed a regular space — and storing the entity makes it
    // render literally when the description has no other formatting tags
    // (the plain-text rendering branch doesn't parse HTML entities).
    html = html.replace(/&nbsp;/g, ' ').replace(/ /g, ' ');
    // Treat a lone <br> (browsers insert one when the user clears the
    // field) as empty so downstream save handlers don't think there's
    // content here.
    if (html === '<br>' || html === '<div><br></div>') html = '';
    if (typeof maxLength === 'number' && el.innerText.length > maxLength) {
      // Soft cap: trim text content if it overflows. This won't preserve
      // formatting at the cut, but neither does the textarea fallback.
      el.innerText = el.innerText.slice(0, maxLength);
      html = el.innerHTML.replace(/&nbsp;/g, ' ').replace(/ /g, ' ');
    }
    onChange(html);
  };

  const handleToolbar = (cmd) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    el.focus();
    restoreSelection();
    execFormat(cmd);
    emit();
  };

  const applyColor = (color) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    restoreSelection();
    if (color === null) execFormat('removeFormat');
    else execFormat('foreColor', color, true);
    emit();
    setShowColors(false);
  };

  const handlePaste = (e) => {
    // Pasting from Word, web pages, etc. drags in a tower of styles, ids,
    // and disallowed tags. Sanitize before insertion so the editor only
    // ever holds the small whitelist the renderer accepts.
    const html = e.clipboardData?.getData('text/html');
    const text = e.clipboardData?.getData('text/plain');
    if (html) {
      e.preventDefault();
      const safe = sanitizeHtml(html);
      document.execCommand('insertHTML', false, safe);
      emit();
    } else if (text) {
      e.preventDefault();
      // Escape so literal angle brackets don't become tags
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      document.execCommand('insertHTML', false, escaped);
      emit();
    }
  };

  const handleKeyDown = (e) => {
    // Cmd/Ctrl-B / I / U map to bold / italic / underline so keyboard
    // shortcuts work the same as the toolbar.
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'i' || k === 'u') {
      e.preventDefault();
      execFormat(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline');
      emit();
    }
  };

  return (
    <div className="rich-textarea-wrap">
      <div className="rich-text-toolbar" role="toolbar" aria-label="Text formatting">
        <button
          type="button"
          className="rich-text-toolbar-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleToolbar('bold')}
          title="Bold (Cmd/Ctrl-B)"
          aria-label="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="rich-text-toolbar-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleToolbar('italic')}
          title="Italic (Cmd/Ctrl-I)"
          aria-label="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="rich-text-toolbar-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleToolbar('underline')}
          title="Underline (Cmd/Ctrl-U)"
          aria-label="Underline"
        >
          <u>U</u>
        </button>
        <button
          type="button"
          className="rich-text-toolbar-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleToolbar('insertUnorderedList')}
          title="Bullet list"
          aria-label="Bullet list"
        >
          •
        </button>
        <div className="rich-text-color-wrap">
          <button
            type="button"
            className="rich-text-toolbar-btn"
            onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
            onClick={(e) => { e.preventDefault(); setShowColors(s => !s); }}
            title="Text color"
            aria-label="Text color"
            aria-expanded={showColors}
          >
            <span className="rich-text-color-swatch" />
          </button>
          {showColors && (
            <div className="rich-text-color-popover" onMouseDown={(e) => e.preventDefault()}>
              {COLOR_SWATCHES.map(sw => (
                <button
                  key={sw.label}
                  type="button"
                  className="rich-text-color-dot"
                  style={sw.value ? { background: sw.value } : undefined}
                  data-default={sw.value ? undefined : 'true'}
                  title={sw.label}
                  onMouseDown={(e) => { e.preventDefault(); applyColor(sw.value); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        ref={ref}
        id={id}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder || undefined}
        data-placeholder={placeholder}
        spellCheck={true}
        onInput={emit}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onFocus={() => setHasFocus(true)}
        onBlur={() => { setHasFocus(false); emit(); }}
        className={`rich-text-editor expanding-textarea ${className}`}
        {...rest}
      />
    </div>
  );
};
