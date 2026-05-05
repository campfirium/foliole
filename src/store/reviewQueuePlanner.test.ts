import { expect, it } from 'vitest';

import type { Node, NodeReviewProfile } from '../features/nodes/model/nodeTypes';

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

function createReadingNode(id: string, timestamp: string, content = 'reading content'): Node {
  return {
    id,
    parentNodeId: null,
    title: id,
    content,
    reveal: null,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
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
