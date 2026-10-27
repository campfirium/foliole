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
import { softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import { loadLibraryPathSettingsSync, updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as articleOutput from './articleMirrorOutput.js';
import { exportCurrentArticleMirror } from './exportCurrentArticleMirror.js';
import { rebuildAllMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let root = '';
let outputPath = '';
const hash = 'a'.repeat(64);

function save(id: string, content: string, parentNodeId: string | null = null) {
  upsertNodeSnapshot({ nodeId: id, parentNodeId, kind: 'topic', title: id, isTitleManual: true,
    hideTitleHeading: false, content, reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2030-10-06T00:00:00.000Z' });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-current-export-'));
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

it('exports the same saved content as automatic mirrors including author and absolute assets while keeping manual child Topics separate', async () => {
  save('article', `---\nauthor: Ada\n---\nBody ![image](asset://${hash}.png)`);
  save('note', 'First note', 'article');
  save('nested-note', 'Nested note', 'note');
  save('unrelated', 'Unrelated body');
  await syncIncrementalMirrorOutput(['article']);
  const mirror = path.join(root, 'Library', 'Mirror', 'article.md');
  const expected = await fs.readFile(mirror, 'utf8');
  await fs.writeFile(mirror, 'Stale mirror copy');
  const readDocument = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');

  await expect(exportCurrentArticleMirror('article', null)).resolves.toEqual({ status: 'saved', path: outputPath });

  const output = await fs.readFile(outputPath, 'utf8');
  expect(output).toBe(expected);
  expect(output).toContain('author: Ada');
  expect(output).not.toContain('Nested note');
  expect(output).not.toContain('First note');
  expect(output).toContain(path.join(loadLibraryPathSettingsSync().assets_dir, `${hash}.png`));
  expect(output).not.toContain('asset://');
  expect(new Set(readDocument.mock.calls.map(([id]) => id))).toEqual(new Set(['article']));
  await rebuildAllMirrorOutput();
  await expect(fs.readFile(mirror, 'utf8')).resolves.toBe(output);
});

it('reads the saved version after the save dialog returns', async () => {
  save('article', 'Before dialog');
  showSaveDialog.mockImplementationOnce(async () => {
    save('article', 'After dialog');
    return { canceled: false, filePath: outputPath };
  });
  await exportCurrentArticleMirror('article', null);
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toContain('After dialog');
});

it('rechecks source changes during generation before writing the exported file', async () => {
  save('article', 'Before rendering');
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    save('article', 'After rendering');
    return render(...input);
  });
  await exportCurrentArticleMirror('article', null);
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toContain('After rendering');
});

it('returns not found without writing when the article is deleted during the dialog', async () => {
  save('article', 'Deleted article');
  showSaveDialog.mockImplementationOnce(async () => {
    softDeleteNodes({ nodeIds: ['article'], deletedAt: '2030-10-06T00:01:00.000Z' });
    return { canceled: false, filePath: outputPath };
  });
  await expect(exportCurrentArticleMirror('article', null)).resolves.toEqual({ status: 'not_found', path: null });
  await expect(fs.access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('preserves an existing export when source changes never settle', async () => {
  save('article', 'Changing article');
  await fs.mkdir(path.dirname(outputPath));
  await fs.writeFile(outputPath, 'Previous export');
  const render = articleOutput.renderSingleArticleMirror;
  let revision = 0;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementation((...input) => {
    save('article', `Revision ${++revision}`);
    return render(...input);
  });
  await expect(exportCurrentArticleMirror('article', null)).resolves.toEqual({ status: 'save_failed', path: null });
  await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe('Previous export');
});

it('preserves cancellation and missing-article results', async () => {
  await expect(exportCurrentArticleMirror('missing', null)).resolves.toEqual({ status: 'not_found', path: null });
  expect(showSaveDialog).not.toHaveBeenCalled();
  save('article', 'Body');
  showSaveDialog.mockResolvedValueOnce({ canceled: true });
  await expect(exportCurrentArticleMirror('article', null)).resolves.toEqual({ status: 'cancelled', path: null });
  await expect(fs.access(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('returns save failed when the chosen output cannot be written', async () => {
  save('article', 'Body');
  showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: root });
  await expect(exportCurrentArticleMirror('article', null)).resolves.toEqual({ status: 'save_failed', path: null });
});
