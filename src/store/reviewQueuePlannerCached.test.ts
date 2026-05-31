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

it('reuses queue plans when callers omit default queue options', async () => {
  const { buildReviewQueuePlan } = await import('./reviewQueuePlanner');
  vi.mocked(buildReviewQueuePlan).mockClear();
  const nodeOrder = ['node-1'];
  const nodesById = { 'node-1': { id: 'node-1' } } as never;
  const trashedNodeIds: string[] = [];

  const first = buildCachedReviewQueuePlan({ nodeOrder, nodesById, now: '2026-04-09T02:00:00.000Z', trashedNodeIds });
  const second = buildCachedReviewQueuePlan({
    includeScheduled: false,
    mode: 'recommended',
    nodeOrder,
    nodesById,
    now: '2026-04-09T02:00:00.000Z',
    trashedNodeIds
  });

  expect(second).toBe(first);
  expect(buildReviewQueuePlan).toHaveBeenCalledTimes(1);
});

it('does not reuse a queue plan when scheduled items are included', async () => {
  const { buildReviewQueuePlan } = await import('./reviewQueuePlanner');
  vi.mocked(buildReviewQueuePlan).mockClear();
  const nodeOrder = ['node-1'];
  const nodesById = { 'node-1': { id: 'node-1' } } as never;
  const trashedNodeIds: string[] = [];

  buildCachedReviewQueuePlan({ nodeOrder, nodesById, now: '2026-04-09T03:00:00.000Z', trashedNodeIds });
  buildCachedReviewQueuePlan({
    includeScheduled: true,
    nodeOrder,
    nodesById,
    now: '2026-04-09T03:00:00.000Z',
    trashedNodeIds
  });

  expect(buildReviewQueuePlan).toHaveBeenCalledTimes(2);
});

it('reuses queue plans after other queue shapes are computed', async () => {
  const { buildReviewQueuePlan } = await import('./reviewQueuePlanner');
  vi.mocked(buildReviewQueuePlan).mockClear();
  const nodeOrder = ['node-1'];
  const nodesById = { 'node-1': { id: 'node-1' } } as never;
  const trashedNodeIds: string[] = [];
  const readyArgs = { mode: 'recommended' as const, nodeOrder, nodesById, now: '2026-04-09T01:00:00.000Z', trashedNodeIds };
  const scheduledArgs = { ...readyArgs, includeScheduled: true };

  const firstReady = buildCachedReviewQueuePlan(readyArgs);
  const firstScheduled = buildCachedReviewQueuePlan(scheduledArgs);
  const secondReady = buildCachedReviewQueuePlan(readyArgs);
  const secondScheduled = buildCachedReviewQueuePlan(scheduledArgs);

  expect(secondReady).toBe(firstReady);
  expect(secondScheduled).toBe(firstScheduled);
  expect(buildReviewQueuePlan).toHaveBeenCalledTimes(2);
});
