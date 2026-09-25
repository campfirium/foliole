import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord, loadMergeBase } from './syncNodeGraph.js';
import { buildResolutionRecord } from './syncNodeResolution.js';
import { mergeNodeSnapshot } from './syncNodeSnapshotMerge.js';

export async function resolveItemConflict(port: DbPort, incomingRecords: NativeSyncNodeRecord[]) {
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
  for (const incoming of ordered) {
    const base = await loadMergeBase(port, local.version_id!, incoming.version_id!);
    const baseSnapshot = base
      ? JSON.parse(base.snapshot_json) as NativeSyncNodeRecord['snapshot'] : null;
    const { snapshot, winner } = mergeNodeSnapshot(baseSnapshot, local, incoming, false);
    const resolution = buildResolutionRecord(
      [local, incoming], winner, snapshot.content ?? '', snapshot
    );
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
