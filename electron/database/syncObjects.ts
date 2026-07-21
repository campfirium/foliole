import { openDatabaseConnection } from './connection.js';
import {
  loadSyncObjectsFromDriver,
  loadSyncStateObjectsSinceFromDriver
} from './syncObjectsFromDriver.js';

export function loadSyncObjects(objectIds: string[], objectTypes?: string[]) {
  return loadSyncObjectsFromDriver(openDatabaseConnection().driver, objectIds, objectTypes);
}

export function loadSyncStateObjectsSince(cursor: number, limit = 500) {
  return loadSyncStateObjectsSinceFromDriver(openDatabaseConnection().driver, cursor, limit);
}
