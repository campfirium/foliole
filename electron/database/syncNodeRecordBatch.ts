import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

function branchRecordKey(record: NativeSyncNodeRecord) {
  return `${record.object_id}\n${record.device_id?.trim() || 'remote'}`;
}

function compareRecordHead(a: NativeSyncNodeRecord, b: NativeSyncNodeRecord) {
  const timeCompare = (a.version_created_at ?? a.updated_at ?? '').localeCompare(b.version_created_at ?? b.updated_at ?? '');
  return timeCompare === 0 ? (a.version_id ?? '').localeCompare(b.version_id ?? '') : timeCompare;
}

export function latestBranchHeadRecords(records: NativeSyncNodeRecord[]) {
  const byBranch = new Map<string, NativeSyncNodeRecord>();
  for (const record of records) {
    const key = branchRecordKey(record);
    const current = byBranch.get(key);
    if (!current || compareRecordHead(current, record) < 0) {
      byBranch.set(key, record);
    }
  }
  return [...byBranch.values()];
}
