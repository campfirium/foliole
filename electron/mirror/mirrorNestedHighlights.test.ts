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
vi.mock('electron', () => ({ dialog: { showSaveDialog }, BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' },
  systemPreferences: { getUserDefault: vi.fn(), subscribeNotification: vi.fn() } }));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { deleteNodesPermanently, restoreNodes, softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { createMultiChapterBookEpub } from '../import/readwiseBooksEndToEnd.fixture.js';
import { runEpubImport } from '../ipc/epubImport.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as articleOutput from './articleMirrorOutput.js';
import { exportCurrentArticleMirror } from './exportCurrentArticleMirror.js';
import { resolveArticleIdsFromNodeId } from './mirrorArticleResolver.js';
import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';
import { rebuildAllMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let root = '';
let outputPath = '';

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
async function syncFrom(id: string) {
  const ids = resolveArticleIdsFromNodeId(id);
  expect(ids).toHaveLength(1);
  return syncIncrementalMirrorOutput(ids);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-manual-item-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  outputPath = path.join(root, 'Export', 'article.md');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
  showSaveDialog.mockReset().mockResolvedValue({ canceled: false, filePath: outputPath });
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});


function highlight(id: string, parent: string, content: string, originalText = 'Alpha', from = 0, to = originalText.length) {
  save(id, content, parent, { kind: 'topic', reveal: null,
    anchorLink: { id: id.startsWith('sibling') ? 'sibling-anchor' : 'same-anchor', kind: 'highlight', locator: { from, to, originalText } } });
}
function seedNested() {
  save('manual', 'Alpha Beta Gamma', null, { kind: 'topic', reveal: null });
  highlight('first', 'manual', 'Alpha\n※ First note.');
  highlight('second', 'first', 'Alpha\n※ Second note.');
  highlight('third', 'second', 'Alpha\n※ Deep note.');
  save('unrelated', 'Unrelated body.', null, { kind: 'topic', reveal: null });
}
async function allPaths(id = 'third', owner = 'manual') {
  expect(resolveArticleIdsFromNodeId(id)).toEqual([owner]);
  await syncFrom(id);
  const body = await fs.readFile(mirror(owner), 'utf8');
  await exportCurrentArticleMirror(id, null);
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(body);
  await rebuildAllMirrorOutput();
  await expect(fs.readFile(mirror(owner), 'utf8')).resolves.toBe(body);
  return body;
}
function once(body: string, facts: string[]) {
  for (const fact of facts) expect(body.split(fact), `${fact}: ${body}`).toHaveLength(2);
}

it('keeps three saved highlight generations and their notes once in one owner through all entrypoints', async () => {
  seedNested();
  const body = await allPaths();
  once(body, ['First note.', 'Second note.', 'Deep note.']);
  expect(body).toContain('==Alpha==');
  expect([...loadMirrorArticleRecords().keys()].sort()).toEqual(['manual', 'unrelated']);
});

it('retains a deeper selection even when its parent text is unchanged or cannot be located', async () => {
  seedNested();
  highlight('first', 'manual', 'Alpha');
  highlight('second', 'first', 'Alpha', 'Lost source', 0, 0);
  const body = await allPaths();
  once(body, ['Lost source', 'Deep note.']);
  expect(body).not.toContain('Second note.');
});

it('keeps identical anchor identifiers scoped to their actual parents and preserves sibling notes', async () => {
  seedNested();
  highlight('sibling', 'manual', 'Beta\n※ Sibling note.', 'Beta', 6, 10);
  highlight('sibling-deep', 'sibling', 'Beta\n※ Other deep note.', 'Beta');
  const body = await allPaths();
  once(body, ['First note.', 'Second note.', 'Deep note.', 'Sibling note.', 'Other deep note.']);
  expect(body).toContain('==Beta==');
});

it('updates deep saved text during generation using only owner documents and leaves unrelated bytes and mtime intact', async () => {
  seedNested();
  await rebuildAllMirrorOutput();
  const file = mirror('unrelated');
  const before = { body: await fs.readFile(file, 'utf8'), mtime: (await fs.stat(file)).mtimeMs };
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    highlight('third', 'second', 'Alpha\n※ Current deep note.');
    return render(...input);
  });
  await syncFrom('third');
  const body = await fs.readFile(mirror('manual'), 'utf8');
  once(body, ['Current deep note.']);
  expect(body).not.toContain('Deep note.');
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['manual', 'first', 'second', 'third']));
  expect(await fs.readFile(file, 'utf8')).toBe(before.body);
  expect((await fs.stat(file)).mtimeMs).toBe(before.mtime);
  const mtime = (await fs.stat(mirror('manual'))).mtimeMs;
  await syncFrom('third');
  expect((await fs.stat(mirror('manual'))).mtimeMs).toBe(mtime);
});

it('removes and restores deep subtrees without resurrecting descendants of a trashed parent', async () => {
  seedNested();
  await allPaths();
  softDeleteNodes({ nodeIds: ['second'], deletedAt: '2030-10-06T00:01:00.000Z' });
  await syncFrom('third');
  let body = await fs.readFile(mirror('manual'), 'utf8');
  expect(body).toContain('First note.');
  expect(body).not.toContain('Second note.');
  expect(body).not.toContain('Deep note.');
  restoreNodes({ nodeIds: ['second'] });
  body = await allPaths();
  once(body, ['First note.', 'Second note.', 'Deep note.']);
});

it('keeps deep excerpts of imported EPUB chapters in the complete book with no extra mirrors', async () => {
  const filePath = await createMultiChapterBookEpub(root, 'input.epub');
  const imported = await runEpubImport({ adapterId: 'text_file', filePath, kind: 'epub', sourceName: 'input.epub' },
    '2026-10-06T00:00:00.000Z');
  const bookId = imported.nodeId!;
  const chapters = Object.values(loadWorkspaceSnapshot()!.nodesById).filter((node) => node.parentNodeId === bookId);
  expect(chapters.length).toBeGreaterThan(1);
  const chapter = chapters[0]!;
  const content = nodeDocument.loadWorkspaceNodeDocument(chapter.id)!.content;
  const from = content.indexOf('First chapter');
  const source = content.slice(from, from + 13);
  expect(source).toBe('First chapter');
  highlight('first', chapter.id, `${source}\n※ Chapter note.`, source, from, from + source.length);
  highlight('second', 'first', `${source}\n※ Nested chapter note.`, source);
  highlight('third', 'second', `${source}\n※ Deep chapter note.`, source);
  const body = await allPaths('third', bookId);
  once(body, ['Chapter note.', 'Nested chapter note.', 'Deep chapter note.']);
  for (const node of chapters) expect(body).toContain(node.title);
  expect([...loadMirrorArticleRecords().keys()]).toEqual([bookId]);
});


it('removes permanently deleted deep excerpts from the surviving owner without changing a colliding mirror', async () => {
  seedNested();
  save('collision', 'Collision body.', null, { kind: 'topic', title: 'manual', reveal: null });
  await allPaths();
  const file = mirror('collision');
  const before = { body: await fs.readFile(file, 'utf8'), mtime: (await fs.stat(file)).mtimeMs };
  softDeleteNodes({ nodeIds: ['third'], deletedAt: '2030-10-06T00:01:00.000Z' });
  deleteNodesPermanently({ nodeIds: ['third'] });
  await syncFrom('second');
  const body = await fs.readFile(mirror('manual'), 'utf8');
  expect(body).toContain('Second note.');
  expect(body).not.toContain('Deep note.');
  expect(await fs.readFile(file, 'utf8')).toBe(before.body);
  expect((await fs.stat(file)).mtimeMs).toBe(before.mtime);
});


it('retains all saved notes when an intermediate highlight has no usable source span', async () => {
  seedNested();
  highlight('first', 'manual', 'Alpha\n※ First note.', '', 0, 0);
  highlight('second', 'first', 'Alpha\n※ Second note.', '', 0, 0);
  const body = await allPaths();
  once(body, ['First note.', 'Second note.', 'Deep note.']);
});
