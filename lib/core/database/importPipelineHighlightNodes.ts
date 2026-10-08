import type { PreparedImportHighlightRecord } from '../import/contract.js';

import { bodyPartPrefix } from './bodyPartitionIdentity.js';
import type { DatabaseDriver } from './driver.js';
import { insertImportedHighlightNodes } from './importDerivedHighlights.js';
import type { AnchoredImportedHighlightRecord } from './importHighlightAnchors.js';
import { filterImportHighlightsWithinBudget } from './importHighlightTextBudget.js';
import { rewriteExistingNodeOrder } from './nodeOrderMutations.js';
import { recordNodeRelatedStateDeletion, retireUnversionedDeletedNodeState } from './nodeRelatedStateDeletion.js';
import { writeNodeSyncTombstonesForPermanentDelete } from './nodeSyncTombstones.js';
import { loadDerivedNodeOrder } from './parentChildOrder.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';
import { collectTextBodyBlobCandidates } from './textBodyBlobCollection.js';

interface ExistingChildHighlightRow {
  [column: string]: unknown;
  anchor_link: string | null;
  content: string;
  id: string;
  is_title_manual: number;
}

function isImportedAnchorLink(value: string | null) {
  if (!value) {
    return false;
  }
  try {
    const parsed = JSON.parse(value) as { id?: unknown; origin?: unknown };
    return parsed?.origin === 'imported' || (typeof parsed?.id === 'string' && parsed.id.startsWith('imported-highlight-'));
  } catch {
    return false;
  }
}

export function readExistingChildHighlights(driver: DatabaseDriver, parentNodeId: string) {
  const rows = driver.queryAll<ExistingChildHighlightRow>(
    `SELECT id, content, anchor_link, is_title_manual
     FROM nodes
     WHERE parent_id = ? AND deleted_at IS NULL AND id NOT LIKE ?`,
    [parentNodeId, `${bodyPartPrefix(parentNodeId)}%`]
  );
  return rows;
}

function isGeneratedImportedChild(row: ExistingChildHighlightRow) {
  return isImportedAnchorLink(row.anchor_link) || (!row.anchor_link && row.is_title_manual === 0);
}

function deleteGeneratedImportedChildNodes(driver: DatabaseDriver, nodeIds: string[], deletedAt: string,
  replacementIds: Set<string>, prepareDeletionVersions?: (nodeIds: string[], deletedAt: string) => void) {
  if (nodeIds.length === 0) {
    return;
  }
  const bodyHashes = driver.queryAll<{ body_blob_hash: string }>(
    `SELECT body_blob_hash FROM nodes WHERE id IN (SELECT value FROM json_each(?))
     AND body_blob_hash IS NOT NULL`, [JSON.stringify(nodeIds)]).map((row) => row.body_blob_hash);
  const deleteReviewLog = driver.prepare('DELETE FROM review_log WHERE node_id = ?');
  const deleteNodeReview = driver.prepare('DELETE FROM node_review WHERE node_id = ?');
  const deleteNodeReading = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteNodeReadingHostState = driver.prepare('DELETE FROM node_reading_host_state WHERE node_id = ?');
  const deleteNodeViewState = driver.prepare('DELETE FROM node_view_state WHERE node_id = ?');
  const deleteNode = driver.prepare('DELETE FROM nodes WHERE id = ?');
  const discardedIds = nodeIds.filter((nodeId) => !replacementIds.has(nodeId));
  if (prepareDeletionVersions) {
    prepareDeletionVersions(discardedIds, deletedAt);
    writeNodeSyncTombstonesForPermanentDelete(driver, discardedIds, deletedAt);
  }
  nodeIds.forEach((nodeId) => {
    recordNodeRelatedStateDeletion(driver, nodeId, deletedAt);
    if (!replacementIds.has(nodeId)) retireUnversionedDeletedNodeState(driver, nodeId);
    deleteReviewLog.run([nodeId]);
    deleteNodeReview.run([nodeId]);
    deleteNodeReading.run([nodeId]);
    deleteNodeReadingHostState.run([nodeId]);
    deleteNodeViewState.run([nodeId]);
  });
  [...nodeIds].reverse().forEach((nodeId) => deleteNode.run([nodeId]));
  collectTextBodyBlobCandidates(driver, bodyHashes);
  rewriteExistingNodeOrder(driver, loadDerivedNodeOrder(driver));
}

export function replaceImportedHighlightNodes(input: {
  driver: DatabaseDriver;
  highlights: AnchoredImportedHighlightRecord[];
  importedAt: string;
  parentNodeId: string;
  parentContent: string;
  prepareDeletionVersions?: (nodeIds: string[], deletedAt: string) => void;
  budgetFailures?: string[];
  rejectedHighlights?: PreparedImportHighlightRecord[];
}) {
  const existingChildren = readExistingChildHighlights(input.driver, input.parentNodeId).filter(isGeneratedImportedChild);
  const bounded = filterImportHighlightsWithinBudget(input.highlights, input.parentContent, input.budgetFailures);
  const rejected = [...bounded.rejected, ...(input.rejectedHighlights ?? [])];
  const rejectedIds = new Set(rejected.flatMap(highlight => highlight.nodeId ? [highlight.nodeId] : []));
  const preserveUnknown = rejected.some(highlight => !highlight.nodeId);
  const replaceable = existingChildren.filter(row => !preserveUnknown && !rejectedIds.has(row.id));
  const highlights = bounded.highlights.map(highlight => {
    if (!preserveUnknown || highlight.nodeId) return highlight;
    const matches = existingChildren.filter(row => row.content === highlight.content);
    return matches.length === 1 ? { ...highlight, nodeId: matches[0]!.id } : highlight;
  });
  deleteGeneratedImportedChildNodes(input.driver, replaceable.map((row) => row.id), input.importedAt,
    new Set(highlights.flatMap((highlight) => highlight.nodeId ? [highlight.nodeId] : [])),
    input.prepareDeletionVersions);
  enqueueWorkspaceSearchInvalidationForNodeIds(
    input.driver,
    existingChildren.map((row) => row.id)
  );
  if (highlights.length === 0) {
    return 0;
  }
  return insertImportedHighlightNodes({
    driver: input.driver,
    highlights,
    ...(input.budgetFailures ? { budgetFailures: input.budgetFailures } : {}),
    importedAt: input.importedAt,
    parentNodeId: input.parentNodeId,
    parentContent: input.parentContent
  });
}
