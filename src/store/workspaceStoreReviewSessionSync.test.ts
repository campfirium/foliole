import { beforeEach, expect, it } from 'vitest';

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
  resetWorkspaceStore();
});

it('re-syncs review session when setActiveNode selects another queued review node', () => {
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
  expect(state.reviewSession.currentNodeId).toBe('fsrs-1');
  expect(state.reviewSession.queueNodeIds).toEqual(['fsrs-1', 'reading-1']);
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
});

it('advances review session when the current queued node is deleted', () => {
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

  useWorkspaceStore.getState().deleteNode('fsrs-1');

  const state = useWorkspaceStore.getState();
  expect(state.trashedNodeIds).toContain('fsrs-1');
  expect(state.activeNodeId).toBe('reading-1');
  expect(state.reviewSession.currentNodeId).toBe('reading-1');
  expect(state.reviewSession.queueNodeIds).toEqual(['reading-1']);
  expect(state.reviewSession.totalNodeCount).toBe(1);
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
});
