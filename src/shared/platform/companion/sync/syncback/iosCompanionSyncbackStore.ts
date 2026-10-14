import { createCapacitorSqliteDbPort } from '../../../capacitorSqliteDbPort';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from '../../../companionSyncNodeVersions';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';

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
  manager?: CompanionSqliteConnectionManager
): CompanionSyncbackDbStore {
  let operationTail: Promise<unknown> = Promise.resolve();
  const run = <T>(operation: (store: CompanionSyncbackDbStore) => Promise<T>) => {
    const next = operationTail.then(
      () => withStore(operation, manager),
      () => withStore(operation, manager)
    );
    operationTail = next.catch(() => undefined);
    return next;
  };
  return {
    loadNodeVersions: (peerId, cursor, limit) => run((store) => store.loadNodeVersions(peerId, cursor, limit)),
    loadNodeVersionPushCursor: () => run((store) => store.loadNodeVersionPushCursor()),
    loadReviewLog: (peerId, cursor, limit) => run((store) => store.loadReviewLog(peerId, cursor, limit)),
    loadReviewLogPushCursor: () => run((store) => store.loadReviewLogPushCursor()),
    loadStateChanges: (peerId, cursor, limit) => run((store) => store.loadStateChanges(peerId, cursor, limit)),
    loadStatePushCursor: () => run((store) => store.loadStatePushCursor()),
    savePushAcks: (peerId, acks) => run((store) => store.savePushAcks(peerId, acks)),
    stagePushItems: (peerId, items) => run((store) => store.stagePushItems(peerId, items)),
    saveNodeVersionPushCursor: (cursor) => run((store) => store.saveNodeVersionPushCursor(cursor)),
    saveReviewLogPushCursor: (cursor) => run((store) => store.saveReviewLogPushCursor(cursor)),
    saveStatePushCursor: (cursor) => run((store) => store.saveStatePushCursor(cursor))
  };
}

async function withStore<T>(
  operation: (store: CompanionSyncbackDbStore) => Promise<T>,
  manager?: CompanionSqliteConnectionManager
) {
  if (!manager) {
    return getIosCompanionDatabaseOwner().runWriter((db) => operation(createCompanionSyncbackDbStore(db)));
  }
  const connection = await openCompanionDatabaseConnection(manager);
  try {
    return await operation(createCompanionSyncbackDbStore(createCapacitorSqliteDbPort(connection)));
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}
