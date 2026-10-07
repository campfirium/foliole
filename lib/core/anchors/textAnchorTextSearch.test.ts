import { expect, it } from 'vitest';

import { resolveBestOriginalTextCandidate } from './textAnchorTextSearch.js';

const locator = { from: 10, to: 16, originalText: 'needle' };
const candidate = (from: number) => ({ from, to: from + 6, originalText: 'needle' });

it('uses context before distance, including a farther matching context', () => {
  const previousContent = 'left text needle right text';
  const from = previousContent.indexOf('needle');
  const nextContent = `needle other${'x'.repeat(200)}${previousContent}`;
  expect(resolveBestOriginalTextCandidate({ locator: { ...locator, from, to: from + 6 },
    originalText: 'needle', preferredIndex: 0, previousContent, nextContent }))
    .toEqual(candidate(nextContent.lastIndexOf('needle')));
});

it('keeps the first tied candidate unless the original range still hits', () => {
  expect(resolveBestOriginalTextCandidate({ locator, originalText: 'needle', preferredIndex: 8,
    previousContent: '', nextContent: 'needle..........needle' })).toEqual(candidate(0));
  expect(resolveBestOriginalTextCandidate({ locator: { ...locator, from: 16, to: 22 },
    originalText: 'needle', preferredIndex: 8, previousContent: '',
    nextContent: 'needle..........needle' })).toEqual(candidate(16));
});

it('preserves overlapping matches and missing text results', () => {
  expect(resolveBestOriginalTextCandidate({ locator: { from: 9, to: 11, originalText: 'aa' },
    originalText: 'aa', preferredIndex: 1, previousContent: '', nextContent: 'aaaa' }))
    .toEqual({ from: 1, to: 3, originalText: 'aa' });
  expect(resolveBestOriginalTextCandidate({ locator, originalText: 'needle', preferredIndex: 0,
    previousContent: '', nextContent: 'other' })).toBeNull();
});

it('handles many occurrences while preserving the nearest UTF-16 position', () => {
  const nextContent = '😀needle '.repeat(100_000);
  const preferredIndex = 40_000 * 9 + 2;
  expect(resolveBestOriginalTextCandidate({ locator, originalText: 'needle', preferredIndex,
    previousContent: '', nextContent })).toEqual(candidate(preferredIndex));
});
