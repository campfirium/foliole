import type { DatabaseDriver } from './driver.js';

export interface RestoreNodeConflict {
  liveNodeId: string;
  trashNodeId: string;
}

export interface RestoreNodesResult {
  restoredNodeIds: string[];
  skippedConflicts: RestoreNodeConflict[];
}

interface NodeProvenanceRow {
  [column: string]: unknown;
  import_content_fingerprint: string | null;
  import_source_fingerprint: string | null;
}

interface LiveNodeRow {
  [column: string]: unknown;
  id: string;
}

function readNodeProvenance(driver: DatabaseDriver, nodeId: string) {
  return (
    driver.queryOne<NodeProvenanceRow>(
      `SELECT import_source_fingerprint, import_content_fingerprint
       FROM nodes
       WHERE id = ?`,
      [nodeId]
    ) ?? null
  );
}

function readReusableLiveNodeId(driver: DatabaseDriver, nodeId: string, provenance: NodeProvenanceRow) {
  if (!provenance.import_source_fingerprint || !provenance.import_content_fingerprint) {
    return null;
  }
  return (
    driver.queryOne<LiveNodeRow>(
      `SELECT n.id
       FROM nodes n
       WHERE n.import_source_fingerprint = ?
         AND n.import_content_fingerprint = ?
         AND n.deleted_at IS NULL
         AND n.id <> ?
       ORDER BY n.created_at ASC, n.id ASC
       LIMIT 1`,
      [provenance.import_source_fingerprint, provenance.import_content_fingerprint, nodeId]
    )?.id ?? null
  );
}

export function resolveRestoreNodesResult(driver: DatabaseDriver, nodeIds: string[]): RestoreNodesResult {
  const restoredNodeIds: string[] = [];
  const skippedConflicts: RestoreNodeConflict[] = [];

  for (const nodeId of nodeIds) {
    const provenance = readNodeProvenance(driver, nodeId);
    const liveNodeId = provenance ? readReusableLiveNodeId(driver, nodeId, provenance) : null;
    if (liveNodeId) {
      skippedConflicts.push({ liveNodeId, trashNodeId: nodeId });
      continue;
    }
    restoredNodeIds.push(nodeId);
  }

  return { restoredNodeIds, skippedConflicts };
}
