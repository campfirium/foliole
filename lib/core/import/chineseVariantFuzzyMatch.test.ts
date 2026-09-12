import { expect, it } from 'vitest';

import { findChineseVariantHighlightRange } from './chineseVariantFuzzyMatch.js';
import { createContextExcerptLocator } from './contextExcerptLocator.js';

it('finds a unique traditional passage from a simplified quote despite an empty-anchor artifact', () => {
  const body = '# Article\n\n沒有人為我們定義要創造的價值，我們必須自己去發link現目標。';
  const range = findChineseVariantHighlightRange(
    createContextExcerptLocator(body),
    '没有人为我们定义要创造的价值，我们必须自己去发现目标。'
  );
  expect(range && body.slice(range.from, range.to))
    .toBe('沒有人為我們定義要創造的價值，我們必須自己去發link現目標');
});
