import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { parseNodeResourceReferences } from './nodeResourceReferences.js';
import type { WorkspaceNodeSnapshot } from './workspaceSnapshotHelpers.js';

interface NodeResourceRow extends DatabaseRow {
  id: string;
  resource_references: string;
}

export function attachWorkspaceNodeAttachments(
  driver: DatabaseDriver,
  nodesById: Record<string, WorkspaceNodeSnapshot>
) {
  for (const node of Object.values(nodesById)) node.attachments = [];
  const rows = driver.queryAll<NodeResourceRow>('SELECT id, resource_references FROM nodes ORDER BY id');
  for (const row of rows) {
    const node = nodesById[row.id];
    if (!node) continue;
    node.resourceReferences = parseNodeResourceReferences(row.resource_references);
    node.attachments = node.resourceReferences.map((reference) => {
      const parsed = parseCanonicalAttachmentStorageKey(reference.storage_key)!;
      return {
        attachmentId: parsed.contentHash,
        availability: 'unresolved',
        contentHash: parsed.contentHash,
        mimeType: parsed.mimeType,
        originalName: reference.original_name,
        role: reference.role,
        storageKey: reference.storage_key
      };
    });
  }
}
