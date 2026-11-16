import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { initializeReceivedReviewSchedule } from '../database/initialReviewSchedule.js';
import { recomputeNodeReviewWithDb } from '../database/reviewProjection.js';

import type { DbPort } from './dbPort.js';
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
import { compactDeletedVersionIdentity, deletedVersionMetadataDigest, isSyncNodeSnapshotIdentical } from './syncNodeSnapshotIdentity.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { assertSyncNodeTextWithinBudget } from './syncNodeTextBudget.js';
import { applyStoredNodeVersionBodyState, STORED_NODE_VERSION_BODY_REPAIR_COLUMNS, storeRetiredNodeBodyHash,
  type StoredNodeVersionBodyRepairState } from './syncNodeVersionBodyState.js';
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

type StoredVersionIdentity = StoredNodeVersionBodyRepairState & { object_id: string; content_hash: string; host_name: string; created_at: string;
  snapshot_json: string; body_text: string | null };

/** One read of the stored identities of versions about to be retained; absent ids are new versions. */
export async function loadStoredVersionIdentities(port: DbPort, versionIds: readonly string[]) {
  if (!versionIds.length) return new Map<string, StoredVersionIdentity>();
  const rows = await port.query<StoredVersionIdentity & { version_id: string }>(`SELECT version_id, object_id, content_hash,
    host_name, created_at, snapshot_json, body_text, ${STORED_NODE_VERSION_BODY_REPAIR_COLUMNS} FROM node_sync_versions
    WHERE version_id IN (SELECT value FROM json_each(?))`, [JSON.stringify(versionIds)]);
  return new Map(rows.map(({ version_id: id, ...row }) => [id, row]));
}

async function storedVersion(port: DbPort, record: NativeSyncNodeRecord, incomingBody: string | null,
  known?: StoredVersionIdentity | null) {
  if (known === undefined) {
    const [row] = await port.query<Omit<StoredVersionIdentity, 'body_text'> & { body_mismatch: number }>(
      `SELECT object_id, content_hash, host_name, created_at, snapshot_json, ${STORED_NODE_VERSION_BODY_REPAIR_COLUMNS},
      body_text IS NOT NULL AND ? IS NOT NULL AND body_text IS NOT ? AS body_mismatch
      FROM node_sync_versions WHERE version_id = ?`, [incomingBody, incomingBody, record.version_id]);
    return row;
  }
  if (known === null) return undefined;
  return { ...known, body_mismatch: known.body_text !== null && incomingBody !== null && known.body_text !== incomingBody ? 1 : 0 };
}

async function upsertRemoteVersion(port: DbPort, record: NativeSyncNodeRecord, deferBodyRetirement = false,
  known?: StoredVersionIdentity | null, compactSnapshot?: string) {
  assertSyncNodeTextWithinBudget(record.snapshot);
  if (!record.version_id || !record.host_name || !record.version_created_at) return null;
  const incomingBody = record.body_text ?? record.snapshot.content ?? null;
  const existing = await storedVersion(port, record, incomingBody, known);
  if (existing) {
    const digest = typeof existing.snapshot_json === 'string' ? compactDeletedVersionIdentity(existing.snapshot_json) : null;
    const [deleted] = digest ? await port.query(`SELECT 1 FROM node_sync_tombstones WHERE node_id = ?
      AND NOT EXISTS (SELECT 1 FROM nodes WHERE id = ?)`, [record.object_id, record.object_id]) : [];
    const incomingDigest = record.snapshot.deleted_version_metadata_digest;
    const compactMatches = digest
      ? Boolean(deleted && digest === (incomingDigest ?? deletedVersionMetadataDigest(record.snapshot)))
      : Boolean(incomingDigest && typeof existing.snapshot_json === 'string' &&
        incomingDigest === deletedVersionMetadataDigest(JSON.parse(existing.snapshot_json)));
    if (record.body_text !== null) validateTopicTextBodies(
      textAlternativesSchema.parse(record.snapshot.text_alternatives ?? []), record.alternative_bodies ?? []);
    if (existing.object_id !== record.object_id || existing.content_hash !== record.content_hash ||
        existing.host_name !== record.host_name || existing.created_at !== record.version_created_at ||
        Number(existing.body_mismatch) !== 0 || typeof existing.snapshot_json !== 'string' ||
        !((digest || incomingDigest) ? compactMatches : isSyncNodeSnapshotIdentical(existing.snapshot_json, record.snapshot))) {
      throw new Error(`sync_pack_node_version_immutable_mismatch:${record.version_id}`);
    }
    if (compactMatches) {
      await retainVersionParents(port, record);
      return null;
    }
    if (existing.retired_hash_missing && record.snapshot.kind === 'topic' &&
        record.snapshot.body_deleted === true && record.snapshot.body_blob_hash) {
      await storeRetiredNodeBodyHash(port, record.version_id, record.snapshot.body_blob_hash);
    }
    if (!deferBodyRetirement || record.snapshot.kind !== 'topic' || record.snapshot.body_deleted !== true) {
      await applyStoredNodeVersionBodyState(port, record, existing);
    }
    await retainVersionParents(port, record);
    // Retirement can depend on which version is current when it runs.
    return record.snapshot.body_deleted === true ? null : 'complete';
  }
  const statement = buildRemoteNodeVersionUpsert(record, undefined, compactSnapshot)!;
  const inserted = await port.run(statement.sql, statement.params);
  if (compactSnapshot !== undefined && inserted.changes !== 1) {
    throw new Error(`request_sync_deleted_history_not_new:${record.version_id}`);
  }
  await retainVersionParents(port, record);
  // A complete insert already stores its main hash and validated alternative bodies.
  // Other shapes still need the post-apply identity or body-state checks.
  if (known !== null || inserted.changes !== 1 || record.content_hash == null ||
      record.snapshot.body_deleted === true || record.snapshot.deleted_version_metadata_digest ||
      record.body_text === null || typeof incomingBody !== 'string') return null;
  return record.snapshot.body_blob_hash ? 'verify_body_hash' : 'complete';
}

async function retainVersionParents(port: DbPort, record: NativeSyncNodeRecord) {
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
  if (await initializeReceivedReviewSchedule(port, record.object_id, record.snapshot.initial_review_due)) {
    await recomputeNodeReviewWithDb(port, record.object_id);
  }
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
  versionAlreadyRetained: boolean;
}) {
  assertSyncNodeTextWithinBudget(input.record.snapshot);
  const syncState = await loadAppliedNodeMutationState(input.tx, input.record.object_id, input.operation);
  await upsertRemoteNode(
    input.tx,
    input.record,
    input.preparedTextBodyHashes,
    input.localNode !== null,
    0
  );
  if (!input.versionAlreadyRetained) await upsertRemoteVersion(input.tx, input.record);
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
