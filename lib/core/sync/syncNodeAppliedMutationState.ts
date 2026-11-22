import type { DbPort } from './dbPort.js';
import type { DbStatement } from './dbStatements.js';
import type { SyncNodeApplyOperation } from './syncNodeApplyRules.js';

function isLocalMutation(operation?: SyncNodeApplyOperation) {
  return operation === 'local_mutation' || operation === 'local_restore';
}

/** Capture the previous baseline before the selected version replaces current state. */
export async function loadAppliedNodeMutationState(db: DbPort, nodeId: string, operation?: SyncNodeApplyOperation) {
  if (!isLocalMutation(operation)) return { baseContentHash: null, syncDirty: 0 };
  const [previous] = await db.query<{ base_content_hash: string | null; content_hash: string; sync_dirty: number }>(
    `SELECT base_content_hash, content_hash, sync_dirty FROM sync_object_state
     WHERE object_type = 'node' AND object_id = ?`, [nodeId]);
  const baseContentHash = previous ? (previous.sync_dirty === 1
    ? previous.base_content_hash ?? previous.content_hash : previous.content_hash) : null;
  return { baseContentHash, syncDirty: 1 };
}

/** Marks a version as created on this host and advances the local proof revision. */
export function localOriginStatements(versionId: string | null): DbStatement[] {
  if (!versionId) return [];
  return [{ sql: 'INSERT OR IGNORE INTO node_version_local_origins (version_id) VALUES (?)', params: [versionId] },
    { sql: 'UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1 WHERE singleton_id = 1' }];
}

export async function recordAppliedNodeLocalOrigin(db: DbPort, versionId: string | null,
  operation?: SyncNodeApplyOperation) {
  if (!isLocalMutation(operation)) return;
  for (const statement of localOriginStatements(versionId)) await db.run(statement.sql, statement.params);
}
