import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import {
  repairDirectChildAnchorsForAppliedParent,
  type SyncNodeAnchorRepairRecord,
  type SyncNodeAnchorUnmappedRecord
} from './syncNodeAnchorRepair.js';
import type { SyncNodeApplyOperation } from './syncNodeApplyRules.js';
import {
  buildRemoteNodeUpdate,
  buildRemoteNodeUpsert,
  buildRemoteNodeVersionUpsert
} from './syncNodeApplyStatements.js';
import { enqueueAppliedNodeSearchInvalidations, type LocalSyncNodeSearchInvalidationState } from './syncNodeSearchInvalidations.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { hashTextBodyContent, upsertTextBodyBlob } from './syncNodeTextBodyBlobs.js';
import { hasCompleteTombstoneVersion } from './syncNodeTombstoneVersion.js';
import { retainTopicTextBodies } from './topicTextBodies.js';

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
  if (record.body_text !== null) await retainTopicTextBodies(port, record);
  const [existing] = await port.query<DbRow>('SELECT * FROM node_sync_versions WHERE version_id = ?', [record.version_id]);
  if (existing) {
    const incomingBody = record.body_text ?? record.snapshot.content;
    if (existing.object_id !== record.object_id || existing.content_hash !== record.content_hash ||
        existing.host_name !== record.host_name || existing.created_at !== record.version_created_at ||
        (existing.body_text !== null && incomingBody !== null && existing.body_text !== incomingBody)) {
      throw new Error(`sync_pack_node_version_immutable_mismatch:${record.version_id}`);
    }
    if (existing.body_text === null && hasCompleteTombstoneVersion(record)) {
      const body = record.body_text!;
      const bodyHash = await hashTextBodyContent(body, {});
      await port.run(
        `UPDATE node_sync_versions SET body_text = ?,
         snapshot_json = json_set(snapshot_json, '$.body_blob_hash', ?)
         WHERE version_id = ? AND body_text IS NULL`,
        [body, bodyHash, record.version_id]
      );
    }
    return;
  }
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
  preparedTextBodyHashes: ReadonlyMap<NativeSyncNodeRecord, string>,
  nodeExists: boolean,
  syncDirty: number
) {
  const content = record.snapshot.content ?? '';
  const preparedHash = preparedTextBodyHashes.get(record);
  if (!record.snapshot.body_blob_hash && !preparedHash) {
    throw new Error('sync_text_body_hash_not_prepared');
  }
  const bodyBlobHash = record.snapshot.body_blob_hash
    ?? await upsertTextBodyBlob(port, content, record.snapshot.updated_at, preparedHash!);
  const statement = nodeExists
    ? buildRemoteNodeUpdate(record, bodyBlobHash, syncDirty)
    : buildRemoteNodeUpsert(record, bodyBlobHash, syncDirty);
  await port.run(statement.sql, statement.params);
}

async function applyRemoteNode(
  port: DbPort,
  record: NativeSyncNodeRecord,
  preparedTextBodyHashes: ReadonlyMap<NativeSyncNodeRecord, string>,
  nodeExists: boolean,
  syncDirty: number
) {
  await upsertRemoteNode(port, record, preparedTextBodyHashes, nodeExists, syncDirty);
  await upsertRemoteVersion(port, record);
}

export async function applyAcceptedRemoteNode(input: {
  invalidatedAt: string;
  localNode: LocalSyncNodeSearchInvalidationState | null;
  operation?: SyncNodeApplyOperation;
  options: AcceptedRemoteNodeOptions;
  preparedTextBodyHashes: ReadonlyMap<NativeSyncNodeRecord, string>;
  record: NativeSyncNodeRecord;
  remoteNodeIdsInBatch: ReadonlySet<string>;
  result: AcceptedRemoteNodeResult;
  tx: DbPort;
}) {
  const localMutation = input.operation === 'local_mutation' || input.operation === 'local_restore';
  const previousState = localMutation
    ? await queryOne<{ base_content_hash: string | null; content_hash: string; sync_dirty: number }>(
      input.tx,
      `SELECT base_content_hash, content_hash, sync_dirty FROM sync_object_state
       WHERE object_type = 'node' AND object_id = ?`,
      [input.record.object_id]
    )
    : null;
  const baseContentHash = previousState
    ? (previousState.sync_dirty === 1
      ? previousState.base_content_hash ?? previousState.content_hash
      : previousState.content_hash)
    : null;
  await applyRemoteNode(
    input.tx,
    input.record,
    input.preparedTextBodyHashes,
    input.localNode !== null,
    0
  );
  if (localMutation && input.record.version_id) {
    await input.tx.run('INSERT OR IGNORE INTO node_version_local_origins (version_id) VALUES (?)', [input.record.version_id]);
    await input.tx.run('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1 WHERE singleton_id = 1');
  }
  if (!input.record.snapshot.deleted_at && typeof input.record.snapshot.content === 'string') {
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
  await upsertAppliedNodeSyncState(input.tx, input.record, {
    baseContentHash,
    syncDirty: localMutation ? 1 : 0
  });
  if (input.options.enqueueSearchInvalidations !== false) {
    await enqueueAppliedNodeSearchInvalidations(input.tx, input.localNode, input.record, input.invalidatedAt);
  }
  input.result.appliedIds.push(input.record.object_id);
}

export { upsertRemoteVersion };
