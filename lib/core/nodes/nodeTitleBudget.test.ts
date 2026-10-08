import { expect, it } from 'vitest';

import { isNodeTitleTruncated, normalizeNodeTitle } from './nodeTitleBudget.js';

it('saves the first 100 Unicode characters without splitting a surrogate pair', () => {
  const title = '中😀'.repeat(50);
  expect(normalizeNodeTitle(title + 'tail')).toBe(title);
  expect(isNodeTitleTruncated(title)).toBe(false);
  expect(isNodeTitleTruncated(title + 'x')).toBe(true);
  expect(normalizeNodeTitle('')).toBe('');
});
