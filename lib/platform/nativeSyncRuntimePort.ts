import type { SyncRuntimePort } from '../core/sync/syncSessionService.js';

import type { NativeInvoke } from './nativeContract.js';
import {
  invokeApplySyncNodes,
  invokeApplySyncObjects,
  invokeLoadSyncIndex,
  invokeLoadSyncNodes,
  invokeLoadSyncObjects,
  invokeRecordSyncNodeConflicts
} from './nativeSyncInvoke.js';

const SYNC_OBJECT_IPC_CHUNK_SIZE = 128;

function chunkArray<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

async function loadSyncObjectsInChunks(
  invoke: NativeInvoke,
  objectIds: string[],
  objectTypes?: string[]
) {
  const records = await Promise.all(chunkArray(objectIds, SYNC_OBJECT_IPC_CHUNK_SIZE).map((chunk) =>
    invokeLoadSyncObjects(invoke, {
      objectIds: chunk,
      ...(objectTypes === undefined ? {} : { objectTypes })
    })
  ));
  return records.flat();
}

async function applySyncObjectsInChunks(
  invoke: NativeInvoke,
  objects: Parameters<typeof invokeApplySyncObjects>[1]['objects']
) {
  const appliedIds = await Promise.all(chunkArray(objects, SYNC_OBJECT_IPC_CHUNK_SIZE).map((chunk) =>
    invokeApplySyncObjects(invoke, { objects: chunk })
  ));
  return appliedIds.flat();
}

export function createNativeSyncRuntimePort(invoke: NativeInvoke): SyncRuntimePort {
  return {
    applySyncNodes: (nodes) => invokeApplySyncNodes(invoke, { nodes }),
    applySyncObjects: (objects) => objects.length > 0 ? applySyncObjectsInChunks(invoke, objects) : Promise.resolve([]),
    loadSyncIndex: () => invokeLoadSyncIndex(invoke),
    loadSyncNodes: (objectIds) => invokeLoadSyncNodes(invoke, { objectIds }),
    loadSyncObjects: (objectIds, objectTypes) =>
      objectIds.length > 0 ? loadSyncObjectsInChunks(invoke, objectIds, objectTypes) : Promise.resolve([]),
    recordSyncNodeConflicts: (conflicts) => invokeRecordSyncNodeConflicts(invoke, { conflicts })
  };
}
