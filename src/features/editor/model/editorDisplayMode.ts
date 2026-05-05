import {
  APP_SETTINGS_STORAGE_KEYS,
  DEFAULT_PERSISTED_APP_SETTINGS,
  type EditorDisplayMode
} from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export type { EditorDisplayMode } from '../../../shared/config/appSettings';

export const EDITOR_DISPLAY_MODE_KEY = APP_SETTINGS_STORAGE_KEYS.editorDisplayMode;
export const EDITOR_DISPLAY_MODE_DEFAULT: EditorDisplayMode = DEFAULT_PERSISTED_APP_SETTINGS.editorDisplayMode;

function isEditorDisplayMode(value: string): value is EditorDisplayMode {
  return value === 'preview' || value === 'source';
}

export function getEditorDisplayMode(): EditorDisplayMode {
  const raw = getWhitelistedLocalStorageItem(EDITOR_DISPLAY_MODE_KEY);
  if (!raw || !isEditorDisplayMode(raw)) {
    return EDITOR_DISPLAY_MODE_DEFAULT;
  }
  return raw;
}

export function setEditorDisplayMode(value: EditorDisplayMode) {
  setWhitelistedLocalStorageItem(EDITOR_DISPLAY_MODE_KEY, value);
}
