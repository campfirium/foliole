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

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';

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

it('flushes an intentional empty owned body without resurrecting obsolete shared cache', () => {
  const connection = openDatabaseConnection();
  upsertTextBodyBlob(connection.driver, 'Hello world', 'now');
  connection.driver.execute('UPDATE nodes SET content = ?, sync_dirty = 1 WHERE id = ?', ['', 'node-1']);
  const versionId = flushNodeSyncVersion('node-1', '2026-04-21T10:01:00.000Z');
  const version = connection.driver.queryOne<{ body_text: string; snapshot_json: string }>(
    'SELECT body_text, snapshot_json FROM node_sync_versions WHERE version_id = ?', [versionId ?? '']
  );
  expect(version?.body_text).toBe('');
  expect(JSON.parse(version?.snapshot_json ?? '{}').body_blob_hash).toMatch(/^[a-f0-9]{64}$/);
});

it('flushes the full owned body without shared cache bytes', () => {
  const connection = openDatabaseConnection();
  const hash = connection.driver.queryOne<{ body_blob_hash: string }>(
    'SELECT body_blob_hash FROM nodes WHERE id = ?', ['node-1']
  )?.body_blob_hash ?? '';
  connection.driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);
  const versionId = flushNodeSyncVersion('node-1', '2026-04-21T10:01:00.000Z');
  expect(connection.driver.queryOne('SELECT body_text FROM node_sync_versions WHERE version_id = ?', [versionId!]))
    .toEqual({ body_text: 'Hello world' });
  expect(connection.driver.queryOne<{ sync_dirty: number }>('SELECT sync_dirty FROM nodes WHERE id = ?', ['node-1']))
    .toEqual({ sync_dirty: 0 });
  expect(connection.driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM node_sync_versions WHERE object_id = ?', ['node-1']
  )).toEqual({ count: 1 });
});
