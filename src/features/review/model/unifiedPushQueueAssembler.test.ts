import { expect, it } from 'vitest';

import {
  assembleFsrsPushQueue,
  assembleReadingPushQueue,
  compareFsrsForgettingDescending,
  selectRouletteBucketPriority,
  type RegularPriorityBuckets
} from './unifiedPushQueueAssembler';

function createRegularPriorityBuckets<T>(overrides: Partial<RegularPriorityBuckets<T>> = {}): RegularPriorityBuckets<T> {
  return {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
    8: [],
    9: [],
    ...overrides
  };
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

it('sorts FSRS bucket cards by descending 1-R before roulette assembly', () => {
  const queue = assembleFsrsPushQueue([
    { id: 'fsrs-1', priority: 3, retrievability: 0.8 },
    { id: 'fsrs-2', priority: 3, retrievability: 0.2 },
    { id: 'fsrs-3', priority: 3, retrievability: 0.5 }
  ]);

  expect([...queue].sort(compareFsrsForgettingDescending).map((item) => item.id)).toEqual(['fsrs-2', 'fsrs-3', 'fsrs-1']);
  expect(queue.map((item) => item.id)).toEqual(['fsrs-2', 'fsrs-3', 'fsrs-1']);
});

it('sorts reading bucket cards by nextAt before roulette assembly', () => {
  const queue = assembleReadingPushQueue([
    { id: 'reading-1', priority: 4, nextAt: '2026-03-16T15:00:00.000Z' },
    { id: 'reading-2', priority: 4, nextAt: '2026-03-16T09:00:00.000Z' },
    { id: 'reading-3', priority: 4, nextAt: '2026-03-16T12:00:00.000Z' }
  ]);

  expect(queue.map((item) => item.id)).toEqual(['reading-2', 'reading-3', 'reading-1']);
});

it('keeps reading nextAt order when source interleaving metadata is absent', () => {
  const queue = assembleReadingPushQueue([
    { id: 'reading-1', priority: 4, nextAt: '2026-03-16T15:00:00.000Z' },
    { id: 'reading-2', priority: 4, nextAt: '2026-03-16T09:00:00.000Z' },
    { id: 'reading-3', priority: 4, nextAt: '2026-03-16T12:00:00.000Z' }
  ]);

  expect(queue.map((item) => item.id)).toEqual(['reading-2', 'reading-3', 'reading-1']);
});

it('uses coprime stride ordering inside a single reading source group', () => {
  const queue = assembleReadingPushQueue(
    Array.from({ length: 12 }, (_, index) => ({
      id: `a-${index + 1}`,
      priority: 4,
      nextAt: '2026-03-16T09:00:00.000Z',
      sourceId: 'source-a',
      sourceOrder: index
    }))
  );

  expect(queue.map((item) => item.id)).toEqual(['a-1', 'a-8', 'a-3', 'a-10', 'a-5', 'a-12', 'a-7', 'a-2', 'a-9', 'a-4', 'a-11', 'a-6']);
});

it('interleaves multiple reading source groups after each group is stride ordered', () => {
  const queue = assembleReadingPushQueue([
    { id: 'a-1', priority: 4, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-a', sourceOrder: 0 },
    { id: 'a-2', priority: 4, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-a', sourceOrder: 1 },
    { id: 'a-3', priority: 4, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-a', sourceOrder: 2 },
    { id: 'b-1', priority: 4, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-b', sourceOrder: 3 },
    { id: 'b-2', priority: 4, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-b', sourceOrder: 4 },
    { id: 'b-3', priority: 4, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-b', sourceOrder: 5 }
  ]);

  expect(queue.map((item) => item.id)).toEqual(['a-1', 'b-1', 'a-3', 'b-3', 'a-2', 'b-2']);
});

it('does not source-interleave across reading priority buckets', () => {
  const queue = assembleReadingPushQueue(
    [
      { id: 'p1-a-1', priority: 1, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-a', sourceOrder: 0 },
      { id: 'p9-a-1', priority: 9, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-a', sourceOrder: 1 },
      { id: 'p1-a-2', priority: 1, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-a', sourceOrder: 2 },
      { id: 'p9-a-2', priority: 9, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-a', sourceOrder: 3 },
      { id: 'p1-a-3', priority: 1, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-a', sourceOrder: 4 }
    ],
    { random: () => 0 }
  );

  expect(queue.map((item) => item.id)).toEqual(['p1-a-1', 'p1-a-3', 'p1-a-2', 'p9-a-1', 'p9-a-2']);
});

it('keeps one or two reading source entries in source order', () => {
  const queue = assembleReadingPushQueue([
    { id: 'a-1', priority: 4, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-a', sourceOrder: 0 },
    { id: 'a-2', priority: 4, nextAt: '2026-03-16T09:00:00.000Z', sourceId: 'source-a', sourceOrder: 1 }
  ]);

  expect(queue.map((item) => item.id)).toEqual(['a-1', 'a-2']);
});

it('treats the P1/P9 weight ratio as the roulette probability ratio', () => {
  const buckets = createRegularPriorityBuckets({ 1: ['p1'], 9: ['p9'] });

  expect(selectRouletteBucketPriority(buckets, { random: () => 0.8333 })).toBe(1);
  expect(selectRouletteBucketPriority(buckets, { random: () => 0.8334 })).toBe(9);
});

it('keeps the default P1 vs P9 roulette draw close to 5:1 when only those buckets remain', () => {
  const buckets = createRegularPriorityBuckets({ 1: ['p1'], 9: ['p9'] });
  const random = createSeededRandom(40);
  let p1Count = 0;
  let p9Count = 0;

  for (let index = 0; index < 60_000; index += 1) {
    const selectedPriority = selectRouletteBucketPriority(buckets, { random });
    if (selectedPriority === 1) {
      p1Count += 1;
      continue;
    }
    if (selectedPriority === 9) {
      p9Count += 1;
    }
  }

  expect(p1Count / p9Count).toBeGreaterThan(4.8);
  expect(p1Count / p9Count).toBeLessThan(5.2);
});

it('skips empty buckets during roulette selection', () => {
  const buckets = createRegularPriorityBuckets({ 1: [], 4: ['p4'], 9: [] });

  expect(selectRouletteBucketPriority(buckets, { random: () => 0.99 })).toBe(4);
});

it('places absolute priority cards before regular buckets', () => {
  const queue = assembleReadingPushQueue(
    [
      { id: 'absolute-1', priority: 0, nextAt: '2026-03-16T18:00:00.000Z' },
      { id: 'regular-1', priority: 1, nextAt: '2026-03-16T08:00:00.000Z' },
      { id: 'absolute-2', priority: 0, nextAt: '2026-03-16T07:00:00.000Z', sourceId: 'absolute-source', sourceOrder: 0 },
      { id: 'regular-9', priority: 9, nextAt: '2026-03-16T06:00:00.000Z' }
    ],
    { random: () => 0.1 }
  );

  expect(queue.map((item) => item.id)).toEqual(['absolute-1', 'absolute-2', 'regular-1', 'regular-9']);
});
