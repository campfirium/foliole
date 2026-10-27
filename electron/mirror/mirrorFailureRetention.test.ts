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
import type { DesktopTaskHandle } from '../desktopTaskTypes.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as renderer from './articleMirrorRenderWorkerClient.js';
import { flushMirrorSync as flushPendingMirrorSync, scheduleMirrorSync } from './mirrorSyncScheduler.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

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

async function exists(name: string) {
  return fs.access(mirrorPath(`${name}.md`)).then(() => true, () => false);
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
async function flushMirrorSync() {
  let done = false;
  let failure: unknown;
  const flush = flushPendingMirrorSync().then(() => { done = true; }, (error: unknown) => {
    failure = error;
    done = true;
  });
  if (vi.isFakeTimers()) await settle(async () => done);
  await flush;
  if (failure) throw failure;
}


function captureMirrorTask() {
  let handle: DesktopTaskHandle | undefined;
  const submit = operations.submitDesktopOperation;
  vi.spyOn(operations, 'submitDesktopOperation').mockImplementation((name, args) => {
    const task = submit(name, args);
    if (name === 'mirror-incremental') handle = task;
    return task;
  });
  return () => handle!;
}

it.each(['readFile', 'writeFile'] as const)('retains failed %s demand for explicit retry without automatic retries', async (method) => {
  clock();
  await runWithDatabaseConnectionOwner(() => save('A', 'Before'));
  await flushMirrorSync();
  const before = await record('A');
  await advance(1);
  await runWithDatabaseConnectionOwner(() => save('A', 'After'));
  const actual = fs[method];
  const io = vi.spyOn(fs, method).mockImplementation((...args: Parameters<typeof actual>) => {
    if (String(args[0]) === mirrorPath('A.md')) return Promise.reject(Object.assign(new Error('Injected OS failure'), { code: 'EACCES' }));
    return Reflect.apply(actual, fs, args);
  });
  await expect(flushMirrorSync()).rejects.toThrow('Injected OS failure');
  expect(await record('A')).toEqual(before);
  io.mockRestore();
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('Before');
  await advance(180);
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('Before');
  await flushMirrorSync();
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('After');
  expect(await record('A')).not.toEqual(before);
});

it('retains the failed and untouched portion without rerendering an already successful node', async () => {
  await runWithDatabaseConnectionOwner(() => { save('A'); save('B'); save('C'); });
  const write = fs.writeFile;
  const io = vi.spyOn(fs, 'writeFile').mockImplementation((...args) => {
    if (String(args[0]) === mirrorPath('B.md')) return Promise.reject(new Error('B write failed'));
    return Reflect.apply(write, fs, args);
  });
  await expect(flushMirrorSync()).rejects.toThrow('B write failed');
  const successful = await record('A');
  const mtime = (await fs.stat(mirrorPath('A.md'))).mtimeMs;
  expect(await record('B')).toBeUndefined();
  expect(await record('C')).toBeUndefined();
  io.mockRestore();
  const render = vi.spyOn(renderer, 'renderArticleMirrorInWorker');
  await flushMirrorSync();
  expect(render.mock.calls.map(([input]) => input.article.id).sort()).toEqual(['B', 'C']);
  expect(await record('A')).toEqual(successful);
  expect((await fs.stat(mirrorPath('A.md'))).mtimeMs).toBe(mtime);
  expect(await exists('B')).toBe(true);
  expect(await exists('C')).toBe(true);
});

it('keeps queued cancellation available to explicit retry without a timer loop', async () => {
  let release!: () => void;
  const blocker = operations.submitDesktopOperation('mirror-backfill', {
    run: () => new Promise<void>((resolve) => { release = resolve; })
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const task = captureMirrorTask();
  clock();
  await runWithDatabaseConnectionOwner(() => save('A'));
  const flushing = flushMirrorSync();
  task().cancel();
  release();
  await blocker.promise;
  let done = false;
  void flushing.then(() => { done = true; });
  await settle(async () => done);
  await flushing;
  await advance(180);
  expect(await exists('A')).toBe(false);
  expect(await record('A')).toBeUndefined();
  await flushMirrorSync();
  expect(await exists('A')).toBe(true);
});

it.each(['cancel', 'failure', 'cancel-after-render', 'cancel-current'] as const)('preserves a newer save during rendering after %s', async (mode) => {
  const task = captureMirrorTask();
  let started!: () => void;
  let release!: () => void;
  const rendering = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const render = renderer.renderArticleMirrorInWorker;
  vi.spyOn(renderer, 'renderArticleMirrorInWorker').mockImplementationOnce(async (...args) => {
    started();
    await gate;
    if (mode === 'failure') throw new Error('Generation failed');
    if (mode === 'cancel-after-render') {
      const markdown = await render(...args);
      task().cancel();
      return markdown;
    }
    return render(...args);
  });
  await runWithDatabaseConnectionOwner(() => save('A', 'V1'));
  const first = flushMirrorSync().then(() => null, (error: unknown) => error);
  await rendering;
  if (mode !== 'cancel-current') await runDesktopDatabaseWrite('foreground', () => save('A', 'V2'));
  if (mode === 'cancel' || mode === 'cancel-current') task().cancel();
  release();
  const error = await first;
  if (mode === 'failure') expect(error).toBeInstanceOf(Error);
  expect(await exists('A')).toBe(false);
  expect(await record('A')).toBeUndefined();
  await flushMirrorSync();
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain(mode === 'cancel-current' ? 'V1' : 'V2');
  expect(await record('A')).toBeTruthy();
});

it('a new save rearms automatic processing after a failed version', async () => {
  clock();
  await runWithDatabaseConnectionOwner(() => save('A', 'V1'));
  const write = vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('Write failed'));
  await expect(flushMirrorSync()).rejects.toThrow('Write failed');
  write.mockRestore();
  await advance(180);
  expect(await exists('A')).toBe(false);
  await runWithDatabaseConnectionOwner(() => save('A', 'V2'));
  await advance(59);
  expect(await exists('A')).toBe(false);
  await advance(1);
  await settle(() => exists('A'));
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('V2');
  await flushMirrorSync();
});
