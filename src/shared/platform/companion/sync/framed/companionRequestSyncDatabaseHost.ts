import { readDailyFlow } from '../../../../../../lib/core/flow/dailyFlowStorage.js';
import type { RequestSyncDatabaseHost } from '../../../../../../lib/core/sync/requestSyncObjectEndpoint.js';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue.js';
import { registerCompanionSyncAppliedRefresh, updateCommittedCompanionWorkspace } from '../../companionWorkspaceSnapshotStore.js';
import { getCompanionReadingScope } from '../../reading/companionReadingScope.js';
import { refreshCompanionDailyFlowAfterSync } from '../../runtime/companionDailyFlow.js';
import { companionFramedFileOwner } from '../../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';
import { iosCompanionHostName } from '../../runtime/iosCompanionMutationState.js';

import { currentCompanionFramedSyncFiles } from './companionFramedSyncFiles.js';

/** The owner serializes writes while its independent readonly connection produces request files. */
export async function currentCompanionRequestSyncDatabaseHost(
  objectApplied: RequestSyncDatabaseHost['objectApplied'] = () => undefined
): Promise<RequestSyncDatabaseHost> {
  const owner = getIosCompanionDatabaseOwner();
  const session = getCompanionReadingScope();
  const databasePath = owner.databasePath;
  const generation = companionFramedFileOwner(owner).generation_id;
  const files = await currentCompanionFramedSyncFiles();
  const checkLibrary = () => {
    if (owner !== getIosCompanionDatabaseOwner() || owner.databasePath !== databasePath ||
        generation !== companionFramedFileOwner(owner).generation_id) throw new Error('request_sync_library_changed');
  };
  const host: RequestSyncDatabaseHost = {
    databaseRoundCompleted: async () => {
      const current = await host.write(async db => await refreshCompanionDailyFlowAfterSync(db)
        ? (await readDailyFlow(db))?.session.currentNodeId : undefined);
      if (current) registerCompanionSyncAppliedRefresh({ kind: 'nodes', nodeIds: [current] });
    },
    enqueueSearchInvalidations: false,
    refreshNodeIndex: async (db, scope) => {
      if (session === getCompanionReadingScope()) await updateCommittedCompanionWorkspace(scope, db);
    },
    objectApplied: async object => {
      if (session !== getCompanionReadingScope()) return;
      registerCompanionSyncAppliedRefresh(object.workspaceScope);
      await objectApplied?.(object);
    },
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
  return host;
}
