import { promises as fs } from 'node:fs';
import path from 'node:path';

import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';
import { resolveWindowsDiagnosticLogDir } from '../diagnostics/windowsDiagnosticPaths.js';

const BOOT_EVENT_LOG = path.join('logs', 'windows', 'native-boot-events.ndjson');
const READY_MARKER_FILE = '.windows-native-boot-ready.json';
const BRIDGE_READY_MARKER_FILE = '.windows-native-bridge-ready.json';
const WINDOW_VISIBLE_MARKER_FILE = '.windows-native-window-visible.json';
type BootEventSource = 'main' | 'renderer';
const WAITED_BOOT_EVENT_STAGES = new Set(['app_ready', 'bridge_ready', 'window_visible']);

let bootEventQueue: Promise<void> = Promise.resolve();
let rendererAppReady = false;
let rendererAppReadyWaiters: Array<() => void> = [];

function resolveRepoRoot() {
  const envRoot = process.env.FOLIOLE_WORKDIR;
  if (envRoot) {
    return envRoot;
  }
  return process.cwd();
}

function resolveBootSession() {
  const sessionArg = process.argv.find((arg) => arg.startsWith('--foliole-boot-session='));
  return sessionArg?.slice('--foliole-boot-session='.length) || process.env.FOLIOLE_BOOT_SESSION || null;
}

async function appendJsonLine(filePath: string, payload: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function writeJson(filePath: string, payload: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function createBootEvent(stage: string, payload: unknown, source: BootEventSource) {
  return {
    head: process.env.FOLIOLE_RUNTIME_HEAD ?? null,
    payload,
    pid: process.pid,
    session: resolveBootSession(),
    source,
    stage,
    timestamp: new Date().toISOString()
  };
}

export function resolveBootArtifactPaths(repoRoot?: string) {
  const markerRoot = repoRoot ?? resolveRepoRoot();
  const logDir = repoRoot ? path.join(repoRoot, 'logs', 'windows') : resolveWindowsDiagnosticLogDir();
  return {
    bridgeReadyMarkerPath: path.join(markerRoot, BRIDGE_READY_MARKER_FILE),
    eventLogPath: path.join(logDir, path.basename(BOOT_EVENT_LOG)),
    readyMarkerPath: path.join(markerRoot, READY_MARKER_FILE),
    repoRoot: markerRoot,
    windowVisibleMarkerPath: path.join(markerRoot, WINDOW_VISIBLE_MARKER_FILE)
  };
}

async function persistBootEvent(event: ReturnType<typeof createBootEvent>) {
  const paths = resolveBootArtifactPaths();
  console.info('[boot-report]', {
    eventLogPath: paths.eventLogPath,
    pid: event.pid,
    readyMarkerPath: paths.readyMarkerPath,
    repoRoot: paths.repoRoot,
    source: event.source,
    stage: event.stage
  });
  await appendJsonLine(paths.eventLogPath, event);
  if (event.stage === 'app_ready') {
    await writeJson(paths.readyMarkerPath, event);
  }
  if (event.stage === 'bridge_ready') {
    await writeJson(paths.bridgeReadyMarkerPath, event);
  }
  if (event.stage === 'window_visible') {
    await writeJson(paths.windowVisibleMarkerPath, event);
  }
}

function notifyRendererAppReady(event: ReturnType<typeof createBootEvent>) {
  if (event.stage !== 'app_ready' || event.source !== 'renderer') {
    return;
  }
  rendererAppReady = true;
  const waiters = rendererAppReadyWaiters;
  rendererAppReadyWaiters = [];
  waiters.forEach((resolve) => resolve());
}

function shouldWaitForBootEvent(stage: string) {
  return WAITED_BOOT_EVENT_STAGES.has(stage);
}

function appendQueuedBootEvent(event: ReturnType<typeof createBootEvent>, waitForWrite: boolean) {
  const write = bootEventQueue.then(async () => {
    await persistBootEvent(event);
    notifyRendererAppReady(event);
  });
  bootEventQueue = write.catch((error) => {
    appendMainProcessDiagnosticLog('boot_log_failed', {
      error,
      stage: event.stage
    });
  });
  return waitForWrite ? write : Promise.resolve();
}

export async function appendBootEvent(stage: string, payload: unknown = null, source: BootEventSource = 'main') {
  await appendQueuedBootEvent(createBootEvent(stage, payload, source), shouldWaitForBootEvent(stage));
}

export async function bootReport(stage: string, payload: unknown = null) {
  await appendQueuedBootEvent(createBootEvent(stage, payload, 'renderer'), shouldWaitForBootEvent(stage));
}

export async function flushBootEvents() {
  await bootEventQueue;
}

export function waitForRendererAppReady() {
  if (rendererAppReady) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    rendererAppReadyWaiters.push(resolve);
  });
}

export function resetBootEventStateForTests() {
  bootEventQueue = Promise.resolve();
  rendererAppReady = false;
  rendererAppReadyWaiters = [];
}
