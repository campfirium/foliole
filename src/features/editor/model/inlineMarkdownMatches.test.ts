import { describe, expect, it } from 'vitest';

import {
  collectFootnoteMatches,
  collectInlineCodeMatches,
  collectInlineLinkMatches,
  collectWikiLinkMatches
} from './inlineMarkdownMatches';

describe('inlineMarkdownMatches', () => {
  it('collects inline code ranges with content bounds', () => {
    expect(collectInlineCodeMatches(5, 'A `code` B')).toEqual([
      { from: 7, to: 13, contentFrom: 8, contentTo: 12 }
    ]);
  });

  it('skips inline links that overlap preserved ranges', () => {
    expect(collectInlineLinkMatches(0, '[keep](url) [hide](x)', [{ from: 0, to: 11 }])).toEqual([
      {
        from: 12,
        to: 21,
        labelFrom: 13,
        labelTo: 17,
        hiddenRanges: [
          { from: 12, to: 13 },
          { from: 17, to: 19 },
          { from: 19, to: 20 },
          { from: 20, to: 21 }
        ],
        href: 'x'
      }
    ]);
  });

  it('collects wiki links with trimmed titles', () => {
    expect(collectWikiLinkMatches(10, '[[ Alpha ]]', [])).toEqual([
      {
        from: 10,
        to: 21,
        hiddenRanges: [
          { from: 10, to: 12 },
          { from: 19, to: 21 }
        ],
        labelFrom: 12,
        labelTo: 19,
        title: 'Alpha'
      }
    ]);
  });

  it('collects and unescapes footnotes outside preserved ranges', () => {
    expect(collectFootnoteMatches(0, '^[1]{A \\} note} ^[2]', [{ from: 16, to: 20 }])).toEqual([
      { from: 0, to: 15, label: '1', note: 'A } note' }
    ]);
  });
});
