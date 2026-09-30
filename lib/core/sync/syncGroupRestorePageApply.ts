import type { DbPort } from './dbPort.js';
import { loadLatestSyncGroupRestoreEvent, markSyncGroupRestoreApplied } from './syncGroupRestoreEvents.js';
import { loadStoredRestorePage, storeRestorePage } from './syncGroupRestorePageStorage.js';
import { clearWorkgroupSyncDataForRestore } from './syncGroupRestoreReset.js';
import { readSyncPackCursorWithDbPort, type SyncPackCursor } from './syncPackCursor.js';
import { clearAppliedSyncPackDependencies, prepareSyncPackDependencies } from './syncPackDependencyApply.js';
import { clearSyncPackKnownFactClaims } from './syncPackKnownFactClaims.js';
import type { applySyncPackNodeSurfaceWithDbPort } from './syncPackNodeApplyExecutor.js';
import { loadSyncPackReceiveProgress, saveSyncPackReceiveProgress,
  shouldApplySyncPackPage } from './syncPackReceiveProgress.js';

type SurfaceResult = Awaited<ReturnType<typeof applySyncPackNodeSurfaceWithDbPort>>;
type RestoreResult = SurfaceResult & { restorePending?: boolean };

export async function applySyncGroupRestorePage(port: DbPort, args: {
  after: number;
  apply: (tx: DbPort, after: number) => Promise<SurfaceResult>;
  peerId: string;
  restoreId: string;
}): Promise<{ result: RestoreResult; removedNodeIds: string[] }> {
  const cursor = await readSyncPackCursorWithDbPort(port);
  if (cursor.restoreId !== args.restoreId) throw new Error('sync_group_restore_pack_mismatch');
  return port.transaction(async (tx) => {
    const scope = await loadSyncPackReceiveProgress(tx, args.peerId);
    const latest = await loadLatestSyncGroupRestoreEvent(tx, scope.groupId);
    if (!latest || latest.event.restore_id !== args.restoreId) throw new Error('sync_group_restore_superseded');
    if (latest.event.source_device_identity_key !== args.peerId) throw new Error('sync_group_restore_source_mismatch');
    if (latest.applied) return { result: emptyResult(cursor), removedNodeIds: [] as string[] };
    if (cursor.dependencyPage) return {
      result: await args.apply(tx, args.after), removedNodeIds: [] as string[]
    };
    const progress = scope.progress?.restoreId === args.restoreId ? scope.progress : null;
    const shouldStage = shouldApplySyncPackPage(cursor, progress, args.after, false);
    if (!shouldStage) return { result: { ...emptyResult(cursor), restorePending: true },
      removedNodeIds: [] as string[] };
    if (args.after === 0) await tx.run('DELETE FROM sync_group_restore_page_rows');
    await preparePageForStorage(tx, cursor, scope.groupId, args.peerId);
    await storeRestorePage(tx, args.restoreId, cursor.fromStateSeq);
    await saveSyncPackReceiveProgress(tx, scope.groupId, args.peerId, cursor);
    if (cursor.toStateSeq !== cursor.frontierStateSeq) return {
      result: { ...emptyResult(cursor), restorePending: true }, removedNodeIds: [] as string[]
    };
    const removedNodeIds = await clearWorkgroupSyncDataForRestore(tx, args.restoreId);
    const result = await replayRestorePages(tx, args, cursor);
    await markSyncGroupRestoreApplied(tx, latest.event);
    await tx.run('DELETE FROM sync_group_restore_page_rows');
    return { result, removedNodeIds };
  });
}

async function preparePageForStorage(port: DbPort, cursor: SyncPackCursor, groupId: string, peerId: string) {
  const claims = await prepareSyncPackDependencies(port, { cursor, groupId, peerId, incomingAlias: 'inc' });
  await clearAppliedSyncPackDependencies(port, cursor.dependencyTransfers);
  if (claims) await clearSyncPackKnownFactClaims(port, claims);
  const [row] = await port.query<{ value: string }>(
    "SELECT value FROM inc.pack_manifest WHERE key = 'manifest_json'");
  const manifest = JSON.parse(row!.value) as Record<string, unknown>;
  delete manifest.dependency_transfers;
  await port.run("UPDATE inc.pack_manifest SET value = ? WHERE key = 'manifest_json'", [JSON.stringify(manifest)]);
}

async function replayRestorePages(port: DbPort, args: {
  apply: (tx: DbPort, after: number) => Promise<SurfaceResult>; restoreId: string;
}, frontier: SyncPackCursor): Promise<RestoreResult> {
  let after = 0;
  const result = emptyResult(frontier);
  for (;;) {
    await loadStoredRestorePage(port, args.restoreId, after);
    const page = await args.apply(port, after);
    result.applied ||= page.applied;
    for (const key of ['appliedBlobCount', 'appliedGroupFactCount', 'appliedObjectCount',
      'handledConflictCount'] as const) result[key] += page[key];
    result.appliedTombstoneNodeIds.push(...page.appliedTombstoneNodeIds);
    result.appliedReviewOpIds.push(...page.appliedReviewOpIds);
    result.participatingArticleIds.push(...page.participatingArticleIds);
    after = page.toStateSeq;
    if (after === frontier.frontierStateSeq) return result;
    if (after <= page.fromStateSeq || after > frontier.frontierStateSeq) throw new Error('sync_pack_round_changed');
  }
}

function emptyResult(cursor: SyncPackCursor): RestoreResult {
  return { applied: false, dependencyProgress: undefined, fromStateSeq: cursor.fromStateSeq,
    toStateSeq: cursor.toStateSeq, frontierStateSeq: cursor.frontierStateSeq,
    sourceEpoch: cursor.sourceEpoch, appliedBlobCount: 0, appliedGroupFactCount: 0,
    appliedObjectCount: 0, handledConflictCount: 0, appliedReviewOpIds: [],
    appliedTombstoneNodeIds: [], participatingArticleIds: [] };
}
