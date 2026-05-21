import { expect, it } from 'vitest';

import { disperseReadingMaterial, type ReadingMaterialDispersionEntry } from './readingMaterialDispersion';

function entry(id: string, overrides: Partial<ReadingMaterialDispersionEntry> = {}): ReadingMaterialDispersionEntry {
  return {
    dueAt: '2026-03-16T09:00:00.000Z',
    id,
    intervalDurationMs: 24 * 60 * 60 * 1000,
    pathNodeIds: ['source', id],
    ...overrides
  };
}

it('keeps higher relative overdue entries in earlier windows before path dispersion', () => {
  const entries = Array.from({ length: 60 }, (_, index) =>
    entry(`n-${String(index + 1).padStart(2, '0')}`, {
      dueAt: new Date(Date.parse('2026-03-20T09:00:00.000Z') - index * 60 * 60 * 1000).toISOString(),
      pathNodeIds: ['source', `n-${String(index + 1).padStart(2, '0')}`]
    })
  );

  const queue = disperseReadingMaterial(entries, { now: '2026-03-21T09:00:00.000Z' });
  const firstWindow = new Set(queue.slice(0, 20).map((item) => item.id));
  const secondWindow = new Set(queue.slice(20, 40).map((item) => item.id));

  expect(firstWindow.has('n-60')).toBe(true);
  expect(firstWindow.has('n-41')).toBe(true);
  expect(secondWindow.has('n-40')).toBe(true);
  expect(secondWindow.has('n-21')).toBe(true);
});

it('falls back to the initial interval when stored reading intervals are invalid', () => {
  const queue = disperseReadingMaterial(
    [
      entry('invalid-zero', { dueAt: '2026-03-20T09:00:00.000Z', intervalDurationMs: 0 }),
      entry('valid-long', { dueAt: '2026-03-19T09:00:00.000Z', intervalDurationMs: 4 * 24 * 60 * 60 * 1000 }),
      entry('invalid-negative', { dueAt: '2026-03-20T08:00:00.000Z', intervalDurationMs: -1 }),
      entry('invalid-small', { dueAt: '2026-03-20T07:00:00.000Z', intervalDurationMs: 60 * 60 * 1000 })
    ],
    { batchSize: 1, now: '2026-03-21T09:00:00.000Z', readingInitialIntervalMs: 24 * 60 * 60 * 1000 }
  );

  expect(queue.map((item) => item.id)).toEqual(['invalid-small', 'invalid-negative', 'invalid-zero', 'valid-long']);
});

it('uses dueAt then path then node id for exact relative-overdue ties', () => {
  const queue = disperseReadingMaterial(
    [
      entry('later', { dueAt: '2026-03-20T09:00:00.000Z', pathNodeIds: ['b', 'later'] }),
      entry('same-path-b', { dueAt: '2026-03-20T08:00:00.000Z', pathNodeIds: ['a', 'topic'] }),
      entry('same-path-a', { dueAt: '2026-03-20T08:00:00.000Z', pathNodeIds: ['a', 'topic'] })
    ],
    { batchSize: 1, now: '2026-03-21T09:00:00.000Z' }
  );

  expect(queue.map((item) => item.id)).toEqual(['same-path-a', 'same-path-b', 'later']);
});
