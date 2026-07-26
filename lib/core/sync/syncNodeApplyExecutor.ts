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
import { prepareSyncNodeTextBodyHashes } from './syncNodePreparedTextBodyHashes.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { applyRemoteNodeTombstone, loadNodeSyncTombstone } from './syncNodeTombstoneApply.js';
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
  record: NativeSyncNodeRecord;
  result: ApplySyncNodesWithDbPortResult;
  tx: DbPort;
}) {
  const localTombstone = await loadNodeSyncTombstone(input.tx, input.record.object_id);
  if (input.record.is_tombstone) {
    if (await applyRemoteNodeTombstone(input.tx, input.record)) {
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

export async function applySyncNodesWithDbPort(
  port: DbPort,
  records: NativeSyncNodeRecord[],
  options: ApplySyncNodesWithDbPortOptions = {}
): Promise<ApplySyncNodesWithDbPortResult> {
  const result: ApplySyncNodesWithDbPortResult = {
    appliedIds: [],
    anchorRepairRecords: [],
    blockedIds: [],
    conflictRecords: [],
    conflictNodes: [],
    skippedConflictCopyIds: [],
    tombstoneBlockedIds: [],
    unmappedAnchorRecords: []
  };
  const ordered = orderNodesForApply(latestBranchHeadRecords(records));
  const remoteNodeIdsInBatch = new Set(ordered.map((record) => record.object_id));
  const preparedTextBodyHashes = await prepareSyncNodeTextBodyHashes(ordered, options);
  const invalidatedAt = new Date().toISOString();

  await port.transaction(async (tx) => {
    for (const record of ordered) {
      if (await handleTombstoneGuard({ record, result, tx })) {
        continue;
      }
      const localNode = await loadLocalNodeSyncState(tx, record.object_id);
      const decision = decideIncomingNodeApply(localNode, record, options.operation);
      if (decision === 'apply_missing_local' || decision === 'apply_fast_forward') {
        await applyAcceptedRemoteNode({ invalidatedAt, localNode, options, preparedTextBodyHashes, record, remoteNodeIdsInBatch, result, tx });
        continue;
      }
      await upsertRemoteVersion(tx, record);
      if (decision === 'already_applied') {
        await upsertAppliedNodeSyncState(tx, record);
        if (options.includeAlreadyApplied) {
          result.appliedIds.push(record.object_id);
        }
        continue;
      }
      if (decision === 'block_incoming') {
        result.blockedIds.push(record.object_id);
        continue;
      }
      result.conflictRecords.push(toSyncNodeConflictRecord(record));
      result.conflictNodes.push(record);
    }
    assertLocalRestoreApplied(options.operation, result.appliedIds.length, ordered.length);
    if (result.appliedIds.length > 0) {
      await pruneLearningRowsWithoutVisibleNodes(tx);
    }
  });

  return result;
}
