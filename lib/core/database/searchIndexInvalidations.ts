import type { DatabaseDriver } from './driver.js';
import {
  requestSearchIndexInvalidationProcessing,
  type SearchIndexInvalidationProcessingOptions
} from './searchIndexInvalidationRuntime.js';
import {
  syncPdfSearchIndexForAttachmentIds,
  syncPdfSearchIndexForNodeIds,
  syncNodeSearchIndexForNodeIds,
  syncWorkspaceSearchIndexForNodeIds
} from './workspaceSearchIndex.js';
import {
  deleteWorkspaceSearchIndexForSubtreeRootIds,
  syncWorkspaceSearchPathForSubtreeRootIds
} from './workspaceSearchSubtreeIndex.js';

export type SearchIndexInvalidationType =
  | 'attachment_pdf'
  | 'node_pdf'
  | 'node_subtree_deleted'
  | 'node_subtree_path'
  | 'node_subtree_restored'
  | 'node_workspace';

interface SearchIndexInvalidationRow {
  [column: string]: unknown;
  id: number;
  invalidation_type: SearchIndexInvalidationType;
  target_id: string;
}

interface SearchIndexInvalidationInput {
  targetId: string;
  type: SearchIndexInvalidationType;
}

const ACTIVE_STATUSES = "'pending', 'failed'";

function nowIso() {
  return new Date().toISOString();
}

function toUniqueInputs(inputs: SearchIndexInvalidationInput[]) {
  const seen = new Set<string>();
  return inputs.filter((input) => {
    const targetId = input.targetId.trim();
    if (!targetId) return false;
    const key = `${input.type}:${targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    input.targetId = targetId;
    return true;
  });
}

export function enqueueSearchIndexInvalidations(
  driver: DatabaseDriver,
  inputs: SearchIndexInvalidationInput[],
  processingOptions?: SearchIndexInvalidationProcessingOptions
) {
  const uniqueInputs = toUniqueInputs(inputs);
  if (uniqueInputs.length === 0) return;
  const timestamp = nowIso();
  const refreshPending = driver.prepare(
    `UPDATE search_index_invalidations
     SET updated_at = ?, last_error = NULL
     WHERE invalidation_type = ?
       AND target_id = ?
       AND status = 'pending'`
  );
  const insert = driver.prepare(
    `INSERT INTO search_index_invalidations (
       invalidation_type, target_id, status, attempts, last_error, created_at, updated_at, claimed_at, completed_at
     ) VALUES (?, ?, 'pending', 0, NULL, ?, ?, NULL, NULL)`
  );
  for (const input of uniqueInputs) {
    const refreshed = refreshPending.run([timestamp, input.type, input.targetId]);
    if (refreshed.changes === 0) {
      insert.run([input.type, input.targetId, timestamp, timestamp]);
    }
  }
  requestSearchIndexInvalidationProcessing(processingOptions);
}

export function enqueueWorkspaceSearchInvalidationForNodeIds(
  driver: DatabaseDriver,
  nodeIds: string[],
  processingOptions?: SearchIndexInvalidationProcessingOptions
) {
  enqueueSearchIndexInvalidations(
    driver,
    nodeIds.map((targetId) => ({ targetId, type: 'node_workspace' })),
    processingOptions
  );
}

export function enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds(
  driver: DatabaseDriver,
  nodeIds: string[],
  processingOptions?: SearchIndexInvalidationProcessingOptions
) {
  enqueueSearchIndexInvalidations(
    driver,
    nodeIds.map((targetId) => ({ targetId, type: 'node_subtree_path' })),
    processingOptions
  );
}

export function enqueueWorkspaceSearchDeleteInvalidationForSubtreeRootIds(driver: DatabaseDriver, nodeIds: string[]) {
  enqueueSearchIndexInvalidations(driver, nodeIds.map((targetId) => ({ targetId, type: 'node_subtree_deleted' })));
}

export function enqueueWorkspaceSearchRestoreInvalidationForSubtreeRootIds(driver: DatabaseDriver, nodeIds: string[]) {
  enqueueSearchIndexInvalidations(driver, nodeIds.map((targetId) => ({ targetId, type: 'node_subtree_restored' })));
}

export function enqueuePdfSearchInvalidationForNodeIds(driver: DatabaseDriver, nodeIds: string[]) {
  enqueueSearchIndexInvalidations(driver, nodeIds.map((targetId) => ({ targetId, type: 'node_pdf' })));
}

export function enqueuePdfSearchInvalidationForAttachmentIds(driver: DatabaseDriver, attachmentIds: string[]) {
  enqueueSearchIndexInvalidations(driver, attachmentIds.map((targetId) => ({ targetId, type: 'attachment_pdf' })));
}

export function processSearchIndexInvalidations(driver: DatabaseDriver, limit = 500) {
  const claimedAt = nowIso();
  const rows = driver.transaction(() => {
    const candidates = driver.queryAll<SearchIndexInvalidationRow>(
      `SELECT id, invalidation_type, target_id
       FROM search_index_invalidations
       WHERE status IN (${ACTIVE_STATUSES})
       ORDER BY updated_at ASC, id ASC
       LIMIT ?`,
      [limit]
    );
    if (candidates.length === 0) return [];
    const claim = driver.prepare(
      `UPDATE search_index_invalidations
       SET status = 'running', attempts = attempts + 1, claimed_at = ?, updated_at = ?, last_error = NULL
       WHERE id = ?`
    );
    candidates.forEach((row) => claim.run([claimedAt, claimedAt, row.id]));
    return candidates;
  });
  if (rows.length === 0) return { failed: 0, processed: 0 };

  try {
    processClaimedInvalidationRows(driver, rows);
    completeInvalidations(driver, rows.map((row) => row.id), nowIso());
    return { failed: 0, processed: rows.length };
  } catch (error) {
    failInvalidations(driver, rows.map((row) => row.id), error, nowIso());
    return { failed: rows.length, processed: 0 };
  }
}

export function readSearchIndexInvalidationBacklog(driver: DatabaseDriver) {
  return driver.queryOne<{ failed_count: number; pending_count: number; running_count: number; total_count: number }>(
    `SELECT
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
       SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_count,
       COUNT(*) AS total_count
     FROM search_index_invalidations
     WHERE status IN ('pending', 'running', 'failed')`
  ) ?? { failed_count: 0, pending_count: 0, running_count: 0, total_count: 0 };
}

function processClaimedInvalidationRows(driver: DatabaseDriver, rows: SearchIndexInvalidationRow[]) {
  const nodeWorkspaceIds = rows.filter((row) => row.invalidation_type === 'node_workspace').map((row) => row.target_id);
  const nodePdfIds = rows.filter((row) => row.invalidation_type === 'node_pdf').map((row) => row.target_id);
  const attachmentPdfIds = rows.filter((row) => row.invalidation_type === 'attachment_pdf').map((row) => row.target_id);
  const subtreeDeletedIds = rows.filter((row) => row.invalidation_type === 'node_subtree_deleted').map((row) => row.target_id);
  const subtreeRestoredIds = rows.filter((row) => row.invalidation_type === 'node_subtree_restored').map((row) => row.target_id);
  const subtreePathIds = rows.filter((row) => row.invalidation_type === 'node_subtree_path').map((row) => row.target_id);
  deleteWorkspaceSearchIndexForSubtreeRootIds(driver, subtreeDeletedIds);
  syncNodeSearchIndexForNodeIds(driver, nodeWorkspaceIds);
  syncPdfSearchIndexForNodeIds(driver, nodeWorkspaceIds);
  syncPdfSearchIndexForNodeIds(driver, nodePdfIds);
  syncPdfSearchIndexForAttachmentIds(driver, attachmentPdfIds);
  syncWorkspaceSearchIndexForNodeIds(driver, subtreeRestoredIds);
  syncWorkspaceSearchPathForSubtreeRootIds(driver, subtreePathIds);
}

function completeInvalidations(driver: DatabaseDriver, ids: number[], completedAt: string) {
  const complete = driver.prepare(
    `UPDATE search_index_invalidations
     SET status = 'completed', updated_at = ?, completed_at = ?
     WHERE id = ?`
  );
  driver.transaction(() => {
    ids.forEach((id) => complete.run([completedAt, completedAt, id]));
  });
}

function failInvalidations(driver: DatabaseDriver, ids: number[], error: unknown, failedAt: string) {
  const message = error instanceof Error ? error.message : String(error);
  const fail = driver.prepare(
    `UPDATE search_index_invalidations
     SET status = 'failed', updated_at = ?, last_error = ?
     WHERE id = ?`
  );
  driver.transaction(() => {
    ids.forEach((id) => fail.run([failedAt, message, id]));
  });
}
