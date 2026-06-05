import { beforeEach, expect, it } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

function resetToEmptyWorkspace() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
});

it('increments Untitled titles for repeated empty root nodes', async () => {
  resetToEmptyWorkspace();

  const firstId = (await useWorkspaceStore.getState().createRootNode())!;
  const secondId = (await useWorkspaceStore.getState().createRootNode())!;
  const thirdId = (await useWorkspaceStore.getState().createRootNode())!;

  expect(useWorkspaceStore.getState().nodesById[firstId]?.title).toBe('Untitled');
  expect(useWorkspaceStore.getState().nodesById[secondId]?.title).toBe('Untitled 1');
  expect(useWorkspaceStore.getState().nodesById[thirdId]?.title).toBe('Untitled 2');
});

it('keeps incrementing Untitled titles while the series still exists', async () => {
  resetToEmptyWorkspace();

  const firstId = (await useWorkspaceStore.getState().createRootNode())!;
  const secondId = (await useWorkspaceStore.getState().createRootNode())!;
  const thirdId = (await useWorkspaceStore.getState().createRootNode())!;

  useWorkspaceStore.getState().deleteNode(secondId);
  useWorkspaceStore.getState().deleteNode(thirdId);

  const fourthId = (await useWorkspaceStore.getState().createRootNode())!;

  expect(useWorkspaceStore.getState().nodesById[firstId]?.title).toBe('Untitled');
  expect(useWorkspaceStore.getState().nodesById[fourthId]?.title).toBe('Untitled 3');
});

it('keeps Untitled titles monotonic after the visible series is removed', async () => {
  resetToEmptyWorkspace();

  const firstId = (await useWorkspaceStore.getState().createRootNode())!;
  const secondId = (await useWorkspaceStore.getState().createRootNode())!;

  useWorkspaceStore.getState().deleteNode(firstId);
  useWorkspaceStore.getState().deleteNode(secondId);

  const resetId = (await useWorkspaceStore.getState().createRootNode())!;

  expect(useWorkspaceStore.getState().nodesById[resetId]?.title).toBe('Untitled 2');
});

it('increments Untitled titles per parent when creating empty child nodes', async () => {
  const parentId = (await useWorkspaceStore.getState().createRootNode('Parent'))!;
  const firstChildId = (await useWorkspaceStore.getState().createChildNode(parentId))!;
  const secondChildId = (await useWorkspaceStore.getState().createChildNode(parentId))!;

  expect(useWorkspaceStore.getState().nodesById[firstChildId]?.title).toBe('Untitled');
  expect(useWorkspaceStore.getState().nodesById[secondChildId]?.title).toBe('Untitled 1');
});
