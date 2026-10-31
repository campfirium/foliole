// @vitest-environment node
import { channel } from 'node:diagnostics_channel';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', isPackaged: false },
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null, getAllWindows: () => [] },
  shell: { openPath: vi.fn() },
  nativeTheme: { shouldUseDarkColors: false, on: vi.fn() },
  systemPreferences: { subscribeNotification: vi.fn() }
}));
vi.mock('./paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(root, 'app-data'), app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), documents_dir: path.join(root, 'Documents'),
  app_log_dir: path.join(root, 'logs')
}) }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import * as renderer from '../mirror/articleMirrorRenderWorkerClient.js';
import * as storage from '../mirror/mirrorOutputStorage.js';
import { resetMirrorTestWorkspace } from '../mirror/mirrorTestDatabase.js';

import { flushBootEvents } from './boot.js';
import { handleInvokeRequest } from './commands.js';
import { saveCurrentLibraryHome } from './libraryPathBootstrap.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const invoke = (command: string, args = {}) => handleInvokeRequest({ command, args });
const document = (nodeId: string) => invoke('load_node_document', { nodeId });

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-rebuild-loading-'));
  saveCurrentLibraryHome(path.join(root, 'Library'));
  initializeDatabase();
  resetMirrorTestWorkspace();
  for (const id of ['alpha', 'beta']) {
    await invoke('create_topic', { nodeId: id, parentNodeId: null, kind: 'topic', title: id,
      content: `Complete ${id} body 中😀.\nLast paragraph.`, reveal: null, anchorLink: null,
      isTitleManual: true, hideTitleHeading: false, position: 0,
      createdAt: '2026-10-31T00:00:00.000Z', updatedAt: '2026-10-31T00:00:00.000Z' });
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await flushBootEvents();
  await fs.rm(root, { recursive: true, force: true });
});

function pauseFirstRender() {
  const entered = deferred<void>();
  const release = deferred<void>();
  const render = renderer.renderArticleMirrorInWorker;
  vi.spyOn(renderer, 'renderArticleMirrorInWorker').mockImplementationOnce(async (...args) => {
    const markdown = await render(...args);
    entered.resolve();
    await release.promise;
    return markdown;
  });
  return { entered: entered.promise, release: () => release.resolve() };
}

async function expectReadBeforeRebuildFinishes(nodeId: string, expected: unknown) {
  const queued = deferred<void>();
  const diagnostics = channel('foliole.sqlite.coordinator');
  const observe = (message: unknown) => {
    if ((message as { event: string }).event === 'queued') queued.resolve();
  };
  diagnostics.subscribe(observe);
  const read = document(nodeId);
  try {
    const outcome = await Promise.race([
      read.then(value => ({ status: 'read', value })),
      queued.promise.then(() => ({ status: 'queued-behind-rebuild', value: null }))
    ]);
    expect(outcome.status).toBe('read');
    expect(outcome.value).toEqual(expected);
  } finally { diagnostics.unsubscribe(observe); }
  return read;
}

it('reads complete documents through IPC while a settings rebuild is awaiting rendering', async () => {
  const alpha = await document('alpha');
  const beta = await document('beta');
  const gate = pauseFirstRender();
  const rebuilding = invoke('rebuild_mirror_output');
  try {
    await gate.entered;
    await expectReadBeforeRebuildFinishes('beta', beta);
    await expectReadBeforeRebuildFinishes('alpha', alpha);
    await expectReadBeforeRebuildFinishes('beta', beta);
  } finally {
    gate.release();
    await rebuilding;
  }
  expect(await document('alpha')).toEqual(alpha);
  expect(await document('beta')).toEqual(beta);
  expect(await fs.readFile(path.join(root, 'Library/Mirror/alpha.md'), 'utf8'))
    .toContain('Complete alpha body 中😀.\nLast paragraph.');
  expect(await fs.readFile(path.join(root, 'Library/Mirror/beta.md'), 'utf8'))
    .toContain('Complete beta body 中😀.\nLast paragraph.');
});

it('keeps a save made during rendering durable and rejects the stale rendered version', async () => {
  const before = await document('alpha') as Record<string, unknown>;
  const beta = await document('beta');
  const gate = pauseFirstRender();
  const rebuilding = invoke('rebuild_mirror_output');
  try {
    await gate.entered;
    await expectReadBeforeRebuildFinishes('alpha', before);
    await invoke('update_node_content', { ...before, nodeId: 'alpha', title: 'alpha', parentNodeId: null,
      content: 'Latest alpha saved during rendering. 中😀', isTitleManual: true, position: 0,
      createdAt: '2026-10-31T00:00:00.000Z', updatedAt: '2026-10-31T00:01:00.000Z' });
    expect(await document('alpha')).toMatchObject({ content: 'Latest alpha saved during rendering. 中😀' });
  } finally {
    gate.release();
    await rebuilding;
  }
  expect(await document('alpha')).toMatchObject({ content: 'Latest alpha saved during rendering. 中😀' });
  expect(await document('beta')).toEqual(beta);
  expect(await fs.readFile(path.join(root, 'Library/Mirror/alpha.md'), 'utf8'))
    .toContain('Latest alpha saved during rendering. 中😀');
});

it('serializes repeated rebuilds without holding the database during rendering', async () => {
  const events: string[] = [];
  const reset = storage.resetMirrorRoot;
  const save = storage.saveMirrorArticleRecord;
  vi.spyOn(storage, 'resetMirrorRoot').mockImplementation(async (...args) => {
    events.push('reset');
    return reset(...args);
  });
  vi.spyOn(storage, 'saveMirrorArticleRecord').mockImplementation((...args) => {
    events.push('commit');
    return save(...args);
  });
  const beta = await document('beta');
  const gate = pauseFirstRender();
  const first = invoke('rebuild_mirror_output');
  await gate.entered;
  const second = invoke('rebuild_mirror_output');
  try {
    await expectReadBeforeRebuildFinishes('beta', beta);
  } finally {
    gate.release();
    await Promise.all([first, second]);
  }
  expect(events).toEqual(['reset', 'commit', 'commit', 'reset', 'commit', 'commit']);
  expect(await document('beta')).toEqual(beta);
});
