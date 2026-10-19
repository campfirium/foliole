// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let stateRoot = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_cache_dir: path.join(stateRoot, 'cache'),
    app_config_dir: path.join(stateRoot, 'config'), app_data_dir: stateRoot,
    app_log_dir: path.join(stateRoot, 'logs') })
}));

import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';

import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';

beforeEach(async () => {
  stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-read-isolation-'));
  initializeDatabase();
  flushDirtyNodeSyncVersions();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(stateRoot, { recursive: true, force: true });
});

it('reads prepared sync data while the independent search database has an active writer', async () => {
  const connection = openDatabaseConnection();
  connection.sqlite.pragma('busy_timeout = 0');
  const search = new Database(connection.searchDbPath);
  try {
    search.exec('BEGIN IMMEDIATE');
    const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
    await expect(host.readSnapshot(db => db.query('SELECT id FROM nodes WHERE id = ?', ['special-inbox'])))
      .resolves.toEqual([{ id: 'special-inbox' }]);
    expect(search.inTransaction).toBe(true);
  } finally {
    if (search.inTransaction) search.exec('ROLLBACK');
    search.close();
  }
});

it.each(['dirty-version', 'missing-state', 'unversioned'] as const)('prepares %s before publishing the read snapshot', async (kind) => {
  const connection = openDatabaseConnection();
  if (kind === 'dirty-version') {
    connection.driver.execute("UPDATE nodes SET priority = 3, sync_dirty = 1 WHERE id = 'special-inbox'");
  } else if (kind === 'missing-state') {
    connection.driver.execute("DELETE FROM sync_object_state WHERE object_type = 'node' AND object_id = 'special-inbox'");
  } else {
    connection.driver.execute("UPDATE nodes SET current_version_id = NULL, sync_dirty = 0 WHERE id = 'special-inbox'");
  }
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  const rows = await host.readSnapshot(db => db.query(`SELECT n.sync_dirty,
    json_extract(v.snapshot_json, '$.priority') AS priority
    FROM nodes n JOIN sync_object_state s ON s.object_type = 'node' AND s.object_id = n.id
    JOIN node_sync_versions v ON v.version_id = s.current_version_id WHERE n.id = ?`, ['special-inbox']));
  expect(rows).toEqual([{ sync_dirty: 0, priority: kind === 'dirty-version' ? 3 : null }]);
});

it('keeps unpublished versions pending while library adoption blocks publication', async () => {
  const connection = openDatabaseConnection();
  await beginSyncGroupLocalAdoption(createBetterSqliteDbPort(connection.sqlite), {
    endpointUrl: 'http://127.0.0.1:38641', groupId: 'adopting-group', libraryEpoch: 'incoming-epoch',
    providerDeviceId: 'provider', providerDeviceName: 'Provider', providerPlatform: 'macos'
  });
  connection.driver.execute("UPDATE nodes SET priority = 3, sync_dirty = 1 WHERE id = 'special-inbox'");
  const host = createDesktopRequestSyncDatabaseHost(connection.dbPath);
  const rows = await host.readSnapshot(db => db.query(`SELECT n.sync_dirty,
    json_extract(v.snapshot_json, '$.priority') AS priority FROM nodes n
    JOIN node_sync_versions v ON v.version_id = n.current_version_id WHERE n.id = ?`, ['special-inbox']));
  expect(rows).toEqual([{ sync_dirty: 1, priority: null }]);
});
