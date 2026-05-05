import type { BrowserWindow } from 'electron';

import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

const WINDOW_STATE_KEY = 'window_state';

export interface PersistedWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
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
    x: x ?? undefined,
    y: y ?? undefined,
    width,
    height,
    isMaximized: data.isMaximized === true
  };
}

export async function loadWindowState(): Promise<PersistedWindowState | null> {
  return normalizeWindowStatePayload(loadJsonSetting(WINDOW_STATE_KEY));
}

function toWindowStateFromRuntime(window: BrowserWindow): PersistedWindowState {
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: window.isMaximized()
  };
}

export async function saveWindowState(window: BrowserWindow): Promise<void> {
  saveJsonSetting(WINDOW_STATE_KEY, toWindowStateFromRuntime(window));
}
