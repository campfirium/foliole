import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { replayPendingWorkspaceNodeSync } from '../shared/platform/workspacePendingNodeReplay';

import { hasPendingNodeSync, mergePendingNodeSyncIntoSnapshot, stagePendingNodeSync } from './workspacePendingNodeSync';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

function createPendingNodeSnapshotFixture(args?: {
  nodeId?: string;
  parentNodeId?: string | null;
  updatedAt?: string;
}) {
  return {
    nodeId: args?.nodeId ?? 'node-1',
    parentNodeId: args?.parentNodeId ?? null,
    kind: 'topic' as const,
    priority: 0,
    desiredRetention: 0.81,
    enableShortTerm: null,
    sequentialReadingEnabled: null,
    title: 'Seed',
    isTitleManual: false,
    hideTitleHeading: true,
    content: '# Seed',
    virtualFilter: null,
    reveal: 'Reveal',
    anchorLink: null,
    imageRegions: null,
    reading: null,
    review: null,
    position: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: args?.updatedAt ?? '2026-03-06T00:00:01.000Z'
  };
}

describe('pending workspace node replay', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.mocked(getRuntimeInvoke).mockReset();
  });

  it('keeps orphan pending nodes out of merged runtime snapshots', () => {
    stagePendingNodeSync(createPendingNodeSnapshotFixture({ nodeId: 'node-orphan', parentNodeId: 'node-missing' }));

    const mergedSnapshot = mergePendingNodeSyncIntoSnapshot({
      activeNodeId: null,
      nodeOrder: [],
      nodesById: {},
      trashedNodeIds: []
    });

    expect(mergedSnapshot?.nodesById['node-orphan']).toBeUndefined();
    expect(hasPendingNodeSync('node-orphan')).toBe(true);
  });

  it('does not replay pending nodes whose parent is absent from runtime storage', async () => {
    const invoke = vi.fn().mockResolvedValueOnce({
      activeNodeId: null,
      nodeOrder: [],
      nodesById: {},
      trashedNodeIds: []
    });
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    stagePendingNodeSync(createPendingNodeSnapshotFixture({ nodeId: 'node-orphan', parentNodeId: 'node-missing' }));

    await replayPendingWorkspaceNodeSync();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('load_workspace_list_snapshot', undefined);
    expect(hasPendingNodeSync('node-orphan')).toBe(true);
  });

  it('replays a pending child after its pending parent has been restored', async () => {
    const invoke = vi.fn()
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
});
