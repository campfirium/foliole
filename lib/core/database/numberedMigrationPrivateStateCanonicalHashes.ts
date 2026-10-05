import {
  buildCanonicalSettingSyncPayload,
  buildCanonicalViewStateSyncPayload
} from '../sync/canonicalPrivateStatePayload.js';
import { buildCanonicalSyncTombstone } from '../sync/canonicalSyncTombstone.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { computeSyncContentHash } from './syncState.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

interface SettingRow {
  content_hash: string;
  form_factor: string;
  host_name: string;
  key: string;
  platform: string;
  scope: string;
  value_json: string;
}

interface StateRow {
  content_hash: string;
  object_id: string;
}

interface ViewRow {
  node_id: string;
  scroll_top: number;
  selection_from: number | null;
  selection_to: number | null;
}

export function migratePrivateStateCanonicalHashes(sqlite: DatabaseMigrationTarget) {
  migrateSettings(sqlite);
  migrateViewStates(sqlite);
  migrateTombstones(sqlite);
}

function migrateSettings(sqlite: DatabaseMigrationTarget) {
  const rows = sqlite.prepare(
    `SELECT content_hash, form_factor, host_name, key, platform, scope, value_json
     FROM setting_records WHERE deleted_at IS NULL`
  ).all() as SettingRow[];
  const updateRecord = sqlite.prepare(
    `UPDATE setting_records SET content_hash = ?
     WHERE key = ? AND scope = ? AND platform = ? AND form_factor = ? AND host_name = ?
       AND content_hash IS NOT ?`
  );
  for (const row of rows) {
    const hash = computeSyncContentHash('setting', buildCanonicalSettingSyncPayload(row));
    updateRecord.run(hash, row.key, row.scope, row.platform, row.form_factor, row.host_name, hash);
    publishChangedHash(sqlite, 'setting', settingObjectId(row), hash);
  }
}

function migrateViewStates(sqlite: DatabaseMigrationTarget) {
  const states = sqlite.prepare(
    `SELECT object_id, content_hash FROM sync_object_state
     WHERE object_type = 'view_state' AND deleted_at IS NULL`
  ).all() as StateRow[];
  for (const state of states) {
    const payload = readViewPayload(sqlite, state.object_id);
    if (!payload) continue;
    publishChangedHash(sqlite, 'view_state', state.object_id,
      computeSyncContentHash('view_state', payload));
  }
}

function migrateTombstones(sqlite: DatabaseMigrationTarget) {
  const states = sqlite.prepare(
    `SELECT object_id, object_type FROM sync_object_state
     WHERE object_type IN ('setting', 'view_state') AND deleted_at IS NOT NULL`
  ).all() as Array<{ object_id: string; object_type: 'setting' | 'view_state' }>;
  for (const state of states) {
    publishChangedHash(sqlite, state.object_type, state.object_id, computeSyncContentHash(
      state.object_type, buildCanonicalSyncTombstone(state.object_id)
    ), true);
  }
}

function readViewPayload(sqlite: DatabaseMigrationTarget, objectId: string) {
  const parts = objectId.split(':');
  const [scope, platform, formFactor, hostName] = parts;
  const key = parts.slice(4).join(':');
  if (!scope || !platform || !formFactor || !hostName || !key) return null;
  const identity = { form_factor: formFactor, host_name: hostName, key, platform, scope };
  if (key === 'active_node') {
    const row = sqlite.prepare(
      "SELECT NULLIF(value, '') AS active_node_id FROM workspace_meta WHERE key = 'active_node_id'"
    ).all()[0] as { active_node_id: string | null } | undefined;
    return buildCanonicalViewStateSyncPayload({ ...identity, active_node_id: row?.active_node_id ?? null });
  }
  if (!key.startsWith('node:')) return null;
  const row = sqlite.prepare(
    `SELECT node_id, scroll_top, selection_from, selection_to FROM node_view_state
     WHERE node_id = ? AND host_name = ?`
  ).all(key.slice(5), hostName)[0] as ViewRow | undefined;
  return row ? buildCanonicalViewStateSyncPayload({ ...identity, ...row }) : null;
}

function publishChangedHash(
  sqlite: DatabaseMigrationTarget,
  objectType: 'setting' | 'view_state',
  objectId: string,
  hash: string,
  deleted = false
) {
  sqlite.prepare(
    `UPDATE sync_object_state SET
       base_content_hash = CASE WHEN sync_dirty = 1 THEN COALESCE(base_content_hash, content_hash)
                                ELSE content_hash END,
       content_hash = ?, state_seq = ${NEXT_SYNC_STATE_SEQ_SQL}, sync_dirty = 1
     WHERE object_type = ? AND object_id = ? AND deleted_at IS ${deleted ? 'NOT ' : ''}NULL
       AND content_hash IS NOT ?`
  ).run(hash, objectType, objectId, hash);
}

function settingObjectId(row: SettingRow) {
  return `${row.scope}:${row.platform}:${row.form_factor}:${row.host_name}:${row.key}`;
}
