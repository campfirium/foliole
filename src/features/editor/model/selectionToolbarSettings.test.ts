import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  DEFAULT_SELECTION_TOOLBAR_SETTINGS,
  getSelectionToolbarEnabled,
  getSelectionToolbarOpacityPercent,
  normalizeSelectionToolbarOpacityPercent,
  setSelectionToolbarEnabled,
  setSelectionToolbarOpacityPercent
} from './selectionToolbarSettings';

beforeEach(() => {
  window.localStorage.clear();
});

it('defaults to showing the floating selection toolbar at full opacity', () => {
  expect(getSelectionToolbarEnabled()).toBe(true);
  expect(getSelectionToolbarOpacityPercent()).toBe(DEFAULT_SELECTION_TOOLBAR_SETTINGS.opacityPercent);
});

it('persists visibility and clamps opacity to 0 through 100 percent', () => {
  setSelectionToolbarEnabled(false);
  expect(getSelectionToolbarEnabled()).toBe(false);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionToolbarEnabled)).toBe('false');

  expect(setSelectionToolbarOpacityPercent(-5)).toBe(0);
  expect(getSelectionToolbarOpacityPercent()).toBe(0);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionToolbarOpacityPercent)).toBe('0');

  expect(setSelectionToolbarOpacityPercent(120)).toBe(100);
  expect(normalizeSelectionToolbarOpacityPercent('65.4')).toBe(65);
});
