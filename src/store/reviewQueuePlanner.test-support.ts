import type { Node, NodeReadingProfile, NodeReviewProfile } from '../features/nodes/model/nodeTypes';

export function createReviewProfile(due: string, overrides: Partial<NodeReviewProfile> = {}): NodeReviewProfile {
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

export function createReviewNode(id: string, due: string, overrides: Partial<NodeReviewProfile> = {}): Node {
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

export function createReadingProfile(nextAt: string, overrides: Partial<NodeReadingProfile> = {}): NodeReadingProfile {
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

export function createReadingNode(
  id: string,
  timestamp: string,
  content = 'reading content',
  reading: NodeReadingProfile | null = null
): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'topic',
    title: id,
    content,
    reveal: null,
    reading,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createClozeReviewNode(id: string, due: string, overrides: Partial<NodeReviewProfile> = {}): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'item',
    title: id,
    content: id,
    anchorLink: {
      id: `${id}-anchor`,
      kind: 'cloze'
    },
    reveal: null,
    review: createReviewProfile(due, overrides),
    createdAt: due,
    updatedAt: due
  };
}

export const priorityParentNode: Node = {
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

export function createPlannerBackedFsrsNodes(): Node[] {
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

export function createPlannerBackedReadingNodes(): Node[] {
  return [
    createReadingNode('reading-late-nextAt', '2026-03-01T08:00:00.000Z', 'reading content', createReadingProfile('2026-03-10T11:30:00.000Z')),
    createReadingNode('reading-early-nextAt', '2026-03-02T08:00:00.000Z', 'reading content', createReadingProfile('2026-03-10T09:00:00.000Z')),
    createReadingNode('reading-future', '2026-03-03T08:00:00.000Z', 'reading content', createReadingProfile('2026-03-11T09:00:00.000Z'))
  ];
}

export function createPlannerBackedQueueNodes(): Node[] {
  return [priorityParentNode, ...createPlannerBackedFsrsNodes(), ...createPlannerBackedReadingNodes()];
}
