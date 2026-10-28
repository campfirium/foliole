import { expect, it } from 'vitest';

import { DEFAULT_UNIFIED_PUSH_QUEUE_RULES } from '../unifiedPushQueueRules.js';

import { buildReviewQueueDayPlan, type ReviewQueueNode } from './reviewQueuePlanner.js';

const now = '2026-10-28T08:00:00.000Z';
const dayEnd = '2026-10-28T20:00:00.000Z';
function item(id: string, lastReviewAt: string, stability: number): ReviewQueueNode {
  return { id, kind: 'item', review: { due: now, lastReviewAt, stability, difficulty: 1, elapsedDays: 1,
    scheduledDays: 0, state: 2, reps: 2, lapses: 0 }, createdAt: now, parentNodeId: null, priority: 4,
  content: id, reveal: 'Answer' };
}
it('uses actual-now retrievability even when day-end membership contains later cards', () => {
  const nodes = [item('recent-short', now, 0.1), item('older-stable', '2026-10-27T08:00:00.000Z', 5)];
  const later = item('later', now, 5);
  later.review!.due = dayEnd;
  nodes.push(later);
  const input = { nodeOrder: nodes.map(node => node.id), nodesById: Object.fromEntries(nodes.map(node => [node.id, node])),
    now, trashedNodeIds: [], newDayStartsAtHour: 4, readingDayStartsAtHour: 4,
    pushQueueRules: DEFAULT_UNIFIED_PUSH_QUEUE_RULES };
  const result = buildReviewQueueDayPlan(input, dayEnd);
  expect(result.fullDay.fsrsQueueNodeIds).toEqual(['older-stable', 'recent-short', 'later']);
  expect(result.initial.fsrsQueueNodeIds).toEqual(['older-stable', 'recent-short']);
  expect(buildReviewQueueDayPlan({ ...input, now: dayEnd }, dayEnd).fullDay.fsrsQueueNodeIds)
    .toEqual(['recent-short', 'older-stable', 'later']);
});
