import { randomUUID } from 'node:crypto';

import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../sync/syncObjectPayloadSql.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing, tableExists } from './numberedMigrationHelpers.js';
import { computeSyncContentHash } from './syncState.js';

interface LegacyBinding {
  binding_id: string;
  host_name: string;
  owner_device_identity_key: string | null;
  primary_path: string;
  root_path: string;
  source_ref: string;
}

function localDeviceId(sqlite: DatabaseMigrationTarget) {
  const member = sqlite.prepare(`SELECT local_device_identity_key AS id FROM sync_group_local_state
    WHERE singleton_id = 1 AND state = 'active'`).all()[0] as { id: string } | undefined;
  if (member?.id) return member.id;
  const setting = sqlite.prepare("SELECT value FROM settings WHERE key = 'device_id'")
    .all()[0] as { value: string } | undefined;
  if (!setting) return null;
  try {
    const id = JSON.parse(setting.value) as unknown;
    return typeof id === 'string' && id.trim() ? id : null;
  } catch {
    return null;
  }
}

function requeue(sqlite: DatabaseMigrationTarget, objectId: string, hostName: string,
  updatedAt: string) {
  const row = sqlite.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.watched_folder)
    .all(objectId)[0] as { payload_json: string } | undefined;
  if (!row) throw new Error('watched_source_migration_payload_missing');
  const payload = JSON.parse(row.payload_json) as Parameters<typeof computeSyncContentHash>[1];
  const hash = computeSyncContentHash('watched_folder', payload);
  sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name,
     updated_at, deleted_at, sync_dirty)
    VALUES (?, ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state),
      ?, ?, ?, NULL, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, last_modified_by_host_name = excluded.last_modified_by_host_name,
      updated_at = excluded.updated_at, deleted_at = NULL, sync_dirty = 1`)
    .run('watched_folder', objectId, hash, hostName, updatedAt);
}

function retireOldBinding(sqlite: DatabaseMigrationTarget, oldId: string, hostName: string, now: string) {
  const hash = computeSyncContentHash('watched_folder', { binding_id: oldId, deleted_at: now });
  sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name,
     updated_at, deleted_at, sync_dirty)
    VALUES ('watched_folder', ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state),
      ?, ?, ?, ?, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, last_modified_by_host_name = excluded.last_modified_by_host_name,
      updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, sync_dirty = 1`)
    .run(oldId, hash, hostName, now, now);
}

export function migrateWatchedSourceIdentity(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'watched_folder_bindings')) return;
  addColumnIfMissing(sqlite, 'watched_folder_bindings', 'local_rule_id', 'TEXT');
  addColumnIfMissing(sqlite, 'watched_folder_bindings', 'reported_path', "TEXT NOT NULL DEFAULT ''");
  const bindings = sqlite.prepare(`SELECT b.binding_id, b.primary_path, b.source_ref,
    b.owner_device_identity_key, s.root_path, s.host_name FROM watched_folder_bindings b
    JOIN desktop_sources s ON s.source_ref = b.source_ref
    WHERE b.deleted_at IS NULL ORDER BY b.binding_id`).all() as LegacyBinding[];
  if (!bindings.length) return;
  const deviceId = localDeviceId(sqlite);
  if (!deviceId) throw new Error('watched_source_migration_device_unavailable');
  const now = new Date().toISOString();
  for (const binding of bindings) {
    const path = binding.primary_path.trim() || binding.root_path.trim();
    if (!/^draft-import-source-\d+$/u.test(binding.binding_id)) {
      if (binding.owner_device_identity_key === deviceId) {
        sqlite.prepare(`UPDATE watched_folder_bindings SET local_rule_id = binding_id,
          reported_path = ? WHERE binding_id = ?`).run(path, binding.binding_id);
        requeue(sqlite, binding.binding_id, binding.host_name, now);
      }
      continue;
    }
    const nextId = `watched-${randomUUID()}`;
    const nextRef = `watched:${nextId}`;
    sqlite.prepare(`INSERT INTO desktop_sources
      (source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, created_at, updated_at)
      SELECT ?, source_type, ?, host_name, host_platform, root_path,
        path_flavor, type_settings_json, created_at, updated_at
      FROM desktop_sources WHERE source_ref = ?`).run(nextRef, nextId, binding.source_ref);
    sqlite.prepare(`UPDATE watched_folder_bindings SET binding_id = ?, source_ref = ?,
      owner_device_identity_key = ?, local_rule_id = ?, reported_path = ?
      WHERE binding_id = ?`).run(nextId, nextRef, deviceId, binding.binding_id, path,
      binding.binding_id);
    retireOldBinding(sqlite, binding.binding_id, binding.host_name, now);
    requeue(sqlite, nextId, binding.host_name, now);
  }
}
