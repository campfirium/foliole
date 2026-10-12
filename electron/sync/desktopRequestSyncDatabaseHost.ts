import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, resolveDatabasePath, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { materializeDesktopSettingRecord, readDesktopHostName } from '../database/desktopSettingMaterializer.js';
import { withRequestSyncReadonlySnapshot } from '../database/requestSyncReadonlySnapshot.js';

import { createDesktopRequestSyncFiles } from './desktopRequestSyncFiles.js';
import { notifyWorkspaceSyncApplied } from './workspaceSyncAppliedEvents.js';

export function createDesktopRequestSyncDatabaseHost(databasePath: string): RequestSyncDatabaseHost {
  const files = createDesktopRequestSyncFiles(databasePath);
  return {
    objectOptions: async db => {
      const hostName = await readDesktopHostName(db);
      return { ...(hostName ? { hostName } : {}), onPayloadAppliedInTransaction: materializeDesktopSettingRecord };
    },
    objectApplied: object => notifyWorkspaceSyncApplied({
      appliedNodeIds: object.objectType === 'node' ? [object.globalId] : [],
      appliedObjectIds: [object.globalId], appliedReviewOpIds: [] }),
    files,
    readSnapshot: (read, signal) => {
      if (resolveDatabasePath() !== databasePath) throw new Error('request_sync_library_changed');
      return withRequestSyncReadonlySnapshot(databasePath, read, signal);
    },
    write: write => runWithDatabaseConnectionOwner(() => {
      const connection = openDatabaseConnection();
      if (connection.dbPath !== databasePath) throw new Error('request_sync_library_changed');
      return write(createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-request-sync' }));
    })
  };
}
