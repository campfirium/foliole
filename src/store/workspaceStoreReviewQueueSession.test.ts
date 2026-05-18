import { expect, it } from 'vitest';

import type { Node, NodeReadingProfile, NodeReviewProfile } from '../features/nodes/model/nodeTypes';
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
    kind: 'item',
    title: id,
    content: id,
    reveal: `${id}-answer`,
    review: createReviewProfile(due, overrides),
    createdAt: due,
    updatedAt: due
  };
}

function createReadingProfile(nextAt: string, overrides: Partial<NodeReadingProfile> = {}): NodeReadingProfile {
  return {
    intervalDurationMs: 24 * 60 * 60 * 1000,
    intervalGrowthFactor: 1.3,
    lastHandledAt: '2026-03-09T08:00:00.000Z',
    nextAt,
    priority: 5,
    readingPosition: 0,
    repetitionCount: 1,
    state: 'active',
    ...overrides
  };
}

function createReadingNode(id: string, timestamp: string, reading: NodeReadingProfile | null = null): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'topic',
    title: id,
    content: `${id}-content`,
    reveal: null,
    reading,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

const priorityParentNode: Node = {
  id: 'priority-parent',
  parentNodeId: null,
  kind: 'folder',
  priority: 0,
  title: 'priority-parent',
  content: '   ',
  reveal: null,
  reading: null,
  review: null,
  createdAt: '2026-03-01T08:00:00.000Z',
  updatedAt: '2026-03-01T08:00:00.000Z'
};

function createPlannerBackedFsrsNodes(): Node[] {
  return [
    {
      ...createReviewNode('fsrs-absolute', '2026-03-08T08:00:00.000Z', {
        lastReviewAt: '2026-03-06T08:00:00.000Z',
        reps: 2,
        scheduledDays: 2,
        stability: 2,
        state: 2
      }),
      parentNodeId: priorityParentNode.id
    },
    createReviewNode('fsrs-low-r', '2026-03-10T11:00:00.000Z', { lastReviewAt: '2026-03-09T10:00:00.000Z', reps: 4, scheduledDays: 1, stability: 0.3, state: 2 }),
    createReviewNode('fsrs-high-r', '2026-03-07T08:00:00.000Z', { lastReviewAt: '2026-03-09T08:00:00.000Z', reps: 4, scheduledDays: 5, stability: 12, state: 2 }),
    createReviewNode('fsrs-4', '2026-03-06T08:00:00.000Z', { lastReviewAt: '2026-03-02T08:00:00.000Z', reps: 2, scheduledDays: 4, stability: 4, state: 2 }),
    createReviewNode('fsrs-5', '2026-03-05T08:00:00.000Z', { lastReviewAt: '2026-03-01T08:00:00.000Z', reps: 2, scheduledDays: 5, stability: 5, state: 2 }),
    createReviewNode('fsrs-6', '2026-03-04T08:00:00.000Z', { lastReviewAt: '2026-02-28T08:00:00.000Z', reps: 2, scheduledDays: 6, stability: 6, state: 2 })
  ];
}

function createPlannerBackedReadingNodes(): Node[] {
  return [
    createReadingNode('reading-late-nextAt', '2026-03-01T08:00:00.000Z', createReadingProfile('2026-03-10T11:30:00.000Z')),
    createReadingNode('reading-early-nextAt', '2026-03-02T08:00:00.000Z', createReadingProfile('2026-03-10T09:00:00.000Z')),
    createReadingNode('reading-future', '2026-03-03T08:00:00.000Z', createReadingProfile('2026-03-11T09:00:00.000Z'))
  ];
}

function createPlannerBackedQueueNodes(): Node[] {
  return [priorityParentNode, ...createPlannerBackedFsrsNodes(), ...createPlannerBackedReadingNodes()];
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
    setListCollapsed: () => undefined,
    setRightSidebarWidth: () => undefined,
    setRightSidebarCollapsed: () => undefined,
    setActiveNode: () => undefined,
    updateNodeTitle: () => undefined,
    updateNodeContent: () => undefined,
    updateVirtualNodeFilter: () => undefined,
    updateNodeReveal: () => undefined,
    updateNodePriority: () => undefined,
    updateNodeDesiredRetention: () => undefined,
    dismissNode: () => false,
    relearnNode: () => false,
    startReviewSession: () => false,
    revealReviewAnswer: () => undefined,
    gradeReviewCard: async () => false,
    completeReviewItem: () => false,
    deferReviewItem: () => false,
    dismissReviewItem: () => false,
    exitReviewSession: () => undefined,
    deleteNode: () => undefined,
    deleteImageClozeRegion: () => undefined,
    deleteNodes: () => undefined,
    restoreNode: async () => null,
    deleteNodePermanently: () => undefined,
    deleteNodesPermanently: () => undefined,
    createRootNode: () => 'unused',
    createChildNode: () => 'unused',
    createVirtualNode: () => 'unused',
    createHighlightNodeFromSelection: () => null,
    createQANodeFromSelection: () => null,
    createImageClozeNodes: () => [],
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

it('starts a session from the planner-backed FSRS/reading mixed queue order', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const harness = createSetStateHarness(createWorkspaceFixture(createPlannerBackedQueueNodes()));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, schedulerStub);

  const started = actions.startReviewSession(now);

  expect(started).toBe(true);
  expect(harness.getState().reviewSession.currentNodeId).toBe('fsrs-absolute');
  expect(harness.getState().reviewSession.queueNodeIds).toEqual([
    'fsrs-absolute',
    'fsrs-low-r',
    'fsrs-4',
    'fsrs-5',
    'fsrs-6',
    'reading-early-nextAt',
    'fsrs-high-r',
    'reading-late-nextAt'
  ]);
});
