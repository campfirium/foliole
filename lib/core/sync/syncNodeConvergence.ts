import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { reviveDeletedFoldersForLaterChildren } from './syncFolderChildRevival.js';
import { resolveFolderSourceConflict } from './syncFolderResolution.js';
import { resolveItemSourceConflict } from './syncItemResolution.js';
import { applySyncNodeSourceWithDbPort } from './syncNodeApplyExecutor.js';
import { arraySyncNodeRecordSource, type SyncNodeRecordMetadata, type SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { resolveTopicSourceConflict } from './syncTopicConflict.js';
import { expireTopicText } from './topicTextExpiry.js';

export function applyConvergentSyncNodesWithDbPort(port: DbPort, records: NativeSyncNodeRecord[],
  options: { collectVersionPayloads?: boolean } = {}) {
  return applyConvergentSyncNodeSource(port, arraySyncNodeRecordSource(records), options);
}

export async function applyConvergentSyncNodeSource<M extends SyncNodeRecordMetadata>(port: DbPort,
  source: SyncNodeRecordSource<M>, options: { collectVersionPayloads?: boolean } = {}) {
  const records = source.records;
  const knownNodeIds = await loadKnownNodeStateIds(port, records);
  const result = await applySyncNodeSourceWithDbPort(port, source, {
    enqueueSearchInvalidations: false
  });
  const conflicts = groupByObjectId(result.conflictNodes);
  const resolvedNodeIds: string[] = [];
  for (const group of conflicts) {
    if (group.every((record) => record.snapshot.kind === 'folder')) {
      resolvedNodeIds.push((await resolveFolderSourceConflict(port, { ...source, records: group })).object_id);
      continue;
    }
    if (group.every((record) => record.snapshot.kind === 'item')) {
      resolvedNodeIds.push((await resolveItemSourceConflict(port, { ...source, records: group })).object_id);
      continue;
    }
    if (group.some((record) => record.snapshot.kind !== 'topic')) {
      throw new Error(`sync_node_conflict_kind_mismatch:${group[0]!.object_id}`);
    }
    resolvedNodeIds.push((await resolveTopicSourceConflict(port, { ...source, records: group }, options.collectVersionPayloads !== false)).object_id);
  }
  if (result.blockedIds.length > 0) {
    throw new Error(`sync_node_apply_blocked:${result.blockedIds.join(',')}`);
  }
  for (const nodeId of new Set(records.map((record) => record.object_id))) {
    await expireTopicText(port, nodeId, new Date().toISOString(), options.collectVersionPayloads !== false);
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

async function loadKnownNodeStateIds(port: DbPort, records: readonly SyncNodeRecordMetadata[]) {
  const ids = [...new Set(records.map((record) => record.object_id))];
  if (ids.length === 0) return new Set<string>();
  const rows = await port.query<{ object_id: string }>(
    `SELECT object_id FROM sync_object_state
     WHERE object_type = 'node' AND object_id IN (${ids.map(() => '?').join(', ')})`,
    ids
  );
  return new Set(rows.map((row) => row.object_id));
}

export function resolveTopicConflict(port: DbPort, incomingRecords: NativeSyncNodeRecord[], collectVersionPayloads = true) {
  return resolveTopicSourceConflict(port, arraySyncNodeRecordSource(incomingRecords), collectVersionPayloads);
}

function groupByObjectId<M extends SyncNodeRecordMetadata>(records: readonly M[]) {
  const groups = new Map<string, M[]>();
  for (const record of records) {
    groups.set(record.object_id, [...groups.get(record.object_id) ?? [], record]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => group);
}
