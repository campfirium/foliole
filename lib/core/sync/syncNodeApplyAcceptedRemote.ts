import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import {
  repairDirectChildAnchorsForAppliedParent,
  type SyncNodeAnchorRepairRecord,
  type SyncNodeAnchorUnmappedRecord
} from './syncNodeAnchorRepair.js';
import {
  buildAttachmentExistsQuery,
  buildNodeAttachmentDelete,
  buildNodeAttachmentInsert,
  buildNodeOrderReplace,
  buildRemoteNodeUpsert,
  buildRemoteNodeVersionUpsert
} from './syncNodeApplyStatements.js';
import { enqueueAppliedNodeSearchInvalidations, type LocalSyncNodeSearchInvalidationState } from './syncNodeSearchInvalidations.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { upsertTextBodyBlob } from './syncNodeTextBodyBlobs.js';

export interface AcceptedRemoteNodeResult {
  appliedIds: string[];
  anchorRepairRecords: SyncNodeAnchorRepairRecord[];
  unmappedAnchorRecords: SyncNodeAnchorUnmappedRecord[];
}

export interface AcceptedRemoteNodeOptions {
  enqueueSearchInvalidations?: boolean;
}

async function queryOne<T extends DbRow>(port: DbPort, sql: string, params: readonly (string | number | bigint | Uint8Array | null)[] = []) {
  const rows = await port.query<T>(sql, params);
  return rows[0] ?? null;
}

async function upsertRemoteVersion(port: DbPort, record: NativeSyncNodeRecord) {
  const statement = buildRemoteNodeVersionUpsert(record);
  if (!statement) return;
  await port.run(statement.sql, statement.params);
  const parentIds = record.parent_version_ids
    ?? (record.parent_version_id ? [record.parent_version_id] : []);
  for (const [ordinal, parentId] of parentIds.entries()) {
    await port.run(
      `INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal)
       VALUES (?, ?, ?)
       ON CONFLICT(version_id, parent_version_id) DO NOTHING`,
      [record.version_id, parentId, ordinal]
    );
  }
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

export async function applyAcceptedRemoteNode(input: {
  invalidatedAt: string;
  localNode: LocalSyncNodeSearchInvalidationState | null;
  options: AcceptedRemoteNodeOptions;
  preparedTextBodyHashes: ReadonlyMap<NativeSyncNodeRecord, string>;
  record: NativeSyncNodeRecord;
  remoteNodeIdsInBatch: ReadonlySet<string>;
  result: AcceptedRemoteNodeResult;
  tx: DbPort;
}) {
  await applyRemoteNode(input.tx, input.record, input.preparedTextBodyHashes);
  if (!input.record.snapshot.deleted_at && input.record.snapshot.content !== undefined) {
    const repairResult = await repairDirectChildAnchorsForAppliedParent({
      content: input.record.snapshot.content,
      excludedNodeIds: input.remoteNodeIdsInBatch,
      parentNodeId: input.record.object_id,
      port: input.tx,
      sourceVersionId: input.record.version_id,
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

export { upsertRemoteVersion };
