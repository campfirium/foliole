import type { NativeSyncIndexEntry } from '../../platform/nativeStorageContract.js';

export interface SyncIndexInspectionCandidate {
  local: NativeSyncIndexEntry;
  reason: 'same_content_hash' | 'version_mismatch';
  remote: NativeSyncIndexEntry;
}

export interface SyncIndexDiffResult {
  inSync: NativeSyncIndexEntry[];
  inspectCandidates: SyncIndexInspectionCandidate[];
  pullCandidates: NativeSyncIndexEntry[];
  pushCandidates: NativeSyncIndexEntry[];
}

function toEntryKey(entry: Pick<NativeSyncIndexEntry, 'object_id' | 'object_type'>) {
  return `${entry.object_type}:${entry.object_id}`;
}

function compareEntryKey(left: NativeSyncIndexEntry, right: NativeSyncIndexEntry) {
  return toEntryKey(left).localeCompare(toEntryKey(right));
}

function buildIndexByEntryKey(entries: NativeSyncIndexEntry[], label: 'local' | 'remote') {
  const byEntryKey = new Map<string, NativeSyncIndexEntry>();
  for (const entry of entries) {
    const key = toEntryKey(entry);
    if (byEntryKey.has(key)) {
      throw new Error(`duplicate ${label} sync index entry for ${key}`);
    }
    byEntryKey.set(key, entry);
  }
  return byEntryKey;
}

function isEquivalentIndexEntry(local: NativeSyncIndexEntry, remote: NativeSyncIndexEntry) {
  return local.sync_version_id === remote.sync_version_id && local.content_hash === remote.content_hash;
}

function resolveInspectionReason(local: NativeSyncIndexEntry, remote: NativeSyncIndexEntry) {
  return local.content_hash && remote.content_hash && local.content_hash === remote.content_hash
    ? 'same_content_hash'
    : 'version_mismatch';
}

export function diffSyncIndex(localEntries: NativeSyncIndexEntry[], remoteEntries: NativeSyncIndexEntry[]): SyncIndexDiffResult {
  const localByEntryKey = buildIndexByEntryKey(localEntries, 'local');
  const remoteByEntryKey = buildIndexByEntryKey(remoteEntries, 'remote');
  const entryKeys = [...new Set([...localByEntryKey.keys(), ...remoteByEntryKey.keys()])].sort();
  const inSync: NativeSyncIndexEntry[] = [];
  const inspectCandidates: SyncIndexInspectionCandidate[] = [];
  const pullCandidates: NativeSyncIndexEntry[] = [];
  const pushCandidates: NativeSyncIndexEntry[] = [];

  for (const entryKey of entryKeys) {
    const local = localByEntryKey.get(entryKey);
    const remote = remoteByEntryKey.get(entryKey);
    if (local && !remote) {
      pushCandidates.push(local);
      continue;
    }
    if (remote && !local) {
      pullCandidates.push(remote);
      continue;
    }
    if (!local || !remote) {
      continue;
    }
    if (isEquivalentIndexEntry(local, remote)) {
      inSync.push(local);
      continue;
    }
    inspectCandidates.push({
      local,
      reason: resolveInspectionReason(local, remote),
      remote
    });
  }

  inSync.sort(compareEntryKey);
  inspectCandidates.sort((left, right) => compareEntryKey(left.local, right.local));
  pullCandidates.sort(compareEntryKey);
  pushCandidates.sort(compareEntryKey);

  return {
    inSync,
    inspectCandidates,
    pullCandidates,
    pushCandidates
  };
}
