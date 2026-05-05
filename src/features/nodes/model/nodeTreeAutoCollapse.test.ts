import { describe, expect, it } from 'vitest';

import { buildNodeTree } from './nodeTree';
import {
  buildDefaultCollapsedNodeIds,
  collectAutoExpandedNodeIds
} from './nodeTreeAutoCollapse';
import type { WorkspaceListNode } from './workspaceListNode';

function createNode(
  id: string,
  title: string,
  parentNodeId: string | null,
  options?: { derived?: boolean }
): WorkspaceListNode {
  return {
    id,
    parentNodeId,
    title,
    hasContent: true,
    hasReveal: false,
    review: null,
    anchorLink: options?.derived ? { id: `${id}-anchor`, kind: 'highlight' } : null,
    createdAt: '2026-02-25T00:00:00.000Z',
    updatedAt: '2026-02-25T00:00:00.000Z'
  };
}

describe('buildDefaultCollapsedNodeIds', () => {
  it('collapses only branches whose direct children are all derived nodes', () => {
    const nodeOrder = ['folder', 'article-a', 'highlight-a', 'article-b', 'child-b', 'highlight-b'];
    const nodesById: Record<string, WorkspaceListNode> = {
      folder: createNode('folder', 'Folder', null),
      'article-a': createNode('article-a', 'Article A', 'folder'),
      'highlight-a': createNode('highlight-a', 'Highlight A', 'article-a', { derived: true }),
      'article-b': createNode('article-b', 'Article B', 'folder'),
      'child-b': createNode('child-b', 'Child B', 'article-b'),
      'highlight-b': createNode('highlight-b', 'Highlight B', 'article-b', { derived: true })
    };
    const tree = buildNodeTree(nodeOrder, nodesById);

    expect(
      [...buildDefaultCollapsedNodeIds({
        nodesById,
        rows: tree.rows
      })]
    ).toEqual(['article-a']);
  });
});

describe('collectAutoExpandedNodeIds', () => {
  it('expands non-derived ancestors so the current derived node stays visible', () => {
    const nodeOrder = ['folder', 'article', 'highlight'];
    const nodesById: Record<string, WorkspaceListNode> = {
      folder: createNode('folder', 'Folder', null),
      article: createNode('article', 'Article', 'folder'),
      highlight: createNode('highlight', 'Highlight', 'article', { derived: true })
    };
    const tree = buildNodeTree(nodeOrder, nodesById);

    expect(
      [...collectAutoExpandedNodeIds({
        activeNodeId: 'highlight',
        nodesById,
        parentById: tree.parentById,
        rows: tree.rows
      })]
    ).toEqual(['article', 'folder']);
  });

  it('expands the selected node only when it has non-derived children', () => {
    const nodeOrder = ['folder', 'section', 'child', 'article', 'highlight'];
    const nodesById: Record<string, WorkspaceListNode> = {
      folder: createNode('folder', 'Folder', null),
      section: createNode('section', 'Section', 'folder'),
      child: createNode('child', 'Child', 'section'),
      article: createNode('article', 'Article', 'folder'),
      highlight: createNode('highlight', 'Highlight', 'article', { derived: true })
    };
    const tree = buildNodeTree(nodeOrder, nodesById);

    expect(
      [...collectAutoExpandedNodeIds({
        activeNodeId: 'section',
        nodesById,
        parentById: tree.parentById,
        rows: tree.rows
      })]
    ).toEqual(['folder', 'section']);
    expect(
      [...collectAutoExpandedNodeIds({
        activeNodeId: 'article',
        nodesById,
        parentById: tree.parentById,
        rows: tree.rows
      })]
    ).toEqual(['folder']);
  });
});
