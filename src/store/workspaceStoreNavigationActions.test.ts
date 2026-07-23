import { beforeEach, expect, it } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
});

it('keeps review paused when re-opening an already active queued topic', () => {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1']!;

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
  expect(state.reviewSession.currentNodeId).toBe('reading-1');
  expect(state.reviewSession.isAnswerRevealed).toBe(true);
  expect(state.reviewSession.queueNodeIds).toEqual(['reading-1', 'fsrs-1']);
});

it('keeps the previous document warm when opening another node through navigation', () => {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1']!;

  useWorkspaceStore.setState({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': {
        ...seedNode,
        id: 'node-1',
        title: 'Node 1',
        content: 'First node body',
        hasContent: true,
        reveal: null,
        hasReveal: false,
        review: null
      },
      'node-2': {
        ...seedNode,
        id: 'node-2',
        title: 'Node 2',
        content: 'Second node body',
        hasContent: true,
        reveal: null,
        hasReveal: false,
        review: null
      }
    },
    trashedNodeIds: []
  });

  useWorkspaceStore.getState().openNode('node-2');

  const state = useWorkspaceStore.getState();
  expect(state.activeNodeId).toBe('node-2');
  expect(state.nodesById['node-1']!).toMatchObject({ content: 'First node body', reveal: null });
  expect(state.rendererBoundaryKeepNodeIds).toEqual(['node-1']);
});

it('records a parent open without a loaded document when navigating to parent', () => {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1']!;

  useWorkspaceStore.setState({
    activeNodeId: 'node-3',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      'node-1': {
        ...seedNode,
        id: 'node-1',
        title: 'Root',
        content: 'Root body',
        hasContent: true,
        reveal: null,
        hasReveal: false,
        review: null
      },
      'node-2': {
        ...seedNode,
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Parent',
        content: '',
        hasContent: true,
        reveal: null,
        hasReveal: false,
        review: null
      },
      'node-3': {
        ...seedNode,
        id: 'node-3',
        parentNodeId: 'node-2',
        title: 'Child',
        content: 'Child body',
        hasContent: true,
        anchorLink: {
          id: 'hl-1',
          kind: 'highlight',
          locator: {
            from: 9,
            originalText: 'Needle',
            to: 15
          }
        },
        reveal: null,
        hasReveal: false,
        review: null
      }
    },
    trashedNodeIds: []
  });

  useWorkspaceStore.getState().goToParent();

  const state = useWorkspaceStore.getState();
  expect(state.activeNodeId).toBe('node-2');
  expect(state.nodeViewById['node-2']).toBeUndefined();
});

function seedParentHighlightReturnState() {
  const seedNode = useWorkspaceStore.getState().nodesById['node-1']!;
  useWorkspaceStore.setState({
    activeNodeId: 'node-3',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodeViewById: {
      'node-2': {
        scrollTop: 3210,
        selection: { from: 1, to: 1 },
        updatedAt: '2026-02-25T00:00:00.000Z'
      }
    },
    nodesById: {
      'node-1': {
        ...seedNode,
        id: 'node-1',
        title: 'Root',
        content: 'Root body',
        hasContent: true,
        reveal: null,
        hasReveal: false,
        review: null
      },
      'node-2': {
        ...seedNode,
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Parent',
        content: 'Parent body',
        hasContent: true,
        reveal: null,
        hasReveal: false,
        review: null
      },
      'node-3': {
        ...seedNode,
        id: 'node-3',
        parentNodeId: 'node-2',
        title: 'Child',
        content: 'Child body',
        hasContent: true,
        anchorLink: {
          id: 'hl-1',
          kind: 'highlight',
          locator: {
            from: 9,
            originalText: 'Needle',
            to: 15
          }
        },
        reveal: null,
        hasReveal: false,
        review: null
      }
    },
    trashedNodeIds: []
  });
}

function runParentHighlightReturnStateTest() {
  seedParentHighlightReturnState();
  useWorkspaceStore.getState().goToParent();

  const state = useWorkspaceStore.getState();
  expect(state.nodeViewById['node-2']).toMatchObject({ scrollTop: 3210, selection: { from: 1, to: 1 } });
  expect(state.nodeViewById['node-2']?.updatedAt).toBe('2026-02-25T00:00:00.000Z');
}

it('keeps the stored parent view state when returning with a highlight anchor', () => {
  runParentHighlightReturnStateTest();
});
