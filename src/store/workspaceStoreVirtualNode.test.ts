import { beforeEach, expect, it } from 'vitest';

import { VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
});

function expectCreatedNodeId(createdId: string | null): string {
  expect(createdId).toBeTruthy();
  if (!createdId) {
    throw new Error('expected a virtual node');
  }
  return createdId;
}

it('creates virtual nodes under the fixed virtual root', async () => {
  const createdId = expectCreatedNodeId(await useWorkspaceStore.getState().createVirtualNode());

  expect(useWorkspaceStore.getState().nodesById[createdId]).toMatchObject({
    kind: 'folder',
    isTitleManual: true,
    parentNodeId: VIRTUAL_ROOT_NODE_ID,
    specialKind: 'virtual',
    virtualFilter: {
      version: 1,
      match: 'all',
      conditions: []
    }
  });
});

it('keeps the virtual node title stable when saving a virtual filter', async () => {
  const createdId = expectCreatedNodeId(await useWorkspaceStore.getState().createVirtualNode());
  const initialTitle = useWorkspaceStore.getState().nodesById[createdId]?.title;

  useWorkspaceStore.getState().updateVirtualNodeFilter(createdId, 'reader');

  expect(useWorkspaceStore.getState().nodesById[createdId]).toMatchObject({
    content: '',
    virtualFilter: {
      version: 1,
      match: 'all',
      conditions: [{ field: 'text', operator: 'contains', value: 'reader' }]
    },
    title: initialTitle
  });
});
