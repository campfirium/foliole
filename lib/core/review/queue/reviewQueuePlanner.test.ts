import { expect, it } from 'vitest';

import { DEFAULT_UNIFIED_PUSH_QUEUE_RULES } from '../unifiedPushQueueRules.js';

import { buildReviewQueuePlan, type ReviewQueueNode } from './reviewQueuePlanner.js';
import type { ReviewSessionMode } from './reviewQueueTypes.js';

const createdAt = new Date(2026, 9, 25, 12).toISOString();
const now = new Date(2026, 9, 26, 5).toISOString();

function item(id: string, due = createdAt): ReviewQueueNode {
  return { id, kind: 'item', parentNodeId: null, priority: 0, content: id, reveal: 'Answer', createdAt,
    review: { due, lastReviewAt: null, state: 0, stability: 0, difficulty: 0,
      elapsedDays: 0, scheduledDays: 1, reps: 0, lapses: 0 } };
}

function topic(id: string, nextAt = createdAt): ReviewQueueNode {
  return { id, kind: 'topic', parentNodeId: null, priority: 0, content: id, reveal: null, review: null,
    createdAt, reading: { intervalDurationMs: 86_400_000, intervalGrowthFactor: 1.1, lastHandledAt: createdAt,
      nextAt, priority: 0, readingPosition: 0, repetitionCount: 1, state: 'active' } };
}

function plan(nodes: ReviewQueueNode[], mode: ReviewSessionMode = 'recommended', dayStartsAt = 4) {
  return buildReviewQueuePlan({ nodeOrder: nodes.map(node => node.id),
    nodesById: Object.fromEntries(nodes.map(node => [node.id, node])), now, mode, trashedNodeIds: [],
    newDayStartsAtHour: dayStartsAt, readingDayStartsAtHour: dayStartsAt,
    pushQueueRules: DEFAULT_UNIFIED_PUSH_QUEUE_RULES });
}

it('uses the same existing queue modes with host-supplied settings', () => {
  const nodes = [...Array.from({ length: 6 }, (_, index) => item(`item-${index}`)), topic('topic-a'), topic('topic-b')];
  expect(plan(nodes).queueNodeIds).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4', 'topic-a', 'item-5']);
  expect(plan(nodes, 'review-first').queueNodeIds).toEqual([
    'item-0', 'item-1', 'item-2', 'item-3', 'item-4', 'item-5', 'topic-a'
  ]);
  expect(plan(nodes, 'reading-only').queueNodeIds).toEqual(['topic-a', 'topic-b']);
});

it('keeps learning-day settings isolated between independent host calls', () => {
  const laterToday = new Date(2026, 9, 26, 20).toISOString();
  const nodes = [item('daily', laterToday), topic('reading', laterToday)];
  expect(plan(nodes, 'reading-only', 6).readingQueueNodeIds).toEqual([]);
  expect(plan(nodes, 'reading-only', 4).readingQueueNodeIds).toEqual(['reading']);
  expect(plan(nodes, 'review-first', 4).fsrsQueueNodeIds).toEqual(['daily']);
  expect(plan(nodes, 'review-first', 6).fsrsQueueNodeIds).toEqual([]);
  expect(plan(nodes, 'reading-only', 6).readingQueueNodeIds).toEqual([]);
});

it('does not expose minute-based reviews or same-day reading before their exact due time', () => {
  const later = new Date(2026, 9, 26, 5, 10).toISOString();
  const minuteItem = item('minute-item', later);
  minuteItem.review!.scheduledDays = 0;
  const minuteTopic = topic('minute-topic', later);
  minuteTopic.reading!.lastHandledAt = now;
  expect(plan([minuteItem, minuteTopic]).queueNodeIds).toEqual([]);
  const args = { nodeOrder: ['minute-item', 'minute-topic'], nodesById: {
    'minute-item': minuteItem, 'minute-topic': minuteTopic
  }, now: later, trashedNodeIds: [], newDayStartsAtHour: 4, readingDayStartsAtHour: 4,
  pushQueueRules: DEFAULT_UNIFIED_PUSH_QUEUE_RULES };
  expect(buildReviewQueuePlan(args).fsrsQueueNodeIds).toEqual(['minute-item']);
  expect(buildReviewQueuePlan(args).readingQueueNodeIds).toEqual(['minute-topic']);
});
