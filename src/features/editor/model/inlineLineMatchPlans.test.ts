import { describe, expect, it } from 'vitest';

import { collectPreviewLineMatchState, collectSourceLineMatchState } from './inlineLineMatchPlans';

describe('inlineLineMatchPlans', () => {
  it('builds preview line state around preserved image and inline code ranges', () => {
    const state = collectPreviewLineMatchState(0, '![alt](img) `code` ^[1] [link](url) [[Node]] [...]', false, [
      { from: 0, to: 11 }
    ]);

    expect(state.preservedRanges).toEqual([
      { from: 45, to: 50 },
      { from: 0, to: 11 },
      { from: 12, to: 18 }
    ]);
    expect(state.footnoteRanges).toEqual([{ from: 19, to: 23 }]);
    expect(state.inlineLinkMatches).toHaveLength(1);
    expect(state.wikiLinkMatches).toHaveLength(1);
  });

  it('skips inline-only collectors inside code blocks in source mode', () => {
    expect(collectSourceLineMatchState(0, '`x` ^[1] [a](b) [[Node]] [...]', true)).toEqual({
      clozePlaceholderRanges: [{ from: 25, to: 30 }],
      footnoteRanges: [],
      imageMatches: [],
      inlineCodeMatches: [],
      inlineLinkMatches: [],
      wikiLinkMatches: [],
      preservedRanges: [{ from: 25, to: 30 }],
      footnoteMatches: []
    });
  });
});
