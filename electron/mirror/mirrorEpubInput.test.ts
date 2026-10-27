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
import { restoreNodes, softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
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
async function syncFrom(id: string) {
  const ids = resolveArticleIdsFromNodeId(id);
  expect(ids).toEqual(['book']);
  return syncIncrementalMirrorOutput(ids);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-input-'));
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

function seedBook() {
  save('book', 'Book opening.');
  save('node-epub-chapter', 'Chapter body.', 'book');
  save('node-epub-section', 'Section body.', 'node-epub-chapter');
  save('chapter-note', 'Chapter annotation.', 'node-epub-chapter', { anchorLink, reveal: 'Chapter answer.' });
  save('section-note', 'Section annotation.', 'node-epub-section', { anchorLink, reveal: null });
  save('root-note', 'Root annotation.', 'book', { anchorLink, reveal: null });
  save('unrelated', 'Unrelated body.');
}

it('keeps chapter annotations local to their source inside one saved book for all three entrypoints', async () => {
  seedBook();
  await rebuildAllMirrorOutput();
  const unrelated = await fs.readFile(mirror('unrelated'), 'utf8');
  const before = (await fs.stat(mirror('unrelated'))).mtimeMs;
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  const render = vi.spyOn(articleOutput, 'renderSingleArticleMirror');
  await syncFrom('chapter-note');
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set([
    'book', 'node-epub-chapter', 'node-epub-section', 'chapter-note', 'section-note', 'root-note'
  ]));
  expect(render.mock.calls[0]![1].find((node) => node.id === 'chapter-note')?.reveal).toBe('Chapter answer.');
  const automatic = await fs.readFile(mirror('book'), 'utf8');
  expect(automatic).toContain('==Book ope== (❄ highlight: Root annotation.)');
  expect(automatic).toContain('==Chapter == (❄ highlight: Chapter annotation.)body.');
  expect(automatic).toContain('==Section == (❄ highlight: Section annotation.)body.');
  read.mockClear();
  await expect(exportCurrentArticleMirror('node-epub-section', null)).resolves.toEqual({ status: 'saved', path: outputPath });
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(automatic);
  expect(read.mock.calls.every(([id]) => id !== 'unrelated')).toBe(true);
  expect((await fs.stat(mirror('unrelated'))).mtimeMs).toBe(before);
  await rebuildAllMirrorOutput();
  await expect(fs.readFile(mirror('book'), 'utf8')).resolves.toBe(automatic);
  expect([...loadMirrorArticleRecords().keys()].sort()).toEqual(['book', 'unrelated']);
  await expect(fs.readFile(mirror('unrelated'), 'utf8')).resolves.toBe(unrelated);
});

it('updates saved chapter notes through Trash and restore without rewriting unrelated output', async () => {
  seedBook();
  await rebuildAllMirrorOutput();
  const before = (await fs.stat(mirror('unrelated'))).mtimeMs;
  save('chapter-note', 'Changed chapter annotation.', 'node-epub-chapter', { anchorLink });
  await syncFrom('chapter-note');
  await expect(fs.readFile(mirror('book'), 'utf8')).resolves.toContain('Changed chapter annotation.');
  softDeleteNodes({ nodeIds: ['chapter-note'], deletedAt: '2030-10-06T00:01:00.000Z' });
  await syncFrom('chapter-note');
  await expect(fs.readFile(mirror('book'), 'utf8')).resolves.not.toContain('Changed chapter annotation.');
  restoreNodes({ nodeIds: ['chapter-note'] });
  await syncFrom('chapter-note');
  await expect(fs.readFile(mirror('book'), 'utf8')).resolves.toContain('Changed chapter annotation.');
  expect((await fs.stat(mirror('unrelated'))).mtimeMs).toBe(before);
});

it('rejects a stale book render when a chapter annotation changes during generation', async () => {
  seedBook();
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    save('chapter-note', 'New chapter annotation.', 'node-epub-chapter', { anchorLink });
    return render(...input);
  });
  await syncFrom('chapter-note');
  const body = await fs.readFile(mirror('book'), 'utf8');
  expect(body).toContain('New chapter annotation.');
  expect(body).not.toContain('highlight: Chapter annotation.');
});

it('includes saved annotations on chapters created by the production EPUB importer', async () => {
  const filePath = await createMultiChapterBookEpub(root, 'input.epub');
  const imported = await runEpubImport({ adapterId: 'text_file', filePath, kind: 'epub', sourceName: 'input.epub' },
    '2026-10-06T00:00:00.000Z');
  const bookId = imported.nodeId!;
  const snapshot = loadWorkspaceSnapshot()!;
  const chapters = Object.values(snapshot.nodesById).filter((node) => node.parentNodeId === bookId);
  expect(chapters.length).toBeGreaterThan(1);
  const chapter = chapters[0]!;
  save('imported-note', 'Imported chapter annotation.', chapter.id, { anchorLink });
  const ids = resolveArticleIdsFromNodeId('imported-note');
  expect(ids).toEqual([bookId]);
  await syncIncrementalMirrorOutput(ids);
  const body = await fs.readFile(mirror(bookId), 'utf8');
  expect(body).toContain('Imported chapter annotation.');
  for (const node of chapters) expect(body).toContain(node.title);
  expect([...loadMirrorArticleRecords().keys()]).toEqual([bookId]);
  await expect(exportCurrentArticleMirror(chapter.id, null)).resolves.toMatchObject({ status: 'saved' });
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(body);
  await rebuildAllMirrorOutput();
  await expect(fs.readFile(mirror(bookId), 'utf8')).resolves.toBe(body);
});

it('keeps the book and its chapter notes separate from a colliding title across Trash and restore', async () => {
  seedBook();
  save('replacement', 'Replacement body.', null, { title: 'book' });
  await rebuildAllMirrorOutput();
  const before = (await fs.stat(mirror('unrelated'))).mtimeMs;
  const previous = mirror('book');
  softDeleteNodes({ nodeIds: ['book', 'node-epub-chapter', 'node-epub-section', 'chapter-note', 'section-note', 'root-note'],
    deletedAt: '2030-10-06T00:01:00.000Z' });
  await syncFrom('book');
  expect(loadMirrorArticleRecords().has('book')).toBe(false);
  await expect(fs.readFile(previous, 'utf8')).resolves.toContain('Replacement body.');
  restoreNodes({ nodeIds: ['book', 'node-epub-chapter', 'node-epub-section', 'chapter-note', 'section-note', 'root-note'] });
  await syncFrom('chapter-note');
  const replacementFile = mirror('replacement');
  expect(mirror('book')).not.toBe(replacementFile);
  await expect(fs.readFile(mirror('book'), 'utf8')).resolves.toContain('Chapter annotation.');
  await expect(fs.readFile(replacementFile, 'utf8')).resolves.toContain('Replacement body.');
  expect((await fs.stat(mirror('unrelated'))).mtimeMs).toBe(before);
});

it('renders a saved chapter cloze answer in the book while keeping it out of the root body', async () => {
  seedBook();
  save('chapter-cloze', 'Changed chapter prompt.', 'node-epub-chapter', {
    kind: 'item', reveal: 'Changed chapter answer.',
    anchorLink: { id: 'cloze', kind: 'cloze', locator: { from: 8, to: 12, originalText: 'body' } }
  });
  await syncFrom('chapter-cloze');
  const body = await fs.readFile(mirror('book'), 'utf8');
  expect(body).toContain('answer: Changed chapter answer.');
  expect(body).toContain('cloze: Changed chapter prompt.');
  expect(body.slice(0, body.indexOf('keyword:'))).not.toContain('Changed chapter answer.');
});

it('removes a trashed chapter and its direct notes from the surviving book, then restores both', async () => {
  seedBook();
  await rebuildAllMirrorOutput();
  softDeleteNodes({ nodeIds: ['node-epub-chapter', 'node-epub-section', 'chapter-note', 'section-note'],
    deletedAt: '2030-10-06T00:01:00.000Z' });
  await syncFrom('node-epub-chapter');
  const body = await fs.readFile(mirror('book'), 'utf8');
  expect(body).not.toContain('Chapter body.');
  expect(body).not.toContain('Chapter annotation.');
  restoreNodes({ nodeIds: ['node-epub-chapter', 'node-epub-section', 'chapter-note', 'section-note'] });
  await syncFrom('node-epub-chapter');
  await expect(fs.readFile(mirror('book'), 'utf8')).resolves.toContain('Chapter annotation.');
});
