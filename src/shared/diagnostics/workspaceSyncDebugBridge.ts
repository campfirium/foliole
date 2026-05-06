import type {
  NativeSyncIndexEntry,
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord
} from '../../../lib/platform/nativeSyncContract';
import {
  loadLocalSyncIndexFromRuntime,
  loadNodeSyncConflictsFromRuntime,
  runNodeSyncPullSessionFromRuntime
} from '../platform/workspaceSyncDebugRuntimeRepository';

export interface WorkspaceSyncDebugApi {
  loadLocalSyncIndex: () => Promise<NativeSyncIndexEntry[] | null>;
  loadNodeSyncConflicts: (objectId?: string) => Promise<NativeSyncNodeConflictRecord[] | null>;
  runNodeSyncPullSession: (args: {
    remoteIndex: NativeSyncIndexEntry[];
    remoteNodes: NativeSyncNodeRecord[];
    remoteObjects?: NativeSyncObjectRecord[];
  }) => ReturnType<typeof runNodeSyncPullSessionFromRuntime>;
}

export function createWorkspaceSyncDebugApi(): WorkspaceSyncDebugApi {
  return {
    loadLocalSyncIndex: loadLocalSyncIndexFromRuntime,
    loadNodeSyncConflicts: loadNodeSyncConflictsFromRuntime,
    runNodeSyncPullSession: runNodeSyncPullSessionFromRuntime
  };
}
