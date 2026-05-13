import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

import { saveWindowState, type PersistedWindowState } from './ipc/windowState.js';
import { logWindowStateLifecycleEvent } from './windowStateDiagnostics.js';

interface WorkAreaBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface ResolvedWindowBounds {
  height: number;
  width: number;
  x?: number;
  y?: number;
}

function hasVisibleIntersection(bounds: WorkAreaBounds, workArea: WorkAreaBounds) {
  const horizontal = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
  const vertical = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
  return horizontal > 80 && vertical > 80;
}

function resolveVisibleBounds(state: PersistedWindowState, workAreas: WorkAreaBounds[]): ResolvedWindowBounds {
  const width = Math.max(960, Math.round(state.width));
  const height = Math.max(640, Math.round(state.height));
  const x = typeof state.x === 'number' ? Math.round(state.x) : undefined;
  const y = typeof state.y === 'number' ? Math.round(state.y) : undefined;
  const bounds = {
    height,
    width,
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y })
  };
  if (x === undefined || y === undefined || workAreas.length === 0) {
    return bounds;
  }
  const windowBounds = {
    height: Math.max(640, Math.round(state.height)),
    width: Math.max(960, Math.round(state.width)),
    x,
    y
  };
  const visible = workAreas.some((workArea) => hasVisibleIntersection(windowBounds, workArea));
  return visible ? bounds : { height, width };
}

export function applyWindowStateToOptions(
  options: BrowserWindowConstructorOptions,
  state: PersistedWindowState | null,
  workAreas: WorkAreaBounds[] = []
): BrowserWindowConstructorOptions {
  if (!state) {
    return options;
  }
  const bounds = resolveVisibleBounds(state, workAreas);
  return {
    ...options,
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x === undefined ? {} : { x: bounds.x }),
    ...(bounds.y === undefined ? {} : { y: bounds.y })
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
