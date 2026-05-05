// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-state-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import {
  computeSyncContentHash,
  getPeerCursor,
  initializeDatabaseConnection,
  selectSyncStateChangesSince,
  setPeerCursor,
  upsertSyncObjectState
} from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-state-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function openInitializedDriver() {
  return initializeDatabaseConnection(openDatabaseConnection()).driver;
}

it('computes stable object hashes independent of payload key order', () => {
  const first = computeSyncContentHash('attachment', {
    blob: { availability: 'local', content_hash: 'sha256:abc' },
    original_name: 'paper.pdf',
    size_bytes: 42
  });
  const second = computeSyncContentHash('attachment', {
    size_bytes: 42,
    original_name: 'paper.pdf',
    blob: { content_hash: 'sha256:abc', availability: 'local' }
  });

  expect(second).toBe(first);
});

it('writes sync object state for attachment pdf text setting and view state', () => {
  const driver = openInitializedDriver();
  const updatedAt = '2026-04-24T00:00:00.000Z';
  const rows = [
    { objectType: 'attachment' as const, objectId: 'att-1' },
    { objectType: 'pdf_page_text' as const, objectId: 'att-1:1' },
    { objectType: 'setting' as const, objectId: 'device:*:*:desktop-1:font_scale' },
    { objectType: 'view_state' as const, objectId: 'session_resume:windows:desktop-1:active_node' }
  ];

  for (const row of rows) {
    upsertSyncObjectState(driver, {
      ...row,
      contentHash: computeSyncContentHash(row.objectType, { object_id: row.objectId }),
      lastModifiedByDeviceId: 'desktop-1',
      updatedAt,
      syncDirty: true
    });
  }

  const stored = driver.queryAll<{ object_type: string; object_id: string; sync_dirty: number }>(
    `SELECT object_type, object_id, sync_dirty
     FROM sync_object_state
     ORDER BY object_type ASC, object_id ASC`
  );

  expect(stored).toEqual([
    { object_type: 'attachment', object_id: 'att-1', sync_dirty: 1 },
    { object_type: 'pdf_page_text', object_id: 'att-1:1', sync_dirty: 1 },
    { object_type: 'setting', object_id: 'device:*:*:desktop-1:font_scale', sync_dirty: 1 },
    { object_type: 'view_state', object_id: 'session_resume:windows:desktop-1:active_node', sync_dirty: 1 }
  ]);
});

it('advances state sequence monotonically and queries by cursor', () => {
  const driver = openInitializedDriver();
  for (let index = 0; index < 1000; index += 1) {
    upsertSyncObjectState(driver, {
      objectType: 'setting',
      objectId: `setting-${index}`,
      contentHash: computeSyncContentHash('setting', { index }),
      lastModifiedByDeviceId: 'desktop-1',
      updatedAt: `2026-04-24T00:00:${String(index % 60).padStart(2, '0')}.000Z`
    });
  }
  upsertSyncObjectState(driver, {
    objectType: 'attachment',
    objectId: 'att-1',
    contentHash: computeSyncContentHash('attachment', { attachment_id: 'att-1' }),
    lastModifiedByDeviceId: 'desktop-1',
    updatedAt: '2026-04-24T00:10:00.000Z'
  });
  upsertSyncObjectState(driver, {
    objectType: 'attachment',
    objectId: 'att-1',
    contentHash: computeSyncContentHash('attachment', { attachment_id: 'att-1', updated: true }),
    lastModifiedByDeviceId: 'desktop-1',
    updatedAt: '2026-04-24T00:11:00.000Z'
  });

  const duplicateSeqRows = driver.queryAll<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM sync_object_state
     GROUP BY state_seq
     HAVING COUNT(*) > 1`
  );
  const rows = selectSyncStateChangesSince(driver, 999, 10);

  expect(duplicateSeqRows).toEqual([]);
  expect(rows.map((row) => row.stateSeq)).toEqual([1000, 1002]);
  expect(rows.at(-1)).toEqual(expect.objectContaining({ objectId: 'att-1', objectType: 'attachment' }));
});

it('stores independent peer cursors per stream', () => {
  const driver = openInitializedDriver();

  setPeerCursor(driver, 'peer-1', 'state', '12', '2026-04-24T00:00:00.000Z');
  setPeerCursor(driver, 'peer-1', 'review_log', 'op-1', '2026-04-24T00:01:00.000Z');
  setPeerCursor(driver, 'peer-1', 'node_versions', 'version-1', '2026-04-24T00:02:00.000Z');
  setPeerCursor(driver, 'peer-1', 'state', '13', '2026-04-24T00:03:00.000Z');

  expect(getPeerCursor(driver, 'peer-1', 'state')).toBe('13');
  expect(getPeerCursor(driver, 'peer-1', 'review_log')).toBe('op-1');
  expect(getPeerCursor(driver, 'peer-1', 'node_versions')).toBe('version-1');
  expect(getPeerCursor(driver, 'peer-2', 'state')).toBeNull();
});

it('creates attachment blob and setting record tables in fresh databases', () => {
  const driver = openInitializedDriver();

  driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['att-1', 'paper.pdf', 'application/pdf', 42, '2026-04-24T00:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO attachment_blobs (
       attachment_id,
       content_hash,
       storage_key,
       size_bytes,
       mime_type,
       availability,
       source_device_id,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['att-1', 'sha256:abc', 'attachments/sha256/abc', 42, 'application/pdf', 'local', 'desktop-1', '2026-04-24T00:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO setting_records (
       key,
       scope,
       platform,
       form_factor,
       device_id,
       value_json,
       content_hash,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['font_scale', 'device', '*', 'desktop', 'desktop-1', '1.0', 'hash-setting', '2026-04-24T00:00:00.000Z']
  );

  expect(driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM attachment_blobs')?.count).toBe(1);
  expect(driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM setting_records')?.count).toBe(1);
});
