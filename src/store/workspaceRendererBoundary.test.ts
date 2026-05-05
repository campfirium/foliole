import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../shared/platform/bridge';

import { enforceWorkspaceRendererBoundary } from './workspaceRendererBoundary';
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
  vi.restoreAllMocks();
  vi.mocked(getRuntimeInvoke).mockReset();
  resetWorkspaceStore();
});

it('keeps the previous active node warm on direct active-node patches', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: createLoadedNodes(),
    trashedNodeIds: []
  });

  const state = useWorkspaceStore.getState();
  expect(state.activeNodeId).toBe('node-2');
  expect(state.nodesById['node-1']).toMatchObject({
    content: 'First node body',
    hasContent: true,
    reveal: 'First answer',
    hasReveal: true
  });
  expect(state.nodesById['node-2']).toMatchObject({
    content: 'Second node body',
    hasContent: true,
    reveal: 'Second answer',
    hasReveal: true
  });
  expect(state.rendererBoundaryKeepNodeIds).toEqual(['node-1']);
});

it('keeps the previously active node warm when navigation opens another node', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn(() => new Promise(() => undefined)));

  useWorkspaceStore.setState({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...createLoadedNodes(),
      'node-1': {
        ...createLoadedNodes()['node-1'],
        content: '',
        reveal: null,
        hasReveal: false
      }
    },
    trashedNodeIds: []
  });

  useWorkspaceStore.getState().updateNodeContent('node-1', 'Locally edited body');
  await Promise.resolve();
  useWorkspaceStore.getState().openNode('node-1');

  const state = useWorkspaceStore.getState();
  expect(state.activeNodeId).toBe('node-1');
  expect(state.nodesById['node-1']).toMatchObject({
    content: '',
    hasContent: true
  });
  expect(state.nodesById['node-2']).toMatchObject({
    content: 'Second node body',
    hasContent: true,
    reveal: 'Second answer',
    hasReveal: true
  });
  expect(state.rendererBoundaryKeepNodeIds).toEqual(['node-2']);
});

it('preserves the warm inactive document across direct nodesById patches', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...useWorkspaceStore.getState().nodesById,
      'node-1': {
        ...createLoadedNodes()['node-1'],
        content: '',
        reveal: null,
        hasReveal: true
      },
      'node-2': {
        ...createLoadedNodes()['node-2'],
        content: 'Second node body',
        reveal: 'Second answer',
        hasReveal: true
      }
    },
    trashedNodeIds: []
  });

  useWorkspaceStore.setState({
    nodesById: createLoadedNodes()
  });

  const state = useWorkspaceStore.getState();
  expect(state.nodesById['node-1']).toMatchObject({
    content: 'First node body',
    hasContent: true,
    reveal: 'First answer',
    hasReveal: true
  });
  expect(state.nodesById['node-2']).toMatchObject({
    content: 'Second node body',
    hasContent: true,
    reveal: 'Second answer',
    hasReveal: true
  });
});

it('trims nodesById-only boundary patches against the current active node', () => {
  const currentState = createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z'));
  const boundaryState = {
    ...currentState,
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...currentState.nodesById,
      ...createLoadedNodes()
    }
  };
  const nextState = enforceWorkspaceRendererBoundary(
    {
      nodesById: createLoadedNodes()
    },
    boundaryState
  ) as { nodesById: ReturnType<typeof createLoadedNodes> };

  expect(nextState.nodesById['node-1']).toMatchObject({
    content: '',
    hasContent: true,
    reveal: null,
    hasReveal: true
  });
  expect(nextState.nodesById['node-2']).toMatchObject({
    content: 'Second node body',
    hasContent: true,
    reveal: 'Second answer',
    hasReveal: true
  });
});

it('keeps pending nodes loaded for nodesById-only boundary patches', () => {
  const currentState = {
    ...createInitialWorkspaceState(new Date('2026-03-20T00:00:00.000Z')),
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...useWorkspaceStore.getState().nodesById,
      ...createLoadedNodes()
    }
  };
  const nextState = enforceWorkspaceRendererBoundary(
    {
      nodesById: createLoadedNodes()
    },
    currentState,
    new Set(['node-1'])
  ) as { nodesById: ReturnType<typeof createLoadedNodes> };

  expect(nextState.nodesById['node-1']).toMatchObject({
    content: 'First node body',
    hasContent: true,
    reveal: 'First answer',
    hasReveal: true
  });
  expect(nextState.nodesById['node-2']).toMatchObject({
    content: 'Second node body',
    hasContent: true,
    reveal: 'Second answer',
    hasReveal: true
  });
});
