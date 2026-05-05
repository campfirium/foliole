import type {
  NativeSyncIndexEntry,
  NativeSyncObjectRecord,
  NativeSyncObjectType
} from '../../../lib/platform/nativeSyncContract';

import { fetchDesktopJson } from './companionDesktopSyncHttp';
import {
  applyCompanionSyncObjects,
  loadCompanionSyncIndex
} from './companionSyncObjects';

const SYNC_INDEX_PATH = '/companion/sync-index';
const SYNC_OBJECTS_PATH = '/companion/sync-objects';

type StateSyncObjectType = Exclude<NativeSyncObjectType, 'import_run' | 'node'>;
type StateSyncIndexEntry = NativeSyncIndexEntry & { object_type: StateSyncObjectType };

function entryKey(entry: Pick<NativeSyncIndexEntry, 'object_id' | 'object_type'>) {
  return `${entry.object_type}:${entry.object_id}`;
}

function isGenericEntry(entry: NativeSyncIndexEntry): entry is StateSyncIndexEntry {
  return entry.object_type !== 'node' && entry.object_type !== 'import_run';
}

function shouldPullObject(local: NativeSyncIndexEntry | undefined, remote: NativeSyncIndexEntry) {
  if (!local) return true;
  if (remote.updated_at < local.updated_at) return false;
  return local.content_hash !== remote.content_hash || local.sync_version_id !== remote.sync_version_id;
}

function collectPullEntries(localIndex: NativeSyncIndexEntry[], remoteIndex: NativeSyncIndexEntry[]) {
  const localByKey = new Map(localIndex.map((entry) => [entryKey(entry), entry]));
  return remoteIndex
    .filter(isGenericEntry)
    .filter((remote) => shouldPullObject(localByKey.get(entryKey(remote)), remote));
}

function groupEntriesByType(entries: StateSyncIndexEntry[]) {
  const byType = new Map<NativeSyncObjectRecord['object_type'], string[]>();
  for (const entry of entries) {
    byType.set(entry.object_type, [...(byType.get(entry.object_type) ?? []), entry.object_id]);
  }
  return [...byType.entries()];
}

function buildObjectsPath(objectType: NativeSyncObjectRecord['object_type'], objectIds: string[]) {
  const params = new URLSearchParams();
  params.append('object_type', objectType);
  for (const objectId of objectIds) {
    params.append('object_id', objectId);
  }
  return `${SYNC_OBJECTS_PATH}?${params.toString()}`;
}

async function loadRemoteObjects(endpointUrl: string, entries: StateSyncIndexEntry[]) {
  const objectBatches = await Promise.all(
    groupEntriesByType(entries).map(async ([objectType, objectIds]) => {
      const payload = await fetchDesktopJson<{ objects: NativeSyncObjectRecord[] }>(
        endpointUrl,
        buildObjectsPath(objectType, objectIds)
      );
      return payload.objects;
    })
  );
  return objectBatches.flat();
}

export async function bootstrapCompanionFromDesktopState(endpointUrl: string) {
  const [localIndex, remotePayload] = await Promise.all([
    loadCompanionSyncIndex(),
    fetchDesktopJson<{ entries: NativeSyncIndexEntry[] }>(endpointUrl, SYNC_INDEX_PATH)
  ]);
  const pullEntries = collectPullEntries(localIndex, remotePayload.entries);
  if (pullEntries.length === 0) {
    return { appliedObjectIds: [], requestedObjectIds: [] };
  }
  const objects = await loadRemoteObjects(endpointUrl, pullEntries);
  return {
    appliedObjectIds: await applyCompanionSyncObjects(objects),
    requestedObjectIds: pullEntries.map((entry) => entry.object_id)
  };
}
