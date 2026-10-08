import { readUserVersion } from '../../lib/core/database/databaseUserVersion.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { parseNodeResourceReferences, serializeNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { rewriteCanonicalAssetMarkdownTargets } from '../../lib/platform/canonicalAssetMarkdownMigration.js';

import type { DatabaseConnection } from './connection.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

/** Capture names before numbered migrations retire the old registry. No file operations. */
export function captureLegacyAttachmentTargets(connection: DatabaseConnection) {
  const targets = new Map<string, string>();
  const version = readUserVersion(connection.sqlite);
  if (version < 28 || version >= 119) return targets;
  const hasManifest = connection.sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = 'attachment_blobs'").get();
  const rows = connection.sqlite.prepare(hasManifest
    ? `SELECT a.id, COALESCE(a.mime_type, b.mime_type) AS mime_type, b.storage_key
       FROM attachments a LEFT JOIN attachment_blobs b ON b.attachment_id = a.id`
    : 'SELECT id, mime_type, NULL AS storage_key FROM attachments').all() as Array<{
      id: string; mime_type: string | null; storage_key: string | null;
    }>;
  for (const row of rows) {
    const key = row.mime_type && buildCanonicalAttachmentStorageKey(row.id, row.mime_type);
    if (!key) continue;
    for (const name of [row.id, row.storage_key, ...(row.mime_type === 'image/jpeg' ? [`${row.id}.jpeg`] : [])]) {
      if (!name) continue;
      const previous = targets.get(name);
      if (previous && previous !== key) throw new Error('legacy_attachment_target_ambiguous');
      targets.set(name, key);
    }
  }
  return targets;
}

/** Uses the same durable body/version path as editing, inside the upgrade transaction. */
export function migrateLegacyAttachmentReferences(connection: DatabaseConnection,
  targets: ReadonlyMap<string, string>, hostName: string) {
  if (!targets.size) return;
  const { driver } = connection;
  const rows = driver.queryAll<NodeBodyRow & { id: string; resource_references: string }>(
    `SELECT n.id, n.content, n.body_blob_hash, n.resource_references
     FROM nodes n WHERE n.deleted_at IS NULL`);
  const now = new Date().toISOString();
  for (const row of rows) {
    const body = resolveNodeBody(row);
    const content = rewriteCanonicalAssetMarkdownTargets(body.content, targets);
    const references = serializeNodeResourceReferences(parseNodeResourceReferences(row.resource_references)
      .map((reference) => ({ ...reference, storage_key: targets.get(reference.storage_key) ?? reference.storage_key })));
    const changed = applyParentContentChange({ driver, nextContent: content,
      nodeId: row.id, previousContent: body.content, updatedAt: now });
    if (references !== row.resource_references) {
      driver.execute('UPDATE nodes SET resource_references = ?, sync_dirty = 1 WHERE id = ?', [references, row.id]);
    }
    if (changed.written || references !== row.resource_references) flushNodeSyncVersionWithDriver(driver, row.id, hostName, now);
  }
}
