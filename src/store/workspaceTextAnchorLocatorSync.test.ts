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

function expectMovedBetaLocator(value: unknown) {
  expect(value).toEqual({
    from: 'Start Alpha Beta Gamma'.indexOf('Beta'),
    originalText: 'Beta',
    to: 'Start Alpha Beta Gamma'.indexOf('Beta') + 'Beta'.length
  });
}

describe('workspaceTextAnchorLocatorSync remap', () => {
  it('keeps locator unchanged when the anchored text still matches in place', () => {
    expect(
      remapTextAnchorLocator('Alpha Beta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 6,
      originalText: 'Beta',
      to: 10
    });
  });

  it('moves locator to the unique matching text after parent content shifts', () => {
    expectMovedBetaLocator(
      remapTextAnchorLocator('Start Alpha Beta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    );
  });

  it('leaves locator stale when the original text is no longer unique', () => {
    expect(
      remapTextAnchorLocator('Beta Alpha Beta Gamma', {
        from: 6,
        originalText: 'Beta',
        to: 10
      })
    ).toEqual({
      from: 6,
      originalText: 'Beta',
      to: 10
      });
  });
});

describe('workspaceTextAnchorLocatorSync parent sync', () => {
  it('updates only direct child text anchors for the edited parent', () => {
    const child = createHighlightChildNode();
    const sibling = createHighlightChildNode({ id: 'child-2', parentNodeId: 'other-parent' });

    const result = syncTextAnchorLocatorsForParentContent({
      nextContent: 'Start Alpha Beta Gamma',
      nodesById: {
        'child-1': child,
        'child-2': sibling
      },
      parentNodeId: 'parent-1',
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
          })
        }
      })
    ]);
    expect(result.nextNodesById['child-2']).toBe(sibling);
  });
});
