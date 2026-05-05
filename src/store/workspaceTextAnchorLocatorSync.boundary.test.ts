import { describe, expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { syncTextAnchorLocatorsForParentContent } from './workspaceTextAnchorLocatorSync';

function createHighlightChildNode(): Node {
  return {
    id: 'child-1',
    parentNodeId: 'parent-1',
    kind: 'topic',
    title: 'Beta',
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
    updatedAt: '2026-04-14T00:00:00.000Z'
  };
}

describe('workspaceTextAnchorLocatorSync boundary inserts', () => {
  it('keeps text inserted before a text anchor outside the anchor during parent sync', () => {
    const result = syncTextAnchorLocatorsForParentContent({
      nextContent: 'Alpha New Beta Gamma',
      nodesById: { 'child-1': createHighlightChildNode() },
      parentNodeId: 'parent-1',
      previousContent: 'Alpha Beta Gamma',
      timestamp: '2026-04-14T01:00:00.000Z'
    });

    expect(result.updatedNodes).toEqual([
      expect.objectContaining({
        id: 'child-1',
        anchorLink: {
          id: 'hl-1',
          kind: 'highlight',
          locator: { from: 10, originalText: 'Beta', to: 14 }
        }
      })
    ]);
  });

  it('keeps text inserted after a text anchor outside the anchor during parent sync', () => {
    const child = createHighlightChildNode();
    const result = syncTextAnchorLocatorsForParentContent({
      nextContent: 'Alpha Beta New Gamma',
      nodesById: { 'child-1': child },
      parentNodeId: 'parent-1',
      previousContent: 'Alpha Beta Gamma',
      timestamp: '2026-04-14T01:00:00.000Z'
    });

    expect(result.updatedNodes).toEqual([]);
    expect(result.nextNodesById['child-1']).toBe(child);
  });
});
