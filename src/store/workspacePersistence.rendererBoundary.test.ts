import { describe, expect, it, beforeEach } from 'vitest';

import { HOME_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';

import { stagePendingNodeSync } from './workspacePendingNodeSync';
import {
  createInitialWorkspaceState,
  useWorkspaceStore,
  WORKSPACE_STORAGE_KEY
} from './workspaceStore';

type PersistedWorkspacePayload = { state: ReturnType<typeof createInitialWorkspaceState> };

function setLoadedNode(
  persisted: ReturnType<typeof createInitialWorkspaceState>,
  nodeId: string,
  content: string,
  reveal: string,
  updatedAt: string
) {
  const templateNode = persisted.nodesById[nodeId] ?? persisted.nodesById['node-1']!;
  persisted.nodesById[nodeId] = {
    ...templateNode,
    id: nodeId,
    content,
    hasContent: true,
    reveal,
    hasReveal: true,
    updatedAt
  };
}

function createRendererBoundaryPersistedState(nodeIds: string[] = ['node-1', 'node-2']) {
  const persisted = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));
  persisted.activeNodeId = 'node-2';
  persisted.nodeOrder = nodeIds;
  setLoadedNode(persisted, 'node-1', 'Recovered node 1 body', 'Recovered node 1 answer', '2026-02-25T00:00:01.000Z');
  setLoadedNode(persisted, 'node-2', 'Recovered node 2 body', 'Recovered node 2 answer', '2026-02-25T00:00:02.000Z');
  if (nodeIds.includes('node-3')) {
    setLoadedNode(persisted, 'node-3', 'Recovered node 3 body', 'Recovered node 3 answer', '2026-02-25T00:00:03.000Z');
  }
  return persisted;
}

function rehydrateWorkspaceFromLocalStorage(persisted: ReturnType<typeof createInitialWorkspaceState>) {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-24T00:00:00.000Z')));
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: persisted, version: 0 }));
  return useWorkspaceStore.persist.rehydrate();
}

function readPersistedWorkspacePayload() {
  const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as PersistedWorkspacePayload) : null;
}

function expectLoadedNodeDocument(
  node: PersistedWorkspacePayload['state']['nodesById'][string] | undefined,
  content: string,
  reveal: string
) {
  expect(node).toMatchObject({
    content,
    hasContent: true,
    reveal,
    hasReveal: true
  });
}

function seedPendingInactiveNodeRendererState() {
  stagePendingNodeSync({
    nodeId: 'node-1',
    parentNodeId: null,
    kind: 'item',
    priority: null,
    desiredRetention: null,
    title: 'Node 1',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'Unsynced node 1 body',
    reveal: 'Unsynced node 1 answer',
    anchorLink: null,
    reading: null,
    position: null,
    createdAt: '2026-02-25T00:00:00.000Z',
    updatedAt: '2026-02-25T00:00:01.000Z'
  });
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-1': {
        ...state.nodesById['node-1']!,
        title: 'Node 1',
        content: 'Unsynced node 1 body',
        hasContent: true,
        reveal: 'Unsynced node 1 answer',
        hasReveal: true,
        updatedAt: '2026-02-25T00:00:01.000Z'
      },
      'node-2': {
        ...state.nodesById['node-1']!,
        id: 'node-2',
        title: 'Node 2',
        content: 'Active node 2 body',
        hasContent: true,
        reveal: null,
        hasReveal: false,
        updatedAt: '2026-02-25T00:00:02.000Z'
      }
    }
  }));
}

function resetWorkspaceState() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceState();
});

describe('workspace persistence fallback hydrate', () => {
  it('rehydrates local fallback documents when no runtime repository is present', async () => {
    const persisted = createRendererBoundaryPersistedState();
    await rehydrateWorkspaceFromLocalStorage(persisted);

    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
    expectLoadedNodeDocument(useWorkspaceStore.getState().nodesById['node-1'], 'Recovered node 1 body', 'Recovered node 1 answer');
    expectLoadedNodeDocument(useWorkspaceStore.getState().nodesById['node-2'], 'Recovered node 2 body', 'Recovered node 2 answer');
  });

  it('rewrites local fallback payload with loaded documents when no runtime repository is present', async () => {
    const persisted = createRendererBoundaryPersistedState(['node-1', 'node-2', 'node-3']);
    await rehydrateWorkspaceFromLocalStorage(persisted);
    useWorkspaceStore.getState().setNodeViewState('node-2', {
      scrollTop: 128,
      selection: { from: 4, to: 9 }
    });
    await Promise.resolve();

    const payload = readPersistedWorkspacePayload();

    expect(payload?.state.nodeViewById['node-2']).toMatchObject({
      scrollTop: 128,
      selection: { from: 4, to: 9 }
    });
    expectLoadedNodeDocument(payload?.state.nodesById['node-1'], 'Recovered node 1 body', 'Recovered node 1 answer');
    expectLoadedNodeDocument(payload?.state.nodesById['node-2'], 'Recovered node 2 body', 'Recovered node 2 answer');
    expectLoadedNodeDocument(payload?.state.nodesById['node-3'], 'Recovered node 3 body', 'Recovered node 3 answer');
  });
});

describe('workspace persistence renderer boundary pending edits', () => {
  it('keeps an inactive node document only while it is still pending runtime confirmation', async () => {
    seedPendingInactiveNodeRendererState();
    useWorkspaceStore.getState().setNodeViewState('node-2', {
      scrollTop: 64,
      selection: { from: 1, to: 3 }
    });
    await Promise.resolve();

    const payload = readPersistedWorkspacePayload();

    expect(payload?.state.nodesById['node-1']).toMatchObject({
      content: 'Unsynced node 1 body',
      hasContent: true,
      reveal: 'Unsynced node 1 answer',
      hasReveal: true
    });
    expect(payload?.state.nodesById['node-2']).toMatchObject({
      content: 'Active node 2 body',
      hasContent: true,
      reveal: null,
      hasReveal: false
    });
  });
});

describe('workspace direct renderer patch boundary', () => {
  it('keeps injected roots when a direct patch replaces the membership snapshot', () => {
    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-1',
      nodeOrder: ['special-inbox', 'node-1'],
      nodesById: {
        'special-inbox': state.nodesById['special-inbox']!,
        'node-1': {
          ...state.nodesById['special-inbox']!,
          id: 'node-1',
          parentNodeId: 'special-inbox',
          kind: 'topic',
          title: 'Node 1'
        }
      },
      trashedNodeIds: []
    }));

    expect(useWorkspaceStore.getState().nodeOrder).toEqual([
      HOME_NODE_ID,
      'special-inbox',
      VIRTUAL_ROOT_NODE_ID,
      'node-1'
    ]);
    expect(useWorkspaceStore.getState().nodesById[HOME_NODE_ID]?.specialKind).toBe('home');
    expect(useWorkspaceStore.getState().nodesById[VIRTUAL_ROOT_NODE_ID]?.specialKind).toBe('virtual-root');
  });
});
