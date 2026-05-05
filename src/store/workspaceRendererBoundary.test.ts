import { beforeEach, expect, it } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')));
}

function createLoadedNodes() {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1'];
  return {
    'node-1': {
      ...seedNode,
      id: 'node-1',
      title: 'Node 1',
      content: 'First node body',
      hasContent: true,
      reveal: 'First answer',
      hasReveal: true
    },
    'node-2': {
      ...seedNode,
      id: 'node-2',
      title: 'Node 2',
      content: 'Second node body',
      hasContent: true,
      reveal: 'Second answer',
      hasReveal: true
    }
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetWorkspaceStore();
});

it('trims inactive node documents after opening another node', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: createLoadedNodes(),
    trashedNodeIds: []
  });

  useWorkspaceStore.getState().openNode('node-2');

  const state = useWorkspaceStore.getState();
  expect(state.activeNodeId).toBe('node-2');
  expect(state.nodesById['node-1']).toMatchObject({
    content: '',
    hasContent: true,
    reveal: null,
    hasReveal: true
  });
  expect(state.nodesById['node-2']).toMatchObject({
    content: 'Second node body',
    hasContent: true,
    reveal: 'Second answer',
    hasReveal: true
  });
});

it('keeps pending unsynced node documents while switching active nodes', async () => {
  useWorkspaceStore.setState({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: createLoadedNodes(),
    trashedNodeIds: []
  });

  useWorkspaceStore.getState().updateNodeContent('node-1', 'Locally edited body');
  await Promise.resolve();
  useWorkspaceStore.getState().openNode('node-2');

  const state = useWorkspaceStore.getState();
  expect(state.activeNodeId).toBe('node-2');
  expect(state.nodesById['node-1']).toMatchObject({
    content: 'Locally edited body',
    hasContent: true
  });
  expect(state.nodesById['node-2']).toMatchObject({
    content: 'Second node body',
    hasContent: true,
    reveal: 'Second answer',
    hasReveal: true
  });
});
