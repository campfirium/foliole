import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';

import {
  loadWorkspaceRightPanelPreference,
  saveWorkspaceRightPanelPreference
} from './workspaceRightPanelPreference';

beforeEach(() => {
  window.localStorage.clear();
});

it('persists and reloads the active right sidebar panel', () => {
  saveWorkspaceRightPanelPreference('highlights');

  expect(loadWorkspaceRightPanelPreference()).toBe('highlights');
});

it('falls back when the stored right sidebar panel is invalid', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.rightSidebarActivePanel, 'bad-panel');

  expect(loadWorkspaceRightPanelPreference('review-queue')).toBe('review-queue');
});

it('defaults to Flow for a fresh workspace', () => {
  expect(loadWorkspaceRightPanelPreference()).toBe('review-queue');
});
