import fs from 'node:fs';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences.js';
import { parseAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import { resolveAttachmentStoragePathCandidates } from '../attachments/storagePath.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { recordAttachmentDeleted } from './attachmentBlobs.js';
import { openDatabaseConnection } from './connection.js';
import { deletePdfPageTextRowsForAttachment } from './pdfPageTextRows.js';

interface NodeContentRow extends DatabaseRow {
  content: string;
}

interface AttachmentLinkRow extends DatabaseRow {
  attachment_id: string;
}

interface AttachmentFileRow extends DatabaseRow {
  id: string;
  original_name: string | null;
}

interface AttachmentCleanupPlan {
  inlineAttachmentIds: string[];
  mountedAttachmentIds: string[];
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
    `SELECT content
     FROM nodes
     WHERE id IN (${buildInClause(nodeIds.length)})`,
    nodeIds
  );
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
  const inlineAttachmentIds = new Set<string>();
  for (const row of listDeletedNodeContentRows(nodeIds)) {
    for (const attachmentId of collectInlineAttachmentIds(row.content)) {
      inlineAttachmentIds.add(attachmentId);
    }
  }

  return {
    inlineAttachmentIds: toUniqueSortedArray(inlineAttachmentIds),
    mountedAttachmentIds: Array.from(new Set(listDeletedMountedAttachmentIds(nodeIds))).sort((left, right) =>
      left.localeCompare(right)
    )
  };
}

function listStillReferencedInlineAttachmentIds(candidateIds: string[]) {
  if (candidateIds.length === 0) {
    return new Set<string>();
  }
  const candidateIdSet = new Set(candidateIds);
  const rows = openDatabaseConnection().driver.queryAll<NodeContentRow>(
    `SELECT content
     FROM nodes
     WHERE content LIKE '%asset://%'`
  );
  const referencedAttachmentIds = new Set<string>();
  for (const row of rows) {
    for (const attachmentId of collectInlineAttachmentIds(row.content)) {
      if (candidateIdSet.has(attachmentId)) {
        referencedAttachmentIds.add(attachmentId);
      }
    }
  }
  return referencedAttachmentIds;
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
  const inlineStillReferenced = listStillReferencedInlineAttachmentIds(plan.inlineAttachmentIds);
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
    `SELECT id, original_name
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
    for (const filePath of resolveAttachmentStoragePathCandidates(row.id, row.original_name, assetsDir)) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch {
        // Keep database cleanup successful even if a stale file path is already gone or locked.
      }
    }
  }
}

export function cleanupOrphanAttachments(driver: DatabaseDriver, plan: AttachmentCleanupPlan) {
  const orphanAttachmentIds = resolveOrphanAttachmentIds(plan);
  const attachmentFiles = listAttachmentFileRows(orphanAttachmentIds);
  deleteAttachmentRows(driver, orphanAttachmentIds);
  return attachmentFiles;
}
