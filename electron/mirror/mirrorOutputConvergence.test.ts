// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const renderState = vi.hoisted(() => ({
  calls: 0,
  onFirstRender: null as null | (() => void)
}));

vi.mock('./articleMirrorRenderWorkerClient.js', () => ({
  renderArticleMirrorInWorker: vi.fn(async (input: { article: { content: string } }) => {
    renderState.calls += 1;
    if (renderState.calls === 1) renderState.onFirstRender?.();
    return `${input.article.content}\n`;
  })
}));

let appData = '';
let documents = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'),
  app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs'),
  documents_dir: documents
}) }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' },
  systemPreferences: { getUserDefault: vi.fn(), subscribeNotification: vi.fn() } }));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import { syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let root = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-convergence-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  renderState.calls = 0;
  renderState.onFirstRender = null;
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function save(id: string, parentNodeId: string | null, kind: 'folder' | 'topic', title: string, content: string, updatedAt: string) {
  upsertNodeSnapshot({ nodeId: id, parentNodeId, kind, title, isTitleManual: true,
    hideTitleHeading: false, content, reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt });
}

function mirrorPath(...parts: string[]) {
  return path.join(root, 'Library', 'Mirror', ...parts);
}

it('re-renders the latest body when the source changes during the first render', async () => {
  save('article', null, 'topic', 'Article', 'old body', '2026-10-06T00:00:00.000Z');
  renderState.onFirstRender = () =>
    save('article', null, 'topic', 'Article', 'latest body', '2026-10-06T00:01:00.000Z');

  await syncIncrementalMirrorOutput(['article']);

  await expect(fs.readFile(mirrorPath('Article.md'), 'utf8')).resolves.toContain('latest body');
  expect(renderState.calls).toBe(2);
});

it('does not commit output deleted during rendering', async () => {
  save('article', null, 'topic', 'Article', 'body', '2026-10-06T00:00:00.000Z');
  renderState.onFirstRender = () => softDeleteNodes({
    deletedAt: '2026-10-06T00:01:00.000Z', nodeIds: ['article'] });

  await syncIncrementalMirrorOutput(['article']);

  await expect(fs.access(mirrorPath('Article.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(openDatabaseConnection().sqlite.prepare(
    'SELECT COUNT(*) AS count FROM mirror_articles WHERE article_id = ?').get('article'))
    .toEqual({ count: 0 });
});

it('writes only the current path when a parent moves during rendering', async () => {
  save('folder', null, 'folder', 'Before', '', '2026-10-06T00:00:00.000Z');
  save('article', 'folder', 'topic', 'Article', 'body', '2026-10-06T00:00:00.000Z');
  renderState.onFirstRender = () =>
    save('folder', null, 'folder', 'After', '', '2026-10-06T00:01:00.000Z');

  await syncIncrementalMirrorOutput(['article']);

  await expect(fs.access(mirrorPath('Before', 'Article.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.readFile(mirrorPath('After', 'Article.md'), 'utf8')).resolves.toContain('body');
  expect(openDatabaseConnection().sqlite.prepare(
    'SELECT relative_path FROM mirror_articles WHERE article_id = ?').get('article'))
    .toEqual({ relative_path: 'After/Article.md' });
});
