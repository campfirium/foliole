import { expect, it } from 'vitest';

import type { NodeTreeRow } from '../model/nodeTree';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../model/workspaceListNode';

import { resolveNodeListActiveRows } from './nodeListActiveRows';

function createNode(args: {
  id: string;
  kind?: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  title: string;
}): WorkspaceListNode {
  const kind = args.kind ?? (args.parentNodeId ? 'topic' : 'folder');
  return {
    anchorLink: null,
    createdAt: '2026-06-09T00:00:00.000Z',
    hasContent: kind !== 'folder',
    hasReveal: kind === 'item',
    id: args.id,
    kind,
    parentNodeId: args.parentNodeId ?? null,
    review: null,
    title: args.title,
    updatedAt: '2026-06-09T00:00:00.000Z'
  };
}

function createRow(node: WorkspaceListNode, depth: number, hasChildren = false): NodeTreeRow {
  return {
    descendantCount: hasChildren ? 1 : 0,
    depth,
    hasChildren,
    node
  };
}

function createFixture() {
  const folder = createNode({ id: 'folder-a', title: 'Folder A' });
  const article = createNode({ id: 'article-a', parentNodeId: 'folder-a', title: 'React Notes' });
  const highlight = createNode({ id: 'highlight-a', kind: 'item', parentNodeId: 'article-a', title: 'Hook Summary' });
  const sibling = createNode({ id: 'article-b', parentNodeId: 'folder-a', title: 'Vue Notes' });
  const rows = [createRow(folder, 0, true), createRow(article, 1, true), createRow(highlight, 2), createRow(sibling, 1)];
  const nodesById: WorkspaceListNodesById = {
    [article.id]: article,
    [folder.id]: folder,
    [highlight.id]: highlight,
    [sibling.id]: sibling
  };
  return { nodesById, nodeOrder: rows.map((row) => row.node.id), rows };
}

it('filters note rows while keeping the matched path visible', () => {
  const fixture = createFixture();

  const rows = resolveNodeListActiveRows({
    activeRows: fixture.rows,
    isTrashViewOpen: false,
    isVirtualViewOpen: false,
    nodeOrder: fixture.nodeOrder,
    nodesById: fixture.nodesById,
    noteRowsAll: fixture.rows,
    searchQuery: 'hook',
    trashedNodeIds: []
  });

  expect(rows.map((row) => row.node.id)).toEqual(['folder-a', 'article-a', 'highlight-a']);
});

it('filters trash rows by covered descendants while returning only visible trash roots', () => {
  const fixture = createFixture();
  const activeRows = [fixture.rows[0]!];

  const rows = resolveNodeListActiveRows({
    activeRows,
    isTrashViewOpen: true,
    isVirtualViewOpen: false,
    nodeOrder: fixture.nodeOrder,
    nodesById: fixture.nodesById,
    noteRowsAll: fixture.rows,
    searchQuery: 'hook',
    trashedNodeIds: ['folder-a', 'article-a', 'highlight-a']
  });

  expect(rows.map((row) => row.node.id)).toEqual(['folder-a']);
});

it('does not filter virtual rows through title search', () => {
  const fixture = createFixture();
  const activeRows = [fixture.rows[3]!];

  const rows = resolveNodeListActiveRows({
    activeRows,
    isTrashViewOpen: false,
    isVirtualViewOpen: true,
    nodeOrder: fixture.nodeOrder,
    nodesById: fixture.nodesById,
    noteRowsAll: fixture.rows,
    searchQuery: 'hook',
    trashedNodeIds: []
  });

  expect(rows).toBe(activeRows);
});
