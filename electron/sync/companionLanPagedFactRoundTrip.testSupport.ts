import Database from 'better-sqlite3';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { openDatabaseConnection } from '../database/connection.js';
import { resolveSyncPackPath } from '../database/syncPackBuilderTestSupport.js';

export function seedPagedFactReceiver(missingTail = false) {
  const target = new Database(resolveSyncPackPath('receiver.db'));
  target.exec(COMPANION_SCHEMA_STATEMENTS.join(';' + '\n'));
  target.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'receiver', 'active', 'now');
    INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, updated_at)
      VALUES ('group', 'source', 'source-anchor', '/source', 'Source', 'mac', 'active', 'now', 'now');
    INSERT INTO nodes (id, kind, title, created_at, updated_at)
      VALUES ('special-inbox', 'folder', 'Inbox', 'now', 'now');
    INSERT INTO nodes (id, parent_id, kind, title, created_at, updated_at)
      VALUES ('node-1', 'special-inbox', 'topic', 'Node 1', 'now', 'now');`);
  const source = openDatabaseConnection().driver;
  const versions = source.queryAll<Record<string, string | null>>(`SELECT version_id, object_id,
    parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json
    FROM node_sync_versions ORDER BY version_id`);
  const insertVersion = target.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of versions) {
    if (!missingTail || !['v0128', 'v0129'].includes(row.version_id!)) {
      insertVersion.run(...Object.values(row));
    }
  }
  const edges = source.queryAll<{ version_id: string; parent_version_id: string; ordinal: number }>(
    'SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents ORDER BY version_id');
  const insertEdge = target.prepare('INSERT INTO node_sync_version_parents VALUES (?, ?, ?)');
  for (const row of edges) {
    if (!missingTail || !['v0128', 'v0129'].includes(row.version_id)) {
      insertEdge.run(row.version_id, row.parent_version_id, row.ordinal);
    }
  }
  target.prepare('UPDATE nodes SET current_version_id = ? WHERE id = ?')
    .run(missingTail ? 'v0127' : 'v0129', 'node-1');
  return target;
}
