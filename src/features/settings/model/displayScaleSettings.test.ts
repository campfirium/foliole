import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  getAppDisplayScalePercent,
  getContentRegionScales,
  setAppDisplayScalePercent,
  setContentRegionScales
} from './displayScaleSettings';

beforeEach(() => window.localStorage.clear());

it('persists app display size in supported ten-percent steps', () => {
  expect(setAppDisplayScalePercent(137)).toBe(140);
  expect(getAppDisplayScalePercent()).toBe(140);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBe('140');
  setAppDisplayScalePercent(100);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBeNull();
});

it('normalizes persisted region scales and removes default entries', () => {
  setContentRegionScales({ 'folder-navigation': 135, 'right-sidebar:assistant': 100 });
  expect(getContentRegionScales()).toEqual({ 'folder-navigation': 140 });
});

it('ignores retired independent font settings', () => {
  window.localStorage.setItem('foliole-navigation-title-font-size', '20');
  window.localStorage.setItem('foliole-ui-font-preset', 'custom');
  expect(getAppDisplayScalePercent()).toBe(100);
  expect(getContentRegionScales()).toEqual({});
});
