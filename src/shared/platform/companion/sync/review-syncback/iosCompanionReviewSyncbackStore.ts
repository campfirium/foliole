import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import { createCapacitorSqliteDbPort } from '../../../capacitorSqliteDbPort';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from '../../../companionSyncNodeVersions';

import {
  createCompanionReviewSyncbackDbStore,
  type CompanionReviewSyncbackDbStore
} from './companionReviewSyncbackDbStore';

let sharedStore: CompanionReviewSyncbackDbStore | null = null;

export function getIosCompanionReviewSyncbackStore() {
  sharedStore ??= createIosCompanionReviewSyncbackStore();
  return sharedStore;
}

export function createIosCompanionReviewSyncbackStore(
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
): CompanionReviewSyncbackDbStore {
  return {
    loadReviewLog: (cursor, limit) => withStore(manager, (store) => store.loadReviewLog(cursor, limit)),
    loadReviewLogPushCursor: () => withStore(manager, (store) => store.loadReviewLogPushCursor()),
    loadStateChanges: (cursor, limit) => withStore(manager, (store) => store.loadStateChanges(cursor, limit)),
    loadStatePushCursor: () => withStore(manager, (store) => store.loadStatePushCursor()),
    savePushAcks: (acks) => withStore(manager, (store) => store.savePushAcks(acks)),
    saveReviewLogPushCursor: (cursor) => withStore(manager, (store) => store.saveReviewLogPushCursor(cursor)),
    saveStatePushCursor: (cursor) => withStore(manager, (store) => store.saveStatePushCursor(cursor))
  };
}

async function withStore<T>(
  manager: CompanionSqliteConnectionManager,
  operation: (store: CompanionReviewSyncbackDbStore) => Promise<T>
) {
  const connection = await openCompanionDatabaseConnection(manager);
  try {
    return await operation(createCompanionReviewSyncbackDbStore(createCapacitorSqliteDbPort(connection)));
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}
