import { expect, it, vi } from 'vitest';

import { buildCachedReviewQueuePlan } from './reviewQueuePlannerCached';

vi.mock('./reviewQueuePlanner', () => ({
  buildReviewQueuePlan: vi.fn((args) => ({
    fsrsCandidateCount: 0,
    fsrsQueueNodeIds: [],
    overflowCount: 0,
    queueNodeIds: [args.now],
    readingCandidateCount: 0,
    readingQueueNodeIds: []
  }))
}));

it('reuses the last queue plan when the same inputs repeat', async () => {
  const { buildReviewQueuePlan } = await import('./reviewQueuePlanner');
  const nodeOrder = ['node-1'];
  const nodesById = { 'node-1': { id: 'node-1' } } as never;
  const trashedNodeIds: string[] = [];

  const first = buildCachedReviewQueuePlan({ nodeOrder, nodesById, now: '2026-04-09T00:00:00.000Z', trashedNodeIds });
  const second = buildCachedReviewQueuePlan({ nodeOrder, nodesById, now: '2026-04-09T00:00:00.000Z', trashedNodeIds });

  expect(second).toBe(first);
  expect(buildReviewQueuePlan).toHaveBeenCalledTimes(1);
});

it('does not reuse a queue plan when only the session mode changes', async () => {
  const { buildReviewQueuePlan } = await import('./reviewQueuePlanner');
  vi.mocked(buildReviewQueuePlan).mockClear();
  const nodeOrder = ['node-1'];
  const nodesById = { 'node-1': { id: 'node-1' } } as never;
  const trashedNodeIds: string[] = [];

  buildCachedReviewQueuePlan({ mode: 'recommended', nodeOrder, nodesById, now: '2026-04-09T00:00:00.000Z', trashedNodeIds });
  buildCachedReviewQueuePlan({ mode: 'reading-only', nodeOrder, nodesById, now: '2026-04-09T00:00:00.000Z', trashedNodeIds });

  expect(buildReviewQueuePlan).toHaveBeenCalledTimes(2);
});
