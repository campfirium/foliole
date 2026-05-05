import { describe, expect, it } from 'vitest';

import {
  collectAutolinkMatches,
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

  it('collects GFM autolinks outside preserved ranges', () => {
    expect(collectAutolinkMatches(0, 'See https://example.com, www.example.org and a@b.com', [])).toEqual([
      { from: 4, href: 'https://example.com', to: 23 },
      { from: 25, href: 'https://www.example.org', to: 40 },
      { from: 45, href: 'mailto:a@b.com', to: 52 }
    ]);
  });

  it('skips autolinks that overlap existing markdown links', () => {
    expect(collectAutolinkMatches(0, '[docs](https://example.com) https://ok.test', [{ from: 0, to: 27 }])).toEqual([
      { from: 28, href: 'https://ok.test', to: 43 }
    ]);
  });
});

describe('wiki and footnote markdown matches', () => {
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

  it('collects wiki links with aliases as the visible label', () => {
    expect(collectWikiLinkMatches(0, '[[Folder/Beta note|Beta alias]]', [])).toEqual([
      {
        from: 0,
        to: 31,
        hiddenRanges: [
          { from: 0, to: 19 },
          { from: 29, to: 31 }
        ],
        labelFrom: 19,
        labelTo: 29,
        title: 'Folder/Beta note'
      }
    ]);
  });

  it('does not collect Obsidian embeds as wiki links', () => {
    expect(collectWikiLinkMatches(0, '![[image.png]]', [])).toEqual([]);
  });

  it('collects and unescapes footnotes outside preserved ranges', () => {
    expect(collectFootnoteMatches(0, '^[1]{A \\} note} ^[2]', [{ from: 16, to: 20 }])).toEqual([
      { from: 0, to: 15, label: '1', note: 'A } note' }
    ]);
  });
});
