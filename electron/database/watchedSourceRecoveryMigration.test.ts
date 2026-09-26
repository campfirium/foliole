// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { applySyncObjectsWithDbPort } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const OLD = '2026-09-25T07:14:32.581Z';
const RULE = 'draft-import-source-102';
const PATH = 'D:\\T\\demo\\split\\artiles';

function database(deviceId: string) {
  const db = new Database(':memory:');
  initializeDatabaseSchema(db);
  db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('device_id', ?, ?)")
    .run(JSON.stringify(deviceId), OLD);
  db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('host_name', ?, ?)")
    .run(JSON.stringify(deviceId), OLD);
  db.pragma('user_version = 100');
  return db;
}

function source(db: Database.Database, id: string, host: string, rootPath: string) {
  db.prepare(`INSERT INTO desktop_sources (source_ref, source_type, config_ref, host_name,
    host_platform, root_path, path_flavor, type_settings_json, created_at, updated_at)
    VALUES (?, 'watched', ?, ?, 'win32', ?, 'windows', '{}', ?, ?)`).run(
    `watched:${id}`, id, host, rootPath, OLD, OLD
  );
}

function binding(db: Database.Database, id: string, owner: string, reportedPath: string,
  localRuleId: string | null = null) {
  db.prepare(`INSERT INTO watched_folder_bindings (binding_id, connection_status, action_mode,
    highlight_mode, primary_path, reported_path, created_at, updated_at, source_ref,
    owner_device_identity_key, local_rule_id)
    VALUES (?, 'needs-folder', 'keep', 'merged', '', ?, ?, ?, ?, ?, ?)`).run(
    id, reportedPath, OLD, OLD, `watched:${id}`, owner, localRuleId
  );
}

function state(db: Database.Database, id: string, hash: string, deletedAt: string | null = null) {
  db.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq,
    content_hash, last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
    VALUES ('watched_folder', ?, 10, ?, 'Maci', ?, ?, 0)`).run(id, hash, OLD, deletedAt);
}

it('recovers one device-owned source when the old tombstone arrived before upgrade', () => {
  const db = database('windows-device');
  try {
    source(db, RULE, 'Copied Mac', PATH);
    db.prepare(`INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at,
      updated_at) VALUES ('group-1', 'Group', 'key', ?, ?)`).run(OLD, OLD);
    db.prepare(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor,
      canonical_library_path, device_name, platform, state, joined_at, updated_at)
      VALUES ('group-1', 'windows-device', 'anchor', 'D:/library', 'V', 'Windows 11',
        'active', ?, ?)`).run(OLD, OLD);
    db.prepare(`INSERT INTO sync_group_local_state (singleton_id, group_id,
      local_device_identity_key, state, updated_at)
      VALUES (1, 'group-1', 'windows-device', 'active', ?)`).run(OLD);
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('import_manager_settings', ?, ?)")
      .run(JSON.stringify({ sources: [{ id: RULE, actionMode: 'delete', highlightMode: 'split' }] }), OLD);
    db.prepare(`INSERT INTO import_sources (source_fingerprint, provider, source_kind,
      source_name, source_locator, first_imported_at, last_imported_at,
      last_content_fingerprint, source_ref, source_location)
      VALUES ('old-file', 'markdown', 'file', 'old.md', ?, ?, ?, 'hash', ?, 'old.md')`)
      .run(`${PATH}\\old.md`, OLD, OLD, `watched:${RULE}`);
    state(db, RULE, 'tombstone', OLD);
    initializeDatabaseSchema(db);

    const recovered = db.prepare(`SELECT b.binding_id, b.local_rule_id, b.action_mode, b.highlight_mode,
      b.owner_device_identity_key, b.connection_status, b.primary_path, b.reported_path
      FROM watched_folder_bindings b`).all() as Array<Record<string, string>>;
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      local_rule_id: RULE, owner_device_identity_key: 'windows-device',
      connection_status: 'needs-folder', primary_path: '', reported_path: PATH,
      action_mode: 'delete', highlight_mode: 'split'
    });
    expect(recovered[0]!.binding_id).toMatch(/^watched-/);
    expect(db.prepare('SELECT host_name, host_platform, root_path FROM desktop_sources WHERE source_ref = ?')
      .get(`watched:${recovered[0]!.binding_id}`)).toEqual({
      host_name: 'V', host_platform: 'Windows 11', root_path: ''
    });
    expect(db.prepare('SELECT source_ref FROM import_sources').get()).toEqual({
      source_ref: `watched:${RULE}`
    });
    expect(db.prepare(`SELECT deleted_at FROM sync_object_state WHERE object_type = 'watched_folder'
      AND object_id = ?`).get(RULE)).toEqual({ deleted_at: OLD });
    expect(db.prepare(`SELECT sync_dirty FROM sync_object_state WHERE object_type = 'watched_folder'
      AND object_id = ?`).get(recovered[0]!.binding_id)).toEqual({ sync_dirty: 1 });
    initializeDatabaseSchema(db);
    expect(db.prepare('SELECT COUNT(*) AS count FROM watched_folder_bindings').get()).toEqual({ count: 1 });
  } finally { db.close(); }
});

it('leaves a deliberately removed source removed', () => {
  const db = database('windows-device');
  try {
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('import_manager_settings', ?, ?)")
      .run(JSON.stringify({ sources: [{ id: RULE }] }), OLD);
    state(db, RULE, 'tombstone', OLD);
    initializeDatabaseSchema(db);
    expect(db.prepare('SELECT COUNT(*) AS count FROM watched_folder_bindings').get()).toEqual({ count: 0 });
  } finally { db.close(); }
});

it('republishes an owned path so an equal-hash remote projection can recover', async () => {
  const mac = database('mac-device');
  const windows = database('windows-device');
  try {
    const id = 'watched-mac';
    source(mac, id, 'Maci', PATH);
    binding(mac, id, 'mac-device', PATH, RULE);
    const payload = JSON.parse((mac.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.watched_folder)
      .get(id) as { payload_json: string }).payload_json);
    const hash = computeSyncContentHash('watched_folder', payload);
    state(mac, id, hash);
    source(windows, id, 'Maci', '');
    binding(windows, id, 'mac-device', '');
    state(windows, id, hash);

    initializeDatabaseSchema(mac);
    const republished = mac.prepare(`SELECT content_hash, updated_at, sync_dirty FROM sync_object_state
      WHERE object_type = 'watched_folder' AND object_id = ?`).get(id) as
      { content_hash: string; updated_at: string; sync_dirty: number };
    expect(republished.content_hash).not.toBe(hash);
    expect(republished.updated_at > OLD).toBe(true);
    expect(republished.sync_dirty).toBe(1);
    const nextPayload = (mac.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.watched_folder)
      .get(id) as { payload_json: string }).payload_json;
    await applySyncObjectsWithDbPort(createBetterSqliteDbPort(windows), [{
      object_type: 'watched_folder', object_id: id, content_hash: republished.content_hash,
      deleted_at: null, updated_at: republished.updated_at, payload_json: nextPayload
    }], { onSkippedRecord: (_record, error) => { throw error; } });
    expect(windows.prepare(`SELECT primary_path, reported_path FROM watched_folder_bindings
      WHERE binding_id = ?`).get(id)).toEqual({ primary_path: '', reported_path: PATH });
  } finally { mac.close(); windows.close(); }
});
