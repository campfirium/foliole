import { describe, expect, it } from 'vitest';

import { tokenizeMarkdownTableInlineText } from './markdownTableInline';

describe('markdownTableInline GFM tokens', () => {
  it('tokenizes table cell emphasis, strong, strikethrough, and autolinks', () => {
    expect(tokenizeMarkdownTableInlineText('A *em* **bold** and ~~gone~~ https://example.com.')).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'emphasis', text: 'em' },
      { kind: 'text', text: ' ' },
      { kind: 'strong', text: 'bold' },
      { kind: 'text', text: ' and ' },
      { kind: 'strikethrough', text: 'gone' },
      { kind: 'text', text: ' ' },
      { href: 'https://example.com', kind: 'autolink', text: 'https://example.com' },
      { kind: 'text', text: '.' }
    ]);
  });

  it('uses the Markdown parser for inline code boundaries', () => {
    expect(tokenizeMarkdownTableInlineText('A `**code**` and **bold**')).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'inlineCode', text: '**code**' },
      { kind: 'text', text: ' and ' },
      { kind: 'strong', text: 'bold' }
    ]);
  });

  it('tokenizes GFM inline links from the shared parser projection', () => {
    expect(tokenizeMarkdownTableInlineText('See [docs](https://example.com) now')).toEqual([
      { kind: 'text', text: 'See ' },
      { href: 'https://example.com', kind: 'link', text: 'docs' },
      { kind: 'text', text: ' now' }
    ]);
  });

  it('tokenizes GFM reference-style links from shared reference definitions', () => {
    expect(tokenizeMarkdownTableInlineText('See [docs][ref]', new Map([['ref', 'https://example.com']]))).toEqual([
      { kind: 'text', text: 'See ' },
      { href: 'https://example.com', kind: 'link', text: 'docs' }
    ]);
  });

  it('tokenizes GFM angle autolinks without delimiter text', () => {
    expect(tokenizeMarkdownTableInlineText('See <https://example.com> now')).toEqual([
      { kind: 'text', text: 'See ' },
      { href: 'https://example.com', kind: 'autolink', text: 'https://example.com' },
      { kind: 'text', text: ' now' }
    ]);
  });
});

describe('markdownTableInline Markdown Compatibility tokens', () => {
  it('tokenizes lenient strong labels from the shared parser projection', () => {
    expect(tokenizeMarkdownTableInlineText('**实操含义：**如果你的应用场景')).toEqual([
      { kind: 'strong', text: '实操含义：' },
      { kind: 'text', text: '如果你的应用场景' }
    ]);
  });
});

describe('markdownTableInline OB-like tokens', () => {
  it('tokenizes OB-like source highlights from the shared parser projection', () => {
    expect(tokenizeMarkdownTableInlineText('A ==marked== cell')).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'sourceHighlight', text: 'marked' },
      { kind: 'text', text: ' cell' }
    ]);
  });

  it('tokenizes OB-like wiki links from the shared parser projection', () => {
    expect(tokenizeMarkdownTableInlineText('See [[Folder/Card]] and ![[Raw]]')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'wikiLink', text: 'Folder/Card', title: 'Folder/Card' },
      { kind: 'text', text: ' and ' },
      { kind: 'embed', target: 'Raw', text: 'Raw' }
    ]);
  });

  it('tokenizes OB-like embeds with aliases from the shared parser projection', () => {
    expect(tokenizeMarkdownTableInlineText('See ![[Folder/Card|Alias]]')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'embed', target: 'Folder/Card', text: 'Alias' }
    ]);
  });

  it('tokenizes OB-like footnotes from the shared parser projection', () => {
    expect(tokenizeMarkdownTableInlineText('Cell ^[1]{note} text')).toEqual([
      { kind: 'text', text: 'Cell ' },
      { kind: 'footnote', label: '1', note: 'note' },
      { kind: 'text', text: ' text' }
    ]);
  });
});
