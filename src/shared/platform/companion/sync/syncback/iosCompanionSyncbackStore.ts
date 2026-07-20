import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import { createCapacitorSqliteDbPort } from '../../../capacitorSqliteDbPort';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from '../../../companionSyncNodeVersions';

import {
  createCompanionSyncbackDbStore,
  type CompanionSyncbackDbStore
} from './companionSyncbackDbStore';

let sharedStore: CompanionSyncbackDbStore | null = null;

export function getIosCompanionSyncbackStore() {
  sharedStore ??= createIosCompanionSyncbackStore();
  return sharedStore;
}

export function createIosCompanionSyncbackStore(
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
): CompanionSyncbackDbStore {
  return {
    loadNodeVersions: (cursor, limit) => withStore(manager, (store) => store.loadNodeVersions(cursor, limit)),
    loadNodeVersionPushCursor: () => withStore(manager, (store) => store.loadNodeVersionPushCursor()),
    loadReviewLog: (cursor, limit) => withStore(manager, (store) => store.loadReviewLog(cursor, limit)),
    loadReviewLogPushCursor: () => withStore(manager, (store) => store.loadReviewLogPushCursor()),
    loadStateChanges: (cursor, limit) => withStore(manager, (store) => store.loadStateChanges(cursor, limit)),
    loadStatePushCursor: () => withStore(manager, (store) => store.loadStatePushCursor()),
    savePushAcks: (acks) => withStore(manager, (store) => store.savePushAcks(acks)),
    saveNodeVersionPushCursor: (cursor) => withStore(manager, (store) => store.saveNodeVersionPushCursor(cursor)),
    saveReviewLogPushCursor: (cursor) => withStore(manager, (store) => store.saveReviewLogPushCursor(cursor)),
    saveStatePushCursor: (cursor) => withStore(manager, (store) => store.saveStatePushCursor(cursor))
  };
}

async function withStore<T>(
  manager: CompanionSqliteConnectionManager,
  operation: (store: CompanionSyncbackDbStore) => Promise<T>
) {
  const connection = await openCompanionDatabaseConnection(manager);
  try {
    return await operation(createCompanionSyncbackDbStore(createCapacitorSqliteDbPort(connection)));
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}
