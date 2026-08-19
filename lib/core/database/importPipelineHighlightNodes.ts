import type { DatabaseDriver } from './driver.js';
import { insertImportedHighlightNodes } from './importDerivedHighlights.js';
import type { AnchoredImportedHighlightRecord } from './importHighlightAnchors.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';

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
  return driver.queryAll<ExistingChildHighlightRow>(
    `SELECT id, content, anchor_link, is_title_manual
     FROM nodes
     WHERE parent_id = ? AND deleted_at IS NULL`,
    [parentNodeId]
  );
}

function isGeneratedImportedChild(row: ExistingChildHighlightRow) {
  return isImportedAnchorLink(row.anchor_link) || (!row.anchor_link && row.is_title_manual === 0);
}

function deleteGeneratedImportedChildNodes(driver: DatabaseDriver, nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return;
  }
  const deleteReviewLog = driver.prepare('DELETE FROM review_log WHERE node_id = ?');
  const deleteNodeReview = driver.prepare('DELETE FROM node_review WHERE node_id = ?');
  const deleteNodeReading = driver.prepare('DELETE FROM node_reading WHERE node_id = ?');
  const deleteNodeReadingHostState = driver.prepare('DELETE FROM node_reading_host_state WHERE node_id = ?');
  const deleteNodeViewState = driver.prepare('DELETE FROM node_view_state WHERE node_id = ?');
  const deleteNodeOrder = driver.prepare('DELETE FROM node_order WHERE node_id = ?');
  const deleteNode = driver.prepare('DELETE FROM nodes WHERE id = ?');
  nodeIds.forEach((nodeId) => {
    deleteReviewLog.run([nodeId]);
    deleteNodeReview.run([nodeId]);
    deleteNodeReading.run([nodeId]);
    deleteNodeReadingHostState.run([nodeId]);
    deleteNodeViewState.run([nodeId]);
    deleteNodeOrder.run([nodeId]);
  });
  [...nodeIds].reverse().forEach((nodeId) => deleteNode.run([nodeId]));
}

export function replaceImportedHighlightNodes(input: {
  driver: DatabaseDriver;
  highlights: AnchoredImportedHighlightRecord[];
  importedAt: string;
  parentNodeId: string;
  parentContent: string;
}) {
  const existingChildren = readExistingChildHighlights(input.driver, input.parentNodeId).filter(isGeneratedImportedChild);
  deleteGeneratedImportedChildNodes(input.driver, existingChildren.map((row) => row.id));
  enqueueWorkspaceSearchInvalidationForNodeIds(
    input.driver,
    existingChildren.map((row) => row.id)
  );
  if (input.highlights.length === 0) {
    return 0;
  }
  return insertImportedHighlightNodes({
    driver: input.driver,
    highlights: input.highlights,
    importedAt: input.importedAt,
    parentNodeId: input.parentNodeId,
    parentContent: input.parentContent
  });
}
