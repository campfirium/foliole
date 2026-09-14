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

  useWorkspaceStore.setState({ trashedNodeIds: [secondId, thirdId] });

  const fourthId = (await useWorkspaceStore.getState().createRootNode())!;

  expect(useWorkspaceStore.getState().nodesById[firstId]?.title).toBe('Untitled');
  expect(useWorkspaceStore.getState().nodesById[fourthId]?.title).toBe('Untitled 3');
});

it('resets Untitled titles after the series is fully removed', async () => {
  resetToEmptyWorkspace();

  const firstId = (await useWorkspaceStore.getState().createRootNode())!;
  const secondId = (await useWorkspaceStore.getState().createRootNode())!;

  useWorkspaceStore.setState({ trashedNodeIds: [firstId, secondId] });

  const resetId = (await useWorkspaceStore.getState().createRootNode())!;

  expect(useWorkspaceStore.getState().nodesById[resetId]?.title).toBe('Untitled');
});

it('increments Untitled titles across different parents', async () => {
  const firstParentId = (await useWorkspaceStore.getState().createRootNode('First parent'))!;
  const secondParentId = (await useWorkspaceStore.getState().createRootNode('Second parent'))!;
  const firstChildId = (await useWorkspaceStore.getState().createChildNode(firstParentId))!;
  const secondChildId = (await useWorkspaceStore.getState().createChildNode(secondParentId))!;

  expect(useWorkspaceStore.getState().nodesById[firstChildId]?.title).toBe('Untitled');
  expect(useWorkspaceStore.getState().nodesById[secondChildId]?.title).toBe('Untitled 1');
});

it('does not derive the sequence from a manually assigned Untitled-style title', async () => {
  const manualId = (await useWorkspaceStore.getState().createRootNode('Manual'))!;
  await useWorkspaceStore.getState().updateNodeTitle(manualId, 'Untitled 1123123123');

  const createdId = (await useWorkspaceStore.getState().createRootNode())!;

  expect(useWorkspaceStore.getState().nodesById[createdId]?.title).toBe('Untitled');
});

it('ignores stale counters when no generated Untitled title remains', async () => {
  useWorkspaceStore.setState({
    untitledSequenceByParent: { __global__: 1123123128, 'special-inbox': 1123123128 }
  });

  const createdId = (await useWorkspaceStore.getState().createRootNode())!;

  expect(useWorkspaceStore.getState().nodesById[createdId]?.title).toBe('Untitled');
  expect(useWorkspaceStore.getState().untitledSequenceByParent.__global__).toBe(1);
});
