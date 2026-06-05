import { expect, it } from 'vitest';

import { buildReviewQueuePlan } from './reviewQueuePlanner';
import { createReadingNode, createReadingProfile } from './reviewQueuePlanner.test-support';

it('queues cross-day reading items from the learning day start but keeps same-day short intervals locked', () => {
  const lastNight = new Date(2026, 2, 9, 21).toISOString();
  const nodes = [
    createReadingNode('cross-day', lastNight, 'reading content', createReadingProfile(
      new Date(2026, 2, 10, 21).toISOString(),
      { lastHandledAt: lastNight }
    )),
    createReadingNode('same-day-later', new Date(2026, 2, 10, 8).toISOString(), 'reading content', createReadingProfile(
      new Date(2026, 2, 10, 10).toISOString(),
      { lastHandledAt: new Date(2026, 2, 10, 8).toISOString() }
    ))
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({
    nodeOrder,
    nodesById,
    now: new Date(2026, 2, 10, 5).toISOString(),
    trashedNodeIds: []
  });

  expect(plan.readingQueueNodeIds).toEqual(['cross-day']);
});
