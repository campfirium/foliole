import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';

import {
  createInitialWorkspaceState,
  DOCUMENT_WIDTH_DEFAULT,
  LIST_WIDTH_DEFAULT,
  RIGHT_SIDEBAR_WIDTH_DEFAULT,
  useWorkspaceStore
} from './workspaceStore';

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
});

it('updates layout widths and resets to defaults', () => {
  useWorkspaceStore.getState().setListWidth(1200);
  useWorkspaceStore.getState().setDocumentMaxWidth(2400);
  useWorkspaceStore.getState().setRightSidebarWidth(420);
  useWorkspaceStore.getState().setListCollapsed(true);
  useWorkspaceStore.getState().setRightSidebarCollapsed(true);

  expect(useWorkspaceStore.getState().layout.listWidth).toBe(1200);
  expect(useWorkspaceStore.getState().layout.documentMaxWidth).toBe(2400);
  expect(useWorkspaceStore.getState().layout.rightSidebarWidth).toBe(420);
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(true);

  useWorkspaceStore.getState().resetLayout();
  expect(useWorkspaceStore.getState().layout.listWidth).toBe(LIST_WIDTH_DEFAULT);
  expect(useWorkspaceStore.getState().layout.documentMaxWidth).toBe(DOCUMENT_WIDTH_DEFAULT);
  expect(useWorkspaceStore.getState().layout.rightSidebarWidth).toBe(RIGHT_SIDEBAR_WIDTH_DEFAULT);
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(false);
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);
});

it('hydrates sidebar collapsed flags from persisted app settings', () => {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.listCollapsed, 'true');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.rightSidebarCollapsed, 'true');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.listWidth, '512');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.documentWidth, '1024');
  localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.rightSidebarWidth, '448');

  const initial = createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z'));

  expect(initial.layout.isListCollapsed).toBe(true);
  expect(initial.layout.isRightSidebarCollapsed).toBe(true);
  expect(initial.layout.listWidth).toBe(512);
  expect(initial.layout.documentMaxWidth).toBe(1024);
  expect(initial.layout.rightSidebarWidth).toBe(448);
});
