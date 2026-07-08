import { useEffect, useRef, useState, useCallback } from 'react';
import { sanitizeHtml } from '../lib/sanitize';

// One-time style injection. The rest of the app uses inline <style> blocks
// inside App.jsx; we keep the editor's CSS local to this component file so
// it's easy to find and ships alongside the editor logic.
if (typeof document !== 'undefined' && !document.getElementById('comment-editor-styles')) {
  const tag = document.createElement('style');
  tag.id = 'comment-editor-styles';
  tag.textContent = `
    .comment-editor { display: flex; flex-direction: column; width: 100%; gap: 6px; }
    .comment-editor-toolbar {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 6px;
      background: var(--bg-tertiary, #1c1c1c);
      border: 1px solid var(--border, #2a2a2a);
      border-radius: 8px;
      width: fit-content;
    }
    .ce-btn {
      width: 28px; height: 28px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: none; border-radius: 6px;
      color: var(--text, #f0f0f0); cursor: pointer;
      font: inherit; font-size: 14px; line-height: 1;
      transition: background 0.15s ease;
    }
    .ce-btn:hover { background: rgba(255,255,255,0.08); }
    .ce-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .ce-color-wrap { position: relative; }
    .ce-color-swatch {
      display: inline-block; width: 14px; height: 14px; border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .ce-color-popover {
      position: absolute; top: calc(100% + 6px); left: 0; z-index: 50;
      display: grid; grid-template-columns: repeat(5, 22px); gap: 6px;
      padding: 8px;
      background: var(--bg-secondary, #141414);
      border: 1px solid var(--border, #2a2a2a);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .ce-color-dot {
      width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
      border: 1px solid rgba(255,255,255,0.15);
      transition: transform 0.12s ease;
    }
    .ce-color-dot:hover { transform: scale(1.15); }
    .ce-color-dot[data-default="true"] {
      background: repeating-linear-gradient(45deg,#444 0 4px,#222 4px 8px);
    }
    .comment-editor-surface {
      min-height: 44px;
      padding: 10px 14px;
      border-radius: 12px;
      outline: none;
      white-space: pre-wrap;
      word-break: break-word;
      /* The caller classes (.full-post-comment-input, .comment-input-mobile)
         cap height with max-height + resize:none - values meant for a
         <textarea>, which scrolls natively. This is a contentEditable <div>,
         so without an explicit overflow it defaults to visible and the text
         spills OUT of the box past the max-height. Scroll instead. */
      overflow-y: auto;
      /* Inherit the look of the textarea it replaces by reusing whatever
         class the caller passes (e.g. .comment-input-mobile). The bare
         surface gets sensible defaults in case it's used standalone. */
    }
    .comment-editor-surface[data-empty="true"]::before {
      content: attr(data-placeholder);
      color: var(--text-muted, #888);
      pointer-events: none;
    }
    .comment-editor-surface[aria-disabled="true"] { opacity: 0.6; cursor: not-allowed; }
    .ce-emoji-popover {
      position: absolute; top: calc(100% + 6px); left: 0; z-index: 50;
      display: grid; grid-template-columns: repeat(8, 26px); gap: 2px;
      padding: 8px; max-height: 196px; overflow-y: auto;
      background: var(--bg-secondary, #141414);
      border: 1px solid var(--border, #2a2a2a);
      border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    }
    .ce-emoji {
      width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: none; border-radius: 6px; cursor: pointer; font-size: 17px;
      line-height: 1; padding: 0; transition: background 0.12s ease, transform 0.12s ease;
    }
    .ce-emoji:hover { background: rgba(255,255,255,0.10); transform: scale(1.18); }
    .ce-image-preview {
      position: relative; display: inline-block; margin-top: 2px; max-width: 220px;
    }
    .ce-image-preview img {
      max-width: 220px; max-height: 180px; border-radius: 10px; display: block;
      border: 1px solid var(--border, #2a2a2a);
    }
    .ce-image-preview button {
      position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 999px;
      border: none; background: rgba(0,0,0,0.7); color: #fff; cursor: pointer; font-size: 12px; line-height: 1;
    }
  `;
  document.head.appendChild(tag);
}

/**
 * Lightweight rich-text comment editor.
 *
 * Why a custom component instead of a heavier WYSIWYG lib:
 *  - We only need 4 formatting actions (bold / italic / underline / color).
 *  - The output is sanitized HTML stored in the existing `comments.content`
 *    column, so we can't pull in a library that injects its own markup.
 *  - A 100-line contentEditable + execCommand wrapper is plenty for that
 *    surface area and keeps the bundle small.
 *
 * Behaviour notes:
 *  - `execCommand('styleWithCSS', true)` is called once per format action so
 *    foreColor produces `<span style="color: …">` instead of `<font color>`,
 *    which our sanitizer (and modern CSS) prefers.
 *  - We snapshot the selection range BEFORE the user clicks a toolbar button,
 *    because clicking moves focus to the button and collapses the selection
 *    inside the editor. Range is restored just before the format call.
 *  - Enter (without shift) submits - matches the textarea behaviour the rest
 *    of the comment surfaces already use.
 */

// Swatches surfaced in the toolbar. Hex chosen to read on both dark and
// light backgrounds. `null` = "remove color / use default".
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

// Curated emoji surfaced in the toolbar picker (no heavy dependency - matches
// the app's existing hardcoded-emoji approach in chatComposer.jsx).
const EMOJIS = [
  '😀','😂','🤣','😊','😍','😎','🤔','😅',
  '😭','😡','🥳','😢','🙃','😏','🤓','😱',
  '👍','👎','🙏','👏','🙌','💪','🤝','🫡',
  '🔥','✨','🎉','💯','⚡','🚀','💡','🎯',
  '❤️','🧡','💛','💚','💙','💜','🖤','💔',
  '😴','🤯','🤖','👀','🥲','😤','🤩','🫶',
  '✅','❌','⭐','🧠','💬','🐐','💸','📈',
];

export default function CommentEditor({
  value,            // current HTML string (controlled)
  onChange,         // (html: string) => void - receives RAW (not yet sanitized) html
  onSubmit,         // optional () => void - fired on Enter (no shift)
  placeholder = 'Add a comment...',
  disabled = false,
  className = '',   // forwarded to the editable surface so existing
                    // .comment-input-mobile / .full-post-comment-input styles still apply
  autoFocus = false,
  inputRef,         // optional ref forwarded to the editable element
  allowImage = false, // show the image-attach button (gate to Pro at the call site)
  image = null,       // { preview } of the currently-attached image, or null
  onPickImage,        // (file: File) => void - user chose an image to attach
  onClearImage,       // () => void - user removed the attached image
  submitOnEnter = false, // chat-style: Enter submits, Shift+Enter newline
}) {
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null); // last known selection range inside editor
  const imageInputRef = useRef(null);
  const [showColors, setShowColors] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);

  // Close the emoji popover on any outside mousedown (the popover and its
  // toggle stop propagation, so clicks inside don't trigger this).
  useEffect(() => {
    if (!showEmojis) return undefined;
    const onDoc = () => setShowEmojis(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showEmojis]);

  // Keep the editor's innerHTML in sync with the controlled `value` prop -
  // but ONLY when `value` differs from what we already show. We must NOT
  // overwrite the DOM on every keystroke, because doing so would blow away
  // the caret position the browser is maintaining inside the contenteditable.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = value || '';
    if (el.innerHTML !== next) {
      el.innerHTML = next;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus && editorRef.current) editorRef.current.focus();
  }, [autoFocus]);

  // Forward inner ref so callers can imperatively focus (e.g. when the
  // surrounding form re-mounts after a successful submit).
  useEffect(() => {
    if (!inputRef) return;
    if (typeof inputRef === 'function') inputRef(editorRef.current);
    else inputRef.current = editorRef.current;
  }, [inputRef]);

  // Capture the current selection so that toolbar clicks (which steal focus
  // from the contenteditable) can restore it before formatting.
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // Only remember selections that live INSIDE the editor - otherwise we'd
    // restore stale ranges from elsewhere on the page.
    if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const range = savedRangeRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  // Run a document.execCommand action against the editor. We force styleWithCSS
  // so foreColor produces a <span style="color: …"> rather than a <font> tag.
  const exec = useCallback((command, arg = null) => {
    if (disabled) return;
    if (editorRef.current) editorRef.current.focus();
    restoreSelection();
    try { document.execCommand('styleWithCSS', false, true); } catch {}
    document.execCommand(command, false, arg);
    // After the command mutates the DOM, push the new HTML up.
    if (onChange && editorRef.current) onChange(editorRef.current.innerHTML);
  }, [disabled, onChange, restoreSelection]);

  // Insert an emoji at the caret (restoring the selection the toolbar click
  // stole), then re-emit onChange so the controlled value stays in sync.
  const insertEmoji = useCallback((emoji) => {
    if (disabled) return;
    if (editorRef.current) editorRef.current.focus();
    restoreSelection();
    try { document.execCommand('insertText', false, emoji); }
    catch { if (editorRef.current) editorRef.current.innerHTML += emoji; }
    if (onChange && editorRef.current) onChange(editorRef.current.innerHTML);
  }, [disabled, onChange, restoreSelection]);

  const handleInput = () => {
    if (onChange && editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const handleKeyDown = (e) => {
    // Enter inserts a newline (default contentEditable behaviour). To submit,
    // users click the Send / Reply button. Ctrl/Cmd+Enter is a keyboard
    // shortcut for submitting without leaving the keyboard.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (onSubmit && !disabled) onSubmit();
      return;
    }
    // Chat-style send: plain Enter submits, Shift+Enter inserts a newline.
    if (submitOnEnter && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (onSubmit && !disabled) onSubmit();
      return;
    }
    // Common keyboard shortcuts. The browser already wires these up for
    // contenteditable, but we want them to also re-emit onChange and respect
    // our styleWithCSS preference for foreColor.
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); exec('bold'); }
      else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); exec('italic'); }
      else if (e.key === 'u' || e.key === 'U') { e.preventDefault(); exec('underline'); }
    }
  };

  // Sanitize pasted content on the way in. Without this, a user could paste
  // arbitrary HTML (images, scripts, styled divs) and it would render inside
  // the editor - sanitized only at submit time, which is too late visually.
  const handlePaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const insert = html ? sanitizeHtml(html) : (text || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
    document.execCommand('insertHTML', false, insert);
    if (onChange && editorRef.current) onChange(editorRef.current.innerHTML);
  };

  // Toolbar buttons use onMouseDown rather than onClick so the editor never
  // loses focus mid-click - which would otherwise collapse the selection
  // before the format command ran.
  const tbProps = (handler) => ({
    type: 'button',
    onMouseDown: (e) => { e.preventDefault(); saveSelection(); handler(); },
    disabled,
  });

  const isEmpty = !value || value === '<br>' || value.replace(/<[^>]+>/g, '').trim() === '';

  return (
    <div className={`comment-editor ${className ? className + '-wrap' : ''}`}>
      <div className="comment-editor-toolbar" aria-label="Comment formatting">
        <button {...tbProps(() => exec('bold'))}        className="ce-btn" title="Bold (Ctrl+B)"><b>B</b></button>
        <button {...tbProps(() => exec('italic'))}      className="ce-btn" title="Italic (Ctrl+I)"><i>I</i></button>
        <button {...tbProps(() => exec('underline'))}   className="ce-btn" title="Underline (Ctrl+U)"><u>U</u></button>
        <div className="ce-color-wrap">
          <button
            type="button"
            className="ce-btn ce-color-trigger"
            onMouseDown={(e) => { e.preventDefault(); saveSelection(); setShowColors(s => !s); }}
            disabled={disabled}
            title="Text color"
            aria-expanded={showColors}
          >
            <span className="ce-color-swatch" style={{ background: 'linear-gradient(135deg,#ff6b6b,#4dabf7,#51cf66)' }} />
          </button>
          {showColors && (
            <div className="ce-color-popover" onMouseDown={(e) => e.preventDefault()}>
              {COLOR_SWATCHES.map(sw => (
                <button
                  key={sw.label}
                  type="button"
                  className="ce-color-dot"
                  style={sw.value ? { background: sw.value } : undefined}
                  data-default={sw.value ? undefined : 'true'}
                  title={sw.label}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    // Default = remove color formatting from the selection.
                    if (sw.value === null) exec('removeFormat');
                    else exec('foreColor', sw.value);
                    setShowColors(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Emoji */}
        <div className="ce-color-wrap">
          <button
            type="button"
            className="ce-btn"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); saveSelection(); setShowEmojis(s => !s); }}
            disabled={disabled}
            title="Emoji"
            aria-expanded={showEmojis}
          >😊</button>
          {showEmojis && (
            <div className="ce-emoji-popover" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}>
              {EMOJIS.map(em => (
                <button
                  key={em}
                  type="button"
                  className="ce-emoji"
                  title={em}
                  onMouseDown={(e) => { e.preventDefault(); insertEmoji(em); }}
                >{em}</button>
              ))}
            </div>
          )}
        </div>

        {/* Image attach (Pro - gated by the caller via allowImage) */}
        {allowImage && (
          <>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f && onPickImage) onPickImage(f); e.target.value = ''; }}
            />
            <button
              type="button"
              className="ce-btn"
              disabled={disabled}
              title="Add image (Pro)"
              onMouseDown={(e) => { e.preventDefault(); imageInputRef.current?.click(); }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
              </svg>
            </button>
          </>
        )}
      </div>

      {image?.preview && (
        <div className="ce-image-preview">
          <img src={image.preview} alt="attachment" />
          <button type="button" onClick={onClearImage} aria-label="Remove image">✕</button>
        </div>
      )}

      <div
        ref={editorRef}
        className={`comment-editor-surface ${className}`}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={saveSelection}
        data-placeholder={placeholder}
        data-empty={isEmpty ? 'true' : 'false'}
        role="textbox"
        aria-multiline="true"
        aria-disabled={disabled}
      />
    </div>
  );
}
