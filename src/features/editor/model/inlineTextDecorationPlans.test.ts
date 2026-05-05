import { describe, expect, it } from 'vitest';

import {
  collectInlineCodeSyntaxDecorationPlan,
  collectInlineTokenDecorationPlan,
  collectEmphasisTextDecorationPlan,
  collectSourceHighlightDecorationPlan,
  collectStrikethroughTextDecorationPlan
} from './inlineTextDecorationPlans';

describe('inlineTextDecorationPlans', () => {
  it('hides markdown inline tokens outside preserved ranges', () => {
    expect(collectInlineTokenDecorationPlan(0, '*em* **Bold** ~~strike~~', false, false, [])).toEqual({
      markRanges: [],
      replaceRanges: [
        { from: 0, to: 1 },
        { from: 3, to: 4 },
        { from: 5, to: 7 },
        { from: 11, to: 13 },
        { from: 14, to: 16 },
        { from: 22, to: 24 }
      ]
    });
  });

  it('keeps preserved inline tokens untouched while exposing visible syntax when requested', () => {
    expect(collectInlineTokenDecorationPlan(10, '**Bold** [^1]', false, true, [{ from: 18, to: 22 }])).toEqual({
      markRanges: [
        { className: 'cm-md-syntax-visible', from: 10, to: 12 },
        { className: 'cm-md-syntax-visible', from: 16, to: 18 }
      ],
      replaceRanges: []
    });
  });

  it('does not hide markdown tokens inside inline code', () => {
    expect(collectInlineTokenDecorationPlan(0, '`**code**` **Bold**', false, false, [])).toEqual({
      markRanges: [],
      replaceRanges: [
        { from: 11, to: 13 },
        { from: 17, to: 19 }
      ]
    });
  });

  it('marks inline code delimiters as visible syntax', () => {
    expect(
      collectInlineCodeSyntaxDecorationPlan([{ from: 3, to: 11, contentFrom: 4, contentTo: 10 }])
    ).toEqual({
      markRanges: [
        { className: 'cm-md-syntax-visible', from: 3, to: 4 },
        { className: 'cm-md-syntax-visible', from: 10, to: 11 }
      ],
      replaceRanges: []
    });
  });

});

describe('inline semantic decoration plans', () => {
  it('marks strikethrough content ranges', () => {
    expect(collectStrikethroughTextDecorationPlan(0, 'A ~~gone~~ item', false)).toEqual({
      markRanges: [{ className: 'cm-md-strikethrough', from: 4, to: 8 }],
      replaceRanges: []
    });
  });

  it('marks emphasis content ranges', () => {
    expect(collectEmphasisTextDecorationPlan(0, 'A *word* item', false)).toEqual({
      markRanges: [{ className: 'cm-md-emphasis', from: 3, to: 7 }],
      replaceRanges: []
    });
  });

  it('marks source highlight with separate preview styling', () => {
    expect(collectSourceHighlightDecorationPlan(0, 'A ==marked== word', false, false, [])).toEqual({
      markRanges: [{ className: 'cm-md-source-highlight', from: 4, to: 10 }],
      replaceRanges: [
        { from: 2, to: 4 },
        { from: 10, to: 12 }
      ]
    });
  });
});
