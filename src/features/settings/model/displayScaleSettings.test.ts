import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  getAppDisplayScalePercent,
  getPanelScales,
  normalizePanelScalePercent,
  setAppDisplayScalePercent,
  setPanelScales
} from './displayScaleSettings';

beforeEach(() => window.localStorage.clear());

it('persists app display size in supported ten-percent steps', () => {
  expect(setAppDisplayScalePercent(137)).toBe(140);
  expect(getAppDisplayScalePercent()).toBe(140);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBe('140');
  setAppDisplayScalePercent(100);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent)).toBeNull();
});

it('clamps panel scale to five-percent steps and supported bounds', () => {
  expect(normalizePanelScalePercent(82)).toBe(80);
  expect(normalizePanelScalePercent(138)).toBe(140);
  expect(normalizePanelScalePercent(999)).toBe(160);
});

it('normalizes persisted panel scales in five-percent steps and ignores unknown ids', () => {
  setPanelScales({ 'folder-navigation': 135, 'right-panel:assistant': 100 });
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.contentRegionScales,
    JSON.stringify({ 'folder-navigation': 137, 'folder-content-list': 125, 'right-sidebar:assistant': 130 })
  );
  expect(getPanelScales()).toEqual({ 'folder-navigation': 135 });
});

it('ignores retired independent font settings', () => {
  window.localStorage.setItem('foliole-navigation-title-font-size', '20');
  window.localStorage.setItem('foliole-ui-font-preset', 'custom');
  expect(getAppDisplayScalePercent()).toBe(100);
  expect(getPanelScales()).toEqual({});
});
