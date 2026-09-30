import type { DbPort } from './dbPort.js';
import { readSyncPackCursorWithDbPort } from './syncPackCursor.js';
import { retireSyncPackDependencyView } from './syncPackDependencyResume.js';
import { loadSyncPackReceiveProgress } from './syncPackReceiveProgress.js';

/** Retire unusable transfer evidence only after the failed business transaction rolls back. */
async function retireChangedSyncPackFactClaims(port: DbPort, error: unknown,
  args: { sourcePeerId?: string; incomingAlias?: string }) {
  if (!(error instanceof Error) || error.message !== 'sync_pack_fact_presence_changed' ||
      !args.sourcePeerId) return;
  const scope = await loadSyncPackReceiveProgress(port, args.sourcePeerId);
  if (!scope) return;
  const cursor = await readSyncPackCursorWithDbPort(port, args.incomingAlias);
  const viewIds = cursor.dependencyTransfers?.map((transfer) => transfer.sourceViewId)
    ?? (cursor.packId ? [cursor.packId] : []);
  for (const sourceViewId of new Set(viewIds)) {
    await retireSyncPackDependencyView(port, { groupId: scope.groupId,
      peerId: args.sourcePeerId, sourceViewId });
  }
}

export async function runSyncPackApplyTransaction<T>(port: DbPort,
  args: { sourcePeerId?: string; incomingAlias?: string }, apply: (tx: DbPort) => Promise<T>) {
  try { return await port.transaction(apply); }
  catch (error) {
    await retireChangedSyncPackFactClaims(port, error, args);
    throw error;
  }
}
