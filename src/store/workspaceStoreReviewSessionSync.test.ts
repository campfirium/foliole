import { beforeEach, expect, it, vi } from 'vitest';

const runtimeInvoke = vi.hoisted(() => vi.fn());

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => runtimeInvoke)
}));

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

function createReadingNode(id: string) {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1']!;
  return {
    ...seedNode,
    id,
    title: id,
    content: `${id}-content`,
    reveal: null,
    review: null
  };
}

function createFsrsNode(id: string) {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1']!;
  return {
    ...seedNode,
    id,
    title: id,
    content: `${id}-prompt`,
    reveal: `${id}-answer`,
    review: {
      due: '2026-02-25T00:00:00.000Z',
      lastReviewAt: null,
      state: 0 as const,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0
    }
  };
}

beforeEach(() => {
  localStorage.clear();
  runtimeInvoke.mockReset();
  runtimeInvoke.mockImplementation(async (command: string, payload?: { nodeIds?: string[] }) =>
    command === 'soft_delete_nodes' ? { deletedNodeIds: payload?.nodeIds ?? [] } : null
  );
  resetWorkspaceStore();
});

it('keeps the current review item when setActiveNode selects another queued topic', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'reading-1',
    nodeOrder: ['reading-1', 'fsrs-1'],
    nodesById: {
      'reading-1': createReadingNode('reading-1'),
      'fsrs-1': createFsrsNode('fsrs-1')
    },
    reviewSession: {
      currentNodeId: 'reading-1',
      isAnswerRevealed: true,
      queueNodeIds: ['reading-1', 'fsrs-1'],
      totalNodeCount: 2
    }
  });

  useWorkspaceStore.getState().setActiveNode('fsrs-1');

  const state = useWorkspaceStore.getState();
  expect(state.activeNodeId).toBe('fsrs-1');
  expect(state.reviewSession.currentNodeId).toBe('reading-1');
  expect(state.reviewSession.queueNodeIds).toEqual(['reading-1', 'fsrs-1']);
  expect(state.reviewSession.isAnswerRevealed).toBe(true);
});

it('normalizes a hydrated review session to the next queued item', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'reading-1',
    nodeOrder: ['reading-1', 'fsrs-1'],
    nodesById: {
      'reading-1': createReadingNode('reading-1'),
      'fsrs-1': createFsrsNode('fsrs-1')
    },
    reviewSession: {
      currentNodeId: 'fsrs-1',
      isAnswerRevealed: true,
      queueNodeIds: ['reading-1', 'fsrs-1'],
      totalNodeCount: 2
    }
  });

  useWorkspaceStore.getState().setActiveNode('fsrs-1');

  const state = useWorkspaceStore.getState();
  expect(state.reviewSession.currentNodeId).toBe('reading-1');
  expect(state.reviewSession.queueNodeIds).toEqual(['reading-1', 'fsrs-1']);
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
});

it('promotes a navigated queued item so resume does not bounce back to the old queue head', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'reading-1',
    nodeOrder: ['reading-1', 'fsrs-1'],
    nodesById: {
      'reading-1': createReadingNode('reading-1'),
      'fsrs-1': createFsrsNode('fsrs-1')
    },
    reviewSession: {
      currentNodeId: 'reading-1',
      isAnswerRevealed: true,
      queueNodeIds: ['reading-1', 'fsrs-1'],
      totalNodeCount: 2
    }
  });

  useWorkspaceStore.getState().openNode('fsrs-1');

  const state = useWorkspaceStore.getState();
  expect(state.activeNodeId).toBe('fsrs-1');
  expect(state.reviewSession.currentNodeId).toBe('fsrs-1');
  expect(state.reviewSession.queueNodeIds).toEqual(['fsrs-1', 'reading-1']);
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
});

it('advances review session when the current queued node is deleted', async () => {
  useWorkspaceStore.setState({
    activeNodeId: 'fsrs-1',
    nodeOrder: ['fsrs-1', 'reading-1'],
    nodesById: {
      'fsrs-1': createFsrsNode('fsrs-1'),
      'reading-1': createReadingNode('reading-1')
    },
    reviewSession: {
      currentNodeId: 'fsrs-1',
      isAnswerRevealed: true,
      queueNodeIds: ['fsrs-1', 'reading-1'],
      totalNodeCount: 2
    }
  });

  await useWorkspaceStore.getState().deleteNode('fsrs-1');

  const state = useWorkspaceStore.getState();
  expect(state.trashedNodeIds).toContain('fsrs-1');
  expect(state.activeNodeId).toBe('reading-1');
  expect(state.reviewSession.currentNodeId).toBe('reading-1');
  expect(state.reviewSession.queueNodeIds).toEqual(['reading-1']);
  expect(state.reviewSession.totalNodeCount).toBe(1);
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
});

it('removes deleted queued nodes even when trash projection is stale', () => {
  useWorkspaceStore.setState({
    activeNodeId: 'reading-1',
    nodeOrder: ['fsrs-1', 'reading-1'],
    nodesById: {
      'fsrs-1': {
        ...createFsrsNode('fsrs-1'),
        deletedAt: '2026-05-24T00:00:00.000Z'
      },
      'reading-1': createReadingNode('reading-1')
    },
    reviewSession: {
      currentNodeId: 'fsrs-1',
      isAnswerRevealed: true,
      queueNodeIds: ['fsrs-1', 'reading-1'],
      totalNodeCount: 2
    },
    trashedNodeIds: []
  });

  useWorkspaceStore.getState().setActiveNode('reading-1');

  const state = useWorkspaceStore.getState();
  expect(state.reviewSession.currentNodeId).toBe('reading-1');
  expect(state.reviewSession.queueNodeIds).toEqual(['reading-1']);
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
});

it('opens the next review node instead of the parent folder when deleting a nested current review node', async () => {
  useWorkspaceStore.setState({
    activeNodeId: 'fsrs-1',
    nodeOrder: ['folder-1', 'fsrs-1', 'reading-1'],
    nodesById: {
      'folder-1': {
        ...createReadingNode('folder-1'),
        content: '',
        kind: 'folder',
        parentNodeId: null,
        review: null
      },
      'fsrs-1': {
        ...createFsrsNode('fsrs-1'),
        parentNodeId: 'folder-1'
      },
      'reading-1': {
        ...createReadingNode('reading-1'),
        parentNodeId: 'folder-1'
      }
    },
    reviewSession: {
      currentNodeId: 'fsrs-1',
      isAnswerRevealed: true,
      queueNodeIds: ['fsrs-1', 'reading-1'],
      totalNodeCount: 2
    }
  });

  await useWorkspaceStore.getState().deleteNode('fsrs-1');

  const state = useWorkspaceStore.getState();
  expect(state.trashedNodeIds).toContain('fsrs-1');
  expect(state.activeNodeId).toBe('reading-1');
  expect(state.reviewSession.currentNodeId).toBe('reading-1');
  expect(state.reviewSession.queueNodeIds).toEqual(['reading-1']);
  expect(state.reviewSession.totalNodeCount).toBe(1);
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
});
