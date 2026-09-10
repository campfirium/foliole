import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

import { applySyncObjectsWithDbPort } from '../../../lib/core/sync/syncObjectApplyExecutor';
import type { NativeSyncObjectRecord } from '../../../lib/platform/nativeSyncContract';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import { getIosCompanionDatabaseOwner } from './companion/runtime/iosCompanionDatabaseBootstrap';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from './companionSyncNodeVersions';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';

export async function applyCompanionSyncObjects(objects: NativeSyncObjectRecord[]) {
  const runtime = getCompanionRuntimeCapability();
  if ((runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') || objects.length === 0) {
    return [];
  }
  if (runtime.kind === 'android-native' || runtime.kind === 'ios-native') {
    return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((db) => (
      applySyncObjectsWithDbPort(db, objects)
    )));
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
