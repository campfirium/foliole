import { beforeEach, expect, it, vi } from 'vitest';

import type { Node, NodeReviewProfile } from '../features/nodes/model/nodeTypes';
import type { ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';

import { syncReviewGradeToRuntimeWithRetry } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { createInitialWorkspaceState } from './workspaceStore';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspaceRuntimeSync')>();
  return {
    ...actual,
    syncReviewGradeToRuntimeWithRetry: vi.fn()
  };
});

type WorkspaceSetInput =
  | WorkspaceState
  | Partial<WorkspaceState>
  | ((snapshot: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>);

function createReviewProfile(due: string): NodeReviewProfile {
  return {
    due,
    lastReviewAt: null,
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0
  };
}

function createQaNode(id: string, due: string): Node {
  return {
    id,
    parentNodeId: null,
    title: id,
    content: `${id}-content`,
    reveal: `${id}-answer`,
    review: createReviewProfile(due),
    createdAt: due,
    updatedAt: due
  };
}

function createWorkspaceFixture(nodes: Node[]): WorkspaceState {
  const initial = createInitialWorkspaceState(new Date('2026-03-03T00:00:00.000Z'));
  const nodesById = nodes.reduce<Record<string, Node>>((acc, node) => {
    acc[node.id] = node;
    return acc;
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

function createSchedulerGradeMock() {
  return vi.fn<ReviewSchedulerAdapter['grade']>(async () => ({
    card: {
      due: '2026-03-10T00:00:00.000Z',
      stability: 3,
      difficulty: 4,
      elapsed_days: 1,
      scheduled_days: 7,
      reps: 1,
      lapses: 0,
      state: 1,
      last_review: '2026-03-03T00:00:00.000Z'
    },
    reviewed_at: '2026-03-03T00:00:00.000Z'
  }));
}

const previewStub: ReviewSchedulerAdapter['preview'] = async () => ({
  Again: { card: createSchedulerCard('2026-03-03T00:00:00.000Z'), reviewed_at: '2026-03-03T00:00:00.000Z' },
  Hard: { card: createSchedulerCard('2026-03-04T00:00:00.000Z'), reviewed_at: '2026-03-03T00:00:00.000Z' },
  Good: { card: createSchedulerCard('2026-03-06T00:00:00.000Z'), reviewed_at: '2026-03-03T00:00:00.000Z' },
  Easy: { card: createSchedulerCard('2026-03-10T00:00:00.000Z'), reviewed_at: '2026-03-03T00:00:00.000Z' }
});

function expectNextQueueState(state: WorkspaceState) {
  expect(state.activeNodeId).toBe('qa-2');
  expect(state.reviewSession.currentNodeId).toBe('qa-2');
  expect(state.reviewSession.queueNodeIds).toEqual(['qa-2']);
  expect(state.reviewSession.isAnswerRevealed).toBe(false);
  expect(state.nodesById['qa-1']?.review).toMatchObject({
    due: '2026-03-10T00:00:00.000Z',
    state: 1,
    lastReviewAt: '2026-03-03T00:00:00.000Z'
  });
}

const EXPECTED_REVIEW_RUNTIME_SYNC = {
  nodeId: 'qa-1',
  grade: 3,
  reviewedAt: '2026-03-03T00:00:00.000Z',
  cardBefore: {
    due: '2026-03-03T00:00:00.000Z',
    last_review: null,
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  },
  cardAfter: {
    due: '2026-03-10T00:00:00.000Z',
    last_review: '2026-03-03T00:00:00.000Z',
    state: 1,
    stability: 3,
    difficulty: 4,
    elapsed_days: 1,
    scheduled_days: 7,
    reps: 1,
    lapses: 0
  }
};

function createSchedulerCard(due: string) {
  return {
    due,
    last_review: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  };
}

function expectReviewRuntimeSyncCalled() {
  expect(syncReviewGradeToRuntimeWithRetry).toHaveBeenCalledTimes(1);
  expect(syncReviewGradeToRuntimeWithRetry).toHaveBeenCalledWith(EXPECTED_REVIEW_RUNTIME_SYNC);
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('advances to next review node after show-answer and grade', async () => {
  const due = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createQaNode('qa-1', due), createQaNode('qa-2', due)])
  );
  const grade = createSchedulerGradeMock();
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade, preview: previewStub });

  const started = actions.startReviewSession(due);
  expect(started).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe('qa-1');
  expect(harness.getState().reviewSession.isAnswerRevealed).toBe(false);

  actions.revealReviewAnswer();
  expect(harness.getState().reviewSession.isAnswerRevealed).toBe(true);

  const graded = await actions.gradeReviewCard(3, due);
  expect(graded).toBe(true);
  expect(grade).toHaveBeenCalledTimes(1);
  expectReviewRuntimeSyncCalled();
  expectNextQueueState(harness.getState());
});

it('ends session when grading the last review node', async () => {
  const due = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(createWorkspaceFixture([createQaNode('qa-1', due)]));
  const actions = createWorkspaceReviewActions(
    harness.setState,
    harness.getState,
    {
      preview: previewStub,
      grade: async (input) => ({
        card: {
          ...input.card,
          state: 2,
          due: '2026-03-06T00:00:00.000Z',
          last_review: input.now
        },
        reviewed_at: input.now
      })
    }
  );

  actions.startReviewSession(due);
  actions.revealReviewAnswer();
  const graded = await actions.gradeReviewCard(4, due);

  expect(graded).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBeNull();
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([]);
  expect(harness.getState().reviewSession.isAnswerRevealed).toBe(false);
  expect(harness.getState().activeNodeId).toBe('qa-1');
});

it('enqueues runtime sync and advances review state in one grading action', async () => {
  const due = '2026-03-03T00:00:00.000Z';
  const harness = createSetStateHarness(
    createWorkspaceFixture([createQaNode('qa-1', due), createQaNode('qa-2', due)])
  );
  const grade = createSchedulerGradeMock();
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, { grade, preview: previewStub });

  actions.startReviewSession(due);
  actions.revealReviewAnswer();
  const graded = await actions.gradeReviewCard(3, due);

  expect(graded).toBe(true);
  expect(grade).toHaveBeenCalledTimes(1);
  expectReviewRuntimeSyncCalled();
  expectNextQueueState(harness.getState());
});
