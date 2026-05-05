import { describe, expect, it } from 'vitest';

import { collectMarkdownInlineRanges } from './markdownInlineProjection';

describe('markdownInlineProjection Markdown Compatibility', () => {
  it('projects lenient strong emphasis as strong text without changing source content', () => {
    expect(collectMarkdownInlineRanges('**实操含义：**如果你的应用场景')).toEqual([
      {
        contentFrom: 2,
        contentTo: 7,
        from: 0,
        kind: 'strong',
        syntaxRanges: [
          { from: 0, to: 2 },
          { from: 7, to: 9 }
        ],
        text: '实操含义：',
        to: 9
      }
    ]);
  });

  it('supports ASCII punctuation before adjacent text', () => {
    expect(collectMarkdownInlineRanges('**ab:**123123')).toEqual([
      {
        contentFrom: 2,
        contentTo: 5,
        from: 0,
        kind: 'strong',
        syntaxRanges: [
          { from: 0, to: 2 },
          { from: 5, to: 7 }
        ],
        text: 'ab:',
        to: 7
      }
    ]);
  });

  it('keeps standard adjacent strong emphasis on the standard projection path', () => {
    expect(collectMarkdownInlineRanges('**123**dsafdasdfasdf')).toEqual([
      {
        contentFrom: 2,
        contentTo: 5,
        from: 0,
        kind: 'strong',
        syntaxRanges: [
          { from: 0, to: 2 },
          { from: 5, to: 7 }
        ],
        text: '123',
        to: 7
      }
    ]);
  });
});
