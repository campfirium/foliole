import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { mergeSyncText } from '../../lib/core/sync/syncTextDiff3.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { isStoredVersionIdentical, loadCurrentSyncNodeRecord, loadMergeBase } from './companionSyncNodeGraph.js';
import {
  buildResolutionRecord,
  chooseEvidenceProjection,
  chooseProjection,
  hashText,
  semanticSnapshot,
  storeAlternative
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
    if (entry.record) return true;
    append(result, rejectNodeVersionPush(entry.item, 'invalid_node_push'));
    return false;
  });
  const deferred: typeof valid = [];
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
    else appendNodeAck(result, entry, applied.appliedIds.includes(entry.record.object_id));
  }
  for (const entry of deferred.filter(({ record }) => isAdditiveNode(record))) {
    await resolveAdditiveObject(port, entry, result);
  }
  const topicEntries = deferred.filter(({ record }) => !isAdditiveNode(record));
  for (const entries of groupByObjectId(topicEntries)) {
    await resolveTopic(port, entries, result);
  }
  return result;
}

function isAdditiveNode(record: NativeSyncNodeRecord) {
  return record.snapshot.anchor_link !== null || record.snapshot.kind !== 'topic';
}

async function resolveTopic(
  port: DbPort,
  entries: Array<{ item: CompanionSyncPushPayload; record: NativeSyncNodeRecord }>,
  result: CompanionSyncPushResult
) {
  const ordered = [...entries].sort((left, right) =>
    (left.record.version_id ?? '').localeCompare(right.record.version_id ?? ''));
  const local = await loadCurrentSyncNodeRecord(port, ordered[0]!.record.object_id);
  if (!local?.version_id || ordered.some(({ record }) => !record.version_id)) {
    ordered.forEach((entry) => appendNodeAck(result, entry, false));
    return;
  }
  let body = local.body_text ?? local.snapshot.content ?? '';
  let winner = local;
  let alternative: NativeSyncNodeRecord | null = null;
  for (const entry of ordered) {
    const base = await loadMergeBase(port, local.version_id, entry.record.version_id!);
    const baseBody = base?.body_text ?? '';
    const incomingBody = entry.record.body_text ?? entry.record.snapshot.content ?? '';
    const merge = base?.body_text == null ? { kind: 'conflict' as const } : mergeSyncText(baseBody, body, incomingBody);
    if (merge.kind === 'merged') {
      body = merge.text;
      winner = chooseProjection(winner, entry.record, baseBody, 0, 0);
      continue;
    }
    const projection = await chooseEvidenceProjection(port, winner, entry.record, baseBody);
    body = projection.body;
    winner = projection.winner;
    alternative = projection.loser;
  }
  const resolution = buildResolutionRecord([local, ...ordered.map(({ record }) => record)], winner, body);
  const applied = await applySyncNodesWithDbPort(port, [resolution], {
    enqueueSearchInvalidations: false,
    includeAlreadyApplied: true
  });
  if (!applied.appliedIds.includes(local.object_id)) throw new Error('sync_resolution_not_applied');
  if (alternative) await storeAlternative(port, alternative, resolution.version_created_at!);
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
    ancestor_version_ids: [],
    object_id: canonicalId,
    parent_version_id: null,
    parent_version_ids: [],
    snapshot: { ...entry.record.snapshot, id: canonicalId },
    version_id: `derived#${suffix}`
  };
  const applied = await applySyncNodesWithDbPort(port, [derived], {
    enqueueSearchInvalidations: false,
    includeAlreadyApplied: true
  });
  if (!applied.appliedIds.includes(canonicalId)) throw new Error('sync_derived_object_not_applied');
  result.acks.push({
    canonicalObjectId: canonicalId,
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
