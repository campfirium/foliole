import { expect, it } from 'vitest';

import { disperseOrderedMaterial, disperseReadingMaterial } from './readingMaterialDispersion';

function materials(counts: readonly number[]) {
  return counts.flatMap((count, source) => Array.from({ length: count }, (_, index) => ({
    id: `${source}-${index}`,
    pathNodeIds: [`source-${source}`, `${source}-${index}`],
    dueAt: '2026-03-16T09:00:00.000Z',
    intervalDurationMs: 86400000
  })));
}

function longestRun(values: readonly string[]) {
  let longest = 0;
  let run = 0;
  values.forEach((value, index) => {
    run = index > 0 && value === values[index - 1] ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return longest;
}

for (const kind of ['reading', 'fsrs'] as const) {
  const disperse = (entries: ReturnType<typeof materials>) => kind === 'fsrs'
    ? disperseOrderedMaterial(entries)
    : disperseReadingMaterial(entries, { now: '2026-03-20T09:00:00.000Z' });

  it(`${kind} spreads unequal sources across the complete daily candidate set`, () => {
    const entries = materials([10, 5, 4, 3]);
    const queue = disperse(entries);
    expect(queue.map(item => item.id).sort()).toEqual(entries.map(item => item.id).sort());
    expect(longestRun(queue.map(item => item.pathNodeIds[0]!))).toBe(1);
    for (const source of ['source-0', 'source-1', 'source-2', 'source-3']) {
      expect(queue.filter(item => item.pathNodeIds[0] === source).map(item => item.id))
        .toEqual(entries.filter(item => item.pathNodeIds[0] === source).map(item => item.id));
    }
    expect(disperse(entries)).toEqual(queue);
  });

  it(`${kind} distributes scarce sources instead of consuming them at the start`, () => {
    const queue = disperse(materials([10, 1, 1]));
    expect(longestRun(queue.map(item => item.pathNodeIds[0]!))).toBeLessThanOrEqual(4);
  });

  it(`${kind} interleaves categories, books and sibling clozes recursively`, () => {
    const entries = materials([3, 3, 3, 3]).map(item => {
      const source = Number(item.id.split('-')[0]);
      return { ...item, pathNodeIds: [`category-${Math.floor(source / 2)}`, `book-${source}`, 'summary', item.id] };
    });
    const queue = disperse(entries);
    expect(longestRun(queue.map(item => item.pathNodeIds[0]!))).toBe(1);
    for (const category of ['category-0', 'category-1']) {
      const books = queue.filter(item => item.pathNodeIds[0] === category).map(item => item.pathNodeIds[1]!);
      expect(longestRun(books)).toBe(1);
    }
    expect(new Set(queue.map(item => item.id)).size).toBe(entries.length);
  });
}

it('keeps empty, single-source, missing-path and ancestor-as-material inputs intact', () => {
  expect(disperseOrderedMaterial([])).toEqual([]);
  const entries = [{ id: 'parent', pathNodeIds: ['root', 'parent'] },
    { id: 'child', pathNodeIds: ['root', 'parent', 'child'] }, { id: 'unknown' }];
  expect(disperseOrderedMaterial(entries).map(item => item.id).sort()).toEqual(['child', 'parent', 'unknown']);
  expect(disperseOrderedMaterial(materials([4]))).toEqual(materials([4]));
});

it('avoids preventable same-source adjacency across unequal four-source populations', () => {
  for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) {
    for (let c = 1; c <= 5; c++) for (let d = 1; d <= 5; d++) {
      const counts = [a, b, c, d];
      const entries = materials(counts);
      const queue = disperseOrderedMaterial(entries);
      const adjacent = queue.filter((item, index) => index > 0
        && item.pathNodeIds[0] === queue[index - 1]!.pathNodeIds[0]).length;
      const unavoidable = Math.max(0, 2 * Math.max(...counts) - entries.length - 1);
      expect(adjacent, `source counts ${counts.join('/')}`).toBe(unavoidable);
      expect(new Set(queue.map(item => item.id)).size).toBe(entries.length);
    }
  }
});
