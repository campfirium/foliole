// @vitest-environment node

import path from 'node:path';

import type { Database } from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import {
  SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY,
  SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_KEY,
  SYSTEM_ENTRY_IDS
} from '../../lib/platform/systemEntryDisplayNameContract.js';
import { createCapacitorSqliteDbPort } from '../../src/shared/platform/capacitorSqliteDbPort.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { mockedRequestProjectionAppDataDir, ownerPort, projectionPeer, setupRequestProjection, transferProjection } from './requestProjection.testSupport.js';
import {
  loadSystemEntryDisplayNames,
  saveSystemEntryDisplayNames
} from './systemEntryDisplayNames.js';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedRequestProjectionAppDataDir, 'cache'),
    app_config_dir: path.join(mockedRequestProjectionAppDataDir, 'config'),
    app_data_dir: mockedRequestProjectionAppDataDir,
    app_log_dir: path.join(mockedRequestProjectionAppDataDir, 'logs')
  })
}));

setupRequestProjection();

const names = Object.fromEntries(SYSTEM_ENTRY_IDS.map((id) => [id, `Shared ${id}`]));
const payload = { customDisplayNameById: names, version: 1 };

it('round-trips one desktop-generated name map into desktop and companion sqlite', async () => {
  saveSourceMap();
  const desktop = projectionPeer('target').sqlite;
  const companion = projectionPeer('observer').sqlite;
  installOlderWholeMap(desktop);
  installOlderWholeMap(companion);
  await transferProjection(ownerPort(), createBetterSqliteDbPort(desktop));
  await transferProjection(ownerPort(), createCapacitorSqliteDbPort(fakeCapacitorConnection(companion) as never, 'android'));

  expect(readStoredPayload(desktop)).toEqual(payload);
  expect(readStoredPayload(companion)).toEqual(payload);
});

it('rejects an invalid map before either sqlite target can materialize it', async () => {
  saveSourceMap();
  const incoming = openDatabaseConnection().sqlite;
  const invalid = JSON.stringify({ customDisplayNameById: { future: 'Future' }, version: 1 });
  const envelope = JSON.stringify({
    form_factor: 'desktop', host_name: '*', key: SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_KEY,
    platform: 'windows', scope: 'user_space', value_json: invalid
  });
  const contentHash = computeSyncContentHash('setting', JSON.parse(envelope));
  incoming.prepare('UPDATE setting_records SET value_json = ?, content_hash = ?').run(invalid, contentHash);
  incoming.prepare('UPDATE sync_object_state SET content_hash = ?').run(contentHash);


  for (const id of ['target', 'observer']) {
    const target = projectionPeer(id).sqlite;
    const port = id === 'target' ? createBetterSqliteDbPort(target)
      : createCapacitorSqliteDbPort(fakeCapacitorConnection(target) as never, 'android');
    await expect(transferProjection(ownerPort(), port)).rejects.toThrow('unknown_system_entry_id:future');
    expect(target.prepare('SELECT COUNT(*) count FROM setting_records').get()).toEqual({ count: 0 });
  }
});

function saveSourceMap() {
  expect(saveSystemEntryDisplayNames(payload)).toEqual(payload);
  expect(loadSystemEntryDisplayNames()).toEqual(payload);
  expect(openDatabaseConnection().driver.queryOne<{ sync_dirty: number }>(
    `SELECT sync_dirty FROM sync_object_state WHERE object_type = 'setting' AND object_id = ?`,
    [SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY.objectId]
  )).toEqual({ sync_dirty: 1 });
}

function installOlderWholeMap(sqlite: Database) {
  sqlite.prepare(`INSERT INTO setting_records (
    key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at
  ) VALUES (?, 'user_space', 'windows', 'desktop', '*', ?, 'older-hash', '2026-08-22T00:00:00.000Z')`)
    .run(SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_KEY, JSON.stringify({
      customDisplayNameById: { home: 'Older Home', inbox: 'Must not be field-merged' }, version: 1
    }));
  sqlite.prepare(`INSERT INTO sync_object_state (
    object_type, object_id, state_seq, content_hash, last_modified_by_host_name,
    updated_at, sync_dirty
  ) VALUES ('setting', ?, 1, 'older-hash', 'older-host', '2026-08-22T00:00:00.000Z', 0)`)
    .run(SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY.objectId);
}

function readStoredPayload(sqlite: Database) {
  const row = sqlite.prepare('SELECT value_json FROM setting_records').get() as { value_json: string };
  return JSON.parse(row.value_json);
}

function fakeCapacitorConnection(sqlite: Database) {
  return {
    beginTransaction: vi.fn(async () => sqlite.exec('BEGIN')),
    commitTransaction: vi.fn(async () => sqlite.exec('COMMIT')),
    query: vi.fn(async (sql: string, params: unknown[] = []) => ({ values: sqlite.prepare(sql).all(...params) })),
    rollbackTransaction: vi.fn(async () => sqlite.exec('ROLLBACK')),
    run: vi.fn(async (sql: string, params: unknown[] = []) => {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: { changes: result.changes, lastId: Number(result.lastInsertRowid) } };
    })
  };
}
