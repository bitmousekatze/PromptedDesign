// Embedded-link coverage: markdown [text](url) links, bare-URL autolinking,
// scheme rejection, and @mention non-regression across both text renderers
// (MentionText for comments/titles, RichText for descriptions). Pure
// component/function tests — no network, no hover simulation.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { safeHttpUrl, middleTruncate, LINK_REL } from '../components/EmbeddedLink.jsx';
import { MentionText } from '../components/post/postShared.jsx';
import { RichText } from '../lib/richText.jsx';

describe('safeHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(safeHttpUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects javascript:, data:, and other schemes', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHttpUrl('vbscript:msgbox')).toBeNull();
    expect(safeHttpUrl('ftp://example.com/file')).toBeNull();
  });

  it('rejects garbage and empty input', () => {
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl('')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});

describe('middleTruncate', () => {
  it('keeps short strings intact and truncates long ones in the middle', () => {
    expect(middleTruncate('https://example.com')).toBe('https://example.com');
    const long = 'https://example.com/' + 'a'.repeat(200) + '/end-of-path';
    const out = middleTruncate(long, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out).toContain('…');
    expect(out.startsWith('https://example.com/')).toBe(true);
    expect(out.endsWith('end-of-path')).toBe(true);
  });
});

describe('MentionText linkify', () => {
  it('renders a markdown link as an anchor with correct href and rel', () => {
    const { container } = render(
      <MentionText text="see [the docs](https://example.com/docs) for more" />
    );
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('https://example.com/docs');
    expect(a.getAttribute('rel')).toBe(LINK_REL);
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.textContent).toBe('the docs');
    // Display text differs from destination — surrounding text preserved.
    expect(container.textContent).toBe('see the docs for more');
  });

  it('does not linkify javascript: markdown links', () => {
    const { container } = render(
      <MentionText text="click [here](javascript:alert(1)) now" />
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('[here](javascript:alert(1))');
  });

  it('auto-linkifies bare URLs', () => {
    const { container } = render(
      <MentionText text="go to https://example.com/page please" />
    );
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('https://example.com/page');
    expect(a.getAttribute('rel')).toBe(LINK_REL);
    expect(a.textContent).toBe('https://example.com/page');
  });

  it('leaves @mentions untouched (renders the mention span, no anchor)', () => {
    const { container } = render(
      <MentionText text="thanks @alice for [this](https://example.com)!" onUserClick={() => {}} />
    );
    const mention = container.querySelector('.mention-link');
    expect(mention).not.toBeNull();
    expect(mention.textContent).toBe('@alice');
    // The link still rendered alongside the mention.
    expect(container.querySelector('a').textContent).toBe('this');
    expect(container.textContent).toBe('thanks @alice for this!');
  });
});

describe('RichText linkify (post descriptions)', () => {
  it('renders markdown links in plain-text descriptions', () => {
    const { container } = render(
      <RichText text="**bold** and [a link](https://example.com/x)" />
    );
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('https://example.com/x');
    expect(a.getAttribute('rel')).toBe(LINK_REL);
    expect(a.textContent).toBe('a link');
    expect(container.querySelector('strong')).not.toBeNull();
  });

  it('renders markdown links typed inside HTML-dialect content', () => {
    const { container } = render(
      <RichText text="<div>check [docs](https://example.com/docs)</div>" />
    );
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('https://example.com/docs');
    expect(a.textContent).toBe('docs');
  });

  it('gives sanitized editor anchors the hardened rel', () => {
    const { container } = render(
      <RichText text='<div>see <a href="https://example.com/y">my site</a></div>' />
    );
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('https://example.com/y');
    expect(a.getAttribute('rel')).toBe(LINK_REL);
    expect(a.textContent).toBe('my site');
  });
});
