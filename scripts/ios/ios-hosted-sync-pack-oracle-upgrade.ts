import { createHash } from 'node:crypto';

import type { SqliteDatabase } from '../../electron/database/connection.js';
import { projectNodeResourceLinks, serializeNodeResourceReferences, type NodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

export function upgradeHostedOracleResources(database: SqliteDatabase) {
  for (const statement of PACK_SCHEMA) database.exec(statement.replace(
    /^CREATE TABLE /u, 'CREATE TABLE IF NOT EXISTS oracle_seed.'));
  database.exec("ALTER TABLE oracle_seed.nodes ADD COLUMN resource_references TEXT NOT NULL DEFAULT '[]'");
  const rows = database.prepare(`SELECT link.node_id, link.role, attachment.payload_json
    FROM oracle_seed.node_attachments link JOIN oracle_seed.sync_objects attachment
      ON attachment.object_type = 'attachment' AND attachment.object_id = link.attachment_id`)
    .all() as Array<{ node_id: string; role: string; payload_json: string }>;
  const resources = new Map<string, NodeResourceReference[]>();
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json);
    const storageKey = buildCanonicalAttachmentStorageKey(payload.attachment_id, payload.mime_type);
    if (!storageKey) throw new Error('ios_hosted_oracle_attachment_address_invalid');
    const references = resources.get(row.node_id) ?? [];
    references.push({ storage_key: storageKey, original_name: payload.original_name,
      role: row.role === 'reference' ? 'reference' : 'image' });
    resources.set(row.node_id, references);
  }
  for (const [nodeId, references] of resources) database.prepare(
    'UPDATE oracle_seed.nodes SET resource_references = ? WHERE id = ?'
  ).run(serializeNodeResourceReferences(references), nodeId);
  database.exec(`INSERT OR IGNORE INTO oracle_seed.node_sync_version_parents
    (version_id, parent_version_id, ordinal)
    SELECT version_id, parent_version_id, 0 FROM oracle_seed.node_sync_versions
    WHERE parent_version_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM oracle_seed.node_sync_version_parents parent
      WHERE parent.version_id = node_sync_versions.version_id)`);
  upgradeVersionResources(database, resources);
  upgradeBodyAddresses(database);
  for (const table of ['sync_objects', 'sync_object_state']) database.prepare(
    `DELETE FROM oracle_seed.${table} WHERE object_type = 'attachment'`
  ).run();
}

function upgradeBodyAddresses(database: SqliteDatabase) {
  const rows = database.prepare(`SELECT node.id, version.body_text FROM oracle_seed.nodes node
    JOIN oracle_seed.node_sync_versions version ON version.version_id = node.current_version_id
    WHERE node.body_blob_hash IS NULL AND node.content = '' AND version.body_text <> ''`)
    .all() as Array<{ id: string; body_text: string }>;
  for (const row of rows) database.prepare(
    'UPDATE oracle_seed.nodes SET body_blob_hash = ? WHERE id = ?'
  ).run(digest(row.body_text), row.id);
}

function upgradeVersionResources(database: SqliteDatabase, resources: Map<string, NodeResourceReference[]>) {
  const versions = database.prepare('SELECT version_id, object_id, snapshot_json, content_hash FROM oracle_seed.node_sync_versions')
    .all() as Array<{ version_id: string; object_id: string; snapshot_json: string; content_hash: string }>;
  for (const version of versions) {
    const references = serializeNodeResourceReferences(resources.get(version.object_id) ?? []);
    const snapshot = { ...JSON.parse(version.snapshot_json), resource_references: references,
      attachments: projectNodeResourceLinks(references) };
    const json = JSON.stringify(snapshot);
    const hash = digest(json);
    database.prepare('UPDATE oracle_seed.node_sync_versions SET snapshot_json = ?, content_hash = ? WHERE version_id = ?')
      .run(json, hash, version.version_id);
    database.prepare(`UPDATE oracle_seed.sync_object_state SET content_hash = ?
      WHERE object_type = 'node' AND object_id = ? AND content_hash = ?`)
      .run(hash, version.object_id, version.content_hash);
  }
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
