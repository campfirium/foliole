import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord } from './syncNodeGraph.js';
import { mergeNodeBody } from './syncNodeBodyMerge.js';
import { loadMergeBaseState } from './syncNodeMergeBaseSnapshot.js';
import { arraySyncNodeRecordSource, type SyncNodeRecordMetadata, type SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { buildResolutionRecord } from './syncNodeResolution.js';
import { mergeNodeSnapshot } from './syncNodeSnapshotMerge.js';

export function resolveItemConflict(port: DbPort, incomingRecords: NativeSyncNodeRecord[]) {
  return resolveItemSourceConflict(port, arraySyncNodeRecordSource(incomingRecords));
}

export async function resolveItemSourceConflict<M extends SyncNodeRecordMetadata>(port: DbPort, source: SyncNodeRecordSource<M>) {
  const incomingRecords = source.records;
  const ordered = [...incomingRecords].sort((left, right) =>
    (left.version_id ?? '').localeCompare(right.version_id ?? ''));
  let local = await loadCurrentSyncNodeRecord(port, ordered[0]!.object_id);
  if (!local?.version_id || ordered.some((record) => !record.version_id)) {
    throw new Error(`sync_item_conflict_version_missing:${ordered[0]!.object_id}`);
  }
  const [state] = await port.query<{ sync_dirty: number }>(
    'SELECT sync_dirty FROM nodes WHERE id = ?', [local.object_id]
  );
  if (state?.sync_dirty === 1) {
    throw new Error(`sync_item_local_change_unversioned:${local.object_id}`);
  }
  for (const metadata of ordered) {
    const incoming = await source.load(port, metadata);
    const base = await loadMergeBaseState(port, local.version_id!, incoming.version_id!, 'item');
    const merged = mergeNodeSnapshot(base?.snapshot ?? null, local, incoming, false);
    const { body, snapshot } = await mergeNodeBody(port, base?.body ?? null, local, incoming, merged.snapshot);
    const resolution = buildResolutionRecord([local, incoming], merged.winner, body, snapshot);
    const applied = await applySyncNodesWithDbPort(port, [resolution], {
      enqueueSearchInvalidations: false,
      includeAlreadyApplied: true,
      operation: 'local_mutation'
    });
    if (!applied.appliedIds.includes(local.object_id)) {
      throw new Error(`sync_item_resolution_not_applied:${local.object_id}`);
    }
    local = resolution;
  }
  return local;
}
