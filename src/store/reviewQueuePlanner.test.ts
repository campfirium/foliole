import { expect, it } from 'vitest';

import type { Node, NodeReadingProfile, NodeReviewProfile } from '../features/nodes/model/nodeTypes';

import { buildReviewQueuePlan } from './reviewQueuePlanner';

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

function createReadingNode(
  id: string,
  timestamp: string,
  content = 'reading content',
  reading: NodeReadingProfile | null = null
): Node {
  return {
    id,
    parentNodeId: null,
    title: id,
    content,
    reveal: null,
    reading,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createClozeReviewNode(id: string, due: string, overrides: Partial<NodeReviewProfile> = {}): Node {
  return {
    id,
    parentNodeId: null,
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

const priorityParentNode: Node = {
  id: 'priority-parent',
  parentNodeId: null,
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
    createReviewNode('fsrs-low-r', '2026-03-10T11:00:00.000Z', {
      lastReviewAt: '2026-03-09T10:00:00.000Z',
      reps: 4,
      scheduledDays: 1,
      stability: 0.3,
      state: 2
    }),
    createReviewNode('fsrs-high-r', '2026-03-07T08:00:00.000Z', {
      lastReviewAt: '2026-03-09T08:00:00.000Z',
      reps: 4,
      scheduledDays: 5,
      stability: 12,
      state: 2
    }),
    createReviewNode('fsrs-4', '2026-03-06T08:00:00.000Z', { lastReviewAt: '2026-03-02T08:00:00.000Z', reps: 2, scheduledDays: 4, stability: 4, state: 2 }),
    createReviewNode('fsrs-5', '2026-03-05T08:00:00.000Z', { lastReviewAt: '2026-03-01T08:00:00.000Z', reps: 2, scheduledDays: 5, stability: 5, state: 2 }),
    createReviewNode('fsrs-6', '2026-03-04T08:00:00.000Z', { lastReviewAt: '2026-02-28T08:00:00.000Z', reps: 2, scheduledDays: 6, stability: 6, state: 2 })
  ];
}

function createPlannerBackedReadingNodes(): Node[] {
  return [
    createReadingNode('reading-late-nextAt', '2026-03-01T08:00:00.000Z', 'reading content', createReadingProfile('2026-03-10T11:30:00.000Z')),
    createReadingNode('reading-early-nextAt', '2026-03-02T08:00:00.000Z', 'reading content', createReadingProfile('2026-03-10T09:00:00.000Z')),
    createReadingNode('reading-future', '2026-03-03T08:00:00.000Z', 'reading content', createReadingProfile('2026-03-11T09:00:00.000Z'))
  ];
}

function createPlannerBackedQueueNodes(): Node[] {
  return [priorityParentNode, ...createPlannerBackedFsrsNodes(), ...createPlannerBackedReadingNodes()];
}

it('assembles dedicated FSRS and reading queues, then mixes them at the spec 5:1 ratio', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    createReviewNode('fsrs-1', '2026-03-01T08:00:00.000Z', { reps: 4, state: 2 }),
    createReadingNode('reading-1', '2026-03-02T08:00:00.000Z'),
    createReviewNode('fsrs-2', '2026-03-02T08:00:00.000Z', { reps: 3, state: 2 }),
    createReviewNode('fsrs-3', '2026-03-03T08:00:00.000Z', { reps: 2, state: 2 }),
    createReviewNode('fsrs-4', '2026-03-04T08:00:00.000Z', { reps: 2, state: 2 }),
    createReadingNode('reading-2', '2026-03-05T08:00:00.000Z'),
    createReviewNode('fsrs-5', '2026-03-05T08:00:00.000Z', { reps: 1, state: 1 }),
    createReviewNode('fsrs-6', '2026-03-06T08:00:00.000Z', { reps: 1, state: 1 })
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.fsrsQueueNodeIds).toEqual(['fsrs-1', 'fsrs-2', 'fsrs-3', 'fsrs-4', 'fsrs-5', 'fsrs-6']);
  expect(plan.readingQueueNodeIds).toEqual(['reading-1', 'reading-2']);
  expect(plan.queueNodeIds).toEqual(['fsrs-1', 'fsrs-2', 'fsrs-3', 'fsrs-4', 'fsrs-5', 'reading-1', 'fsrs-6', 'reading-2']);
  expect(plan.fsrsCandidateCount).toBe(6);
  expect(plan.readingCandidateCount).toBe(2);
  expect(plan.overflowCount).toBe(0);
});

it('removes the legacy daily cap and keeps mixing until both queues are exhausted', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const fsrsNodes = Array.from({ length: 12 }, (_, index) =>
    createReviewNode(`fsrs-${index + 1}`, `2026-02-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`, {
      reps: 2,
      state: 2
    })
  );
  const readingNodes = Array.from({ length: 3 }, (_, index) =>
    createReadingNode(`reading-${index + 1}`, `2026-02-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`)
  );
  const nodes = [...fsrsNodes, ...readingNodes];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.queueNodeIds).toHaveLength(15);
  expect(plan.queueNodeIds).toEqual([
    'fsrs-1',
    'fsrs-2',
    'fsrs-3',
    'fsrs-4',
    'fsrs-5',
    'reading-1',
    'fsrs-6',
    'fsrs-7',
    'fsrs-8',
    'fsrs-9',
    'fsrs-10',
    'reading-2',
    'fsrs-11',
    'fsrs-12',
    'reading-3'
  ]);
  expect(plan.overflowCount).toBe(0);
});

it('keeps empty structure-only nodes out of the reading queue', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    createReviewNode('fsrs-1', '2026-03-01T08:00:00.000Z', { reps: 1, state: 1 }),
    createReadingNode('reading-1', '2026-03-02T08:00:00.000Z'),
    createReadingNode('reading-empty', '2026-03-03T08:00:00.000Z', '   ')
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.readingQueueNodeIds).toEqual(['reading-1']);
  expect(plan.queueNodeIds).toEqual(['fsrs-1', 'reading-1']);
});

it('queues cloze review nodes in the FSRS lane even when reveal is empty', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    createClozeReviewNode('cloze-1', '2026-03-01T08:00:00.000Z', { reps: 1, state: 1 }),
    createReadingNode('reading-1', '2026-03-02T08:00:00.000Z')
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.fsrsQueueNodeIds).toEqual(['cloze-1']);
  expect(plan.readingQueueNodeIds).toEqual(['reading-1']);
  expect(plan.queueNodeIds).toEqual(['cloze-1', 'reading-1']);
});

it('can build the whole queue including scheduled review items for queue inspection', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    createClozeReviewNode('cloze-scheduled', '2026-03-19T08:00:00.000Z', { reps: 10, state: 2 }),
    createReadingNode('reading-due', '2026-03-02T08:00:00.000Z')
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ includeScheduled: true, nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.fsrsQueueNodeIds).toEqual(['cloze-scheduled']);
  expect(plan.readingQueueNodeIds).toEqual(['reading-due']);
  expect(plan.queueNodeIds).toEqual(['cloze-scheduled', 'reading-due']);
});

it('replaces legacy due and createdAt ordering with inherited priority, FSRS retrievability, and reading nextAt', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = createPlannerBackedQueueNodes();
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.fsrsQueueNodeIds).toEqual([
    'fsrs-absolute',
    'fsrs-low-r',
    'fsrs-4',
    'fsrs-5',
    'fsrs-6',
    'fsrs-high-r'
  ]);
  expect(plan.readingQueueNodeIds).toEqual(['reading-early-nextAt', 'reading-late-nextAt']);
  expect(plan.queueNodeIds).toEqual([
    'fsrs-absolute',
    'fsrs-low-r',
    'fsrs-4',
    'fsrs-5',
    'fsrs-6',
    'reading-early-nextAt',
    'fsrs-high-r',
    'reading-late-nextAt'
  ]);
  expect(plan.fsrsQueueNodeIds).not.toEqual([
    'fsrs-absolute',
    'fsrs-high-r',
    'fsrs-6',
    'fsrs-5',
    'fsrs-4',
    'fsrs-low-r'
  ]);
});
