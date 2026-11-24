import { expect, it } from 'vitest';

import { buildReviewQueuePlan } from './reviewQueuePlanner';
import { createReadingNode, createReadingProfile, createReviewNode } from './reviewQueuePlanner.test-support';

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

it('keeps a scheduled card imported at local midnight out of the previous learning day window', () => {
  const imported = createReviewNode('imported', new Date(2026, 10, 25, 0).toISOString(), { scheduledDays: 5 });
  const common = { nodeOrder: [imported.id], nodesById: { [imported.id]: imported }, trashedNodeIds: [] };
  const window = (day: number) => ({ start: new Date(2026, 10, day, 4).toISOString(), end: new Date(2026, 10, day + 1, 4).toISOString() });
  const before = buildReviewQueuePlan({ ...common, now: new Date(2026, 10, 24, 21).toISOString(), dayWindow: window(24) });
  const after = buildReviewQueuePlan({ ...common, now: new Date(2026, 10, 25, 5).toISOString(), dayWindow: window(25) });
  expect(before.fsrsQueueNodeIds).not.toContain('imported');
  expect(after.fsrsQueueNodeIds).toContain('imported');
});
