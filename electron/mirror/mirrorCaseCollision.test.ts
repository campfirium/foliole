// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-mirror-output-naming-app-data';
let mockedDocumentsDir = '/tmp/foliole-mirror-output-naming-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' },
  systemPreferences: { getUserDefault: vi.fn(), subscribeNotification: vi.fn() }
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import { collectArticleMirrorPlans } from './articleMirrorPlanning.js';
import * as renderWorker from './articleMirrorRenderWorkerClient.js';
import { loadMirrorArticleRecords, saveMirrorArticleRecord } from './mirrorOutputStorage.js';
import { syncIncrementalMirrorOutput, backfillMissingMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';
import { rebuildMirrorOutput } from './rebuildMirrorOutput.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-output-naming-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(tempRoot, 'Library') });
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function saveNode(id: string, title: string, parent: string | null = null, kind: 'topic' | 'folder' = 'topic') {
  upsertNodeSnapshot({
    nodeId: id, parentNodeId: parent, kind, title, content: `Body for ${id}.`,
    isTitleManual: true, hideTitleHeading: false, reveal: null, anchorLink: null,
    position: nextPosition++, createdAt: '2026-03-30T08:00:00.000Z', updatedAt: '2026-03-30T08:00:00.000Z'
  });
}

let nextPosition = 0;
const mirrorRoot = () => path.join(tempRoot, 'Library', 'Mirror');
const plans = () => collectArticleMirrorPlans(loadWorkspaceSnapshot()!, mirrorRoot());

async function expectAllBodies() {
  const records = loadMirrorArticleRecords();
  expect(records.size).toBe(plans().length);
  for (const plan of plans()) {
    expect(records.get(plan.articleId)?.relativePath).toBe(plan.relativePath);
    expect(await fs.readFile(plan.targetPath, 'utf8')).toContain(`Body for ${plan.articleId}.`);
  }
}

it('keeps case-only article names, timestamp fallbacks and repeated runs separate', async () => {
  saveNode('first', '面包机sd-P1000');
  saveNode('second', '面包机SD-P1000');
  saveNode('third', '面包机SD-P1000');
  await rebuildMirrorOutput();
  await expectAllBodies();
  const originalPaths = plans().map((plan) => plan.relativePath);
  expect(new Set(originalPaths.map((value) => value.toLowerCase())).size).toBe(3);
  await expect(syncIncrementalMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 0 });
  await rebuildMirrorOutput();
  expect(plans().map((plan) => plan.relativePath)).toEqual(originalPaths);
  await expectAllBodies();
});

it('separates nested folders, reserved names and colliding shortened ID suffixes', async () => {
  saveNode('folder-one', 'Issue', null, 'folder');
  saveNode('node-abcdefgh1', 'issue', null, 'folder');
  saveNode('node-abcdefgh2', 'ISSUE', null, 'folder');
  saveNode('reserved', 'inbox', null, 'folder');
  for (const id of ['folder-one', 'node-abcdefgh1', 'node-abcdefgh2', 'reserved']) {
    saveNode(`child-${id}`, 'Nested', id, 'folder');
    saveNode(`article-${id}`, 'Same', `child-${id}`);
  }
  saveNode('inbox-article', 'Same', 'special-inbox');
  await rebuildMirrorOutput();
  await expectAllBodies();
  const originalPaths = plans().map((plan) => plan.relativePath);
  expect(new Set(originalPaths.map((value) => value.toLowerCase())).size).toBe(5);
  await syncIncrementalMirrorOutput();
  await expectAllBodies();
});

it('keeps article files distinct from folder names and protects live folders during legacy cleanup', async () => {
  saveNode('root-article', 'Report');
  saveNode('folder', 'report.md', null, 'folder');
  saveNode('nested', 'Child', 'folder');
  saveNode('archive', 'Archive');
  saveNode('legacy-folder', 'archive', null, 'folder');
  saveNode('legacy-child', 'Child', 'legacy-folder');
  saveNode('highlights-article', 'Highlights');
  await rebuildMirrorOutput();
  await expectAllBodies();
  await syncIncrementalMirrorOutput();
  await expectAllBodies();
});

it.each(['incremental', 'missing', 'full'] as const)('repairs old aliased records without deleting the surviving target (%s)', async (mode) => {
  saveNode('first', '面包机sd-P1000');
  saveNode('second', '面包机SD-P1000');
  await fs.mkdir(mirrorRoot(), { recursive: true });
  // Reproduce the old exporter: two records share one physical file on this Mac volume.
  for (const [id, title] of [['first', '面包机sd-P1000'], ['second', '面包机SD-P1000']] as const) {
    const relativePath = `${title}.md`;
    await fs.writeFile(path.join(mirrorRoot(), relativePath), `Body for ${id}.`);
    saveMirrorArticleRecord({ articleId: id, relativePath, mirroredAt: '2030-01-01T00:00:00Z' });
  }
  if (mode === 'incremental') await syncIncrementalMirrorOutput(['second']);
  else if (mode === 'missing') await backfillMissingMirrorOutput();
  else await rebuildMirrorOutput();
  await expectAllBodies();
  await expect(syncIncrementalMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 0 });
  await expectAllBodies();
});


it.each([
  ['Case', 'case'],
  ['Café', 'Cafe\u0301']
])('repairs only the selected alias group (%s / %s)', async (firstTitle, secondTitle) => {
  saveNode('first', firstTitle);
  saveNode('second', secondTitle);
  saveNode('other-first', 'Other');
  saveNode('other-second', 'other');
  await rebuildMirrorOutput();
  const before = loadMirrorArticleRecords();
  for (const [first, second] of [['first', 'second'], ['other-first', 'other-second']]) {
    saveMirrorArticleRecord({ ...before.get(second!)!, relativePath: before.get(first!)!.relativePath });
  }
  const unrelatedPaths = ['other-first', 'other-second'].map((id) =>
    path.join(mirrorRoot(), before.get(id)!.relativePath));
  const unrelatedBefore = await Promise.all(unrelatedPaths.map(async (file) => ({
    body: await fs.readFile(file, 'utf8'), mtime: (await fs.stat(file)).mtimeMs
  })));
  const readDocument = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');

  await expect(syncIncrementalMirrorOutput(['second'])).resolves.toMatchObject({ rebuilt_article_count: 2 });

  const after = loadMirrorArticleRecords();
  for (const id of ['first', 'second']) {
    const file = path.join(mirrorRoot(), after.get(id)!.relativePath);
    expect(after.get(id)!.relativePath).toBe(before.get(id)!.relativePath);
    expect(await fs.readFile(file, 'utf8')).toContain(`Body for ${id}.`);
  }
  expect(after.get('other-second')!.relativePath).toBe(before.get('other-first')!.relativePath);
  expect(new Set(readDocument.mock.calls.map(([id]) => id))).toEqual(new Set(['first', 'second']));
  for (const [index, file] of unrelatedPaths.entries()) {
    expect(await fs.readFile(file, 'utf8')).toBe(unrelatedBefore[index]!.body);
    expect((await fs.stat(file)).mtimeMs).toBe(unrelatedBefore[index]!.mtime);
  }
});

it('repairs a transitive ownership chain reached from the selected record', async () => {
  for (const id of ['first', 'second', 'third', 'unrelated']) saveNode(id, id);
  await rebuildMirrorOutput();
  const records = loadMirrorArticleRecords();
  saveMirrorArticleRecord({ ...records.get('second')!, relativePath: records.get('first')!.relativePath });
  saveMirrorArticleRecord({ ...records.get('third')!, relativePath: records.get('second')!.relativePath });
  const readDocument = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');

  await syncIncrementalMirrorOutput(['third']);

  expect(new Set(readDocument.mock.calls.map(([id]) => id))).toEqual(new Set(['first', 'second', 'third']));
  await expectAllBodies();
});

it('rechecks ownership claimed by another article while the selected article renders', async () => {
  saveNode('first', 'Case');
  saveNode('second', 'case');
  saveNode('unrelated', 'Unrelated');
  await rebuildMirrorOutput();
  const records = loadMirrorArticleRecords();
  saveMirrorArticleRecord({ ...records.get('first')!, mirroredAt: '2000-01-01T00:00:00Z' });
  const render = renderWorker.renderArticleMirrorInWorker;
  const renderedIds: string[] = [];
  vi.spyOn(renderWorker, 'renderArticleMirrorInWorker').mockImplementation(async (input, signal) => {
    renderedIds.push(input.article.id);
    if (renderedIds.length === 1) {
      saveMirrorArticleRecord({ ...records.get('second')!, relativePath: records.get('first')!.relativePath });
    }
    return render(input, signal);
  });

  await syncIncrementalMirrorOutput(['first']);

  expect(loadMirrorArticleRecords().get('second')!.relativePath).toBe(records.get('second')!.relativePath);
  expect(renderedIds).not.toContain('unrelated');
  await expectAllBodies();
});
