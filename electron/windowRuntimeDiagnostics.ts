import fs from 'node:fs';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';
import { resolveWindowsDiagnosticLogPath } from './diagnostics/windowsDiagnosticPaths.js';
import { appendBootEvent } from './ipc/boot.js';
import { startStartupWindowFrameCapture } from './startupWindowFrameCapture.js';
import { normalizeWindowBoundsToDip } from './windowBoundsDpi.js';

const LOG_FILE_NAME = 'renderer-state.ndjson';
const startupPresentationByWindow = new WeakMap<BrowserWindow, StartupWindowPresentation>();

export interface StartupWindowPresentation {
  isFullScreen: boolean;
  isMaximized: boolean;
}

function appendRendererStateLog(label: string, snapshot: unknown) {
  const logPath = resolveWindowsDiagnosticLogPath(LOG_FILE_NAME);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(
    logPath,
    `${JSON.stringify({ label, snapshot, timestamp: new Date().toISOString() })}\n`,
    'utf8'
  );
}

function appendRuntimeEventLog(label: string, payload: Record<string, unknown> = {}) {
  appendRendererStateLog(`event:${label}`, payload);
  void appendBootEvent(`window_${label}`, payload).catch((error) => {
    appendMainProcessDiagnosticLog('boot_log_failed', {
      error,
      stage: `window_${label}`
    });
  });
}

function logRendererStateSnapshot(window: BrowserWindow, label: string) {
  void window.webContents
    .executeJavaScript(
      `(() => {
        const titlebarButtons = Array.from(document.querySelectorAll('.window-titlebar-button')).map((button) => ({
          ariaLabel: button.getAttribute('aria-label'),
          disabled: button.disabled
        }));
        const backupButton = document.querySelector('button.settings-action-button');
        return {
          backupButton: backupButton ? {
            disabled: backupButton.disabled,
            text: backupButton.textContent?.trim() ?? ''
          } : null,
          bodyTextSample: document.body?.innerText?.slice(0, 200) ?? '',
          bridgeAvailable: typeof window.electronAPI !== 'undefined',
          debugProbeAvailable: typeof window.__FOLIOLE_DESKTOP_DEBUG_PROBE__ !== 'undefined',
          href: window.location.href,
          nativeInvokeReady: typeof window.electronAPI?.invoke === 'function',
          readyState: document.readyState,
          rootPresent: Boolean(document.getElementById('root')),
          titlebarButtons
        };
      })()`,
      true
    )
    .then((snapshot) => {
      console.info(`[electron-main] renderer state snapshot:${label}`, snapshot);
      appendRendererStateLog(label, snapshot);
    })
    .catch((error) => {
      appendMainProcessDiagnosticLog('renderer_state_snapshot_failed', { error, label });
      appendRendererStateLog(label, {
        error: error instanceof Error ? error.message : String(error)
      });
    });
}

function logBridgeSnapshot(window: BrowserWindow) {
  void window.webContents
    .executeJavaScript(
      `(() => ({
        bridgeAvailable: typeof window.electronAPI !== 'undefined',
        debugProbeAvailable: typeof window.__FOLIOLE_DESKTOP_DEBUG_PROBE__ !== 'undefined',
        href: window.location.href,
        readyState: document.readyState
      }))()`,
      true
    )
    .then((snapshot) => {
      console.info('[electron-main] renderer bridge snapshot', snapshot);
    })
    .catch((error) => {
      appendMainProcessDiagnosticLog('renderer_bridge_snapshot_failed', { error });
    });
}

function scheduleRendererSnapshot(window: BrowserWindow, label: string, delayMs: number) {
  globalThis.setTimeout(() => {
    if (!window.isDestroyed()) {
      logRendererStateSnapshot(window, label);
    }
  }, delayMs);
}

export function setStartupWindowPresentation(window: BrowserWindow, presentation: StartupWindowPresentation) {
  startupPresentationByWindow.set(window, presentation);
}

export async function presentInitialRendererWindow(window: BrowserWindow) {
  const presentation = startupPresentationByWindow.get(window) ?? {
    isFullScreen: false,
    isMaximized: false
  };
  appendRuntimeEventLog('initial-renderer-window-show', {
    isFullScreen: presentation.isFullScreen,
    isMaximized: presentation.isMaximized
  });
  if (presentation.isFullScreen && !window.isFullScreen()) {
    window.setFullScreen(true);
  } else if (presentation.isMaximized && !window.isMaximized()) {
    window.maximize();
  }
  if (!window.isVisible()) {
    window.show();
  }
  await appendBootEvent('window_visible', {
    bounds: normalizeWindowBoundsToDip(window, window.getBounds()),
    isVisible: window.isVisible()
  });
  startStartupWindowFrameCapture(window);
}

export function bindWindowRuntimeDiagnostics(window: BrowserWindow) {
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      appendRuntimeEventLog('ready-to-show');
    }
  });

  window.webContents.on('did-start-navigation', (_, url, isInPlace, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }
    appendRuntimeEventLog('did-start-navigation', { isInPlace, url });
    scheduleRendererSnapshot(window, 'after-navigation-2000ms', 2000);
  });

  window.webContents.on('dom-ready', () => {
    appendRuntimeEventLog('dom-ready', {
      url: window.webContents.getURL()
    });
    logRendererStateSnapshot(window, 'dom-ready');
  });

  window.webContents.on('did-stop-loading', () => {
    appendRuntimeEventLog('did-stop-loading', {
      url: window.webContents.getURL()
    });
  });

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    appendRuntimeEventLog('console-message', {
      level,
      line,
      message,
      sourceId
    });
  });

  window.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL, isMainFrame) => {
    appendRuntimeEventLog('did-fail-load', {
      errorCode,
      errorDescription,
      isMainFrame,
      validatedURL
    });
    if (!isMainFrame) {
      return;
    }
    appendMainProcessDiagnosticLog('renderer_did_fail_load', {
      errorCode,
      errorDescription,
      validatedURL
    });
  });

  window.webContents.on('did-finish-load', () => {
    appendRuntimeEventLog('did-finish-load', {
      url: window.webContents.getURL()
    });
    logBridgeSnapshot(window);
    logRendererStateSnapshot(window, 'did-finish-load');
    scheduleRendererSnapshot(window, 'after-1000ms', 1000);
    scheduleRendererSnapshot(window, 'after-5000ms', 5000);
    scheduleRendererSnapshot(window, 'after-15000ms', 15000);
  });
}
