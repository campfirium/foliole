import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { NodeBodyUnavailableError, resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { collectArticleImageStorageKeys } from '../../lib/core/import/replaceArticleImageSource.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { moveAttachmentToTrash } from '../attachments/attachmentTrashFiles.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { recordAttachmentDeleted } from './attachmentSyncState.js';
import { openDatabaseConnection } from './connection.js';
import { deletePdfPageTextRowsForAttachment } from './pdfPageTextRows.js';

interface NodeContentRow extends DatabaseRow, NodeBodyRow {
  id: string;
}

interface AttachmentLinkRow extends DatabaseRow {
  attachment_id: string;
}

interface AttachmentFileRow extends DatabaseRow {
  id: string;
  mime_type: string | null;
}

interface AttachmentCleanupPlan {
  inlineAttachmentIds: string[];
  mountedAttachmentIds: string[];
  retainedInlineAttachmentIds: string[];
}

function collectInlineAttachmentIds(text: string) {
  return new Set(collectArticleImageStorageKeys(text).flatMap((key) => {
    const parsed = parseCanonicalAttachmentStorageKey(key);
    return parsed ? [parsed.contentHash] : [];
  }));
}

function toUniqueSortedArray(values: Set<string>) {
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function buildInClause(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

function listDeletedNodeContentRows(nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return [];
  }
  return openDatabaseConnection().driver.queryAll<NodeContentRow>(
    `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id IN (${buildInClause(nodeIds.length)})`,
    nodeIds
  );
}

function listRetainedNodeContentRows(nodeIds: string[]) {
  const exclusion = nodeIds.length ? `WHERE n.id NOT IN (${buildInClause(nodeIds.length)})` : '';
  return openDatabaseConnection().driver.queryAll<NodeContentRow>(
    `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     ${exclusion}`,
    nodeIds
  );
}

function collectBodyAttachmentIds(rows: NodeContentRow[]) {
  const attachmentIds = new Set<string>();
  const unavailableNodeIds: string[] = [];
  for (const row of rows) {
    const body = resolveNodeBody(row);
    if (body.status === 'unavailable') {
      unavailableNodeIds.push(row.id);
      continue;
    }
    for (const attachmentId of collectInlineAttachmentIds(body.content)) attachmentIds.add(attachmentId);
  }
  if (unavailableNodeIds.length) throw new NodeBodyUnavailableError(unavailableNodeIds);
  return attachmentIds;
}

function listDeletedMountedAttachmentIds(nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return [];
  }
  const rows = openDatabaseConnection().driver.queryAll<AttachmentLinkRow>(
    `SELECT DISTINCT na.attachment_id
     FROM node_attachments na
     INNER JOIN attachments a
       ON a.id = na.attachment_id
     WHERE na.node_id IN (${buildInClause(nodeIds.length)})
       AND na.role = 'reference'
       AND a.mime_type = 'application/pdf'`,
    nodeIds
  );
  return rows.map((row) => row.attachment_id);
}

export function createAttachmentCleanupPlan(nodeIds: string[]): AttachmentCleanupPlan {
  const inlineAttachmentIds = collectBodyAttachmentIds(listDeletedNodeContentRows(nodeIds));
  const retainedInlineAttachmentIds = collectBodyAttachmentIds(listRetainedNodeContentRows(nodeIds));

  return {
    inlineAttachmentIds: toUniqueSortedArray(inlineAttachmentIds),
    mountedAttachmentIds: Array.from(new Set(listDeletedMountedAttachmentIds(nodeIds))).sort((left, right) =>
      left.localeCompare(right)
    ),
    retainedInlineAttachmentIds: toUniqueSortedArray(retainedInlineAttachmentIds)
  };
}

function listStillMountedAttachmentIds(candidateIds: string[]) {
  if (candidateIds.length === 0) {
    return new Set<string>();
  }
  const rows = openDatabaseConnection().driver.queryAll<AttachmentLinkRow>(
    `SELECT DISTINCT na.attachment_id
     FROM node_attachments na
     INNER JOIN nodes n
       ON n.id = na.node_id
     WHERE na.attachment_id IN (${buildInClause(candidateIds.length)})
       AND na.role = 'reference'`,
    candidateIds
  );
  return new Set(rows.map((row) => row.attachment_id));
}

function resolveOrphanAttachmentIds(plan: AttachmentCleanupPlan) {
  const inlineStillReferenced = new Set(plan.retainedInlineAttachmentIds);
  const candidates = [...new Set([...plan.inlineAttachmentIds, ...plan.mountedAttachmentIds])];
  const mountedStillReferenced = listStillMountedAttachmentIds(candidates);
  return candidates.filter((id) => !inlineStillReferenced.has(id) && !mountedStillReferenced.has(id)).sort();
}

function listAttachmentFileRows(attachmentIds: string[]) {
  if (attachmentIds.length === 0) {
    return [];
  }
  return openDatabaseConnection().driver.queryAll<AttachmentFileRow>(
    `SELECT id, mime_type
     FROM attachments
     WHERE id IN (${buildInClause(attachmentIds.length)})`,
    attachmentIds
  );
}

function deleteAttachmentRows(driver: DatabaseDriver, attachmentIds: string[]) {
  if (attachmentIds.length === 0) {
    return;
  }
  const deleteNodeAttachmentLinks = driver.prepare('DELETE FROM node_attachments WHERE attachment_id = ?');
  const deleteAttachments = driver.prepare('DELETE FROM attachments WHERE id = ?');
  const deletedAt = new Date().toISOString();
  for (const attachmentId of attachmentIds) {
    deletePdfPageTextRowsForAttachment(attachmentId, deletedAt);
    recordAttachmentDeleted(driver, attachmentId, deletedAt);
    deleteNodeAttachmentLinks.run([attachmentId]);
    deleteAttachments.run([attachmentId]);
  }
}

export function deleteAttachmentFiles(rows: AttachmentFileRow[]) {
  const { assetsDir } = resolveRuntimeDataPaths();
  for (const row of rows) {
    if (!row.mime_type) continue;
    const key = buildCanonicalAttachmentStorageKey(row.id, row.mime_type);
    if (!key) throw new Error('attachment_delete_noncanonical_identity');
    moveAttachmentToTrash(assetsDir, key);
  }
}

export function cleanupOrphanAttachments(driver: DatabaseDriver, plan: AttachmentCleanupPlan) {
  const orphanAttachmentIds = resolveOrphanAttachmentIds(plan);
  const attachmentFiles = listAttachmentFileRows(orphanAttachmentIds);
  deleteAttachmentFiles(attachmentFiles);
  deleteAttachmentRows(driver, orphanAttachmentIds);
  return attachmentFiles;
}
