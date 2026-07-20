import type {
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord
} from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import {
  repairDirectChildAnchorsForAppliedParent,
  type SyncNodeAnchorRepairRecord,
  type SyncNodeAnchorUnmappedRecord
} from './syncNodeAnchorRepair.js';
import {
  decideIncomingNodeApply,
  isConflictCopyNodeId,
  latestBranchHeadRecords,
  orderNodesForApply,
  type LocalSyncNodeState,
  type SyncNodeApplyOperation
} from './syncNodeApplyRules.js';
import {
  buildAttachmentExistsQuery,
  buildNodeAttachmentDelete,
  buildNodeAttachmentInsert,
  buildNodeOrderReplace,
  buildRemoteNodeUpsert,
  buildRemoteNodeVersionUpsert
} from './syncNodeApplyStatements.js';
import { toSyncNodeConflictRecord } from './syncNodeConflictRecord.js';
import { prepareSyncNodeTextBodyHashes } from './syncNodePreparedTextBodyHashes.js';
import { enqueueAppliedNodeSearchInvalidations } from './syncNodeSearchInvalidations.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { upsertTextBodyBlob } from './syncNodeTextBodyBlobs.js';
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

async function upsertRemoteVersion(port: DbPort, record: NativeSyncNodeRecord) {
  const statement = buildRemoteNodeVersionUpsert(record);
  if (!statement) return;
  await port.run(statement.sql, statement.params);
}

async function upsertRemoteNode(
  port: DbPort,
  record: NativeSyncNodeRecord,
  preparedTextBodyHashes: ReadonlyMap<NativeSyncNodeRecord, string>
) {
  const content = record.snapshot.content ?? '';
  const preparedHash = preparedTextBodyHashes.get(record);
  if (!record.snapshot.body_blob_hash && !preparedHash) {
    throw new Error('sync_text_body_hash_not_prepared');
  }
  const bodyBlobHash = record.snapshot.body_blob_hash
    ?? await upsertTextBodyBlob(port, content, record.snapshot.updated_at, preparedHash!);
  const statement = buildRemoteNodeUpsert(record, bodyBlobHash);
  await port.run(statement.sql, statement.params);
}

async function replaceNodeOrder(port: DbPort, record: NativeSyncNodeRecord) {
  const statement = buildNodeOrderReplace(record);
  await port.run(statement.sql, statement.params);
}

async function replaceNodeAttachmentLinks(port: DbPort, record: NativeSyncNodeRecord) {
  const deleteStatement = buildNodeAttachmentDelete(record);
  await port.run(deleteStatement.sql, deleteStatement.params);
  for (const attachment of record.snapshot.attachments) {
    const existsQuery = buildAttachmentExistsQuery(attachment.attachment_id);
    const existing = await queryOne(port, existsQuery.sql, existsQuery.params);
    if (!existing) continue;
    const insertStatement = buildNodeAttachmentInsert(record, attachment);
    await port.run(insertStatement.sql, insertStatement.params);
  }
}

async function applyRemoteNode(
  port: DbPort,
  record: NativeSyncNodeRecord,
  preparedTextBodyHashes: ReadonlyMap<NativeSyncNodeRecord, string>
) {
  await upsertRemoteNode(port, record, preparedTextBodyHashes);
  await upsertRemoteVersion(port, record);
  await replaceNodeOrder(port, record);
  await replaceNodeAttachmentLinks(port, record);
}

async function applyAcceptedRemoteNode(input: {
  invalidatedAt: string;
  localNode: LocalSyncNodeStateRow | null;
  options: ApplySyncNodesWithDbPortOptions;
  preparedTextBodyHashes: ReadonlyMap<NativeSyncNodeRecord, string>;
  record: NativeSyncNodeRecord;
  result: ApplySyncNodesWithDbPortResult;
  tx: DbPort;
}) {
  await applyRemoteNode(input.tx, input.record, input.preparedTextBodyHashes);
  if (!input.record.snapshot.deleted_at && input.record.snapshot.content !== undefined) {
    const repairResult = await repairDirectChildAnchorsForAppliedParent({
      content: input.record.snapshot.content,
      parentNodeId: input.record.object_id,
      port: input.tx,
      updatedAt: input.record.snapshot.updated_at
    });
    input.result.anchorRepairRecords.push(...repairResult.repaired);
    input.result.unmappedAnchorRecords.push(...repairResult.unmapped);
  }
  await upsertAppliedNodeSyncState(input.tx, input.record);
  if (input.options.enqueueSearchInvalidations !== false) {
    await enqueueAppliedNodeSearchInvalidations(input.tx, input.localNode, input.record, input.invalidatedAt);
  }
  input.result.appliedIds.push(input.record.object_id);
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
  const preparedTextBodyHashes = await prepareSyncNodeTextBodyHashes(ordered, options);
  const invalidatedAt = new Date().toISOString();

  await port.transaction(async (tx) => {
    for (const record of ordered) {
      if (isConflictCopyNodeId(record.object_id) || isConflictCopyNodeId(record.snapshot.id)) {
        result.skippedConflictCopyIds.push(record.object_id);
        continue;
      }
      if (await handleTombstoneGuard({ record, result, tx })) {
        continue;
      }
      const localNode = await loadLocalNodeSyncState(tx, record.object_id);
      const decision = decideIncomingNodeApply(localNode, record, options.operation);
      if (decision === 'apply_missing_local' || decision === 'apply_fast_forward') {
        await applyAcceptedRemoteNode({ invalidatedAt, localNode, options, preparedTextBodyHashes, record, result, tx });
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
