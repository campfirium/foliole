import fs from 'node:fs';

import { app, type BrowserWindow } from 'electron';

import { formatRuntimeDiagnosticsSnapshot, resolveRendererTargetUrl, type RuntimeDiagnosticsSnapshot } from './runtimeIdentity.js';
import { resolveRendererFilePath, resolveSourceRendererIndexPath } from './runtimeRendererHtml.js';
import { resolveUsableRuntimeRendererIndex } from './runtimeRendererIndexCache.js';

export {
  injectDevRendererIntoHtml,
  injectStartupTokensIntoRendererHtml,
  writePrebuiltRendererHtmlForSettings
} from './runtimeRendererHtml.js';

export interface StartupRendererView {
  errorSummary: string;
  kind: 'startup-error';
  logPath: string | null;
  moduleLabel: string;
}

function resolveRendererUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createLocalStartupErrorCss() {
  return `
      :root {
        --startup-document-bg: #161918;
        --startup-divider: rgba(232, 230, 223, 0.12);
        --startup-list-bg: #1a1f1e;
        --color-foreground: 232 230 223;
      }
      html, body, #root {
        width: 100%;
        height: 100%;
        margin: 0;
      }
      body {
        background: var(--startup-document-bg, #161918);
        color: rgb(var(--color-foreground, 232 230 223));
        font: 13px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #root {
        display: grid;
        place-items: center;
      }
      .startup-error {
        box-sizing: border-box;
        width: min(560px, calc(100vw - 64px));
        padding: 24px;
        border: 1px solid var(--startup-divider, rgba(232, 230, 223, 0.18));
        background: var(--startup-list-bg, #1a1f1e);
      }
      .startup-error__title {
        margin: 0 0 8px;
        font-size: 15px;
        font-weight: 600;
      }
      .startup-error__message,
      .startup-error__path {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .startup-error__path {
        margin-top: 12px;
        opacity: 0.7;
      }`;
}

function createLocalStartupErrorLogPathMarkup(logPath: string | null) {
  return logPath ? `<p class="startup-error__path">${escapeHtml(logPath)}</p>` : '';
}

function createLocalStartupErrorHtml(startupView: StartupRendererView) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="color-scheme" content="dark light">
    <style>${createLocalStartupErrorCss()}</style>
  </head>
  <body>
    <div id="root">
      <main class="startup-error" role="alert">
        <h1 class="startup-error__title">${escapeHtml(startupView.moduleLabel)}</h1>
        <p class="startup-error__message">${escapeHtml(startupView.errorSummary)}</p>
        ${createLocalStartupErrorLogPathMarkup(startupView.logPath)}
      </main>
    </div>
    <script>
      window.__FOLIOLE_APP_READY_REPORTED__ = true;
    </script>
  </body>
</html>`;
}

async function loadLocalStartupError(window: BrowserWindow, startupView: StartupRendererView) {
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createLocalStartupErrorHtml(startupView))}`);
}

function appendRendererParamsToUrl(url: string, startupView?: StartupRendererView | null) {
  const parsedUrl = new URL(url);
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

async function loadPackagedRenderer(window: BrowserWindow, runtimeDir: string) {
  const indexPath = resolveRendererFilePath(runtimeDir);
  await window.loadFile(resolveExistingRuntimeRendererIndex(indexPath) ?? indexPath);
}

async function loadDevRenderer(window: BrowserWindow, devUrl: string) {
  const runtimeIndexPath = resolveExistingRuntimeRendererIndex(resolveSourceRendererIndexPath(app.getAppPath()));
  if (runtimeIndexPath) {
    await window.loadFile(runtimeIndexPath);
    return;
  }
  await window.loadURL(devUrl);
}

function resolveExistingRuntimeRendererIndex(sourceIndexPath: string | null = null) {
  return resolveUsableRuntimeRendererIndex(app.getPath('userData'), sourceIndexPath);
}

export async function loadRenderer(
  window: BrowserWindow,
  runtimeDir: string,
  startupView?: StartupRendererView | null
) {
  if (startupView) {
    await loadLocalStartupError(window, startupView);
    return;
  }
  const devUrl = resolveRendererUrl();
  if (devUrl) {
    await loadDevRenderer(window, appendRendererParamsToUrl(devUrl));
    return;
  }
  await loadPackagedRenderer(window, runtimeDir);
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
