import { expect, it } from 'vitest';

import {
  advanceReadingScheduleCoreFields,
  buildReadingScheduleCoreFields,
  DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
  buildQueueMixCycle,
  compareReadingNextAtAscending,
  getPriorityWeight,
  getReadingIntervalGrowthFactor,
  isAbsolutePushQueuePriority,
  normalizePushQueuePriority,
  normalizeRegularPushQueuePriority,
  resolveInheritedPushQueuePriority,
  resolveInheritedRegularPushQueuePriority,
  resolveNextReadingIntervalDurationMs,
  normalizeUnifiedPushQueueRules,
  resolveReadingNextAt
} from './unifiedPushQueueRules';

it('freezes the spec defaults for unified push queue rules', () => {
  expect(DEFAULT_UNIFIED_PUSH_QUEUE_RULES).toEqual({
    defaultPriority: 5,
    priorityRatio: 5,
    queueMixRatio: { reading: 1, fsrs: 5 },
    readingInitialIntervalMs: 86_400_000,
    readingIntervalGrowthFactorRange: { min: 1.1, max: 1.5 }
  });
});

it('normalizes push priority into the frozen 0~9 contract', () => {
  expect(normalizePushQueuePriority(-4)).toBe(0);
  expect(normalizePushQueuePriority(0)).toBe(0);
  expect(normalizePushQueuePriority(3.2)).toBe(3);
  expect(normalizePushQueuePriority(8.6)).toBe(9);
  expect(normalizePushQueuePriority(99)).toBe(9);
  expect(normalizePushQueuePriority(undefined)).toBe(5);
  expect(normalizeRegularPushQueuePriority(0)).toBe(5);
});

it('maps every regular priority to the spec growth factor table', () => {
  const priorities = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

  expect(priorities.map((priority) => getReadingIntervalGrowthFactor(priority))).toEqual([
    1.1,
    1.15,
    1.2,
    1.25,
    1.3,
    1.35,
    1.4,
    1.45,
    1.5
  ]);
});

it('inherits reading priority from the closest configured ancestor before building schedule fields', () => {
  expect(resolveInheritedPushQueuePriority([undefined, null, 2, 8])).toBe(2);
  expect(resolveInheritedRegularPushQueuePriority([0, 3])).toBe(5);

  expect(
    buildReadingScheduleCoreFields({
      intervalDurationMs: 90 * 60 * 1000,
      lastHandledAt: '2026-03-16T09:15:30.000Z',
      priorityChain: [undefined, 2, 8],
      repetitionCount: 4
    })
  ).toEqual({
    intervalDurationMs: 90 * 60 * 1000,
    intervalGrowthFactor: 1.15,
    lastHandledAt: '2026-03-16T09:15:30.000Z',
    nextAt: '2026-03-16T10:45:30.000Z',
    priority: 2,
    repetitionCount: 4
  });
});

it('preserves absolute reading priority inheritance while still using exact timestamp scheduling', () => {
  expect(
    buildReadingScheduleCoreFields({
      intervalDurationMs: 45 * 60 * 1000,
      lastHandledAt: '2026-03-16T09:15:30.000Z',
      priorityChain: [0, 3],
      repetitionCount: 1
    })
  ).toEqual({
    intervalDurationMs: 45 * 60 * 1000,
    intervalGrowthFactor: 1.1,
    lastHandledAt: '2026-03-16T09:15:30.000Z',
    nextAt: '2026-03-16T10:00:30.000Z',
    priority: 0,
    repetitionCount: 1
  });
});

it('keeps priorityRatio semantics as the P1:P9 weight multiple', () => {
  const p1Weight = getPriorityWeight(1);
  const p9Weight = getPriorityWeight(9);

  expect(p1Weight / p9Weight).toBeCloseTo(5, 10);
  expect(isAbsolutePushQueuePriority(0)).toBe(true);
  expect(isAbsolutePushQueuePriority(5)).toBe(false);
});

it('locks queueMixRatio to one reading card per five fsrs cards by default', () => {
  expect(buildQueueMixCycle()).toEqual(['fsrs', 'fsrs', 'fsrs', 'fsrs', 'fsrs', 'reading']);
});

it('keeps reading nextAt on exact timestamps instead of day buckets', () => {
  const lastHandledAt = '2026-03-16T09:15:30.000Z';
  const nextAt = resolveReadingNextAt(lastHandledAt, 90 * 60 * 1000);

  expect(nextAt).toBe('2026-03-16T10:45:30.000Z');
});

it('advances reading intervals from initial interval through inherited priority growth', () => {
  expect(resolveNextReadingIntervalDurationMs({ repetitionCount: 0, priorityChain: [undefined, 3] })).toBe(
    86_400_000
  );
  expect(
    advanceReadingScheduleCoreFields({
      lastHandledAt: '2026-03-16T09:15:30.000Z',
      previousIntervalDurationMs: 86_400_000,
      previousRepetitionCount: 1,
      priorityChain: [undefined, 3]
    })
  ).toEqual({
    intervalDurationMs: 103_680_000,
    intervalGrowthFactor: 1.2,
    lastHandledAt: '2026-03-16T09:15:30.000Z',
    nextAt: '2026-03-17T14:03:30.000Z',
    priority: 3,
    repetitionCount: 2
  });
});

it('sorts same-day reading queue candidates by exact nextAt timestamps instead of priority', () => {
  const queue = [
    { nextAt: '2026-03-16T15:00:00.000Z', priority: 1 },
    { nextAt: '2026-03-16T09:30:00.000Z', priority: 9 },
    { nextAt: '2026-03-16T09:00:00.000Z', priority: 5 }
  ];

  queue.sort(compareReadingNextAtAscending);

  expect(queue.map((item) => item.nextAt)).toEqual([
    '2026-03-16T09:00:00.000Z',
    '2026-03-16T09:30:00.000Z',
    '2026-03-16T15:00:00.000Z'
  ]);
  expect(queue.map((item) => item.priority)).toEqual([5, 9, 1]);
});

it('normalizes partial rule payloads back onto the frozen defaults', () => {
  expect(
    normalizeUnifiedPushQueueRules({
      defaultPriority: 0,
      priorityRatio: 7,
      queueMixRatio: { reading: 2, fsrs: 4 },
      readingIntervalGrowthFactorRange: { min: 1.12, max: 1.48 }
    })
  ).toEqual({
    defaultPriority: 5,
    priorityRatio: 7,
    queueMixRatio: { reading: 2, fsrs: 4 },
    readingInitialIntervalMs: 86_400_000,
    readingIntervalGrowthFactorRange: { min: 1.12, max: 1.48 }
  });
});
