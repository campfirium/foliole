// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-stale-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjects } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-stale-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNewerReadingState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, 'item', ?, '', ?, ?)`,
    ['node-1', 'node-1', '2026-04-21T10:00:00.000Z', '2026-04-21T10:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO node_reading (node_id, reading_position, last_handled_at, next_at)
     VALUES (?, ?, ?, ?)`,
    ['node-1', 20, '2026-04-21T18:00:00.000Z', '2026-04-22T18:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES (?, ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?, ?, ?, ?)`,
    ['node_reading', 'node-1', 'newer-hash', 'desktop', '2026-04-21T18:00:00.000Z', 1]
  );
}

it('does not let stale remote records overwrite newer local object state', () => {
  insertNewerReadingState();

  expect(applySyncObjects([{
    content_hash: 'older-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: JSON.stringify({
      last_handled_at: '2026-04-21T16:00:00.000Z',
      next_at: '2026-04-22T16:00:00.000Z',
      reading_position: 7
    }),
    updated_at: '2026-04-21T16:21:00.000Z'
  }])).toEqual([]);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ reading_position: number }>('SELECT reading_position FROM node_reading WHERE node_id = ?', ['node-1']))
    .toEqual({ reading_position: 20 });
  expect(driver.queryOne<{ content_hash: string; sync_dirty: number }>(
    `SELECT content_hash, sync_dirty FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'node-1'`
  )).toEqual({ content_hash: 'newer-hash', sync_dirty: 1 });
});

it('skips already applied remote records with the same hash and tombstone', () => {
  insertNewerReadingState();

  expect(applySyncObjects([{
    content_hash: 'newer-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: JSON.stringify({
      last_handled_at: '2026-04-21T18:00:00.000Z',
      next_at: '2026-04-22T18:00:00.000Z',
      reading_position: 20
    }),
    updated_at: '2026-04-21T18:00:00.000Z'
  }])).toEqual([]);

  expect(openDatabaseConnection().driver.queryOne<{ state_seq: number }>(
    `SELECT state_seq FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'node-1'`
  )).toEqual({ state_seq: 1 });
});

it('can acknowledge already applied records for push cursor delivery', () => {
  insertNewerReadingState();

  expect(applySyncObjects([{
    content_hash: 'newer-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: JSON.stringify({
      last_handled_at: '2026-04-21T18:00:00.000Z',
      next_at: '2026-04-22T18:00:00.000Z',
      reading_position: 20
    }),
    updated_at: '2026-04-21T18:00:00.000Z'
  }], { includeAlreadyApplied: true })).toEqual(['node_reading:node-1']);
});
