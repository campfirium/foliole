/* global clearTimeout, console, document, getComputedStyle, location, performance, setTimeout */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { _electron as electronLauncher } from 'playwright';

import {
  createDesktopLaunchOptions,
  resolveDesktopLaunchTarget
} from './playwright-desktop-harness.mjs';

const FRAME_COUNT = Number.parseInt(process.env.FOLIOLE_STARTUP_FRAME_COUNT ?? '30', 10);
const FRAME_INTERVAL_MS = Number.parseInt(process.env.FOLIOLE_STARTUP_FRAME_INTERVAL_MS ?? '100', 10);
const MAX_CAPTURE_MS = Number.parseInt(process.env.FOLIOLE_STARTUP_MAX_CAPTURE_MS ?? '8000', 10);
const STABLE_FRAME_LIMIT = Number.parseInt(process.env.FOLIOLE_STARTUP_STABLE_FRAME_LIMIT ?? '16', 10);
const SAMPLE_TIMEOUT_MS = Number.parseInt(process.env.FOLIOLE_STARTUP_SAMPLE_TIMEOUT_MS ?? '3000', 10);
const FIRST_WINDOW_TIMEOUT_MS = Number.parseInt(process.env.FOLIOLE_STARTUP_FIRST_WINDOW_TIMEOUT_MS ?? '8000', 10);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function createCaptureContext() {
  const outputRoot = path.resolve('.tmp', 'startup-frames', new Date().toISOString().replace(/[:.]/g, '-'));
  const runtimeStateRoot = path.join(outputRoot, 'state');
  const userDataPath = path.join(runtimeStateRoot, 'user-data');
  const sessionDataPath = path.join(runtimeStateRoot, 'session-data');
  const libraryHome = path.join(runtimeStateRoot, 'library');
  const databasePath = path.join(libraryHome, 'Data', 'foliole.db');
  const sourceDb = process.env.FOLIOLE_STARTUP_SOURCE_DB ?? 'D:\\X\\U\\Foliole\\Data\\foliole.db';

  ensureDir(sessionDataPath);
  ensureDir(path.dirname(databasePath));

  const copiedDatabase = copyIfExists(sourceDb, databasePath);
  copyIfExists(`${sourceDb}-wal`, `${databasePath}-wal`);
  copyIfExists(`${sourceDb}-shm`, `${databasePath}-shm`);

  return {
    copiedDatabase,
    databasePath,
    libraryHome,
    outputRoot,
    runtimeStateRoot,
    sessionDataPath,
    sourceDb,
    userDataPath
  };
}

async function sampleStartupState(page, index, screenshotPath) {
  const state = await page.evaluate(() => {
    const readBg = (selector) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element).backgroundColor : null;
    };
    const readRootVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const styleSheets = Array.from(document.styleSheets).map((sheet) => {
      const record = {
        href: sheet.href,
        rules: null,
        rulesError: null
      };
      try {
        record.rules = Array.from(sheet.cssRules).slice(0, 3).map((rule) => rule.cssText);
      } catch (error) {
        record.rulesError = error instanceof Error ? error.message : String(error);
      }
      return record;
    });
    const root = document.getElementById('root');
    return {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyTextSample: document.body.innerText.slice(0, 160),
      dataset: { ...document.documentElement.dataset },
      href: location.href,
      rootVars: {
        colorCanvas: readRootVar('--color-canvas')
      },
      rootChildCount: root?.childElementCount ?? null,
      resources: performance.getEntriesByType('resource').map((entry) => ({
        duration: entry.duration,
        name: entry.name
      })).filter((entry) => entry.name.includes('foliole-runtime') || entry.name.includes('startup')),
      styleSheets,
      workspaceDocumentBg: readBg('.workspace-region-main-document'),
      workspaceSidebarBg: readBg('.workspace-region-main-sidebar'),
      readyState: document.readyState
    };
  }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  await page.screenshot({ path: screenshotPath, timeout: SAMPLE_TIMEOUT_MS }).catch(() => undefined);
  return {
    index,
    screenshot: path.relative(process.cwd(), screenshotPath),
    timestamp: new Date().toISOString(),
    state
  };
}

function getFrameSignature(record) {
  const state = record.state;
  if (!state || state.error) {
    return `error:${state?.error ?? 'unknown'}`;
  }
  return [
    `root:${state.rootChildCount}`,
    `body:${state.bodyBg}`,
    `workspace:${state.workspaceDocumentBg}`,
    `ready:${state.readyState}`
  ].join('|');
}

async function withTimeout(label, promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function writeReport(outputRoot, report) {
  const reportPath = path.join(outputRoot, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(reportPath);
}

async function main() {
  const appRoot = process.cwd();
  const target = resolveDesktopLaunchTarget(appRoot);
  if (target.missingPaths.length > 0) {
    throw new Error(`missing build output: ${target.missingPaths.join(', ')}`);
  }

  const capture = createCaptureContext();
  ensureDir(capture.outputRoot);
  const launchOptions = createDesktopLaunchOptions(
    target,
    120_000,
    {
      ...process.env,
      NODE_ENV: 'production'
    },
    {
      cleanup() {},
      env: {
        FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
        FOLIOLE_LIBRARY_HOME: capture.libraryHome,
        FOLIOLE_SESSION_DATA_PATH: capture.sessionDataPath,
        FOLIOLE_USER_DATA_PATH: capture.userDataPath,
        FOLIOLE_WORKDIR: capture.runtimeStateRoot
      },
      runtimeStateRoot: capture.runtimeStateRoot,
      sessionDataPath: capture.sessionDataPath,
      userDataPath: capture.userDataPath
    }
  );
  delete launchOptions.env.ELECTRON_RENDERER_URL;

  const electronApp = await electronLauncher.launch(launchOptions);
  const records = [];
  const pageEvents = [];
  let closeError = null;
  let earlyStop = null;
  let failure = null;
  const startedAt = Date.now();
  let lastSignature = null;
  let stableFrameCount = 0;
  try {
    const page = await electronApp.firstWindow({ timeout: FIRST_WINDOW_TIMEOUT_MS });
    page.on('console', (message) => {
      pageEvents.push({
        text: message.text(),
        type: `console:${message.type()}`
      });
    });
    page.on('pageerror', (error) => {
      pageEvents.push({
        text: error.message,
        type: 'pageerror'
      });
    });
    page.on('requestfailed', (request) => {
      pageEvents.push({
        text: `${request.url()} ${request.failure()?.errorText ?? ''}`.trim(),
        type: 'requestfailed'
      });
    });
    for (let index = 0; index < FRAME_COUNT; index += 1) {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs > MAX_CAPTURE_MS) {
        earlyStop = `max capture time reached after ${elapsedMs}ms`;
        break;
      }
      const screenshotPath = path.join(capture.outputRoot, `frame-${String(index).padStart(2, '0')}.png`);
      const record = await withTimeout(
        `sample frame ${index}`,
        sampleStartupState(page, index, screenshotPath),
        SAMPLE_TIMEOUT_MS + 1000
      );
      records.push(record);
      console.log(`[startup-capture] frame ${index + 1}/${FRAME_COUNT}`);
      const signature = getFrameSignature(record);
      stableFrameCount = signature === lastSignature ? stableFrameCount + 1 : 1;
      lastSignature = signature;
      if (stableFrameCount >= STABLE_FRAME_LIMIT) {
        earlyStop = `stable frame limit reached after ${stableFrameCount} identical frames`;
        break;
      }
      await page.waitForTimeout(FRAME_INTERVAL_MS);
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    await withTimeout('electron close', electronApp.close(), 5_000).catch((error) => {
      closeError = error instanceof Error ? error.message : String(error);
      electronApp.process()?.kill();
    });
  }

  const report = {
    capture,
    closeError,
    earlyStop,
    failure,
    frameCount: FRAME_COUNT,
    frameIntervalMs: FRAME_INTERVAL_MS,
    pageEvents,
    records
  };
  writeReport(capture.outputRoot, report);
  if (failure) {
    throw new Error(failure);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
