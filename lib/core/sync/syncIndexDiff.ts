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

function compareObjectId(left: { object_id: string }, right: { object_id: string }) {
  return left.object_id.localeCompare(right.object_id);
}

function buildIndexByObjectId(entries: NativeSyncIndexEntry[], label: 'local' | 'remote') {
  const byObjectId = new Map<string, NativeSyncIndexEntry>();
  for (const entry of entries) {
    if (byObjectId.has(entry.object_id)) {
      throw new Error(`duplicate ${label} sync index entry for object_id ${entry.object_id}`);
    }
    byObjectId.set(entry.object_id, entry);
  }
  return byObjectId;
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
  const localByObjectId = buildIndexByObjectId(localEntries, 'local');
  const remoteByObjectId = buildIndexByObjectId(remoteEntries, 'remote');
  const objectIds = [...new Set([...localByObjectId.keys(), ...remoteByObjectId.keys()])].sort();
  const inSync: NativeSyncIndexEntry[] = [];
  const inspectCandidates: SyncIndexInspectionCandidate[] = [];
  const pullCandidates: NativeSyncIndexEntry[] = [];
  const pushCandidates: NativeSyncIndexEntry[] = [];

  for (const objectId of objectIds) {
    const local = localByObjectId.get(objectId);
    const remote = remoteByObjectId.get(objectId);
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

  inSync.sort(compareObjectId);
  inspectCandidates.sort((left, right) => compareObjectId(left.local, right.local));
  pullCandidates.sort(compareObjectId);
  pushCandidates.sort(compareObjectId);

  return {
    inSync,
    inspectCandidates,
    pullCandidates,
    pushCandidates
  };
}
