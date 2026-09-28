import type { DbPort } from './dbPort.js';
import type { SyncPackNodeSurfaceApplyOptions } from './syncPackNodeApplyExecutor.js';
import { applySyncPackNodeTombstonesWithDbPort } from './syncPackNodeTombstoneExecutor.js';
import { clearConfirmedSyncPackPushAcks } from './syncPackPushAckClear.js';

export async function applyReplayPackTombstones(port: DbPort,
  options: SyncPackNodeSurfaceApplyOptions, toStateSeq: number) {
  const appliedTombstoneNodeIds = await applySyncPackNodeTombstonesWithDbPort(
    port, options.incomingAlias, options.enqueueSearchInvalidations !== false
  );
  await clearConfirmedSyncPackPushAcks(port, options, toStateSeq);
  return {
    appliedBlobCount: 0,
    appliedGroupFactCount: 0,
    appliedObjectCount: 0,
    appliedReviewOpIds: [] as string[],
    handledConflictCount: 0,
    appliedTombstoneNodeIds
  };
}
