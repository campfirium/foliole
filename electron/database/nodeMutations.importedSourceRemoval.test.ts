// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-mutation-imported-source-removal-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently } from './nodeMutations.js';
import { seedNode } from './nodeMutations.test.helpers.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-mutation-imported-source-removal-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedTrackedSourceWithDuplicateNodes() {
  seedNode('node-old', null, 0);
  seedNode('node-latest', null, 1);
  openDatabaseConnection().sqlite.prepare('UPDATE nodes SET deleted_at = ? WHERE id IN (?, ?)')
    .run('2026-03-06T00:10:00.000Z', 'node-old', 'node-latest');
  openDatabaseConnection().sqlite.prepare(
    `INSERT INTO keep_import_items (
       rule_id, source_path, source_mtime_ms, source_size_bytes,
       source_state, local_node_state, has_source_update, last_node_id,
       last_status, first_seen_at, last_seen_at, last_imported_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'readwise-articles',
    'Article.md',
    1,
    2,
    'present',
    'active',
    0,
    'node-latest',
    'imported',
    '2026-03-06T00:00:00.000Z',
    '2026-03-06T00:00:00.000Z',
    '2026-03-06T00:00:00.000Z'
  );
}

function seedImportRunsForDuplicateNodes() {
  const insertRun = openDatabaseConnection().sqlite.prepare(
    `INSERT INTO import_runs (
       id, source_fingerprint, provider, source_kind, source_name, source_locator,
       content_fingerprint, duplicate_semantic, result_status, node_id,
       imported_at, degraded_reason, failure_reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const [id, nodeId, importedAt] of [
    ['import-old', 'node-old', '2026-03-06T00:00:00.000Z'],
    ['import-latest', 'node-latest', '2026-03-06T00:05:00.000Z']
  ] as const) {
    insertRun.run(
      id,
      'source-article',
      'desktop_text_file',
      'markdown',
      'Article.md',
      '/readwise/Article.md',
      'content-article',
      'new',
      'imported',
      nodeId,
      importedAt,
      null,
      null
    );
  }
}

it('marks imported source removed even when another duplicate node still exists', () => {
  seedTrackedSourceWithDuplicateNodes();
  seedImportRunsForDuplicateNodes();

  deleteNodesPermanently({ nodeIds: ['node-old'], nodeOrder: [] });

  expect(
    openDatabaseConnection().sqlite.prepare(
      `SELECT deleted_at, last_node_id, last_status, local_node_state
       FROM keep_import_items
       WHERE rule_id = ? AND source_path = ?`
    ).get('readwise-articles', 'Article.md')
  ).toEqual({
    deleted_at: '2026-03-06T00:10:00.000Z',
    last_node_id: 'node-latest',
    last_status: 'blocked_deleted',
    local_node_state: 'locally_deleted'
  });
});
