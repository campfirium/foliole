import { expect, it } from 'vitest';

import { buildReviewQueuePlan } from './reviewQueuePlanner';
import {
  createReadingNode,
  createReadingProfile,
  createReviewNode
} from './reviewQueuePlanner.test-support';

it('keeps shelved topics out of reading lanes while preserving FSRS items', () => {
  const now = '2026-03-10T12:00:00.000Z';
  const shelvedSource = {
    ...createReadingNode('source', '2026-03-01T08:00:00.000Z', 'source content', createReadingProfile('2026-03-09T08:00:00.000Z')),
    shelvedAt: '2026-03-10T00:00:00.000Z'
  };
  const readingChild = {
    ...createReadingNode('reading-child', '2026-03-01T08:00:00.000Z', 'reading content', createReadingProfile('2026-03-09T08:00:00.000Z')),
    parentNodeId: 'source'
  };
  const fsrsChild = {
    ...createReviewNode('fsrs-child', '2026-03-01T08:00:00.000Z', { reps: 1, state: 1 }),
    parentNodeId: 'source'
  };
  const activeReading = createReadingNode('reading-active', '2026-03-01T08:00:00.000Z', 'reading content', createReadingProfile('2026-03-09T08:00:00.000Z'));
  const nodes = [shelvedSource, readingChild, fsrsChild, activeReading];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({ includeScheduled: true, nodeOrder, nodesById, now, trashedNodeIds: [] });

  expect(plan.readingQueueNodeIds).toEqual(['reading-active']);
  expect(plan.fsrsQueueNodeIds).toEqual(['fsrs-child']);
});
