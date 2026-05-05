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

it('starts a session from the planned mixed queue order', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([
      createReviewNode('new-1', now),
      createReviewNode('review-2', '2026-03-08T08:00:00.000Z', {
        reps: 2,
        state: 2,
        lastReviewAt: '2026-03-07T08:00:00.000Z'
      }),
      createReadingNode('reading-1', now),
      createReviewNode('review-3', '2026-03-09T07:00:00.000Z', {
        reps: 1,
        state: 1,
        lastReviewAt: '2026-03-06T07:00:00.000Z'
      }),
      createReviewNode('review-1', '2026-03-07T06:00:00.000Z', {
        reps: 5,
        state: 2,
        lastReviewAt: '2026-03-01T06:00:00.000Z'
      }),
      createReviewNode('review-4', '2026-03-10T09:00:00.000Z', {
        reps: 3,
        state: 2,
        lastReviewAt: '2026-03-08T09:00:00.000Z'
      }),
      createReviewNode('new-2', now)
    ])
  );
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  const started = actions.startReviewSession(now);

  expect(started).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe('review-1');
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([
    'review-1',
    'review-2',
    'review-3',
    'new-1',
    'review-4',
    'new-2'
  ]);
});
