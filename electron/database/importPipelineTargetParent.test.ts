// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-target-parent-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { resetSeededWorkspace } from './databaseTestWorkspace.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-pipeline-target-parent-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  resetSeededWorkspace();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createUntrackedImport(content: string, importedAt: string) {
  return createPreparedDesktopTextImport({
    content,
    degradedReason: null,
    fileName: 'note.md',
    filePath: '/tmp/note.md',
    importedAt,
    kind: 'markdown',
    sourceTrackingMode: 'untracked'
  });
}

it('persists a new untracked import under the requested parent node', () => {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, is_title_manual, hide_title_heading, content, created_at, updated_at
     ) VALUES (?, ?, 'topic', 'Parent topic', 1, 0, '', ?, ?)`,
    ['node-import-parent', null, '2026-03-22T09:00:00.000Z', '2026-03-22T09:00:00.000Z']
  );

  const imported = runPreparedImport({
    ...createUntrackedImport('# Imported child\nBody', '2026-03-22T10:00:00.000Z'),
    targetParentNodeId: 'node-import-parent'
  });
  const nodeRow = connection.driver.queryOne<{ parent_id: string | null }>(
    'SELECT parent_id FROM nodes WHERE id = ?',
    [imported.nodeId]
  );

  expect(nodeRow).toEqual({ parent_id: 'node-import-parent' });
});
