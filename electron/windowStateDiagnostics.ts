import fs from 'node:fs';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import { resolveWindowsDiagnosticLogPath } from './diagnostics/windowsDiagnosticPaths.js';
import type { PersistedWindowState } from './ipc/windowState.js';

const LOG_FILE_NAME = 'window-state-lifecycle.ndjson';

interface WindowRuntimeStateSnapshot {
  bounds: ReturnType<BrowserWindow['getBounds']> | null;
  isFocused: boolean | null;
  isFullScreen: boolean | null;
  isMaximized: boolean | null;
  isMinimized: boolean | null;
  normalBounds: ReturnType<BrowserWindow['getNormalBounds']> | null;
}

function appendLog(entry: Record<string, unknown>) {
  const logPath = resolveWindowsDiagnosticLogPath(LOG_FILE_NAME);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
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
