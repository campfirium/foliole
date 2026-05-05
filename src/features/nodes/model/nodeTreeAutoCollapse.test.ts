import { describe, expect, it } from 'vitest';

import { buildNodeTree } from './nodeTree';
import {
  buildAutoCollapsedNodeIds,
  resolveNodeListFocusContextId
} from './nodeTreeAutoCollapse';
import type { Node } from './nodeTypes';

function createNode(
  id: string,
  title: string,
  parentNodeId: string | null,
  options?: { derived?: boolean }
): Node {
  return {
    id,
    parentNodeId,
    title,
    content: title,
    reveal: null,
    review: null,
    anchorLink: options?.derived ? { id: `${id}-anchor`, kind: 'highlight' } : null,
    createdAt: '2026-02-25T00:00:00.000Z',
    updatedAt: '2026-02-25T00:00:00.000Z'
  };
}

describe('buildAutoCollapsedNodeIds', () => {
  it('collapses article nodes when there is no active focus', () => {
    const nodeOrder = ['folder', 'article-a', 'highlight-a', 'article-b', 'highlight-b'];
    const nodesById: Record<string, Node> = {
      folder: createNode('folder', 'Folder', null),
      'article-a': createNode('article-a', 'Article A', 'folder'),
      'highlight-a': createNode('highlight-a', 'Highlight A', 'article-a', { derived: true }),
      'article-b': createNode('article-b', 'Article B', 'folder'),
      'highlight-b': createNode('highlight-b', 'Highlight B', 'article-b', { derived: true })
    };
    const tree = buildNodeTree(nodeOrder, nodesById);

    expect(
      [...buildAutoCollapsedNodeIds({
        activeNodeId: null,
        nodesById,
        parentById: tree.parentById,
        rows: tree.rows
      })]
    ).toEqual(['article-a', 'article-b']);
  });

  it('keeps only the active path and current article expanded', () => {
    const nodeOrder = [
      'folder-a',
      'article-a',
      'highlight-a1',
      'highlight-a2',
      'article-b',
      'highlight-b1',
      'folder-b',
      'article-c',
      'highlight-c1'
    ];
    const nodesById: Record<string, Node> = {
      'folder-a': createNode('folder-a', 'Folder A', null),
      'article-a': createNode('article-a', 'Article A', 'folder-a'),
      'highlight-a1': createNode('highlight-a1', 'Highlight A1', 'article-a', { derived: true }),
      'highlight-a2': createNode('highlight-a2', 'Highlight A2', 'article-a', { derived: true }),
      'article-b': createNode('article-b', 'Article B', 'folder-a'),
      'highlight-b1': createNode('highlight-b1', 'Highlight B1', 'article-b', { derived: true }),
      'folder-b': createNode('folder-b', 'Folder B', null),
      'article-c': createNode('article-c', 'Article C', 'folder-b'),
      'highlight-c1': createNode('highlight-c1', 'Highlight C1', 'article-c', { derived: true })
    };
    const tree = buildNodeTree(nodeOrder, nodesById);

    expect(
      [...buildAutoCollapsedNodeIds({
        activeNodeId: 'highlight-a2',
        nodesById,
        parentById: tree.parentById,
        rows: tree.rows
      })]
    ).toEqual(['article-b', 'folder-b', 'article-c']);
  });
});

describe('resolveNodeListFocusContextId', () => {
  it('uses the parent article as focus context for derived nodes', () => {
    const nodeOrder = ['folder', 'article', 'highlight'];
    const nodesById: Record<string, Node> = {
      folder: createNode('folder', 'Folder', null),
      article: createNode('article', 'Article', 'folder'),
      highlight: createNode('highlight', 'Highlight', 'article', { derived: true })
    };
    const tree = buildNodeTree(nodeOrder, nodesById);

    expect(resolveNodeListFocusContextId('highlight', nodesById, tree.parentById)).toBe('article');
  });
});
