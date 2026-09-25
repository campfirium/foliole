import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { reviveDeletedFoldersForLaterChildren } from './syncFolderChildRevival.js';
import { resolveFolderConflict } from './syncFolderResolution.js';
import { resolveItemConflict } from './syncItemResolution.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord, loadMergeBase } from './syncNodeGraph.js';
import {
  buildResolutionRecord,
  chooseEvidenceProjection,
  chooseProjection,
  reconcileResolutionAlternatives
} from './syncNodeResolution.js';
import { mergeSyncText } from './syncTextDiff3.js';

export async function applyConvergentSyncNodesWithDbPort(
  port: DbPort,
  records: NativeSyncNodeRecord[]
) {
  const knownNodeIds = await loadKnownNodeStateIds(port, records);
  const result = await applySyncNodesWithDbPort(port, records, {
    enqueueSearchInvalidations: false
  });
  const conflicts = groupByObjectId(result.conflictNodes);
  const resolvedNodeIds: string[] = [];
  for (const group of conflicts) {
    if (group.every((record) => record.snapshot.kind === 'folder')) {
      resolvedNodeIds.push((await resolveFolderConflict(port, group)).object_id);
      continue;
    }
    if (group.every((record) => record.snapshot.kind === 'item')) {
      resolvedNodeIds.push((await resolveItemConflict(port, group)).object_id);
      continue;
    }
    if (group.some((record) => record.snapshot.kind !== 'topic')) {
      throw new Error(`sync_node_conflict_kind_mismatch:${group[0]!.object_id}`);
    }
    resolvedNodeIds.push((await resolveTopicConflict(port, group)).object_id);
  }
  if (result.blockedIds.length > 0) {
    throw new Error(`sync_node_apply_blocked:${result.blockedIds.join(',')}`);
  }
  await reviveDeletedFoldersForLaterChildren(
    port, records, new Set([...result.appliedIds, ...resolvedNodeIds])
  );
  return {
    appliedNodeCount: new Set([
      ...result.appliedIds,
      ...resolvedNodeIds,
      ...records.filter((record) => !knownNodeIds.has(record.object_id)).map((record) => record.object_id)
    ]).size,
    handledConflictCount: conflicts.length,
    newNodeIds: records.filter((record) => !knownNodeIds.has(record.object_id))
      .map((record) => record.object_id),
    processedNodeIds: [...new Set(records.map((record) => record.object_id))]
  };
}

async function loadKnownNodeStateIds(port: DbPort, records: NativeSyncNodeRecord[]) {
  const ids = [...new Set(records.map((record) => record.object_id))];
  if (ids.length === 0) return new Set<string>();
  const rows = await port.query<{ object_id: string }>(
    `SELECT object_id FROM sync_object_state
     WHERE object_type = 'node' AND object_id IN (${ids.map(() => '?').join(', ')})`,
    ids
  );
  return new Set(rows.map((row) => row.object_id));
}

export async function resolveTopicConflict(
  port: DbPort,
  incomingRecords: NativeSyncNodeRecord[]
) {
  const ordered = [...incomingRecords].sort((left, right) =>
    (left.version_id ?? '').localeCompare(right.version_id ?? ''));
  const local = await loadCurrentSyncNodeRecord(port, ordered[0]!.object_id);
  if (!local?.version_id || ordered.some((record) => !record.version_id)) {
    throw new Error(`sync_topic_conflict_version_missing:${ordered[0]!.object_id}`);
  }
  let body = local.body_text ?? local.snapshot.content ?? '';
  let winner = local;
  let alternative: NativeSyncNodeRecord | null = null;
  let parent = { value: local.snapshot.parent_id, source: local };
  let position = { value: local.snapshot.position, source: local };
  let deletion = { value: local.snapshot.deleted_at, source: local };
  for (const incoming of ordered) {
    const base = await loadMergeBase(port, local.version_id, incoming.version_id!);
    const baseSnapshot = base ? JSON.parse(base.snapshot_json) as NativeSyncNodeRecord['snapshot'] : null;
    parent = selectOperationValue(baseSnapshot?.parent_id, parent, incoming.snapshot.parent_id, incoming);
    position = selectOperationValue(baseSnapshot?.position, position, incoming.snapshot.position, incoming);
    deletion = selectOperationValue(baseSnapshot?.deleted_at, deletion, incoming.snapshot.deleted_at, incoming);
    const baseBody = base?.body_text ?? '';
    const incomingBody = incoming.body_text ?? incoming.snapshot.content ?? '';
    const merge = base?.body_text == null
      ? { kind: 'conflict' as const }
      : mergeSyncText(baseBody, body, incomingBody);
    if (merge.kind === 'merged') {
      body = merge.text;
      winner = chooseProjection(winner, incoming, baseBody, 0, 0);
      continue;
    }
    const projection = await chooseEvidenceProjection(port, winner, incoming, baseBody);
    body = projection.body;
    winner = projection.winner;
    alternative = projection.loser;
  }
  const resolution = buildResolutionRecord([local, ...ordered], winner, body, {
    ...winner.snapshot,
    deleted_at: deletion.value,
    parent_id: parent.value,
    position: position.value
  });
  const applied = await applySyncNodesWithDbPort(port, [resolution], {
    enqueueSearchInvalidations: false,
    includeAlreadyApplied: true,
    operation: 'local_mutation'
  });
  if (!applied.appliedIds.includes(local.object_id)) {
    throw new Error(`sync_topic_resolution_not_applied:${local.object_id}`);
  }
  await reconcileResolutionAlternatives(port, resolution, alternative);
  return resolution;
}

function selectOperationValue<T>(
  base: T | undefined,
  current: { source: NativeSyncNodeRecord; value: T },
  incomingValue: T,
  incoming: NativeSyncNodeRecord
) {
  if (base !== undefined) {
    if (current.value === base && incomingValue !== base) return { value: incomingValue, source: incoming };
    if (incomingValue === base) return current;
  }
  const currentKey = `${current.source.version_created_at ?? ''}\n${current.source.version_id ?? ''}`;
  const incomingKey = `${incoming.version_created_at ?? ''}\n${incoming.version_id ?? ''}`;
  return incomingKey > currentKey ? { value: incomingValue, source: incoming } : current;
}

function groupByObjectId(records: NativeSyncNodeRecord[]) {
  const groups = new Map<string, NativeSyncNodeRecord[]>();
  for (const record of records) {
    groups.set(record.object_id, [...groups.get(record.object_id) ?? [], record]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => group);
}
