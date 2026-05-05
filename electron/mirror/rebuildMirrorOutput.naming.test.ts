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

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

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
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function saveDuplicateTopic(nodeId: string, content: string, position: number, createdAt: string) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    kind: 'topic',
    title: 'Duplicate Title',
    isTitleManual: true,
    hideTitleHeading: false,
    content,
    reveal: null,
    anchorLink: null,
    position,
    createdAt,
    updatedAt: createdAt
  });
}

it('adds a uniform second-level suffix for duplicate article names and falls back to a number only within the same second', async () => {
  saveDuplicateTopic('topic-first', 'First body.', 0, '2026-03-30T08:00:00.000Z');
  saveDuplicateTopic('topic-second', 'Second body.', 1, '2026-03-30T08:01:02.000Z');
  saveDuplicateTopic('topic-third', 'Third body.', 2, '2026-03-30T09:15:00.000Z');
  saveDuplicateTopic('topic-fourth', 'Fourth body.', 3, '2026-03-30T08:01:02.900Z');

  await expect(rebuildMirrorOutput()).resolves.toMatchObject({
    queued_article_count: 4,
    rebuilt_article_count: 4,
    failed_article_count: 0,
    pending_article_count: 0
  });

  await expect(fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Duplicate Title.md'), 'utf8')).resolves.toContain('First body.');
  await expect(fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Duplicate Title260330080102.md'), 'utf8')).resolves.toContain('Second body.');
  await expect(fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Duplicate Title260330091500.md'), 'utf8')).resolves.toContain('Third body.');
  await expect(fs.readFile(path.join(tempRoot, 'Library', 'Mirror', 'Duplicate Title2603300801022.md'), 'utf8')).resolves.toContain('Fourth body.');
});
