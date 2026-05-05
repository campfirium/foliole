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

it('creates virtual nodes under the fixed virtual root', () => {
  const createdId = useWorkspaceStore.getState().createVirtualNode();

  expect(useWorkspaceStore.getState().nodesById[createdId]).toMatchObject({
    kind: 'folder',
    isTitleManual: true,
    parentNodeId: VIRTUAL_ROOT_NODE_ID,
    specialKind: 'virtual'
  });
});

it('keeps the virtual node title stable when saving filter text into content', () => {
  const createdId = useWorkspaceStore.getState().createVirtualNode();
  const initialTitle = useWorkspaceStore.getState().nodesById[createdId]?.title;

  useWorkspaceStore.getState().updateNodeContent(createdId, 'reader');

  expect(useWorkspaceStore.getState().nodesById[createdId]).toMatchObject({
    content: 'reader',
    title: initialTitle
  });
});
