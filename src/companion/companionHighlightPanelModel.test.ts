import { describe, expect, it } from 'vitest';

import { buildCompanionHighlightPanelItems } from './companionHighlightPanelModel';

describe('buildCompanionHighlightPanelItems', () => {
  it('builds document-ordered highlight rows from text anchor decorations', () => {
    const content = 'Alpha beta gamma delta epsilon';

    expect(buildCompanionHighlightPanelItems({
      content,
      textAnchorDecorations: [
        { from: 17, kind: 'highlight', nodeId: 'highlight-2', to: 22 },
        { from: 6, kind: 'cloze', nodeId: 'cloze-1', to: 10 },
        { from: 0, kind: 'highlight', nodeId: 'highlight-1', to: 5 }
      ]
    })).toEqual([
      { from: 0, nodeId: 'highlight-1', text: 'Alpha', to: 5 },
      { from: 17, nodeId: 'highlight-2', text: 'delta', to: 22 }
    ]);
  });

  it('groups multiple ranges for the same highlight by the first document range', () => {
    const content = 'First range and second range';

    expect(buildCompanionHighlightPanelItems({
      content,
      textAnchorDecorations: [
        { from: 16, kind: 'highlight', nodeId: 'highlight-1', to: 28 },
        { from: 0, kind: 'highlight', nodeId: 'highlight-1', to: 11 }
      ]
    })).toEqual([
      { from: 0, nodeId: 'highlight-1', text: 'First range', to: 11 }
    ]);
  });

  it('keeps ranges without node ids as defensive independent rows', () => {
    const content = 'One two three';

    expect(buildCompanionHighlightPanelItems({
      content,
      textAnchorDecorations: [
        { from: 0, kind: 'highlight', to: 3 },
        { from: 4, kind: 'highlight', to: 7 }
      ]
    })).toEqual([
      { from: 0, text: 'One', to: 3 },
      { from: 4, text: 'two', to: 7 }
    ]);
  });
});
