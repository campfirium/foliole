import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord, loadMergeBase } from './syncNodeGraph.js';
import {
  buildResolutionRecord,
  chooseEvidenceProjection,
  chooseProjection,
  storeAlternative
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
    if (group.some((record) => record.snapshot.kind !== 'topic')) {
      throw new Error(`sync_node_conflict_requires_topic:${group[0]!.object_id}`);
    }
    resolvedNodeIds.push((await resolveTopicConflict(port, group)).object_id);
  }
  if (result.blockedIds.length > 0 || result.tombstoneBlockedIds.length > 0) {
    throw new Error(`sync_node_apply_blocked:${[...result.blockedIds, ...result.tombstoneBlockedIds].join(',')}`);
  }
  return {
    appliedNodeCount: new Set([
      ...result.appliedIds,
      ...resolvedNodeIds,
      ...records.filter((record) => !knownNodeIds.has(record.object_id)).map((record) => record.object_id)
    ]).size,
    handledConflictCount: conflicts.length,
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
  for (const incoming of ordered) {
    const base = await loadMergeBase(port, local.version_id, incoming.version_id!);
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
  const resolution = buildResolutionRecord([local, ...ordered], winner, body);
  const applied = await applySyncNodesWithDbPort(port, [resolution], {
    enqueueSearchInvalidations: false,
    includeAlreadyApplied: true
  });
  if (!applied.appliedIds.includes(local.object_id)) {
    throw new Error(`sync_topic_resolution_not_applied:${local.object_id}`);
  }
  if (alternative) await storeAlternative(port, alternative, resolution.version_created_at!);
  return resolution;
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
