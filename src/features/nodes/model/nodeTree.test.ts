import { describe, expect, it } from 'vitest';

import { buildNodeTreeRows } from './nodeTree';
import type { Node } from './nodeTypes';

function createNode(id: string, title: string, parentNodeId: string | null): Node {
  return {
    id,
    parentNodeId,
    title,
    content: title,
    reveal: null,
    review: null,
    createdAt: '2026-02-25T00:00:00.000Z',
    updatedAt: '2026-02-25T00:00:00.000Z'
  };
}

describe('buildNodeTreeRows', () => {
  it('returns depth-first rows following node order', () => {
    const nodeOrder = ['root-1', 'child-1', 'child-2', 'root-2'];
    const nodesById: Record<string, Node> = {
      'root-1': createNode('root-1', 'Root 1', null),
      'child-1': createNode('child-1', 'Child 1', 'root-1'),
      'child-2': createNode('child-2', 'Child 2', 'root-1'),
      'root-2': createNode('root-2', 'Root 2', null)
    };

    const rows = buildNodeTreeRows(nodeOrder, nodesById);

    expect(rows.map((row) => `${row.depth}:${row.node.id}`)).toEqual(['0:root-1', '1:child-1', '1:child-2', '0:root-2']);
    expect(rows.find((row) => row.node.id === 'root-1')?.hasChildren).toBe(true);
    expect(rows.find((row) => row.node.id === 'child-1')?.hasChildren).toBe(false);
  });

  it('treats missing parent references as root nodes', () => {
    const nodeOrder = ['orphan', 'root'];
    const nodesById: Record<string, Node> = {
      orphan: createNode('orphan', 'Orphan', 'missing'),
      root: createNode('root', 'Root', null)
    };

    const rows = buildNodeTreeRows(nodeOrder, nodesById);

    expect(rows.map((row) => `${row.depth}:${row.node.id}`)).toEqual(['0:orphan', '0:root']);
  });
});
