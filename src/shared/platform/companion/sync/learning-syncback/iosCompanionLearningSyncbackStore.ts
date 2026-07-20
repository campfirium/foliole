import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import { createCapacitorSqliteDbPort } from '../../../capacitorSqliteDbPort';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from '../../../companionSyncNodeVersions';

import {
  createCompanionLearningSyncbackDbStore,
  type CompanionLearningSyncbackDbStore
} from './companionLearningSyncbackDbStore';

let sharedStore: CompanionLearningSyncbackDbStore | null = null;

export function getIosCompanionLearningSyncbackStore() {
  sharedStore ??= createIosCompanionLearningSyncbackStore();
  return sharedStore;
}

export function createIosCompanionLearningSyncbackStore(
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
): CompanionLearningSyncbackDbStore {
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
  operation: (store: CompanionLearningSyncbackDbStore) => Promise<T>
) {
  const connection = await openCompanionDatabaseConnection(manager);
  try {
    return await operation(createCompanionLearningSyncbackDbStore(createCapacitorSqliteDbPort(connection)));
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}
