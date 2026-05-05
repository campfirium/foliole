import type {
  NativeSyncChangeCursor,
  NativeSyncChangeRecord,
  NativeSyncIndexEntry,
  NativeSyncObjectRecord
} from '../../../lib/platform/nativeSyncContract';

import {
  applyCompanionSyncObjects,
  loadCompanionSyncChanges,
  loadCompanionSyncChangeCursor,
  loadCompanionSyncIndex,
  loadCompanionSyncPushCursor,
  saveCompanionSyncChangeCursor,
  saveCompanionSyncPushCursor
} from './companionSyncObjects';
import { createSignedRequestHeaders } from './companionWorkspacePairing';
import { normalizeEndpointUrl } from './companionWorkspaceSyncBridge';

const SYNC_INDEX_PATH = '/companion/sync-index';
const SYNC_CHANGES_PATH = '/companion/sync-changes';
const SYNC_OBJECTS_PATH = '/companion/sync-objects';

function entryKey(entry: Pick<NativeSyncIndexEntry, 'object_id' | 'object_type'>) {
  return `${entry.object_type}:${entry.object_id}`;
}

function isGenericEntry(entry: NativeSyncIndexEntry) {
  return entry.object_type !== 'node';
}

function shouldPullObject(local: NativeSyncIndexEntry | undefined, remote: NativeSyncIndexEntry) {
  return !local || local.content_hash !== remote.content_hash || local.sync_version_id !== remote.sync_version_id;
}

function collectPullEntries(localIndex: NativeSyncIndexEntry[], remoteIndex: NativeSyncIndexEntry[]) {
  const localByKey = new Map(localIndex.map((entry) => [entryKey(entry), entry]));
  return remoteIndex
    .filter(isGenericEntry)
    .filter((remote) => shouldPullObject(localByKey.get(entryKey(remote)), remote));
}

function groupEntriesByType(entries: NativeSyncIndexEntry[]) {
  const byType = new Map<NativeSyncObjectRecord['object_type'], string[]>();
  for (const entry of entries) {
    if (entry.object_type === 'node') continue;
    byType.set(entry.object_type, [...(byType.get(entry.object_type) ?? []), entry.object_id]);
  }
  return [...byType.entries()];
}

async function fetchDesktopJson<T>(endpointUrl: string, pathWithQuery: string): Promise<T> {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const response = await fetch(`${endpoint}${pathWithQuery}`, {
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery })
  });
  if (!response.ok) {
    throw new Error(`Desktop sync source returned ${response.status}.`);
  }
  return await response.json() as T;
}

async function postDesktopJson<T>(endpointUrl: string, pathWithQuery: string, body: unknown): Promise<T> {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const bodyText = JSON.stringify(body);
  const response = await fetch(`${endpoint}${pathWithQuery}`, {
    body: bodyText,
    headers: {
      'Content-Type': 'application/json',
      ...await createSignedRequestHeaders({ bodyText, method: 'POST', pathWithQuery })
    },
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error(`Desktop sync target returned ${response.status}.`);
  }
  return await response.json() as T;
}

function buildObjectsPath(objectType: NativeSyncObjectRecord['object_type'], objectIds: string[]) {
  const params = new URLSearchParams();
  params.append('object_type', objectType);
  for (const objectId of objectIds) {
    params.append('object_id', objectId);
  }
  return `${SYNC_OBJECTS_PATH}?${params.toString()}`;
}

async function loadRemoteObjects(endpointUrl: string, entries: NativeSyncIndexEntry[]) {
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

function buildChangesPath(cursor: NativeSyncChangeCursor | null) {
  const params = new URLSearchParams();
  params.set('limit', '500');
  if (cursor) {
    params.set('after_created_at', cursor.created_at);
    params.set('after_change_id', cursor.change_id);
  }
  return `${SYNC_CHANGES_PATH}?${params.toString()}`;
}

function changeToObjectRecord(change: NativeSyncChangeRecord): NativeSyncObjectRecord {
  return {
    content_hash: change.content_hash,
    deleted_at: change.change_type === 'delete' ? change.created_at : null,
    object_id: change.object_id,
    object_type: change.object_type,
    payload_json: change.change_type === 'delete' ? null : change.payload_json,
    updated_at: change.created_at
  };
}

async function pullRemoteChanges(endpointUrl: string) {
  const cursor = await loadCompanionSyncChangeCursor();
  const payload = await fetchDesktopJson<{ changes: NativeSyncChangeRecord[] }>(
    endpointUrl,
    buildChangesPath(cursor)
  );
  const objects = payload.changes.map(changeToObjectRecord);
  const appliedObjectIds = objects.length ? await applyCompanionSyncObjects(objects) : [];
  const lastChange = payload.changes.at(-1);
  if (lastChange) {
    await saveCompanionSyncChangeCursor({
      change_id: lastChange.change_id,
      created_at: lastChange.created_at
    });
  }
  return {
    appliedObjectIds,
    changedObjectIds: payload.changes.map((change) => change.object_id)
  };
}

async function pullRemoteStateDiff(endpointUrl: string) {
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

async function pushLocalChanges(endpointUrl: string) {
  const cursor = await loadCompanionSyncPushCursor();
  const changes = await loadCompanionSyncChanges(cursor, 500);
  const objects = changes.map(changeToObjectRecord);
  if (objects.length === 0) {
    return { pushedObjectIds: [] };
  }
  await postDesktopJson<{ applied_object_ids: string[] }>(endpointUrl, SYNC_OBJECTS_PATH, { objects });
  const lastChange = changes.at(-1);
  if (lastChange) {
    await saveCompanionSyncPushCursor({
      change_id: lastChange.change_id,
      created_at: lastChange.created_at
    });
  }
  return { pushedObjectIds: changes.map((change) => change.object_id) };
}

export async function syncCompanionObjectsFromDesktop(endpointUrl: string) {
  const pushed = await pushLocalChanges(endpointUrl);
  const changes = await pullRemoteChanges(endpointUrl);
  const stateDiff = await pullRemoteStateDiff(endpointUrl);
  return {
    appliedObjectIds: [...changes.appliedObjectIds, ...stateDiff.appliedObjectIds],
    changedObjectIds: changes.changedObjectIds,
    pushedObjectIds: pushed.pushedObjectIds,
    requestedObjectIds: stateDiff.requestedObjectIds
  };
}
