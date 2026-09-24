// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-accepted-setting-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { buildSyncPackApplyableRowsSql } from '../../lib/core/sync/syncPackApplyStatements.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { materializeDesktopSettingRecord } from './desktopSettingMaterializer.js';

let incomingPath = '';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-accepted-setting-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  incomingPath = path.join(tempRoot, 'incoming.db');
  initializeDatabaseConnection(openDatabaseConnection());
  seedLocalAcceptedSetting();
  createIncomingSettingPack(incomingPath);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('applies payload, state, and receipt together for an accepted local setting', async () => {
  const sqlite = openDatabaseConnection().sqlite;
  const port = createBetterSqliteDbPort(sqlite, { name: 'accepted-setting-atomicity' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0, hostName: 'Local Host', incomingAlias: 'inc', sourcePeerId: 'peer-b'
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(sqlite.prepare(
    `SELECT value_json, content_hash FROM setting_records
     WHERE key = 'app_settings' AND scope = 'user_space'`
  ).get()).toEqual({ content_hash: 'new-hash', value_json: '{"theme":"light"}' });
  expect(sqlite.prepare(
    `SELECT content_hash, sync_dirty FROM sync_object_state
     WHERE object_type = 'setting' AND object_id = 'user_space:all:all:*:app_settings'`
  ).get()).toEqual({ content_hash: 'new-hash', sync_dirty: 0 });
  expect(sqlite.prepare(
    `SELECT status FROM sync_delivery_receipts WHERE peer_id = 'peer-b'`
  ).get()).toEqual({ status: 'confirmed' });
});

it('converges a newer Readwise owner despite a pending local receipt and rejects the older epoch', async () => {
  const sqlite = openDatabaseConnection().sqlite;
  const objectId = 'user_space:windows:desktop:*:readwise_active_host';
  const localOwner = readwiseOwner(2, 'Windows');
  const remoteOwner = readwiseOwner(3, 'Mac');
  seedReadwiseOwnerHandoffPack(sqlite, objectId, localOwner, remoteOwner);

  const port = createBetterSqliteDbPort(sqlite, { name: 'owner-epoch-convergence' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
      hostName: 'Windows', incomingAlias: 'inc', sourcePeerId: 'mac-peer',
      onSettingApplied: materializeDesktopSettingRecord });
  } finally { await port.run('DETACH DATABASE inc'); }

  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'readwise_active_host'").get())
    .toEqual({ value: remoteOwner });
  expect(sqlite.prepare(`SELECT value_json FROM setting_records WHERE key = 'readwise_active_host'`).get())
    .toEqual({ value_json: remoteOwner });
  expect(sqlite.prepare(`SELECT content_hash, sync_dirty FROM sync_object_state
    WHERE object_type = 'setting' AND object_id = ?`).get(objectId))
    .toEqual({ content_hash: 'owner-3', sync_dirty: 0 });
  makeReadwiseOwnerPackStale(objectId, localOwner);
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    const rows = await port.query<{ object_id: string }>(
      `SELECT object_id FROM ${buildSyncPackApplyableRowsSql({ incomingAlias: 'inc',
        objectType: 'setting', sourcePeerId: 'mac-peer' })} WHERE object_id = ?`, [objectId]
    );
    expect(rows).toEqual([]);
  } finally { await port.run('DETACH DATABASE inc'); }
});

function seedLocalAcceptedSetting() {
  openDatabaseConnection().sqlite.exec(`
    INSERT INTO setting_records (
      key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at
    ) VALUES ('app_settings', 'user_space', 'all', 'all', '*',
      '{"theme":"dark"}', 'old-hash', '2026-09-07T07:00:00.000Z');
    INSERT INTO sync_object_state (
      object_type, object_id, state_seq, content_hash, last_modified_by_host_name,
      updated_at, sync_dirty, deleted_at
    ) VALUES ('setting', 'user_space:all:all:*:app_settings', 4, 'old-hash',
      'Local Host', '2026-09-07T07:00:00.000Z', 1, NULL);
    INSERT INTO sync_delivery_receipts (
      peer_id, stream_name, operation_id, object_type, object_id, payload_identity,
      local_position, status, remote_position, issue_reason, created_at, updated_at
    ) VALUES ('peer-b', 'state', 'setting:app_settings:4', 'setting',
      'user_space:all:all:*:app_settings', 'old-hash', '4', 'accepted', '7', NULL,
      '2026-09-07T07:00:00.000Z', '2026-09-07T07:00:00.000Z');
  `);
}

function createIncomingSettingPack(filePath: string) {
  const db = new Database(filePath);
  try {
    for (const statement of PACK_SCHEMA) db.exec(statement);
    db.prepare('INSERT INTO pack_manifest (key, value) VALUES (?, ?)').run(
      'manifest_json', JSON.stringify({ from_state_seq: 0, to_state_seq: 7 })
    );
    db.exec(`
      INSERT INTO sync_object_state (
        object_type, object_id, state_seq, content_hash, last_modified_by_host_name,
        updated_at, deleted_at
      ) VALUES ('setting', 'user_space:all:all:*:app_settings', 7, 'new-hash',
        'Peer B', '2026-09-07T08:00:00.000Z', NULL);
      INSERT INTO sync_objects (
        object_type, object_id, content_hash, payload_json, updated_at, deleted_at
      ) VALUES ('setting', 'user_space:all:all:*:app_settings', 'new-hash',
        '{"key":"app_settings","scope":"user_space","platform":"all","form_factor":"all","host_name":"*","value_json":"{\\"theme\\":\\"light\\"}"}',
        '2026-09-07T08:00:00.000Z', NULL);
    `);
  } finally {
    db.close();
  }
}

function readwiseOwner(epoch: number, host: string) {
  return JSON.stringify({ device_identity_key: `${host}-device`, epoch, host_name: host });
}

function ownerPayload(valueJson: string) {
  return JSON.stringify({ key: 'readwise_active_host', scope: 'user_space',
    platform: 'windows', form_factor: 'desktop', host_name: '*', value_json: valueJson });
}

function seedReadwiseOwnerHandoffPack(sqlite: Database.Database, objectId: string,
  localOwner: string, remoteOwner: string) {
  sqlite.prepare(`INSERT INTO setting_records (key, scope, platform, form_factor, host_name,
    value_json, content_hash, updated_at) VALUES (?, 'user_space', 'windows', 'desktop', '*', ?, ?, ?)`)
    .run('readwise_active_host', localOwner, 'owner-2', '2026-09-24T03:20:00.000Z');
  sqlite.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)`)
    .run('readwise_active_host', localOwner, '2026-09-24T03:20:00.000Z');
  sqlite.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash,
    last_modified_by_host_name, updated_at, sync_dirty, deleted_at)
    VALUES ('setting', ?, 8, 'owner-2', 'Windows', '2026-09-24T03:20:00.000Z', 1, NULL)`)
    .run(objectId);
  sqlite.prepare(`INSERT INTO sync_delivery_receipts (peer_id, stream_name, operation_id,
    object_type, object_id, payload_identity, local_position, status, remote_position,
    issue_reason, created_at, updated_at) VALUES ('mac-peer', 'state', 'owner-2',
    'setting', ?, 'owner-2', '8', 'pending', NULL, NULL, ?, ?)`)
    .run(objectId, '2026-09-24T03:20:00.000Z', '2026-09-24T03:20:00.000Z');
  const incoming = new Database(incomingPath);
  try {
    incoming.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq,
      content_hash, last_modified_by_host_name, updated_at, deleted_at)
      VALUES ('setting', ?, 9, 'owner-3', 'Mac', '2026-09-24T03:21:00.000Z', NULL)`)
      .run(objectId);
    incoming.prepare(`INSERT INTO sync_objects (object_type, object_id, content_hash,
      payload_json, updated_at, deleted_at) VALUES ('setting', ?, 'owner-3', ?,
      '2026-09-24T03:21:00.000Z', NULL)`)
      .run(objectId, ownerPayload(remoteOwner));
  } finally { incoming.close(); }
}

function makeReadwiseOwnerPackStale(objectId: string, localOwner: string) {
  const stalePack = new Database(incomingPath);
  try {
    stalePack.prepare(`UPDATE sync_object_state SET content_hash = 'owner-2',
      updated_at = '2026-09-24T03:22:00.000Z' WHERE object_id = ?`).run(objectId);
    stalePack.prepare(`UPDATE sync_objects SET content_hash = 'owner-2',
      payload_json = ?, updated_at = '2026-09-24T03:22:00.000Z' WHERE object_id = ?`)
      .run(ownerPayload(localOwner), objectId);
  } finally { stalePack.close(); }
}
