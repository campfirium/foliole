import { useSyncExternalStore } from 'react';

import type { EditorDisplayMode } from '../features/editor/model/editorDisplayMode';

/**
 * Phone-only preference for the whole-document editing mode. It is kept apart from the
 * desktop `editorDisplayMode` setting because the phone applies it only while editing:
 * reading always renders live preview.
 */
export const COMPANION_EDITOR_DISPLAY_MODE_STORAGE_KEY = 'foliole-companion-editor-display-mode';

const listeners = new Set<() => void>();
let cachedMode: EditorDisplayMode | null = null;

function readStoredMode(): EditorDisplayMode {
  try {
    return window.localStorage.getItem(COMPANION_EDITOR_DISPLAY_MODE_STORAGE_KEY) === 'source' ? 'source' : 'preview';
  } catch {
    return 'preview';
  }
}

export function getCompanionEditorDisplayMode(): EditorDisplayMode {
  cachedMode ??= readStoredMode();
  return cachedMode;
}

export function setCompanionEditorDisplayMode(mode: EditorDisplayMode) {
  cachedMode = mode;
  try {
    if (mode === 'source') window.localStorage.setItem(COMPANION_EDITOR_DISPLAY_MODE_STORAGE_KEY, mode);
    else window.localStorage.removeItem(COMPANION_EDITOR_DISPLAY_MODE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable; the in-memory value still applies for this session.
  }
  listeners.forEach((listener) => listener());
}

export function toggleCompanionEditorDisplayMode() {
  setCompanionEditorDisplayMode(getCompanionEditorDisplayMode() === 'source' ? 'preview' : 'source');
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCompanionEditorDisplayMode(): EditorDisplayMode {
  return useSyncExternalStore(subscribe, getCompanionEditorDisplayMode, getCompanionEditorDisplayMode);
}

export function resetCompanionEditorDisplayModeForTest() {
  cachedMode = null;
}
