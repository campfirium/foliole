import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

export function seedCurrentBody(db: Database.Database, body = '多字节\r\nbody\u0000end') {
  initializeDatabaseConnection({ sqlite: db });
  const bytes = Buffer.from(body);
  const hash = createHash('sha256').update(bytes).digest('hex');
  db.prepare(`INSERT INTO content_blobs (hash, storage_key, kind, mime_type, compression,
    original_size_bytes, stored_size_bytes, original_sha256, stored_sha256, availability, created_at)
    VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'missing', 'now')`)
    .run(hash, `text/${hash}`, bytes.length, bytes.length, hash, hash);
  db.prepare(`INSERT INTO nodes (id, kind, title, content, body_blob_hash, current_version_id,
    created_at, updated_at, sync_dirty) VALUES ('article', 'topic', 'Article', '', ?, 'head', 'now', 'now', 0)`)
    .run(hash);
  db.prepare(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id,
    host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('head', 'article', NULL, 'source', 'now', 'identity', ?, ?)`)
    .run(body, JSON.stringify({ id: 'article', content: body }));
  db.exec(`INSERT INTO sync_object_state (object_type, object_id, state_seq, current_version_id,
    content_hash, updated_at, sync_dirty, last_modified_by_host_name)
    VALUES ('node', 'article', 10, 'head', 'identity', 'now', 0, 'source');
    ATTACH DATABASE ':memory:' AS inc; CREATE TABLE inc.nodes (id TEXT PRIMARY KEY);
    INSERT INTO inc.nodes VALUES ('article');`);
  return { bytes, hash };
}

export function bodyState(db: Database.Database) {
  return {
    nodes: db.prepare('SELECT * FROM nodes').all(),
    versions: db.prepare('SELECT * FROM node_sync_versions').all(),
    state: db.prepare('SELECT * FROM sync_object_state').all(),
    blobs: db.prepare('SELECT * FROM content_blobs').all(),
    bytes: db.prepare('SELECT * FROM content_blob_data').all()
  };
}
