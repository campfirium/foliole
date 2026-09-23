import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  loadDocumentHeaderMenuItems,
  normalizeDocumentHeaderMenuItems,
  saveDocumentHeaderMenuItems,
  type DocumentHeaderMenuItemConfig
} from './documentHeaderMenuSettings';

export const DEFAULT_EDITOR_CONTEXT_MENU_ITEMS: DocumentHeaderMenuItemConfig[] = [
  { id: 'system.clean-formatting', commandId: APP_COMMAND_IDS.configureCleanFormatting, order: 0, source: 'system', visible: true }
];

export function loadEditorContextMenuItems() {
  return loadDocumentHeaderMenuItems(APP_SETTINGS_STORAGE_KEYS.editorContextMenuItems, DEFAULT_EDITOR_CONTEXT_MENU_ITEMS);
}

export function saveEditorContextMenuItems(items: DocumentHeaderMenuItemConfig[]) {
  saveDocumentHeaderMenuItems(items, APP_SETTINGS_STORAGE_KEYS.editorContextMenuItems, DEFAULT_EDITOR_CONTEXT_MENU_ITEMS);
}

export function resetEditorContextMenuItems() {
  return normalizeDocumentHeaderMenuItems(DEFAULT_EDITOR_CONTEXT_MENU_ITEMS, DEFAULT_EDITOR_CONTEXT_MENU_ITEMS);
}
