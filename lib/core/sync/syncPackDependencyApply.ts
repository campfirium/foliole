import type { DbPort } from './dbPort.js';
import type { SyncPackCursor } from './syncPackCursor.js';
import {
  DEPENDENCY_SCOPE_SQL, dependencyScopeParams, type SyncPackDependencyTransfer
} from './syncPackDependencyTransfer.js';
import { assertDirectSyncPackKnownFactClaims, assertStagedSyncPackKnownFactsStillHeld,
  clearSyncPackKnownFactClaims } from './syncPackKnownFactClaims.js';
import { SYNC_PACK_NODE_VERSION_COLUMNS } from './syncPackNodeVersions.js';

const TABLE_COLUMNS = {
  node_sync_versions: SYNC_PACK_NODE_VERSION_COLUMNS,
  node_sync_version_parents: ['version_id', 'parent_version_id', 'ordinal'],
  review_log: ['id', 'op_id', 'host_name', 'node_id', 'grade', 'scheduler_version', 'reviewed_at',
    'due_before', 'stability_before', 'difficulty_before', 'due_after', 'stability_after', 'difficulty_after']
} as const;

export async function prepareSyncPackDependencies(port: DbPort, args: {
  cursor: SyncPackCursor; groupId: string; peerId: string; incomingAlias: string;
}) {
  if (args.cursor.dependencyTransfers) {
    await materializeSyncPackDependencies(port, args);
    return null;
  }
  const held = await assertDirectSyncPackKnownFactClaims(port, { groupId: args.groupId,
    peerId: args.peerId, ...(args.cursor.packId ? { packId: args.cursor.packId } : {}),
    fromStateSeq: args.cursor.fromStateSeq, toStateSeq: args.cursor.toStateSeq,
    frontierStateSeq: args.cursor.frontierStateSeq, sourceEpoch: args.cursor.sourceEpoch });
  return held ? { groupId: args.groupId, peerId: args.peerId,
    sourceViewId: args.cursor.packId! } : null;
}

/** Must run inside the business apply transaction; inc is a disposable SQLite cache. */
export async function materializeSyncPackDependencies(port: DbPort, args: {
  cursor: SyncPackCursor;
  incomingAlias: string;
  groupId: string;
  peerId: string;
}) {
  const alias = `"${args.incomingAlias.replaceAll('"', '""')}"`;
  for (const viewId of new Set(args.cursor.dependencyTransfers?.map((transfer) => transfer.sourceViewId))) {
    await assertStagedSyncPackKnownFactsStillHeld(port, { groupId: args.groupId,
      peerId: args.peerId, sourceViewId: viewId });
  }
  for (const transfer of args.cursor.dependencyTransfers ?? []) {
    await assertReadyTransfer(port, transfer, args, alias);
    for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
      await port.run(`INSERT INTO ${alias}.${table} (${columns.join(', ')})
        SELECT ${columns.map((column) => `json_extract(payload_json, '$.${column}')`).join(', ')}
        FROM main.sync_pack_dependency_rows WHERE ${DEPENDENCY_SCOPE_SQL} AND table_name = ?
        ORDER BY row_index`, [...dependencyScopeParams(transfer), table]);
    }
  }
}

export async function clearAppliedSyncPackDependencies(port: DbPort,
  transfers: readonly SyncPackDependencyTransfer[] = []) {
  for (const transfer of transfers) {
    const params = dependencyScopeParams(transfer);
    await port.run(`DELETE FROM sync_pack_dependency_rows WHERE ${DEPENDENCY_SCOPE_SQL}`, params);
    await port.run(`DELETE FROM sync_pack_dependency_transfers WHERE ${DEPENDENCY_SCOPE_SQL}`, params);
    await clearSyncPackKnownFactClaims(port, { groupId: transfer.groupId,
      peerId: transfer.peerId, sourceViewId: transfer.sourceViewId });
  }
}

async function assertReadyTransfer(port: DbPort, transfer: SyncPackDependencyTransfer,
  args: { cursor: SyncPackCursor; groupId: string; peerId: string }, alias: string) {
  const cursor = args.cursor;
  if (transfer.groupId !== args.groupId || transfer.peerId !== args.peerId ||
      transfer.sourceEpoch !== cursor.sourceEpoch || transfer.fromStateSeq !== cursor.fromStateSeq ||
      transfer.frontierStateSeq !== cursor.frontierStateSeq) {
    throw new Error('sync_pack_dependency_apply_scope_mismatch');
  }
  const [object] = await port.query<{ state_seq: number }>(
    `SELECT state_seq FROM ${alias}.sync_object_state WHERE object_type = ? AND object_id = ?`,
    [transfer.objectType, transfer.objectId]);
  if (object?.state_seq !== transfer.objectStateSeq) {
    throw new Error('sync_pack_dependency_apply_object_mismatch');
  }
  if (transfer.nodeIds) {
    const nodes = await port.query<{ id: string }>(`WITH RECURSIVE ancestors(id, parent_id) AS (
      SELECT id, parent_id FROM ${alias}.nodes WHERE id = ?
      UNION SELECT coalesce(incoming.id, existing.id),
        CASE WHEN incoming.id IS NOT NULL THEN incoming.parent_id ELSE existing.parent_id END
        FROM ancestors child
        LEFT JOIN ${alias}.nodes incoming ON incoming.id = child.parent_id
        LEFT JOIN main.nodes existing ON existing.id = child.parent_id
        WHERE child.parent_id IS NOT NULL AND coalesce(incoming.id, existing.id) IS NOT NULL
    ) SELECT id FROM ancestors LIMIT 129`, [transfer.objectId]);
    if (nodes.length !== transfer.nodeIds.length ||
        nodes.some((node) => !transfer.nodeIds!.includes(node.id))) {
      throw new Error('sync_pack_dependency_apply_ancestry_mismatch');
    }
  }
  if (transfer.expectedRows === 0) return;
  const [ready] = await port.query(
    `SELECT 1 AS ready FROM sync_pack_dependency_transfers WHERE ${DEPENDENCY_SCOPE_SQL}
     AND source_epoch = ? AND from_state_seq = ? AND object_state_seq = ? AND frontier_state_seq = ?
     AND expected_rows = ? AND expected_digest = ? AND next_row = expected_rows
     AND received_digest = expected_digest AND completed = 1`,
    [...dependencyScopeParams(transfer), transfer.sourceEpoch, transfer.fromStateSeq, transfer.objectStateSeq,
      transfer.frontierStateSeq, transfer.expectedRows, transfer.expectedDigest]);
  const [count] = await port.query<{ count: number }>(
    `SELECT count(*) AS count FROM sync_pack_dependency_rows WHERE ${DEPENDENCY_SCOPE_SQL}`,
    dependencyScopeParams(transfer));
  if (!ready || count?.count !== transfer.expectedRows) throw new Error('sync_pack_dependencies_incomplete');
}
