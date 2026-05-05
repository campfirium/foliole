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

export function createNativeSyncRuntimePort(invoke: NativeInvoke): SyncRuntimePort {
  return {
    applySyncNodes: (nodes) => invokeApplySyncNodes(invoke, { nodes }),
    applySyncObjects: (objects) => invokeApplySyncObjects(invoke, { objects }),
    loadSyncIndex: () => invokeLoadSyncIndex(invoke),
    loadSyncNodes: (objectIds) => invokeLoadSyncNodes(invoke, { objectIds }),
    loadSyncObjects: (objectIds, objectTypes) => invokeLoadSyncObjects(invoke, { objectIds, objectTypes }),
    recordSyncNodeConflicts: (conflicts) => invokeRecordSyncNodeConflicts(invoke, { conflicts })
  };
}
