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

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { drainDirtyNodeSyncVersions } from '../database/nodeSyncVersionDrain.js';
import { restoreNodesWithParents, softDeleteNodesWithParents } from '../database/nodeTrashTransitions.js';
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as articleOutput from './articleMirrorOutput.js';
import { resolveArticleIdsFromNodeId } from './mirrorArticleResolver.js';
import { loadMirrorArticleRecords, saveMirrorArticleRecord } from './mirrorOutputStorage.js';
import { rebuildAllMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

vi.mock('./mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

let root = '';
const mirror = (name: string) => path.join(root, 'Library', 'Mirror', name);
function save(id: string, title: string, kind: 'topic' | 'folder' = 'topic', parentNodeId: string | null = null) {
  upsertNodeSnapshot({ nodeId: id, parentNodeId, kind, title, isTitleManual: true, hideTitleHeading: false,
    content: `Body for ${id}.`, reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2030-10-06T00:00:00.000Z' });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-trash-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  initializeDatabase();
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
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function trash() {
  softDeleteNodesWithParents({ nodeIds: ['article'], deletedAt: '2030-10-06T00:01:00.000Z' });
}
function restore() {
  expect(restoreNodesWithParents({ nodeIds: ['article'] }).restoredNodeIds).toEqual(['article']);
}
async function sync() {
  const ids = resolveArticleIdsFromNodeId('article');
  expect(ids).toEqual(['article']);
  return syncIncrementalMirrorOutput(ids);
}

it('removes an existing mirror and record on Trash, then restores the saved body without touching unrelated output', async () => {
  const unrelated = await fs.stat(mirror('Unrelated.md'));
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  trash();
  await sync();
  expect(loadMirrorArticleRecords().has('article')).toBe(false);
  await expect(fs.access(mirror('Folder/Article.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(read).not.toHaveBeenCalled();
  restore();
  await sync();
  expect(loadMirrorArticleRecords().get('article')!.relativePath).toBe('Folder/Article.md');
  await expect(fs.readFile(mirror('Folder/Article.md'), 'utf8')).resolves.toContain('Body for article.');
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['article']));
  expect((await fs.stat(mirror('Unrelated.md'))).mtimeMs).toBe(unrelated.mtimeMs);
});

it('preserves the latest live article when Trash is undone before queued output runs', async () => {
  trash();
  restore();
  await sync();
  await expect(fs.readFile(mirror('Folder/Article.md'), 'utf8')).resolves.toContain('Body for article.');
  expect(loadMirrorArticleRecords().has('article')).toBe(true);
});

it('does not write an existing article back if it enters Trash during rendering', async () => {
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    trash();
    return render(...input);
  });
  await sync();
  expect(loadMirrorArticleRecords().has('article')).toBe(false);
  await expect(fs.access(mirror('Folder/Article.md'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('restores safely after another article takes the vacated name', async () => {
  trash();
  await sync();
  save('replacement', 'Article', 'topic', 'folder');
  await syncIncrementalMirrorOutput(['replacement']);
  restore();
  await sync();
  const records = loadMirrorArticleRecords();
  expect(records.get('article')!.relativePath).not.toBe(records.get('replacement')!.relativePath);
  for (const id of ['article', 'replacement']) {
    await expect(fs.readFile(mirror(records.get(id)!.relativePath), 'utf8')).resolves.toContain(`Body for ${id}.`);
  }
});

it('does not delete a surviving owner when the trashed record aliases its physical path', async () => {
  saveMirrorArticleRecord({ articleId: 'article', relativePath: 'Unrelated.md', mirroredAt: '2030-01-01T00:00:00Z' });
  trash();
  await sync();
  expect(loadMirrorArticleRecords().has('article')).toBe(false);
  await expect(fs.readFile(mirror('Unrelated.md'), 'utf8')).resolves.toContain('Body for unrelated.');
});

it('keeps the deletion record until filesystem removal succeeds and can retry', async () => {
  trash();
  const remove = fs.rm.bind(fs);
  const failure = vi.spyOn(fs, 'rm').mockImplementation(async (file, options) => {
    if (String(file) === mirror('Folder/Article.md')) throw new Error('injected removal failure');
    return remove(file, options);
  });
  await expect(sync()).rejects.toThrow('injected removal failure');
  expect(loadMirrorArticleRecords().has('article')).toBe(true);
  failure.mockRestore();
  await sync();
  expect(loadMirrorArticleRecords().has('article')).toBe(false);
});

it('does not record a restored article as mirrored until its file is written successfully', async () => {
  trash();
  await sync();
  restore();
  const write = vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('injected output failure'));
  await expect(sync()).rejects.toThrow('injected output failure');
  expect(loadMirrorArticleRecords().has('article')).toBe(false);
  await expect(fs.access(mirror('Folder/Article.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  write.mockRestore();
  await sync();
  await expect(fs.readFile(mirror('Folder/Article.md'), 'utf8')).resolves.toContain('Body for article.');
  expect(loadMirrorArticleRecords().has('article')).toBe(true);
});
