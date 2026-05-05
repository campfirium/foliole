import { expect, it } from 'vitest';

import { syncTextAnchorLocatorsForParentContent } from './workspaceTextAnchorLocatorSync';

it('keeps the child cloze as an unresolved zero-width anchor when the anchored text is deleted entirely', () => {
  const child = {
    id: 'child-cloze',
    parentNodeId: 'parent-1',
    kind: 'item' as const,
    title: 'Alpha [...] Gamma',
    hasContent: true,
    content: 'Alpha [...] Gamma',
    anchorLink: {
      id: 'cloze-1',
      kind: 'cloze' as const,
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 10
      }
    },
    hasReveal: true,
    reveal: 'Beta',
    review: {
      difficulty: 5,
      due: '2026-04-14T00:00:00.000Z',
      elapsedDays: 0,
      lapses: 0,
      lastReviewAt: null,
      reps: 0,
      scheduledDays: 0,
      stability: 0,
      state: 0 as const
    },
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  };

  const result = syncTextAnchorLocatorsForParentContent({
    nextContent: 'Alpha  Gamma',
    nodesById: { 'child-cloze': child },
    parentNodeId: 'parent-1',
    previousContent: 'Alpha Beta Gamma',
    timestamp: '2026-04-14T01:00:00.000Z'
  });

  expect(result.updatedNodes).toEqual([
    expect.objectContaining({
      id: 'child-cloze',
      content: 'Alpha [...] Gamma',
      reveal: 'Beta',
      title: 'Alpha [...] Gamma',
      anchorLink: {
        id: 'cloze-1',
        kind: 'cloze',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 6
        }
      }
    })
  ]);
});
