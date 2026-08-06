import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

import { applyReviewLogRecordsWithDbPort } from '../../../lib/core/sync/syncPackReviewLogExecutor';
import type { NativeSyncReviewLogRecord } from '../../../lib/platform/nativeSyncContract';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import { getIosCompanionDatabaseOwner } from './companion/runtime/iosCompanionDatabaseBootstrap';
import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from './companionSyncNodeVersions';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';

export async function applyCompanionSyncReviewLog(reviews: NativeSyncReviewLogRecord[]) {
  const runtime = getCompanionRuntimeCapability();
  if ((runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') || reviews.length === 0) {
    return [];
  }
  if (runtime.kind === 'android-native' || runtime.kind === 'ios-native') {
    return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((db) => (
      applyReviewLogRecordsWithDbPort(db, reviews, { requireExistingNode: true })
    )));
  }
  return runCompanionSyncWriterTask(() => applyCompanionSyncReviewLogWithSharedCoreOnDevice(reviews));
}

export async function applyCompanionSyncReviewLogWithSharedCore(
  connection: SQLiteDBConnection,
  reviews: NativeSyncReviewLogRecord[]
) {
  const port = createCapacitorSqliteDbPort(connection);
  return applyReviewLogRecordsWithDbPort(port, reviews, { requireExistingNode: true });
}

export async function applyCompanionSyncReviewLogWithSharedCoreOnDevice(
  reviews: NativeSyncReviewLogRecord[],
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  const connection = await openCompanionDatabaseConnection(manager);
  try {
    return await applyCompanionSyncReviewLogWithSharedCore(connection, reviews);
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}
