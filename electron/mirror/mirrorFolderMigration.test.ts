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
vi.mock('./mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

import { readMoveParentOrder } from '../../lib/core/database/nodeMoveStructure.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { moveNodes, upsertNodeSnapshot } from '../database/nodeMutations.js';
import * as nodeDocument from '../database/workspaceNodeDocument.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as articleOutput from './articleMirrorOutput.js';
import { resolveArticleIdsFromNodeId } from './mirrorArticleResolver.js';
import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';
import { rebuildAllMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

let root = '';
let positions = new Map<string, number>();
const mirror = (name: string) => path.join(root, 'Library', 'Mirror', name);
function save(id: string, title: string, parentNodeId: string | null = null, kind: 'folder' | 'topic' = 'topic') {
  if (!positions.has(id)) positions.set(id, positions.size);
  upsertNodeSnapshot({ nodeId: id, parentNodeId, kind, title, isTitleManual: true, hideTitleHeading: false,
    content: `Body for ${id}.`, reveal: null, anchorLink: null, position: positions.get(id)!,
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2030-10-06T00:00:00.000Z' });
}
async function syncFolder(id = 'folder-a') {
  return syncIncrementalMirrorOutput(resolveArticleIdsFromNodeId(id));
}
async function expectBody(id: string) {
  const record = loadMirrorArticleRecords().get(id)!;
  await expect(fs.readFile(mirror(record.relativePath), 'utf8')).resolves.toContain(`Body for ${id}.`);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-folder-mirror-'));
  appData = path.join(root, 'app-data');
  documents = path.join(root, 'Documents');
  positions = new Map();
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
  save('folder-a', 'Alpha', null, 'folder');
  save('nested', 'Nested', 'folder-a', 'folder');
  save('a', 'A', 'nested');
  save('second', 'Second', 'folder-a');
  save('unrelated', 'Unrelated');
  await rebuildAllMirrorOutput();
});
afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('migrates a nested folder rename without reading or modifying unrelated articles', async () => {
  const before = await fs.stat(mirror('Unrelated.md'));
  save('folder-a', 'Renamed', null, 'folder');
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  await syncFolder();
  expect(loadMirrorArticleRecords().get('a')!.relativePath).toBe('Renamed/Nested/A.md');
  await expectBody('a');
  await expectBody('second');
  await expect(fs.access(mirror('Alpha'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await fs.stat(mirror('Unrelated.md'))).mtimeMs).toBe(before.mtimeMs);
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['a', 'second']));
});

it('migrates only the moved subtree through the production move mutation', async () => {
  save('destination', 'Destination', null, 'folder');
  moveMirrorNode('nested', 'destination', '2030-10-06T00:01:00.000Z');
  await syncFolder('nested');
  expect(loadMirrorArticleRecords().get('a')!.relativePath).toBe('Destination/Nested/A.md');
  expect(loadMirrorArticleRecords().get('second')!.relativePath).toBe('Alpha/Second.md');
  await expectBody('a');
  await expectBody('second');
  await expect(fs.access(mirror('Alpha/Nested'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('updates physical parent directory spelling for case-only renames', async () => {
  save('folder-a', 'ALPHA', null, 'folder');
  await syncFolder();
  expect(await fs.readdir(mirror(''))).toContain('ALPHA');
  expect(await fs.readdir(mirror(''))).not.toContain('Alpha');
  await expectBody('a');
  await expectBody('second');
});

it('also migrates the directory owner displaced by a colliding folder rename', async () => {
  save('folder-b', 'Beta', null, 'folder');
  save('b', 'B', 'folder-b');
  await rebuildAllMirrorOutput();
  save('folder-a', 'Beta', null, 'folder');
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  await syncFolder();
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['a', 'second', 'b']));
  expect(loadMirrorArticleRecords().get('b')!.relativePath).toMatch(/^Beta--[^/]+\/B.md$/);
  for (const id of ['a', 'second', 'b', 'unrelated']) await expectBody(id);
  await expect(fs.access(mirror('Alpha'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('moves a blocking article file before creating the new folder at that path', async () => {
  save('blocker', 'Report');
  await rebuildAllMirrorOutput();
  save('folder-a', 'Report.md', null, 'folder');
  const read = vi.spyOn(nodeDocument, 'loadWorkspaceNodeDocument');
  await syncFolder();
  expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(new Set(['a', 'second', 'blocker']));
  expect((await fs.stat(mirror('Report.md'))).isDirectory()).toBe(true);
  for (const id of ['a', 'second', 'blocker']) await expectBody(id);
  expect(loadMirrorArticleRecords().get('blocker')!.relativePath).not.toBe('Report.md');
});

it('uses the final parent path when a folder is renamed again during generation', async () => {
  save('folder-a', 'Intermediate', null, 'folder');
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementationOnce((...input) => {
    save('folder-a', 'Final', null, 'folder');
    return render(...input);
  });
  await syncFolder();
  expect(loadMirrorArticleRecords().get('a')!.relativePath).toBe('Final/Nested/A.md');
  expect(loadMirrorArticleRecords().get('second')!.relativePath).toBe('Final/Second.md');
  await expectBody('a');
  await expectBody('second');
  await expect(fs.access(mirror('Intermediate'))).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.access(mirror('Alpha'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('preserves remaining old outputs if a later file in the folder migration fails', async () => {
  save('folder-a', 'Renamed', null, 'folder');
  const render = articleOutput.renderSingleArticleMirror;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementation((...input) => {
    if (input[0].id === 'second') throw new Error('injected render failure');
    return render(...input);
  });
  await expect(syncFolder()).rejects.toThrow('injected render failure');
  await expectBody('a');
  await expectBody('second');
  expect(loadMirrorArticleRecords().get('second')!.relativePath).toBe('Alpha/Second.md');
});

it('finishes moving a previous directory before an article reclaims that path as a file', async () => {
  save('report', 'Report');
  save('folder-a', 'Report.md', null, 'folder');
  moveMirrorNode('report', null, '2030-10-06T00:02:00.000Z', true);
  await rebuildAllMirrorOutput();
  save('folder-a', 'Elsewhere', null, 'folder');
  await syncFolder();
  expect((await fs.stat(mirror('Report.md'))).isFile()).toBe(true);
  for (const id of ['a', 'second', 'report']) await expectBody(id);
});

it('revisits an already migrated conflict owner if a later folder render changes the allocation again', async () => {
  save('report', 'Report');
  await rebuildAllMirrorOutput();
  save('folder-a', 'Report.md', null, 'folder');
  const render = articleOutput.renderSingleArticleMirror;
  let changed = false;
  vi.spyOn(articleOutput, 'renderSingleArticleMirror').mockImplementation((...input) => {
    if (!changed && input[0].id === 'a') {
      changed = true;
      save('folder-a', 'Elsewhere', null, 'folder');
    }
    return render(...input);
  });
  await syncFolder();
  expect(loadMirrorArticleRecords().get('report')!.relativePath).toBe('Report.md');
  expect(loadMirrorArticleRecords().get('a')!.relativePath).toBe('Elsewhere/Nested/A.md');
  for (const id of ['report', 'a', 'second']) await expectBody(id);
});

function moveMirrorNode(nodeId: string, parentNodeId: string | null, updatedAt: string, first = false) {
  const previous = loadWorkspaceSnapshot()!.nodesById[nodeId]!.parentNodeId;
  const driver = openDatabaseConnection().driver;
  moveNodes({ nodes: [{ nodeId, expectedParentNodeId: previous, parentNodeId, updatedAt }],
    defaultPriority: 5, maintainSequentialReading: previous !== parentNodeId,
    parentOrders: [...new Set([previous, parentNodeId])].map((parent) => {
      const expectedChildIds = readMoveParentOrder(driver, parent).visibleIds;
      const childIds = expectedChildIds.filter((id) => id !== nodeId);
      if (parent === parentNodeId) {
        if (first) childIds.unshift(nodeId);
        else childIds.push(nodeId);
      }
      return { parentNodeId: parent, expectedChildIds, childIds };
    }) });
}
