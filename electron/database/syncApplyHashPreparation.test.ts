// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-hash-preparation-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-hash-preparation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function remoteNode(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['desktop#0'],
    content_hash: 'remote-hash',
    host_name: 'phone',
    object_id: 'node-1',
    object_type: 'node',
    parent_version_id: 'desktop#0',
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'prepared before begin',
      created_at: '2026-07-10T10:00:00.000Z',
      deleted_at: null,
      desired_retention: 0.9,
      hide_title_heading: false,
      id: 'node-1',
      image_regions: null,
      is_title_manual: true,
      kind: 'item',
      opening_text: null,
      parent_id: null,
      position: 0,
      priority: 0,
      reveal: 'answer',
      title: 'Prepared Hash',
      updated_at: '2026-07-10T10:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-07-10T10:00:00.000Z',
    version_created_at: '2026-07-10T10:00:00.000Z',
    version_id: 'phone#1'
  };
}

function deferredHash() {
  let release!: () => void;
  let signal!: () => void;
  return {
    entered: new Promise<void>((resolve) => { signal = resolve; }),
    hash: async () => {
      signal();
      await new Promise<void>((resolve) => { release = resolve; });
      return 'a'.repeat(64);
    },
    release: () => release()
  };
}

it('finishes asynchronous hash preparation before opening the sqlite transaction', async () => {
  const connection = openDatabaseConnection();
  const gate = deferredHash();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'hash-preparation-test' });
  const applying = applySyncNodesWithDbPort(port, [remoteNode()], { hashTextBody: gate.hash });

  await gate.entered;
  expect(connection.sqlite.inTransaction).toBe(false);
  connection.driver.execute(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['parallel-write', 'kept', '2026-07-10T10:00:00.000Z']
  );
  gate.release();
  await expect(applying).resolves.toMatchObject({ appliedIds: ['node-1'] });

  expect(connection.driver.queryOne('SELECT value FROM settings WHERE key = ?', ['parallel-write']))
    .toEqual({ value: 'kept' });
  expect(connection.driver.queryOne('SELECT body_blob_hash FROM nodes WHERE id = ?', ['node-1']))
    .toEqual({ body_blob_hash: 'a'.repeat(64) });
});

it('does not open a transaction or write partial rows when hash preparation fails', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'hash-failure-test' });
  await expect(applySyncNodesWithDbPort(port, [remoteNode()], {
    hashTextBody: async () => { throw new Error('hash-failed'); }
  })).rejects.toThrow('hash-failed');

  expect(connection.sqlite.inTransaction).toBe(false);
  expect(connection.driver.queryOne('SELECT id FROM nodes WHERE id = ?', ['node-1'])).toBeUndefined();
});
