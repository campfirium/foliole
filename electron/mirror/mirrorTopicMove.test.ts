// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
let documents = '';
const { showSaveDialog } = vi.hoisted(() => ({ showSaveDialog: vi.fn() }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'),
  app_log_dir: path.join(appData, 'logs'), documents_dir: documents
}) }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn(async () => {}) }));
vi.mock('electron', () => ({ dialog: { showSaveDialog }, BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' },
  systemPreferences: { getUserDefault: vi.fn(), subscribeNotification: vi.fn() } }));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';
import { handleNodeMutationCommand } from '../ipc/storageNodeMutationCommands.js';

import * as articleOutput from './articleMirrorOutput.js';
import { exportCurrentArticleMirror } from './exportCurrentArticleMirror.js';
import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';
import { rebuildAllMirrorOutput } from './mirrorOutputSync.js';
import { flushMirrorSync } from './mirrorSyncScheduler.js';
import { createMirrorTestMoveInput, resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let root = '';
let outputPath = '';
const anchorLink = { id: 'highlight', kind: 'highlight' as const, locator: { from: 0, to: 8, originalText: 'Question' } };

function save(id: string, content: string, parentNodeId: string | null = null,
  extra: Partial<Parameters<typeof upsertNodeSnapshot>[0]> = {}) {
  upsertNodeSnapshot({ nodeId: id, parentNodeId, kind: 'topic', title: id, isTitleManual: true,
    hideTitleHeading: false, content, reveal: 'Saved answer fact.', anchorLink: null, position: 0,
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2030-10-06T00:00:00.000Z', ...extra });
}
function mirror(id: string) {
  const record = loadMirrorArticleRecords().get(id)!;
  return path.join(root, 'Library', 'Mirror', record.relativePath);
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-manual-topic-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  outputPath = path.join(root, 'Export', 'article.md');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
  showSaveDialog.mockReset().mockResolvedValue({ canceled: false, filePath: outputPath });
});

afterEach(async () => {
  await flushMirrorSync();
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function seedMove() {
  save('old-folder', '', null, { kind: 'folder', reveal: null });
  save('new-folder', '', null, { kind: 'folder', reveal: null });
  save('manual', 'Moving parent body.', 'old-folder');
  save('child', 'Moving child body.', 'manual');
  save('highlight', 'Child annotation.', 'child', { anchorLink });
  save('unrelated', 'Unrelated body.');
}
function move(parentNodeId: string) {
  return handleNodeMutationCommand('move_nodes', { ...createMirrorTestMoveInput('manual', parentNodeId) });
}

it('refreshes every independent saved input in a moved manual Topic subtree', async () => {
  seedMove();
  await rebuildAllMirrorOutput();
  save('new-child', 'New saved child body.', 'manual');
  const unrelated = await fs.readFile(mirror('unrelated'), 'utf8');
  const before = (await fs.stat(mirror('unrelated'))).mtimeMs;
  const oldChild = mirror('child');
  const oldParent = mirror('manual');
  const rendered = vi.spyOn(articleOutput, 'renderSingleArticleMirror');
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  expect(move('new-folder')).toMatchObject({ movedNodeIds: ['manual'] });
  await flushMirrorSync();
  expect(loadMirrorArticleRecords().get('child')!.relativePath).toBe('new-folder/child.md');
  expect(loadMirrorArticleRecords().get('manual')!.relativePath).toBe('new-folder/manual.md');
  await expect(fs.access(oldParent)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.access(oldChild)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(loadMirrorArticleRecords().get('new-child')?.relativePath).toBe('new-folder/new-child.md');
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['manual', 'child', 'highlight', 'new-child']));
  expect(rendered.mock.calls.find(([node]) => node.id === 'child')?.[0].reveal).toBe('Saved answer fact.');
  const automatic = await fs.readFile(mirror('child'), 'utf8');
  expect(automatic).toContain('Child annotation.');
  await exportCurrentArticleMirror('child', null);
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(automatic);
  expect((await fs.stat(mirror('unrelated'))).mtimeMs).toBe(before);
  await rebuildAllMirrorOutput();
  await expect(fs.readFile(mirror('child'), 'utf8')).resolves.toBe(automatic);
  await expect(fs.readFile(mirror('unrelated'), 'utf8')).resolves.toBe(unrelated);
});

it('keeps moved inputs safe across Trash, restore and permanent deletion', async () => {
  seedMove();
  await rebuildAllMirrorOutput();
  move('new-folder');
  await flushMirrorSync();
  const before = (await fs.stat(mirror('unrelated'))).mtimeMs;
  const nodeIds = ['manual', 'child', 'highlight'];
  handleNodeMutationCommand('soft_delete_nodes', { nodeIds, deletedAt: '2030-10-06T00:02:00.000Z' });
  await flushMirrorSync();
  expect(loadMirrorArticleRecords().has('child')).toBe(false);
  handleNodeMutationCommand('restore_nodes', { nodeIds });
  await flushMirrorSync();
  await expect(fs.readFile(mirror('child'), 'utf8')).resolves.toContain('Child annotation.');
  const previous = mirror('child');
  await handleNodeMutationCommand('delete_nodes_permanently', { nodeIds });
  await flushMirrorSync();
  await expect(fs.access(previous)).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await fs.stat(mirror('unrelated'))).mtimeMs).toBe(before);
});

it('keeps a colliding destination owner and only commits the final moved saved version', async () => {
  seedMove();
  save('collision', 'Destination owner body.', 'new-folder', { title: 'child' });
  await rebuildAllMirrorOutput();
  const before = (await fs.stat(mirror('unrelated'))).mtimeMs;
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    move('old-folder');
    save('child', 'Final child body.', 'manual', { reveal: 'Final child answer.' });
    return render(...input);
  });
  move('new-folder');
  await flushMirrorSync();
  await flushMirrorSync();
  expect(loadMirrorArticleRecords().get('child')!.relativePath).toBe('old-folder/child.md');
  await expect(fs.readFile(mirror('child'), 'utf8')).resolves.toContain('==Final ch==');
  await expect(fs.readFile(mirror('collision'), 'utf8')).resolves.toContain('Destination owner body.');
  expect(mirror('collision')).not.toBe(mirror('child'));
  expect((await fs.stat(mirror('unrelated'))).mtimeMs).toBe(before);
});

it('rolls back a failed move without changing either saved output scope', async () => {
  seedMove();
  await rebuildAllMirrorOutput();
  const previous = mirror('child');
  const before = (await fs.stat(previous)).mtimeMs;
  openDatabaseConnection().sqlite.exec(`CREATE TEMP TRIGGER reject_move BEFORE UPDATE OF parent_id ON nodes
    WHEN OLD.id = 'manual' BEGIN SELECT RAISE(ABORT, 'injected move failure'); END`);
  expect(() => move('new-folder')).toThrow('injected move failure');
  await flushMirrorSync();
  expect(loadWorkspaceSnapshot({ includeBody: false })!.nodesById.manual!.parentNodeId).toBe('old-folder');
  expect(mirror('child')).toBe(previous);
  expect((await fs.stat(previous)).mtimeMs).toBe(before);
});

it('preserves two independent files when the moved child collides at its destination', async () => {
  seedMove();
  save('collision', 'Existing destination body.', 'new-folder', { title: 'child' });
  await rebuildAllMirrorOutput();
  move('new-folder');
  await flushMirrorSync();
  const moved = mirror('child');
  expect(moved).not.toBe(mirror('collision'));
  expect(path.dirname(moved)).toBe(path.join(root, 'Library', 'Mirror', 'new-folder'));
  await expect(fs.readFile(moved, 'utf8')).resolves.toContain('Child annotation.');
  await expect(fs.readFile(mirror('collision'), 'utf8')).resolves.toContain('Existing destination body.');
});
