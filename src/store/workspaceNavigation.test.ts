import { describe, expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { resolveAncestorAnchorLink } from './workspaceNavigation';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'parentNodeId'>): Node {
  const now = '2026-04-06T00:00:00.000Z';
  const { id, parentNodeId, ...rest } = overrides;
  const title = rest.title ?? id;
  return {
    anchorLink: null,
    content: '',
    createdAt: now,
    hasContent: undefined,
    hasReveal: undefined,
    kind: 'topic',
    reveal: null,
    review: null,
    title,
    updatedAt: now,
    id,
    parentNodeId,
    ...rest
  };
}

describe('resolveAncestorAnchorLink', () => {
  it('returns the active node anchor when the target is an ancestor', () => {
    const nodesById: Record<string, Node> = {
      pdf: createNode({ id: 'pdf', parentNodeId: null }),
      chapter: createNode({ id: 'chapter', parentNodeId: 'pdf' }),
      highlight: createNode({
        anchorLink: { id: 'hl-1', kind: 'highlight', locator: { page: 7, x: 0.2, y: 0.6 } },
        id: 'highlight',
        parentNodeId: 'chapter'
      }),
      note: createNode({ id: 'note', parentNodeId: 'highlight' })
    };

    expect(resolveAncestorAnchorLink('note', 'pdf', nodesById)).toEqual({
      focusAnchor: null,
      isAncestor: true
    });
  });

  it('keeps the active node locator when the active node already has one', () => {
    const nodesById: Record<string, Node> = {
      root: createNode({ id: 'root', parentNodeId: null }),
      article: createNode({ id: 'article', parentNodeId: 'root' }),
      child: createNode({
        anchorLink: {
          id: 'cloze-1',
          kind: 'cloze',
          locator: { from: 6, originalText: 'Beta', to: 10 }
        },
        id: 'child',
        parentNodeId: 'article'
      })
    };

    expect(resolveAncestorAnchorLink('child', 'root', nodesById)).toEqual({
      focusAnchor: {
        id: 'cloze-1',
        kind: 'cloze',
        locator: { from: 6, originalText: 'Beta', to: 10 }
      },
      isAncestor: true
    });
  });

  it('returns not-ancestor when chain does not reach target', () => {
    const nodesById: Record<string, Node> = {
      root: createNode({ id: 'root', parentNodeId: null }),
      child: createNode({ id: 'child', parentNodeId: 'root' })
    };

    expect(resolveAncestorAnchorLink('child', 'missing', nodesById)).toEqual({
      focusAnchor: null,
      isAncestor: false
    });
  });
});
