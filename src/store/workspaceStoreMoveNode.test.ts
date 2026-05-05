import { beforeEach, expect, it } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
});

it('creates child node under target parent', () => {
  const rootId = useWorkspaceStore.getState().createRootNode('Folder');
  const childId = useWorkspaceStore.getState().createChildNode(rootId, '');

  expect(useWorkspaceStore.getState().nodesById[childId]?.parentNodeId).toBe(rootId);
  expect(useWorkspaceStore.getState().activeNodeId).toBe(childId);
  expect(useWorkspaceStore.getState().nodeOrder).toEqual([INBOX_NODE_ID, 'node-1', rootId, childId]);
});

it('moves regular node under new parent and reorders subtree block', () => {
  const folderAId = useWorkspaceStore.getState().createRootNode('A');
  const folderBId = useWorkspaceStore.getState().createRootNode('B');
  const childId = useWorkspaceStore.getState().createChildNode(folderAId, 'A child');

  const moved = useWorkspaceStore.getState().moveNode(folderBId, folderAId);

  expect(moved).toBe(true);
  expect(useWorkspaceStore.getState().nodesById[folderBId]?.parentNodeId).toBe(folderAId);
  expect(useWorkspaceStore.getState().nodeOrder).toEqual([INBOX_NODE_ID, 'node-1', folderAId, childId, folderBId]);
});

it('blocks moving derived nodes and cycle reparenting', () => {
  const derivedId = useWorkspaceStore
    .getState()
    .createHighlightNodeFromSelection('node-1', 'selection text', 'a-1');
  const folderId = useWorkspaceStore.getState().createRootNode('Folder');
  const childId = useWorkspaceStore.getState().createChildNode('node-1', 'child');

  expect(derivedId).toBeTruthy();
  if (!derivedId) {
    throw new Error('expected derived node id');
  }

  const moveDerived = useWorkspaceStore.getState().moveNode(derivedId, folderId);
  const moveToDescendant = useWorkspaceStore.getState().moveNode('node-1', childId);

  expect(moveDerived).toBe(false);
  expect(moveToDescendant).toBe(false);
  expect(useWorkspaceStore.getState().nodesById[derivedId]?.parentNodeId).toBe('node-1');
  expect(useWorkspaceStore.getState().nodesById['node-1']?.parentNodeId).toBeNull();
});

it('moves selected root nodes before target and preserves relative order', () => {
  const rootAId = useWorkspaceStore.getState().createRootNode('A');
  const rootBId = useWorkspaceStore.getState().createRootNode('B');
  const rootCId = useWorkspaceStore.getState().createRootNode('C');
  const rootDId = useWorkspaceStore.getState().createRootNode('D');

  const moved = useWorkspaceStore
    .getState()
    .moveNodes([rootDId, rootCId], rootBId, 'before');

  expect(moved).toBe(true);
  expect(useWorkspaceStore.getState().nodesById[rootBId]?.parentNodeId).toBeNull();
  expect(useWorkspaceStore.getState().nodesById[rootCId]?.parentNodeId).toBeNull();
  expect(useWorkspaceStore.getState().nodesById[rootDId]?.parentNodeId).toBeNull();
  expect(useWorkspaceStore.getState().nodeOrder).toEqual([
    INBOX_NODE_ID,
    'node-1',
    rootAId,
    rootCId,
    rootDId,
    rootBId
  ]);
});
