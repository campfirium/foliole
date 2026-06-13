import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

const DEFAULT_SCREENSHOT_PORT = 38642;
const SCREENSHOT_PATH = '/dev/screenshot', STATE_PATH = '/dev/state';
const OPEN_NODE_PATH = '/dev/open-node';
const TOGGLE_THEME_PATH = '/dev/toggle-theme';

let activeServer: http.Server | null = null;

interface DevScreenshotServerArgs {
  env?: NodeJS.ProcessEnv;
  getWindow: () => BrowserWindow | null;
  rootDir?: string;
}

function isDevelopmentScreenshotEnabled(env: NodeJS.ProcessEnv) {
  return env.NODE_ENV === 'development' && Boolean(env.ELECTRON_RENDERER_URL);
}

function resolvePort(env: NodeJS.ProcessEnv) {
  const parsed = Number.parseInt(env.FOLIOLE_DEV_SCREENSHOT_PORT ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_SCREENSHOT_PORT;
}

function resolveScreenshotPath(rootDir: string) {
  return path.join(rootDir, '.tmp', 'screenshots', 'latest.png');
}

async function captureWindowScreenshot(window: BrowserWindow, targetPath: string) {
  const image = await window.capturePage();
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, image.toPNG());
}

async function readWindowState(window: BrowserWindow) {
  return window.webContents.executeJavaScript(
    `(() => {
      const root = document.getElementById('root');
      const html = document.documentElement;
      const readStyle = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          filter: style.filter,
          scrollbarColor: style.scrollbarColor
        };
      };
      return {
        bodyTextSample: document.body?.innerText?.slice(0, 240) ?? '',
        debug: {
          desktopProbeAvailable: typeof window.__FOLIOLE_DESKTOP_DEBUG_PROBE__ !== 'undefined',
          workspaceDebugAvailable: typeof window.__folioleWorkspaceDebug !== 'undefined'
        },
        href: window.location.href,
        pdf: {
          page: readStyle('.react-pdf__Page'),
          scrollContainer: readStyle('.pdf-document-scroll-container'),
          surface: readStyle('.pdf-document-surface')
        },
        readyState: document.readyState,
        rootDataset: {
          baseColor: html.dataset.baseColor ?? null,
          pdfReadingMode: html.dataset.pdfReadingMode ?? null,
          resolvedBaseColor: html.dataset.resolvedBaseColor ?? null
        },
        rootChildCount: root?.childElementCount ?? null,
        visibilityState: document.visibilityState
      };
    })()`,
    true
  );
}

async function openWindowNode(window: BrowserWindow, requestUrl: string | undefined) {
  const url = new URL(requestUrl ?? OPEN_NODE_PATH, 'http://127.0.0.1');
  const id = url.searchParams.get('id')?.trim() ?? '';
  const title = url.searchParams.get('title')?.trim() ?? '';
  return window.webContents.executeJavaScript(
    `((target) => {
      const api = window.__folioleWorkspaceDebug;
      if (!api?.openNode || (!target.id && !target.title)) {
        return Promise.resolve({ opened: false, reason: 'debug_api_unavailable' });
      }
      const node = target.id
        ? api.getNode?.(target.id)
        : api.listNodes?.().find((candidate) => String(candidate.title ?? '').trim() === target.title);
      if (!node?.id) {
        return Promise.resolve({ opened: false, reason: 'node_not_found' });
      }
      return api.openNode(node.id).then((opened) => ({ id: node.id, opened }));
    })(${JSON.stringify({ id, title })})`,
    true
  );
}

async function toggleWindowTheme(window: BrowserWindow) {
  return window.webContents.executeJavaScript(
    `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const button = buttons.find((candidate) => {
        const label = candidate.getAttribute('aria-label') ?? candidate.textContent ?? '';
        return label.includes('Toggle Light/Dark Mode') || label.includes('切换浅色') || label.includes('切换深色');
      });
      if (button) button.click();
      return button ? { clicked: true } : { clicked: false, reason: 'theme_button_not_found' };
    })()`,
    true
  );
}

function writeJson(response: http.ServerResponse, statusCode: number, payload: object) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload)}\n`);
}

function logServerError(error: unknown, port: number) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'EADDRINUSE') {
    console.log(`[dev-screenshot] server unavailable reason=port-in-use port=${port}`);
    return;
  }
  console.warn(`[dev-screenshot] server failed reason=${message}`);
}

function resolveAvailableWindow(args: DevScreenshotServerArgs, response: http.ServerResponse) {
  const window = args.getWindow();
  if (!window || window.isDestroyed()) {
    writeJson(response, 503, { error: 'window_unavailable' });
    return null;
  }
  return window;
}

function handleScreenshotRequest(args: DevScreenshotServerArgs, response: http.ServerResponse, screenshotPath: string) {
  const window = resolveAvailableWindow(args, response);
  if (!window) return;
  void captureWindowScreenshot(window, screenshotPath)
    .then(() => writeJson(response, 200, { path: screenshotPath }))
    .catch((error) => writeJson(response, 500, {
      error: error instanceof Error ? error.message : 'screenshot_failed'
    }));
}

function handleStateRequest(args: DevScreenshotServerArgs, response: http.ServerResponse) {
  const window = resolveAvailableWindow(args, response);
  if (!window) return;
  void readWindowState(window)
    .then((state) => writeJson(response, 200, { state }))
    .catch((error) => writeJson(response, 500, {
      error: error instanceof Error ? error.message : 'state_failed'
    }));
}

function handleOpenNodeRequest(args: DevScreenshotServerArgs, requestUrl: string, response: http.ServerResponse) {
  const window = resolveAvailableWindow(args, response);
  if (!window) return;
  void openWindowNode(window, requestUrl)
    .then((state) => writeJson(response, 200, { state }))
    .catch((error) => writeJson(response, 500, {
      error: error instanceof Error ? error.message : 'open_node_failed'
    }));
}

function handleToggleThemeRequest(args: DevScreenshotServerArgs, response: http.ServerResponse) {
  const window = resolveAvailableWindow(args, response);
  if (!window) return;
  void toggleWindowTheme(window)
    .then((state) => writeJson(response, 200, { state }))
    .catch((error) => writeJson(response, 500, {
      error: error instanceof Error ? error.message : 'toggle_theme_failed'
    }));
}

export function startDevScreenshotServer(args: DevScreenshotServerArgs) {
  const env = args.env ?? process.env;
  if (activeServer || !isDevelopmentScreenshotEnabled(env)) {
    return;
  }

  const rootDir = args.rootDir ?? env.FOLIOLE_WORKDIR ?? process.cwd();
  const screenshotPath = resolveScreenshotPath(rootDir);
  const server = http.createServer((request, response) => {
    if (request.method === 'POST' && request.url === SCREENSHOT_PATH) {
      handleScreenshotRequest(args, response, screenshotPath);
      return;
    }

    if (request.method === 'GET' && request.url === STATE_PATH) {
      handleStateRequest(args, response);
      return;
    }

    if (request.method === 'POST' && request.url?.startsWith(OPEN_NODE_PATH)) {
      handleOpenNodeRequest(args, request.url, response);
      return;
    }

    if (request.method === 'POST' && request.url === TOGGLE_THEME_PATH) {
      handleToggleThemeRequest(args, response);
      return;
    }

    {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }
  });

  const port = resolvePort(env);
  server.on('error', (error) => {
    activeServer = activeServer === server ? null : activeServer;
    logServerError(error, port);
  });
  try {
    server.listen(port, '127.0.0.1');
    activeServer = server;
  } catch (error) {
    activeServer = null;
    logServerError(error, port);
  }
}

export async function stopDevScreenshotServer() {
  if (!activeServer) {
    return;
  }
  const server = activeServer;
  activeServer = null;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
