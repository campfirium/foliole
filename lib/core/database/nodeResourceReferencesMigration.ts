import { buildCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { collectArticleImageStorageKeys } from '../import/replaceArticleImageSource.js';

import { addCurrentBodyResourceNames, CURRENT_RESOURCE_BODY_ROWS_SQL, CURRENT_RESOURCE_NAME_ROWS_SQL } from './currentBodyResourceMigration.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { serializeNodeResourceReferences, type NodeResourceReference } from './nodeResourceReferences.js';
import { addColumnIfMissing } from './numberedMigrationHelpers.js';

export interface LegacyNodeResource {
  node_id: string;
  attachment_id: string;
  role: string;
  mime_type: string | null;
  original_name: string | null;
  content: string | null;
}

export const LEGACY_NODE_RESOURCE_ROWS_SQL = `SELECT na.node_id, na.attachment_id, na.role, a.mime_type, a.original_name,
  CASE WHEN n.body_blob_hash IS NOT NULL AND n.body_blob_hash <> '' THEN
    CASE WHEN cb.compression = 'none' THEN CAST(cbd.data AS TEXT) END ELSE n.content END AS content
  FROM node_attachments na JOIN nodes n ON n.id = na.node_id
  LEFT JOIN attachments a ON a.id = na.attachment_id
  LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash
  LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
  ORDER BY na.node_id, na.attachment_id, na.role`;

/** Used only by the numbered upgrade, before the old registry is removed. */
export function migrateNodeResourceReferences(sqlite: DatabaseMigrationTarget) {
  const dangling = sqlite.prepare(`SELECT na.node_id, na.attachment_id FROM node_attachments na
    LEFT JOIN nodes n ON n.id = na.node_id WHERE n.id IS NULL LIMIT 1`).all();
  if (dangling.length) throw new Error('node_resource_migration_missing_owner');
  const byNode = new Map<string, NodeResourceReference[]>();
  const rows = sqlite.prepare(LEGACY_NODE_RESOURCE_ROWS_SQL).all() as LegacyNodeResource[];
  for (const row of rows) {
    const storageKey = resolveLegacyNodeResource(row);
    if (!storageKey) throw new Error(`node_resource_migration_unresolved:${row.node_id}:${row.attachment_id}`);
    const references = byNode.get(row.node_id) ?? [];
    const role = resolveLegacyNodeResourceRole(row.role)!;
    if (!references.some((item) => item.storage_key === storageKey && item.role === role)) {
      references.push({ storage_key: storageKey, role, original_name: row.original_name });
    }
    byNode.set(row.node_id, references);
  }
  addCurrentBodyResourceNames(byNode,
    sqlite.prepare(CURRENT_RESOURCE_BODY_ROWS_SQL).all() as Array<{ id: string; content: string | null }>,
    sqlite.prepare(CURRENT_RESOURCE_NAME_ROWS_SQL).all() as Array<{ id: string; original_name: string | null }>);
  addColumnIfMissing(sqlite, 'nodes', 'resource_references', "TEXT NOT NULL DEFAULT '[]'");
  const update = sqlite.prepare('UPDATE nodes SET resource_references = ? WHERE id = ?');
  for (const [nodeId, references] of byNode) update.run(serializeNodeResourceReferences(references), nodeId);
}

export function resolveLegacyNodeResource(row: LegacyNodeResource) {
  const role = resolveLegacyNodeResourceRole(row.role);
  if (!role) return null;
  const storageKey = row.mime_type && buildCanonicalAttachmentStorageKey(row.attachment_id, row.mime_type);
  if (storageKey) return storageKey;
  if (role !== 'image' || row.content === null) return null;
  const matches = collectArticleImageStorageKeys(row.content).filter((key) => key.startsWith(`${row.attachment_id}.`));
  return matches.length === 1 ? matches[0]! : null;
}

export function resolveLegacyNodeResourceRole(role: string): NodeResourceReference['role'] | null {
  if (['image', 'inline', 'cover'].includes(role)) return 'image';
  return role === 'reference' ? 'reference' : null;
}
