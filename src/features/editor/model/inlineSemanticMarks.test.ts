import { describe, expect, it } from 'vitest';

import { collectStrongTextRanges, collectStrikethroughTextRanges } from './inlineSemanticMarks';

describe('inlineSemanticMarks', () => {
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
});
