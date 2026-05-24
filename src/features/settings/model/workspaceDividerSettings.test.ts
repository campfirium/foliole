import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  getWorkspaceDividerOpacityPercent,
  normalizeWorkspaceDividerOpacityPercent,
  setWorkspaceDividerOpacityPercent,
  WORKSPACE_DIVIDER_OPACITY_PERCENT_DEFAULT
} from './workspaceDividerSettings';

beforeEach(() => {
  window.localStorage.clear();
});

it('normalizes workspace divider opacity to whole percentages', () => {
  expect(normalizeWorkspaceDividerOpacityPercent(null)).toBe(WORKSPACE_DIVIDER_OPACITY_PERCENT_DEFAULT);
  expect(normalizeWorkspaceDividerOpacityPercent('')).toBe(WORKSPACE_DIVIDER_OPACITY_PERCENT_DEFAULT);
  expect(normalizeWorkspaceDividerOpacityPercent('wat')).toBe(WORKSPACE_DIVIDER_OPACITY_PERCENT_DEFAULT);
  expect(normalizeWorkspaceDividerOpacityPercent(-5)).toBe(0);
  expect(normalizeWorkspaceDividerOpacityPercent(120)).toBe(100);
  expect(normalizeWorkspaceDividerOpacityPercent('24.6')).toBe(25);
});

it('persists workspace divider opacity as a renderer setting', () => {
  expect(getWorkspaceDividerOpacityPercent()).toBe(WORKSPACE_DIVIDER_OPACITY_PERCENT_DEFAULT);
  expect(setWorkspaceDividerOpacityPercent(18)).toBe(18);
  expect(getWorkspaceDividerOpacityPercent()).toBe(18);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceDividerOpacityPercent)).toBe('18');
});
