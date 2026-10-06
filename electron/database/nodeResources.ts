import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { parseNodeResourceReferences, serializeNodeResourceReferences, upsertNodeResourceReference, type NodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import { enqueuePdfSearchInvalidationForNodeIds } from '../../lib/core/database/searchIndexInvalidations.js';
import { resolveAttachmentFileForSync } from '../attachments/resourceResolver.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';

interface NodeResourcesRow extends DatabaseRow {
  resource_references: string;
}

function updateNodeResources(nodeId: string, update: (value: string) => string) {
  const { driver } = openDatabaseConnection();
  return driver.transaction(() => {
    const row = driver.queryOne<NodeResourcesRow>('SELECT resource_references FROM nodes WHERE id = ?', [nodeId]);
    if (!row) throw new Error(`node_resource_owner_missing:${nodeId}`);
    const resources = update(row.resource_references);
    for (const reference of parseNodeResourceReferences(resources)) {
      const available = resolveAttachmentFileForSync(reference.storage_key).status === 'ready';
      driver.execute(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL, [reference.storage_key.slice(0, 64), available ? 1 : 0]);
    }
    if (resources === row.resource_references) return 'reused' as const;
    const now = new Date().toISOString();
    const hostName = loadOrCreateDesktopHostName(now);
    driver.execute(`UPDATE nodes SET resource_references = ?, updated_at = ?,
      last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`, [resources, now, hostName, nodeId]);
    flushNodeSyncVersion(nodeId, now);
    enqueuePdfSearchInvalidationForNodeIds(driver, [nodeId]);
    return 'created' as const;
  });
}

export function loadNodeResourceReferences(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<NodeResourcesRow>(
    'SELECT resource_references FROM nodes WHERE id = ?', [nodeId]
  );
  return row ? parseNodeResourceReferences(row.resource_references) : [];
}

export function persistNodeResourceReference(nodeId: string, reference: NodeResourceReference) {
  return updateNodeResources(nodeId, (value) => upsertNodeResourceReference(value, reference));
}

export function replaceNodeImageResourceReferences(nodeId: string, references: readonly NodeResourceReference[]) {
  if (references.some((reference) => reference.role !== 'image')) throw new Error('node_image_resource_role_invalid');
  return updateNodeResources(nodeId, (value) => serializeNodeResourceReferences([
    ...parseNodeResourceReferences(value).filter((reference) => reference.role !== 'image'),
    ...new Map(references.map((reference) => [reference.storage_key, reference])).values()
  ]));
}

export function replaceNodePdfResourceReference(nodeId: string, reference: NodeResourceReference) {
  if (reference.role !== 'reference' || !reference.storage_key.endsWith('.pdf')) throw new Error('node_pdf_resource_invalid');
  return updateNodeResources(nodeId, (value) => serializeNodeResourceReferences([
    ...parseNodeResourceReferences(value).filter((item) => item.role !== 'reference' || !item.storage_key.endsWith('.pdf')),
    reference
  ]));
}

export function removeNodeResourceLink(nodeId: string, attachmentId: string, role: string) {
  return updateNodeResources(nodeId, (value) => serializeNodeResourceReferences(
    parseNodeResourceReferences(value).filter((reference) =>
      reference.storage_key.slice(0, 64) !== attachmentId || reference.role !== role)
  ));
}
