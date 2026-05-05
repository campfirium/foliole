import { expect, it } from 'vitest';

import type { Node, NodeReviewProfile } from '../features/nodes/model/nodeTypes';

import { DAILY_REVIEW_QUEUE_LIMIT, buildReviewQueuePlan } from './reviewQueuePlanner';

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

it('prioritizes overdue review cards and interleaves one new card after three reviews', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    createReviewNode('new-1', now),
    createReviewNode('review-2', '2026-03-08T08:00:00.000Z', { reps: 2, state: 2, lastReviewAt: '2026-03-07T08:00:00.000Z' }),
    createReadingNode('reading-1', now),
    createReviewNode('review-3', '2026-03-09T07:00:00.000Z', { reps: 1, state: 1, lastReviewAt: '2026-03-06T07:00:00.000Z' }),
    createReviewNode('review-1', '2026-03-07T06:00:00.000Z', { reps: 5, state: 2, lastReviewAt: '2026-03-01T06:00:00.000Z' }),
    createReviewNode('review-4', '2026-03-10T09:00:00.000Z', { reps: 3, state: 2, lastReviewAt: '2026-03-08T09:00:00.000Z' }),
    createReviewNode('new-2', now)
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.queueNodeIds).toEqual(['review-1', 'review-2', 'review-3', 'new-1', 'review-4', 'new-2']);
  expect(plan.reviewCardCount).toBe(4);
  expect(plan.newCardCount).toBe(2);
  expect(plan.readingCandidateCount).toBe(1);
});

it('caps mixed daily queues and keeps new cards within the configured ratio', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const reviewNodes = Array.from({ length: 24 }, (_, index) =>
    createReviewNode(`review-${index + 1}`, `2026-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`, {
      reps: 1,
      state: 1,
      lastReviewAt: '2026-03-01T00:00:00.000Z'
    })
  );
  const newNodes = Array.from({ length: 8 }, (_, index) => createReviewNode(`new-${index + 1}`, now));
  const nodes = [...reviewNodes, ...newNodes];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.queueNodeIds).toHaveLength(DAILY_REVIEW_QUEUE_LIMIT);
  expect(plan.reviewCardCount).toBe(15);
  expect(plan.newCardCount).toBe(5);
  expect(plan.overflowCount).toBe(12);
});

it('allows all-new queues when no review debt is due', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = Array.from({ length: 6 }, (_, index) => createReviewNode(`new-${index + 1}`, now));
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.queueNodeIds).toEqual(nodeOrder);
  expect(plan.reviewCardCount).toBe(0);
  expect(plan.newCardCount).toBe(6);
  expect(plan.overflowCount).toBe(0);
});
