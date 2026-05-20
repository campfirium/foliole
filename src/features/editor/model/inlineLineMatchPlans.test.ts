import { describe, expect, it } from 'vitest';

import { collectPreviewLineMatchState, collectSourceLineMatchState } from './inlineLineMatchPlans';

describe('inlineLineMatchPlans', () => {
  it('builds preview line state around preserved image and inline code ranges', () => {
    const state = collectPreviewLineMatchState(0, '![alt](img) `code` ^[1] [link](url) [[Node]] [...]', false, [
      { from: 0, to: 11 }
    ]);

    expect(state.preservedRanges).toEqual([
      { from: 0, to: 11 },
      { from: 12, to: 18 }
    ]);
    expect(state.footnoteRanges).toEqual([{ from: 19, to: 23 }]);
    expect(state.clozePlaceholderRanges).toEqual([{ from: 45, to: 50 }]);
    expect(state.inlineLinkMatches).toHaveLength(1);
    expect(state.wikiLinkMatches).toHaveLength(1);
  });

  it('skips cloze placeholders inside preserved ranges', () => {
    const lineText = '`[...]` [...](url) \\[...] [...]';
    const state = collectPreviewLineMatchState(0, lineText, false, []);
    const visiblePlaceholderFrom = lineText.lastIndexOf('[...]');

    expect(state.clozePlaceholderRanges).toEqual([{ from: visiblePlaceholderFrom, to: visiblePlaceholderFrom + 5 }]);
  });

  it('collects plain Markdown escape markers outside preserved ranges in preview', () => {
    const state = collectPreviewLineMatchState(0, '\\*\\*\\* `\\*` [\\*](url)', false, []);

    expect(state.escapedRanges).toEqual([
      { from: 0, to: 1 },
      { from: 2, to: 3 },
      { from: 4, to: 5 }
    ]);
  });

  it('skips inline-only collectors inside code blocks in source mode', () => {
    expect(collectSourceLineMatchState(0, '`x` ^[1] [a](b) [[Node]] [...]', true)).toEqual({
      autolinkMatches: [],
      clozePlaceholderRanges: [],
      embedMatches: [],
      escapedRanges: [],
      footnoteRanges: [],
      imageMatches: [],
      inlineCodeMatches: [],
      inlineLinkMatches: [],
      wikiLinkMatches: [],
      preservedRanges: [],
      footnoteMatches: []
    });
  });
});
