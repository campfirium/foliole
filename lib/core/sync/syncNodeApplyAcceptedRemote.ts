import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import {
  repairDirectChildAnchorsForAppliedParent,
  type SyncNodeAnchorRepairRecord,
  type SyncNodeAnchorUnmappedRecord
} from './syncNodeAnchorRepair.js';
import { loadAppliedNodeMutationState, recordAppliedNodeLocalOrigin } from './syncNodeAppliedMutationState.js';
import type { SyncNodeApplyOperation } from './syncNodeApplyRules.js';
import {
  buildRemoteNodeUpdate,
  buildRemoteNodeUpsert,
  buildRemoteNodeVersionUpsert
} from './syncNodeApplyStatements.js';
import { enqueueAppliedNodeSearchInvalidations, type LocalSyncNodeSearchInvalidationState } from './syncNodeSearchInvalidations.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { hashTextBodyContent } from './syncNodeTextBodyBlobs.js';
import { assertSyncNodeTextWithinBudget } from './syncNodeTextBudget.js';
import { hasCompleteTombstoneVersion } from './syncNodeTombstoneVersion.js';
import { validateTopicTextBodies } from './topicTextBodies.js';
import { textAlternativesSchema } from './topicTextState.js';

export interface AcceptedRemoteNodeResult {
  appliedIds: string[];
  anchorRepairRecords: SyncNodeAnchorRepairRecord[];
  unmappedAnchorRecords: SyncNodeAnchorUnmappedRecord[];
}

export interface AcceptedRemoteNodeOptions {
  enqueueSearchInvalidations?: boolean;
}

async function upsertRemoteVersion(port: DbPort, record: NativeSyncNodeRecord) {
  assertSyncNodeTextWithinBudget(record.snapshot);
  if (!record.version_id || !record.host_name || !record.version_created_at) return;
  const incomingBody = record.body_text ?? record.snapshot.content ?? null;
  const [existing] = await port.query<DbRow>(`SELECT object_id, content_hash, host_name, created_at,
    body_text IS NOT NULL AS has_body,
    body_text IS NOT NULL AND ? IS NOT NULL AND body_text IS NOT ? AS body_mismatch
    FROM node_sync_versions WHERE version_id = ?`, [incomingBody, incomingBody, record.version_id]);
  if (existing) {
    if (record.body_text !== null) validateTopicTextBodies(
      textAlternativesSchema.parse(record.snapshot.text_alternatives ?? []), record.alternative_bodies ?? []);
    if (existing.object_id !== record.object_id || existing.content_hash !== record.content_hash ||
        existing.host_name !== record.host_name || existing.created_at !== record.version_created_at ||
        Number(existing.body_mismatch) !== 0) {
      throw new Error(`sync_pack_node_version_immutable_mismatch:${record.version_id}`);
    }
    if (Number(existing.has_body) === 0 && hasCompleteTombstoneVersion(record)) {
      const body = record.body_text!;
      const bodyHash = await hashTextBodyContent(body, {});
      const alternatives = validateTopicTextBodies(record.snapshot.text_alternatives ?? [], record.alternative_bodies ?? []);
      await port.run(
        `UPDATE node_sync_versions SET body_text = ?,
         snapshot_json = json_set(snapshot_json, '$.body_blob_hash', ?, '$.text_alternative_bodies', json(?))
         WHERE version_id = ? AND body_text IS NULL`,
        [body, bodyHash, JSON.stringify(alternatives), record.version_id]
      );
    }
    return;
  }
  const statement = buildRemoteNodeVersionUpsert(record)!;
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
  const preparedHash = preparedTextBodyHashes.get(record);
  if (!record.snapshot.body_blob_hash && !preparedHash) {
    throw new Error('sync_text_body_hash_not_prepared');
  }
  const bodyBlobHash = record.snapshot.body_blob_hash
    ?? preparedHash!;
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
  assertSyncNodeTextWithinBudget(input.record.snapshot);
  const syncState = await loadAppliedNodeMutationState(input.tx, input.record.object_id, input.operation);
  await applyRemoteNode(
    input.tx,
    input.record,
    input.preparedTextBodyHashes,
    input.localNode !== null,
    0
  );
  await recordAppliedNodeLocalOrigin(input.tx, input.record.version_id, input.operation);
  const content = input.record.body_text ?? input.record.snapshot.content;
  if (!input.record.snapshot.deleted_at && typeof content === 'string') {
    const repairResult = await repairDirectChildAnchorsForAppliedParent({
      content,
      excludedNodeIds: input.remoteNodeIdsInBatch,
      parentNodeId: input.record.object_id,
      port: input.tx,
      sourceVersionId: input.record.version_id,
      updatedAt: input.record.snapshot.updated_at
    });
    input.result.anchorRepairRecords.push(...repairResult.repaired);
    input.result.unmappedAnchorRecords.push(...repairResult.unmapped);
  }
  await upsertAppliedNodeSyncState(input.tx, input.record, syncState);
  if (input.options.enqueueSearchInvalidations !== false) {
    await enqueueAppliedNodeSearchInvalidations(input.tx, input.localNode, input.record, input.invalidatedAt);
  }
  input.result.appliedIds.push(input.record.object_id);
}

export { upsertRemoteVersion };
