// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { runDesktopDatabaseWrite } from '../database/desktopDatabaseWriteQueue.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { submitDesktopOperation } from '../desktopOperations.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as mirrorRenderer from './articleMirrorRenderWorkerClient.js';
import * as articleMirror from './exportArticleMirror.js';
import { flushMirrorSync, scheduleMirrorSync } from './mirrorSyncScheduler.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';
import { rebuildMirrorOutput } from './rebuildMirrorOutput.js';
import * as mirrorOutput from './rebuildMirrorOutput.js';

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
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('leaves a changing source queued for a later flush instead of retrying in the same operation', async () => {
  saveNode('changing', null, 'topic', 'Changing', 'Latest body.', '2026-03-30T00:00:00.000Z', 0);
  const sync = vi.spyOn(mirrorOutput, 'syncIncrementalMirrorOutput').mockImplementationOnce(async () => {
    scheduleMirrorSync(['changing']);
    return { failed_article_count: 0, pending_article_count: 1, queued_article_count: 0,
      rebuilt_article_count: 0, updated_at: '2026-03-30T00:00:00.000Z' };
  });
  scheduleMirrorSync(['changing']);
  await flushMirrorSync();
  expect(sync).toHaveBeenCalledTimes(1);
  await expect(fs.access(mirrorPath('Changing.md'))).rejects.toThrow();
  await flushMirrorSync();
  expect(sync).toHaveBeenCalledTimes(2);
  await expect(fs.readFile(mirrorPath('Changing.md'), 'utf8')).resolves.toContain('Latest body.');
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

it.each(['incremental', 'backfill'] as const)('persists edits during %s mirror rendering and exports the newer body', async (mode) => {
  saveNode('editable', null, 'topic', 'Editable', 'Before', '2026-03-30T00:00:00.000Z', 0);
  let started!: () => void;
  let release!: () => void;
  const rendering = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const render = mirrorRenderer.renderArticleMirrorInWorker;
  vi.spyOn(mirrorRenderer, 'renderArticleMirrorInWorker').mockImplementationOnce(async (...args) => {
    started();
    await gate;
    return render(...args);
  });
  if (mode === 'incremental') scheduleMirrorSync(['editable']);
  const mirror = mode === 'incremental' ? flushMirrorSync() : submitDesktopOperation('mirror-backfill', {
    run: (context) => mirrorOutput.backfillMissingMirrorOutput(context)
  }).promise;
  await rendering;
  const save = runDesktopDatabaseWrite('foreground', () => {
    saveNode('editable', null, 'topic', 'Editable', 'After', '2030-03-30T00:00:00.000Z', 0);
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const savedWhileRendering = await Promise.race([
      save.then(() => true),
      new Promise<boolean>((resolve) => { timeout = setTimeout(() => resolve(false), 1000); })
    ]);
    expect(savedWhileRendering).toBe(true);
  } finally {
    clearTimeout(timeout);
    release();
    await Promise.all([save, mirror]);
  }
  closeDatabaseConnection();
  expect(openDatabaseConnection().driver.queryOne('SELECT content FROM nodes WHERE id = ?', ['editable']))
    .toEqual({ content: 'After' });
  await expect(fs.readFile(mirrorPath('Editable.md'), 'utf8')).resolves.toContain('After');
});

it('flushes automatic mirror updates through the same incremental path used by rebuilds', async () => {
  saveNode('node-first', null, 'topic', 'Same Title', 'First body.', '2026-03-30T00:00:00.000Z', 0);
  saveNode('node-second', null, 'topic', 'Same Title', 'Second body.', '2026-03-30T00:00:00.000Z', 1);

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 2, queued_article_count: 2 });

  const mirrorEntries = await fs.readdir(mirrorPath('.'));
  const dedupedFileName = mirrorEntries.find((entry) => entry.startsWith('Same Title') && entry !== 'Same Title.md');
  expect(dedupedFileName).toBeTruthy();

  saveNode('node-second', null, 'topic', 'Same Title', 'Second body updated.', '2030-03-30T00:00:00.000Z', 1);

  scheduleMirrorSync(['node-second']);
  await flushMirrorSync();

  await expect(fs.readFile(mirrorPath('Same Title.md'), 'utf8')).resolves.toContain('First body.');
  await expect(fs.readFile(mirrorPath(dedupedFileName!), 'utf8')).resolves.toContain('Second body updated.');
});

it('limits automatic mirror flushes to scheduled articles', async () => {
  saveNode('node-first', null, 'topic', 'First Title', 'First body.', '2026-03-30T00:00:00.000Z', 0);
  saveNode('node-second', null, 'topic', 'Second Title', 'Second body.', '2026-03-30T00:00:00.000Z', 1);
  await rebuildMirrorOutput();
  await fs.rm(mirrorPath('First Title.md'));

  saveNode('node-second', null, 'topic', 'Second Title', 'Second body updated.', '2030-03-30T00:00:00.000Z', 1);

  scheduleMirrorSync(['node-second']);
  await flushMirrorSync();

  await expect(fs.access(mirrorPath('First Title.md'))).rejects.toThrow();
  await expect(fs.readFile(mirrorPath('Second Title.md'), 'utf8')).resolves.toContain('Second body updated.');
});

it('does not resolve mirror articles until flush', async () => {
  saveNode('node-first', null, 'topic', 'First Title', 'First body.', '2026-03-30T00:00:00.000Z', 0);
  const resolveSpy = vi.spyOn(articleMirror, 'resolveArticleIdsFromNodeId');

  scheduleMirrorSync(['node-first']);

  expect(resolveSpy).not.toHaveBeenCalled();

  await flushMirrorSync();

  expect(resolveSpy).toHaveBeenCalledWith('node-first');
});

it('syncs article mirrors when their parent folder moves', async () => {
  saveNode('folder-projects', null, 'folder', 'Projects', '', '2026-03-30T00:00:00.000Z', 0);
  saveNode('folder-research', 'folder-projects', 'folder', 'Research', '', '2026-03-30T00:00:00.000Z', 1);
  saveNode('node-article', 'folder-research', 'topic', 'Mirror Demo', 'Nested body.', '2026-03-30T00:00:00.000Z', 2);
  await rebuildMirrorOutput();

  saveNode('folder-research', 'folder-projects', 'folder', 'Archive', '', '2030-03-30T00:00:00.000Z', 1);

  scheduleMirrorSync(['folder-research']);
  await flushMirrorSync();

  await expect(fs.access(mirrorPath(path.join('Projects', 'Research', 'Mirror Demo.md')))).rejects.toThrow();
  await expect(fs.readFile(mirrorPath(path.join('Projects', 'Archive', 'Mirror Demo.md')), 'utf8')).resolves.toContain('Nested body.');
});

it('syncs the explicit manual child Topic without changing its parent', async () => {
  saveNode('node-article', null, 'topic', 'Mirror Demo', 'Parent body.', '2026-03-30T00:00:00.000Z', 0);
  saveNode('node-child-topic', 'node-article', 'topic', 'Key Point', 'Child body.', '2026-03-30T00:00:00.000Z', 1);
  await rebuildMirrorOutput();

  saveNode('node-child-topic', 'node-article', 'topic', 'Key Point', 'Child body updated.', '2030-03-30T00:00:00.000Z', 1);

  scheduleMirrorSync(['node-child-topic']);
  await flushMirrorSync();

  await expect(fs.readFile(mirrorPath('Key Point.md'), 'utf8')).resolves.toContain('Child body updated.');
  await expect(fs.readFile(mirrorPath('Mirror Demo.md'), 'utf8')).resolves.not.toContain('Child body updated.');
});

it('does not run an incremental full scan when scheduled nodes resolve to no articles', async () => {
  saveNode('node-first', null, 'topic', 'First Title', 'First body.', '2026-03-30T00:00:00.000Z', 0);
  saveNode('folder-node', null, 'folder', 'Folder', '', '2026-03-30T00:00:00.000Z', 1);
  await rebuildMirrorOutput();
  await fs.rm(mirrorPath('First Title.md'));

  scheduleMirrorSync(['folder-node']);
  await flushMirrorSync();

  await expect(fs.access(mirrorPath('First Title.md'))).rejects.toThrow();
});

it('consumes explicit mutation article inputs without resolving them again at flush', async () => {
  saveNode('explicit', null, 'topic', 'Explicit', 'Saved explicit body.', '2026-03-30T00:00:00.000Z', 0);
  const resolve = vi.spyOn(articleMirror, 'resolveArticleIdsFromNodeId');
  scheduleMirrorSync([], ['explicit']);
  await flushMirrorSync();
  expect(resolve).not.toHaveBeenCalled();
  await expect(fs.readFile(mirrorPath('Explicit.md'), 'utf8')).resolves.toContain('Saved explicit body.');
});
