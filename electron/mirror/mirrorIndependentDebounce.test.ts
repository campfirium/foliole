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
import { submitDesktopOperation } from '../desktopOperations.js';
import { desktopTaskScheduler } from '../desktopTaskScheduler.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as mirrorRenderer from './articleMirrorRenderWorkerClient.js';
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

it('waits until 105 after saves at 0, 20 and 45 without a maximum wait', async () => {
  clock();
  await runWithDatabaseConnectionOwner(() => save('A', 'V0'));
  await advance(20);
  await runWithDatabaseConnectionOwner(() => save('A', 'V20'));
  await advance(25);
  await runWithDatabaseConnectionOwner(() => save('A', 'V45'));
  await advance(59);
  expect(await exists('A')).toBe(false);
  await advance(1);
  await settle(() => exists('A'));
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('V45');
});

it('exports B at 80 and A at 100 independently', async () => {
  clock();
  await runWithDatabaseConnectionOwner(() => save('A'));
  await advance(20);
  await runWithDatabaseConnectionOwner(() => save('B'));
  await advance(20);
  await runWithDatabaseConnectionOwner(() => save('A', 'A40'));
  await advance(40);
  await settle(() => exists('B'));
  expect(await exists('A')).toBe(false);
  await advance(20);
  await settle(() => exists('A'));
});

it('keeps a continuously edited node waiting while another node completes', async () => {
  clock();
  await runWithDatabaseConnectionOwner(() => save('B'));
  for (let i = 0; i < 8; i += 1) {
    await runWithDatabaseConnectionOwner(() => save('A', `V${i}`));
    await advance(20);
  }
  await settle(() => exists('B'));
  expect(await exists('A')).toBe(false);
  await advance(40);
  await settle(() => exists('A'));
});

it('revokes eligibility when an expired node is edited while queued', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const blocker = submitDesktopOperation('mirror-backfill', { run: () => gate });
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  clock();
  await runWithDatabaseConnectionOwner(() => save('A'));
  await advance(60);
  await runWithDatabaseConnectionOwner(() => save('A', 'Queued V2'));
  release();
  await blocker.promise;
  await advance(59);
  expect(await exists('A')).toBe(false);
  await advance(1);
  await settle(() => exists('A'));
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('Queued V2');
});

it('saves foreground content during worker rendering and waits again for V2', async () => {
  let started = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const render = mirrorRenderer.renderArticleMirrorInWorker;
  vi.spyOn(mirrorRenderer, 'renderArticleMirrorInWorker').mockImplementationOnce(async (...args) => {
    started = true;
    await gate;
    return render(...args);
  });
  clock();
  await runWithDatabaseConnectionOwner(() => save('A', 'V1'));
  await advance(60);
  await settle(async () => started);
  const saved = runDesktopDatabaseWrite('foreground', () => { save('A', 'V2'); save('B', 'Foreground body'); });
  let complete = false;
  void saved.then(() => { complete = true; });
  await settle(async () => complete);
  expect(await exists('A')).toBe(false);
  expect(openDatabaseConnection().driver.queryOne('SELECT content FROM nodes WHERE id = ?', ['B']))
    .toEqual({ content: 'Foreground body' });
  release();
  await advance(59);
  expect(await exists('A')).toBe(false);
  await advance(1);
  await settle(() => exists('A'));
  expect(await fs.readFile(mirrorPath('A.md'), 'utf8')).toContain('V2');
});

it('allows foreground writes between multiple expired nodes', async () => {
  let renders = 0;
  let writes = 0;
  const render = mirrorRenderer.renderArticleMirrorInWorker;
  vi.spyOn(mirrorRenderer, 'renderArticleMirrorInWorker').mockImplementation(async (...args) => {
    renders += 1;
    let saved = false;
    const write = runDesktopDatabaseWrite('foreground', () => {
      saveNode('foreground', null, 'topic', 'Foreground', `Write ${renders}`, new Date().toISOString(), 0);
      writes += 1;
    }).then(() => { saved = true; });
    await settle(async () => saved);
    expect(await exists(args[0].article.title)).toBe(false);
    await write;
    return render(...args);
  });
  clock();
  await runWithDatabaseConnectionOwner(() => save('A'));
  await runWithDatabaseConnectionOwner(() => save('B'));
  await advance(60);
  await settle(async () => await exists('A') && await exists('B'));
  expect(writes).toBe(2);
  expect(await runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.queryOne(
    'SELECT content FROM nodes WHERE id = ?', ['foreground'])))
    .toEqual({ content: 'Write 2' });
  expect(desktopTaskScheduler.hasHigherPriorityPending('background')).toBe(false);
});
