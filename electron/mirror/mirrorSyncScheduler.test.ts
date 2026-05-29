// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-mirror-scheduler-app-data';
let mockedDocumentsDir = '/tmp/foliole-mirror-scheduler-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import * as articleMirror from './exportArticleMirror.js';
import { flushMirrorSync, scheduleMirrorSync } from './mirrorSyncScheduler.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';
import { rebuildMirrorOutput } from './rebuildMirrorOutput.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-scheduler-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(tempRoot, 'Library') });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function saveNode(
  nodeId: string,
  parentNodeId: string | null,
  kind: 'folder' | 'topic',
  title: string,
  content: string,
  updatedAt: string,
  position: number
) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId,
    kind,
    title,
    isTitleManual: true,
    hideTitleHeading: false,
    content,
    reveal: null,
    anchorLink: null,
    position,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt
  });
}

function mirrorPath(fileName: string) {
  return path.join(tempRoot, 'Library', 'Mirror', fileName);
}

it('flushes automatic mirror updates through the same incremental path used by rebuilds', async () => {
  saveNode('node-first', null, 'topic', 'Same Title', 'First body.', '2026-03-30T00:00:00.000Z', 0);
  saveNode('node-second', null, 'topic', 'Same Title', 'Second body.', '2026-03-30T00:00:00.000Z', 1);

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({ rebuilt_article_count: 2, queued_article_count: 2 });

  const mirrorEntries = await fs.readdir(mirrorPath('.'));
  const dedupedFileName = mirrorEntries.find((entry) => entry.startsWith('Same Title') && entry !== 'Same Title.md');
  expect(dedupedFileName).toBeTruthy();

  saveNode('node-second', null, 'topic', 'Same Title', 'Second body updated.', '2030-03-30T00:00:00.000Z', 1);

  scheduleMirrorSync(['node-second']);
  await flushMirrorSync();

  await expect(fs.readFile(mirrorPath('Same Title.md'), 'utf8')).resolves.toContain('First body.');
  await expect(fs.readFile(mirrorPath(dedupedFileName!), 'utf8')).resolves.toContain('Second body updated.');
});

it('limits automatic mirror flushes to scheduled articles', async () => {
  saveNode('node-first', null, 'topic', 'First Title', 'First body.', '2026-03-30T00:00:00.000Z', 0);
  saveNode('node-second', null, 'topic', 'Second Title', 'Second body.', '2026-03-30T00:00:00.000Z', 1);
  await rebuildMirrorOutput();
  await fs.rm(mirrorPath('First Title.md'));

  saveNode('node-second', null, 'topic', 'Second Title', 'Second body updated.', '2030-03-30T00:00:00.000Z', 1);

  scheduleMirrorSync(['node-second']);
  await flushMirrorSync();

  await expect(fs.access(mirrorPath('First Title.md'))).rejects.toThrow();
  await expect(fs.readFile(mirrorPath('Second Title.md'), 'utf8')).resolves.toContain('Second body updated.');
});

it('does not resolve mirror articles until flush', async () => {
  saveNode('node-first', null, 'topic', 'First Title', 'First body.', '2026-03-30T00:00:00.000Z', 0);
  const resolveSpy = vi.spyOn(articleMirror, 'resolveArticleIdFromNodeId');

  scheduleMirrorSync(['node-first']);

  expect(resolveSpy).not.toHaveBeenCalled();

  await flushMirrorSync();

  expect(resolveSpy).toHaveBeenCalledWith('node-first');
});

it('does not run an incremental full scan when scheduled nodes resolve to no articles', async () => {
  saveNode('node-first', null, 'topic', 'First Title', 'First body.', '2026-03-30T00:00:00.000Z', 0);
  saveNode('folder-node', null, 'folder', 'Folder', '', '2026-03-30T00:00:00.000Z', 1);
  await rebuildMirrorOutput();
  await fs.rm(mirrorPath('First Title.md'));

  scheduleMirrorSync(['folder-node']);
  await flushMirrorSync();

  await expect(fs.access(mirrorPath('First Title.md'))).rejects.toThrow();
});
