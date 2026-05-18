import type { DatabaseDriver } from './driver.js';

export interface RestoreNodeConflict {
  liveNodeId: string;
  trashNodeId: string;
}

export interface RestoreNodesResult {
  restoredNodeIds: string[];
  skippedConflicts: RestoreNodeConflict[];
}

interface ImportRunIdentityRow {
  [column: string]: unknown;
  content_fingerprint: string;
  source_fingerprint: string;
}

interface LiveNodeRow {
  [column: string]: unknown;
  id: string;
}

function readLatestImportRunIdentity(driver: DatabaseDriver, nodeId: string) {
  return (
    driver.queryOne<ImportRunIdentityRow>(
      `SELECT source_fingerprint, content_fingerprint
       FROM import_runs
       WHERE node_id = ?
       ORDER BY imported_at DESC, id DESC
       LIMIT 1`,
      [nodeId]
    ) ?? null
  );
}

function readReusableLiveNodeId(driver: DatabaseDriver, nodeId: string, identity: ImportRunIdentityRow) {
  return (
    driver.queryOne<LiveNodeRow>(
      `SELECT n.id
       FROM import_runs run
       JOIN nodes n ON n.id = run.node_id
       WHERE run.source_fingerprint = ?
         AND run.content_fingerprint = ?
         AND n.deleted_at IS NULL
         AND n.id <> ?
       GROUP BY n.id, n.created_at
       ORDER BY MAX(run.imported_at) DESC, n.created_at ASC, n.id ASC
       LIMIT 1`,
      [identity.source_fingerprint, identity.content_fingerprint, nodeId]
    )?.id ?? null
  );
}

export function resolveRestoreNodesResult(driver: DatabaseDriver, nodeIds: string[]): RestoreNodesResult {
  const restoredNodeIds: string[] = [];
  const skippedConflicts: RestoreNodeConflict[] = [];

  for (const nodeId of nodeIds) {
    const identity = readLatestImportRunIdentity(driver, nodeId);
    const liveNodeId = identity ? readReusableLiveNodeId(driver, nodeId, identity) : null;
    if (liveNodeId) {
      skippedConflicts.push({ liveNodeId, trashNodeId: nodeId });
      continue;
    }
    restoredNodeIds.push(nodeId);
  }

  return { restoredNodeIds, skippedConflicts };
}
