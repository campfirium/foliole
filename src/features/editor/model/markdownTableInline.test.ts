import { describe, expect, it } from 'vitest';

import { tokenizeMarkdownTableInlineText } from './markdownTableInline';

describe('markdownTableInline', () => {
  it('tokenizes table cell strong, strikethrough, and autolinks', () => {
    expect(tokenizeMarkdownTableInlineText('A **bold** and ~~gone~~ https://example.com.')).toEqual([
      { kind: 'text', text: 'A ' },
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

  it('tokenizes OB-like source highlights from the shared parser projection', () => {
    expect(tokenizeMarkdownTableInlineText('A ==marked== cell')).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'sourceHighlight', text: 'marked' },
      { kind: 'text', text: ' cell' }
    ]);
  });
});
