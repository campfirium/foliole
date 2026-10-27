// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as articleOutput from './articleMirrorOutput.js';
import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';
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
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-rename-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
  save('article', 'Before');
  save('unrelated', 'Unrelated');
  await rebuildAllMirrorOutput();
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('renames one article and retires only its old file after the new output succeeds', async () => {
  const unrelated = await fs.stat(mirror('Unrelated.md'));
  save('article', 'After');
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  await syncIncrementalMirrorOutput(['article']);
  await expect(fs.readFile(mirror('After.md'), 'utf8')).resolves.toContain('Body for article.');
  await expect(fs.access(mirror('Before.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(loadMirrorArticleRecords().get('article')!.relativePath).toBe('After.md');
  expect((await fs.stat(mirror('Unrelated.md'))).mtimeMs).toBe(unrelated.mtimeMs);
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['article']));
});

it('keeps the old output and record when the renamed output cannot be written', async () => {
  const before = await fs.readFile(mirror('Before.md'), 'utf8');
  const record = loadMirrorArticleRecords().get('article');
  save('article', 'After');
  vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('injected output failure'));
  await expect(syncIncrementalMirrorOutput(['article'])).rejects.toThrow('injected output failure');
  await expect(fs.readFile(mirror('Before.md'), 'utf8')).resolves.toBe(before);
  expect(loadMirrorArticleRecords().get('article')).toEqual(record);
});

it('keeps the old output when the source changes again and never settles during rendering', async () => {
  const before = await fs.readFile(mirror('Before.md'), 'utf8');
  save('article', 'After');
  const render = articleOutput.renderSingleArticleMirror;
  let version = 0;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementation((...input) => {
    save('article', `After ${++version}`);
    return render(...input);
  });
  await expect(syncIncrementalMirrorOutput(['article'])).resolves.toMatchObject({ pending_article_count: 1, rebuilt_article_count: 0 });
  await expect(fs.readFile(mirror('Before.md'), 'utf8')).resolves.toBe(before);
  expect(loadMirrorArticleRecords().get('article')!.relativePath).toBe('Before.md');
});

it('uses the requested spelling for a case-only rename and leaves one physical file', async () => {
  save('article', 'BEFORE');
  await syncIncrementalMirrorOutput(['article']);
  const names = await fs.readdir(mirror(''));
  expect(names.filter((name) => name.toLowerCase() === 'before.md')).toEqual(['BEFORE.md']);
  await expect(fs.readFile(mirror('BEFORE.md'), 'utf8')).resolves.toContain('Body for article.');
});

it.each(['same title', 'case collision', 'directory collision'] as const)('preserves other owners during a rename with %s', async (collision) => {
  if (collision === 'directory collision') {
    save('folder', 'Target.md', 'folder');
    save('nested', 'Nested', 'topic', 'folder');
  } else save('other', collision === 'case collision' ? 'target' : 'Target');
  await rebuildAllMirrorOutput();
  save('article', 'Target');
  await syncIncrementalMirrorOutput(['article']);
  const records = loadMirrorArticleRecords();
  for (const id of collision === 'directory collision' ? ['article', 'nested'] : ['article', 'other']) {
    await expect(fs.readFile(mirror(records.get(id)!.relativePath), 'utf8')).resolves.toContain(`Body for ${id}.`);
  }
  expect(new Set([...records.values()].map((record) => record.relativePath.normalize('NFC').toLowerCase())).size).toBe(records.size);
  await expect(fs.access(mirror('Before.md'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('commits only the final name when the article is renamed again during generation', async () => {
  save('article', 'Intermediate');
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    save('article', 'Final');
    return render(...input);
  });
  await syncIncrementalMirrorOutput(['article']);
  await expect(fs.readFile(mirror('Final.md'), 'utf8')).resolves.toContain('Body for article.');
  await expect(fs.access(mirror('Intermediate.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.access(mirror('Before.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(loadMirrorArticleRecords().get('article')!.relativePath).toBe('Final.md');
});


it('protects a new owner of the previous path discovered while rendering', async () => {
  save('other', 'Other');
  await rebuildAllMirrorOutput();
  const oldBody = await fs.readFile(mirror('Before.md'), 'utf8');
  save('article', 'After');
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    save('other', 'Before');
    return render(...input);
  });
  await syncIncrementalMirrorOutput(['article']);
  await expect(fs.readFile(mirror('After.md'), 'utf8')).resolves.toContain('Body for article.');
  await expect(fs.readFile(mirror('Before.md'), 'utf8')).resolves.toBe(oldBody);
  await syncIncrementalMirrorOutput(['other']);
  await expect(fs.readFile(mirror('Before.md'), 'utf8')).resolves.toContain('Body for other.');
  await expect(fs.access(mirror('Other.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.readFile(mirror('After.md'), 'utf8')).resolves.toContain('Body for article.');
});

it('keeps long valid names safe when a rename displaces a same-title owner', async () => {
  const title = process.platform === 'darwin' || process.platform === 'win32' ? '😀'.repeat(100) : '界'.repeat(75);
  save('other', title);
  await rebuildAllMirrorOutput();
  save('article', title);
  await syncIncrementalMirrorOutput(['article']);
  const records = loadMirrorArticleRecords();
  for (const id of ['article', 'other']) {
    await expect(fs.readFile(mirror(records.get(id)!.relativePath), 'utf8')).resolves.toContain(`Body for ${id}.`);
  }
  await expect(fs.access(mirror('Before.md'))).rejects.toMatchObject({ code: 'ENOENT' });
});
