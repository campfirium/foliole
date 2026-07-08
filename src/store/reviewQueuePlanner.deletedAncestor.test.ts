import { expect, it } from 'vitest';

import { buildReviewQueuePlan } from './reviewQueuePlanner';
import { createReadingNode, createReadingProfile, createReviewNode } from './reviewQueuePlanner.test-support';

it('keeps reading and FSRS nodes hidden under deleted ancestors out of the queue', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const deletedParent = {
    ...createReadingNode('deleted-parent', '2026-03-01T08:00:00.000Z'),
    deletedAt: '2026-03-09T08:00:00.000Z',
    kind: 'folder' as const
  };
  const nodes = [
    deletedParent,
    {
      ...createReviewNode('hidden-fsrs', '2026-03-01T08:00:00.000Z', { reps: 1, state: 1 }),
      parentNodeId: deletedParent.id
    },
    {
      ...createReadingNode(
        'hidden-reading',
        '2026-03-01T08:00:00.000Z',
        'reading content',
        createReadingProfile('2026-03-09T08:00:00.000Z')
      ),
      parentNodeId: deletedParent.id
    },
    createReviewNode('visible-fsrs', '2026-03-01T08:00:00.000Z', { reps: 1, state: 1 })
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ includeScheduled: true, nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.fsrsQueueNodeIds).toEqual(['visible-fsrs']);
  expect(plan.readingQueueNodeIds).toEqual([]);
  expect(plan.queueNodeIds).toEqual(['visible-fsrs']);
});
