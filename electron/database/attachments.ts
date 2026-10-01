import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

import { openDatabaseConnection } from './connection.js';
import { loadNodeResourceReferences, removeNodeResourceLink } from './nodeResources.js';

export interface AttachmentRecordInput {
  id: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface NodeAttachmentLinkInput {
  nodeId: string;
  attachmentId: string;
  role: string;
}

export type AttachmentRecord = AttachmentRecordInput;

export interface NodeAttachmentRecord extends NodeAttachmentLinkInput {
  attachment: AttachmentRecord;
}

interface AttachmentNodeLinkRow extends DatabaseRow {
  node_id: string;
  attachment_id: string;
  role: string;
}

export function listNodeAttachments(nodeId: string): NodeAttachmentRecord[] {
  const row = openDatabaseConnection().driver.queryOne<{ created_at: string }>(
    'SELECT created_at FROM nodes WHERE id = ?', [nodeId]
  );
  return loadNodeResourceReferences(nodeId).map((reference) => {
    const identity = parseCanonicalAttachmentStorageKey(reference.storage_key)!;
    return { nodeId, attachmentId: identity.contentHash, role: reference.role,
      attachment: { id: identity.contentHash, originalName: reference.original_name,
        mimeType: identity.mimeType, sizeBytes: null, createdAt: row?.created_at ?? '' } };
  });
}

export function listAttachmentNodeLinks(attachmentId: string): NodeAttachmentLinkInput[] {
  const connection = openDatabaseConnection();
  const rows = connection.driver.queryAll<AttachmentNodeLinkRow>(
    `SELECT owner.id AS node_id,
       substr(json_extract(resource.value, '$.storage_key'), 1, 64) AS attachment_id,
       json_extract(resource.value, '$.role') AS role
     FROM nodes owner, json_each(owner.resource_references) resource
     WHERE substr(json_extract(resource.value, '$.storage_key'), 1, 64) = ?
     ORDER BY owner.id ASC, role ASC`,
    [attachmentId]
  );

  return rows.map((row) => ({
    nodeId: row.node_id,
    attachmentId: row.attachment_id,
    role: row.role
  }));
}

export function deleteNodeAttachmentLink(input: NodeAttachmentLinkInput): void {
  removeNodeResourceLink(input.nodeId, input.attachmentId, input.role);
}
