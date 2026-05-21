import { expect, it } from 'vitest';

import { buildReviewQueuePlan } from './reviewQueuePlanner';
import { createReviewNode } from './reviewQueuePlanner.test-support';

it('keeps newly scheduled review items out of the due queue until their initial due day', () => {
  const nodes = [
    createReviewNode('future-new-item', '2026-03-12T00:00:00.000Z'),
    createReviewNode('old-review-null', '2026-03-01T08:00:00.000Z')
  ];
  nodes[1]!.review = null;
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const beforeDue = buildReviewQueuePlan({
    nodeOrder,
    nodesById,
    now: '2026-03-10T12:00:00.000Z',
    trashedNodeIds: []
  });
  const scheduled = buildReviewQueuePlan({
    includeScheduled: true,
    nodeOrder,
    nodesById,
    now: '2026-03-10T12:00:00.000Z',
    trashedNodeIds: []
  });
  const afterDue = buildReviewQueuePlan({
    nodeOrder,
    nodesById,
    now: '2026-03-12T00:00:00.000Z',
    trashedNodeIds: []
  });

  expect(beforeDue.fsrsQueueNodeIds).toEqual(['old-review-null']);
  expect(scheduled.fsrsQueueNodeIds).toEqual(['future-new-item', 'old-review-null']);
  expect(afterDue.fsrsQueueNodeIds).toEqual(['future-new-item', 'old-review-null']);
});
