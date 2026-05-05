import { describe, expect, it } from 'vitest';

import {
  buildNodeTree,
  buildNodeTreeRows,
  buildVisibleNodeTreeRows,
  collectNodeAncestorIds
} from './nodeTree';
import type { WorkspaceListNode } from './workspaceListNode';

function createNode(id: string, title: string, parentNodeId: string | null): WorkspaceListNode {
  return {
    id,
    parentNodeId,
    title,
    hasContent: true,
    hasReveal: false,
    review: null,
    createdAt: '2026-02-25T00:00:00.000Z',
    updatedAt: '2026-02-25T00:00:00.000Z'
  };
}

describe('buildNodeTreeRows', () => {
  it('returns depth-first rows following node order', () => {
    const nodeOrder = ['root-1', 'child-1', 'child-2', 'root-2'];
    const nodesById: Record<string, WorkspaceListNode> = {
      'root-1': createNode('root-1', 'Root 1', null),
      'child-1': createNode('child-1', 'Child 1', 'root-1'),
      'child-2': createNode('child-2', 'Child 2', 'root-1'),
      'root-2': createNode('root-2', 'Root 2', null)
    };

    const rows = buildNodeTreeRows(nodeOrder, nodesById);

    expect(rows.map((row) => `${row.depth}:${row.node.id}`)).toEqual([
      '0:root-1',
      '1:child-1',
      '1:child-2',
      '0:root-2'
    ]);
    expect(rows.find((row) => row.node.id === 'root-1')?.hasChildren).toBe(true);
    expect(rows.find((row) => row.node.id === 'child-1')?.hasChildren).toBe(false);
  });

  it('counts all descendants for each row', () => {
    const nodeOrder = ['root', 'child-1', 'grandchild-1', 'child-2'];
    const nodesById: Record<string, WorkspaceListNode> = {
      root: createNode('root', 'Root', null),
      'child-1': createNode('child-1', 'Child 1', 'root'),
      'grandchild-1': createNode('grandchild-1', 'Grandchild 1', 'child-1'),
      'child-2': createNode('child-2', 'Child 2', 'root')
    };

    const rows = buildNodeTreeRows(nodeOrder, nodesById);

    expect(rows.find((row) => row.node.id === 'root')?.descendantCount).toBe(3);
    expect(rows.find((row) => row.node.id === 'child-1')?.descendantCount).toBe(1);
    expect(rows.find((row) => row.node.id === 'grandchild-1')?.descendantCount).toBe(0);
    expect(rows.find((row) => row.node.id === 'child-2')?.descendantCount).toBe(0);
  });

  it('treats missing parent references as root nodes', () => {
    const nodeOrder = ['orphan', 'root'];
    const nodesById: Record<string, WorkspaceListNode> = {
      orphan: createNode('orphan', 'Orphan', 'missing'),
      root: createNode('root', 'Root', null)
    };

    const rows = buildNodeTreeRows(nodeOrder, nodesById);

    expect(rows.map((row) => `${row.depth}:${row.node.id}`)).toEqual(['0:orphan', '0:root']);
  });
});

describe('buildVisibleNodeTreeRows', () => {
  it('hides descendant rows for collapsed nodes', () => {
    const nodeOrder = ['root', 'child-1', 'grandchild-1', 'child-2'];
    const nodesById: Record<string, WorkspaceListNode> = {
      root: createNode('root', 'Root', null),
      'child-1': createNode('child-1', 'Child 1', 'root'),
      'grandchild-1': createNode('grandchild-1', 'Grandchild 1', 'child-1'),
      'child-2': createNode('child-2', 'Child 2', 'root')
    };
    const rows = buildNodeTreeRows(nodeOrder, nodesById);

    const visible = buildVisibleNodeTreeRows(rows, new Set(['root']));

    expect(visible.map((row) => row.node.id)).toEqual(['root']);
  });

  it('keeps siblings visible when collapsing one branch', () => {
    const nodeOrder = ['root', 'child-1', 'grandchild-1', 'child-2'];
    const nodesById: Record<string, WorkspaceListNode> = {
      root: createNode('root', 'Root', null),
      'child-1': createNode('child-1', 'Child 1', 'root'),
      'grandchild-1': createNode('grandchild-1', 'Grandchild 1', 'child-1'),
      'child-2': createNode('child-2', 'Child 2', 'root')
    };
    const rows = buildNodeTreeRows(nodeOrder, nodesById);

    const visible = buildVisibleNodeTreeRows(rows, new Set(['child-1']));

    expect(visible.map((row) => row.node.id)).toEqual(['root', 'child-1', 'child-2']);
  });
});

describe('collectNodeAncestorIds', () => {
  it('returns parent chain from nearest parent to root', () => {
    const nodeOrder = ['root', 'child', 'grandchild'];
    const nodesById: Record<string, WorkspaceListNode> = {
      root: createNode('root', 'Root', null),
      child: createNode('child', 'Child', 'root'),
      grandchild: createNode('grandchild', 'Grandchild', 'child')
    };

    const tree = buildNodeTree(nodeOrder, nodesById);

    expect(collectNodeAncestorIds('grandchild', tree.parentById)).toEqual(['child', 'root']);
  });
});
