import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

import { saveWindowState, type PersistedWindowState } from './ipc/windowState.js';

export function applyWindowStateToOptions(
  options: BrowserWindowConstructorOptions,
  state: PersistedWindowState | null
): BrowserWindowConstructorOptions {
  if (!state) {
    return options;
  }
  return {
    ...options,
    width: Math.max(960, Math.round(state.width)),
    height: Math.max(640, Math.round(state.height)),
    x: typeof state.x === 'number' ? Math.round(state.x) : undefined,
    y: typeof state.y === 'number' ? Math.round(state.y) : undefined
  };
}

export function bindWindowStatePersistence(window: BrowserWindow) {
  let writeTimer: NodeJS.Timeout | null = null;
  const saveNow = () => {
    void saveWindowState(window).catch(() => undefined);
  };
  const scheduleSave = (delayMs = 160) => {
    if (writeTimer) {
      clearTimeout(writeTimer);
    }
    writeTimer = setTimeout(() => {
      saveNow();
      writeTimer = null;
    }, delayMs);
  };

  window.on('move', () => {
    scheduleSave();
  });
  window.on('resize', () => {
    scheduleSave();
  });
  window.on('maximize', () => {
    saveNow();
  });
  window.on('unmaximize', () => {
    saveNow();
  });
  window.on('close', () => {
    saveNow();
  });
}

