import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { DEFAULT_NAVIGATION_META_FONT_SIZE, DEFAULT_NAVIGATION_TITLE_FONT_SIZE, getNavigationMetaFontSize, getNavigationTitleFontSize, setNavigationMetaFontSize, setNavigationTitleFontSize } from './navigationTypographySettings';
import { resolveNodeTreeRowVirtualSize, resolveNodeTreeRowWithSecondaryVirtualSize } from './nodeListRowSpacingSettings';

beforeEach(() => window.localStorage.clear());

it('uses readable defaults without changing existing default row heights', () => {
  expect(getNavigationTitleFontSize()).toBe(14);
  expect(getNavigationMetaFontSize()).toBe(12);
  expect(resolveNodeTreeRowVirtualSize(6)).toBe(32);
  expect(resolveNodeTreeRowWithSecondaryVirtualSize(6, 14, 12)).toBe(50);
});

it('persists non-default sizes, clamps boundaries, and removes default overrides', () => {
  expect(setNavigationTitleFontSize(99)).toBe(20);
  expect(setNavigationMetaFontSize(4)).toBe(10);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.navigationTitleFontSize)).toBe('20');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.navigationMetaFontSize)).toBe('10');
  setNavigationTitleFontSize(DEFAULT_NAVIGATION_TITLE_FONT_SIZE);
  setNavigationMetaFontSize(DEFAULT_NAVIGATION_META_FONT_SIZE);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.navigationTitleFontSize)).toBeNull();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.navigationMetaFontSize)).toBeNull();
});

it('grows virtual rows with large title and secondary text', () => {
  expect(resolveNodeTreeRowVirtualSize(6, 0, 20)).toBe(40);
  expect(resolveNodeTreeRowWithSecondaryVirtualSize(6, 20, 18)).toBe(66);
});
