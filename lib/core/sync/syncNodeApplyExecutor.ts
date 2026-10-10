import type {
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord
} from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import type { SyncNodeAnchorRepairRecord, SyncNodeAnchorUnmappedRecord } from './syncNodeAnchorRepair.js';
import {
  applyAcceptedRemoteNode,
  upsertRemoteVersion
} from './syncNodeApplyAcceptedRemote.js';
import {
  decideIncomingNodeApply,
  latestBranchHeadRecords,
  orderNodesForApply,
  type LocalSyncNodeState,
  type SyncNodeApplyOperation
} from './syncNodeApplyRules.js';
import { toSyncNodeConflictRecord } from './syncNodeConflictRecord.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';
import { hasContentEquivalentIncomingLineage } from './syncNodeLineageEquivalence.js';
import { prepareSyncNodeTextBodyHashes } from './syncNodePreparedTextBodyHashes.js';
import { arraySyncNodeRecordSource, type SyncNodeRecordMetadata, type SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { applyRemoteNodeTombstone, loadNodeSyncTombstone } from './syncNodeTombstoneApply.js';
import { prepareIncomingNodeVersionSource, retainIncomingNodeVersionSource } from './syncNodeVersionHistory.js';
import { pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';

interface LocalSyncNodeStateRow extends DbRow, LocalSyncNodeState {
  parent_id: string | null;
  title: string;
}

export interface ApplySyncNodesWithDbPortResult {
  appliedIds: string[];
  anchorRepairRecords: SyncNodeAnchorRepairRecord[];
  blockedIds: string[];
  conflictRecords: NativeSyncNodeConflictRecord[];
  conflictNodes: NativeSyncNodeRecord[];
  skippedConflictCopyIds: string[];
  tombstoneBlockedIds: string[];
  unmappedAnchorRecords: SyncNodeAnchorUnmappedRecord[];
}

export interface ApplySyncNodesWithDbPortOptions {
  enqueueSearchInvalidations?: boolean;
  hashTextBody?: (content: string) => Promise<string> | string;
  includeAlreadyApplied?: boolean;
  operation?: SyncNodeApplyOperation;
}

function assertLocalRestoreApplied(
  operation: SyncNodeApplyOperation | undefined,
  appliedCount: number,
  expectedCount: number
) {
  if (operation === 'local_restore' && appliedCount !== expectedCount) {
    throw new Error('local_restore_not_applied');
  }
}

async function assertLocalRestoreCanApply(
  port: DbPort,
  operation: SyncNodeApplyOperation | undefined,
  records: readonly SyncNodeRecordMetadata[]
) {
  if (operation !== 'local_restore') return;
  for (const record of records) {
    const localNode = await loadLocalNodeSyncState(port, record.object_id);
    const decision = decideIncomingNodeApply(localNode, record, operation);
    if (decision === 'block_incoming' || decision === 'record_conflict') {
      throw new Error('local_restore_not_applied');
    }
  }
}

async function queryOne<T extends DbRow>(port: DbPort, sql: string, params: readonly (string | number | bigint | Uint8Array | null)[] = []) {
  const rows = await port.query<T>(sql, params);
  return rows[0] ?? null;
}

async function loadLocalNodeSyncState(port: DbPort, nodeId: string) {
  return queryOne<LocalSyncNodeStateRow>(
    port,
    `SELECT current_version_id, deleted_at, parent_id, sync_dirty, title
     FROM nodes
     WHERE id = ?`,
    [nodeId]
  );
}

async function handleTombstoneGuard(input: {
  options: ApplySyncNodesWithDbPortOptions;
  record: NativeSyncNodeRecord;
  result: Pick<ApplySyncNodesWithDbPortResult, 'appliedIds' | 'tombstoneBlockedIds'>;
  tx: DbPort;
}) {
  const localTombstone = await loadNodeSyncTombstone(input.tx, input.record.object_id);
  if (input.record.is_tombstone) {
    if (await applyRemoteNodeTombstone(
      input.tx, input.record, input.options.enqueueSearchInvalidations !== false
    )) {
      input.result.appliedIds.push(input.record.object_id);
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

export async function applySyncNodesWithDbPort(
  port: DbPort,
  records: NativeSyncNodeRecord[],
  options: ApplySyncNodesWithDbPortOptions = {}
): Promise<ApplySyncNodesWithDbPortResult> {
  const result = await applySyncNodeSourceWithDbPort(port, arraySyncNodeRecordSource(records), options);
  return { ...result, conflictRecords: result.conflictNodes.map(toSyncNodeConflictRecord) };
}

export type ApplySyncNodeSourceResult<M extends SyncNodeRecordMetadata> =
  Omit<ApplySyncNodesWithDbPortResult, 'conflictNodes' | 'conflictRecords'> & { conflictNodes: M[] };

export async function applySyncNodeSourceWithDbPort<M extends SyncNodeRecordMetadata>(
  port: DbPort, source: SyncNodeRecordSource<M>, options: ApplySyncNodesWithDbPortOptions = {}
): Promise<ApplySyncNodeSourceResult<M>> {
  const result: ApplySyncNodeSourceResult<M> = {
    appliedIds: [], anchorRepairRecords: [], blockedIds: [], conflictNodes: [],
    skippedConflictCopyIds: [], tombstoneBlockedIds: [], unmappedAnchorRecords: []
  };
  const ordered = orderNodesForApply(latestBranchHeadRecords(source.records.filter((record) => !source.isIdentityOnly(record))));
  const remoteNodeIdsInBatch = new Set(ordered.map((record) => record.object_id));
  const invalidatedAt = new Date().toISOString();
  await assertLocalRestoreCanApply(port, options.operation, ordered);
  const preparedHashes = new Map<M, string>();
  for (const metadata of ordered) {
    const record = await source.load(port, metadata);
    const hash = (await prepareSyncNodeTextBodyHashes([record], options)).get(record);
    if (hash) preparedHashes.set(metadata, hash);
  }
  await port.transaction(async (tx) => {
    const history = await prepareIncomingNodeVersionSource(tx, source);
    await retainIncomingNodeVersionSource(tx, source, history);
    for (const metadata of ordered) {
      const record = await source.load(tx, metadata);
      if (await applyIncomingRecord({ tx, record, result, options, invalidatedAt, remoteNodeIdsInBatch,
        preparedTextBodyHash: preparedHashes.get(metadata) })) {
        result.conflictNodes.push(metadata);
      }
    }
    assertLocalRestoreApplied(options.operation, result.appliedIds.length, ordered.length);
    if (result.appliedIds.length > 0) await pruneLearningRowsWithoutVisibleNodes(tx);
  });
  return result;
}

async function applyIncomingRecord(input: {
  tx: DbPort; record: NativeSyncNodeRecord; result: Omit<ApplySyncNodesWithDbPortResult, 'conflictNodes' | 'conflictRecords'>;
  options: ApplySyncNodesWithDbPortOptions; invalidatedAt: string; remoteNodeIdsInBatch: ReadonlySet<string>;
  preparedTextBodyHash: string | undefined;
}) {
  const { tx, record, result, options } = input;
  if (await handleTombstoneGuard({ options, record, result, tx })) return false;
  const localNode = await loadLocalNodeSyncState(tx, record.object_id);
  const decision = await decideNodeApply(tx, localNode, record, options.operation);
  if (decision === 'apply_missing_local' || decision === 'apply_fast_forward') {
    const preparedTextBodyHashes = new Map<NativeSyncNodeRecord, string>();
    if (input.preparedTextBodyHash) preparedTextBodyHashes.set(record, input.preparedTextBodyHash);
    await applyAcceptedRemoteNode({ ...input, localNode, preparedTextBodyHashes,
      operation: options.operation ?? 'remote_sync' });
    return false;
  }
  await upsertRemoteVersion(tx, record);
  if (decision === 'already_applied') {
    const stateResult = await upsertAppliedNodeSyncState(tx, record);
    if (stateResult.changes > 0 || options.includeAlreadyApplied) result.appliedIds.push(record.object_id);
  } else if (decision === 'block_incoming') result.blockedIds.push(record.object_id);
  return decision === 'record_conflict';
}
