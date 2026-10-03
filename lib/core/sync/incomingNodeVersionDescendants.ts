import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

export function hasConfirmedIncomingNodeDescendant(record: NativeSyncNodeRecord, records: NativeSyncNodeRecord[],
  confirmed: Set<string | null | undefined>) {
  const byId = new Map(records.filter(item => item.object_id === record.object_id)
    .map(item => [item.version_id, item]));
  for (const head of byId.values()) {
    if (head.version_id === record.version_id || !confirmed.has(head.version_id)) continue;
    const pending = [...head.parent_version_ids ?? (head.parent_version_id ? [head.parent_version_id] : [])];
    const seen = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (id === record.version_id) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const parent = byId.get(id);
      if (parent) pending.push(...parent.parent_version_ids ??
        (parent.parent_version_id ? [parent.parent_version_id] : []));
    }
  }
  return false;
}
