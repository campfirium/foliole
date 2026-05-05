import { runSyncPullSession } from '../../../lib/core/sync/syncSessionService';
import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import type {
  NativeSyncIndexEntry,
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord
} from '../../../lib/platform/nativeSyncContract';
import {
  invokeLoadSyncIndex,
  invokeLoadSyncNodeConflicts
} from '../../../lib/platform/nativeSyncInvoke';

export interface WorkspaceSyncDebugApi {
  loadLocalSyncIndex: () => Promise<NativeSyncIndexEntry[] | null>;
  loadNodeSyncConflicts: (objectId?: string) => Promise<NativeSyncNodeConflictRecord[] | null>;
  runNodeSyncPullSession: (args: {
    remoteIndex: NativeSyncIndexEntry[];
    remoteNodes: NativeSyncNodeRecord[];
    remoteObjects?: NativeSyncObjectRecord[];
  }) => Promise<Awaited<ReturnType<typeof runSyncPullSession>> | null>;
}

type RuntimeInvokeGetter = () => NativeInvoke | null;

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

export function createWorkspaceSyncDebugApi(getRuntimeInvoke: RuntimeInvokeGetter): WorkspaceSyncDebugApi {
  return {
    loadLocalSyncIndex: async () => {
      const runtimeInvoke = getRuntimeInvoke();
      if (!runtimeInvoke) {
        return null;
      }
      return invokeLoadSyncIndex(runtimeInvoke);
    },
    loadNodeSyncConflicts: async (objectId): Promise<NativeSyncNodeConflictRecord[] | null> => {
      const runtimeInvoke = getRuntimeInvoke();
      if (!runtimeInvoke) {
        return null;
      }
      const conflicts = objectId
        ? await invokeLoadSyncNodeConflicts(runtimeInvoke, { objectIds: [objectId] })
        : await invokeLoadSyncNodeConflicts(runtimeInvoke);
      return conflicts as NativeSyncNodeConflictRecord[];
    },
    runNodeSyncPullSession: async ({ remoteIndex, remoteNodes, remoteObjects }) => {
      const runtimeInvoke = getRuntimeInvoke();
      if (!runtimeInvoke) {
        return null;
      }
      return runSyncPullSession(runtimeInvoke, buildRemoteNodeSource(remoteIndex, remoteNodes, remoteObjects));
    }
  };
}
