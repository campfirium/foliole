import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { parseManualChildOrder, stringifyManualChildOrder } from '../nodes/manualChildOrder.js';

type Snapshot = NativeSyncNodeRecord['snapshot'];
type NodeTimeMetadata = Pick<NativeSyncNodeRecord, 'version_created_at' | 'updated_at' | 'version_id'>;
export type NodeSnapshotMetadata = Omit<Snapshot, 'content'>;
type NodeSnapshotRecordMetadata = NodeTimeMetadata & { snapshot: NodeSnapshotMetadata };

export function laterNodeRecord<T extends NodeTimeMetadata>(left: T, right: T): T {
  const leftKey = `${left.version_created_at ?? left.updated_at ?? ''}\n${left.version_id ?? ''}`;
  const rightKey = `${right.version_created_at ?? right.updated_at ?? ''}\n${right.version_id ?? ''}`;
  return leftKey >= rightKey ? left : right;
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeManualMembers(
  base: NodeSnapshotMetadata | null, left: NodeSnapshotMetadata, right: NodeSnapshotMetadata, winner: NodeSnapshotMetadata
) {
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

export function mergeNodeSnapshot<T extends NodeSnapshotRecordMetadata>(
  base: T['snapshot'] | null,
  left: T,
  right: T,
  mergeFolderMembers: boolean
): { snapshot: T['snapshot']; winner: T } {
  const winner = laterNodeRecord(left, right);
  const merged = { ...winner.snapshot } as Record<string, unknown>;
  const leftValues = left.snapshot as unknown as Record<string, unknown>;
  const rightValues = right.snapshot as unknown as Record<string, unknown>;
  const baseValues = base as unknown as Record<string, unknown> | null;
  for (const key of new Set([...Object.keys(leftValues), ...Object.keys(rightValues)])) {
    if (key === 'deleted_at' || key === 'updated_at' || key === 'created_at' ||
        key === 'id' || key === 'kind' || (mergeFolderMembers && key === 'manual_child_order') ||
        !baseValues) continue;
    const leftChanged = !sameValue(leftValues[key], baseValues[key]);
    const rightChanged = !sameValue(rightValues[key], baseValues[key]);
    if (leftChanged && !rightChanged) merged[key] = leftValues[key];
    if (rightChanged && !leftChanged) merged[key] = rightValues[key];
  }
  if (mergeFolderMembers) {
    merged.manual_child_order = mergeManualMembers(base, left.snapshot, right.snapshot, winner.snapshot);
  }
  return { snapshot: merged as unknown as T['snapshot'], winner };
}
