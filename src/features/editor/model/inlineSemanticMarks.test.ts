import { describe, expect, it } from 'vitest';

import {
  collectClozePlaceholderRanges,
  collectSemanticMarkPlan,
  collectStrongTextRanges,
  collectStrikethroughTextRanges
} from './inlineSemanticMarks';

describe('inlineSemanticMarks', () => {
  it('collects cloze placeholder ranges', () => {
    expect(collectClozePlaceholderRanges(10, 'A [...] B')).toEqual([{ from: 12, to: 17 }]);
  });

  it('collects strong text ranges', () => {
    expect(collectStrongTextRanges(0, '**Bold** text', false)).toEqual([
      { className: 'cm-md-strong', from: 2, to: 6 }
    ]);
  });

  it('collects strikethrough text ranges', () => {
    expect(collectStrikethroughTextRanges(4, 'A ~~gone~~ item', false)).toEqual([
      { className: 'cm-md-strikethrough', from: 8, to: 12 }
    ]);
  });

  it('collects highlight and cloze semantic mark plans', () => {
    expect(collectSemanticMarkPlan(0, '==Hi== and {{Secret}}', false)).toEqual({
      markRanges: [
        { className: 'cm-md-highlight', from: 2, to: 4 },
        { className: 'cm-md-cloze', from: 13, to: 19 }
      ],
      replaceRanges: [
        { from: 0, to: 2 },
        { from: 4, to: 6 },
        { from: 11, to: 13 },
        { from: 19, to: 21 }
      ]
    });
  });
});
