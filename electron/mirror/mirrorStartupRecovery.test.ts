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
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { submitDesktopOperation } from '../desktopOperations.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as mirrorRenderer from './articleMirrorRenderWorkerClient.js';
import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';
import { resumePendingMirrorOutput, rebuildAllMirrorOutput } from './mirrorOutputSync.js';
import { flushMirrorSync, scheduleMirrorSync } from './mirrorSyncScheduler.js';
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

function saveNode(
  nodeId: string,
  parentNodeId: string | null,
  kind: 'folder' | 'topic',
  title: string,
  content: string,
  updatedAt: string,
  position: number
) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId,
    kind,
    title,
    isTitleManual: true,
    hideTitleHeading: false,
    content,
    reveal: null,
    anchorLink: null,
    position,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt
  });
}

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
  saveNode(id, null, 'topic', id, body, new Date().toISOString(), 0);
  scheduleMirrorSync([id]);
}

function clock() {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
}

async function seedReopenedWork() {
  saveNode('A', null, 'topic', 'A', 'A old', '2020-01-01T00:00:00Z', 0);
  saveNode('B', null, 'topic', 'B', 'B old', '2020-01-01T00:00:00Z', 1);
  saveNode('C', null, 'topic', 'C', 'Unrelated', '2020-01-01T00:00:00Z', 2);
  await rebuildAllMirrorOutput();
  saveNode('A', null, 'topic', 'A', 'A persisted', '2029-01-01T00:00:00Z', 0);
  await fs.rm(mirrorPath('B.md'));
  closeDatabaseConnection();
  initializeDatabase();
  clock();
}

it('queues recognizable reopened work without writing, then expires B independently of a new save to A', async () => {
  await seedReopenedWork();
  const records = loadMirrorArticleRecords();
  const unrelated = await fs.stat(mirrorPath('C.md'));
  await expect(resumePendingMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 0, pending_article_count: 2 });
  expect(loadMirrorArticleRecords()).toEqual(records);
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('A old');
  expect(await exists('B')).toBe(false);
  await advance(20);
  await runWithDatabaseConnectionOwner(() => save('A', 'A newest'));
  await advance(39);
  expect(await exists('B')).toBe(false);
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('A old');
  await advance(1);
  await settle(() => exists('B'));
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('A old');
  await advance(19);
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('A old');
  await advance(1);
  await settle(async () => (await fs.readFile(mirrorPath('A.md'), 'utf8')).includes('A newest'));
  expect((await fs.stat(mirrorPath('C.md'))).mtimeMs).toBe(unrelated.mtimeMs);
});

it('allows manual rebuild to recover startup work immediately', async () => {
  await seedReopenedWork();
  await resumePendingMirrorOutput();
  await rebuildAllMirrorOutput();
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('A persisted');
  expect(await exists('B')).toBe(true);
});

it('keeps a newer save safe when startup rendering is already in flight', async () => {
  await seedReopenedWork();
  let started = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const render = mirrorRenderer.renderArticleMirrorInWorker;
  vi.spyOn(mirrorRenderer, 'renderArticleMirrorInWorker').mockImplementationOnce(async (...args) => {
    started = true;
    await gate;
    return render(...args);
  });
  await resumePendingMirrorOutput();
  await advance(60);
  await settle(async () => started);
  await runWithDatabaseConnectionOwner(() => save('A', 'New save during startup render'));
  release();
  await advance(59);
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('A old');
  await advance(1);
  await settle(async () => (await fs.readFile(mirrorPath('A.md'), 'utf8')).includes('New save during startup render'));
  expect(openDatabaseConnection().driver.queryOne('SELECT content FROM nodes WHERE id = ?', ['A']))
    .toEqual({ content: 'New save during startup render' });
});


it('keeps due startup output queued while startup discovery still holds the background resource', async () => {
  await seedReopenedWork();
  let registered = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const startup = submitDesktopOperation('mirror-backfill', { run: async (context) => {
    await resumePendingMirrorOutput(context);
    registered = true;
    await gate;
  } });
  try {
    await settle(async () => registered);
    await advance(60);
    expect(await exists('B')).toBe(false);
    release();
    await startup.promise;
    await settle(() => exists('B'));
    expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('A persisted');
  } finally {
    release();
    await startup.promise;
  }
});
