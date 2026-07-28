import { beforeEach, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  addDocumentHeaderMenuItem,
  DEFAULT_DOCUMENT_HEADER_MENU_ITEMS,
  loadDocumentHeaderMenuItems,
  moveDocumentHeaderMenuItem,
  removeDocumentHeaderMenuItem,
  resetDocumentHeaderMenuItems,
  saveDocumentHeaderMenuItems,
  toggleDocumentHeaderMenuItemVisibility
} from './documentHeaderMenuSettings';

beforeEach(() => {
  window.localStorage.clear();
});

it('keeps the default Topic menu order when no setting is stored', () => {
  expect(loadDocumentHeaderMenuItems().map((item) => item.commandId)).toEqual([
    APP_COMMAND_IDS.publishToFoliole,
    APP_COMMAND_IDS.publishToWordPress,
    APP_COMMAND_IDS.publishToDiscourse,
    APP_COMMAND_IDS.toggleComparisonView,
    APP_COMMAND_IDS.toggleEditorDisplayMode,
    APP_COMMAND_IDS.customizeDocumentMenu
  ]);
});

it('persists hidden and reordered Topic menu items', () => {
  const moved = moveDocumentHeaderMenuItem(DEFAULT_DOCUMENT_HEADER_MENU_ITEMS, 'system.compare-draft', 0);
  const hidden = toggleDocumentHeaderMenuItemVisibility(moved, 'system.publish-site', false);

  saveDocumentHeaderMenuItems(hidden);

  const loaded = loadDocumentHeaderMenuItems();
  expect(loaded[0]?.commandId).toBe(APP_COMMAND_IDS.toggleComparisonView);
  expect(loaded.find((item) => item.id === 'system.publish-site')?.visible).toBe(false);
});

it('lets the Topic menu customization command be hidden like other system commands', () => {
  const hidden = toggleDocumentHeaderMenuItemVisibility(DEFAULT_DOCUMENT_HEADER_MENU_ITEMS, 'system.customize-menu', false);

  expect(hidden.find((item) => item.commandId === APP_COMMAND_IDS.customizeDocumentMenu)).toMatchObject({
    source: 'system',
    visible: false
  });
});

it('adds custom commands and removes them without losing system defaults', () => {
  const added = addDocumentHeaderMenuItem(DEFAULT_DOCUMENT_HEADER_MENU_ITEMS, {
    commandId: APP_COMMAND_IDS.findInTopic,
    label: 'Find in Topic'
  });

  expect(added.at(-1)).toMatchObject({
    commandId: APP_COMMAND_IDS.findInTopic,
    source: 'user',
    visible: true
  });

  const removed = removeDocumentHeaderMenuItem(added, added.at(-1)!.id);
  expect(removed.map((item) => item.commandId)).toEqual(resetDocumentHeaderMenuItems().map((item) => item.commandId));
});

it('stores the Topic menu under the whitelisted app setting key', () => {
  saveDocumentHeaderMenuItems(DEFAULT_DOCUMENT_HEADER_MENU_ITEMS);

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.documentHeaderMenuItems)).toContain(
    APP_COMMAND_IDS.publishToFoliole
  );
});
