import type { PreparedImportRecord } from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';
import { requireResolvedNodeBody, type NodeBodyRow } from './nodeBodyResolution.js';

export interface ImportSourceRow {
  [column: string]: unknown;
  latest_node_id: string | null;
  last_content_fingerprint: string;
}

export interface ExistingNodeRow extends NodeBodyRow {
  [column: string]: unknown;
  content: string;
  created_at: string;
  deleted_at: string | null;
  id: string;
  import_content_fingerprint: string | null;
  import_source_fingerprint: string | null;
  parent_id: string | null;
}

export interface ExistingImportTarget {
  existingNode: ExistingNodeRow | null;
  existingSource: ImportSourceRow | null;
  forceUpdateExisting: boolean;
}

export function hasLandedImportEvidence(
  driver: DatabaseDriver,
  nodeId: string,
  prepared: PreparedImportRecord
) {
  return Boolean(driver.queryOne<{ found: number }>(
    `SELECT 1 AS found
     FROM import_runs
     WHERE node_id = ?
       AND source_fingerprint = ?
       AND content_fingerprint = ?
       AND result_status <> 'failed'
       AND NOT (result_status = 'degraded' AND degraded_reason = 'empty_content')
     LIMIT 1`,
    [nodeId, prepared.sourceFingerprint, prepared.contentFingerprint]
  ));
}

function readExistingSource(driver: DatabaseDriver, sourceFingerprint: string) {
  return (
    driver.queryOne<ImportSourceRow>(
      `SELECT latest_node_id, last_content_fingerprint
       FROM import_sources
       WHERE source_fingerprint = ?`,
      [sourceFingerprint]
    ) ?? null
  );
}

function readExistingNode(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<ExistingNodeRow>(
      `SELECT n.id, n.parent_id, n.content, n.body_blob_hash, cbd.data AS body_blob_data,
              n.created_at, n.deleted_at, n.import_source_fingerprint, n.import_content_fingerprint
       FROM nodes n
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.id = ?`,
      [nodeId]
  );
  return row ? { ...row, content: requireResolvedNodeBody(row, row.id).content } : null;
}

function readLiveSameContentImportNode(driver: DatabaseDriver, prepared: PreparedImportRecord) {
  const row = driver.queryOne<ExistingNodeRow>(
      `SELECT n.id, n.parent_id, n.content, n.body_blob_hash, cbd.data AS body_blob_data,
              n.created_at, n.deleted_at, n.import_source_fingerprint, n.import_content_fingerprint
       FROM import_runs run
       JOIN nodes n ON n.id = run.node_id
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE run.source_fingerprint = ?
         AND run.content_fingerprint = ?
         AND n.deleted_at IS NULL
       GROUP BY n.id, n.parent_id, n.content, n.body_blob_hash, cbd.data, n.created_at, n.deleted_at,
                n.import_source_fingerprint, n.import_content_fingerprint
       ORDER BY MAX(run.imported_at) DESC, n.created_at ASC, n.id ASC
       LIMIT 1`,
      [prepared.sourceFingerprint, prepared.contentFingerprint]
  );
  return row ? { ...row, content: requireResolvedNodeBody(row, row.id).content } : null;
}

export function resolveExistingImportTarget(
  driver: DatabaseDriver,
  prepared: PreparedImportRecord,
  forceUpdateExistingNodeId?: string
): ExistingImportTarget {
  const existingSource = readExistingSource(driver, prepared.sourceFingerprint);
  const forcedExistingNode = forceUpdateExistingNodeId ? readExistingNode(driver, forceUpdateExistingNodeId) : null;
  if (forcedExistingNode && !forcedExistingNode.deleted_at) {
    return { existingNode: forcedExistingNode, existingSource, forceUpdateExisting: true };
  }
  const latestNode = existingSource?.latest_node_id ? readExistingNode(driver, existingSource.latest_node_id) : null;
  if (latestNode && !latestNode.deleted_at) {
    return { existingNode: latestNode, existingSource, forceUpdateExisting: false };
  }
  return {
    existingNode: readLiveSameContentImportNode(driver, prepared),
    existingSource,
    forceUpdateExisting: false
  };
}
