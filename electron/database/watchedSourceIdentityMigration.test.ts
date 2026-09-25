// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
import { applyWatchedFolderObject } from '../../lib/core/sync/syncObjectWatchedFolderPayloadExecutor.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

function migratedDatabase(deviceId: string, path: string) {
  const db = new Database(':memory:');
  initializeDatabaseSchema(db);
  db.exec(`ALTER TABLE watched_folder_bindings DROP COLUMN local_rule_id;
      ALTER TABLE watched_folder_bindings DROP COLUMN reported_path;
      PRAGMA user_version = 99`);
  db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('device_id', ?, 'old')")
    .run(JSON.stringify(deviceId));
  db.prepare(`INSERT INTO desktop_sources
      (source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, created_at, updated_at)
      VALUES ('watched:draft-import-source-101', 'watched', 'draft-import-source-101',
        'Copied Host', 'win32', ?, 'windows', '{}', 'old', 'old')`).run(path);
  db.prepare(`INSERT INTO watched_folder_bindings
      (binding_id, connection_status, action_mode, highlight_mode, primary_path,
       created_at, updated_at, source_ref, owner_device_identity_key)
      VALUES ('draft-import-source-101', 'needs-folder', 'keep', 'merged', ?,
        'old', 'old', 'watched:draft-import-source-101', 'copied-owner')`).run(path);
  db.prepare(`INSERT INTO import_sources
      (source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, last_content_fingerprint, source_ref, source_location)
      VALUES ('shared-file', 'markdown', 'file', 'note.md', ?, 'old', 'old', 'hash',
        'watched:draft-import-source-101', 'note.md')`).run(`${path}/note.md`);
  initializeDatabaseSchema(db);
  return db;
}

function upgradedSource(deviceId: string, path: string) {
  const db = migratedDatabase(deviceId, path);
  try {
    const binding = db.prepare(`SELECT binding_id, local_rule_id, owner_device_identity_key,
      reported_path, source_ref FROM watched_folder_bindings`).get() as Record<string, string>;
    const source = db.prepare(`SELECT source_ref, config_ref FROM desktop_sources
      WHERE source_ref = ?`).get(binding.source_ref);
    const legacySource = db.prepare(`SELECT source_ref FROM desktop_sources
      WHERE source_ref = 'watched:draft-import-source-101'`).get();
    const imported = db.prepare(`SELECT source_ref FROM import_sources
      WHERE source_fingerprint = 'shared-file'`).get();
    const oldState = db.prepare(`SELECT deleted_at, sync_dirty FROM sync_object_state
      WHERE object_type = 'watched_folder' AND object_id = 'draft-import-source-101'`).get() as
      { deleted_at: string; sync_dirty: number };
    return { binding, imported, legacySource, oldState, source };
  } finally {
    db.close();
  }
}

it('splits copied 101 into two device-owned sources without dropping imported records', () => {
  const mac = upgradedSource('mac-device', '/Users/me/Articles');
  const windows = upgradedSource('windows-device', 'D:\\Articles');
  expect(mac.binding.binding_id).not.toBe(windows.binding.binding_id);
  expect(mac.binding).toMatchObject({
    local_rule_id: 'draft-import-source-101', owner_device_identity_key: 'mac-device',
    reported_path: '/Users/me/Articles'
  });
  expect(windows.binding).toMatchObject({
    local_rule_id: 'draft-import-source-101', owner_device_identity_key: 'windows-device',
    reported_path: 'D:\\Articles'
  });
  expect(mac.source).toEqual({ source_ref: mac.binding.source_ref, config_ref: mac.binding.binding_id });
  expect(windows.source).toEqual({ source_ref: windows.binding.source_ref, config_ref: windows.binding.binding_id });
  expect(mac.imported).toEqual({ source_ref: 'watched:draft-import-source-101' });
  expect(windows.imported).toEqual({ source_ref: 'watched:draft-import-source-101' });
  expect(mac.legacySource).toEqual({ source_ref: 'watched:draft-import-source-101' });
  expect(mac.oldState).toMatchObject({ sync_dirty: 1 });
  expect(mac.oldState.deleted_at).toBeTruthy();
});

it('exchanges both split sources while keeping remote paths display-only', async () => {
  const mac = migratedDatabase('mac-device', '/Users/me/Articles');
  const windows = migratedDatabase('windows-device', 'D:\\Articles');
  try {
    const local = (db: Database.Database) => db.prepare(`SELECT binding_id, source_ref
      FROM watched_folder_bindings`).get() as { binding_id: string; source_ref: string };
    const payload = (db: Database.Database, id: string) => db.prepare(
      SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.watched_folder).get(id) as { payload_json: string };
    const send = async (from: Database.Database, to: Database.Database,
      binding: ReturnType<typeof local>) => {
      await applyWatchedFolderObject(createBetterSqliteDbPort(to), {
        content_hash: 'hash', deleted_at: null, object_id: binding.binding_id,
        object_type: 'watched_folder', payload_json: payload(from, binding.binding_id).payload_json,
        updated_at: '2026-09-25T00:00:00.000Z'
      });
    };
    const macBinding = local(mac);
    const windowsBinding = local(windows);
    await send(mac, windows, macBinding);
    await send(windows, mac, windowsBinding);
    for (const db of [mac, windows]) {
      expect(db.prepare(`SELECT owner_device_identity_key, reported_path, primary_path
        FROM watched_folder_bindings ORDER BY owner_device_identity_key`).all()).toEqual([
        { owner_device_identity_key: 'mac-device', reported_path: '/Users/me/Articles',
          primary_path: db === mac ? '/Users/me/Articles' : '' },
        { owner_device_identity_key: 'windows-device', reported_path: 'D:\\Articles',
          primary_path: db === windows ? 'D:\\Articles' : '' }
      ]);
    }
  } finally {
    mac.close();
    windows.close();
  }
});

it('splits two copied databases even before their copied device settings are corrected', () => {
  const first = upgradedSource('copied-device', '/Users/me/Articles');
  const second = upgradedSource('copied-device', 'D:\\Articles');
  expect(first.binding.binding_id).not.toBe(second.binding.binding_id);
  expect(first.binding.local_rule_id).toBe('draft-import-source-101');
  expect(second.binding.local_rule_id).toBe('draft-import-source-101');
});

it('preserves an already distinct remote source during the legacy draft migration', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.exec(`ALTER TABLE watched_folder_bindings DROP COLUMN local_rule_id;
      ALTER TABLE watched_folder_bindings DROP COLUMN reported_path;
      PRAGMA user_version = 99`);
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('device_id', ?, 'old')")
      .run(JSON.stringify('mac-device'));
    db.prepare(`INSERT INTO desktop_sources
      (source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, created_at, updated_at)
      VALUES ('watched:remote-stable', 'watched', 'remote-stable', 'Windows',
        'win32', '', 'windows', '{}', 'old', 'old')`).run();
    db.prepare(`INSERT INTO watched_folder_bindings
      (binding_id, connection_status, action_mode, highlight_mode, primary_path,
       created_at, updated_at, source_ref, owner_device_identity_key)
      VALUES ('remote-stable', 'needs-folder', 'keep', 'merged', '',
        'old', 'old', 'watched:remote-stable', 'windows-device')`).run();
    initializeDatabaseSchema(db);
    expect(db.prepare(`SELECT binding_id, source_ref, owner_device_identity_key, local_rule_id,
      reported_path FROM watched_folder_bindings`).get()).toEqual({
      binding_id: 'remote-stable', local_rule_id: null, owner_device_identity_key: 'windows-device',
      reported_path: '', source_ref: 'watched:remote-stable'
    });
  } finally {
    db.close();
  }
});
