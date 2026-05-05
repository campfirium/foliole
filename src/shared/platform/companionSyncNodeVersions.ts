import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

import { applySyncNodesWithDbPort } from '../../../lib/core/sync/syncNodeApplyExecutor';
import type { NativeSyncNodeRecord } from '../../../lib/platform/nativeSyncContract';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from './companionWorkspaceSyncBridge';

export async function applyCompanionSyncNodeVersions(nodes: NativeSyncNodeRecord[]) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [];
  }
  return (await FolioleCompanionSync.applySyncNodeVersions({ nodes })).applied_node_ids;
}

export async function applyCompanionSyncNodeVersionsWithSharedCore(
  connection: SQLiteDBConnection,
  nodes: NativeSyncNodeRecord[]
) {
  const port = createCapacitorSqliteDbPort(connection);
  const result = await applySyncNodesWithDbPort(port, nodes, { includeAlreadyApplied: true });
  if (result.conflictNodes.length > 0) {
    throw new Error('shared_node_conflict_copy_not_migrated');
  }
  return result.appliedIds;
}
