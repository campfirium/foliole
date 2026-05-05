import { runSyncPullSession } from '../../../lib/core/sync/syncSessionService';
import type {
  NativeSyncIndexEntry,
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord
} from '../../../lib/platform/nativeSyncContract';
import { createNativeSyncRuntimePort } from '../../../lib/platform/nativeSyncRuntimePort';
import {
  invokeLoadSyncIndex,
  invokeLoadSyncNodeConflicts
} from '../../../lib/platform/nativeSyncInvoke';

import { getRuntimeInvoke } from './runtimeInvoke';

function buildRemoteNodeSource(
  remoteIndex: NativeSyncIndexEntry[],
  remoteNodes: NativeSyncNodeRecord[],
  remoteObjects: NativeSyncObjectRecord[] = []
) {
  return {
    loadSyncIndex: async () => remoteIndex,
    loadSyncNodes: async (objectIds: string[]) => {
      const requestedIds = new Set(objectIds);
      return remoteNodes.filter((node) => requestedIds.has(node.object_id));
    },
    loadSyncObjects: async (objectIds: string[], objectTypes?: string[]) => {
      const requestedIds = new Set(objectIds);
      const requestedTypes = objectTypes ? new Set(objectTypes) : null;
      return remoteObjects.filter((object) => (
        requestedIds.has(object.object_id) && (!requestedTypes || requestedTypes.has(object.object_type))
      ));
    }
  };
}

export async function loadLocalSyncIndexFromRuntime(): Promise<NativeSyncIndexEntry[] | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return invokeLoadSyncIndex(runtimeInvoke);
}

export async function loadNodeSyncConflictsFromRuntime(
  objectId?: string
): Promise<NativeSyncNodeConflictRecord[] | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const conflicts = objectId
    ? await invokeLoadSyncNodeConflicts(runtimeInvoke, { objectIds: [objectId] })
    : await invokeLoadSyncNodeConflicts(runtimeInvoke);
  return conflicts as NativeSyncNodeConflictRecord[];
}

export async function runNodeSyncPullSessionFromRuntime(args: {
  remoteIndex: NativeSyncIndexEntry[];
  remoteNodes: NativeSyncNodeRecord[];
  remoteObjects?: NativeSyncObjectRecord[];
}): Promise<Awaited<ReturnType<typeof runSyncPullSession>> | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runSyncPullSession(
    createNativeSyncRuntimePort(runtimeInvoke),
    buildRemoteNodeSource(args.remoteIndex, args.remoteNodes, args.remoteObjects)
  );
}
