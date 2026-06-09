import type { BrowserWindow } from 'electron';

import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { normalizeWindowBoundsToDip } from '../windowBoundsDpi.js';
import { logWindowStateLifecycleEvent } from '../windowStateDiagnostics.js';

const WINDOW_STATE_KEY = 'window_state';
const WINDOW_STATE_COORDINATE_UNIT = 'dip';

export interface PersistedWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
  isFullScreen: boolean;
  coordinateUnit?: typeof WINDOW_STATE_COORDINATE_UNIT;
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
  const state: PersistedWindowState = {
    ...(x === null ? {} : { x }),
    ...(y === null ? {} : { y }),
    width,
    height,
    isMaximized: data.isMaximized === true,
    isFullScreen: data.isFullScreen === true
  };
  if (data.coordinateUnit === WINDOW_STATE_COORDINATE_UNIT) {
    state.coordinateUnit = WINDOW_STATE_COORDINATE_UNIT;
  }
  if (state.coordinateUnit === WINDOW_STATE_COORDINATE_UNIT) {
    return state;
  }
  const bounds = normalizeWindowBoundsToDip(null, {
    height: state.height,
    width: state.width,
    x: state.x ?? 0,
    y: state.y ?? 0
  });
  return {
    ...(x === null ? {} : { x: bounds.x }),
    ...(y === null ? {} : { y: bounds.y }),
    width: bounds.width,
    height: bounds.height,
    isMaximized: state.isMaximized,
    isFullScreen: state.isFullScreen,
    coordinateUnit: WINDOW_STATE_COORDINATE_UNIT
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
  const runtimeBounds =
    window.isMaximized() || window.isFullScreen() ? window.getNormalBounds() : window.getBounds();
  const bounds = normalizeWindowBoundsToDip(window, runtimeBounds);
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: window.isMaximized(),
    isFullScreen: window.isFullScreen(),
    coordinateUnit: WINDOW_STATE_COORDINATE_UNIT
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
