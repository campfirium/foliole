import { beforeEach, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  DEFAULT_WORKSPACE_RAIL_ITEMS,
  getWorkspaceRailSectionItems,
  loadWorkspaceRailItems,
  moveWorkspaceRailItem,
  normalizeWorkspaceRailItems,
  removeWorkspaceRailItem,
  resetWorkspaceRailItems,
  saveWorkspaceRailItems,
  addWorkspaceRailItem,
  toggleWorkspaceRailItemVisibility,
  type WorkspaceRailItemConfig
} from './workspaceRailSettings';

beforeEach(() => {
  window.localStorage.clear();
});

function itemIds(items: WorkspaceRailItemConfig[]) {
  return items.map((item) => item.id);
}

it('normalizes top, bottom, and fixed rail sections independently', () => {
  const normalized = normalizeWorkspaceRailItems([
    {
      id: 'user.command',
      commandId: APP_COMMAND_IDS.goToNode,
      section: 'bottom',
      order: -5,
      visible: true,
      source: 'user'
    },
    ...DEFAULT_WORKSPACE_RAIL_ITEMS.map((item) => ({ ...item, order: item.order + 10 }))
  ]);

  expect(itemIds(getWorkspaceRailSectionItems(normalized, 'top'))).toEqual([
    'system.import-file',
    'system.import-clipboard',
    'system.import-management'
  ]);
  expect(itemIds(getWorkspaceRailSectionItems(normalized, 'bottom'))).toEqual(['user.command']);
  expect(itemIds(getWorkspaceRailSectionItems(normalized, 'fixed'))).toEqual(['fixed.review', 'fixed.settings']);
});

it('keeps locked fixed items visible and in the fixed section', () => {
  const normalized = normalizeWorkspaceRailItems([
    {
      id: 'fixed.settings',
      commandId: APP_COMMAND_IDS.openSettings,
      section: 'top',
      order: 0,
      visible: false,
      source: 'system',
      locked: true
    }
  ]);

  const settings = normalized.find((item) => item.id === 'fixed.settings');
  expect(settings).toMatchObject({
    section: 'fixed',
    visible: true,
    locked: true
  });

  const toggled = toggleWorkspaceRailItemVisibility(normalized, 'fixed.settings', false);
  expect(toggled.find((item) => item.id === 'fixed.settings')?.visible).toBe(true);

  const moved = moveWorkspaceRailItem(normalized, 'fixed.settings', 'top', 0);
  expect(moved.find((item) => item.id === 'fixed.settings')?.section).toBe('fixed');
});

it('hides system items instead of removing them', () => {
  const nextItems = removeWorkspaceRailItem(DEFAULT_WORKSPACE_RAIL_ITEMS, 'system.import-management');
  const importManagement = nextItems.find((item) => item.id === 'system.import-management');

  expect(importManagement).toMatchObject({
    source: 'system',
    visible: false
  });
});

it('removes user items without affecting the bound command', () => {
  const items = normalizeWorkspaceRailItems([
    ...DEFAULT_WORKSPACE_RAIL_ITEMS,
    {
      id: 'user.find',
      commandId: APP_COMMAND_IDS.findInTopic,
      section: 'top',
      order: 2,
      visible: true,
      source: 'user'
    }
  ]);

  const nextItems = removeWorkspaceRailItem(items, 'user.find');

  expect(nextItems.some((item) => item.id === 'user.find')).toBe(false);
  expect(nextItems.some((item) => item.commandId === APP_COMMAND_IDS.findInTopic)).toBe(false);
});

it('moves ordinary items across top and bottom sections', () => {
  const moved = moveWorkspaceRailItem(DEFAULT_WORKSPACE_RAIL_ITEMS, 'system.import-file', 'bottom', 0);

  expect(itemIds(getWorkspaceRailSectionItems(moved, 'top'))).toEqual(['system.import-clipboard', 'system.import-management']);
  expect(itemIds(getWorkspaceRailSectionItems(moved, 'bottom'))).toEqual(['system.import-file']);
});

it('adds a new action to the top rail by default', () => {
  const nextItems = addWorkspaceRailItem(DEFAULT_WORKSPACE_RAIL_ITEMS, {
    commandId: APP_COMMAND_IDS.findInTopic,
    iconId: 'Search',
    label: 'Find in Topic'
  });
  const added = nextItems.find((item) => item.commandId === APP_COMMAND_IDS.findInTopic);

  expect(added).toMatchObject({
    iconId: 'Search',
    labelOverride: 'Find in Topic',
    section: 'top',
    source: 'user',
    visible: true
  });
  expect(itemIds(getWorkspaceRailSectionItems(nextItems, 'top'))).toEqual([
    'system.import-file',
    'system.import-clipboard',
    'system.import-management',
    'user.document-findInTopic'
  ]);
});

it('resets the rail model back to the default layout', () => {
  const changed = toggleWorkspaceRailItemVisibility(DEFAULT_WORKSPACE_RAIL_ITEMS, 'system.import-management', false);
  const reset = resetWorkspaceRailItems();

  expect(changed.find((item) => item.id === 'system.import-management')?.visible).toBe(false);
  expect(reset).toEqual(normalizeWorkspaceRailItems(DEFAULT_WORKSPACE_RAIL_ITEMS));
});

it('persists normalized rail items through whitelisted storage', () => {
  const hiddenItems = toggleWorkspaceRailItemVisibility(DEFAULT_WORKSPACE_RAIL_ITEMS, 'system.import-clipboard', false);

  saveWorkspaceRailItems(hiddenItems);

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceRailItems)).toContain('system.import-clipboard');
  expect(loadWorkspaceRailItems().find((item) => item.id === 'system.import-clipboard')?.visible).toBe(false);
});

it('falls back to the default layout when stored rail settings are invalid', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceRailItems, '{bad json');

  expect(loadWorkspaceRailItems()).toEqual(resetWorkspaceRailItems());
});
