import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../sync/syncObjectPayloadSql.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing, tableExists } from './numberedMigrationHelpers.js';
import { computeSyncContentHash } from './syncState.js';

interface SourceRow {
  config_ref: string;
  host_name: string;
  source_ref: string;
  updated_at: string;
}

function localDeviceId(sqlite: DatabaseMigrationTarget) {
  const row = sqlite.prepare(`SELECT local_device_identity_key AS id, group_id
    FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'`).all()[0] as
    { group_id: string; id: string } | undefined;
  if (row) return row;
  const setting = sqlite.prepare("SELECT value FROM settings WHERE key = 'device_id'").all()[0] as
    { value: string } | undefined;
  if (!setting) return null;
  try { return { group_id: null, id: JSON.parse(setting.value) as string }; }
  catch { return null; }
}

function ownerForHost(sqlite: DatabaseMigrationTarget, hostName: string,
  local: ReturnType<typeof localDeviceId>) {
  if (!local) return null;
  if (!local.group_id) {
    const host = sqlite.prepare("SELECT value FROM settings WHERE key = 'host_name'").all()[0] as
      { value: string } | undefined;
    try { return host && JSON.parse(host.value) === hostName ? local.id : null; }
    catch { return null; }
  }
  const members = sqlite.prepare(`SELECT device_identity_key AS id FROM sync_group_devices
    WHERE group_id = ? AND device_name = ? AND state = 'active'`).all(local.group_id, hostName) as
    Array<{ id: string }>;
  return members.length === 1 ? members[0]!.id : null;
}

function scrubSharedSources(sqlite: DatabaseMigrationTarget) {
  const row = sqlite.prepare("SELECT value, updated_at FROM settings WHERE key = 'import_manager_settings'")
    .all()[0] as { updated_at: string; value: string } | undefined;
  const scrub = (json: string) => {
    const value = JSON.parse(json) as Record<string, unknown>;
    if (!Array.isArray(value.sources)) return json;
    value.sources = value.sources.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
      const source = { ...entry } as Record<string, unknown>;
      delete source.primaryPath;
      delete source.highlightPath;
      delete source.archivePath;
      return source;
    });
    return JSON.stringify(value);
  };
  if (row) sqlite.prepare("UPDATE settings SET value = ? WHERE key = 'import_manager_settings'")
    .run(scrub(row.value));
  const records = sqlite.prepare(`SELECT scope, platform, form_factor, host_name, value_json, updated_at
    FROM setting_records WHERE key = 'import_manager_settings'`).all() as Array<{
      scope: string; platform: string; form_factor: string; host_name: string;
      value_json: string; updated_at: string;
    }>;
  for (const record of records) {
    const valueJson = scrub(record.value_json);
    const hash = computeSyncContentHash('setting', { ...record,
      key: 'import_manager_settings', value_json: valueJson });
    sqlite.prepare(`UPDATE setting_records SET value_json = ?, content_hash = ?
      WHERE key = 'import_manager_settings' AND scope = ? AND platform = ?
        AND form_factor = ? AND host_name = ?`).run(valueJson, hash,
      record.scope, record.platform, record.form_factor, record.host_name);
    sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('setting', ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?, ?, ?, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, sync_dirty = 1`).run(
      `${record.scope}:${record.platform}:${record.form_factor}:${record.host_name}:import_manager_settings`,
      hash, record.host_name, record.updated_at
    );
  }
}

function requeueWatchedBinding(sqlite: DatabaseMigrationTarget, bindingId: string) {
  const row = sqlite.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.watched_folder).all(bindingId)[0] as
    { payload_json: string } | undefined;
  if (!row) throw new Error('watched_binding_payload_missing');
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  const hash = computeSyncContentHash('watched_folder',
    payload as Parameters<typeof computeSyncContentHash>[1]);
  const host = typeof payload.host_name === 'string' ? payload.host_name : '';
  const updatedAt = typeof payload.updated_at === 'string' ? payload.updated_at : '';
  sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('watched_folder', ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?, ?, ?, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, updated_at = excluded.updated_at, sync_dirty = 1`).run(
    bindingId, hash, host, updatedAt
  );
}

export function migrateWatchedDeviceBindings(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'watched_folder_bindings') || !tableExists(sqlite, 'desktop_sources')) return;
  addColumnIfMissing(sqlite, 'watched_folder_bindings', 'owner_device_identity_key', 'TEXT');
  addColumnIfMissing(sqlite, 'watched_folder_bindings', 'reported_path', "TEXT NOT NULL DEFAULT ''");
  const local = localDeviceId(sqlite);
  const sources = sqlite.prepare(`SELECT source_ref, config_ref, host_name, updated_at
    FROM desktop_sources WHERE source_type = 'watched' ORDER BY source_ref`).all() as SourceRow[];
  for (const source of sources) {
    const owner = ownerForHost(sqlite, source.host_name, local);
    sqlite.prepare(`INSERT OR IGNORE INTO watched_folder_bindings
      (binding_id, connection_status, action_mode, highlight_mode, created_at, updated_at,
       source_ref, owner_device_identity_key)
      VALUES (?, 'needs-folder', 'keep', 'merged', ?, ?, ?, ?)`).run(
      source.config_ref, source.updated_at, source.updated_at, source.source_ref, owner
    );
    sqlite.prepare(`UPDATE watched_folder_bindings SET owner_device_identity_key = ?,
      connection_status = 'needs-folder' WHERE source_ref = ?`).run(owner, source.source_ref);
  }
  const bindings = sqlite.prepare(`SELECT binding_id FROM watched_folder_bindings
    WHERE deleted_at IS NULL ORDER BY binding_id`).all() as Array<{ binding_id: string }>;
  for (const binding of bindings) requeueWatchedBinding(sqlite, binding.binding_id);
  const imports = sqlite.prepare(`SELECT source_fingerprint, last_imported_at FROM import_sources
    WHERE watched_binding_id IS NOT NULL OR EXISTS (SELECT 1 FROM desktop_sources s
      WHERE s.source_ref = import_sources.source_ref AND s.source_type = 'watched')
    ORDER BY source_fingerprint`).all() as Array<{
      source_fingerprint: string; last_imported_at: string;
    }>;
  for (const source of imports) {
    const row = sqlite.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.import_source)
      .all(source.source_fingerprint)[0] as { payload_json: string };
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    delete payload.last_imported_at;
    const hash = computeSyncContentHash('import_source',
      payload as Parameters<typeof computeSyncContentHash>[1]);
    sqlite.prepare(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
      VALUES ('import_source', ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?, '', ?, 1)
      ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
        content_hash = excluded.content_hash, sync_dirty = 1`).run(
      source.source_fingerprint, hash, source.last_imported_at
    );
  }
  scrubSharedSources(sqlite);
}
