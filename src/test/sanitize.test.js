import { describe, it, expect } from 'vitest';
import { toPlainText, looksLikeHtml, sanitizeHtml } from '../lib/sanitize.js';

// Regression coverage for community descriptions that were authored with the
// rich-text editor and stored as HTML (e.g. the "Creator of the Month"
// community). Rendering these as raw React text leaked the literal
// `<span style="color: rgb(160, 160, 160)">…</span>` markup to users on web
// and mobile. toPlainText feeds compact, single-line surfaces (cards, share
// text) the words without the markup.
describe('toPlainText', () => {
  const HTML_DESC =
    '<span style="color: rgb(160, 160, 160)">Welcome to Creator of the Month! ' +
    'This is a monthly event where builders compete.</span>';

  it('strips HTML tags from rich-text descriptions', () => {
    expect(toPlainText(HTML_DESC)).toBe(
      'Welcome to Creator of the Month! This is a monthly event where builders compete.'
    );
  });

  it('leaves plain text untouched', () => {
    expect(toPlainText('A community for sharing and learning')).toBe(
      'A community for sharing and learning'
    );
  });

  it('handles empty / nullish input', () => {
    expect(toPlainText('')).toBe('');
    expect(toPlainText(null)).toBe('');
    expect(toPlainText(undefined)).toBe('');
  });

  it('decodes entities and collapses whitespace', () => {
    expect(toPlainText('<div>Hello&nbsp;&amp;  world</div>')).toBe('Hello & world');
  });

  it('the broken description sanitizes to clean text (no raw tags)', () => {
    // looksLikeHtml routes this through the HTML render path rather than
    // showing the markup verbatim; sanitizeHtml keeps a span we can render.
    expect(looksLikeHtml(HTML_DESC)).toBe(true);
    const safe = sanitizeHtml(HTML_DESC);
    expect(safe).not.toContain('&lt;span');
    expect(safe).toContain('Welcome to Creator of the Month!');
  });
});
