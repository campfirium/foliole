// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-mirror-output-inbox-app-data';
let mockedDocumentsDir = '/tmp/foliole-mirror-output-inbox-documents';

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
import { softDeleteNodes } from '../database/nodeMutations.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import { rebuildMirrorOutput } from './rebuildMirrorOutput.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-output-inbox-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  initializeDatabase();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(tempRoot, 'Library') });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('exports direct inbox children into the Inbox directory without leaking files to mirror root', async () => {
  upsertNodeSnapshot({
    nodeId: 'special-inbox',
    parentNodeId: null,
    kind: 'folder',
    title: 'Inbox',
    isTitleManual: true,
    hideTitleHeading: false,
    content: '',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'topic-inbox-1',
    parentNodeId: 'special-inbox',
    kind: 'topic',
    title: '',
    isTitleManual: false,
    hideTitleHeading: false,
    content: 'First inbox note.',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'node-fb9f5fe5-extra',
    parentNodeId: 'special-inbox',
    kind: 'topic',
    title: '',
    isTitleManual: false,
    hideTitleHeading: false,
    content: 'Second inbox note.',
    reveal: null,
    anchorLink: null,
    position: 1,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({
    queued_article_count: 2,
    rebuilt_article_count: 2,
    failed_article_count: 0,
    pending_article_count: 0
  });

  await expect(fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Inbox', 'Untitled.md'), 'utf8')).resolves.toContain(
    'First inbox note.'
  );
  await expect(
    fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Inbox', 'Untitled260330000000.md'), 'utf8')
  ).resolves.toContain('Second inbox note.');
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Untitled.md'))).rejects.toThrow();
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Untitled260330000000.md'))).rejects.toThrow();
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Inbox--special-'))).rejects.toThrow();
});

it('manual rebuild clears stale mirror leftovers and skips trashed topics', async () => {
  upsertNodeSnapshot({
    nodeId: 'topic-live',
    parentNodeId: null,
    kind: 'topic',
    title: 'Fresh Topic',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'Fresh body.',
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  upsertNodeSnapshot({
    nodeId: 'topic-trash',
    parentNodeId: null,
    kind: 'topic',
    title: 'Old Trash Topic',
    isTitleManual: true,
    hideTitleHeading: false,
    content: 'Should not export.',
    reveal: null,
    anchorLink: null,
    position: 1,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  softDeleteNodes({ nodeIds: ['topic-trash'], deletedAt: '2026-03-31T00:00:00.000Z' });

  await fs.mkdir(path.join(tempRoot, 'Library', 'Mirror', 'Inbox'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Library', 'Mirror', 'Inbox special'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Library', 'Mirror', 'Untitled'), { recursive: true });
  await fs.mkdir(path.join(tempRoot, 'Library', 'Mirror', 'Trash'), { recursive: true });
  await fs.writeFile(path.join(tempRoot, 'Library', 'Mirror', 'Topic.md'), 'old', 'utf8');
  await fs.writeFile(path.join(tempRoot, 'Library', 'Mirror', 'Topic copy.md'), 'old', 'utf8');
  await fs.writeFile(path.join(tempRoot, 'Library', 'Mirror', 'Trash', 'Old Trash Topic.md'), 'old', 'utf8');

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({
    queued_article_count: 1,
    rebuilt_article_count: 1,
    failed_article_count: 0,
    pending_article_count: 0
  });

  await expect(fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Fresh Topic.md'), 'utf8')).resolves.toContain(
    'Fresh body.'
  );
  await expect(fs.readdir(path.join(tempRoot, 'Library', 'Mirror'))).resolves.toEqual(['Fresh Topic.md']);
  await expect(fs.access(path.join(tempRoot, 'Library', 'Mirror', 'Trash'))).rejects.toThrow();
});
