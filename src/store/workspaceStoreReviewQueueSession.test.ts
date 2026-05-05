import { expect, it } from 'vitest';

import type { Node, NodeReviewProfile } from '../features/nodes/model/nodeTypes';
import type { ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';

import type { WorkspaceState } from './workspaceStore';
import { createInitialWorkspaceState } from './workspaceStore';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';

type WorkspaceSetInput =
  | WorkspaceState
  | Partial<WorkspaceState>
  | ((snapshot: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>);

function createReviewProfile(due: string, overrides: Partial<NodeReviewProfile> = {}): NodeReviewProfile {
  return {
    due,
    lastReviewAt: null,
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    ...overrides
  };
}

function createReviewNode(id: string, due: string, overrides: Partial<NodeReviewProfile> = {}): Node {
  return {
    id,
    parentNodeId: null,
    title: id,
    content: id,
    reveal: `${id}-answer`,
    review: createReviewProfile(due, overrides),
    createdAt: due,
    updatedAt: due
  };
}

function createReadingNode(id: string, timestamp: string): Node {
  return {
    id,
    parentNodeId: null,
    title: id,
    content: `${id}-content`,
    reveal: null,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createWorkspaceFixture(nodes: Node[]): WorkspaceState {
  const initial = createInitialWorkspaceState(new Date('2026-03-03T00:00:00.000Z'));
  const nodesById = nodes.reduce<Record<string, Node>>((accumulator, node) => {
    accumulator[node.id] = node;
    return accumulator;
  }, {});
  const nodeOrder = nodes.map((node) => node.id);

  return {
    ...initial,
    activeNodeId: nodeOrder[0] ?? null,
    nodeOrder,
    nodesById,
    goBack: () => null,
    goForward: () => null,
    goToParent: () => null,
    jumpToAncestorNode: () => null,
    openNode: () => null,
    resetLayout: () => undefined,
    setNodeViewState: () => undefined,
    setDocumentMaxWidth: () => undefined,
    setListWidth: () => undefined,
    setActiveNode: () => undefined,
    updateNodeTitle: () => undefined,
    updateNodeContent: () => undefined,
    updateNodeReveal: () => undefined,
    startReviewSession: () => false,
    revealReviewAnswer: () => undefined,
    gradeReviewCard: async () => false,
    exitReviewSession: () => undefined,
    deleteNode: () => undefined,
    restoreNode: () => undefined,
    deleteNodePermanently: () => undefined,
    createRootNode: () => 'unused',
    createChildNode: () => 'unused',
    createHighlightNodeFromSelection: () => null,
    createQANodeFromSelection: () => null,
    moveNode: () => false,
    moveNodes: () => false
  };
}

function createSetStateHarness(initialState: WorkspaceState) {
  let state = initialState;
  const setState = (partial: WorkspaceSetInput) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  };
  return {
    setState,
    getState: () => state
  };
}

const schedulerStub: ReviewSchedulerAdapter = {
  grade: async () => {
    throw new Error('grade should not be called');
  },
  preview: async () => {
    throw new Error('preview should not be called');
  }
};

it('starts a session from the unified FSRS/reading mixed queue order', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([
      createReviewNode('fsrs-1', '2026-03-01T08:00:00.000Z', {
        reps: 4,
        state: 2,
        lastReviewAt: '2026-02-24T08:00:00.000Z'
      }),
      createReadingNode('reading-1', '2026-03-02T08:00:00.000Z'),
      createReviewNode('fsrs-2', '2026-03-02T08:00:00.000Z', {
        reps: 2,
        state: 2,
        lastReviewAt: '2026-02-25T08:00:00.000Z'
      }),
      createReviewNode('fsrs-3', '2026-03-03T07:00:00.000Z', {
        reps: 2,
        state: 2,
        lastReviewAt: '2026-02-26T07:00:00.000Z'
      }),
      createReviewNode('fsrs-4', '2026-03-04T06:00:00.000Z', {
        reps: 2,
        state: 2,
        lastReviewAt: '2026-02-27T06:00:00.000Z'
      }),
      createReviewNode('fsrs-5', '2026-03-05T09:00:00.000Z', {
        reps: 2,
        state: 2,
        lastReviewAt: '2026-02-28T09:00:00.000Z'
      }),
      createReadingNode('reading-2', '2026-03-06T08:00:00.000Z'),
      createReviewNode('fsrs-6', '2026-03-06T10:00:00.000Z', {
        reps: 1,
        state: 1,
        lastReviewAt: '2026-03-01T10:00:00.000Z'
      })
    ])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  const started = actions.startReviewSession(now);

  expect(started).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe('fsrs-1');
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([
    'fsrs-1',
    'fsrs-2',
    'fsrs-3',
    'fsrs-4',
    'fsrs-5',
    'reading-1',
    'fsrs-6',
    'reading-2'
  ]);
});
