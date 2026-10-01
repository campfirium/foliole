import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { NodeBodyUnavailableError, resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { parseNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';
import { collectArticleImageStorageKeys } from '../../lib/core/import/replaceArticleImageSource.js';
import { buildCanonicalAttachmentStorageKey, parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { moveAttachmentToTrash } from '../attachments/attachmentTrashFiles.js';

import { openDatabaseConnection } from './connection.js';
import { deletePdfPageTextRowsForAttachment } from './pdfPageTextRows.js';
import { resolveRuntimeDataPaths } from './runtimeDataPaths.js';

interface NodeResourcesRow extends DatabaseRow, NodeBodyRow {
  id: string;
  resource_references: string;
}

interface AttachmentFileRow {
  id: string;
  mime_type: string;
}

interface AttachmentCleanupPlan {
  candidates: AttachmentFileRow[];
  retainedKeys: string[];
}

function collectNodeKeys(rows: NodeResourcesRow[]) {
  const keys = new Set<string>();
  const unavailable: string[] = [];
  for (const row of rows) {
    const body = resolveNodeBody(row);
    if (body.status === 'unavailable') unavailable.push(row.id);
    else for (const key of collectArticleImageStorageKeys(body.content)) keys.add(key);
    for (const reference of parseNodeResourceReferences(row.resource_references)) {
      if (reference.role === 'reference') keys.add(reference.storage_key);
    }
  }
  if (unavailable.length) throw new NodeBodyUnavailableError(unavailable);
  return keys;
}

export function createAttachmentCleanupPlan(nodeIds: string[]): AttachmentCleanupPlan {
  const rows = openDatabaseConnection().driver.queryAll<NodeResourcesRow>(
    `SELECT n.id, n.content, n.body_blob_hash, n.resource_references, cbd.data AS body_blob_data
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash`
  );
  const removed = new Set(nodeIds);
  const candidates = collectNodeKeys(rows.filter((row) => removed.has(row.id)));
  const retainedKeys = collectNodeKeys(rows.filter((row) => !removed.has(row.id)));
  return { candidates: [...candidates].sort().map((key) => {
    const identity = parseCanonicalAttachmentStorageKey(key)!;
    return { id: identity.contentHash, mime_type: identity.mimeType };
  }), retainedKeys: [...retainedKeys] };
}

export function deleteAttachmentFiles(rows: AttachmentFileRow[]) {
  const { assetsDir } = resolveRuntimeDataPaths();
  for (const row of rows) {
    const key = buildCanonicalAttachmentStorageKey(row.id, row.mime_type);
    if (!key) throw new Error('attachment_delete_noncanonical_identity');
    moveAttachmentToTrash(assetsDir, key);
  }
}

export function cleanupOrphanAttachments(driver: DatabaseDriver, plan: AttachmentCleanupPlan) {
  const retained = new Set(plan.retainedKeys);
  const files = plan.candidates.filter((row) => !retained.has(buildCanonicalAttachmentStorageKey(row.id, row.mime_type)!));
  deleteAttachmentFiles(files);
  const deletedAt = new Date().toISOString();
  for (const file of files) {
    deletePdfPageTextRowsForAttachment(file.id, deletedAt);
    driver.execute('DELETE FROM pdf_index_state WHERE attachment_id = ?', [file.id]);
  }
  return files;
}
