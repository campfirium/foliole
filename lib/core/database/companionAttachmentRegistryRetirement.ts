import type { DbPort, DbRow } from '../sync/dbPort.js';
import { createOpaqueVersionRef } from '../sync/opaqueSyncRefs.js';
import { buildRemoteNodeVersionUpsert } from '../sync/syncNodeApplyStatements.js';
import { loadCurrentSyncNodeRecord } from '../sync/syncNodeGraph.js';
import { hashText } from '../sync/syncNodeResolution.js';
import { upsertAppliedNodeSyncState } from '../sync/syncNodeStateApplyExecutor.js';

import { addCurrentBodyResourceNames, CURRENT_RESOURCE_BODY_ROWS_SQL, CURRENT_RESOURCE_NAME_ROWS_SQL } from './currentBodyResourceMigration.js';
import { projectNodeResourceLinks, serializeNodeResourceReferences, type NodeResourceReference } from './nodeResourceReferences.js';
import { LEGACY_NODE_RESOURCE_ROWS_SQL, resolveLegacyNodeResource, resolveLegacyNodeResourceRole, type LegacyNodeResource } from './nodeResourceReferencesMigration.js';

/** Numbered companion upgrade only; old versions and attachment bytes stay untouched. */
export async function retireCompanionAttachmentRegistry(db: DbPort) {
  const dangling = await db.query(`SELECT relation.node_id FROM node_attachments relation
    LEFT JOIN nodes owner ON owner.id = relation.node_id WHERE owner.id IS NULL LIMIT 1`);
  if (dangling.length) throw new Error('node_resource_migration_missing_owner');
  const rows = await db.query<LegacyNodeResource & DbRow>(LEGACY_NODE_RESOURCE_ROWS_SQL);
  const byNode = new Map<string, NodeResourceReference[]>();
  for (const row of rows) {
    const key = resolveLegacyNodeResource(row);
    if (!key) throw new Error(`node_resource_migration_unresolved:${row.node_id}:${row.attachment_id}`);
    const references = byNode.get(row.node_id) ?? [];
    const role = resolveLegacyNodeResourceRole(row.role)!;
    if (!references.some((item) => item.storage_key === key && item.role === role)) {
      references.push({ storage_key: key, role, original_name: row.original_name });
    }
    byNode.set(row.node_id, references);
  }
  addCurrentBodyResourceNames(byNode,
    await db.query<{ id: string; content: string | null }>(CURRENT_RESOURCE_BODY_ROWS_SQL),
    await db.query<{ id: string; original_name: string | null }>(CURRENT_RESOURCE_NAME_ROWS_SQL));
  for (const [id, references] of byNode) {
    const resources = serializeNodeResourceReferences(references);
    await db.run('UPDATE nodes SET resource_references = ?, sync_dirty = 1 WHERE id = ?', [resources, id]);
    await appendNodeResourceVersion(db, id, resources);
  }
  await db.run(`CREATE TABLE pdf_page_text_next (
    attachment_id TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL,
    page_width REAL, page_height REAL, PRIMARY KEY (attachment_id, page))`);
  await db.run('INSERT INTO pdf_page_text_next SELECT attachment_id, page, text, page_width, page_height FROM pdf_page_text');
  await db.run('DROP TABLE pdf_page_text');
  await db.run('ALTER TABLE pdf_page_text_next RENAME TO pdf_page_text');
  await db.run('DROP TABLE node_attachments');
  await db.run('DROP TABLE attachments');
  for (const table of ['sync_object_state', 'sync_change_log', 'sync_delivery_receipts']) {
    await db.run(`DELETE FROM ${table} WHERE object_type = 'attachment'`);
  }
}

async function appendNodeResourceVersion(db: DbPort, id: string, resources: string) {
  const previous = await loadCurrentSyncNodeRecord(db, id, false);
  if (!previous?.version_id) return;
  const [owner] = await db.query<{ updated_at: string }>('SELECT updated_at FROM nodes WHERE id = ?', [id]);
  if (!owner) throw new Error(`node_resource_migration_missing_owner:${id}`);
  const snapshot = { ...previous.snapshot, resource_references: resources, attachments: projectNodeResourceLinks(resources) };
  const record = { ...previous, snapshot, updated_at: owner.updated_at, version_id: createOpaqueVersionRef(crypto.randomUUID()),
    parent_version_id: previous.version_id, parent_version_ids: [previous.version_id],
    content_hash: hashText(JSON.stringify(snapshot)) };
  const statement = buildRemoteNodeVersionUpsert(record);
  if (!statement) throw new Error(`node_resource_migration_version_missing:${id}`);
  await db.run(statement.sql, statement.params);
  await db.run('INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal) VALUES (?, ?, 0)',
    [record.version_id, previous.version_id]);
  await db.run('UPDATE nodes SET current_version_id = ?, sync_dirty = 0 WHERE id = ?', [record.version_id, id]);
  await upsertAppliedNodeSyncState(db, record, { syncDirty: 1, baseContentHash: previous.content_hash });
}
