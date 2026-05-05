import fs from 'node:fs';

import type { BrowserWindow } from 'electron';

import { formatRuntimeDiagnosticsSnapshot, resolveRendererTargetUrl, type RuntimeDiagnosticsSnapshot } from './runtimeIdentity.js';
import { resolveRendererIndexPath } from './runtimePaths.js';

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

export async function loadRenderer(window: BrowserWindow, runtimeDir: string) {
  const devUrl = resolveRendererUrl();
  if (devUrl) {
    await loadRendererUrlWithRetry(window, devUrl);
    return;
  }
  await window.loadFile(resolveRendererFilePath(runtimeDir));
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
