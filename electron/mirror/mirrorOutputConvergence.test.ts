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

vi.mock('./articleMirrorRenderWorkerClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./articleMirrorRenderWorkerClient.js')>();
  return {
    renderArticleMirrorInWorker: vi.fn(async (...args: Parameters<typeof actual.renderArticleMirrorInWorker>) => {
      renderState.calls += 1;
      renderState.onRender?.();
      if (renderState.calls === 1) renderState.onFirstRender?.();
      return actual.renderArticleMirrorInWorker(...args);
    })
  };
});
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

import { captureMirrorOutputSnapshot, createMirrorPlanCurrency, mirrorPlanRevision } from './mirrorOutputSnapshot.js';
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

it.each(['incremental', 'full'] as const)('captures library metadata once and validates only rendered bodies for a stable %s pass', async (mode) => {
  for (const id of ['first', 'second', 'third']) {
    save(id, null, 'topic', id, `---\nauthor: ${id}\n---\nBody`, '2026-10-06T00:00:00.000Z');
  }
  const load = vi.spyOn(workspaceSnapshot, 'loadWorkspaceSnapshot');
  const loadDocument = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  if (mode === 'full') await rebuildAllMirrorOutput();
  else await syncIncrementalMirrorOutput(['first']);
  expect(load.mock.calls.filter(([options]) => options?.includeBody).length).toBe(mode === 'full' ? 1 : 0);
  // Checking each rendered article must not reload the whole workspace again.
  expect(load).toHaveBeenCalledTimes(1);
  expect(loadDocument.mock.calls.map(([id]) => id)).toEqual(mode === 'full' ? ['first', 'second', 'third'] : ['first', 'first']);
  await expect(fs.readFile(mirrorPath('first.md'), 'utf8')).resolves.toContain('author: first');
});

it('preserves the full revision including author frontmatter in scoped validation', () => {
  save('article', null, 'topic', 'Article', '---\nauthor: Ada\n---\nBody', '2026-10-06T00:00:00.000Z');
  const captured = captureMirrorOutputSnapshot();
  const plan = captured.plans[0]!;
  const revision = mirrorPlanRevision(captured.snapshot!, plan);
  const currency = createMirrorPlanCurrency(captured);
  expect(currency.isPlanCurrent(plan.articleId, revision)).toBe(true);
  save('article', null, 'topic', 'Article', '---\nauthor: Grace\n---\nBody', '2026-10-06T00:00:00.000Z');
  expect(currency.isPlanCurrent(plan.articleId, revision)).toBe(false);
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

it.each([100, 1000, 3000])('reads only the selected article body among %i unrelated nodes', async (count) => {
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.transaction(() => {
    save('article', null, 'topic', 'Article', 'initial body', '2026-10-06T00:00:00.000Z');
    for (let index = 0; index < count; index += 1) {
      save(`unrelated-${index}`, null, 'topic', `Unrelated ${index}`,
        `Unrelated body ${index}`, '2026-10-06T00:00:00.000Z');
    }
  })();
  await syncIncrementalMirrorOutput(['article']);
  await fs.writeFile(mirrorPath('Unrelated 0.md'), 'Unrelated output');
  const unrelatedBefore = await fs.stat(mirrorPath('Unrelated 0.md'));
  save('article', null, 'topic', 'Article', 'updated body', '2030-10-06T00:00:00.000Z');
  const load = vi.spyOn(workspaceSnapshot, 'loadWorkspaceSnapshot');
  const loadDocument = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');

  await syncIncrementalMirrorOutput(['article']);

  await expect(fs.readFile(mirrorPath('Article.md'), 'utf8')).resolves.toContain('updated body');
  await expect(fs.readFile(mirrorPath('Unrelated 0.md'), 'utf8')).resolves.toBe('Unrelated output');
  expect((await fs.stat(mirrorPath('Unrelated 0.md'))).mtimeMs).toBe(unrelatedBefore.mtimeMs);
  for (const result of load.mock.results) {
    if (result.type !== 'return' || !result.value) continue;
    const unrelated = Object.values(result.value.nodesById).filter((node) => node.id !== 'article');
    expect(unrelated.every((node) => node.content === '')).toBe(true);
  }
  expect(loadDocument.mock.calls.map(([id]) => id)).toEqual(['article', 'article']);
});


it('keeps scoped content identical to full output including existing manual notes', async () => {
  save('article', null, 'topic', 'Article', '---\nauthor: Ada\n---\nBody', '2026-10-06T00:00:00.000Z');
  save('note', 'article', 'topic', 'Note', 'Manual note body', '2026-10-06T00:00:00.000Z');
  save('unrelated', null, 'topic', 'Other', 'Other body', '2026-10-06T00:00:00.000Z');
  await rebuildAllMirrorOutput();
  const fullOutput = await fs.readFile(mirrorPath('Article.md'), 'utf8');
  save('article', null, 'topic', 'Article', '---\nauthor: Ada\n---\nBody', '2030-10-06T00:00:00.000Z');
  renderState.calls = 0;
  renderState.onFirstRender = () =>
    save('unrelated', null, 'topic', 'Other', 'Changed unrelated body', '2030-10-06T00:00:00.000Z');
  const loadDocument = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');

  await syncIncrementalMirrorOutput(['article']);

  await expect(fs.readFile(mirrorPath('Article.md'), 'utf8')).resolves.toBe(fullOutput);
  expect(fullOutput).toContain('Manual note body');
  expect(fullOutput).toContain('author: Ada');
  expect(loadDocument.mock.calls.map(([id]) => id)).toEqual(['article', 'note', 'article', 'note']);
});
