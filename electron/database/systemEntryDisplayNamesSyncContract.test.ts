// @vitest-environment node

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { expect, it, vi } from 'vitest';

import { applySyncPackSettingObjectsWithDbPort } from '../../lib/core/sync/syncPackSyncObjectsExecutor.js';
import {
  SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY,
  SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_KEY,
  SYSTEM_ENTRY_IDS
} from '../../lib/platform/systemEntryDisplayNameContract.js';
import { createCapacitorSqliteDbPort } from '../../src/shared/platform/capacitorSqliteDbPort.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';
import {
  mockedSyncPackBuilderAppDataDir,
  resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle
} from './syncPackBuilderTestSupport.js';
import { readStoredZipEntries } from './syncPackZipReaderTestSupport.js';
import {
  loadSystemEntryDisplayNames,
  saveSystemEntryDisplayNames
} from './systemEntryDisplayNames.js';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
    app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
    app_data_dir: mockedSyncPackBuilderAppDataDir,
    app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
  })
}));

setupSyncPackBuilderTestLifecycle();
const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

const names = Object.fromEntries(SYSTEM_ENTRY_IDS.map((id) => [id, `Shared ${id}`]));
const payload = { customDisplayNameById: names, version: 1 };

it('round-trips one desktop-generated name map into desktop and companion sqlite', async () => {
  const incomingPath = await buildAndExtractPack();
  const desktop = createTarget();
  const companion = createTarget();
  try {
    installOlderWholeMap(desktop);
    installOlderWholeMap(companion);
    await attachAndApply(createBetterSqliteDbPort(desktop), desktop, incomingPath);
    await attachAndApply(createCapacitorSqliteDbPort(fakeCapacitorConnection(companion) as never, 'android'), companion, incomingPath);

    expect(readStoredPayload(desktop)).toEqual(payload);
    expect(readStoredPayload(companion)).toEqual(payload);
  } finally {
    desktop.close();
    companion.close();
  }
});

it('rejects an invalid map before either sqlite target can materialize it', async () => {
  const incomingPath = await buildAndExtractPack();
  const incoming = new BetterSqlite3(incomingPath);
  const invalid = JSON.stringify({ customDisplayNameById: { future: 'Future' }, version: 1 });
  const envelope = JSON.stringify({
    form_factor: 'desktop', host_name: '*', key: SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_KEY,
    platform: 'windows', scope: 'user_space', value_json: invalid
  });
  incoming.prepare('UPDATE sync_objects SET payload_json = ?').run(envelope);
  incoming.close();

  const target = createTarget();
  try {
    target.exec(`ATTACH DATABASE '${sqlPath(incomingPath)}' AS inc`);
    await expect(applySyncPackSettingObjectsWithDbPort(createBetterSqliteDbPort(target), {
      hostName: 'desktop-target', incomingAlias: 'inc'
    })).rejects.toThrow('unknown_system_entry_id:future');
    expect(target.prepare('SELECT COUNT(*) count FROM setting_records').get()).toEqual({ count: 0 });
    target.exec('DETACH DATABASE inc');
  } finally {
    target.close();
  }
});

async function buildAndExtractPack() {
  expect(saveSystemEntryDisplayNames(payload)).toEqual(payload);
  expect(loadSystemEntryDisplayNames()).toEqual(payload);
  expect(openDatabaseConnection().driver.queryOne<{ sync_dirty: number }>(
    `SELECT sync_dirty FROM sync_object_state
     WHERE object_type = 'setting' AND object_id = ?`,
    [SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY.objectId]
  )).toEqual({ sync_dirty: 1 });
  const packPath = resolveSyncPackPath('system-entry-display-names.syncpack');
  await buildDesktopSyncPack({
    createdAt: '2026-08-22T01:01:00.000Z', fromPeerId: 'desktop-authorization',
    fromStateSeq: 0, outputPath: packPath, packId: 'system-entry-display-names-v1',
    toPeerId: 'companion-authorization'
  });
  const entry = readStoredZipEntries(packPath).get('incoming.db.deflate');
  if (!entry) throw new Error('missing_sync_pack_database');
  const incomingPath = resolveSyncPackPath('system-entry-display-names-incoming.db');
  fs.writeFileSync(incomingPath, inflateSync(entry));
  const incoming = new BetterSqlite3(incomingPath, { readonly: true });
  expect(incoming.prepare('SELECT object_id FROM sync_objects').pluck().all()).toEqual([
    SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY.objectId
  ]);
  incoming.close();
  return incomingPath;
}

function installOlderWholeMap(sqlite: InstanceType<typeof BetterSqlite3>) {
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

async function attachAndApply(
  port: ReturnType<typeof createBetterSqliteDbPort>,
  sqlite: InstanceType<typeof BetterSqlite3>,
  incomingPath: string
) {
  sqlite.exec(`ATTACH DATABASE '${sqlPath(incomingPath)}' AS inc`);
  await expect(applySyncPackSettingObjectsWithDbPort(port, {
    hostName: 'target-host', incomingAlias: 'inc'
  })).resolves.toBe(1);
  sqlite.exec('DETACH DATABASE inc');
}

function createTarget() {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.exec(`
    CREATE TABLE setting_records (
      key TEXT NOT NULL, scope TEXT NOT NULL, platform TEXT NOT NULL, form_factor TEXT NOT NULL,
      host_name TEXT NOT NULL, value_json TEXT NOT NULL, content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT,
      PRIMARY KEY (key, scope, platform, form_factor, host_name)
    );
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL,
      content_hash TEXT NOT NULL, last_modified_by_host_name TEXT NOT NULL,
      updated_at TEXT NOT NULL, sync_dirty INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
      PRIMARY KEY (object_type, object_id)
    );
    CREATE TABLE sync_delivery_receipts (
      authorization_id TEXT, stream_name TEXT, object_type TEXT, object_id TEXT,
      payload_identity TEXT, status TEXT, remote_position TEXT
    );
  `);
  return sqlite;
}

function readStoredPayload(sqlite: InstanceType<typeof BetterSqlite3>) {
  const row = sqlite.prepare('SELECT value_json FROM setting_records').get() as { value_json: string };
  return JSON.parse(row.value_json);
}

function fakeCapacitorConnection(sqlite: InstanceType<typeof BetterSqlite3>) {
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

function sqlPath(value: string) {
  return value.replaceAll("'", "''");
}
