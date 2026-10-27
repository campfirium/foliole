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
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import { backfillMissingMirrorOutput, rebuildAllMirrorOutput, resumePendingMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

vi.mock('./mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

let root = '';
const mirror = (name: string) => path.join(root, 'Library', 'Mirror', name);
function save(id: string, title: string, kind: 'topic' | 'folder' = 'topic', parentNodeId: string | null = null,
  updatedAt = '2030-10-06T00:00:00.000Z') {
  upsertNodeSnapshot({ nodeId: id, parentNodeId, kind, title, isTitleManual: true, hideTitleHeading: false,
    content: `Body for ${id}.`, reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-rename-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
  save('article', 'Before', 'topic', null, '2026-10-06T00:00:00.000Z');
  save('unrelated', 'Unrelated', 'topic', null, '2026-10-06T00:00:00.000Z');
  await rebuildAllMirrorOutput();
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

const leftovers = ['stale-root.md', 'Old/Nested/stale.md', 'Highlights.md', 'Clozes.md', 'Unrelated/manual.txt'];
async function seedLeftovers() {
  for (const relative of [...leftovers, 'Before/manual.txt']) {
    await fs.mkdir(path.dirname(mirror(relative)), { recursive: true });
    await fs.writeFile(mirror(relative), `Legacy content for ${relative}.`);
  }
}
async function readLeftovers() {
  return Promise.all(leftovers.map(async (relative) => ({ relative,
    content: await fs.readFile(mirror(relative), 'utf8'), mtime: (await fs.stat(mirror(relative))).mtimeMs })));
}

it('updates one article without enumerating the mirror tree or touching unrelated stale and legacy outputs', async () => {
  await seedLeftovers();
  const before = await readLeftovers();
  const unrelated = await fs.stat(mirror('Unrelated.md'));
  save('article', 'Before');
  const enumerate = vi.spyOn(fs, 'readdir');
  await syncIncrementalMirrorOutput(['article']);
  expect(enumerate).not.toHaveBeenCalled();
  expect(await readLeftovers()).toEqual(before);
  expect((await fs.stat(mirror('Unrelated.md'))).mtimeMs).toBe(unrelated.mtimeMs);
  await expect(fs.access(mirror('Before'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('removes stale and legacy outputs during a full rebuild while recreating the current articles', async () => {
  await seedLeftovers();
  await rebuildAllMirrorOutput();
  for (const relative of [...leftovers, 'Before']) {
    await expect(fs.access(mirror(relative))).rejects.toMatchObject({ code: 'ENOENT' });
  }
  await expect(fs.readFile(mirror('Before.md'), 'utf8')).resolves.toContain('Body for article.');
  await expect(fs.readFile(mirror('Unrelated.md'), 'utf8')).resolves.toContain('Body for unrelated.');
});

it.each(['missing', 'resume'] as const)('keeps unrelated leftovers during %s work', async (mode) => {
  await seedLeftovers();
  const before = await readLeftovers();
  const enumerate = vi.spyOn(fs, 'readdir');
  await (mode === 'missing' ? backfillMissingMirrorOutput() : resumePendingMirrorOutput());
  expect(enumerate).not.toHaveBeenCalled();
  expect(await readLeftovers()).toEqual(before);
});

it('does not retire the selected legacy copy when its new output fails', async () => {
  await seedLeftovers();
  save('article', 'Before');
  vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('injected output failure'));
  await expect(syncIncrementalMirrorOutput(['article'])).rejects.toThrow('injected output failure');
  await expect(fs.readFile(mirror('Before/manual.txt'), 'utf8')).resolves.toContain('Legacy content');
});
