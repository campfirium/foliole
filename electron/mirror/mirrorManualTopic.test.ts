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
  expect(ids).toEqual(['manual']);
  return syncIncrementalMirrorOutput(ids);
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
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it.each(['topic'])('uses the saved Topic input under %s for automatic, single and full output', async (parent) => {
  if (parent) save(parent, 'Ancestor body must not be loaded.', null, { kind: parent === 'topic' ? 'topic' : 'folder', reveal: null });
  save('manual', 'Question body.', parent);
  save('highlight', 'Edited annotation.', 'manual', { kind: 'topic', anchorLink, reveal: null });
  save('unrelated', 'Unrelated body.', null, { kind: 'topic', reveal: null });
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  const render = vi.spyOn(articleOutput, 'renderSingleArticleMirror');
  await syncFrom('highlight');
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['manual', 'highlight']));
  expect(render.mock.calls[0]![0]).toMatchObject({ id: 'manual', content: 'Question body.', reveal: 'Saved answer fact.' });
  const automatic = await fs.readFile(mirror('manual'), 'utf8');
  expect(automatic).toContain('Edited annotation.');
  expect(automatic).not.toContain('Ancestor body');
  read.mockClear();
  await expect(exportCurrentArticleMirror('manual', null)).resolves.toEqual({ status: 'saved', path: outputPath });
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(automatic);
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['manual', 'highlight']));
  await rebuildAllMirrorOutput();
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toBe(automatic);
});

it('refreshes the Topic after its direct derived child changes and enters Trash', async () => {
  save('manual', 'Question body.', null, { updatedAt: '2026-10-06T00:00:00.000Z' });
  save('highlight', 'First annotation.', 'manual', { kind: 'topic', anchorLink, reveal: null, updatedAt: '2026-10-06T00:00:00.000Z' });
  await syncFrom('manual');
  save('highlight', 'Changed annotation.', 'manual', { kind: 'topic', anchorLink, reveal: null, updatedAt: '2026-10-06T00:00:00.000Z' });
  await syncFrom('highlight');
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toContain('Changed annotation.');
  softDeleteNodes({ nodeIds: ['highlight'], deletedAt: '2030-10-06T00:01:00.000Z' });
  await syncFrom('highlight');
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.not.toContain('Changed annotation.');
});

it('retires a trashed Topic and restores its saved body through the same explicit node input', async () => {
  save('manual', 'Question body.');
  await syncFrom('manual');
  const previous = mirror('manual');
  softDeleteNodes({ nodeIds: ['manual'], deletedAt: '2030-10-06T00:01:00.000Z' });
  await syncFrom('manual');
  expect(loadMirrorArticleRecords().has('manual')).toBe(false);
  await expect(fs.access(previous)).rejects.toMatchObject({ code: 'ENOENT' });
  restoreNodes({ nodeIds: ['manual'] });
  await syncFrom('manual');
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toContain('Question body.');
});

it('omits reveal text from metadata-only mirror input while normal workspace snapshots keep it', () => {
  save('manual', 'Question body.');
  const options = { includeBody: false, includeReveal: false };
  expect(loadWorkspaceSnapshot(options)!.nodesById.manual!.reveal).toBeNull();
  expect(loadWorkspaceSnapshot({ includeBody: false })!.nodesById.manual!.reveal).toBe('Saved answer fact.');
});

it('refreshes folder-level Topics when their containing folder is renamed', async () => {
  save('folder', '', null, { kind: 'folder', reveal: null });
  save('manual', 'Question body.', 'folder');
  await syncFrom('manual');
  const previous = mirror('manual');
  save('folder', '', null, { kind: 'folder', title: 'Renamed', reveal: null });
  expect(resolveArticleIdsFromNodeId('folder')).toEqual(['manual']);
  await syncIncrementalMirrorOutput(resolveArticleIdsFromNodeId('folder'));
  expect(loadMirrorArticleRecords().get('manual')!.relativePath).toBe('Renamed/manual.md');
  await expect(fs.access(previous)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toContain('Question body.');
});

it.each([null, 'existing'])('keeps a same-name Topic separate when a Topic is added under %s', async (parent) => {
  save('existing', 'Existing Topic body.', null, { kind: 'topic', title: 'manual', reveal: null });
  await rebuildAllMirrorOutput();
  save('manual', 'Question body.', parent);
  await syncFrom('manual');
  expect(mirror('manual')).not.toBe(mirror('existing'));
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toContain('Question body.');
  await expect(fs.readFile(mirror('existing'), 'utf8')).resolves.toContain('Existing Topic body.');
});

it('validates an explicit repeated notification without changing an already identical mirror file', async () => {
  save('manual', 'Question body.');
  await syncFrom('manual');
  const file = mirror('manual');
  const earlier = new Date('2025-01-01T00:00:00.000Z');
  await fs.utimes(file, earlier, earlier);
  const before = (await fs.stat(file)).mtimeMs;
  await syncFrom('manual');
  expect((await fs.stat(file)).mtimeMs).toBe(before);
  await expect(fs.readFile(file, 'utf8')).resolves.toContain('Question body.');
});


it('updates a nested Topic without rewriting its parent or sibling and preserves Trash transitions', async () => {
  save('parent', 'Parent body.', null, { kind: 'topic' });
  save('manual', 'Question body.', 'parent');
  save('sibling', 'Sibling body.', 'parent');
  save('highlight', 'First annotation.', 'manual', { kind: 'topic', anchorLink, reveal: null });
  await rebuildAllMirrorOutput();
  const parentFile = mirror('parent');
  const siblingFile = mirror('sibling');
  const before = await Promise.all([fs.stat(parentFile), fs.stat(siblingFile)]);
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  save('manual', 'Question body. Edited fact.', 'parent');
  await syncFrom('manual');
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['manual', 'highlight']));
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toContain('Edited fact.');
  await expect(fs.readFile(parentFile, 'utf8')).resolves.not.toContain('Edited fact.');
  softDeleteNodes({ nodeIds: ['highlight'], deletedAt: '2030-10-06T00:01:00.000Z' });
  await syncFrom('highlight');
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.not.toContain('First annotation.');
  restoreNodes({ nodeIds: ['highlight'] });
  await syncFrom('highlight');
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toContain('First annotation.');
  const previous = mirror('manual');
  softDeleteNodes({ nodeIds: ['manual', 'highlight'], deletedAt: '2030-10-06T00:02:00.000Z' });
  await syncFrom('manual');
  await expect(fs.access(previous)).rejects.toMatchObject({ code: 'ENOENT' });
  restoreNodes({ nodeIds: ['manual', 'highlight'] });
  await syncFrom('manual');
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.toContain('Edited fact.');
  expect((await fs.stat(parentFile)).mtimeMs).toBe(before[0]!.mtimeMs);
  expect((await fs.stat(siblingFile)).mtimeMs).toBe(before[1]!.mtimeMs);
});

it('rejects a stale nested Topic render when its saved question or answer changes', async () => {
  save('parent', 'Parent body.', null, { kind: 'topic' });
  save('manual', 'Question version one.', 'parent');
  const render = articleOutput.renderSingleArticleMirror;
  const spy = vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    save('manual', 'Question version two.', 'parent', { reveal: 'Answer version two.' });
    return render(...input);
  });
  await syncFrom('manual');
  expect(spy.mock.calls.length).toBeGreaterThan(1);
  expect(spy.mock.calls.at(-1)![0]).toMatchObject({ content: 'Question version two.', reveal: 'Answer version two.' });
  const body = await fs.readFile(mirror('manual'), 'utf8');
  expect(body).toContain('Question version two.');
  expect(body).not.toContain('Question version one.');
});

it('keeps existing EPUB-generated chapters in one book while a manual Topic remains independent', async () => {
  save('book', 'Book opening.');
  save('node-epub-chapter', 'Chapter body.', 'book');
  save('node-epub-section', 'Section body.', 'node-epub-chapter');
  save('manual', 'Manual note.', 'node-epub-chapter');
  expect(resolveArticleIdsFromNodeId('node-epub-section')).toEqual(['book']);
  await syncFrom('manual');
  await rebuildAllMirrorOutput();
  expect([...loadMirrorArticleRecords().keys()].sort()).toEqual(['book', 'manual']);
  await expect(fs.readFile(mirror('book'), 'utf8')).resolves.toContain('Chapter body.');
  await expect(fs.readFile(mirror('book'), 'utf8')).resolves.toContain('Section body.');
  await expect(fs.readFile(mirror('book'), 'utf8')).resolves.not.toContain('Manual note.');
  await expect(fs.readFile(mirror('manual'), 'utf8')).resolves.not.toContain('Chapter body.');
});
