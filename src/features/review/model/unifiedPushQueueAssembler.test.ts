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

it('lets material pressure use dueAt while reading buckets keep nextAt for raw ordering', () => {
  const queue = assembleReadingPushQueue(
    [
      {
        dueAt: '2026-03-16T04:00:00.000Z',
        id: 'cross-day',
        intervalDurationMs: 24 * 60 * 60 * 1000,
        priority: 4,
        nextAt: '2026-03-16T21:00:00.000Z'
      },
      {
        dueAt: '2026-03-16T09:00:00.000Z',
        id: 'same-day',
        intervalDurationMs: 24 * 60 * 60 * 1000,
        priority: 4,
        nextAt: '2026-03-16T09:00:00.000Z'
      }
    ],
    { materialDispersion: { now: '2026-03-16T12:00:00.000Z' } }
  );

  expect(queue.map((item) => item.id)).toEqual(['cross-day', 'same-day']);
});

it('preserves urgency order when all reading materials share one source', () => {
  const queue = assembleReadingPushQueue(
    Array.from({ length: 12 }, (_, index) => ({
      dueAt: '2026-03-16T09:00:00.000Z',
      id: `a-${String(index + 1).padStart(2, '0')}`,
      intervalDurationMs: 24 * 60 * 60 * 1000,
      priority: 4 as const,
      nextAt: '2026-03-16T09:00:00.000Z',
      pathNodeIds: ['source-a', `a-${String(index + 1).padStart(2, '0')}`]
    })),
    { materialDispersion: { now: '2026-03-18T09:00:00.000Z' } }
  );

  expect(queue.map((item) => item.id)).toEqual(Array.from({ length: 12 }, (_, index) => `a-${String(index + 1).padStart(2, '0')}`));
});

it('places a small source throughout a large-source queue instead of consuming it at the start', () => {
  const entries = [
    ...Array.from({ length: 19 }, (_, index) => ({
      dueAt: '2026-03-16T09:00:00.000Z',
      id: `a-${String(index + 1).padStart(2, '0')}`,
      intervalDurationMs: 24 * 60 * 60 * 1000,
      priority: 4 as const,
      nextAt: '2026-03-16T09:00:00.000Z',
      pathNodeIds: ['source-a', `a-${String(index + 1).padStart(2, '0')}`]
    })),
    {
      dueAt: '2026-03-16T09:00:00.000Z',
      id: 'b-01',
      intervalDurationMs: 24 * 60 * 60 * 1000,
      priority: 4 as const,
      nextAt: '2026-03-16T09:00:00.000Z',
      pathNodeIds: ['source-b', 'b-01']
    }
  ] satisfies Parameters<typeof assembleReadingPushQueue>[0];
  const queue = assembleReadingPushQueue(entries, { materialDispersion: { now: '2026-03-18T09:00:00.000Z' } });

  const position = queue.findIndex(item => item.id === 'b-01');
  expect(Math.abs(position - (queue.length - position - 1))).toBeLessThanOrEqual(1);
  expect(queue.filter(item => item.id !== 'b-01').map(item => item.id)).toEqual(entries.slice(0, 19).map(item => item.id));
});

it('does not disperse material across reading priority buckets', () => {
  const queue = assembleReadingPushQueue(
    [
      { dueAt: '2026-03-16T09:00:00.000Z', id: 'p1-a-1', intervalDurationMs: 86400000, priority: 1, nextAt: '2026-03-16T09:00:00.000Z', pathNodeIds: ['a', '1'] },
      { dueAt: '2026-03-16T09:00:00.000Z', id: 'p9-a-1', intervalDurationMs: 86400000, priority: 9, nextAt: '2026-03-16T09:00:00.000Z', pathNodeIds: ['a', '2'] },
      { dueAt: '2026-03-16T09:00:00.000Z', id: 'p1-a-2', intervalDurationMs: 86400000, priority: 1, nextAt: '2026-03-16T09:00:00.000Z', pathNodeIds: ['a', '3'] },
      { dueAt: '2026-03-16T09:00:00.000Z', id: 'p9-a-2', intervalDurationMs: 86400000, priority: 9, nextAt: '2026-03-16T09:00:00.000Z', pathNodeIds: ['a', '4'] },
      { dueAt: '2026-03-16T09:00:00.000Z', id: 'p1-a-3', intervalDurationMs: 86400000, priority: 1, nextAt: '2026-03-16T09:00:00.000Z', pathNodeIds: ['a', '5'] }
    ],
    { materialDispersion: { now: '2026-03-18T09:00:00.000Z' }, random: () => 0 }
  );

  expect(queue.map((item) => item.id)).toEqual(['p1-a-1', 'p1-a-2', 'p1-a-3', 'p9-a-1', 'p9-a-2']);
});

it('keeps two same-source reading materials in their urgency order', () => {
  const queue = assembleReadingPushQueue(
    [
      { dueAt: '2026-03-16T09:00:00.000Z', id: 'a-1', intervalDurationMs: 86400000, priority: 4, nextAt: '2026-03-16T09:00:00.000Z', pathNodeIds: ['source-a', 'a-1'] },
      { dueAt: '2026-03-16T09:00:00.000Z', id: 'a-2', intervalDurationMs: 86400000, priority: 4, nextAt: '2026-03-16T09:00:00.000Z', pathNodeIds: ['source-a', 'a-2'] }
    ],
    { materialDispersion: { now: '2026-03-18T09:00:00.000Z' } }
  );

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

it('disperses FSRS material inside an ordered regular priority bucket', () => {
  const entries = [
    ...Array.from({ length: 19 }, (_, index) => ({
      id: `a-${String(index + 1).padStart(2, '0')}`,
      pathNodeIds: ['source-a', `a-${String(index + 1).padStart(2, '0')}`],
      priority: 4 as const,
      retrievability: 0.01 + index / 100
    })),
    {
      id: 'b-01',
      pathNodeIds: ['source-b', 'b-01'],
      priority: 4 as const,
      retrievability: 0.99
    }
  ];

  const queue = assembleFsrsPushQueue(entries, { materialDispersion: {} });

  const position = queue.findIndex(item => item.id === 'b-01');
  expect(Math.abs(position - (queue.length - position - 1))).toBeLessThanOrEqual(1);
  expect(queue.filter(item => item.id !== 'b-01').map(item => item.id)).toEqual(entries.slice(0, 19).map(item => item.id));
});

it('keeps absolute FSRS priority cards ahead of dispersed regular buckets', () => {
  const queue = assembleFsrsPushQueue(
    [
      { id: 'regular-a-1', pathNodeIds: ['a', '1'], priority: 4, retrievability: 0.1 },
      { id: 'absolute', pathNodeIds: ['absolute'], priority: 0, retrievability: 0.9 },
      { id: 'regular-b-1', pathNodeIds: ['b', '1'], priority: 4, retrievability: 0.2 }
    ],
    { materialDispersion: {} }
  );

  expect(queue.map((item) => item.id)).toEqual(['absolute', 'regular-a-1', 'regular-b-1']);
});

it('does not disperse FSRS material across regular priority buckets', () => {
  const queue = assembleFsrsPushQueue(
    [
      { id: 'p1-a-1', pathNodeIds: ['a', '1'], priority: 1, retrievability: 0.1 },
      { id: 'p9-b-1', pathNodeIds: ['b', '1'], priority: 9, retrievability: 0.1 },
      { id: 'p1-a-2', pathNodeIds: ['a', '2'], priority: 1, retrievability: 0.2 },
      { id: 'p9-b-2', pathNodeIds: ['b', '2'], priority: 9, retrievability: 0.2 }
    ],
    { materialDispersion: {}, random: () => 0 }
  );

  expect(queue.map((item) => item.id)).toEqual(['p1-a-1', 'p1-a-2', 'p9-b-1', 'p9-b-2']);
});
