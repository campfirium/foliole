import { describe, expect, it } from 'vitest';

import { remapTextAnchorLocator } from '../features/editor/model/textAnchorLocatorResolution';
import type { Node } from '../features/nodes/model/nodeTypes';

import { syncTextAnchorLocatorsForParentContent } from './workspaceTextAnchorLocatorSync';

function createHighlightChildNode(overrides?: Partial<Node>): Node {
  return {
    id: 'child-1',
    parentNodeId: 'parent-1',
    kind: 'topic',
    title: 'Child',
    hasContent: true,
    content: 'Beta',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 10
      }
    },
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z',
    ...overrides
  };
}

function createClozeChildNode(): Node {
  return createHighlightChildNode({
    id: 'child-cloze',
    kind: 'item',
    title: 'Alpha [...] Gamma',
    content: 'Alpha [...] Gamma',
    anchorLink: {
      id: 'cloze-1',
      kind: 'cloze',
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
      state: 0
    }
  });
}

function createMultiRangeClozeChildNode(): Node {
  return createHighlightChildNode({
    id: 'child-cloze-multi',
    kind: 'item',
    title: '[...] Beta [...] Delta',
    content: '[...] Beta [...] Delta',
    anchorLink: {
      id: 'cloze-multi-1',
      kind: 'cloze',
      locator: {
        ranges: [
          {
            from: 0,
            originalText: 'Alpha',
            to: 5
          },
          {
            from: 11,
            originalText: 'Gamma',
            to: 16
          }
        ]
      }
    },
    hasReveal: true,
    reveal: 'Alpha\nGamma',
    review: {
      difficulty: 5,
      due: '2026-04-14T00:00:00.000Z',
      elapsedDays: 0,
      lapses: 0,
      lastReviewAt: null,
      reps: 0,
      scheduledDays: 0,
      stability: 0,
      state: 0
    }
  });
}

function expectUpdatedClozeNode(node: Node) {
  expect(node).toEqual(
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
          originalText: 'Better',
          to: 12
        }
      }
    })
  );
}

function runDirectChildSyncCase() {
  const child = createHighlightChildNode();
  const sibling = createHighlightChildNode({ id: 'child-2', parentNodeId: 'other-parent' });

  const result = syncTextAnchorLocatorsForParentContent({
    nextContent: 'Start Alpha Beta Gamma',
    nodesById: {
      'child-1': child,
      'child-2': sibling
    },
    parentNodeId: 'parent-1',
    previousContent: 'Alpha Beta Gamma',
    timestamp: '2026-04-14T01:00:00.000Z'
  });

  expect(result.updatedNodes).toEqual([
    expect.objectContaining({
      id: 'child-1',
      updatedAt: '2026-04-14T01:00:00.000Z',
      anchorLink: {
        id: 'hl-1',
        kind: 'highlight',
        locator: remapTextAnchorLocator('Start Alpha Beta Gamma', {
          from: 6,
          originalText: 'Beta',
          to: 10
        }, 'Alpha Beta Gamma')
      }
    })
  ]);
  expect(result.nextNodesById['child-2']).toBe(sibling);
}

function runHighlightRefreshCase() {
  const child = createHighlightChildNode({ title: 'Beta' });

  const result = syncTextAnchorLocatorsForParentContent({
    nextContent: 'Alpha Better Gamma',
    nodesById: { 'child-1': child },
    parentNodeId: 'parent-1',
    previousContent: 'Alpha Beta Gamma',
    timestamp: '2026-04-14T01:00:00.000Z'
  });

  expect(result.updatedNodes).toEqual([
    expect.objectContaining({
      id: 'child-1',
      content: 'Beta',
      title: 'Beta',
      anchorLink: {
        id: 'hl-1',
        kind: 'highlight',
        locator: {
          from: 6,
          originalText: 'Better',
          to: 12
        }
      }
    })
  ]);
}

function runClozeRefreshCase() {
  const clozeChild = createClozeChildNode();

  const result = syncTextAnchorLocatorsForParentContent({
    nextContent: 'Alpha Better Gamma',
    nodesById: { 'child-cloze': clozeChild },
    parentNodeId: 'parent-1',
    previousContent: 'Alpha Beta Gamma',
    timestamp: '2026-04-14T01:00:00.000Z'
  });

  expect(result.updatedNodes).toHaveLength(1);
  expectUpdatedClozeNode(result.updatedNodes[0]!);
}

function runDeletedAnchorTextCase() {
  const child = createHighlightChildNode({ title: 'Beta' });

  const result = syncTextAnchorLocatorsForParentContent({
    nextContent: 'Alpha  Gamma',
    nodesById: { 'child-1': child },
    parentNodeId: 'parent-1',
    previousContent: 'Alpha Beta Gamma',
    timestamp: '2026-04-14T01:00:00.000Z'
  });

  expect(result.updatedNodes).toEqual([
    expect.objectContaining({
      id: 'child-1',
      content: 'Beta',
      title: 'Beta',
      anchorLink: {
        id: 'hl-1',
        kind: 'highlight',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 6
        }
      }
    })
  ]);
  expect(result.nextNodesById['child-1']).toEqual(result.updatedNodes[0]);
}

function runMultiRangeClozeRefreshCase() {
  const clozeChild = createMultiRangeClozeChildNode();

  const result = syncTextAnchorLocatorsForParentContent({
    nextContent: 'Alphaa Beta Gamma Delta',
    nodesById: { 'child-cloze-multi': clozeChild },
    parentNodeId: 'parent-1',
    previousContent: 'Alpha Beta Gamma Delta',
    timestamp: '2026-04-14T01:00:00.000Z'
  });

  expect(result.updatedNodes).toEqual([
    expect.objectContaining({
      id: 'child-cloze-multi',
      content: '[...] Beta [...] Delta',
      reveal: 'Alpha\nGamma',
      title: '[...] Beta [...] Delta',
      anchorLink: {
        id: 'cloze-multi-1',
        kind: 'cloze',
        locator: {
          ranges: [
            {
              from: 0,
              originalText: 'Alphaa',
              to: 6
            },
            {
              from: 12,
              originalText: 'Gamma',
              to: 17
            }
          ]
        }
      }
    })
  ]);
}

describe('workspaceTextAnchorLocatorSync parent sync', () => {
  it('updates only direct child text anchors for the edited parent', runDirectChildSyncCase);
  it('updates highlight locators without rewriting child text when the parent edit changes the anchored text itself', runHighlightRefreshCase);
  it('updates cloze locators without rewriting child prompt and answer when the parent edit changes the anchored text itself', runClozeRefreshCase);
  it('updates multi-range cloze locators without rewriting child content when each anchored segment changes in place', runMultiRangeClozeRefreshCase);
  it('keeps the child highlight as an unresolved zero-width anchor when the anchored text is deleted entirely', runDeletedAnchorTextCase);
});
