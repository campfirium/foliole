import type { DatabaseDriver } from './driver.js';
import { NODE_PDF_RESOURCES_SQL } from './nodePdfResourcesSql.js';
import { requestSearchIndexInvalidationProcessing } from './searchIndexInvalidationRuntime.js';
import { DELETE_NODE_SEARCH_PENDING_SQL, INSERT_NODE_SEARCH_PENDING_SQL, normalizeSearchPendingStates } from './searchPendingState.js';
import { syncPdfSearchIndexForAttachmentIds, syncWorkspaceSearchIndexForNodeIds } from './workspaceSearchIndex.js';
import {
  advanceWorkspaceSearchSourceRevision,
  markWorkspaceSearchSourceIndexedIfSettled,
  markWorkspaceSearchSourceRevisionQueued
} from './workspaceSearchSourceState.js';
import { deleteWorkspaceSearchIndexForSubtreeRootIds } from './workspaceSearchSubtreeIndex.js';

export type SearchIndexInvalidationType =
  | 'attachment_pdf'
  | 'node_pdf'
  | 'node_subtree_deleted'
  | 'node_subtree_path'
  | 'node_subtree_restored'
  | 'node_workspace';

export interface SearchIndexInvalidationRow {
  [column: string]: unknown;
  id: number;
  invalidation_type: SearchIndexInvalidationType;
  target_id: string;
}

interface SearchIndexInvalidationInput {
  targetId: string;
  type: SearchIndexInvalidationType;
}

interface EnqueueSearchIndexInvalidationOptions {
  advanceSourceRevision?: boolean;
  markSourceRevisionQueued?: boolean;
  requestProcessing?: boolean;
}


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
  options: EnqueueSearchIndexInvalidationOptions = {}
) {
  const uniqueInputs = toUniqueInputs(inputs);
  if (uniqueInputs.length === 0) return;
  const timestamp = nowIso();
  driver.transaction(() => {
    const retire = driver.prepare(DELETE_NODE_SEARCH_PENDING_SQL);
    const insert = driver.prepare(INSERT_NODE_SEARCH_PENDING_SQL);
    const nodeIds = new Set<string>();
    for (const input of uniqueInputs) {
      if (input.type === 'attachment_pdf') {
        driver.queryAll<{ node_id: string }>(
          `SELECT DISTINCT node_id FROM (${NODE_PDF_RESOURCES_SQL}) WHERE id = ?`, [input.targetId]
        ).forEach((row) => nodeIds.add(row.node_id));
      } else nodeIds.add(input.targetId);
    }
    for (const nodeId of nodeIds) {
      retire.run([nodeId]);
      insert.run([nodeId, timestamp, timestamp]);
    }
  });
  if (options.advanceSourceRevision !== false) {
    advanceWorkspaceSearchSourceRevision(driver);
  }
  if (options.markSourceRevisionQueued !== false) {
    markWorkspaceSearchSourceRevisionQueued(driver);
  }
  if (options.requestProcessing !== false) requestSearchIndexInvalidationProcessing();
}

export function enqueueWorkspaceSearchInvalidationForNodeIds(
  driver: DatabaseDriver,
  nodeIds: string[],
  options: EnqueueSearchIndexInvalidationOptions = {}
) {
  enqueueSearchIndexInvalidations(
    driver,
    nodeIds.map((targetId) => ({ targetId, type: 'node_workspace' })),
    options
  );
}

export function enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds(
  driver: DatabaseDriver,
  nodeIds: string[],
  options: EnqueueSearchIndexInvalidationOptions = {}
) {
  enqueueSearchIndexInvalidations(
    driver,
    nodeIds.map((targetId) => ({ targetId, type: 'node_subtree_path' })),
    options
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
  const rows = claimSearchIndexInvalidations(driver, limit);
  if (rows.length === 0) return { failed: 0, processed: 0 };

  try {
    processClaimedInvalidationRows(driver, rows);
    completeInvalidations(driver, rows.map((row) => row.id));
    return { failed: 0, processed: rows.length };
  } catch (error) {
    failInvalidations(driver, rows.map((row) => row.id), error, nowIso());
    return { failed: rows.length, processed: 0 };
  }
}

export function claimSearchIndexInvalidations(driver: DatabaseDriver, limit = 500) {
  const claimedAt = nowIso();
  normalizeSearchPendingStates(driver);
  return driver.transaction(() => {
    const candidates = driver.queryAll<SearchIndexInvalidationRow>(
      `SELECT id, invalidation_type, target_id
       FROM search_index_invalidations
       WHERE status = 'pending'
       ORDER BY updated_at ASC, id ASC
       LIMIT ?`,
      [limit]
    );
    if (candidates.length === 0) return [];
    const claim = driver.prepare(
      `UPDATE search_index_invalidations
       SET attempts = attempts + 1, claimed_at = ?, updated_at = ?, last_error = NULL
       WHERE id = ?`
    );
    candidates.forEach((row) => claim.run([claimedAt, claimedAt, row.id]));
    return candidates;
  });
}

export function readSearchIndexInvalidationBacklog(driver: DatabaseDriver) {
  return driver.queryOne<{ failed_count: number; pending_count: number; running_count: number; total_count: number }>(
    `SELECT
       SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) AS failed_count,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
       SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_count,
       COUNT(*) AS total_count
     FROM search_index_invalidations
     WHERE status IN ('pending', 'running', 'failed')`
  ) ?? { failed_count: 0, pending_count: 0, running_count: 0, total_count: 0 };
}

export function processClaimedInvalidationRows(driver: DatabaseDriver, rows: SearchIndexInvalidationRow[]) {
  const attachmentIds = rows.filter((row) => row.invalidation_type === 'attachment_pdf').map((row) => row.target_id);
  for (const attachmentId of attachmentIds) {
    driver.execute('DELETE FROM search.pdf_search WHERE attachment_id = ?', [attachmentId]);
  }
  syncPdfSearchIndexForAttachmentIds(driver, attachmentIds);
  const nodeIds = rows.filter((row) => row.invalidation_type !== 'attachment_pdf').map((row) => row.target_id);
  deleteWorkspaceSearchIndexForSubtreeRootIds(driver, nodeIds);
  syncWorkspaceSearchIndexForNodeIds(driver, nodeIds);
}

export function completeInvalidations(driver: DatabaseDriver, ids: number[]) {
  const complete = driver.prepare(
    "DELETE FROM search_index_invalidations WHERE id = ?"
  );
  driver.transaction(() => {
    ids.forEach((id) => complete.run([id]));
    markWorkspaceSearchSourceIndexedIfSettled(driver);
  });
}

export function failInvalidations(driver: DatabaseDriver, ids: number[], error: unknown, failedAt = nowIso()) {
  const message = error instanceof Error ? error.message : String(error);
  const fail = driver.prepare(
    `UPDATE search_index_invalidations
     SET status = 'pending', updated_at = ?, last_error = ?
     WHERE id = ?`
  );
  driver.transaction(() => {
    ids.forEach((id) => fail.run([failedAt, message, id]));
  });
}
