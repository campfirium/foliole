// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-mutations-keep-import-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { saveImportManagerSettings } from '../import/importManagerSettings.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { listRemovedKeepImportItems } from './keepImportItems.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently } from './nodeMutations.js';
import { seedNode } from './nodeMutations.test.helpers.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-mutation-keep-import-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('marks tracked keep imports as blocked when their topic is permanently deleted', () => {
  seedNode('node-root', null, 0);
  openDatabaseConnection().sqlite.prepare(
    `INSERT INTO keep_import_items (
       rule_id, source_path, source_mtime_ms, source_size_bytes,
       source_state, local_node_state, has_source_update, last_node_id,
       last_status, first_seen_at, last_seen_at, last_imported_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'generic-keep-source',
    'Article.md',
    1,
    2,
    'present',
    'active',
    0,
    'node-root',
    'imported',
    '2026-03-06T00:00:00.000Z',
    '2026-03-06T00:00:00.000Z',
    '2026-03-06T00:00:00.000Z'
  );

  deleteNodesPermanently({ nodeIds: ['node-root'], nodeOrder: [] });

  expect(
    openDatabaseConnection().sqlite.prepare(
      `SELECT deleted_at, last_seen_at, last_status, local_node_state
       FROM keep_import_items
       WHERE rule_id = ? AND source_path = ?`
    ).get('generic-keep-source', 'Article.md')
  ).toEqual({
    deleted_at: expect.any(String),
    last_seen_at: '2026-03-06T00:00:00.000Z',
    last_status: 'blocked_deleted',
    local_node_state: 'locally_deleted'
  });
  expect(listRemovedKeepImportItems()).toEqual([
    expect.objectContaining({
      local_node_state: 'locally_deleted',
      last_status: 'blocked_deleted',
      rule_id: 'generic-keep-source',
      source_path: 'Article.md'
    })
  ]);
});

it('uses the existing soft delete time as the removed time when a trashed topic is cleared', () => {
  seedNode('node-root', null, 0);
  openDatabaseConnection().sqlite.prepare(
    `UPDATE nodes
     SET deleted_at = ?
     WHERE id = ?`
  ).run('2026-03-06T00:10:00.000Z', 'node-root');
  openDatabaseConnection().sqlite.prepare(
    `INSERT INTO keep_import_items (
       rule_id, source_path, source_mtime_ms, source_size_bytes,
       source_state, local_node_state, has_source_update, last_node_id,
       last_status, first_seen_at, last_seen_at, last_imported_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'generic-keep-source',
    'Article.md',
    1,
    2,
    'present',
    'active',
    0,
    'node-root',
    'imported',
    '2026-03-06T00:00:00.000Z',
    '2026-03-06T00:00:00.000Z',
    '2026-03-06T00:00:00.000Z'
  );

  deleteNodesPermanently({ nodeIds: ['node-root'], nodeOrder: [] });

  expect(
    openDatabaseConnection().sqlite.prepare(
      `SELECT deleted_at, last_seen_at, last_status, local_node_state
       FROM keep_import_items
       WHERE rule_id = ? AND source_path = ?`
    ).get('generic-keep-source', 'Article.md')
  ).toEqual({
    deleted_at: '2026-03-06T00:10:00.000Z',
    last_seen_at: '2026-03-06T00:00:00.000Z',
    last_status: 'blocked_deleted',
    local_node_state: 'locally_deleted'
  });
});

it('keeps manually deleted Readwise keep imports in Removed', () => {
  seedNode('node-root', null, 0);
  saveImportManagerSettings({
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: '/readwise/Articles',
        id: 'readwise-articles',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath: '/readwise/Full Document Contents/Articles'
      }
    ]
  });
  openDatabaseConnection().sqlite.prepare(
    `INSERT INTO keep_import_items (
       rule_id, source_path, source_mtime_ms, source_size_bytes,
       source_state, local_node_state, has_source_update, last_node_id,
       last_status, first_seen_at, last_seen_at, deleted_at, last_imported_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'readwise-articles',
    'Article.md',
    1,
    2,
    'present',
    'active',
    0,
    'node-root',
    'imported',
    '2026-03-06T00:00:00.000Z',
    '2026-03-06T00:00:00.000Z',
    null,
    '2026-03-06T00:00:00.000Z'
  );

  deleteNodesPermanently({ nodeIds: ['node-root'], nodeOrder: [] });

  expect(
    openDatabaseConnection().sqlite.prepare(
      `SELECT deleted_at, last_imported_at, last_node_id, last_status, local_node_state
       FROM keep_import_items
       WHERE rule_id = ? AND source_path = ?`
    ).get('readwise-articles', 'Article.md')
  ).toEqual({
    deleted_at: expect.any(String),
    last_imported_at: '2026-03-06T00:00:00.000Z',
    last_node_id: 'node-root',
    last_status: 'blocked_deleted',
    local_node_state: 'locally_deleted'
  });
});
