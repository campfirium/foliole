import { expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';
import type { WorkspacePersistedState } from './workspaceStoreTypes';

function createNode(nodeId: string, createdAt: string): Node {
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
    updatedAt: createdAt
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
  expect(merged.nodeOrder).not.toContain('node-trash');
});

it('allows a newer runtime snapshot to restore a previously trashed node', () => {
  const node = createNode('node-restore', '2026-05-13T00:00:00.000Z');
  const merged = mergeRuntimeSnapshot(
    {
      nodeOrder: [],
      nodesById: { 'node-restore': node },
      trashedNodeDeletedAtById: { 'node-restore': '2026-05-13T00:05:00.000Z' },
      trashedNodeIds: ['node-restore']
    },
    {
      activeNodeId: null,
      capturedWorkspaceVersion: '2026-05-13T00:10:00.000Z',
      nodeOrder: ['node-restore'],
      nodesById: { 'node-restore': node },
      trashedNodeDeletedAtById: {},
      trashedNodeIds: []
    }
  );

  expect(merged.trashedNodeIds).toEqual([]);
  expect(merged.nodeOrder).toContain('node-restore');
});
