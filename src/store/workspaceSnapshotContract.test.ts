import { expect, it } from 'vitest';

import { normalizeWorkspaceSnapshot, resolveWorkspaceSnapshotActiveNodeId } from '../../lib/core/database/workspaceSnapshotContract';

interface TestSnapshotNode {
  deletedAt?: string | null;
  id: string;
  parentNodeId: string | null;
  updatedAt: string;
}

function createNode(id: string, patch: Partial<TestSnapshotNode> = {}): TestSnapshotNode {
  return {
    id,
    parentNodeId: null,
    updatedAt: '2026-05-24T00:00:00.000Z',
    ...patch
  };
}

it('normalizes visible order, trash indexes, and active fallback from entity facts', () => {
  const snapshot = normalizeWorkspaceSnapshot({
    activeNodeId: 'deleted-node',
    nodeOrder: ['deleted-node', 'visible-node'],
    nodesById: {
      'deleted-node': createNode('deleted-node', { deletedAt: '2026-05-24T00:01:00.000Z' }),
      'visible-node': createNode('visible-node')
    },
    trashedNodeDeletedAtById: {},
    trashedNodeIds: []
  });

  expect(snapshot.nodeOrder).toEqual(['visible-node']);
  expect(snapshot.trashedNodeIds).toEqual(['deleted-node']);
  expect(snapshot.trashedNodeDeletedAtById).toEqual({ 'deleted-node': '2026-05-24T00:01:00.000Z' });
  expect(snapshot.activeNodeId).toBe('visible-node');
});

it('hoists legacy trash timestamp maps onto nodes before deriving trash membership', () => {
  const snapshot = normalizeWorkspaceSnapshot({
    activeNodeId: null,
    nodeOrder: ['legacy-trash'],
    nodesById: {
      'legacy-trash': createNode('legacy-trash')
    },
    trashedNodeDeletedAtById: {
      'legacy-trash': '2026-05-24T00:02:00.000Z'
    },
    trashedNodeIds: ['legacy-trash']
  });

  expect(snapshot.nodesById['legacy-trash']?.deletedAt).toBe('2026-05-24T00:02:00.000Z');
  expect(snapshot.nodeOrder).toEqual([]);
  expect(snapshot.trashedNodeIds).toEqual(['legacy-trash']);
});

it('keeps bare legacy trash ids as derived membership without overriding restored lifecycle facts', () => {
  const snapshot = normalizeWorkspaceSnapshot({
    activeNodeId: 'legacy-trash',
    nodeOrder: ['legacy-trash', 'restored-node'],
    nodesById: {
      'legacy-trash': createNode('legacy-trash'),
      'restored-node': createNode('restored-node', { deletedAt: null })
    },
    trashedNodeIds: ['legacy-trash', 'restored-node']
  });

  expect(snapshot.nodeOrder).toEqual(['restored-node']);
  expect(snapshot.trashedNodeIds).toEqual(['legacy-trash']);
  expect(snapshot.trashedNodeDeletedAtById).toEqual({});
  expect(snapshot.activeNodeId).toBe('restored-node');
});

it('uses the same active resolver for persisted, runtime, and reading-progress callers', () => {
  expect(resolveWorkspaceSnapshotActiveNodeId({
    activeNodeId: 'missing-node',
    nodeOrder: ['deleted-node', 'visible-node'],
    nodesById: {
      'deleted-node': createNode('deleted-node'),
      'visible-node': createNode('visible-node')
    },
    trashedNodeIds: ['deleted-node']
  })).toBe('visible-node');
});

it('keeps all non-deleted node ids visible when no trash facts exist', () => {
  const snapshot = normalizeWorkspaceSnapshot({
    activeNodeId: 'topic-1',
    nodeOrder: ['topic-1', 'item-1', 'item-2'],
    nodesById: {
      'topic-1': createNode('topic-1'),
      'item-1': createNode('item-1'),
      'item-2': createNode('item-2')
    },
    trashedNodeIds: []
  });

  expect(snapshot.nodeOrder).toEqual(['topic-1', 'item-1', 'item-2']);
});
