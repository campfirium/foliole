// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-folder-target-tests';
let tempRoot = '';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { resetSeededWorkspace } from '../database/databaseTestWorkspace.js';
import { initializeDatabase } from '../database/migrate.js';

import { resolveManagedImportTargetParentNodeId } from './importFolderTargets.js';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-folder-target-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  process.env.FOLIOLE_LIBRARY_HOME = path.join(tempRoot, 'Foliole');
  initializeDatabase();
  resetSeededWorkspace();
});

afterEach(async () => {
  closeDatabaseConnection();
  delete process.env.FOLIOLE_LIBRARY_HOME;
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('maps nested Import folders to internal folders case-insensitively', () => {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, is_title_manual, hide_title_heading, content, created_at, updated_at
     ) VALUES (?, NULL, 'folder', 'ABC', 1, 0, '', ?, ?)`,
    ['node-abc', '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z']
  );

  const targetParentNodeId = resolveManagedImportTargetParentNodeId({
    filePath: path.join('/library/Import', 'abc', 'Deep', 'topic.md'),
    importedAt: '2026-07-03T00:10:00.000Z',
    importRootPath: '/library/Import'
  });
  expect(targetParentNodeId).toBeTypeOf('string');
  if (!targetParentNodeId) throw new Error('Expected nested import target folder.');

  const deepRow = connection.driver.queryOne<{ parent_id: string | null; title: string }>(
    'SELECT parent_id, title FROM nodes WHERE id = ?',
    [targetParentNodeId]
  );
  expect(deepRow).toEqual({ parent_id: 'node-abc', title: 'Deep' });
});

it('maps Import root files to the fixed app Inbox', () => {
  expect(resolveManagedImportTargetParentNodeId({
    filePath: path.join('/library/Import', 'topic.md'),
    importedAt: '2026-07-03T00:10:00.000Z',
    importRootPath: '/library/Import'
  })).toBe('special-inbox');
});
