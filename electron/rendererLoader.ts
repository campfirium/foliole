import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { BrowserWindow } from 'electron';

import { formatRuntimeDiagnosticsSnapshot, resolveRendererTargetUrl, type RuntimeDiagnosticsSnapshot } from './runtimeIdentity.js';
import { resolveRendererIndexPath } from './runtimePaths.js';
import { getRuntimeStartupTokensInlineCss } from './runtimeStartupTokens.js';

export interface StartupRendererView {
  errorSummary: string;
  kind: 'startup-error';
  logPath: string | null;
  moduleLabel: string;
}

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

function appendRendererParamsToUrl(url: string, startupView?: StartupRendererView | null) {
  const parsedUrl = new URL(url);
  parsedUrl.searchParams.set('startupCss', getRuntimeStartupTokensInlineCss());
  if (startupView) {
    parsedUrl.searchParams.set('startupView', startupView.kind);
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
    startupError: startupView.errorSummary,
    startupModule: startupView.moduleLabel,
    startupView: startupView.kind
  };
  if (startupView.logPath) {
    query.startupLogPath = startupView.logPath;
  }
  return query;
}

function createRendererHtmlBaseTag(indexPath: string) {
  const href = pathToFileURL(`${path.dirname(indexPath)}${path.sep}`).href;
  return `<base href="${href}">`;
}

export function injectStartupTokensIntoRendererHtml(html: string, indexPath: string, startupCss: string) {
  const withStartupCss = html.replace('/*STARTUP_INJECTED_CSS*/', startupCss);
  const withLateStartupCss = withStartupCss.replace(
    '</head>',
    `    <style id="runtime-startup-tokens">:root { ${startupCss} }</style>\n  </head>`
  );
  if (withLateStartupCss.includes('<base href=')) {
    return withLateStartupCss;
  }
  return withLateStartupCss.replace('<head>', `<head>\n    ${createRendererHtmlBaseTag(indexPath)}`);
}

async function loadInjectedRendererFile(window: BrowserWindow, indexPath: string) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const injectedHtml = injectStartupTokensIntoRendererHtml(
    html,
    indexPath,
    getRuntimeStartupTokensInlineCss()
  );
  const runtimeIndexPath = path.join(path.dirname(indexPath), 'runtime-renderer-index.html');
  fs.writeFileSync(runtimeIndexPath, injectedHtml, 'utf8');
  await window.loadFile(runtimeIndexPath);
}

export async function loadRenderer(
  window: BrowserWindow,
  runtimeDir: string,
  startupView?: StartupRendererView | null
) {
  const devUrl = resolveRendererUrl();
  if (devUrl) {
    await loadRendererUrlWithRetry(window, appendRendererParamsToUrl(devUrl, startupView));
    return;
  }
  const query = toFileQuery(startupView);
  if (!query) {
    await loadInjectedRendererFile(window, resolveRendererFilePath(runtimeDir));
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
