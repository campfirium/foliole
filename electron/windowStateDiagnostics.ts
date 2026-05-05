import fs from 'node:fs';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import type { PersistedWindowState } from './ipc/windowState.js';

const LOG_DIR = path.join(process.cwd(), 'logs', 'windows');
const LOG_PATH = path.join(LOG_DIR, 'window-state-lifecycle.ndjson');

interface WindowRuntimeStateSnapshot {
  bounds: ReturnType<BrowserWindow['getBounds']> | null;
  isFocused: boolean | null;
  isFullScreen: boolean | null;
  isMaximized: boolean | null;
  isMinimized: boolean | null;
  normalBounds: ReturnType<BrowserWindow['getNormalBounds']> | null;
}

function appendLog(entry: Record<string, unknown>) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
}

function collectRuntimeState(window: BrowserWindow): WindowRuntimeStateSnapshot {
  const tryBoolean = (method: (() => boolean) | undefined) => {
    return typeof method === 'function' ? Boolean(method()) : null;
  };
  const tryBounds = (
    method: (() => ReturnType<BrowserWindow['getBounds']>) | undefined
  ) => {
    return typeof method === 'function' ? method() : null;
  };

  return {
    bounds: tryBounds(window.getBounds?.bind(window)),
    isFocused: tryBoolean(window.isFocused?.bind(window)),
    isFullScreen: tryBoolean(window.isFullScreen?.bind(window)),
    isMaximized: tryBoolean(window.isMaximized?.bind(window)),
    isMinimized: tryBoolean(window.isMinimized?.bind(window)),
    normalBounds: tryBounds(window.getNormalBounds?.bind(window))
  };
}

export function logWindowStateLifecycleEvent(
  label: string,
  window: BrowserWindow,
  payload: Record<string, unknown> = {}
) {
  appendLog({
    label,
    payload,
    runtimeState: collectRuntimeState(window),
    timestamp: new Date().toISOString()
  });
}

export function logWindowStateRestoreDecision(
  label: string,
  state: PersistedWindowState | null,
  payload: Record<string, unknown> = {}
) {
  appendLog({
    label,
    payload,
    restoredState: state,
    timestamp: new Date().toISOString()
  });
}
