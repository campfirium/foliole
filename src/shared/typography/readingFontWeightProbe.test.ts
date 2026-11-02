import { expect, it } from 'vitest';

import { adjacentReadingWeight, distinctReadingWeights, nearestReadingWeight } from './readingFontWeightProbe';

const candidates = Array.from({ length: 13 }, (_, index) => 100 + index * 50);
const pixels = (ink: number) => new Uint8ClampedArray([0, ink, 0, ink]);

it('reduces repeated regular/bold glyphs to 400 and 700 and keeps regular at the center request', () => {
  const weights = distinctReadingWeights(candidates.map((weight) => ({ weight, alpha: pixels(weight <= 500 ? 10 : 20) })));
  expect(weights).toEqual([400, 700]);
  expect(nearestReadingWeight(100, weights)).toBe(400);
  expect(adjacentReadingWeight(400, weights, 1)).toBe(700);
  expect(adjacentReadingWeight(400, weights, -1)).toBe(400);
});

it('retains every distinct 50-unit variable result and collapses a single rendered face to regular', () => {
  expect(distinctReadingWeights(candidates.map((weight) => ({ weight, alpha: pixels(weight / 10) })))).toEqual(candidates);
  expect(distinctReadingWeights(candidates.map((weight) => ({ weight, alpha: pixels(10) })))).toEqual([400]);
});

it('keeps three distinct effects and never infers equality from total ink alone', () => {
  expect(distinctReadingWeights(candidates.map((weight) => ({ weight, alpha: pixels(weight < 350 ? 10 : weight <= 500 ? 20 : 30) }))))
    .toEqual([100, 400, 700]);
  expect(distinctReadingWeights([{ weight: 400, alpha: new Uint8ClampedArray([10, 0]) },
    { weight: 450, alpha: new Uint8ClampedArray([0, 10]) }])).toEqual([400, 450]);
});
