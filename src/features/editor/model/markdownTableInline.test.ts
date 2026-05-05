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
});
