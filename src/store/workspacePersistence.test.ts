import { expect, it, beforeEach } from 'vitest';

import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  createInitialWorkspaceState,
  useWorkspaceStore,
  WORKSPACE_STORAGE_KEY
} from './workspaceStore';

type PersistedWorkspacePayload = { state: ReturnType<typeof createInitialWorkspaceState> };

function rehydrateWorkspaceFromLocalStorage(persisted: ReturnType<typeof createInitialWorkspaceState>) {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-24T00:00:00.000Z')));
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: persisted, version: 0 }));
  return useWorkspaceStore.persist.rehydrate();
}

function readPersistedWorkspacePayload() {
  const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as PersistedWorkspacePayload) : null;
}

function resetWorkspaceState() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceState();
});

it('writes workspace changes into localStorage', async () => {
  const persistedNodeId = (await useWorkspaceStore.getState().createRootNode('Draft node'))!;
  useWorkspaceStore.getState().setActiveNode(persistedNodeId);
  await useWorkspaceStore.getState().updateNodeContent(persistedNodeId, 'Persisted markdown');
  const createdNodeId = (await useWorkspaceStore.getState().createRootNode('Trash me'))!;
  useWorkspaceStore.setState((state) => ({
    nodesById: {
      ...state.nodesById,
      [createdNodeId]: {
        ...state.nodesById[createdNodeId]!,
        deletedAt: '2026-02-25T00:00:02.000Z'
      }
    },
    trashedNodeDeletedAtById: { [createdNodeId]: '2026-02-25T00:00:02.000Z' },
    trashedNodeIds: [createdNodeId]
  }));
  await Promise.resolve();

  const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  expect(raw).not.toBeNull();

  const payload = raw ? (JSON.parse(raw) as { state: ReturnType<typeof createInitialWorkspaceState> }) : null;
  expect(payload?.state.nodesById[persistedNodeId]?.content).toBe('Persisted markdown');
  expect(payload?.state.trashedNodeIds).toContain(createdNodeId);
});

it('keeps the virtual root and saved virtual nodes after rehydrate', async () => {
  const virtualNodeId = (await useWorkspaceStore.getState().createVirtualNode())!;
  await useWorkspaceStore.getState().updateNodeTitle(virtualNodeId, 'Saved virtual node');
  useWorkspaceStore.getState().updateVirtualNodeFilter(virtualNodeId, 'reader');
  await Promise.resolve();

  const persisted = readPersistedWorkspacePayload()?.state;
  expect(persisted?.nodesById[VIRTUAL_ROOT_NODE_ID]?.title).toBe('Virtual');
  expect(persisted?.nodesById[virtualNodeId]).toMatchObject({
    parentNodeId: VIRTUAL_ROOT_NODE_ID,
    title: 'Saved virtual node',
    virtualFilter: {
      version: 1,
      match: 'all',
      conditions: [{ field: 'text', operator: 'contains', value: 'reader' }]
    }
  });

  if (!persisted) {
    throw new Error('expected persisted workspace payload');
  }

  await rehydrateWorkspaceFromLocalStorage(persisted);

  expect(useWorkspaceStore.getState().nodesById[VIRTUAL_ROOT_NODE_ID]).toMatchObject({
    title: 'Virtual',
    specialKind: 'virtual-root'
  });
  expect(useWorkspaceStore.getState().nodesById[virtualNodeId]).toMatchObject({
    parentNodeId: VIRTUAL_ROOT_NODE_ID,
    title: 'Saved virtual node',
    specialKind: 'virtual',
    virtualFilter: {
      version: 1,
      match: 'all',
      conditions: [{ field: 'text', operator: 'contains', value: 'reader' }]
    }
  });
});

it('rehydrates workspace state from localStorage', async () => {
  const persisted = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));
  const restoredNodeId = 'node-1';
  const trashedNodeId = 'node-2';
  persisted.activeNodeId = restoredNodeId;
  persisted.nodeOrder = [...persisted.nodeOrder, restoredNodeId, trashedNodeId];
  persisted.nodesById[restoredNodeId] = {
    ...persisted.nodesById[INBOX_NODE_ID]!,
    id: restoredNodeId,
    title: 'Recovered node',
    content: 'Recovered markdown',
    hasContent: true,
    updatedAt: '2026-02-25T00:00:01.000Z'
  };
  persisted.nodesById[trashedNodeId] = {
    ...persisted.nodesById[restoredNodeId],
    id: trashedNodeId,
    deletedAt: '2026-02-25T00:00:02.000Z',
    title: 'Recovered deleted node'
  };
  persisted.trashedNodeIds = [trashedNodeId];
  persisted.trashedNodeDeletedAtById = { [trashedNodeId]: '2026-02-25T00:00:02.000Z' };

  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-24T00:00:00.000Z')));
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: persisted, version: 0 }));

  await useWorkspaceStore.persist.rehydrate();

  expect(useWorkspaceStore.getState().nodesById[restoredNodeId]?.content).toBe('Recovered markdown');
  expect(useWorkspaceStore.getState().trashedNodeIds).toEqual([trashedNodeId]);
});
