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

import { isEpubGeneratedNodeId } from '../../lib/core/import/epubGeneratedNodeIdentity.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { createMultiChapterBookEpub } from '../import/readwiseBooksEndToEnd.fixture.js';
import { runEpubImport } from '../ipc/epubImport.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';
import { handleNodeMutationCommand } from '../ipc/storageNodeMutationCommands.js';

import * as articleOutput from './articleMirrorOutput.js';
import { exportCurrentArticleMirror } from './exportCurrentArticleMirror.js';
import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';
import { rebuildAllMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import { flushMirrorSync } from './mirrorSyncScheduler.js';
import { createMirrorTestMoveInput, resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let root = '';
let outputPath = '';
const anchorLink = { id: 'highlight', kind: 'highlight' as const, locator: { from: 0, to: 8, originalText: 'Question' } };

function save(id: string, content: string, parentNodeId: string | null = null,
  extra: Partial<Parameters<typeof upsertNodeSnapshot>[0]> = {}) {
  upsertNodeSnapshot({ nodeId: id, parentNodeId, kind: 'item', title: id, isTitleManual: true,
    hideTitleHeading: false, content, reveal: 'Saved answer fact.', anchorLink: null, position: 0,
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2030-10-06T00:00:00.000Z', ...extra });
}
function mirror(id: string) {
  const record = loadMirrorArticleRecords().get(id)!;
  return path.join(root, 'Library', 'Mirror', record.relativePath);
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-book-move-'));
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

let bookId = '';
let chapterIds: string[] = [];
async function seedBook() {
  save('new-folder', '', null, { kind: 'folder', reveal: null });
  save('old-folder', '', null, { kind: 'folder', reveal: null });
  save('parent-topic', 'Ancestor body.', 'old-folder', { kind: 'topic' });
  save('unrelated', 'Unrelated body.');
  const filePath = await createMultiChapterBookEpub(root, 'input.epub');
  bookId = (await runEpubImport({ adapterId: 'text_file', filePath, kind: 'epub', sourceName: 'input.epub' },
    '2026-10-06T00:00:00.000Z')).nodeId!;
  const nodes = loadWorkspaceSnapshot()!.nodesById;
  chapterIds = Object.values(nodes).filter((node) => node.parentNodeId === bookId).map((node) => node.id);
  expect(isEpubGeneratedNodeId(bookId)).toBe(false);
  expect(chapterIds.length).toBeGreaterThan(1);
  for (const id of chapterIds) expect(isEpubGeneratedNodeId(id)).toBe(true);
  save('highlight', 'Chapter annotation.', chapterIds[0], { kind: 'topic', anchorLink });
  save('manual-topic', 'Independent topic.', bookId, { kind: 'topic' });
  save('manual-item', 'Independent question.', 'manual-topic');
}
function move(parentNodeId: string) {
  return handleNodeMutationCommand('move_nodes', { ...createMirrorTestMoveInput(bookId, parentNodeId) });
}
function movedIds() { return [bookId, 'manual-topic', 'manual-item']; }

it.each(['new-folder', 'parent-topic', 'special-inbox'])(
  'moves an imported whole book into %s with local saved input and independent descendants', async (target) => {
    await seedBook();
    move('old-folder');
    await flushMirrorSync();
    await rebuildAllMirrorOutput();
    const previous = movedIds().map(mirror);
    const unrelated = await fs.readFile(mirror('unrelated'), 'utf8');
    const before = (await fs.stat(mirror('unrelated'))).mtimeMs;
    const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
    const rendered = vi.spyOn(articleOutput, 'renderSingleArticleMirror');
    expect(move(target)).toMatchObject({ movedNodeIds: expect.arrayContaining([bookId]) });
    await flushMirrorSync();
    expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set([...movedIds(), ...chapterIds, 'highlight']));
    const note = rendered.mock.calls.flatMap(([, children]) => children).find((node) => node.id === 'highlight');
    expect(note?.reveal).toBe('Saved answer fact.');
    const prefix = target === 'new-folder' ? 'new-folder/' : target === 'special-inbox' ? 'Inbox/' : 'old-folder/';
    expect(loadMirrorArticleRecords().get(bookId)!.relativePath).toBe(`${prefix}Manual Book.md`);
    for (const file of previous.filter((file) => !movedIds().map(mirror).includes(file))) {
      await expect(fs.access(file)).rejects.toMatchObject({ code: 'ENOENT' });
    }
    const body = await fs.readFile(mirror(bookId), 'utf8');
    expect(body).toContain('Chapter annotation.');
    expect(body).toContain('First chapter keeps');
    expect(body).toContain('Second chapter saves');
    expect(body).not.toContain('Independent topic.');
    for (const id of chapterIds) expect(loadMirrorArticleRecords().has(id)).toBe(false);
    for (const id of movedIds()) {
      const automatic = await fs.readFile(mirror(id), 'utf8');
      expect(loadMirrorArticleRecords().get(id)!.relativePath.startsWith(prefix)).toBe(true);
      await exportCurrentArticleMirror(id, null);
      await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(automatic);
    }
    const automatic = await Promise.all(movedIds().map((id) => fs.readFile(mirror(id), 'utf8')));
    expect((await fs.stat(mirror('unrelated'))).mtimeMs).toBe(before);
    await rebuildAllMirrorOutput();
    expect(await Promise.all(movedIds().map((id) => fs.readFile(mirror(id), 'utf8')))).toEqual(automatic);
    await expect(fs.readFile(mirror('unrelated'), 'utf8')).resolves.toBe(unrelated);
  }
);

it('moves saved descendants without prior mirror records and preserves a colliding owner', async () => {
  await seedBook();
  save('collision', 'Destination owner body.', 'new-folder', { kind: 'topic', title: 'Manual Book' });
  await syncIncrementalMirrorOutput(['collision', 'unrelated']);
  move('new-folder');
  await flushMirrorSync();
  for (const id of movedIds()) expect(loadMirrorArticleRecords().has(id)).toBe(true);
  expect(mirror(bookId)).not.toBe(mirror('collision'));
  await expect(fs.readFile(mirror('collision'), 'utf8')).resolves.toContain('Destination owner body.');
  await expect(fs.readFile(mirror('manual-item'), 'utf8')).resolves.toContain('Independent question.');
});

it('commits only the final saved book after a second move during rendering', async () => {
  await seedBook();
  await rebuildAllMirrorOutput();
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    move('old-folder');
    save('highlight', 'Final chapter annotation.', chapterIds[0], { kind: 'topic', anchorLink });
    return render(...input);
  });
  move('new-folder');
  await flushMirrorSync();
  await flushMirrorSync();
  expect(loadMirrorArticleRecords().get(bookId)!.relativePath).toBe('old-folder/Manual Book.md');
  await expect(fs.readFile(mirror(bookId), 'utf8')).resolves.toContain('Final chapter annotation.');
  for (const id of movedIds()) expect(loadMirrorArticleRecords().get(id)!.relativePath.startsWith('old-folder/')).toBe(true);
});

it('retains moved book content through Trash and restore and clears its files on permanent deletion', async () => {
  await seedBook();
  await rebuildAllMirrorOutput();
  move('new-folder');
  await flushMirrorSync();
  const previous = movedIds().map(mirror);
  const before = (await fs.stat(mirror('unrelated'))).mtimeMs;
  const nodeIds = [...movedIds(), ...chapterIds, 'highlight'];
  handleNodeMutationCommand('soft_delete_nodes', { nodeIds, deletedAt: '2030-10-06T00:02:00.000Z' });
  await flushMirrorSync();
  for (const id of movedIds()) expect(loadMirrorArticleRecords().has(id)).toBe(false);
  handleNodeMutationCommand('restore_nodes', { nodeIds });
  await flushMirrorSync();
  await expect(fs.readFile(mirror(bookId), 'utf8')).resolves.toContain('Chapter annotation.');
  await handleNodeMutationCommand('delete_nodes_permanently', { nodeIds });
  await flushMirrorSync();
  for (const file of previous) await expect(fs.access(file)).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await fs.stat(mirror('unrelated'))).mtimeMs).toBe(before);
});

it('rolls back the complete book move when the database rejects its parent change', async () => {
  await seedBook();
  await rebuildAllMirrorOutput();
  const previous = movedIds().map(mirror);
  const before = await Promise.all(previous.map((file) => fs.stat(file).then((stat) => stat.mtimeMs)));
  openDatabaseConnection().sqlite.prepare(`CREATE TEMP TRIGGER reject_book_move BEFORE UPDATE OF parent_id ON nodes
    WHEN OLD.id = ? BEGIN SELECT RAISE(ABORT, 'injected book move failure'); END`.replace('?', "'" + bookId + "'")).run();
  expect(() => move('new-folder')).toThrow('injected book move failure');
  await flushMirrorSync();
  expect(loadWorkspaceSnapshot({ includeBody: false })!.nodesById[bookId]!.parentNodeId).toBe('special-inbox');
  expect(movedIds().map(mirror)).toEqual(previous);
  expect(await Promise.all(previous.map((file) => fs.stat(file).then((stat) => stat.mtimeMs)))).toEqual(before);
});
