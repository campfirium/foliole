import { beforeEach, expect, it, vi } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

function resetWorkspaceStore() {
  const initial = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: [...initial.nodeOrder, 'node-1'],
    nodesById: {
      ...initial.nodesById,
      'node-1': {
        id: 'node-1',
        parentNodeId: null,
        kind: 'topic',
        title: 'Seed',
        content: 'Seed',
        hasContent: true,
        reveal: null,
        hasReveal: false,
        review: null,
        createdAt: '2026-02-25T00:00:00.000Z',
        updatedAt: '2026-02-25T00:00:00.000Z'
      }
    }
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn(async (command, args?: unknown) => {
    if (command === 'move_nodes') {
      return {
        movedNodeIds: (args as { nodes: Array<{ nodeId: string }> }).nodes.map((node) => node.nodeId),
        nodeOrder: (args as { nodeOrder: string[] }).nodeOrder
      };
    }
    return null;
  }));
  resetWorkspaceStore();
});

it('creates child node under target parent', () => {
  const rootId = useWorkspaceStore.getState().createRootNode('Folder', 'folder');
  const childId = useWorkspaceStore.getState().createChildNode(rootId, '');

  expect(useWorkspaceStore.getState().nodesById[childId]?.parentNodeId).toBe(rootId);
  expect(useWorkspaceStore.getState().activeNodeId).toBe(childId);
  expect(useWorkspaceStore.getState().nodeOrder).toEqual([HOME_NODE_ID, INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'node-1', rootId, childId]);
});

it('keeps newest inbox child at the top of inbox children', () => {
  const firstInboxChildId = useWorkspaceStore.getState().createChildNode(INBOX_NODE_ID, 'First');
  const secondInboxChildId = useWorkspaceStore.getState().createChildNode(INBOX_NODE_ID, 'Second');

  expect(useWorkspaceStore.getState().nodeOrder).toEqual([
    HOME_NODE_ID,
    INBOX_NODE_ID,
    secondInboxChildId,
    firstInboxChildId,
    VIRTUAL_ROOT_NODE_ID,
    'node-1'
  ]);
});

it('moves regular node under new parent and reorders subtree block', async () => {
  const folderAId = useWorkspaceStore.getState().createRootNode('A', 'folder');
  const folderBId = useWorkspaceStore.getState().createRootNode('B', 'folder');
  const childId = useWorkspaceStore.getState().createChildNode(folderAId, 'A child');

  const moved = await useWorkspaceStore.getState().moveNode(folderBId, folderAId);

  expect(moved).toBe(true);
  expect(useWorkspaceStore.getState().nodesById[folderBId]?.parentNodeId).toBe(folderAId);
  expect(useWorkspaceStore.getState().nodeOrder).toEqual([
    HOME_NODE_ID,
    INBOX_NODE_ID,
    VIRTUAL_ROOT_NODE_ID,
    'node-1',
    folderAId,
    childId,
    folderBId
  ]);
});

it('blocks moving derived nodes and cycle reparenting', async () => {
  const derivedId = useWorkspaceStore
    .getState()
    .createHighlightNodeFromSelection('node-1', 'selection text', 'a-1', {
      id: 'a-1',
      kind: 'highlight',
      locator: {
        from: 0,
        originalText: 'selection text',
        to: 'selection text'.length
      }
    });
  const folderId = useWorkspaceStore.getState().createRootNode('Folder', 'folder');
  const childId = useWorkspaceStore.getState().createChildNode('node-1', 'child');

  expect(derivedId).toBeTruthy();
  if (!derivedId) {
    throw new Error('expected derived node id');
  }

  const moveDerived = await useWorkspaceStore.getState().moveNode(derivedId, folderId);
  const moveToDescendant = await useWorkspaceStore.getState().moveNode('node-1', childId);

  expect(moveDerived).toBe(false);
  expect(moveToDescendant).toBe(false);
  expect(useWorkspaceStore.getState().nodesById[derivedId]?.parentNodeId).toBe('node-1');
  expect(useWorkspaceStore.getState().nodesById['node-1']?.parentNodeId).toBeNull();
});

it('moves selected root nodes before target and preserves relative order', async () => {
  const rootAId = useWorkspaceStore.getState().createRootNode('A', 'folder');
  const rootBId = useWorkspaceStore.getState().createRootNode('B', 'folder');
  const rootCId = useWorkspaceStore.getState().createRootNode('C', 'folder');
  const rootDId = useWorkspaceStore.getState().createRootNode('D', 'folder');

  const moved = await useWorkspaceStore
    .getState()
    .moveNodes([rootDId, rootCId], rootBId, 'before');

  expect(moved).toBe(true);
  expect(useWorkspaceStore.getState().nodesById[rootBId]?.parentNodeId).toBeNull();
  expect(useWorkspaceStore.getState().nodesById[rootCId]?.parentNodeId).toBeNull();
  expect(useWorkspaceStore.getState().nodesById[rootDId]?.parentNodeId).toBeNull();
  expect(useWorkspaceStore.getState().nodeOrder).toEqual([
    HOME_NODE_ID,
    INBOX_NODE_ID,
    VIRTUAL_ROOT_NODE_ID,
    'node-1',
    rootAId,
    rootCId,
    rootDId,
    rootBId
  ]);
});

it('moves nodes into inbox as the newest inbox children', async () => {
  const firstInboxChildId = useWorkspaceStore.getState().createChildNode(INBOX_NODE_ID, 'Old inbox item');
  const rootId = useWorkspaceStore.getState().createRootNode('Moved into inbox', 'folder');

  const moved = await useWorkspaceStore.getState().moveNodes([rootId], INBOX_NODE_ID, 'child');

  expect(moved).toBe(true);
  expect(useWorkspaceStore.getState().nodeOrder).toEqual([
    HOME_NODE_ID,
    INBOX_NODE_ID,
    rootId,
    firstInboxChildId,
    VIRTUAL_ROOT_NODE_ID,
    'node-1'
  ]);
  expect(useWorkspaceStore.getState().nodesById[rootId]?.parentNodeId).toBe(INBOX_NODE_ID);
});

it('blocks moving topics to the root directory', async () => {
  const topicId = useWorkspaceStore.getState().createChildNode(INBOX_NODE_ID, 'Inbox topic');

  const moved = await useWorkspaceStore.getState().moveNodes([topicId], null, 'root');

  expect(moved).toBe(false);
  expect(useWorkspaceStore.getState().nodesById[topicId]?.parentNodeId).toBe(INBOX_NODE_ID);
});

it('reorders virtual nodes within the fixed virtual root', async () => {
  const firstVirtualId = useWorkspaceStore.getState().createVirtualNode();
  const secondVirtualId = useWorkspaceStore.getState().createVirtualNode();

  const moved = await useWorkspaceStore.getState().moveNodes([firstVirtualId], secondVirtualId, 'after');

  expect(moved).toBe(true);
  expect(useWorkspaceStore.getState().nodesById[firstVirtualId]?.parentNodeId).toBe(VIRTUAL_ROOT_NODE_ID);
  expect(useWorkspaceStore.getState().nodesById[secondVirtualId]?.parentNodeId).toBe(VIRTUAL_ROOT_NODE_ID);
  expect(useWorkspaceStore.getState().nodeOrder).toEqual([
    HOME_NODE_ID,
    INBOX_NODE_ID,
    VIRTUAL_ROOT_NODE_ID,
    secondVirtualId,
    firstVirtualId,
    'node-1'
  ]);
});

it('blocks moving virtual nodes out of the fixed virtual root', async () => {
  const virtualNodeId = useWorkspaceStore.getState().createVirtualNode();

  const moved = await useWorkspaceStore.getState().moveNodes([virtualNodeId], INBOX_NODE_ID, 'child');

  expect(moved).toBe(false);
  expect(useWorkspaceStore.getState().nodesById[virtualNodeId]?.parentNodeId).toBe(VIRTUAL_ROOT_NODE_ID);
});

it('blocks placing folders under topics when moving nodes', async () => {
  const topicId = useWorkspaceStore.getState().createRootNode('Topic', 'topic');
  const folderId = useWorkspaceStore.getState().createRootNode('', 'folder');

  const moved = await useWorkspaceStore.getState().moveNode(folderId, topicId);

  expect(moved).toBe(false);
  expect(useWorkspaceStore.getState().nodesById[folderId]?.parentNodeId).toBeNull();
});

it('blocks moving item nodes even when the target is otherwise valid', async () => {
  const itemId = useWorkspaceStore.getState().createRootNode('Card', 'item');
  const folderId = useWorkspaceStore.getState().createRootNode('', 'folder');

  const moved = await useWorkspaceStore.getState().moveNode(itemId, folderId);

  expect(moved).toBe(false);
  expect(useWorkspaceStore.getState().nodesById[itemId]?.parentNodeId).toBe(INBOX_NODE_ID);
});
