import Database from 'better-sqlite3';

import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { openDatabaseConnection } from '../database/connection.js';

export function createIncomingPack(filePath: string) {
  const db = new Database(filePath);
  try {
    for (const statement of PACK_SCHEMA) db.exec(statement);
    db.prepare('INSERT INTO pack_manifest (key, value) VALUES (?, ?)').run(
      'manifest_json',
      JSON.stringify({ from_state_seq: 0, to_state_seq: 1 })
    );
    db.prepare(
      `INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, updated_at, deleted_at)
       VALUES ('node', 'node-1', 1, 'hash-node-1', '2026-05-04T01:00:00.000Z', NULL)`
    ).run();
    db.prepare(
      `INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, updated_at, deleted_at)
       VALUES ('setting', 'host:android:phone:Android test host:theme', 2, 'hash-setting-1', '2026-05-04T01:01:00.000Z', NULL)`
    ).run();
    db.prepare(
      `INSERT INTO sync_objects (object_type, object_id, content_hash, payload_json, updated_at, deleted_at)
       VALUES ('setting', 'host:android:phone:Android test host:theme', 'hash-setting-1', ?, '2026-05-04T01:01:00.000Z', NULL)`
    ).run(JSON.stringify({
      form_factor: 'phone', host_name: 'Android test host', key: 'theme', platform: 'android',
      scope: 'host', value_json: '{"mode":"dark"}'
    }));
    db.prepare(
      `INSERT INTO nodes (
         id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash,
         opening_text, reveal, content, current_version_id, created_at, updated_at, deleted_at
       ) VALUES (?, NULL, 'topic', 'Packed Node', 0, 0, NULL, NULL, ?, '', ?, ?, ?, NULL)`
    ).run('node-1', 'Packed answer', 'desktop#1', '2026-05-04T01:00:00.000Z', '2026-05-04T01:00:00.000Z');
    db.prepare(
      `INSERT INTO node_sync_versions (
         version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
       ) VALUES ('desktop#1', 'node-1', NULL, 'desktop',
         '2026-05-04T01:00:00.000Z', 'hash-node-1', '{"id":"node-1","title":"Packed Node"}')`
    ).run();
    db.prepare("INSERT INTO node_order (node_id, position) VALUES ('node-1', 5)").run();
    db.prepare(
      "INSERT INTO node_attachments (node_id, attachment_id, role) VALUES ('node-1', 'att-1', 'reference')"
    ).run();
  } finally {
    db.close();
  }
}

export function installLocalNodeFixtures() {
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.exec(`
    INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
    VALUES ('att-1', 'att-1.pdf', 'application/pdf', 128, '2026-05-04T00:00:00.000Z');
    INSERT INTO sync_object_state (
      object_type, object_id, state_seq, current_version_id, content_hash,
      last_modified_by_device_id, updated_at, deleted_at, sync_dirty
    ) VALUES ('node', 'node-1', 1, 'android#local', 'hash-node-1', 'android-device',
      '2026-05-04T00:30:00.000Z', NULL, 1);
  `);
}
