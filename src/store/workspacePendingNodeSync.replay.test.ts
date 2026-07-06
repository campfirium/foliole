import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { replayPendingWorkspaceNodeSync } from '../shared/platform/workspacePendingNodeReplay';

import {
  hasPendingNodeSync,
  mergePendingNodeSyncIntoSnapshot,
  stagePendingNodeSync
} from './workspacePendingNodeSync';
import {
  createPendingNodeSnapshotFixture,
  createRuntimeNodeSnapshotFixture
} from './workspacePendingNodeSyncReplay.testSupport';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(getRuntimeInvoke).mockReset();
});

it('keeps orphan pending nodes out of merged runtime snapshots', () => {
  stagePendingNodeSync(
    createPendingNodeSnapshotFixture({ nodeId: 'node-orphan', parentNodeId: 'node-missing' })
  );

  const mergedSnapshot = mergePendingNodeSyncIntoSnapshot({
    activeNodeId: null,
    nodeOrder: [],
    nodesById: {},
    trashedNodeIds: []
  });

  expect(mergedSnapshot?.nodesById['node-orphan']).toBeUndefined();
  expect(hasPendingNodeSync('node-orphan')).toBe(true);
});

it('keeps stale pending nodes from replacing newer runtime nodes during merge', () => {
  stagePendingNodeSync(createPendingNodeSnapshotFixture({ updatedAt: '2026-03-06T00:00:01.000Z' }));

  const mergedSnapshot = mergePendingNodeSyncIntoSnapshot({
    activeNodeId: null,
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': createRuntimeNodeSnapshotFixture({
        currentVersionId: 'desktop#2',
        title: 'Runtime',
        updatedAt: '2026-03-06T00:00:02.000Z'
      })
    },
    trashedNodeIds: []
  });

  expect(mergedSnapshot?.nodesById['node-1']?.title).toBe('Runtime');
  expect(mergedSnapshot?.nodesById['node-1']?.currentVersionId).toBe('desktop#2');
  expect(hasPendingNodeSync('node-1')).toBe(true);
});

it('keeps pending nodes from reviving deleted runtime nodes during merge', () => {
  stagePendingNodeSync(createPendingNodeSnapshotFixture({ updatedAt: '2026-03-06T00:00:03.000Z' }));

  const mergedSnapshot = mergePendingNodeSyncIntoSnapshot({
    activeNodeId: null,
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': createRuntimeNodeSnapshotFixture({
        deletedAt: '2026-03-06T00:00:02.000Z',
        updatedAt: '2026-03-06T00:00:02.000Z'
      })
    },
    trashedNodeDeletedAtById: { 'node-1': '2026-03-06T00:00:02.000Z' },
    trashedNodeIds: ['node-1']
  });

  expect(mergedSnapshot?.nodesById['node-1']?.deletedAt).toBe('2026-03-06T00:00:02.000Z');
  expect(mergedSnapshot?.nodesById['node-1']?.title).toBe('Runtime');
  expect(hasPendingNodeSync('node-1')).toBe(true);
});

it('resolves pending nodes that match the runtime update timestamp during merge', () => {
  stagePendingNodeSync(createPendingNodeSnapshotFixture({ updatedAt: '2026-03-06T00:00:02.000Z' }));

  const mergedSnapshot = mergePendingNodeSyncIntoSnapshot({
    activeNodeId: null,
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': createRuntimeNodeSnapshotFixture({ updatedAt: '2026-03-06T00:00:02.000Z' })
    },
    trashedNodeIds: []
  });

  expect(mergedSnapshot?.nodesById['node-1']?.title).toBe('Runtime');
  expect(hasPendingNodeSync('node-1')).toBe(false);
});

it('merges pending create nodes when the runtime node is absent', () => {
  stagePendingNodeSync(createPendingNodeSnapshotFixture({ title: 'Created' }));

  const mergedSnapshot = mergePendingNodeSyncIntoSnapshot({
    activeNodeId: null,
    nodeOrder: [],
    nodesById: {},
    trashedNodeIds: []
  });

  expect(mergedSnapshot?.nodesById['node-1']?.title).toBe('Created');
  expect(hasPendingNodeSync('node-1')).toBe(true);
});

it('preserves runtime-only fields when a newer pending node is merged', () => {
  stagePendingNodeSync(createPendingNodeSnapshotFixture({ updatedAt: '2026-03-06T00:00:03.000Z' }));

  const mergedSnapshot = mergePendingNodeSyncIntoSnapshot({
    activeNodeId: null,
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': createRuntimeNodeSnapshotFixture({
        currentVersionId: 'desktop#1',
        updatedAt: '2026-03-06T00:00:02.000Z'
      })
    },
    trashedNodeIds: []
  });

  expect(mergedSnapshot?.nodesById['node-1']?.title).toBe('Seed');
  expect(mergedSnapshot?.nodesById['node-1']?.currentVersionId).toBe('desktop#1');
});

it('does not replay pending nodes whose parent is absent from runtime storage', async () => {
  const invoke = vi.fn().mockResolvedValueOnce({
    activeNodeId: null,
    nodeOrder: [],
    nodesById: {},
    trashedNodeIds: []
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  stagePendingNodeSync(
    createPendingNodeSnapshotFixture({ nodeId: 'node-orphan', parentNodeId: 'node-missing' })
  );

  await replayPendingWorkspaceNodeSync();

  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('load_workspace_list_snapshot', undefined);
  expect(hasPendingNodeSync('node-orphan')).toBe(true);
});

it('does not replay stale pending nodes over newer runtime nodes', async () => {
  const invoke = vi.fn().mockResolvedValueOnce({
    activeNodeId: null,
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': createRuntimeNodeSnapshotFixture({ updatedAt: '2026-03-06T00:00:02.000Z' })
    },
    trashedNodeIds: []
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  stagePendingNodeSync(createPendingNodeSnapshotFixture({ updatedAt: '2026-03-06T00:00:01.000Z' }));

  await replayPendingWorkspaceNodeSync();

  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('load_workspace_list_snapshot', undefined);
  expect(hasPendingNodeSync('node-1')).toBe(true);
});

it('resolves equal-timestamp pending nodes without replaying them', async () => {
  const invoke = vi.fn().mockResolvedValueOnce({
    activeNodeId: null,
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': createRuntimeNodeSnapshotFixture({ updatedAt: '2026-03-06T00:00:01.000Z' })
    },
    trashedNodeIds: []
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  stagePendingNodeSync(createPendingNodeSnapshotFixture({ updatedAt: '2026-03-06T00:00:01.000Z' }));

  await replayPendingWorkspaceNodeSync();

  expect(invoke).toHaveBeenCalledTimes(1);
  expect(hasPendingNodeSync('node-1')).toBe(false);
});

it('does not replay pending nodes over deleted runtime nodes', async () => {
  const invoke = vi.fn().mockResolvedValueOnce({
    activeNodeId: null,
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': createRuntimeNodeSnapshotFixture({
        deletedAt: '2026-03-06T00:00:02.000Z',
        updatedAt: '2026-03-06T00:00:02.000Z'
      })
    },
    trashedNodeDeletedAtById: { 'node-1': '2026-03-06T00:00:02.000Z' },
    trashedNodeIds: ['node-1']
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  stagePendingNodeSync(createPendingNodeSnapshotFixture({ updatedAt: '2026-03-06T00:00:03.000Z' }));

  await replayPendingWorkspaceNodeSync();

  expect(invoke).toHaveBeenCalledTimes(1);
  expect(hasPendingNodeSync('node-1')).toBe(true);
});

it('replays a pending child after its pending parent has been restored', async () => {
  const invoke = vi
    .fn()
    .mockResolvedValueOnce({
      activeNodeId: null,
      nodeOrder: [],
      nodesById: {},
      trashedNodeIds: []
    })
    .mockResolvedValue(null);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  const childNode = createPendingNodeSnapshotFixture({
    nodeId: 'node-child',
    parentNodeId: 'node-parent',
    updatedAt: '2026-03-06T00:00:01.000Z'
  });
  const parentNode = createPendingNodeSnapshotFixture({
    nodeId: 'node-parent',
    parentNodeId: null,
    updatedAt: '2026-03-06T00:00:02.000Z'
  });
  stagePendingNodeSync(childNode);
  stagePendingNodeSync(parentNode);

  await replayPendingWorkspaceNodeSync();

  expect(invoke).toHaveBeenNthCalledWith(2, 'update_node_content', parentNode);
  expect(invoke).toHaveBeenNthCalledWith(3, 'update_node_content', childNode);
  expect(hasPendingNodeSync('node-parent')).toBe(false);
  expect(hasPendingNodeSync('node-child')).toBe(false);
});
