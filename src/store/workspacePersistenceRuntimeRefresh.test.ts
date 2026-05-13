import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

function resetWorkspaceState() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-04-02T00:00:00.000Z')));
}

function createWorkspaceSnapshot(nodeIds: string[]) {
  return {
    activeNodeId: 'node-1',
    nodeOrder: nodeIds,
    nodesById: Object.fromEntries(
      nodeIds.map((nodeId, index) => [
        nodeId,
        {
          id: nodeId,
          parentNodeId: nodeId === 'node-1' ? null : 'special-inbox',
          kind: nodeId === 'special-inbox' ? 'folder' : 'topic',
          title: nodeId === 'special-inbox' ? 'Inbox' : `Node ${index + 1}`,
          isTitleManual: true,
          hideTitleHeading: false,
          content: '',
          hasContent: false,
          reveal: null,
          hasReveal: false,
          anchorLink: null,
          reading: null,
          review: null,
          createdAt: `2026-04-02T00:00:0${index}.000Z`,
          updatedAt: `2026-04-02T00:00:0${index}.000Z`
        }
      ])
    ),
    trashedNodeIds: []
  };
}

function createRuntimeInvokeWithChangingSnapshots() {
  const snapshots = [
    createWorkspaceSnapshot(['special-inbox', 'node-1']),
    createWorkspaceSnapshot(['special-inbox', 'node-2', 'node-1'])
  ];
  let snapshotIndex = 0;

  return vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command === 'load_workspace_list_snapshot') {
      const nextSnapshot = snapshots[Math.min(snapshotIndex, snapshots.length - 1)];
      snapshotIndex += 1;
      return Promise.resolve(nextSnapshot);
    }
    if (command === 'load_reading_progress') {
      return Promise.resolve({ activeNodeId: 'node-1', nodeViewStateById: {} });
    }
    if (command === 'load_node_document' && payload?.nodeId === 'node-1') {
      return Promise.resolve({
        nodeId: 'node-1',
        kind: 'topic',
        content: 'Node 1 body',
        hideTitleHeading: false,
        reveal: null
      });
    }
    return Promise.resolve(null);
  });
}

function createRuntimeInvokeWithStaleReadingActive() {
  const snapshot = createWorkspaceSnapshot(['special-inbox', 'node-2', 'node-1']);
  return vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command === 'load_workspace_list_snapshot') {
      return Promise.resolve(snapshot);
    }
    if (command === 'load_reading_progress') {
      return Promise.resolve({ activeNodeId: 'node-1', nodeViewStateById: {} });
    }
    if (command === 'load_node_document' && payload?.nodeId) {
      return Promise.resolve({
        nodeId: payload.nodeId,
        kind: 'topic',
        content: `${payload.nodeId} body`,
        hideTitleHeading: false,
        reveal: null
      });
    }
    return Promise.resolve(null);
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function resetRuntimeRefreshTest() {
  window.localStorage.clear();
  resetWorkspaceState();
  vi.clearAllMocks();
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);
}

describe('workspace persistence runtime refresh', () => {
  beforeEach(resetRuntimeRefreshTest);

  it('updates the current workspace state when a later runtime rehydrate returns new inbox children', async () => {
    const invoke = createRuntimeInvokeWithChangingSnapshots();
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await useWorkspaceStore.persist.rehydrate();
    expect(useWorkspaceStore.getState().nodeOrder).toEqual(['special-inbox', VIRTUAL_ROOT_NODE_ID, 'node-1']);

    await useWorkspaceStore.persist.rehydrate();

    expect(useWorkspaceStore.getState().nodeOrder).toEqual(['special-inbox', VIRTUAL_ROOT_NODE_ID, 'node-2', 'node-1']);
    expect(useWorkspaceStore.getState().nodesById['node-2']!).toMatchObject({
      id: 'node-2',
      title: 'Node 2'
    });
  });

  it('keeps the user-selected active node during a later runtime rehydrate', async () => {
    const invoke = createRuntimeInvokeWithStaleReadingActive();
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await useWorkspaceStore.persist.rehydrate();
    useWorkspaceStore.getState().setActiveNode('node-2');
    await useWorkspaceStore.persist.rehydrate();

    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
    expect(useWorkspaceStore.getState().nodeOrder).toEqual(['special-inbox', VIRTUAL_ROOT_NODE_ID, 'node-2', 'node-1']);
  });
});

describe('workspace persistence overlapping runtime refresh', () => {
  beforeEach(resetRuntimeRefreshTest);

  it('applies a second runtime rehydrate that starts while the first hydrate is still in flight', async () => {
    const firstSnapshot = createDeferred<ReturnType<typeof createWorkspaceSnapshot>>();
    const invoke = vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
      if (command === 'load_workspace_list_snapshot') {
        if (invoke.mock.calls.filter(([calledCommand]) => calledCommand === 'load_workspace_list_snapshot').length === 1) {
          return firstSnapshot.promise;
        }
        return Promise.resolve(createWorkspaceSnapshot(['special-inbox', 'node-2', 'node-1']));
      }
      if (command === 'load_reading_progress') {
        return Promise.resolve({ activeNodeId: 'node-1', nodeViewStateById: {} });
      }
      if (command === 'load_node_document' && payload?.nodeId === 'node-1') {
        return Promise.resolve({
          nodeId: 'node-1',
          kind: 'topic',
          content: 'Node 1 body',
          hideTitleHeading: false,
          reveal: null
        });
      }
      return Promise.resolve(null);
    });
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const firstRehydrate = useWorkspaceStore.persist.rehydrate();
    const secondRehydrate = useWorkspaceStore.persist.rehydrate();
    firstSnapshot.resolve(createWorkspaceSnapshot(['special-inbox', 'node-1']));

    await firstRehydrate;
    await secondRehydrate;

    expect(useWorkspaceStore.getState().nodeOrder).toEqual(['special-inbox', VIRTUAL_ROOT_NODE_ID, 'node-2', 'node-1']);
    expect(invoke.mock.calls.filter(([command]) => command === 'load_workspace_list_snapshot')).toHaveLength(2);
  });
});
