import { expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import { DEFAULT_UNIFIED_PUSH_QUEUE_RULES } from '../features/review/model/unifiedPushQueueRules';

import { buildReviewQueuePlan } from './reviewQueuePlanner';

function createFsrsNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    parentNodeId: null,
    title: id,
    content: id,
    reveal: `${id}-answer`,
    review: {
      due: '2026-03-10T08:00:00.000Z',
      lastReviewAt: '2026-03-09T08:00:00.000Z',
      state: 2,
      stability: 2,
      difficulty: 4,
      elapsedDays: 1,
      scheduledDays: 1,
      reps: 2,
      lapses: 0
    },
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
    ...overrides
  };
}

function createReadingNode(id: string): Node {
  return {
    id,
    parentNodeId: null,
    title: id,
    content: `${id}-content`,
    reveal: null,
    reading: {
      intervalDurationMs: 86_400_000,
      intervalGrowthFactor: 1.3,
      lastHandledAt: '2026-03-09T08:00:00.000Z',
      nextAt: '2026-03-10T08:00:00.000Z',
      priority: 5,
      readingPosition: 0,
      repetitionCount: 1,
      state: 'active'
    },
    review: null,
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z'
  };
}

it('uses saved queueMixRatio when interleaving fsrs and reading queues', () => {
  const nodes = [
    createFsrsNode('fsrs-1'),
    createFsrsNode('fsrs-2'),
    createFsrsNode('fsrs-3'),
    createReadingNode('reading-1'),
    createReadingNode('reading-2')
  ];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const plan = buildReviewQueuePlan({
    nodeOrder,
    nodesById,
    now: '2026-03-10T12:00:00.000Z',
    pushQueueRules: {
      ...DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
      queueMixRatio: { reading: 1, fsrs: 1 }
    },
    trashedNodeIds: []
  });

  expect(plan.queueNodeIds).toEqual(['fsrs-1', 'reading-1', 'fsrs-2', 'reading-2', 'fsrs-3']);
});

it('routes roulette selection through the saved priorityRatio', () => {
  const nodes = [createFsrsNode('n1', { priority: 1 }), createFsrsNode('n4', { priority: 9 })];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const highBiasPlan = buildReviewQueuePlan({
    nodeOrder,
    nodesById,
    now: '2026-03-10T12:00:00.000Z',
    pushQueueRules: {
      ...DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
      priorityRatio: 5
    },
    trashedNodeIds: []
  });
  const lowBiasPlan = buildReviewQueuePlan({
    nodeOrder,
    nodesById,
    now: '2026-03-10T12:00:00.000Z',
    pushQueueRules: {
      ...DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
      priorityRatio: 3
    },
    trashedNodeIds: []
  });

  expect(highBiasPlan.fsrsQueueNodeIds).toEqual(['n1', 'n4']);
  expect(lowBiasPlan.fsrsQueueNodeIds).toEqual(['n4', 'n1']);
});

it('keeps node priority inheritance and only uses defaultPriority as the global fallback', () => {
  const parent = createFsrsNode('parent', { priority: 2, reveal: null, review: null, content: 'parent' });
  const child = createFsrsNode('n1', { parentNodeId: parent.id });
  const fallbackNode = createFsrsNode('n4');
  const nodes = [parent, child, fallbackNode];
  const nodeOrder = nodes.map((node) => node.id);
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

  const defaultLowPlan = buildReviewQueuePlan({
    nodeOrder,
    nodesById,
    now: '2026-03-10T12:00:00.000Z',
    pushQueueRules: {
      ...DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
      defaultPriority: 1,
      priorityRatio: 9
    },
    trashedNodeIds: []
  });
  const defaultHighPlan = buildReviewQueuePlan({
    nodeOrder,
    nodesById,
    now: '2026-03-10T12:00:00.000Z',
    pushQueueRules: {
      ...DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
      defaultPriority: 9,
      priorityRatio: 9
    },
    trashedNodeIds: []
  });

  expect(defaultLowPlan.fsrsQueueNodeIds).toEqual(['n4', 'n1']);
  expect(defaultHighPlan.fsrsQueueNodeIds).toEqual(['n1', 'n4']);
});
