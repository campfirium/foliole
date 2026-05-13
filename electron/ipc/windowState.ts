import type { BrowserWindow } from 'electron';

import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { logWindowStateLifecycleEvent } from '../windowStateDiagnostics.js';

const WINDOW_STATE_KEY = 'window_state';

export interface PersistedWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
  isFullScreen: boolean;
}

function isMissingSettingsTableError(error: unknown) {
  return error instanceof Error && /no such table:\s*settings/i.test(error.message);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function normalizeWindowStatePayload(payload: unknown): PersistedWindowState | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const data = payload as Record<string, unknown>;
  const width = toFiniteNumber(data.width);
  const height = toFiniteNumber(data.height);
  if (width === null || height === null || width < 320 || height < 320) {
    return null;
  }
  const x = toFiniteNumber(data.x);
  const y = toFiniteNumber(data.y);
  return {
    ...(x === null ? {} : { x }),
    ...(y === null ? {} : { y }),
    width,
    height,
    isMaximized: data.isMaximized === true,
    isFullScreen: data.isFullScreen === true
  };
}

export async function loadWindowState(): Promise<PersistedWindowState | null> {
  try {
    return normalizeWindowStatePayload(loadJsonSetting(WINDOW_STATE_KEY));
  } catch (error) {
    if (isMissingSettingsTableError(error)) {
      return null;
    }
    throw error;
  }
}

function toWindowStateFromRuntime(window: BrowserWindow): PersistedWindowState {
  const bounds =
    window.isMaximized() || window.isFullScreen() ? window.getNormalBounds() : window.getBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: window.isMaximized(),
    isFullScreen: window.isFullScreen()
  };
}

export function saveWindowStateNow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    logWindowStateLifecycleEvent('skip-save-window-state-minimized', window);
    return;
  }
  const nextState = toWindowStateFromRuntime(window);
  saveJsonSetting(WINDOW_STATE_KEY, nextState);
  logWindowStateLifecycleEvent('save-window-state', window, {
    persistedState: nextState
  });
}

export async function saveWindowState(window: BrowserWindow): Promise<void> {
  saveWindowStateNow(window);
}
