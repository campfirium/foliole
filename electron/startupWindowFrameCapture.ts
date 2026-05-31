import fs from 'node:fs';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';

const capturedWindows = new WeakSet<BrowserWindow>();
const DEFAULT_FRAME_COUNT = 32;
const DEFAULT_FRAME_INTERVAL_MS = 250;

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveStartupCaptureDir() {
  const configuredDir = process.env.FOLIOLE_STARTUP_WINDOW_CAPTURE_DIR;
  if (!configuredDir?.trim()) {
    return null;
  }
  return configuredDir;
}

async function captureStartupWindowFrame(window: BrowserWindow, captureDir: string, index: number) {
  const screenshotPath = path.join(captureDir, `frame-${String(index).padStart(3, '0')}.png`);
  const statePath = path.join(captureDir, `frame-${String(index).padStart(3, '0')}.json`);
  const state = await window.webContents.executeJavaScript(
    `(() => {
      const root = document.getElementById('root');
      const readBg = (selector) => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element).backgroundColor : null;
      };
      return {
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyTextSample: document.body?.innerText?.slice(0, 220) ?? '',
        bounds: { height: window.innerHeight, width: window.innerWidth },
        href: window.location.href,
        index: ${index},
        readyState: document.readyState,
        rootChildCount: root?.childElementCount ?? null,
        workspaceDocumentBg: readBg('.workspace-region-main-document'),
        workspaceSidebarBg: readBg('.workspace-region-main-sidebar')
      };
    })()`,
    true
  );
  const image = await window.capturePage();
  fs.mkdirSync(captureDir, { recursive: true });
  fs.writeFileSync(screenshotPath, image.toPNG());
  fs.writeFileSync(statePath, `${JSON.stringify({ capturedAt: new Date().toISOString(), state }, null, 2)}\n`, 'utf8');
}

export function startStartupWindowFrameCapture(window: BrowserWindow) {
  const captureDir = resolveStartupCaptureDir();
  if (!captureDir || capturedWindows.has(window)) {
    return;
  }
  capturedWindows.add(window);
  const frameCount = readPositiveIntegerEnv('FOLIOLE_STARTUP_WINDOW_CAPTURE_COUNT', DEFAULT_FRAME_COUNT);
  const intervalMs = readPositiveIntegerEnv('FOLIOLE_STARTUP_WINDOW_CAPTURE_INTERVAL_MS', DEFAULT_FRAME_INTERVAL_MS);
  for (let index = 0; index < frameCount; index += 1) {
    globalThis.setTimeout(() => {
      if (window.isDestroyed()) {
        return;
      }
      captureStartupWindowFrame(window, captureDir, index).catch((error) => {
        appendMainProcessDiagnosticLog('startup_window_frame_capture_failed', {
          error,
          frame: index
        });
      });
    }, index * intervalMs);
  }
}
