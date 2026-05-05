import { describe, expect, it } from 'vitest';

import {
  collectAutolinkMatches,
  collectEmbedMatches,
  collectFootnoteMatches,
  collectInlineCodeMatches,
  collectInlineLinkMatches,
  collectWikiLinkMatches
} from './inlineMarkdownMatches';

describe('inline code markdown matches', () => {
  it('collects inline code ranges with content bounds', () => {
    expect(collectInlineCodeMatches(5, 'A `code` B')).toEqual([
      { from: 7, to: 13, contentFrom: 8, contentTo: 12 }
    ]);
  });

  it('uses Markdown parsing for matching inline code delimiters', () => {
    expect(collectInlineCodeMatches(0, 'A ``code ` tick`` B')).toEqual([
      { from: 2, to: 17, contentFrom: 4, contentTo: 15 }
    ]);
  });
});

describe('inline link markdown matches', () => {
  it('skips inline links that overlap preserved ranges', () => {
    expect(collectInlineLinkMatches(0, '[keep](url) [hide](x)', [{ from: 0, to: 11 }])).toEqual([
      {
        from: 12,
        to: 21,
        labelFrom: 13,
        labelTo: 17,
        hiddenRanges: [
          { from: 12, to: 13 },
          { from: 17, to: 18 },
          { from: 18, to: 19 },
          { from: 19, to: 20 },
          { from: 20, to: 21 }
        ],
        href: 'x'
      }
    ]);
  });

  it('uses Markdown parsing for inline links without collecting image URLs', () => {
    expect(collectInlineLinkMatches(0, '[docs](https://example.com) ![alt](asset://x.png)', [])).toEqual([
      {
        from: 0,
        to: 27,
        labelFrom: 1,
        labelTo: 5,
        hiddenRanges: [
          { from: 0, to: 1 },
          { from: 5, to: 6 },
          { from: 6, to: 7 },
          { from: 7, to: 26 },
          { from: 26, to: 27 }
        ],
        href: 'https://example.com'
      }
    ]);
  });
});

describe('reference-style inline link markdown matches', () => {
  it('collects reference-style links from shared reference definitions', () => {
    const references = new Map([['ref', 'https://example.com']]);

    expect(collectInlineLinkMatches(0, '[docs][ref] and [ref][] and [ref]', [], references)).toEqual([
      {
        from: 0,
        to: 11,
        labelFrom: 1,
        labelTo: 5,
        hiddenRanges: [
          { from: 0, to: 1 },
          { from: 5, to: 6 },
          { from: 6, to: 11 }
        ],
        href: 'https://example.com'
      },
      {
        from: 16,
        to: 23,
        labelFrom: 17,
        labelTo: 20,
        hiddenRanges: [
          { from: 16, to: 17 },
          { from: 20, to: 21 },
          { from: 21, to: 23 }
        ],
        href: 'https://example.com'
      },
      {
        from: 28,
        to: 33,
        labelFrom: 29,
        labelTo: 32,
        hiddenRanges: [
          { from: 28, to: 29 },
          { from: 32, to: 33 }
        ],
        href: 'https://example.com'
      }
    ]);
  });
});

describe('autolink markdown matches', () => {
  it('collects GFM autolinks outside preserved ranges', () => {
    expect(collectAutolinkMatches(0, 'See https://example.com, www.example.org and a@b.com', [])).toEqual([
      { from: 4, hiddenRanges: [], href: 'https://example.com', labelFrom: 4, labelTo: 23, to: 23 },
      { from: 25, hiddenRanges: [], href: 'https://www.example.org', labelFrom: 25, labelTo: 40, to: 40 },
      { from: 45, hiddenRanges: [], href: 'mailto:a@b.com', labelFrom: 45, labelTo: 52, to: 52 }
    ]);
  });

  it('collects angle autolinks with hidden delimiters', () => {
    expect(collectAutolinkMatches(0, 'See <https://example.com>', [])).toEqual([
      {
        from: 4,
        hiddenRanges: [
          { from: 4, to: 5 },
          { from: 24, to: 25 }
        ],
        href: 'https://example.com',
        labelFrom: 5,
        labelTo: 24,
        to: 25
      }
    ]);
  });

  it('does not collect autolinks inside inline code', () => {
    expect(collectAutolinkMatches(0, '`https://example.com` https://ok.test', [])).toEqual([
      { from: 22, hiddenRanges: [], href: 'https://ok.test', labelFrom: 22, labelTo: 37, to: 37 }
    ]);
  });

  it('skips autolinks that overlap existing markdown links', () => {
    expect(collectAutolinkMatches(0, '[docs](https://example.com) https://ok.test', [{ from: 0, to: 27 }])).toEqual([
      { from: 28, hiddenRanges: [], href: 'https://ok.test', labelFrom: 28, labelTo: 43, to: 43 }
    ]);
  });
});

describe('basic wiki markdown matches', () => {
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

});

describe('wiki markdown boundary matches', () => {
  it('does not collect Obsidian embeds as wiki links', () => {
    expect(collectWikiLinkMatches(0, '![[image.png]]', [])).toEqual([]);
  });

  it('collects image-like wiki links when they are not embeds', () => {
    expect(collectWikiLinkMatches(0, '[[image.png]]', [])).toEqual([
      {
        from: 0,
        to: 13,
        hiddenRanges: [
          { from: 0, to: 2 },
          { from: 11, to: 13 }
        ],
        labelFrom: 2,
        labelTo: 11,
        title: 'image.png'
      }
    ]);
  });

  it('does not collect wiki links inside inline code', () => {
    expect(collectWikiLinkMatches(0, '`[[Page]]` [[Live]]', [])).toEqual([
      {
        from: 11,
        to: 19,
        hiddenRanges: [
          { from: 11, to: 13 },
          { from: 17, to: 19 }
        ],
        labelFrom: 13,
        labelTo: 17,
        title: 'Live'
      }
    ]);
  });
});

describe('embed markdown matches', () => {
  it('collects embeds with aliases from parser-backed ranges', () => {
    expect(collectEmbedMatches(0, 'Open ![[Folder/Card|Alias]]', [])).toEqual([
      {
        from: 5,
        to: 27,
        hiddenRanges: [
          { from: 5, to: 20 },
          { from: 25, to: 27 }
        ],
        labelFrom: 20,
        labelTo: 25,
        target: 'Folder/Card'
      }
    ]);
  });

  it('skips embeds that overlap preserved ranges', () => {
    expect(collectEmbedMatches(0, '`![[Page]]` ![[Live]]', [{ from: 0, to: 11 }])).toEqual([
      {
        from: 12,
        to: 21,
        hiddenRanges: [
          { from: 12, to: 15 },
          { from: 19, to: 21 }
        ],
        labelFrom: 15,
        labelTo: 19,
        target: 'Live'
      }
    ]);
  });
});

describe('footnote markdown matches', () => {
  it('collects and unescapes footnotes outside preserved ranges', () => {
    expect(collectFootnoteMatches(0, '^[1]{A \\} note} ^[2]', [{ from: 16, to: 20 }])).toEqual([
      { from: 0, to: 15, label: '1', note: 'A } note' }
    ]);
  });

  it('does not collect footnotes inside inline code', () => {
    expect(collectFootnoteMatches(0, '`^[1]` ^[2]', [])).toEqual([
      { from: 7, to: 11, label: '2', note: null }
    ]);
  });
});
