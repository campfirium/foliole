import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

import { applyReviewLogRecordsWithDbPort } from '../../../lib/core/sync/syncPackReviewLogExecutor';
import type { NativeSyncReviewLogRecord } from '../../../lib/platform/nativeSyncContract';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import {
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from './companionSyncNodeVersions';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import { isNativeAndroidCompanionRuntime } from './companionWorkspaceSyncBridge';

export async function applyCompanionSyncReviewLog(reviews: NativeSyncReviewLogRecord[]) {
  if (!isNativeAndroidCompanionRuntime() || reviews.length === 0) {
    return [];
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
  return applyCompanionSyncReviewLogWithSharedCore(connection, reviews);
}
