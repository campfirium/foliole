import { beforeEach, expect, it } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
});

it('re-syncs review session when re-opening the already active queued node', () => {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1'];

  useWorkspaceStore.setState({
    activeNodeId: 'fsrs-1',
    nodeOrder: ['reading-1', 'fsrs-1'],
    nodesById: {
      'reading-1': {
        ...seedNode,
        id: 'reading-1',
        title: 'Reading 1',
        content: 'Read first',
        reveal: null,
        review: null
      },
      'fsrs-1': {
        ...seedNode,
        id: 'fsrs-1',
        title: 'QA 1',
        content: 'Prompt 1',
        reveal: 'Answer 1',
        review: {
          due: '2026-02-25T00:00:00.000Z',
          lastReviewAt: null,
          state: 0,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0
        }
      }
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
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
  expect(state.reviewSession.queueNodeIds).toEqual(['fsrs-1', 'reading-1']);
});
