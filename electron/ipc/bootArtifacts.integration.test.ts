// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { resolveElectronDevArtifactPaths, readElectronDevSnapshot, waitForElectronDevCondition, writeElectronDevClientState } from '../../scripts/desktop/electron-dev-control-state.mjs';
import { readClientState, saveClientState } from '../../scripts/windows/windows-client-native-state.mjs';
import { resolveWindowsNativePaths } from '../../scripts/windows/windows-native-paths.mjs';
import { writeRendererReloadIntent } from '../../scripts/windows/write-renderer-reload-intent.mjs';
import { writeRestartIntent } from '../../scripts/windows/write-restart-intent.mjs';
import { installDevRendererReloadIntentWatcher } from '../devRendererReloadIntent.js';
import { writeDevRestartDeliveryMarker } from '../devRestartDelivery.js';
import { createNodeFileSystem } from '../devRestartIntentSupport.js';

vi.mock('../diagnostics/mainProcessDiagnostics.js', () => ({ appendMainProcessDiagnosticLog: vi.fn() }));

import { appendBootEvent, bootReport, flushBootEvents, resetBootEventStateForTests } from './boot.js';

const originalWorkdir = process.env.FOLIOLE_WORKDIR;
const originalSession = process.env.FOLIOLE_BOOT_SESSION;
const roots: string[] = [];
afterEach(async () => {
  await flushBootEvents();
  if (originalWorkdir === undefined) delete process.env.FOLIOLE_WORKDIR;
  else process.env.FOLIOLE_WORKDIR = originalWorkdir;
  if (originalSession === undefined) delete process.env.FOLIOLE_BOOT_SESSION;
  else process.env.FOLIOLE_BOOT_SESSION = originalSession;
  resetBootEventStateForTests();
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-artifacts-'));
  roots.push(root);
  process.env.FOLIOLE_WORKDIR = root;
  process.env.FOLIOLE_BOOT_SESSION = 'artifact-session';
  return root;
}

it('observes startup from real marker files without adding files to the workdir root', async () => {
  const root = createRoot();
  const paths = resolveElectronDevArtifactPaths(root);
  await writeElectronDevClientState(paths, { shellPid: process.pid, supervisorPid: process.pid });
  const ready = waitForElectronDevCondition({
    evaluate: () => readElectronDevSnapshot(paths).running,
    stateRoot: root,
    signal: new AbortController().signal,
    additionalRoots: [path.dirname(paths.appReadyFile)],
    label: 'startup markers', timeoutMs: 3000
  });
  await bootReport('app_ready');
  await bootReport('bridge_ready', { bridgeAvailable: true });
  await appendBootEvent('window_visible', { isVisible: true });
  await expect(ready).resolves.toBe(true);
  const windows = resolveWindowsNativePaths(root);
  expect(windows.appReadyFile).toBe(paths.appReadyFile);
  expect(windows.bridgeReadyFile).toBe(paths.bridgeReadyFile);
  expect(windows.windowVisibleFile).toBe(paths.windowVisibleFile);
  expect(fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isFile())).toEqual([]);
});

it('round trips a renderer reload request and receipt without files at the workdir root', async () => {
  const root = createRoot();
  let reloads = 0;
  const watcher = installDevRendererReloadIntentWatcher({
    cwd: root, env: { ELECTRON_RENDERER_URL: 'http://localhost' },
    getWindows: () => [{ isDestroyed: () => false, webContents: { reloadIgnoringCache: () => { reloads += 1; } } }]
  });
  try {
    const request = await writeRendererReloadIntent({ head: 'head', reason: 'artifact-test', rootDir: root });
    watcher?.checkNow();
    const receipt = JSON.parse(fs.readFileSync(resolveWindowsNativePaths(root).reloadDeliveryFile, 'utf8'));
    expect(receipt.nonce).toBe(request.intent.nonce);
    expect(reloads).toBe(1);
    expect(fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isFile())).toEqual([]);
  } finally {
    watcher?.close();
  }
});


it('keeps restart request nonces and delivery receipts in the same temporary directory', async () => {
  const root = createRoot();
  const request = await writeRestartIntent({ head: 'head', reason: 'artifact-test', rootDir: root });
  writeDevRestartDeliveryMarker({
    fileSystem: createNodeFileSystem(),
    intent: request.intent,
    intentPath: request.filePath,
    logger: { error: (message) => { throw new Error(message); } }
  });
  const receipt = JSON.parse(fs.readFileSync(resolveWindowsNativePaths(root).restartDeliveryFile, 'utf8'));
  expect(receipt.nonce).toBe(request.intent.nonce);
  const next = await writeRestartIntent({ head: 'head', reason: 'artifact-test', rootDir: root });
  expect(next.intent.nonce).toBe(request.intent.nonce + 1);
  expect(fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isFile())).toEqual([]);
});


it('persists Windows client ownership before startup creates its marker directory', async () => {
  const root = createRoot();
  const paths = resolveWindowsNativePaths(root);
  const client = { pid: process.pid, session: 'artifact-session' };
  await saveClientState(paths.stateFile, client);
  expect(readClientState(paths.stateFile)).toEqual(client);
  expect(fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isFile())).toEqual([]);
});
