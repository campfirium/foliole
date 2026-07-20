import type { DatabaseDriver } from './driver.js';

export interface RestoreNodeConflict {
  liveNodeId: string;
  trashNodeId: string;
}

export interface RestoreNodesResult {
  restoredNodeIds: string[];
  skippedConflicts: RestoreNodeConflict[];
}

export interface RestoreNodeCandidate {
  createdAt: string;
  deletedAt: string | null;
  id: string;
  importContentFingerprint: string | null;
  importSourceFingerprint: string | null;
}

interface NodeCandidateRow {
  [column: string]: unknown;
  created_at: string;
  deleted_at: string | null;
  id: string;
  import_content_fingerprint: string | null;
  import_source_fingerprint: string | null;
}

function toRestoreNodeCandidate(row: NodeCandidateRow): RestoreNodeCandidate {
  return {
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    id: row.id,
    importContentFingerprint: row.import_content_fingerprint,
    importSourceFingerprint: row.import_source_fingerprint
  };
}

function compareRestoreCandidates(left: RestoreNodeCandidate, right: RestoreNodeCandidate) {
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export function resolveRestoreNodeCandidates(
  nodeIds: string[],
  candidates: RestoreNodeCandidate[]
): RestoreNodesResult {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const restoredNodeIds: string[] = [];
  const skippedConflicts: RestoreNodeConflict[] = [];

  for (const nodeId of nodeIds) {
    const target = candidatesById.get(nodeId);
    const liveNode = target?.importSourceFingerprint && target.importContentFingerprint
      ? candidates.filter((candidate) => (
        candidate.id !== nodeId &&
        candidate.deletedAt === null &&
        candidate.importSourceFingerprint === target.importSourceFingerprint &&
        candidate.importContentFingerprint === target.importContentFingerprint
      )).sort(compareRestoreCandidates)[0]
      : undefined;
    if (liveNode) skippedConflicts.push({ liveNodeId: liveNode.id, trashNodeId: nodeId });
    else restoredNodeIds.push(nodeId);
  }
  return { restoredNodeIds, skippedConflicts };
}

function readNodeCandidate(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne<NodeCandidateRow>(
    `SELECT id, created_at, deleted_at, import_source_fingerprint, import_content_fingerprint
     FROM nodes WHERE id = ?`,
    [nodeId]
  );
  return row ? toRestoreNodeCandidate(row) : null;
}

function readMatchingCandidates(driver: DatabaseDriver, target: RestoreNodeCandidate) {
  if (!target.importSourceFingerprint || !target.importContentFingerprint) return [];
  return driver.queryAll<NodeCandidateRow>(
    `SELECT id, created_at, deleted_at, import_source_fingerprint, import_content_fingerprint
     FROM nodes
     WHERE import_source_fingerprint = ? AND import_content_fingerprint = ?`,
    [target.importSourceFingerprint, target.importContentFingerprint]
  ).map(toRestoreNodeCandidate);
}

export function resolveRestoreNodesResult(driver: DatabaseDriver, nodeIds: string[]): RestoreNodesResult {
  const restoredNodeIds: string[] = [];
  const skippedConflicts: RestoreNodeConflict[] = [];

  for (const nodeId of nodeIds) {
    const target = readNodeCandidate(driver, nodeId);
    const result = resolveRestoreNodeCandidates(
      [nodeId],
      target ? [target, ...readMatchingCandidates(driver, target)] : []
    );
    restoredNodeIds.push(...result.restoredNodeIds);
    skippedConflicts.push(...result.skippedConflicts);
  }

  return { restoredNodeIds, skippedConflicts };
}
