// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-sync-body-authority-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-sync-body-authority-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  upsertNodeSnapshot({
    anchorLink: null, content: 'Hello world', createdAt: '2026-04-21T10:00:00.000Z',
    isTitleManual: true, kind: 'topic', nodeId: 'node-1', parentNodeId: null,
    position: 0, reveal: null, title: 'Node 1', updatedAt: '2026-04-21T10:00:00.000Z'
  });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('flushes Blob-only authority instead of the empty inline projection', () => {
  const connection = openDatabaseConnection();
  connection.driver.execute('UPDATE nodes SET content = ?, sync_dirty = 1 WHERE id = ?', ['', 'node-1']);
  const versionId = flushNodeSyncVersion('node-1', '2026-04-21T10:01:00.000Z');
  const version = connection.driver.queryOne<{ body_text: string; snapshot_json: string }>(
    'SELECT body_text, snapshot_json FROM node_sync_versions WHERE version_id = ?', [versionId ?? '']
  );
  expect(version?.body_text).toBe('Hello world');
  expect(JSON.parse(version?.snapshot_json ?? '{}').body_blob_hash).toMatch(/^[a-f0-9]{64}$/);
});

it('keeps an unavailable Blob node dirty without creating a version', () => {
  const connection = openDatabaseConnection();
  const hash = connection.driver.queryOne<{ body_blob_hash: string }>(
    'SELECT body_blob_hash FROM nodes WHERE id = ?', ['node-1']
  )?.body_blob_hash ?? '';
  connection.driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);
  expect(flushNodeSyncVersion('node-1', '2026-04-21T10:01:00.000Z')).toBeNull();
  expect(connection.driver.queryOne<{ sync_dirty: number }>('SELECT sync_dirty FROM nodes WHERE id = ?', ['node-1']))
    .toEqual({ sync_dirty: 1 });
  expect(connection.driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM node_sync_versions WHERE object_id = ?', ['node-1']
  )).toEqual({ count: 0 });
});
