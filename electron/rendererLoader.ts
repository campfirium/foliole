import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { BrowserWindow } from 'electron';

import { formatRuntimeDiagnosticsSnapshot, resolveRendererTargetUrl, type RuntimeDiagnosticsSnapshot } from './runtimeIdentity.js';
import { resolveRendererIndexPath } from './runtimePaths.js';
import { getRuntimeStartupTokensInlineCss, getRuntimeStartupTokensThemeSource } from './runtimeStartupTokens.js';

export interface StartupRendererView {
  errorSummary: string;
  kind: 'startup-error';
  logPath: string | null;
  moduleLabel: string;
}

export interface LoadRendererOptions {
  deferMainScript?: boolean;
}

function resolveRendererUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? null;
}

function resolveRendererFilePath(runtimeDir: string) {
  return resolveRendererIndexPath(runtimeDir, fs.existsSync);
}

function resolveSourceRendererIndexPath(runtimeDir: string) {
  return path.join(runtimeDir, '..', '..', 'index.html');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createLocalStartupErrorHtml(startupView: StartupRendererView) {
  const css = getRuntimeStartupTokensInlineCss();
  const logPathMarkup = startupView.logPath
    ? `<p class="startup-error__path">${escapeHtml(startupView.logPath)}</p>`
    : '';
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="color-scheme" content="dark light">
    <style>
      :root { ${css} }
      html, body, #root {
        width: 100%;
        height: 100%;
        margin: 0;
      }
      body {
        background: var(--startup-document-bg, #1f211f);
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
        background: var(--startup-list-bg, #2b2f2a);
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
      }
    </style>
  </head>
  <body>
    <div id="root">
      <main class="startup-error" role="alert">
        <h1 class="startup-error__title">${escapeHtml(startupView.moduleLabel)}</h1>
        <p class="startup-error__message">${escapeHtml(startupView.errorSummary)}</p>
        ${logPathMarkup}
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

function createStartupBootScript() {
  const themeSource = getRuntimeStartupTokensThemeSource();
  return [
    `document.documentElement.dataset.baseColor = ${JSON.stringify(themeSource)};`,
    `document.documentElement.dataset.resolvedBaseColor = ${JSON.stringify(themeSource)};`
  ].join('');
}

function injectStartupBootScript(html: string) {
  const bootScript = createStartupBootScript();
  if (html.includes('/*STARTUP_INJECTED_BOOT_SCRIPT*/')) {
    return html.replace('/*STARTUP_INJECTED_BOOT_SCRIPT*/', bootScript);
  }
  return html.replace('</head>', `    <script>${bootScript}</script>\n  </head>`);
}

function createRendererHtmlBaseTag(indexPath: string) {
  const href = pathToFileURL(`${path.dirname(indexPath)}${path.sep}`).href;
  return `<base href="${href}">`;
}

function createDevRendererHtmlBaseTag(devUrl: string) {
  const href = new URL(devUrl);
  href.pathname = href.pathname.endsWith('/') ? href.pathname : `${href.pathname}/`;
  href.search = '';
  href.hash = '';
  return `<base href="${href.toString()}">`;
}

function deferRendererModuleEntry(html: string) {
  return html.replace(
    /<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/,
    '<script type="application/x-foliole-deferred-module" data-startup-src="$1"></script>'
  );
}

export function injectStartupTokensIntoRendererHtml(
  html: string,
  indexPath: string,
  startupCss: string,
  options: LoadRendererOptions = {}
) {
  const withStartupCss = html.replace('/*STARTUP_INJECTED_CSS*/', startupCss);
  const withStartupBootScript = injectStartupBootScript(withStartupCss);
  const withEntryMode = options.deferMainScript ? deferRendererModuleEntry(withStartupBootScript) : withStartupBootScript;
  const withLateStartupCss = withEntryMode.replace(
    '</head>',
    `    <style id="runtime-startup-tokens">:root { ${startupCss} }</style>\n  </head>`
  );
  if (withLateStartupCss.includes('<base href=')) {
    return withLateStartupCss;
  }
  return withLateStartupCss.replace('<head>', `<head>\n    ${createRendererHtmlBaseTag(indexPath)}`);
}

export function injectDevRendererIntoHtml(
  html: string,
  devUrl: string,
  startupCss: string,
  options: LoadRendererOptions = {}
) {
  const devOrigin = new URL(devUrl).origin;
  const withStartupCss = html.replace('/*STARTUP_INJECTED_CSS*/', startupCss);
  const withStartupBootScript = injectStartupBootScript(withStartupCss);
  const withModuleEntry = withStartupBootScript.replace(
    'src="/src/main.tsx"',
    `src="${devOrigin}/src/main.tsx"`
  );
  const withEntryMode = options.deferMainScript ? deferRendererModuleEntry(withModuleEntry) : withModuleEntry;
  if (withEntryMode.includes('<base href=')) {
    return withEntryMode;
  }
  return withEntryMode.replace('<head>', `<head>\n    ${createDevRendererHtmlBaseTag(devUrl)}`);
}

async function loadInjectedRendererFile(window: BrowserWindow, indexPath: string, options: LoadRendererOptions) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const injectedHtml = injectStartupTokensIntoRendererHtml(
    html,
    indexPath,
    getRuntimeStartupTokensInlineCss(),
    options
  );
  const runtimeIndexPath = path.join(path.dirname(indexPath), 'runtime-renderer-index.html');
  fs.writeFileSync(runtimeIndexPath, injectedHtml, 'utf8');
  await window.loadFile(runtimeIndexPath);
}

async function loadInjectedDevRenderer(
  window: BrowserWindow,
  runtimeDir: string,
  devUrl: string,
  options: LoadRendererOptions
) {
  const indexPath = resolveSourceRendererIndexPath(runtimeDir);
  const html = fs.readFileSync(indexPath, 'utf8');
  const injectedHtml = injectDevRendererIntoHtml(
    html,
    devUrl,
    getRuntimeStartupTokensInlineCss(),
    options
  );
  const runtimeIndexPath = path.join(path.dirname(indexPath), 'runtime-renderer-index.html');
  fs.writeFileSync(runtimeIndexPath, injectedHtml, 'utf8');
  await window.loadFile(runtimeIndexPath);
}

export async function loadRenderer(
  window: BrowserWindow,
  runtimeDir: string,
  startupView?: StartupRendererView | null,
  options: LoadRendererOptions = {}
) {
  if (startupView) {
    await loadLocalStartupError(window, startupView);
    return;
  }
  const devUrl = resolveRendererUrl();
  if (devUrl) {
    await loadInjectedDevRenderer(window, runtimeDir, appendRendererParamsToUrl(devUrl), options);
    return;
  }
  await loadInjectedRendererFile(window, resolveRendererFilePath(runtimeDir), options);
}

export async function activateDeferredRendererEntry(window: BrowserWindow) {
  await window.webContents.executeJavaScript(
    `(() => {
      const marker = document.querySelector('script[data-startup-src]');
      const src = marker?.getAttribute('data-startup-src');
      if (!src || document.querySelector('script[data-startup-entry="active"]')) {
        return false;
      }
      const script = document.createElement('script');
      script.type = 'module';
      script.dataset.startupEntry = 'active';
      if (/^https?:\\/\\/(localhost|127\\.0\\.0\\.1)(?::\\d+)?\\//.test(src)) {
        const refreshUrl = new URL('/@react-refresh', src).toString();
        script.textContent = [
          'import RefreshRuntime from ' + JSON.stringify(refreshUrl) + ';',
          'RefreshRuntime.injectIntoGlobalHook(window);',
          'window.$RefreshReg$ = () => {};',
          'window.$RefreshSig$ = () => (type) => type;',
          'window.__vite_plugin_react_preamble_installed__ = true;',
          'import(' + JSON.stringify(src) + ');'
        ].join('\\n');
      } else {
        script.src = src;
      }
      document.body.appendChild(script);
      return true;
    })()`,
    true
  );
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
