import {
  APP_SETTINGS_STORAGE_KEYS,
  DEFAULT_PERSISTED_APP_SETTINGS,
  type EditorDisplayMode
} from '../../../shared/config/appSettings';

export type { EditorDisplayMode } from '../../../shared/config/appSettings';

export const EDITOR_DISPLAY_MODE_KEY = APP_SETTINGS_STORAGE_KEYS.editorDisplayMode;
export const EDITOR_DISPLAY_MODE_DEFAULT: EditorDisplayMode = DEFAULT_PERSISTED_APP_SETTINGS.editorDisplayMode;

function isEditorDisplayMode(value: string): value is EditorDisplayMode {
  return value === 'preview' || value === 'source';
}

export function getEditorDisplayMode(): EditorDisplayMode {
  if (typeof window === 'undefined') {
    return EDITOR_DISPLAY_MODE_DEFAULT;
  }

  const raw = window.localStorage.getItem(EDITOR_DISPLAY_MODE_KEY);
  if (!raw || !isEditorDisplayMode(raw)) {
    return EDITOR_DISPLAY_MODE_DEFAULT;
  }
  return raw;
}

export function setEditorDisplayMode(value: EditorDisplayMode) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(EDITOR_DISPLAY_MODE_KEY, value);
}
