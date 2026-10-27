// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));

let appData = '';
let documents = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'),
  app_log_dir: path.join(appData, 'logs'), documents_dir: documents
}) }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' },
  systemPreferences: { getUserDefault: vi.fn(), subscribeNotification: vi.fn() } }));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { markDatabaseReady } from '../database/databaseReadiness.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { drainDirtyNodeSyncVersions } from '../database/nodeSyncVersionDrain.js';
import { restoreNodesWithParents, softDeleteNodesWithParents } from '../database/nodeTrashTransitions.js';
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';
import { handlePermanentDeleteNodeCommand } from '../ipc/permanentDeleteCommand.js';

import { loadMirrorArticleRecords, saveMirrorArticleRecord } from './mirrorOutputStorage.js';
import { rebuildAllMirrorOutput } from './mirrorOutputSync.js';
import { flushPermanentMirrorRetirements } from './mirrorPermanentDelete.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

vi.mock('../database/releasedBodyCollectionTask.js', () => ({ enqueueReleasedBodyCollection: vi.fn() }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('./mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

let root = '';
const mirror = (name: string) => path.join(root, 'Library', 'Mirror', name);
function save(id: string, title: string, kind: 'topic' | 'folder' = 'topic', parentNodeId: string | null = null) {
  upsertNodeSnapshot({ nodeId: id, parentNodeId, kind, title, isTitleManual: true, hideTitleHeading: false,
    content: `Body for ${id}.`, reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2030-10-06T00:00:00.000Z' });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-permanent-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  initializeDatabase();
  markDatabaseReady();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
  save('folder', 'Folder', 'folder');
  save('article', 'Article', 'topic', 'folder');
  save('unrelated', 'Unrelated');
  await rebuildAllMirrorOutput();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await drainDirtyNodeSyncVersions();
  await flushPermanentMirrorRetirements();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

async function remove(ids = ['article']) {
  softDeleteNodesWithParents({ nodeIds: ids, deletedAt: '2030-10-06T00:01:00.000Z' });
  return handlePermanentDeleteNodeCommand({ nodeIds: ids, nodeOrder: [] }, null);
}

it('retires the captured mirror before any debounce while preserving unrelated stale files', async () => {
  await fs.writeFile(mirror('unrelated-stale.txt'), 'keep me');
  const before = await fs.stat(mirror('Unrelated.md'));
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  await remove();
  expect(loadMirrorArticleRecords().has('article')).toBe(false);
  await expect(fs.access(mirror('Folder/Article.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.access(mirror('Folder'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.readFile(mirror('unrelated-stale.txt'), 'utf8')).resolves.toBe('keep me');
  expect((await fs.stat(mirror('Unrelated.md'))).mtimeMs).toBe(before.mtimeMs);
  expect(read).not.toHaveBeenCalled();
});

it('preserves a surviving owner of the removed article recorded path', async () => {
  saveMirrorArticleRecord({ articleId: 'article', relativePath: 'Unrelated.md', mirroredAt: '2030-01-01T00:00:00Z' });
  await remove();
  await expect(fs.readFile(mirror('Unrelated.md'), 'utf8')).resolves.toContain('Body for unrelated.');
});

it('retires only committed chunks when a later database deletion fails', async () => {
  const ids = Array.from({ length: 12 }, (_, i) => `part-${i}`);
  for (const id of ids) save(id, id);
  await rebuildAllMirrorOutput();
  softDeleteNodesWithParents({ nodeIds: ids, deletedAt: '2030-10-06T00:01:00.000Z' });
  openDatabaseConnection().sqlite.exec(`CREATE TRIGGER reject_delete BEFORE DELETE ON nodes
    WHEN OLD.id = 'part-0' BEGIN SELECT RAISE(ABORT, 'injected chunk failure'); END`);
  await expect(handlePermanentDeleteNodeCommand({ nodeIds: ids, nodeOrder: [] }, null))
    .rejects.toThrow('injected chunk failure');
  for (const id of ids) {
    const exists = Boolean(openDatabaseConnection().driver.queryOne('SELECT id FROM nodes WHERE id = ?', [id]));
    if (exists) {
      await expect(fs.readFile(mirror(`${id}.md`), 'utf8')).resolves.toContain(`Body for ${id}.`);
      expect(loadMirrorArticleRecords().has(id)).toBe(true);
    } else {
      await expect(fs.access(mirror(`${id}.md`))).rejects.toMatchObject({ code: 'ENOENT' });
    }
  }
  const remaining = openDatabaseConnection().driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE id LIKE ?', ['part-%']);
  expect(remaining).toHaveLength(2);
  expect(restoreNodesWithParents({ nodeIds: remaining.map((row) => row.id) }).restoredNodeIds).toHaveLength(2);
});

it('retains failed file retirement for an explicit retry after the node record has cascaded away', async () => {
  const fail = vi.spyOn(fs, 'rm').mockRejectedValue(new Error('injected cleanup failure'));
  await expect(remove()).rejects.toThrow('injected cleanup failure');
  expect(loadMirrorArticleRecords().has('article')).toBe(false);
  expect(openDatabaseConnection().driver.queryOne('SELECT id FROM nodes WHERE id = ?', ['article'])).toBeFalsy();
  await expect(fs.readFile(mirror('Folder/Article.md'), 'utf8')).resolves.toContain('Body for article.');
  fail.mockRestore();
  await flushPermanentMirrorRetirements();
  await expect(fs.access(mirror('Folder/Article.md'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('checks ownership again when a failed retirement is retried after another article takes its path', async () => {
  const fail = vi.spyOn(fs, 'rm').mockRejectedValue(new Error('injected cleanup failure'));
  await expect(remove()).rejects.toThrow('injected cleanup failure');
  fail.mockRestore();
  save('replacement', 'Article', 'topic', 'folder');
  await fs.writeFile(mirror('Folder/Article.md'), 'Replacement body.');
  await flushPermanentMirrorRetirements();
  await expect(fs.readFile(mirror('Folder/Article.md'), 'utf8')).resolves.toBe('Replacement body.');
});

it('keeps nonempty old parents when an unrelated file remains there', async () => {
  await fs.writeFile(mirror('Folder/manual.txt'), 'manual note');
  await remove();
  await expect(fs.readFile(mirror('Folder/manual.txt'), 'utf8')).resolves.toBe('manual note');
  await expect(fs.access(mirror('Folder/Article.md'))).rejects.toMatchObject({ code: 'ENOENT' });
});
