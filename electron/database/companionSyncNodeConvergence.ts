import { moveCanonicalNodeHistory } from '../../lib/core/sync/canonicalNodeHistory.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs.js';
import { resolveFolderConflict } from '../../lib/core/sync/syncFolderResolution.js';
import { resolveItemConflict } from '../../lib/core/sync/syncItemResolution.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { resolveTopicConflict } from '../../lib/core/sync/syncNodeConvergence.js';
import { isStoredAncestorVersion, loadMergeBaseCandidates } from '../../lib/core/sync/syncNodeGraph.js';
import { isNodeVersionIdentityOnly, orderNodeVersionHistory } from '../../lib/core/sync/syncNodeVersionHistory.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { isStoredVersionIdentical, loadCurrentSyncNodeRecord } from './companionSyncNodeGraph.js';
import {
  hashText,
  semanticSnapshot
} from './companionSyncNodeResolution.js';
import {
  parseNodeVersionPush,
  rejectNodeVersionPush,
  resolveNodeVersionPushOperation
} from './companionSyncPushNodeVersionWithDbPort.js';
import type { CompanionSyncPushPayload, CompanionSyncPushResult } from './companionSyncPushTypes.js';

export async function applyNodePushBatchWithDbPort(
  port: DbPort,
  items: CompanionSyncPushPayload[]
): Promise<CompanionSyncPushResult> {
  const parsed = items.map((item) => ({ item, record: parseNodeVersionPush(item) }));
  const result = emptyResult();
  const valid = parsed.filter((entry): entry is { item: CompanionSyncPushPayload; record: NativeSyncNodeRecord } => {
    if (entry.record?.host_name === entry.item.authorHostName) return true;
    append(result, rejectNodeVersionPush(entry.item, 'invalid_node_push'));
    return false;
  });
  const deferred: typeof valid = [];
  const historyOrder = new Map(orderNodeVersionHistory(valid.map((entry) => entry.record))
    .map((record, index) => [record, index]));
  valid.sort((left, right) => historyOrder.get(left.record)! - historyOrder.get(right.record)!);
  for (const entry of valid) {
    const current = await loadCurrentSyncNodeRecord(port, entry.record.object_id);
    if (entry.record.version_id && (current?.version_id === entry.record.version_id
      || current?.ancestor_version_ids.includes(entry.record.version_id))
      && await isStoredVersionIdentical(port, entry.record)) {
      appendNodeAck(result, entry, true);
      continue;
    }
    const operation = await resolveNodeVersionPushOperation(port, entry.record);
    const applied = await applySyncNodesWithDbPort(port, [entry.record], {
      enqueueSearchInvalidations: false,
      includeAlreadyApplied: true,
      ...(operation ? { operation } : {})
    });
    if (applied.conflictNodes.length > 0) deferred.push(entry);
    else appendNodeAck(result, entry, applied.appliedIds.includes(entry.record.object_id)
      || (isNodeVersionIdentityOnly(entry.record) && await isStoredVersionIdentical(port, entry.record)));
  }
  const related = [];
  for (const entry of deferred) {
    if (isAdditiveNode(entry.record) && !await hasSharedHistory(port, entry.record)) {
      await resolveAdditiveObject(port, entry, result);
    } else related.push(entry);
  }
  for (const entries of groupByObjectId(related)) {
    await resolveSharedObject(port, entries, result);
  }
  return result;
}

async function hasSharedHistory(port: DbPort, record: NativeSyncNodeRecord) {
  const local = await loadCurrentSyncNodeRecord(port, record.object_id);
  return Boolean(local?.version_id && record.version_id
    && (await loadMergeBaseCandidates(port, local.version_id, record.version_id)).length > 0);
}

function isAdditiveNode(record: NativeSyncNodeRecord) {
  return record.snapshot.anchor_link !== null || record.snapshot.kind !== 'topic';
}

async function resolveSharedObject(
  port: DbPort,
  entries: Array<{ item: CompanionSyncPushPayload; record: NativeSyncNodeRecord }>,
  result: CompanionSyncPushResult
) {
  const ordered = [...entries].sort((left, right) =>
    (left.record.version_id ?? '').localeCompare(right.record.version_id ?? ''));
  try {
    const records = [];
    for (const { record } of ordered) {
      let ancestor = false;
      for (const { record: other } of ordered) {
        if (record.version_id !== other.version_id &&
            await isStoredAncestorVersion(port, record.version_id!, other.version_id!)) ancestor = true;
      }
      if (!ancestor) records.push(record);
    }
    if (records.every((record) => record.snapshot.kind === 'folder')) await resolveFolderConflict(port, records);
    else if (records.every((record) => record.snapshot.kind === 'item')) await resolveItemConflict(port, records);
    else await resolveTopicConflict(port, records);
  } catch {
    ordered.forEach((entry) => appendNodeAck(result, entry, false));
    return;
  }
  ordered.forEach((entry) => appendNodeAck(result, entry, true));
}

function groupByObjectId<T extends { record: NativeSyncNodeRecord }>(entries: T[]) {
  const groups = new Map<string, T[]>();
  for (const entry of entries) groups.set(entry.record.object_id, [...groups.get(entry.record.object_id) ?? [], entry]);
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, group]) => group);
}

async function resolveAdditiveObject(
  port: DbPort,
  entry: { item: CompanionSyncPushPayload; record: NativeSyncNodeRecord },
  result: CompanionSyncPushResult
) {
  const local = await loadCurrentSyncNodeRecord(port, entry.record.object_id);
  if (local && semanticSnapshot(local.snapshot) === semanticSnapshot(entry.record.snapshot)) {
    appendNodeAck(result, entry, true);
    return;
  }
  const suffix = hashText(`${entry.record.object_id}\n${semanticSnapshot(entry.record.snapshot)}`).slice(0, 12);
  const canonicalId = `${entry.record.object_id}~${suffix}`;
  const derived: NativeSyncNodeRecord = {
    ...entry.record,
    ancestor_version_ids: [...entry.record.ancestor_version_ids],
    object_id: canonicalId,
    parent_version_id: entry.record.version_id,
    parent_version_ids: [entry.record.version_id!],
    snapshot: { ...entry.record.snapshot, id: canonicalId },
    version_id: createOpaqueVersionRef(suffix)
  };
  const applied = await applySyncNodesWithDbPort(port, [{ ...derived, parent_version_id: null, parent_version_ids: [] }], {
    enqueueSearchInvalidations: false,
    includeAlreadyApplied: true
  });
  if (!applied.appliedIds.includes(canonicalId)) throw new Error('sync_derived_object_not_applied');
  await moveCanonicalNodeHistory(port, { sourceId: entry.record.object_id, canonicalId,
    versionIds: [entry.record.version_id!, ...entry.record.ancestor_version_ids] });
  await port.run('UPDATE node_sync_versions SET parent_version_id = ? WHERE version_id = ?',
    [entry.record.version_id!, derived.version_id!]);
  await port.run('INSERT OR IGNORE INTO node_sync_version_parents VALUES (?, ?, 0)',
    [derived.version_id!, entry.record.version_id!]);
  result.acks.push({
    canonicalObjectId: canonicalId,
    canonicalVersionId: derived.version_id!,
    clientOpId: entry.item.clientOpId,
    identity: entry.item.identity,
    status: 'accepted',
    versionId: entry.record.version_id
  });
  result.appliedNodeIds.push(canonicalId);
}

function appendNodeAck(
  result: CompanionSyncPushResult,
  entry: { item: CompanionSyncPushPayload; record: NativeSyncNodeRecord },
  accepted: boolean
) {
  result.acks.push({
    clientOpId: entry.item.clientOpId,
    ...(accepted ? {} : { conflictReason: 'node_version_conflict' }),
    identity: entry.item.identity,
    status: accepted ? 'accepted' : 'conflict',
    versionId: entry.record.version_id
  });
  if (accepted) result.appliedNodeIds.push(entry.record.object_id);
}

function emptyResult(): CompanionSyncPushResult {
  return { acks: [], appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] };
}

function append(target: CompanionSyncPushResult, source: CompanionSyncPushResult) {
  target.acks.push(...source.acks);
  target.appliedNodeIds.push(...source.appliedNodeIds);
  target.appliedObjectIds.push(...source.appliedObjectIds);
  target.appliedReviewOpIds.push(...source.appliedReviewOpIds);
}
