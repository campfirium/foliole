import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { reviveDeletedFoldersForLaterChildren } from './syncFolderChildRevival.js';
import { resolveFolderConflict } from './syncFolderResolution.js';
import { resolveItemConflict } from './syncItemResolution.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from './syncNodeGraph.js';
import { selectNodeOperationValue } from './syncNodeOperationValue.js';
import {
  buildResolutionRecord,
  chooseEvidenceProjection,
  chooseProjection
} from './syncNodeResolution.js';
import { loadTopicTextBodies } from './topicTextBodies.js';
import { loadTopicTextConflictMetadata, selectChangedTopicMain } from './topicTextConflictMetadata.js';
import { expireTopicText } from './topicTextExpiry.js';
import { mergeTopicTextAttachments } from './topicTextMerge.js';

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
  for (const nodeId of new Set(records.map((record) => record.object_id))) {
    await expireTopicText(port, nodeId, new Date().toISOString());
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
  let ordered = [...incomingRecords].sort((left, right) =>
    (left.version_id ?? '').localeCompare(right.version_id ?? ''));
  const local = await loadCurrentSyncNodeRecord(port, ordered[0]!.object_id);
  if (!local?.version_id || ordered.some((record) => !record.version_id)) {
    throw new Error(`sync_topic_conflict_version_missing:${ordered[0]!.object_id}`);
  }
  ordered = ordered.filter((record) => record.version_id !== local.version_id &&
    !local.ancestor_version_ids.includes(record.version_id!));
  if (!ordered.length) return local;
  const { body, winner, parent, deletion } = await selectTopicState(port, local, ordered);
  const currentSnapshot = { ...winner.snapshot };
  delete currentSnapshot.position;
  const resolution = buildResolutionRecord([local, ...ordered], winner, body, {
    ...currentSnapshot,
    deleted_at: deletion.value,
    parent_id: parent.value,
    text_selection: winner.snapshot.text_selection ?? {
      version_id: winner.version_id!, created_at: winner.version_created_at!
    },
    text_alternatives: []
  });
  resolution.snapshot.text_alternatives = resolution.snapshot.deleted_at ? [] :
    await mergeTopicTextAttachments(port, [local, ...ordered], winner, new Date().toISOString());
  const complete = buildResolutionRecord([local, ...ordered], winner, body, resolution.snapshot);
  complete.alternative_bodies = await loadTopicTextBodies(port, complete);
  const applied = await applySyncNodesWithDbPort(port, [complete], {
    enqueueSearchInvalidations: false,
    includeAlreadyApplied: true,
    operation: 'local_mutation'
  });
  if (!applied.appliedIds.includes(local.object_id)) {
    throw new Error(`sync_topic_resolution_not_applied:${local.object_id}`);
  }
  await collectNodeVersionPayloads(port, local.object_id, Number.MAX_SAFE_INTEGER);
  return complete;
}

async function selectTopicState(port: DbPort, local: NativeSyncNodeRecord, ordered: NativeSyncNodeRecord[]) {
  let body = local.body_text ?? local.snapshot.content ?? '';
  let winner = local;
  let parent = { value: local.snapshot.parent_id, source: local };
  let deletion = { value: local.snapshot.deleted_at, source: local };
  for (const incoming of ordered) {
    const baseSnapshot = await loadTopicTextConflictMetadata(port, local, incoming);
    parent = selectNodeOperationValue(baseSnapshot?.parent_id, parent, incoming.snapshot.parent_id, incoming);
    deletion = selectNodeOperationValue(baseSnapshot?.deleted_at, deletion, incoming.snapshot.deleted_at, incoming);
    if (body === (incoming.body_text ?? incoming.snapshot.content ?? '')) {
      winner = chooseProjection(winner, incoming, '', 0, 0);
      continue;
    }
    const changed = await selectChangedTopicMain(port, winner, incoming);
    const projection = changed ? { winner: changed, body: changed.body_text ?? changed.snapshot.content ?? '' }
      : await chooseEvidenceProjection(port, winner, incoming, '');
    body = projection.body;
    winner = projection.winner;
  }
  return { body, winner, parent, deletion };
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
