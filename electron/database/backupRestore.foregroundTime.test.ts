// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { applySyncObjectsWithDbPort } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

const fixture = vi.hoisted(() => ({ root: '', fail: false }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: fixture.root, app_config_dir: path.join(fixture.root, 'config'),
  app_cache_dir: path.join(fixture.root, 'cache'), app_log_dir: path.join(fixture.root, 'logs')
}) }));
vi.mock('./migrate.js', async (original) => {
  const module = await original<typeof import('./migrate.js')>();
  return { ...module, initializeDatabase: (...args: Parameters<typeof module.initializeDatabase>) => {
    if (fixture.fail) { fixture.fail = false; throw new Error('restored initialization failed'); }
    return module.initializeDatabase(...args);
  } };
});

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

const source = '11111111-1111-4111-8111-111111111111';
const next = '22222222-2222-4222-8222-222222222222';
const ownerKey = 'foreground_time_source:33333333-3333-4333-8333-333333333333';
const day = '2026-10-04';
const id = `${source}:${day}`;

beforeEach(async () => {
  fixture.root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-time-restore-'));
  fixture.fail = false;
  initializeDatabase();
  openDatabaseConnection().driver.execute('INSERT INTO workspace_meta(key, value, updated_at) VALUES (?, ?, ?)', [ownerKey, source, day]);
});
afterEach(async () => { closeDatabaseConnection(); await fs.rm(fixture.root, { recursive: true, force: true }); });

function save(sourceId: string, durationMs: number) {
  const driver = openDatabaseConnection().driver;
  const objectId = `${sourceId}:${day}`;
  driver.execute(`INSERT INTO foreground_daily_time(id, source_id, day_key, duration_ms) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET duration_ms = excluded.duration_ms`, [objectId, sourceId, day, durationMs]);
  upsertSyncObjectState(driver, { objectType: 'foreground_daily_time', objectId,
    contentHash: computeSyncContentHash('foreground_daily_time', { source_id: sourceId, day_key: day, duration_ms: durationMs }),
    lastModifiedByHostName: 'desktop', updatedAt: day, syncDirty: true });
}

function total() { return openDatabaseConnection().driver.queryOne<{ total: number }>('SELECT SUM(duration_ms) total FROM foreground_daily_time')?.total; }
function currentSource() { return openDatabaseConnection().driver.queryOne<{ value: string }>('SELECT value FROM workspace_meta WHERE key = ?', [ownerKey])?.value; }

it('merges saved contributions into an older backup, rotates ownership, and publishes the retained maximum after replay and reopen', async () => {
  save(source, 60_000);
  const backup = await createApplicationDatabaseBackup();
  save(source, 100_000); save(next, 20_000);
  openDatabaseConnection().driver.execute("DELETE FROM sync_object_state WHERE object_type = 'foreground_daily_time'");
  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });
  const rotated = currentSource();
  expect(rotated).not.toBe(source);
  expect(total()).toBe(120_000);
  const connection = openDatabaseConnection();
  const retained = connection.driver.queryOne<{ content_hash: string; sync_dirty: number }>(
    'SELECT content_hash, sync_dirty FROM sync_object_state WHERE object_id = ?', [id]);
  expect(retained).toEqual({ content_hash: computeSyncContentHash('foreground_daily_time', {
    source_id: source, day_key: day, duration_ms: 100_000
  }), sync_dirty: 1 });
  const smaller = { object_type: 'foreground_daily_time' as const, object_id: id, content_hash: 'older',
    payload_json: JSON.stringify({ source_id: source, day_key: day, duration_ms: 60_000 }), updated_at: '2099-01-01', deleted_at: null };
  await applySyncObjectsWithDbPort(createBetterSqliteDbPort(connection.sqlite), [smaller, smaller]);
  expect(total()).toBe(120_000);
  expect(connection.driver.queryOne(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.foreground_daily_time, [id]))
    .toEqual({ payload_json: JSON.stringify({ source_id: source, day_key: day, duration_ms: 100_000 }) });
  closeDatabaseConnection(); initializeDatabase();
  expect(total()).toBe(120_000); expect(currentSource()).toBe(rotated);
  save(rotated!, 10_000);
  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });
  expect(total()).toBe(130_000);
  expect(currentSource()).not.toBe(rotated);
});

it('rolls back to the latest settled contributions and ownership when candidate initialization fails', async () => {
  save(source, 60_000); const backup = await createApplicationDatabaseBackup();
  save(source, 100_000); save(next, 20_000);
  fixture.fail = true;
  await expect(restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath })).rejects.toThrow('restored initialization failed');
  expect(total()).toBe(120_000); expect(currentSource()).toBe(source);
  closeDatabaseConnection(); initializeDatabase();
  expect(total()).toBe(120_000); expect(currentSource()).toBe(source);
});
