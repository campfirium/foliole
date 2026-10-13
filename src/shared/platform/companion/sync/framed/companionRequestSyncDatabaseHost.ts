import type { RequestSyncDatabaseHost } from '../../../../../../lib/core/sync/requestSyncObjectEndpoint.js';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';
import { iosCompanionHostName } from '../../runtime/iosCompanionMutationState.js';

import { currentCompanionFramedSyncFiles } from './companionFramedSyncFiles.js';

/** The owner serializes writes while its independent readonly connection produces request files. */
export async function currentCompanionRequestSyncDatabaseHost(
  objectApplied: RequestSyncDatabaseHost['objectApplied'] = () => undefined
): Promise<RequestSyncDatabaseHost> {
  const owner = getIosCompanionDatabaseOwner();
  const databasePath = owner.databasePath;
  const files = await currentCompanionFramedSyncFiles();
  const checkLibrary = () => {
    if (owner.databasePath !== databasePath) throw new Error('request_sync_library_changed');
  };
  return {
    enqueueSearchInvalidations: false,
    objectApplied,
    objectOptions: async db => ({ hostName: await iosCompanionHostName(db) }),
    files,
    readSnapshot: (read, signal) => owner.readSnapshot(db => {
      checkLibrary();
      return read(db);
    }, signal),
    write: write => runCompanionSyncWriterTask(() => owner.runWriter(db => {
      checkLibrary();
      return write(db);
    }))
  };
}
