import { expect, vi } from 'vitest';

import type { Node, NodeReadingProfile, NodeReviewProfile } from '../features/nodes/model/nodeTypes';
import type { ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';

import type { WorkspaceState } from './workspaceStore';
import { createInitialWorkspaceState } from './workspaceStore';

export { expectReviewRuntimeSyncCalled } from './workspaceStoreReviewRuntimeSyncExpectations.test-support';

type WorkspaceSetInput =
  | WorkspaceState
  | Partial<WorkspaceState>
  | ((snapshot: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>);

function createHistoryActionStubs() {
  return {
    undoWorkspaceAction: () => false,
    redoWorkspaceAction: () => false,
    pushEditorOperationEntry: () => undefined,
    deleteEditorAnnotationNodes: () => undefined,
    undoEditorOperation: () => false,
    redoEditorOperation: () => false
  };
}

function createWorkspaceActionStubs() {
  return {
    goBack: () => null,
    goForward: () => null,
    goToParent: () => null,
    jumpToAncestorNode: () => null,
    openNode: () => null,
    resetLayout: () => undefined,
    setNodeViewState: () => undefined,
    setDocumentMaxWidth: () => undefined,
    setListWidth: () => undefined,
    setListCollapsed: () => undefined,
    setRightSidebarWidth: () => undefined,
    setRightSidebarCollapsed: () => undefined,
    setActiveNode: () => undefined,
    updateNodeTitle: async () => false,
    updateNodeContent: async () => false,
    updateVirtualNodeFilter: () => undefined,
    updateNodeReveal: async () => false,
    updateNodePriority: () => undefined,
    updateNodeDesiredRetention: () => undefined,
    updateNodeShortTerm: () => undefined,
    setNodeSequentialReading: () => false,
    dismissNode: () => false,
    ...createHistoryActionStubs(),
    relearnNode: () => false,
    startReviewSession: () => false,
    resumeReviewSession: () => false,
    setReviewSessionMode: () => undefined,
    revealReviewAnswer: () => undefined,
    gradeReviewCard: async () => false,
    completeReviewItem: async () => false,
    deferReviewItem: async () => false,
    soonReviewItem: async () => false,
    dismissReviewItem: async () => false,
    exitReviewSession: () => undefined,
    deleteNode: () => undefined,
    deleteImageClozeRegion: () => undefined,
    deleteNodes: () => undefined,
    restoreNode: async () => null,
    deleteNodePermanently: () => undefined,
    deleteNodesPermanently: () => undefined,
    createRootNode: async () => 'unused',
    createChildNode: async () => 'unused',
    createVirtualNode: async () => 'unused',
    createHighlightNodeFromSelection: async () => null,
    createQANodeFromSelection: async () => null,
    createFormulaClozeNode: async () => null,
    createImageClozeNodes: async () => [],
    moveNode: async () => false,
    moveNodes: async () => false
  };
}

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

export function createQaNode(id: string, due: string): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'item',
    title: id,
    content: `${id}-content`,
    reveal: `${id}-answer`,
    review: createReviewProfile(due),
    createdAt: due,
    updatedAt: due
  };
}

export function createClozeReviewNode(id: string, due: string): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'item',
    title: id,
    content: `${id}-content`,
    anchorLink: {
      id: `${id}-anchor`,
      kind: 'cloze'
    },
    reveal: null,
    review: createReviewProfile(due),
    createdAt: due,
    updatedAt: due
  };
}

function createReadingProfile(nextAt: string): NodeReadingProfile {
  return {
    intervalDurationMs: 24 * 60 * 60 * 1000,
    intervalGrowthFactor: 1.3,
    lastHandledAt: '2026-03-02T00:00:00.000Z',
    nextAt,
    priority: 5,
    readingPosition: 0,
    repetitionCount: 1,
    state: 'active'
  };
}

export function createReadingNode(id: string, nextAt: string): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'topic',
    title: id,
    content: `${id}-content`,
    reveal: null,
    reading: createReadingProfile(nextAt),
    review: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z'
  };
}

export function createWorkspaceFixture(nodes: Node[]): WorkspaceState {
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
    ...createWorkspaceActionStubs()
  };
}

export function createSetStateHarness(initialState: WorkspaceState) {
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

export function createSchedulerGradeMock() {
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

export const previewStub: ReviewSchedulerAdapter['preview'] = async () => ({
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

export function expectReviewQueueAdvanced(state: WorkspaceState) {
  expectNextQueueState(state);
}
