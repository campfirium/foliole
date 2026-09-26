import { randomUUID } from 'node:crypto';

import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../sync/syncObjectPayloadSql.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { computeSyncContentHash } from './syncState.js';

interface LegacySource {
  config_ref: string;
  host_platform: string;
  root_path: string;
  source_ref: string;
}

interface OwnedBinding {
  binding_id: string;
  host_name: string;
  primary_path: string;
  reported_path: string;
  root_path: string;
  state_updated_at: string | null;
  updated_at: string;
}

function setting(sqlite: DatabaseMigrationTarget, key: string): unknown {
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').all(key)[0] as
    { value: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.value) as unknown; } catch { return null; }
}

function localIdentity(sqlite: DatabaseMigrationTarget) {
  const active = sqlite.prepare(`SELECT l.local_device_identity_key AS id,
    d.device_name AS name, d.platform FROM sync_group_local_state l LEFT JOIN sync_group_devices d
    ON d.group_id = l.group_id AND d.device_identity_key = l.local_device_identity_key
    AND d.state = 'active' WHERE l.singleton_id = 1 AND l.state = 'active'`).all()[0] as
    { id: string; name: string | null; platform: string | null } | undefined;
  if (active) return active.id && active.name?.trim() && active.platform?.trim() ? active : null;
  const id = setting(sqlite, 'device_id');
  const name = setting(sqlite, 'host_name');
  return typeof id === 'string' && id.trim() && typeof name === 'string' && name.trim()
    ? { id, name, platform: null } : null;
}

function configuredLegacyRules(sqlite: DatabaseMigrationTarget) {
  const value = setting(sqlite, 'import_manager_settings');
  if (!value || typeof value !== 'object' || !('sources' in value)) return new Map<string, {
    actionMode: 'keep' | 'delete'; highlightMode: 'merged' | 'split'
  }>();
  const sources = (value as { sources: unknown }).sources;
  const rules = new Map<string, { actionMode: 'keep' | 'delete'; highlightMode: 'merged' | 'split' }>();
  if (!Array.isArray(sources)) return rules;
  for (const source of sources) {
    if (!source || typeof source !== 'object' || !('id' in source)) continue;
    const id = source.id;
    if (typeof id !== 'string' || !/^draft-import-source-\d+$/u.test(id)) continue;
    rules.set(id, {
      actionMode: 'actionMode' in source && source.actionMode === 'delete' ? 'delete' : 'keep',
      highlightMode: 'highlightMode' in source && source.highlightMode === 'split' ? 'split' : 'merged'
    });
  }
  return rules;
}

function nextTime(...values: Array<string | null>) {
  const previous = values.reduce((latest, value) => Math.max(latest, Date.parse(value ?? '') || 0), 0);
  return new Date(Math.max(Date.now(), previous + 1)).toISOString();
}

function recoverOrphanedLocalSources(sqlite: DatabaseMigrationTarget) {
  const rules = configuredLegacyRules(sqlite);
  if (!rules.size) return;
  const orphans = sqlite.prepare(`SELECT s.source_ref, s.config_ref, s.root_path, s.host_platform
    FROM desktop_sources s JOIN sync_object_state old ON old.object_type = 'watched_folder'
      AND old.object_id = s.config_ref AND old.deleted_at IS NOT NULL
    WHERE s.source_type = 'watched' AND s.config_ref LIKE 'draft-import-source-%'
      AND NOT EXISTS (SELECT 1 FROM watched_folder_bindings b
        WHERE b.source_ref = s.source_ref AND b.deleted_at IS NULL)
    ORDER BY s.config_ref`).all() as LegacySource[];
  const pending = orphans.filter((source) => rules.has(source.config_ref) &&
    !(sqlite.prepare(`SELECT 1 FROM watched_folder_bindings
      WHERE deleted_at IS NULL AND local_rule_id = ?`).all(source.config_ref).length));
  if (!pending.length) return;
  const local = localIdentity(sqlite);
  if (!local) throw new Error('watched_source_recovery_device_unavailable');
  for (const source of pending) {
    const id = `watched-${randomUUID()}`;
    const now = nextTime();
    sqlite.prepare(`INSERT INTO desktop_sources
      (source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, created_at, updated_at)
      SELECT ?, source_type, ?, ?, ?, '', path_flavor,
        type_settings_json, created_at, ? FROM desktop_sources WHERE source_ref = ?`)
      .run(`watched:${id}`, id, local.name, local.platform ?? source.host_platform, now, source.source_ref);
    const rule = rules.get(source.config_ref)!;
    sqlite.prepare(`INSERT INTO watched_folder_bindings
      (binding_id, connection_status, action_mode, highlight_mode, created_at,
       updated_at, source_ref, owner_device_identity_key, local_rule_id, reported_path)
      VALUES (?, 'needs-folder', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, rule.actionMode, rule.highlightMode, now, now, `watched:${id}`, local.id,
      source.config_ref, source.root_path.trim()
    );
  }
}

function requeueOwnedPaths(sqlite: DatabaseMigrationTarget) {
  const local = localIdentity(sqlite);
  if (!local) return;
  const rows = sqlite.prepare(`SELECT b.binding_id, b.primary_path, b.reported_path,
    b.updated_at, s.host_name, s.root_path, state.updated_at AS state_updated_at
    FROM watched_folder_bindings b JOIN desktop_sources s ON s.source_ref = b.source_ref
    LEFT JOIN sync_object_state state ON state.object_type = 'watched_folder'
      AND state.object_id = b.binding_id
    WHERE b.deleted_at IS NULL AND b.owner_device_identity_key = ?
    ORDER BY b.binding_id`).all(local.id) as OwnedBinding[];
  for (const row of rows) {
    const path = row.reported_path.trim() || row.primary_path.trim() || row.root_path.trim();
    if (!path) continue;
    const now = nextTime(row.updated_at, row.state_updated_at);
    sqlite.prepare(`UPDATE watched_folder_bindings SET reported_path = ?, updated_at = ?
      WHERE binding_id = ?`).run(path, now, row.binding_id);
    const payloadRow = sqlite.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.watched_folder)
      .all(row.binding_id)[0] as { payload_json: string } | undefined;
    if (!payloadRow) throw new Error('watched_source_recovery_payload_missing');
    const hash = computeSyncContentHash('watched_folder', JSON.parse(payloadRow.payload_json));
    sqlite.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq,
      content_hash, last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
      VALUES ('watched_folder', ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state),
        ?, ?, ?, NULL, 1)
      ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
        content_hash = excluded.content_hash, last_modified_by_host_name = excluded.last_modified_by_host_name,
        updated_at = excluded.updated_at, deleted_at = NULL, sync_dirty = 1`)
      .run(row.binding_id, hash, row.host_name, now);
  }
}

export function recoverWatchedSourcesAndPaths(sqlite: DatabaseMigrationTarget) {
  recoverOrphanedLocalSources(sqlite);
  requeueOwnedPaths(sqlite);
}
