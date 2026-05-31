import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

const DEFAULT_SCREENSHOT_PORT = 38642;
const SCREENSHOT_PATH = '/dev/screenshot';
const STATE_PATH = '/dev/state';

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
      return {
        bodyTextSample: document.body?.innerText?.slice(0, 240) ?? '',
        href: window.location.href,
        readyState: document.readyState,
        rootChildCount: root?.childElementCount ?? null,
        visibilityState: document.visibilityState
      };
    })()`,
    true
  );
}

function writeJson(response: http.ServerResponse, statusCode: number, payload: object) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload)}\n`);
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
      const window = args.getWindow();
      if (!window || window.isDestroyed()) {
        writeJson(response, 503, { error: 'window_unavailable' });
        return;
      }

      void captureWindowScreenshot(window, screenshotPath)
        .then(() => writeJson(response, 200, { path: screenshotPath }))
        .catch((error) => writeJson(response, 500, {
          error: error instanceof Error ? error.message : 'screenshot_failed'
        }));
      return;
    }

    if (request.method === 'GET' && request.url === STATE_PATH) {
      const window = args.getWindow();
      if (!window || window.isDestroyed()) {
        writeJson(response, 503, { error: 'window_unavailable' });
        return;
      }

      void readWindowState(window)
        .then((state) => writeJson(response, 200, { state }))
        .catch((error) => writeJson(response, 500, {
          error: error instanceof Error ? error.message : 'state_failed'
        }));
      return;
    }

    {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }
  });

  server.on('error', (error) => {
    activeServer = activeServer === server ? null : activeServer;
    console.warn('[dev-screenshot] server failed', error);
  });
  server.listen(resolvePort(env), '127.0.0.1');
  activeServer = server;
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
