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
import { applySyncObjectsAsync } from './syncObjectApply.js';

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
    `INSERT INTO node_reading (node_id, last_handled_at, next_at)
     VALUES (?, ?, ?)`,
    ['node-1', '2026-04-21T18:00:00.000Z', '2026-04-22T18:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO node_reading_host_state (node_id, host_name, reading_position, updated_at)
     VALUES (?, '*', ?, ?)`,
    ['node-1', 20, '2026-04-21T18:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES (?, ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?, ?, ?, ?)`,
    ['node_reading', 'node-1', 'newer-hash', 'desktop', '2026-04-21T18:00:00.000Z', 1]
  );
}

it('does not let stale remote records overwrite newer local object state', async () => {
  insertNewerReadingState();

  await expect(applySyncObjectsAsync([{
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
  }])).resolves.toEqual([]);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ reading_position: number }>(
    'SELECT reading_position FROM node_reading_host_state WHERE node_id = ? AND host_name = ?',
    ['node-1', '*']
  ))
    .toEqual({ reading_position: 20 });
  expect(driver.queryOne<{ content_hash: string; sync_dirty: number }>(
    `SELECT content_hash, sync_dirty FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'node-1'`
  )).toEqual({ content_hash: 'newer-hash', sync_dirty: 1 });
});

it('skips already applied remote records with the same hash and tombstone', async () => {
  insertNewerReadingState();

  await expect(applySyncObjectsAsync([{
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
  }])).resolves.toEqual([]);

  expect(openDatabaseConnection().driver.queryOne<{ state_seq: number }>(
    `SELECT state_seq FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'node-1'`
  )).toEqual({ state_seq: 1 });
});

it('can acknowledge already applied records for push cursor delivery', async () => {
  insertNewerReadingState();

  await expect(applySyncObjectsAsync([{
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
  }], { includeAlreadyApplied: true })).resolves.toEqual(['node_reading:node-1']);
});

it('uses the content identity to settle equal-time reading records', async () => {
  insertNewerReadingState();
  const record = (contentHash: string, nextAt: string) => ({
    content_hash: contentHash,
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading' as const,
    payload_json: JSON.stringify({
      interval_duration_ms: 0,
      interval_growth_factor: 1,
      last_handled_at: '2026-04-21T18:00:00.000Z',
      next_at: nextAt,
      priority: 0,
      repetition_count: 0,
      state: 'active'
    }),
    updated_at: '2026-04-21T18:00:00.000Z'
  });

  await expect(applySyncObjectsAsync([
    record('z-reading-hash', '2026-04-23T18:00:00.000Z')
  ])).resolves.toEqual(['node_reading:node-1']);
  await expect(applySyncObjectsAsync([
    record('a-reading-hash', '2026-04-24T18:00:00.000Z')
  ])).resolves.toEqual([]);

  expect(openDatabaseConnection().driver.queryOne<{ content_hash: string }>(
    `SELECT content_hash FROM sync_object_state
     WHERE object_type = 'node_reading' AND object_id = 'node-1'`
  )).toEqual({ content_hash: 'z-reading-hash' });
});
