import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
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

export function applyConvergentSyncNodeSource<M extends SyncNodeRecordMetadata>(port: DbPort,
  source: SyncNodeRecordSource<M>, options: { collectVersionPayloads?: boolean } = {}) {
  return port.transaction(tx => convergeNodeSource(tx, source, options));
}

async function convergeNodeSource<M extends SyncNodeRecordMetadata>(port: DbPort,
  source: SyncNodeRecordSource<M>, options: { collectVersionPayloads?: boolean }) {
  const records = source.records;
  const knownNodeIds = await loadKnownNodeStateIds(port, records);
  const result = await applySyncNodeSourceWithDbPort(port, source, {
    enqueueSearchInvalidations: false, deferBodyRetirement: options.collectVersionPayloads === false
  });
  const conflicts = groupByObjectId(result.conflictNodes);
  const resolvedNodeIds: string[] = [];
  for (const group of conflicts) resolvedNodeIds.push(await resolveGroup(port, { ...source, records: group }));
  if (result.blockedIds.length > 0) {
    throw new Error(`sync_node_apply_blocked:${result.blockedIds.join(',')}`);
  }
  for (const nodeId of new Set(records.map((record) => record.object_id))) {
    await expireTopicText(port, nodeId, new Date().toISOString(), false);
  }
  await reviveDeletedFoldersForLaterChildren(
    port, records, new Set([...result.appliedIds, ...resolvedNodeIds])
  );
  if (options.collectVersionPayloads !== false) for (const nodeId of new Set(records.map(record => record.object_id))) {
    await collectNodeVersionPayloads(port, nodeId, Number.MAX_SAFE_INTEGER);
  }
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

async function resolveGroup<M extends SyncNodeRecordMetadata>(port: DbPort, source: SyncNodeRecordSource<M>) {
  if (source.records.every(record => record.snapshot.kind === 'folder')) {
    return (await resolveFolderSourceConflict(port, source)).object_id;
  }
  if (source.records.every(record => record.snapshot.kind === 'item')) {
    return (await resolveItemSourceConflict(port, source)).object_id;
  }
  if (source.records.some(record => record.snapshot.kind !== 'topic')) {
    throw new Error(`sync_node_conflict_kind_mismatch:${source.records[0]!.object_id}`);
  }
  return (await resolveTopicSourceConflict(port, source, false)).object_id;
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
