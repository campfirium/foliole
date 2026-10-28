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


function cloze(id: string, parent: string, content: string, answer: string,
  originalText = 'Alpha', from = 0, to = originalText.length) {
  save(id, content, parent, { reveal: answer,
    anchorLink: { id: id.startsWith('sibling') ? 'sibling-anchor' : 'same-anchor', kind: 'cloze', locator: { from, to, originalText } } });
}
function seedNested() {
  save('manual', 'Alpha Beta Gamma', null, { kind: 'topic', reveal: null });
  cloze('first', 'manual', '[...] Beta Gamma\nFirst note.', 'First answer.');
  cloze('second', 'first', '[...] Beta Gamma\nSecond note.', 'Second answer.', 'Beta', 6, 10);
  cloze('third', 'second', 'Deep prompt [...]', 'Deep answer.', 'Beta', 6, 10);
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

it('keeps three saved cloze prompts, answers and notes in one owner through all entrypoints', async () => {
  seedNested();
  const body = await allPaths();
  once(body, ['First note.', 'First answer.', 'Second note.', 'Second answer.', 'Deep prompt', 'Deep answer.']);
  expect([...loadMirrorArticleRecords().keys()].sort()).toEqual(['manual', 'unrelated']);
});

it('renders descendants of an unchanged baseline cloze and keeps reused anchor IDs local to each parent', async () => {
  seedNested();
  cloze('first', 'manual', '[...] Beta Gamma', 'Alpha');
  const body = await allPaths();
  once(body, ['Second note.', 'Second answer.', 'Deep prompt', 'Deep answer.']);
  expect(body).toContain('<u>Alpha</u>');
});

it.each(['lost', 'empty'])('keeps unlocated %s cloze source, prompt, answer and descendants without inventing an inline span', async (mode) => {
  seedNested();
  cloze('first', 'manual', '[...] Beta Gamma\nDetached prompt.', 'Detached answer.', mode === 'lost' ? 'Lost original' : '', 0, 0);
  const body = await allPaths();
  once(body, ['Detached prompt', 'Detached answer.', 'Second note.', 'Second answer.', 'Deep prompt', 'Deep answer.']);
  if (mode === 'lost') once(body, ['Lost original']);
  expect(body).toContain('Alpha Beta Gamma');
  expect(body).not.toContain('<u>Alpha</u>');
});

it('retains mixed highlights inside clozes and clozes inside highlights alongside sibling branches', async () => {
  seedNested();
  save('highlight', 'Beta\n※ Mixed note.', 'first', { kind: 'topic', reveal: null,
    anchorLink: { id: 'mixed', kind: 'highlight', locator: { from: 6, to: 10, originalText: 'Beta' } } });
  cloze('mixed-cloze', 'highlight', '[...] mixed prompt', 'Mixed answer.', 'Beta');
  cloze('sibling', 'manual', 'Sibling prompt [...]', 'Sibling answer.', 'Gamma', 11, 16);
  const body = await allPaths();
  once(body, ['Mixed note.', 'Mixed answer.', 'Sibling prompt', 'Sibling answer.', 'Deep answer.']);
});

it('uses current saved nested prompts and answers, reads only owner documents and preserves unrelated files', async () => {
  seedNested();
  await rebuildAllMirrorOutput();
  const file = mirror('unrelated');
  const before = { body: await fs.readFile(file, 'utf8'), mtime: (await fs.stat(file)).mtimeMs };
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    cloze('third', 'second', 'Current prompt [...]', 'Current answer.', 'Beta', 6, 10);
    return render(...input);
  });
  await syncFrom('third');
  const body = await fs.readFile(mirror('manual'), 'utf8');
  once(body, ['Current prompt', 'Current answer.']);
  expect(body).not.toContain('Deep answer.');
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['manual', 'first', 'second', 'third']));
  expect(await fs.readFile(file, 'utf8')).toBe(before.body);
  expect((await fs.stat(file)).mtimeMs).toBe(before.mtime);
  const mtime = (await fs.stat(mirror('manual'))).mtimeMs;
  await syncFrom('third');
  expect((await fs.stat(mirror('manual'))).mtimeMs).toBe(mtime);
});

it('removes, restores and permanently deletes nested clozes without disturbing a colliding owner', async () => {
  seedNested();
  save('collision', 'Collision body.', null, { kind: 'topic', title: 'manual', reveal: null });
  await allPaths();
  const file = mirror('collision');
  const before = { body: await fs.readFile(file, 'utf8'), mtime: (await fs.stat(file)).mtimeMs };
  softDeleteNodes({ nodeIds: ['second'], deletedAt: '2030-10-06T00:01:00.000Z' });
  await syncFrom('third');
  let body = await fs.readFile(mirror('manual'), 'utf8');
  expect(body).toContain('First answer.');
  expect(body).not.toContain('Second answer.');
  expect(body).not.toContain('Deep answer.');
  restoreNodes({ nodeIds: ['second'] });
  await syncFrom('third');
  body = await fs.readFile(mirror('manual'), 'utf8');
  once(body, ['Second answer.', 'Deep answer.']);
  softDeleteNodes({ nodeIds: ['third'], deletedAt: '2030-10-06T00:01:00.000Z' });
  deleteNodesPermanently({ nodeIds: ['third'] });
  await syncFrom('second');
  body = await fs.readFile(mirror('manual'), 'utf8');
  expect(body).toContain('Second answer.');
  expect(body).not.toContain('Deep answer.');
  expect(await fs.readFile(file, 'utf8')).toBe(before.body);
  expect((await fs.stat(file)).mtimeMs).toBe(before.mtime);
});

it('keeps nested cloze facts of imported EPUB chapters in one complete book through all entrypoints', async () => {
  const filePath = await createMultiChapterBookEpub(root, 'input.epub');
  const imported = await runEpubImport({ adapterId: 'text_file', filePath, kind: 'epub', sourceName: 'input.epub' },
    '2026-10-06T00:00:00.000Z');
  const bookId = imported.nodeId!;
  const chapters = Object.values(loadWorkspaceSnapshot()!.nodesById).filter((node) => node.parentNodeId === bookId);
  expect(chapters.length).toBeGreaterThan(1);
  const chapter = chapters[0]!;
  const content = nodeDocument.loadWorkspaceNodeDocument(chapter.id)!.content;
  const from = content.indexOf('First chapter');
  expect(from).toBeGreaterThanOrEqual(0);
  cloze('first', chapter.id, '[...] Chapter prompt.', 'Chapter answer.', 'First chapter', from, from + 13);
  cloze('second', 'first', '[...] Nested chapter prompt.', 'Nested chapter answer.', 'Chapter', 6, 13);
  cloze('third', 'second', '[...] Deep chapter prompt.', 'Deep chapter answer.', 'Nested', 6, 12);
  const body = await allPaths('third', bookId);
  once(body, ['Chapter answer.', 'Nested chapter answer.', 'Deep chapter prompt.', 'Deep chapter answer.']);
  for (const node of chapters) expect(body).toContain(node.title);
  expect([...loadMirrorArticleRecords().keys()]).toEqual([bookId]);
});

it('preserves every original text of an unlocated multi-range cloze with its edited answer', async () => {
  seedNested();
  save('first', '[...] Beta Gamma\nGrouped prompt.', 'manual', { reveal: 'Grouped answer.', anchorLink: {
    id: 'same-anchor', kind: 'cloze', locator: { ranges: [
      { from: 0, to: 0, originalText: 'Lost first source' },
      { from: 0, to: 0, originalText: 'Lost second source' }
    ] }
  } });
  const body = await allPaths();
  once(body, ['Lost first source', 'Lost second source', 'Grouped prompt.', 'Grouped answer.', 'Deep answer.']);
});
