import { describe, expect, it } from 'vitest';

import { collectMarkdownEmbedRanges } from './markdownOblikeInlineProjection';

describe('markdownOblikeInlineProjection', () => {
  it('collects OB-like embeds as their own parser-backed ranges', () => {
    expect(collectMarkdownEmbedRanges('Open ![[Folder/Card|Alias]]', 10)).toEqual([
      {
        from: 15,
        to: 37,
        hiddenRanges: [
          { from: 15, to: 30 },
          { from: 35, to: 37 }
        ],
        labelFrom: 30,
        labelTo: 35,
        target: 'Folder/Card'
      }
    ]);
  });

  it('does not collect embeds inside inline code', () => {
    expect(collectMarkdownEmbedRanges('`![[Page]]` ![[Live]]')).toEqual([
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
