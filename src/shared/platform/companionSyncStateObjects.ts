import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

import { applySyncObjectsWithDbPort } from '../../../lib/core/sync/syncObjectApplyExecutor';
import type { NativeSyncObjectRecord } from '../../../lib/platform/nativeSyncContract';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from './companionSyncNodeVersions';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import { isNativeAndroidCompanionRuntime } from './companionWorkspaceRuntimeRepository';

export async function applyCompanionSyncObjects(objects: NativeSyncObjectRecord[]) {
  if (!isNativeAndroidCompanionRuntime() || objects.length === 0) {
    return [];
  }
  return runCompanionSyncWriterTask(() => applyCompanionSyncObjectsWithSharedCoreOnDevice(objects));
}

export async function applyCompanionSyncObjectsWithSharedCore(
  connection: SQLiteDBConnection,
  objects: NativeSyncObjectRecord[]
) {
  const port = createCapacitorSqliteDbPort(connection);
  return applySyncObjectsWithDbPort(port, objects);
}

export async function applyCompanionSyncObjectsWithSharedCoreOnDevice(
  objects: NativeSyncObjectRecord[],
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  const connection = await openCompanionDatabaseConnection(manager);
  try {
    return await applyCompanionSyncObjectsWithSharedCore(connection, objects);
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}
