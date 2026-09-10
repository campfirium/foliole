import fs from 'node:fs';
import path from 'node:path';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { NodeBodyUnavailableError, resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences.js';
import { parseAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import { hashFile } from '../attachments/canonicalAttachmentPreflightFiles.js';
import { resolveAttachmentStoragePathCandidates } from '../attachments/storagePath.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { recordAttachmentDeleted } from './attachmentBlobs.js';
import { openDatabaseConnection } from './connection.js';
import { deletePdfPageTextRowsForAttachment } from './pdfPageTextRows.js';

interface NodeContentRow extends DatabaseRow, NodeBodyRow {
  id: string;
}

interface AttachmentLinkRow extends DatabaseRow {
  attachment_id: string;
}

interface AttachmentFileRow extends DatabaseRow {
  attachment_id: string;
  content_hash: string;
  mime_type: string;
  storage_key: string;
}

interface AttachmentCleanupPlan {
  inlineAttachmentIds: string[];
  mountedAttachmentIds: string[];
  retainedInlineAttachmentIds: string[];
}

function collectInlineAttachmentIds(text: string) {
  const attachmentIds = new Set<string>();
  for (const reference of collectMarkdownImageReferences(text)) {
    const target = parseMarkdownImageTarget(reference.rawTarget);
    const attachmentId = target ? parseAssetMarkdownUrl(target.destination) : null;
    if (attachmentId) {
      attachmentIds.add(attachmentId);
    }
  }
  return attachmentIds;
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
  const mountedStillReferenced = listStillMountedAttachmentIds(plan.mountedAttachmentIds);
  const orphanAttachmentIds = new Set<string>();

  for (const attachmentId of plan.inlineAttachmentIds) {
    if (!inlineStillReferenced.has(attachmentId)) {
      orphanAttachmentIds.add(attachmentId);
    }
  }
  for (const attachmentId of plan.mountedAttachmentIds) {
    if (!mountedStillReferenced.has(attachmentId)) {
      orphanAttachmentIds.add(attachmentId);
    }
  }

  return toUniqueSortedArray(orphanAttachmentIds);
}

function listAttachmentFileRows(attachmentIds: string[]) {
  if (attachmentIds.length === 0) {
    return [];
  }
  return openDatabaseConnection().driver.queryAll<AttachmentFileRow>(
    `SELECT a.id AS attachment_id, b.content_hash, b.mime_type, b.storage_key
     FROM attachments a JOIN attachment_blobs b ON b.attachment_id = a.id
     WHERE a.id IN (${buildInClause(attachmentIds.length)})
       AND b.content_hash IS NOT NULL AND b.mime_type IS NOT NULL AND b.storage_key IS NOT NULL`,
    attachmentIds
  );
}

function deleteAttachmentRows(driver: DatabaseDriver, rows: AttachmentFileRow[]) {
  if (rows.length === 0) {
    return;
  }
  const deleteNodeAttachmentLinks = driver.prepare('DELETE FROM node_attachments WHERE attachment_id = ?');
  const deleteAttachments = driver.prepare('DELETE FROM attachments WHERE id = ?');
  const deletedAt = new Date().toISOString();
  for (const row of rows) {
    deletePdfPageTextRowsForAttachment(row.attachment_id, deletedAt);
    recordAttachmentDeleted(driver, row, deletedAt);
    deleteNodeAttachmentLinks.run([row.attachment_id]);
    deleteAttachments.run([row.attachment_id]);
  }
}

export function deleteAttachmentFiles(rows: AttachmentFileRow[]) {
  const { assetsDir } = resolveRuntimeDataPaths();
  for (const row of rows) {
    const [filePath] = resolveAttachmentStoragePathCandidates(row.storage_key, null, assetsDir);
    if (!filePath || path.basename(filePath) !== row.storage_key || !fs.existsSync(filePath)) continue;
    if (hashFile(filePath) !== row.content_hash) continue;
    try { fs.rmSync(filePath, { force: true }); } catch {
      // The persistent tombstone keeps the exact file obligation available for a later retry.
    }
  }
}

export function cleanupOrphanAttachments(driver: DatabaseDriver, plan: AttachmentCleanupPlan) {
  const orphanAttachmentIds = resolveOrphanAttachmentIds(plan);
  const attachmentFiles = listAttachmentFileRows(orphanAttachmentIds);
  deleteAttachmentRows(driver, attachmentFiles);
  return attachmentFiles;
}
