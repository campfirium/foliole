import { expect, it } from 'vitest';

import { buildReviewQueuePlan } from './reviewQueuePlanner';
import { createReadingNode, createReviewNode } from './reviewQueuePlanner.test-support';

it('can place all review items before reading items for a temporary session mode', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    createReadingNode('reading-1', '2026-03-02T08:00:00.000Z'),
    createReviewNode('fsrs-1', '2026-03-01T08:00:00.000Z', { reps: 4, state: 2 }),
    createReadingNode('reading-2', '2026-03-05T08:00:00.000Z'),
    createReviewNode('fsrs-2', '2026-03-02T08:00:00.000Z', { reps: 3, state: 2 })
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ mode: 'review-first', nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.queueNodeIds).toEqual(['fsrs-1', 'fsrs-2']);
});

it('can limit a temporary session mode to reading items only', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [
    createReviewNode('fsrs-1', '2026-03-01T08:00:00.000Z', { reps: 4, state: 2 }),
    createReadingNode('reading-1', '2026-03-02T08:00:00.000Z')
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ mode: 'reading-only', nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.fsrsQueueNodeIds).toEqual(['fsrs-1']);
  expect(plan.readingQueueNodeIds).toEqual(['reading-1']);
  expect(plan.queueNodeIds).toEqual(['reading-1']);
});

it('returns an empty active queue for reading-only when no reading items are due', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const nodes = [createReviewNode('fsrs-1', '2026-03-01T08:00:00.000Z', { reps: 4, state: 2 })];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ mode: 'reading-only', nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.fsrsQueueNodeIds).toEqual(['fsrs-1']);
  expect(plan.readingQueueNodeIds).toEqual([]);
  expect(plan.queueNodeIds).toEqual([]);
});
