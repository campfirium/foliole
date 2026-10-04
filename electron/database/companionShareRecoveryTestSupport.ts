import type Database from 'better-sqlite3';

export function readShareOriginalFacts(database: Database.Database, topicId: string) {
  return {
    versions: database.prepare(`SELECT version_id, object_id, parent_version_id, host_name, created_at,
      content_hash, json_remove(snapshot_json, '$.content') AS snapshot_metadata
      FROM node_sync_versions WHERE object_id = ? ORDER BY version_id`).all(topicId),
    edges: database.prepare(`SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents
      WHERE version_id IN (SELECT version_id FROM node_sync_versions WHERE object_id = ?)
      ORDER BY version_id, ordinal`).all(topicId)
  };
}
