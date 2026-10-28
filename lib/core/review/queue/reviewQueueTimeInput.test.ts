import { expect, it } from 'vitest';

import { DEFAULT_UNIFIED_PUSH_QUEUE_RULES } from '../unifiedPushQueueRules.js';

import { buildReviewQueuePlan, createReviewQueuePlanner, type ReviewQueueNode } from './reviewQueuePlanner.js';

const now = '2026-10-26T08:00:00.000Z';
const later = '2026-10-26T08:10:00.000Z';
function topic(id: string, nextAt = now): ReviewQueueNode {
  return { id, kind: 'topic', parentNodeId: null, priority: 4, createdAt: now, content: id, review: null,
    reading: { nextAt, lastHandledAt: now, intervalDurationMs: 86400000, intervalGrowthFactor: 1.1,
      state: 'active', readingPosition: 0, repetitionCount: 1, priority: 4 } };
}
function input(nodes: ReviewQueueNode[]) {
  return { nodesById: Object.fromEntries(nodes.map(node => [node.id, node])), nodeOrder: nodes.map(node => node.id),
    now, newDayStartsAtHour: 4, readingDayStartsAtHour: 4, trashedNodeIds: [], pushQueueRules: DEFAULT_UNIFIED_PUSH_QUEUE_RULES };
}
it('keeps the cutoff separate from real-now pressure and releases facts between constructions', () => {
  const nodes = [topic('ready'), topic('later', later)];
  const planner = createReviewQueuePlanner(input(nodes));
  expect(planner().readingQueueNodeIds).toEqual(['ready']);
  expect(planner({ candidateNow: later }).readingQueueNodeIds).toEqual(['ready', 'later']);
  nodes[0]!.reading!.nextAt = later;
  expect(buildReviewQueuePlan(input(nodes)).readingQueueNodeIds).toEqual([]);
});
it('does not validate excluded malformed dates and rejects eligible malformed dates', () => {
  const malformed = topic('invalid', 'bad-time');
  expect(() => buildReviewQueuePlan(input([malformed]))).toThrow();
  expect(buildReviewQueuePlan(input([{ ...malformed, deletedAt: now }])).readingQueueNodeIds).toEqual([]);
  expect(buildReviewQueuePlan(input([{ ...malformed, shelvedAt: now }])).readingQueueNodeIds).toEqual([]);
  expect(buildReviewQueuePlan(input([{ ...malformed, content: '', hasContent: false }])).readingQueueNodeIds).toEqual([]);
});
it('keeps inspection order independent from material pressure and preserves P0 encounter order', () => {
  const old = '2026-10-25T08:00:00.000Z';
  const nodes = [topic('later', later), topic('old', old), { ...topic('p0-last', later), priority: 0 },
    { ...topic('p0-first', old), priority: 0 }];
  expect(buildReviewQueuePlan({ ...input(nodes), includeScheduled: true }).readingQueueNodeIds)
    .toEqual(['p0-last', 'p0-first', 'old', 'later']);
});
