import { expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';
import type { WorkspacePersistedState } from './workspaceStoreTypes';

function createNode(nodeId: string, createdAt: string, patch: Partial<Node> = {}): Node {
  return {
    id: nodeId,
    parentNodeId: null,
    kind: 'topic',
    title: nodeId,
    isTitleManual: true,
    hideTitleHeading: false,
    content: '',
    reveal: null,
    reading: null,
    review: null,
    createdAt,
    updatedAt: createdAt,
    ...patch
  };
}

function mergeRuntimeSnapshot(
  currentPatch: Partial<ReturnType<typeof createInitialWorkspaceState>>,
  persistedPatch: Partial<WorkspacePersistedState>
) {
  const current = {
    ...useWorkspaceStore.getState(),
    ...createInitialWorkspaceState(new Date('2026-05-13T00:00:00.000Z')),
    ...currentPatch
  };
  return createWorkspaceStorePersistConfig(() => undefined).merge?.(persistedPatch, current) ?? current;
}

it('keeps a renderer-created node when an older runtime snapshot does not include it', () => {
  const newNode = createNode('node-new', '2026-05-13T00:10:00.000Z');
  const merged = mergeRuntimeSnapshot(
    {
      nodeOrder: ['node-new'],
      nodesById: { 'node-new': newNode }
    },
    {
      activeNodeId: null,
      capturedWorkspaceVersion: '2026-05-13T00:05:00.000Z',
      nodeOrder: [],
      nodesById: {},
      trashedNodeDeletedAtById: {},
      trashedNodeIds: []
    }
  );

  expect(merged.nodesById['node-new']).toEqual(newNode);
  expect(merged.nodeOrder).toContain('node-new');
});

it('keeps a renderer trash decision when an older runtime snapshot still shows the node', () => {
  const node = createNode('node-trash', '2026-05-13T00:00:00.000Z');
  const merged = mergeRuntimeSnapshot(
    {
      nodeOrder: [],
      nodesById: { 'node-trash': node },
      trashedNodeDeletedAtById: { 'node-trash': '2026-05-13T00:10:00.000Z' },
      trashedNodeIds: ['node-trash']
    },
    {
      activeNodeId: null,
      capturedWorkspaceVersion: '2026-05-13T00:05:00.000Z',
      nodeOrder: ['node-trash'],
      nodesById: { 'node-trash': node },
      trashedNodeDeletedAtById: {},
      trashedNodeIds: []
    }
  );

  expect(merged.trashedNodeIds).toEqual(['node-trash']);
  expect(merged.trashedNodeDeletedAtById['node-trash']).toBe('2026-05-13T00:10:00.000Z');
  expect(merged.nodesById['node-trash']?.deletedAt).toBe('2026-05-13T00:10:00.000Z');
  expect(merged.nodeOrder).not.toContain('node-trash');
});

it('keeps runtime-deleted nodes hidden when the snapshot carries their tombstone times', () => {
  const node = createNode('node-runtime-trash', '2026-05-13T00:00:00.000Z', {
    deletedAt: '2026-05-13T00:09:00.000Z',
    updatedAt: '2026-05-13T00:09:00.000Z'
  });
  const merged = mergeRuntimeSnapshot(
    {},
    {
      activeNodeId: null,
      capturedWorkspaceVersion: '2026-05-13T00:10:00.000Z',
      nodeOrder: ['node-runtime-trash'],
      nodesById: { 'node-runtime-trash': node },
      trashedNodeDeletedAtById: {},
      trashedNodeIds: []
    }
  );

  expect(merged.trashedNodeIds).toEqual(['node-runtime-trash']);
  expect(merged.trashedNodeDeletedAtById['node-runtime-trash']).toBe('2026-05-13T00:09:00.000Z');
  expect(merged.nodeOrder).not.toContain('node-runtime-trash');
});

it('hoists legacy runtime trash maps back onto nodes before merging', () => {
  const node = createNode('node-legacy-trash', '2026-05-13T00:00:00.000Z');
  const merged = mergeRuntimeSnapshot(
    {},
    {
      activeNodeId: null,
      capturedWorkspaceVersion: '2026-05-13T00:10:00.000Z',
      nodeOrder: ['node-legacy-trash'],
      nodesById: { 'node-legacy-trash': node },
      trashedNodeDeletedAtById: { 'node-legacy-trash': '2026-05-13T00:09:00.000Z' },
      trashedNodeIds: ['node-legacy-trash']
    }
  );

  expect(merged.nodesById['node-legacy-trash']?.deletedAt).toBe('2026-05-13T00:09:00.000Z');
  expect(merged.nodeOrder).not.toContain('node-legacy-trash');
});

it('does not trust runtime trash membership without a tombstone time', () => {
  const node = createNode('node-runtime-visible', '2026-05-13T00:00:00.000Z');
  const merged = mergeRuntimeSnapshot(
    {},
    {
      activeNodeId: null,
      capturedWorkspaceVersion: '2026-05-13T00:10:00.000Z',
      nodeOrder: ['node-runtime-visible'],
      nodesById: { 'node-runtime-visible': node },
      trashedNodeDeletedAtById: {},
      trashedNodeIds: ['node-runtime-visible']
    }
  );

  expect(merged.trashedNodeIds).toEqual([]);
  expect(merged.nodeOrder).toContain('node-runtime-visible');
});

it('keeps a runtime tombstone when the current node has a newer content timestamp', () => {
  const currentNode = createNode('node-stale-current', '2026-05-13T00:00:00.000Z', {
    updatedAt: '2026-05-13T00:12:00.000Z'
  });
  const runtimeNode = createNode('node-stale-current', '2026-05-13T00:00:00.000Z', {
    deletedAt: '2026-05-13T00:09:00.000Z',
    updatedAt: '2026-05-13T00:09:00.000Z'
  });
  const merged = mergeRuntimeSnapshot(
    {
      nodeOrder: ['node-stale-current'],
      nodesById: { 'node-stale-current': currentNode }
    },
    {
      activeNodeId: null,
      capturedWorkspaceVersion: '2026-05-13T00:10:00.000Z',
      nodeOrder: ['node-stale-current'],
      nodesById: { 'node-stale-current': runtimeNode },
      trashedNodeDeletedAtById: {},
      trashedNodeIds: []
    }
  );

  expect(merged.nodesById['node-stale-current']?.deletedAt).toBe('2026-05-13T00:09:00.000Z');
  expect(merged.nodeOrder).not.toContain('node-stale-current');
});

it('allows a newer runtime snapshot to restore a previously trashed node', () => {
  const currentNode = createNode('node-restore', '2026-05-13T00:00:00.000Z', {
    deletedAt: '2026-05-13T00:05:00.000Z',
    updatedAt: '2026-05-13T00:05:00.000Z'
  });
  const restoredNode = createNode('node-restore', '2026-05-13T00:00:00.000Z', {
    updatedAt: '2026-05-13T00:10:00.000Z'
  });
  const merged = mergeRuntimeSnapshot(
    {
      nodeOrder: [],
      nodesById: { 'node-restore': currentNode },
      trashedNodeDeletedAtById: { 'node-restore': '2026-05-13T00:05:00.000Z' },
      trashedNodeIds: ['node-restore']
    },
    {
      activeNodeId: null,
      capturedWorkspaceVersion: '2026-05-13T00:10:00.000Z',
      nodeOrder: ['node-restore'],
      nodesById: { 'node-restore': restoredNode },
      trashedNodeDeletedAtById: {},
      trashedNodeIds: []
    }
  );

  expect(merged.trashedNodeIds).toEqual([]);
  expect(merged.nodesById['node-restore']?.deletedAt).toBeUndefined();
  expect(merged.nodeOrder).toContain('node-restore');
});
