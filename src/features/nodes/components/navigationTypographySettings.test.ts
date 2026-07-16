import { beforeEach, expect, it } from 'vitest';

import { getNavigationMetaFontSize, getNavigationTitleFontSize } from './navigationTypographySettings';
import { resolveNodeTreeRowVirtualSize, resolveNodeTreeRowWithSecondaryVirtualSize } from './nodeListRowSpacingSettings';

beforeEach(() => window.localStorage.clear());

it('uses readable defaults without changing existing default row heights', () => {
  expect(getNavigationTitleFontSize()).toBe(14);
  expect(getNavigationMetaFontSize()).toBe(12);
  expect(resolveNodeTreeRowVirtualSize(6)).toBe(32);
  expect(resolveNodeTreeRowWithSecondaryVirtualSize(6, 14, 12)).toBe(50);
});

it('grows virtual rows with large title and secondary text', () => {
  expect(resolveNodeTreeRowVirtualSize(6, 0, 20)).toBe(40);
  expect(resolveNodeTreeRowWithSecondaryVirtualSize(6, 20, 18)).toBe(66);
});
