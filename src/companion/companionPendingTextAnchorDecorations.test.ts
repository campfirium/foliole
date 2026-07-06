import { expect, it } from 'vitest';

import {
  createCompanionPendingTextAnchorDecorations,
  mergeCompanionPendingTextAnchorDecorations,
  removeResolvedCompanionPendingTextAnchorDecorations
} from './companionPendingTextAnchorDecorations';

const payload = {
  anchorId: 'anchor-1',
  clozeContent: 'Alpha [...]',
  entries: [{
    anchorId: 'anchor-1',
    clozeContent: 'Alpha [...]',
    locator: { from: 6, originalText: 'Beta', to: 10 },
    range: { from: 6, to: 10 },
    selectionText: 'Beta'
  }],
  parentNodeId: 'topic-1',
  selectionText: 'Beta'
};

it('creates a pending highlight decoration from the selection payload', () => {
  expect(createCompanionPendingTextAnchorDecorations('highlight', payload)).toEqual([{
    from: 6,
    kind: 'highlight',
    nodeId: 'pending-anchor-1-0',
    to: 10
  }]);
});

it('keeps pending decorations until real decorations arrive', () => {
  const pending = createCompanionPendingTextAnchorDecorations('note', payload);
  expect(mergeCompanionPendingTextAnchorDecorations({ pending, real: [] })).toEqual(pending);

  const real = [{ from: 6, kind: 'highlight' as const, nodeId: 'highlight-1', to: 10 }];
  expect(mergeCompanionPendingTextAnchorDecorations({ pending, real })).toEqual(real);
  expect(removeResolvedCompanionPendingTextAnchorDecorations({ pending, real })).toEqual([]);
});
