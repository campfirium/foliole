import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { hasContentEditingSession } from './contentEditingSession.js';
import type { DbPort, DbRow } from './dbPort.js';
import { applyAcceptedRemoteNode, upsertRemoteVersion } from './syncNodeApplyAcceptedRemote.js';
import type { ApplySyncNodesWithDbPortOptions, ApplySyncNodesWithDbPortResult } from './syncNodeApplyExecutor.js';
import { decideIncomingNodeApply, type LocalSyncNodeState, type SyncNodeApplyOperation } from './syncNodeApplyRules.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';
import { hasContentEquivalentIncomingLineage } from './syncNodeLineageEquivalence.js';
import { isIncomingLocalAnchorRepair } from './syncNodeLocalAnchorRepair.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { applyRemoteNodeTombstone, assertKnownDeletionIdentity, loadNodeSyncTombstone, type NodeTombstoneRow } from './syncNodeTombstoneApply.js';

interface LocalSyncNodeStateRow extends DbRow, LocalSyncNodeState {
  parent_id: string | null;
  title: string;
  created_at: string;
}

async function queryOne<T extends DbRow>(port: DbPort, sql: string, params: readonly (string | number | bigint | Uint8Array | null)[] = []) {
  const rows = await port.query<T>(sql, params);
  return rows[0] ?? null;
}

export async function loadLocalNodeSyncState(port: DbPort, nodeId: string) {
  return queryOne<LocalSyncNodeStateRow>(
    port,
    `SELECT current_version_id, deleted_at, parent_id, sync_dirty, title, created_at
     FROM nodes
     WHERE id = ?`,
    [nodeId]
  );
}

async function handleTombstoneGuard(input: {
  options: ApplySyncNodesWithDbPortOptions;
  record: NativeSyncNodeRecord;
  result: Pick<ApplySyncNodesWithDbPortResult, 'appliedIds' | 'tombstoneBlockedIds' | 'workspaceStructureChanged'>;
  tx: DbPort;
  batchTombstone: NodeTombstoneRow | null | undefined;
}) {
  const localTombstone = input.batchTombstone === undefined
    ? await loadNodeSyncTombstone(input.tx, input.record.object_id)
    : input.batchTombstone;
  if (input.record.is_tombstone) {
    if (localTombstone && input.record.version_id === localTombstone.version_id) {
      await assertKnownDeletionIdentity(input.tx, input.record);
      return true;
    }
    if (localTombstone?.parent_version_id && input.record.version_id &&
        await isStoredAncestorVersion(input.tx, input.record.version_id, localTombstone.parent_version_id)) {
      return true;
    }
    if (await applyRemoteNodeTombstone(
      input.tx, input.record, input.options.enqueueSearchInvalidations !== false
    )) {
      input.result.appliedIds.push(input.record.object_id);
      input.result.workspaceStructureChanged = true;
    }
    return true;
  }
  if (localTombstone) {
    input.result.tombstoneBlockedIds.push(input.record.object_id);
    return true;
  }
  return false;
}

async function decideNodeApply(
  port: DbPort,
  localNode: LocalSyncNodeStateRow | null,
  record: NativeSyncNodeRecord,
  operation: SyncNodeApplyOperation | undefined
) {
  if (localNode?.sync_dirty === 0 && localNode.current_version_id && record.version_id
      && record.version_id !== localNode.current_version_id
      && await isStoredAncestorVersion(port, record.version_id, localNode.current_version_id)) {
    return 'skip_stale';
  }
  const decision = decideIncomingNodeApply(localNode, record, operation);
  if (decision === 'block_incoming' && await isIncomingLocalAnchorRepair(port, record)) return 'apply_fast_forward';
  if (decision !== 'record_conflict' || localNode?.sync_dirty !== 0) return decision;
  if (localNode.current_version_id && record.version_id &&
      await isStoredAncestorVersion(port, localNode.current_version_id, record.version_id)) {
    return 'apply_fast_forward';
  }
  if (!await hasContentEquivalentIncomingLineage(port, localNode.current_version_id, record)) {
    return decision;
  }
  return (record.version_id ?? '').localeCompare(localNode.current_version_id ?? '') > 0
    ? 'apply_fast_forward'
    : 'skip_stale';
}

export async function applyIncomingRecord(input: {
  tx: DbPort; record: NativeSyncNodeRecord; result: Omit<ApplySyncNodesWithDbPortResult, 'conflictNodes' | 'conflictRecords'>;
  options: ApplySyncNodesWithDbPortOptions; invalidatedAt: string; remoteNodeIdsInBatch: ReadonlySet<string>;
  preparedTextBodyHash: string | undefined;
  versionAlreadyRetained: boolean;
  batchTombstone: NodeTombstoneRow | null | undefined;
}) {
  const { tx, record, result, options } = input;
  if (await handleTombstoneGuard(input)) return false;
  const localNode = await loadLocalNodeSyncState(tx, record.object_id);
  let decision = await decideNodeApply(tx, localNode, record, options.operation);
  if (record.snapshot.kind === 'topic' && localNode && !localNode.deleted_at &&
      !record.snapshot.deleted_at && hasContentEditingSession(tx, record.object_id) &&
      record.version_id !== localNode.current_version_id) {
    if (options.editingBranch) decision = 'apply_fast_forward';
    else if (!options.operation || options.operation === 'remote_sync') {
      if (!input.versionAlreadyRetained) await upsertRemoteVersion(tx, record);
      return false;
    }
  }
  if (decision === 'apply_missing_local' || decision === 'apply_fast_forward') {
    const preparedTextBodyHashes = new Map<NativeSyncNodeRecord, string>();
    if (input.preparedTextBodyHash) preparedTextBodyHashes.set(record, input.preparedTextBodyHash);
    await applyAcceptedRemoteNode({ ...input, localNode, preparedTextBodyHashes,
      operation: options.operation ?? 'remote_sync' });
    const snapshot = record.snapshot;
    result.workspaceStructureChanged ||= !localNode || localNode.parent_id !== snapshot.parent_id ||
      localNode.title !== snapshot.title || localNode.deleted_at !== snapshot.deleted_at ||
      localNode.created_at !== snapshot.created_at;
    return false;
  }
  if (!input.versionAlreadyRetained) await upsertRemoteVersion(tx, record);
  if (decision === 'already_applied') {
    const stateResult = await upsertAppliedNodeSyncState(tx, record);
    if (stateResult.changes > 0 || options.includeAlreadyApplied) result.appliedIds.push(record.object_id);
  } else if (decision === 'block_incoming') result.blockedIds.push(record.object_id);
  return decision === 'record_conflict';
}
