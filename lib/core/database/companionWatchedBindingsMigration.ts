import type { DbPort, DbRow } from '../sync/dbPort.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../sync/syncObjectPayloadSql.js';

import { computeCompanionContentHash } from './companionHostStateHashes.js';

interface Member extends DbRow { device_identity_key: string; device_name: string }
interface Binding extends DbRow { binding_id: string; host_name: string }
interface Source extends DbRow {
  config_ref: string; host_name: string; source_ref: string; updated_at: string;
}
interface ImportSource extends DbRow { source_fingerprint: string; last_imported_at: string }
interface Payload extends DbRow { payload_json: string }
interface Setting extends DbRow {
  form_factor: string; host_name: string; key: string; platform: string; scope: string;
  updated_at: string; value_json: string;
}

async function queueState(db: DbPort, type: string, objectId: string, hash: string,
  hostName: string, updatedAt: string) {
  const [current] = await db.query<{ next: number }>(
    'SELECT COALESCE(MAX(state_seq), 0) + 1 AS next FROM sync_object_state'
  );
  await db.run(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, sync_dirty = 1`,
  [type, objectId, current?.next ?? 1, hash, hostName, updatedAt]);
}

async function scrubSharedSetting(db: DbPort) {
  const rows = await db.query<Setting>(`SELECT key, scope, platform, form_factor, host_name,
    value_json, updated_at FROM setting_records WHERE key = 'import_manager_settings'`);
  for (const row of rows) {
    const value = JSON.parse(row.value_json) as Record<string, unknown>;
    if (!Array.isArray(value.sources)) continue;
    value.sources = value.sources.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
      const source = { ...entry } as Record<string, unknown>;
      delete source.primaryPath;
      delete source.highlightPath;
      delete source.archivePath;
      return source;
    });
    const valueJson = JSON.stringify(value);
    const hash = computeCompanionContentHash({ form_factor: row.form_factor, host_name: row.host_name,
      key: row.key, platform: row.platform, scope: row.scope, value_json: valueJson });
    await db.run(`UPDATE setting_records SET value_json = ?, content_hash = ?
      WHERE key = ? AND scope = ? AND platform = ? AND form_factor = ? AND host_name = ?`,
    [valueJson, hash, row.key, row.scope, row.platform, row.form_factor, row.host_name]);
    await queueState(db, 'setting',
      `${row.scope}:${row.platform}:${row.form_factor}:${row.host_name}:${row.key}`,
      hash, row.host_name, row.updated_at);
  }
}

export async function migrateCompanionWatchedBindings(db: DbPort) {
  const members = await db.query<Member>(`SELECT d.device_identity_key, d.device_name
    FROM sync_group_local_state l JOIN sync_group_devices d ON d.group_id = l.group_id
    WHERE l.singleton_id = 1 AND l.state = 'active' AND d.state = 'active'`);
  const sources = await db.query<Source>(`SELECT source_ref, config_ref, host_name, updated_at
    FROM desktop_sources WHERE source_type = 'watched' ORDER BY source_ref`);
  for (const source of sources) {
    const candidates = members.filter((member) => member.device_name === source.host_name);
    const owner = candidates.length === 1 ? candidates[0]!.device_identity_key : null;
    await db.run(`INSERT OR IGNORE INTO watched_folder_bindings
      (binding_id, connection_status, action_mode, highlight_mode, created_at, updated_at,
       source_ref, owner_device_identity_key)
      VALUES (?, 'needs-folder', 'keep', 'merged', ?, ?, ?, ?)`,
    [source.config_ref, source.updated_at, source.updated_at, source.source_ref, owner]);
  }
  const bindings = await db.query<Binding>(`SELECT b.binding_id, s.host_name
    FROM watched_folder_bindings b JOIN desktop_sources s ON s.source_ref = b.source_ref
    WHERE b.deleted_at IS NULL ORDER BY b.binding_id`);
  for (const binding of bindings) {
    const candidates = members.filter((member) => member.device_name === binding.host_name);
    const owner = candidates.length === 1 ? candidates[0]!.device_identity_key : null;
    await db.run(`UPDATE watched_folder_bindings SET owner_device_identity_key = ?,
      connection_status = 'needs-folder' WHERE binding_id = ?`, [owner, binding.binding_id]);
    const [payload] = await db.query<Payload>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.watched_folder,
      [binding.binding_id]);
    if (!payload) throw new Error('watched_binding_payload_missing');
    const shared = JSON.parse(payload.payload_json) as { host_name: string; updated_at: string };
    await queueState(db, 'watched_folder', binding.binding_id,
      computeCompanionContentHash(shared), shared.host_name, shared.updated_at);
  }
  const imports = await db.query<ImportSource>(`SELECT source_fingerprint, last_imported_at
    FROM import_sources WHERE watched_binding_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM desktop_sources s WHERE s.source_ref = import_sources.source_ref
        AND s.source_type = 'watched') ORDER BY source_fingerprint`);
  for (const source of imports) {
    const [payload] = await db.query<Payload>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.import_source,
      [source.source_fingerprint]);
    if (!payload) throw new Error('watched_import_source_payload_missing');
    const shared = JSON.parse(payload.payload_json) as Record<string, unknown>;
    delete shared.last_imported_at;
    await queueState(db, 'import_source', source.source_fingerprint,
      computeCompanionContentHash(shared), '', source.last_imported_at);
  }
  await scrubSharedSetting(db);
}
