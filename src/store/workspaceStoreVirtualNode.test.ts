import { afterEach, beforeEach, expect, it } from 'vitest';

import { VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  createBrowserLocalWorkspaceMutationRepository,
  installWorkspaceMutationRepository,
  resetWorkspaceMutationRepository
} from './workspaceMutationRepository';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

beforeEach(() => {
  resetWorkspaceMutationRepository();
  localStorage.clear();
  installWorkspaceMutationRepository(createBrowserLocalWorkspaceMutationRepository());
  resetWorkspaceStore();
});

afterEach(() => resetWorkspaceMutationRepository());

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

it('creates a persistent manual virtual folder without a follow-up conversion', async () => {
  const createdId = expectCreatedNodeId(
    await useWorkspaceStore.getState().createVirtualNode({ mode: 'manual' })
  );

  expect(useWorkspaceStore.getState().nodesById[createdId]).toMatchObject({
    kind: 'folder',
    parentNodeId: VIRTUAL_ROOT_NODE_ID,
    specialKind: 'virtual',
    virtualFilter: {
      version: 1,
      match: 'all',
      conditions: [{ field: 'manual', operator: 'equals', value: 'manual-child-order' }]
    }
  });
});

it('creates and safely moves nested virtual folders without changing membership semantics', async () => {
  const parentId = expectCreatedNodeId(
    await useWorkspaceStore.getState().createVirtualNode({ mode: 'manual' })
  );
  const childId = expectCreatedNodeId(
    await useWorkspaceStore.getState().createVirtualNode({ mode: 'manual', parentNodeId: parentId })
  );

  expect(useWorkspaceStore.getState().nodesById[childId]).toMatchObject({
    parentNodeId: parentId,
    specialKind: 'virtual'
  });
  expect(useWorkspaceStore.getState().nodesById[childId]?.manualChildOrder).toBeUndefined();
  expect(await useWorkspaceStore.getState().moveNodes([parentId], childId, 'child')).toBe(false);
  expect(await useWorkspaceStore.getState().moveNodes([childId], VIRTUAL_ROOT_NODE_ID, 'child')).toBe(true);
  expect(useWorkspaceStore.getState().nodesById[childId]?.parentNodeId).toBe(VIRTUAL_ROOT_NODE_ID);
});

it('rejects nested virtual creation under a regular node', async () => {
  await expect(useWorkspaceStore.getState().createVirtualNode({
    mode: 'manual',
    parentNodeId: 'missing-regular-folder'
  })).resolves.toBeNull();
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
