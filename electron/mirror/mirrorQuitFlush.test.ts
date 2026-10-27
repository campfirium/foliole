// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as realDelay } from 'node:timers/promises';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-mirror-scheduler-app-data';
let mockedDocumentsDir = '/tmp/foliole-mirror-scheduler-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn(async () => {}) }));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' },
  systemPreferences: { getUserDefault: vi.fn(), subscribeNotification: vi.fn() }
}));

import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { runDesktopDatabaseWrite } from '../database/desktopDatabaseWriteQueue.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import * as operations from '../desktopOperations.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as renderer from './articleMirrorRenderWorkerClient.js';
import { flushMirrorSync as flushPendingMirrorSync, scheduleMirrorSync } from './mirrorSyncScheduler.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';
import { backfillMissingMirrorOutput } from './rebuildMirrorOutput.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-scheduler-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(tempRoot, 'Library') });
});

afterEach(async () => {
  let flushed = false;
  const flush = flushMirrorSync().then(() => { flushed = true; });
  if (vi.isFakeTimers()) await settle(async () => flushed);
  await flush;
  vi.useRealTimers();
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function mirrorPath(fileName: string) {
  return path.join(tempRoot, 'Library', 'Mirror', fileName);
}

async function advance(seconds: number) {
  await vi.advanceTimersByTimeAsync(seconds * 1000);
}

async function settle(predicate: () => Promise<boolean>) {
  for (let i = 0; i < 300; i += 1) {
    await vi.advanceTimersByTimeAsync(1);
    if (await predicate()) return;
    await realDelay(2);
  }
  throw new Error('Mirror did not settle');
}

function save(id: string, body = id) {
  upsertNodeSnapshot({
    nodeId: id, parentNodeId: null, kind: 'topic', title: id,
    isTitleManual: true, hideTitleHeading: false, content: body,
    reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-03-30T00:00:00.000Z', updatedAt: new Date().toISOString()
  });
  scheduleMirrorSync([id]);
}

function clock() {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
}

function record(id: string) {
  return runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.queryOne(
    'SELECT relative_path, mirrored_at FROM mirror_articles WHERE article_id = ?', [id]));
}
async function flushMirrorSync(options?: { forQuit: boolean }) {
  let done = false;
  let failure: unknown;
  const flush = flushPendingMirrorSync(options).then(() => { done = true; }, (error: unknown) => {
    failure = error;
    done = true;
  });
  if (vi.isFakeTimers()) await settle(async () => done);
  await flush;
  if (failure) throw failure;
}


it('quit flush includes new units saved during its first render without refreshing unrelated success', async () => {
  await runWithDatabaseConnectionOwner(() => save('Unrelated'));
  await flushMirrorSync();
  const before = await record('Unrelated');
  const mtime = (await fs.stat(mirrorPath('Unrelated.md'))).mtimeMs;
  await runWithDatabaseConnectionOwner(() => save('A', 'First pending body'));
  const render = renderer.renderArticleMirrorInWorker;
  vi.spyOn(renderer, 'renderArticleMirrorInWorker').mockImplementationOnce(async (...args) => {
    await runDesktopDatabaseWrite('foreground', () => save('B', 'Saved while quitting'));
    return render(...args);
  });
  await flushMirrorSync({ forQuit: true });
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('First pending body');
  expect(await fs.readFile(mirrorPath('B.md'), 'utf8')).toContain('Saved while quitting');
  expect(await record('B')).toBeTruthy();
  expect(await record('Unrelated')).toEqual(before);
  expect((await fs.stat(mirrorPath('Unrelated.md'))).mtimeMs).toBe(mtime);
});

it('quit flush settles repeated newer saves after an already running automatic render', async () => {
  let began = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const render = renderer.renderArticleMirrorInWorker;
  let versions = 0;
  vi.spyOn(renderer, 'renderArticleMirrorInWorker').mockImplementation(async (...args) => {
    versions += 1;
    if (versions === 1) { began = true; await gate; }
    if (versions <= 5) await runDesktopDatabaseWrite('foreground', () => save('A', `Version ${versions + 1}`));
    return render(...args);
  });
  clock();
  await runWithDatabaseConnectionOwner(() => save('A', 'Version 1'));
  await advance(60);
  await settle(async () => began);
  const quitting = flushMirrorSync({ forQuit: true });
  release();
  await quitting;
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('Version 6');
  expect(await record('A')).toBeTruthy();
  expect(versions).toBeGreaterThanOrEqual(6);
});

it('quit flush retries a prior failed demand once after OS recovery before its deadline', async () => {
  await runWithDatabaseConnectionOwner(() => save('A', 'Failed pending body'));
  const io = vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(Object.assign(new Error('OS denied'), { code: 'EACCES' }));
  await expect(flushPendingMirrorSync()).rejects.toThrow('OS denied');
  io.mockRestore();
  await flushMirrorSync({ forQuit: true });
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('Failed pending body');
  expect(await record('A')).toBeTruthy();
});

it('quit flush reports a continuing OS failure without an immediate retry cycle', async () => {
  await runWithDatabaseConnectionOwner(() => save('A'));
  const io = vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('OS denied'));
  await expect(flushPendingMirrorSync({ forQuit: true })).rejects.toThrow('OS denied');
  expect(io).toHaveBeenCalledTimes(1);
  expect(await record('A')).toBeUndefined();
  io.mockRestore();
});

it('quit consumes retained demand when the render already in flight fails', async () => {
  let started!: () => void;
  let release!: () => void;
  const began = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  vi.spyOn(renderer, 'renderArticleMirrorInWorker').mockImplementationOnce(async () => {
    started();
    await gate;
    throw new Error('Earlier render failed');
  });
  await runWithDatabaseConnectionOwner(() => save('A', 'Current saved body'));
  const earlier = flushPendingMirrorSync().catch((error: unknown) => error);
  await began;
  const quitting = flushPendingMirrorSync({ forQuit: true });
  release();
  expect(await earlier).toBeInstanceOf(Error);
  await quitting;
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('Current saved body');
  expect(await record('A')).toBeTruthy();
});

it('quit reports cancellation without repeatedly resubmitting the cancelled demand', async () => {
  const submit = operations.submitDesktopOperation;
  const spy = vi.spyOn(operations, 'submitDesktopOperation').mockImplementation((...args) => {
    const handle = submit(...args);
    if (args[0] === 'mirror-incremental') handle.cancel();
    return handle;
  });
  await runWithDatabaseConnectionOwner(() => save('A'));
  await expect(flushPendingMirrorSync({ forQuit: true })).rejects.toThrow('Mirror quit flush cancelled');
  expect(spy).toHaveBeenCalledTimes(1);
  expect(await record('A')).toBeUndefined();
  spy.mockRestore();
});

it('quit waits for an existing startup mirror render and drains its own pending saves', async () => {
  let started!: () => void;
  let release!: () => void;
  const began = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const render = renderer.renderArticleMirrorInWorker;
  vi.spyOn(renderer, 'renderArticleMirrorInWorker').mockImplementationOnce(async (...args) => {
    started();
    await gate;
    return render(...args);
  });
  await runWithDatabaseConnectionOwner(() => save('A', 'Earlier startup body'));
  const startup = operations.submitDesktopOperation('mirror-backfill', { run: backfillMissingMirrorOutput });
  await began;
  await runDesktopDatabaseWrite('foreground', () => { save('A', 'Current quit body'); save('B', 'New quit unit'); });
  const quitting = flushPendingMirrorSync({ forQuit: true });
  release();
  await startup.promise;
  await quitting;
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('Current quit body');
  expect(await fs.readFile(mirrorPath('B.md'), 'utf8')).toContain('New quit unit');
});
