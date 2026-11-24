import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { parseNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';
import { collectArticleImageStorageKeys } from '../../lib/core/import/replaceArticleImageSource.js';
import { ASSET_MARKDOWN_SCHEME } from '../../lib/platform/assetMarkdownUrl.js';
import { buildCanonicalAttachmentStorageKey, parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { moveAttachmentToTrash } from '../attachments/attachmentTrashFiles.js';

import { openDatabaseConnection } from './connection.js';
import { deletePdfPageTextRowsForAttachment } from './pdfPageTextRows.js';
import { resolveRuntimeDataPaths } from './runtimeDataPaths.js';
import { withTransaction } from './transaction.js';

interface NodeResourcesRow extends DatabaseRow, NodeBodyRow {
  id: string;
  resource_references: string;
}

export interface AttachmentFileRow {
  id: string;
  mime_type: string;
}

interface AttachmentCleanupPlan {
  candidates: AttachmentFileRow[];
  retainedKeys: string[];
}

function collectNodeKeys(rows: NodeResourcesRow[]) {
  const keys = new Set<string>();
  for (const row of rows) {
    const body = resolveNodeBody(row);
    for (const key of collectArticleImageStorageKeys(body.content)) keys.add(key);
    for (const reference of parseNodeResourceReferences(row.resource_references)) {
      if (reference.role === 'reference') keys.add(reference.storage_key);
    }
  }
  return keys;
}

/**
 * Only rows that can name an attachment: `collectNodeKeys` finds none in a body without an asset URL
 * or in an empty reference list, so skipping those rows keeps the result of reading every node.
 */
const REFERENCING_NODE_ROWS_SQL = `SELECT n.id, n.content, n.body_blob_hash, n.resource_references
  FROM nodes n
  WHERE (instr(n.content, '${ASSET_MARKDOWN_SCHEME}') > 0 OR n.resource_references NOT IN ('', '[]'))`;

export function collectAttachmentCleanupCandidates(driver: DatabaseDriver, nodeIds: string[]): AttachmentFileRow[] {
  const keys = collectNodeKeys(driver.queryAll<NodeResourcesRow>(
    `${REFERENCING_NODE_ROWS_SQL} AND n.id IN (SELECT value FROM json_each(?))`, [JSON.stringify(nodeIds)]));
  return [...keys].sort().map((key) => {
    const identity = parseCanonicalAttachmentStorageKey(key)!;
    return { id: identity.contentHash, mime_type: identity.mimeType };
  });
}

export function createAttachmentCleanupPlan(nodeIds: string[]): AttachmentCleanupPlan {
  const { driver } = openDatabaseConnection();
  const candidates = collectAttachmentCleanupCandidates(driver, nodeIds);
  const retainedKeys = candidates.length ? collectNodeKeys(driver.queryAll<NodeResourcesRow>(
    `${REFERENCING_NODE_ROWS_SQL} AND n.id NOT IN (SELECT value FROM json_each(?))`, [JSON.stringify(nodeIds)])) : [];
  return { candidates, retainedKeys: [...retainedKeys] };
}

export function cleanupAttachmentsAfterDelete(driver: DatabaseDriver, candidates: AttachmentFileRow[]) {
  if (!candidates.length) return;
  // Other writes could add references between committed chunks.
  withTransaction(driver, () => {
    const retainedKeys = collectNodeKeys(driver.queryAll<NodeResourcesRow>(REFERENCING_NODE_ROWS_SQL));
    cleanupOrphanAttachments(driver, { candidates, retainedKeys: [...retainedKeys] });
  });
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
  for (const file of files) {
    deletePdfPageTextRowsForAttachment(file.id);
    driver.execute('DELETE FROM pdf_index_state WHERE attachment_id = ?', [file.id]);
  }
  return files;
}
