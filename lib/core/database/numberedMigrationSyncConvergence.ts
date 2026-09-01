import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing, tableExists } from './numberedMigrationHelpers.js';

export function migrateSyncConflictConvergence(sqlite: DatabaseMigrationTarget) {
  const hasNodes = tableExists(sqlite, 'nodes');
  const hasVersions = tableExists(sqlite, 'node_sync_versions');
  if (tableExists(sqlite, 'sync_object_state')) {
    addColumnIfMissing(sqlite, 'sync_object_state', 'base_content_hash', 'TEXT');
  }
  if (hasNodes) addNodeConvergenceSchema(sqlite);
  if (hasVersions) addVersionConvergenceSchema(sqlite);
  if (hasNodes && hasVersions) backfillCurrentVersionBodies(sqlite);
}

function addNodeConvergenceSchema(sqlite: DatabaseMigrationTarget) {
  addColumnIfMissing(sqlite, 'nodes', 'anchor_resolution_status', 'TEXT');
  addColumnIfMissing(sqlite, 'nodes', 'anchor_source_version_id', 'TEXT');
  sqlite.exec(`CREATE TABLE IF NOT EXISTS node_text_alternatives (
    alternative_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    source_version_id TEXT NOT NULL,
    body_text TEXT NOT NULL,
    source_device_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_node_text_alternatives_source_version
    ON node_text_alternatives (node_id, source_version_id)`);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_node_text_alternatives_available_source
    ON node_text_alternatives (node_id, source_device_id) WHERE status = 'available'`);
}

function addVersionConvergenceSchema(sqlite: DatabaseMigrationTarget) {
  addColumnIfMissing(sqlite, 'node_sync_versions', 'body_text', 'TEXT');
  sqlite.exec(`CREATE TABLE IF NOT EXISTS node_sync_version_parents (
    version_id TEXT NOT NULL REFERENCES node_sync_versions(version_id) ON DELETE CASCADE,
    parent_version_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    PRIMARY KEY (version_id, parent_version_id),
    UNIQUE (version_id, ordinal)
  )`);
  sqlite.exec(`INSERT OR IGNORE INTO node_sync_version_parents (version_id, parent_version_id, ordinal)
    SELECT version_id, parent_version_id, 0 FROM node_sync_versions WHERE parent_version_id IS NOT NULL`);
}

function backfillCurrentVersionBodies(sqlite: DatabaseMigrationTarget) {
  const blobExpression = tableExists(sqlite, 'content_blob_data')
    ? `(SELECT CAST(data AS TEXT) FROM content_blob_data
        WHERE hash = (SELECT body_blob_hash FROM nodes WHERE current_version_id = node_sync_versions.version_id)),`
    : '';
  sqlite.exec(`UPDATE node_sync_versions SET body_text = COALESCE(
    ${blobExpression}
    (SELECT content FROM nodes WHERE current_version_id = node_sync_versions.version_id)
  ) WHERE version_id IN (SELECT current_version_id FROM nodes WHERE current_version_id IS NOT NULL)`);
}
