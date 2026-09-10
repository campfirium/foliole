import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

import { applySyncObjectsWithDbPort } from '../../../lib/core/sync/syncObjectApplyExecutor';
import type { NativeSyncObjectRecord } from '../../../lib/platform/nativeSyncContract';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import {
  confirmCompanionAttachmentRetirement,
  finishCompanionAttachmentRetirement,
  prepareCompanionAttachmentRetirement,
  recordCompanionAttachmentRetirement
} from './companion/attachmentRetirement';
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
    return runCompanionSyncWriterTask(async () => {
      const owner = getIosCompanionDatabaseOwner();
      const retirement = await prepareCompanionAttachmentRetirement(objects, owner.databasePath);
      try {
        return await owner.runWriter((db) => db.transaction(async (tx) => {
          const applied = await applySyncObjectsWithDbPort(tx, objects);
          await recordCompanionAttachmentRetirement(tx, retirement, 'database_committed');
          if (!await confirmCompanionAttachmentRetirement(tx, retirement)) {
            throw new Error('Attachment retirement database identity was not committed.');
          }
          await finishCompanionAttachmentRetirement(retirement, true);
          await recordCompanionAttachmentRetirement(tx, retirement, 'verified');
          return applied;
        }));
      } catch (error) {
        await finishCompanionAttachmentRetirement(retirement, false);
        throw error;
      }
    });
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
