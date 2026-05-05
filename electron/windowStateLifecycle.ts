import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

import { saveWindowState, type PersistedWindowState } from './ipc/windowState.js';
import { logWindowStateLifecycleEvent } from './windowStateDiagnostics.js';

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
    y: typeof state.y === 'number' ? Math.round(state.y) : undefined,
    fullscreen: state.isFullScreen
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
    logWindowStateLifecycleEvent('window-move', window);
    scheduleSave();
  });
  window.on('resize', () => {
    logWindowStateLifecycleEvent('window-resize', window);
    scheduleSave();
  });
  window.on('maximize', () => {
    logWindowStateLifecycleEvent('window-maximize', window);
    saveNow();
  });
  window.on('unmaximize', () => {
    logWindowStateLifecycleEvent('window-unmaximize', window);
    saveNow();
  });
  window.on('enter-full-screen', () => {
    logWindowStateLifecycleEvent('window-enter-full-screen', window);
    saveNow();
  });
  window.on('leave-full-screen', () => {
    logWindowStateLifecycleEvent('window-leave-full-screen', window);
    saveNow();
  });
  window.on('close', () => {
    logWindowStateLifecycleEvent('window-close', window);
    saveNow();
  });
}
