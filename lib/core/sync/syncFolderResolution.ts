import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { parseManualChildOrder, stringifyManualChildOrder } from '../nodes/manualChildOrder.js';

import type { DbPort } from './dbPort.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord, loadMergeBase } from './syncNodeGraph.js';
import { buildResolutionRecord } from './syncNodeResolution.js';

type Snapshot = NativeSyncNodeRecord['snapshot'];

function laterRecord(left: NativeSyncNodeRecord, right: NativeSyncNodeRecord) {
  const leftKey = `${left.version_created_at ?? left.updated_at ?? ''}\n${left.version_id ?? ''}`;
  const rightKey = `${right.version_created_at ?? right.updated_at ?? ''}\n${right.version_id ?? ''}`;
  return leftKey >= rightKey ? left : right;
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeManualMembers(base: Snapshot | null, left: Snapshot, right: Snapshot, winner: Snapshot) {
  const baseIds = parseManualChildOrder(base?.manual_child_order) ?? [];
  const leftIds = parseManualChildOrder(left.manual_child_order) ?? [];
  const rightIds = parseManualChildOrder(right.manual_child_order) ?? [];
  const baseSet = new Set(baseIds);
  const leftSet = new Set(leftIds);
  const rightSet = new Set(rightIds);
  const retained = new Set([...baseIds, ...leftIds, ...rightIds].filter((id) =>
    baseSet.has(id) ? leftSet.has(id) && rightSet.has(id) : leftSet.has(id) || rightSet.has(id)
  ));
  const winnerIds = parseManualChildOrder(winner.manual_child_order) ?? [];
  const otherIds = winner === left ? rightIds : leftIds;
  const ordered = [...winnerIds, ...otherIds].filter((id) => retained.delete(id));
  return stringifyManualChildOrder(ordered);
}

function mergeFolderSnapshot(
  base: Snapshot | null,
  left: NativeSyncNodeRecord,
  right: NativeSyncNodeRecord,
  winner: NativeSyncNodeRecord
): Snapshot {
  const merged = { ...winner.snapshot } as Record<string, unknown>;
  const leftValues = left.snapshot as unknown as Record<string, unknown>;
  const rightValues = right.snapshot as unknown as Record<string, unknown>;
  const baseValues = base as unknown as Record<string, unknown> | null;
  for (const key of Object.keys(merged)) {
    if (key === 'deleted_at' || key === 'manual_child_order' || key === 'updated_at' ||
        key === 'created_at' || key === 'id' || key === 'kind' || !baseValues) continue;
    const leftChanged = !sameValue(leftValues[key], baseValues[key]);
    const rightChanged = !sameValue(rightValues[key], baseValues[key]);
    if (leftChanged && !rightChanged) merged[key] = leftValues[key];
    if (rightChanged && !leftChanged) merged[key] = rightValues[key];
  }
  merged.manual_child_order = mergeManualMembers(base, left.snapshot, right.snapshot, winner.snapshot);
  return merged as unknown as Snapshot;
}

export async function resolveFolderConflict(port: DbPort, incomingRecords: NativeSyncNodeRecord[]) {
  const ordered = [...incomingRecords].sort((left, right) =>
    (left.version_id ?? '').localeCompare(right.version_id ?? '')
  );
  let local = await loadCurrentSyncNodeRecord(port, ordered[0]!.object_id);
  if (!local?.version_id || ordered.some((record) => !record.version_id)) {
    throw new Error(`sync_folder_conflict_version_missing:${ordered[0]!.object_id}`);
  }
  const [state] = await port.query<{ sync_dirty: number }>(
    'SELECT sync_dirty FROM nodes WHERE id = ?', [local.object_id]
  );
  if (state?.sync_dirty === 1) {
    throw new Error(`sync_folder_local_change_unversioned:${local.object_id}`);
  }
  for (const incoming of ordered) {
    const base = await loadMergeBase(port, local.version_id!, incoming.version_id!);
    const baseSnapshot = base ? JSON.parse(base.snapshot_json) as Snapshot : null;
    const winner = laterRecord(local, incoming);
    const snapshot = mergeFolderSnapshot(baseSnapshot, local, incoming, winner);
    const resolution = buildResolutionRecord(
      [local, incoming], winner, snapshot.content ?? '', snapshot
    );
    const applied = await applySyncNodesWithDbPort(port, [resolution], {
      enqueueSearchInvalidations: false,
      includeAlreadyApplied: true,
      operation: 'local_mutation'
    });
    if (!applied.appliedIds.includes(local.object_id)) {
      throw new Error(`sync_folder_resolution_not_applied:${local.object_id}`);
    }
    local = resolution;
  }
  return local;
}
