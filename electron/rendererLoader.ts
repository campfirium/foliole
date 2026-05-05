import fs from 'node:fs';

import type { BrowserWindow } from 'electron';

import { formatRuntimeDiagnosticsSnapshot, resolveRendererTargetUrl, type RuntimeDiagnosticsSnapshot } from './runtimeIdentity.js';
import { resolveRendererIndexPath } from './runtimePaths.js';

export type StartupRendererView =
  | {
      kind: 'booting';
    }
  | {
      errorSummary: string;
      kind: 'startup-error';
      logPath: string | null;
      moduleLabel: string;
    };

function resolveRendererUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? null;
}

function resolveRendererFilePath(runtimeDir: string) {
  return resolveRendererIndexPath(runtimeDir, fs.existsSync);
}

function wait(ms: number) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function loadRendererUrlWithRetry(window: BrowserWindow, url: string, maxAttempts = 30) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await window.loadURL(url);
      return;
    } catch (error) {
      lastError = error;
      await wait(300);
    }
  }
  throw lastError;
}

function appendStartupViewToUrl(url: string, startupView?: StartupRendererView | null) {
  if (!startupView) {
    return url;
  }
  const parsedUrl = new URL(url);
  parsedUrl.searchParams.set('startupView', startupView.kind);
  if (startupView.kind === 'startup-error') {
    parsedUrl.searchParams.set('startupModule', startupView.moduleLabel);
    parsedUrl.searchParams.set('startupError', startupView.errorSummary);
    if (startupView.logPath) {
      parsedUrl.searchParams.set('startupLogPath', startupView.logPath);
    }
  }
  return parsedUrl.toString();
}

function toFileQuery(startupView?: StartupRendererView | null) {
  if (!startupView) {
    return undefined;
  }
  const query: Record<string, string> = {
    startupView: startupView.kind
  };
  if (startupView.kind === 'startup-error') {
    query.startupModule = startupView.moduleLabel;
    query.startupError = startupView.errorSummary;
    if (startupView.logPath) {
      query.startupLogPath = startupView.logPath;
    }
  }
  return query;
}

export async function loadRenderer(
  window: BrowserWindow,
  runtimeDir: string,
  startupView?: StartupRendererView | null
) {
  const devUrl = resolveRendererUrl();
  if (devUrl) {
    await loadRendererUrlWithRetry(window, appendStartupViewToUrl(devUrl, startupView));
    return;
  }
  const query = toFileQuery(startupView);
  if (!query) {
    await window.loadFile(resolveRendererFilePath(runtimeDir));
    return;
  }
  await window.loadFile(resolveRendererFilePath(runtimeDir), { query });
}

function resolveActiveRendererUrl(window: BrowserWindow, runtimeDir: string) {
  const activeUrl = window.webContents.getURL();
  if (activeUrl) {
    return activeUrl;
  }
  return resolveRendererTargetUrl(runtimeDir, fs.existsSync);
}

export function logActiveRuntimeDiagnostics(window: BrowserWindow, runtimeDir: string, runtimeDiagnostics: RuntimeDiagnosticsSnapshot) {
  console.info(
    '[electron-main] active runtime diagnostics',
    formatRuntimeDiagnosticsSnapshot({
      ...runtimeDiagnostics,
      rendererUrl: resolveActiveRendererUrl(window, runtimeDir)
    })
  );
}
