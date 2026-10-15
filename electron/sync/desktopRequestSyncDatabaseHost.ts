import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { syncGroupLocalPublicationBlockReason } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, resolveDatabasePath, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { materializeDesktopSettingRecord, readDesktopHostName } from '../database/desktopSettingMaterializer.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { withRequestSyncReadonlySnapshot } from '../database/requestSyncReadonlySnapshot.js';

import { createDesktopRequestSyncFiles } from './desktopRequestSyncFiles.js';
import { reportDesktopSyncGroupObjectCommitted } from './desktopSyncGroupCursorCommit.js';
import { notifyWorkspaceSyncApplied } from './workspaceSyncAppliedEvents.js';

export function createDesktopRequestSyncDatabaseHost(databasePath: string): RequestSyncDatabaseHost {
  const files = createDesktopRequestSyncFiles(databasePath);
  return {
    objectOptions: async db => {
      const hostName = await readDesktopHostName(db);
      return { ...(hostName ? { hostName } : {}), onPayloadAppliedInTransaction: materializeDesktopSettingRecord };
    },
    objectApplied: async object => {
      notifyWorkspaceSyncApplied({
        appliedNodeIds: object.objectType === 'node' ? [object.globalId] : [],
        appliedObjectIds: [object.globalId], appliedReviewOpIds: [] });
      await reportDesktopSyncGroupObjectCommitted(object);
    },
    files,
    readSnapshot: async (read, signal) => {
      signal?.throwIfAborted();
      if (resolveDatabasePath() !== databasePath) throw new Error('request_sync_library_changed');
      await withPreparedDesktopSyncConnection(databasePath, async () => {});
      return withRequestSyncReadonlySnapshot(databasePath, read, signal);
    },
    write: write => withPreparedDesktopSyncConnection(databasePath, write)
  };
}

function withPreparedDesktopSyncConnection<T>(databasePath: string, execute: (db: DbPort) => Promise<T>) {
  return runWithDatabaseConnectionOwner(async () => {
    const connection = openDatabaseConnection();
    if (connection.dbPath !== databasePath) throw new Error('request_sync_library_changed');
    const db = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-request-sync' });
    return db.transaction(async tx => {
      if (!await syncGroupLocalPublicationBlockReason(tx)) flushDirtyNodeSyncVersions();
      return execute(tx);
    });
  });
}
