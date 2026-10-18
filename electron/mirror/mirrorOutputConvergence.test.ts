// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const renderState = vi.hoisted(() => ({
  calls: 0,
  onRender: null as null | (() => void),
  onFirstRender: null as null | (() => void)
}));

vi.mock('./articleMirrorRenderWorkerClient.js', () => ({
  renderArticleMirrorInWorker: vi.fn(async (input: { article: { content: string } }) => {
    renderState.calls += 1;
    renderState.onRender?.();
    if (renderState.calls === 1) renderState.onFirstRender?.();
    return `${input.article.content}\n`;
  })
}));
const scheduleMirrorSync = vi.hoisted(() => vi.fn());
vi.mock('./mirrorSyncScheduler.js', () => ({ scheduleMirrorSync }));

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
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import * as workspaceSnapshot from '../database/workspaceSnapshot.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import { captureMirrorOutputSnapshot, isMirrorPlanCurrent, mirrorPlanRevision } from './mirrorOutputSnapshot.js';
import { rebuildAllMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let root = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-convergence-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  renderState.calls = 0;
  renderState.onRender = null;
  scheduleMirrorSync.mockClear();
  renderState.onFirstRender = null;
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it.each(['incremental', 'full'] as const)('reads full-library bodies only once for a stable %s pass', async (mode) => {
  for (const id of ['first', 'second', 'third']) {
    save(id, null, 'topic', id, `---\nauthor: ${id}\n---\nBody`, '2026-10-06T00:00:00.000Z');
  }
  const load = vi.spyOn(workspaceSnapshot, 'loadWorkspaceSnapshot');
  const loadDocument = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  if (mode === 'full') await rebuildAllMirrorOutput();
  else await syncIncrementalMirrorOutput(['first']);
  expect(load.mock.calls.filter(([options]) => options?.includeBody).length).toBe(1);
  expect(loadDocument.mock.calls.map(([id]) => id)).toEqual(mode === 'full' ? ['first', 'second', 'third'] : ['first']);
  await expect(fs.readFile(mirrorPath('first.md'), 'utf8')).resolves.toContain('author: first');
});

it('preserves the full revision including author frontmatter in scoped validation', () => {
  save('article', null, 'topic', 'Article', '---\nauthor: Ada\n---\nBody', '2026-10-06T00:00:00.000Z');
  const captured = captureMirrorOutputSnapshot();
  const plan = captured.plans[0]!;
  const revision = mirrorPlanRevision(captured.snapshot!, plan);
  expect(isMirrorPlanCurrent(plan.articleId, revision)).toBe(true);
  save('article', null, 'topic', 'Article', '---\nauthor: Grace\n---\nBody', '2026-10-06T00:00:00.000Z');
  expect(isMirrorPlanCurrent(plan.articleId, revision)).toBe(false);
});

it('returns after three changing-source attempts and schedules the remaining article', async () => {
  save('article', null, 'topic', 'Article', 'body', '2026-10-06T00:00:00.000Z');
  renderState.onRender = () => {
    if (renderState.calls <= 5) {
      save('article', null, 'topic', 'Article', `body ${renderState.calls}`, '2026-10-06T00:00:00.000Z');
    }
  };
  const result = await syncIncrementalMirrorOutput(['article']);
  expect(renderState.calls).toBe(3);
  expect(result).toMatchObject({ rebuilt_article_count: 0, pending_article_count: 1 });
  expect(scheduleMirrorSync).toHaveBeenCalledWith(['article']);
  await expect(fs.access(mirrorPath('Article.md'))).rejects.toMatchObject({ code: 'ENOENT' });
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
