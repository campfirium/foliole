import { loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { reconcileVersionedInlineBodies } from '../database/syncBodyProjectionReconcile.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { loadPendingWatchedFolderConflicts } from '../database/watchedFolderConflictDecisions.js';

import { runDesktopFramedSyncInventoryRound } from './desktopFramedSyncInventoryRound.js';
import { recordDesktopSyncActivity, type DesktopSyncActivityContext } from './desktopSyncActivityStore.js';
import { exchangeDesktopSyncGroupMemberState } from './desktopSyncGroupMemberState.js';
import { assertDesktopSyncGroupPeerCompatible } from './desktopSyncGroupPeerCompatibility.js';
import { runDesktopSyncGroupPeerSingleFlight } from './desktopSyncGroupPeerSingleFlight.js';
import {
  loadDesktopSyncGroupRoutes,
  type DesktopSyncGroupPeer
} from './desktopSyncGroupRoutes.js';

export type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

export function loadDesktopSyncGroupPeers() {
  const group = loadDesktopSyncGroup();
  return group ? loadDesktopSyncGroupRoutes(group.group_id) : [];
}

export async function continueDesktopSyncGroupSync(
  peer?: DesktopSyncGroupPeer,
  activity?: DesktopSyncActivityContext
) {
  const target = peer ?? loadDesktopSyncGroupPeers()[0];
  if (!target) return null;
  return runDesktopSyncGroupPeerSingleFlight(
    target.peer_device_id,
    () => continuePeerSync(target, activity)
  );
}

async function continuePeerSync(
  target: DesktopSyncGroupPeer,
  activity?: DesktopSyncActivityContext
) {
  await runPeerSyncStage(
    'compatibility',
    () => assertDesktopSyncGroupPeerCompatible(target),
    target,
    activity
  );
  const memberState = await runPeerSyncStage(
    'member_state',
    () => exchangeDesktopSyncGroupMemberState(target),
    target,
    activity
  );
  if (memberState.localExited) {
    void import('./lanWorkspaceSyncServer.js').then(({ stopLanWorkspaceSyncServer }) =>
      stopLanWorkspaceSyncServer());
    throw new Error('sync_group_local_device_removed');
  }
  if (memberState.peerBlocked) return skipPeerSync(target, activity, 'membership');
  if (memberState.normalSyncReady === false && !memberState.restoreFromPeer) {
    return skipPeerSync(target, activity, 'not_ready');
  }
  if (memberState.restoreFromPeer) {
    await runPeerSyncStage(
      'member_state',
      () => exchangeDesktopSyncGroupMemberState(target),
      target,
      activity
    );
  }
  const pendingConflicts = await runWithDatabaseConnectionOwner(
    () => loadPendingWatchedFolderConflicts()
  );
  const adoption = await loadSyncGroupLocalAdoption(createBetterSqliteDbPort(openDatabaseConnection().sqlite));
  if (pendingConflicts.length && !adoption) return skipPeerSync(target, activity, 'watched_conflict');
  const result = await runPeerSyncStage('sync_pack', () => runDesktopFramedSyncInventoryRound({
    localLibraryEpoch: memberState.localLibraryEpoch,
    peer: target,
    remoteLibraryEpoch: memberState.remoteLibraryEpoch,
    ...(memberState.restoreFromPeer ? { restoreId: memberState.restoreFromPeer } : {})
  }), target, activity);
  if (result.complete) {
    await runPeerSyncStage(
      'member_state',
      () => exchangeDesktopSyncGroupMemberState(target),
      target,
      activity
    );
  }
  await runWithDatabaseConnectionOwner(() =>
    reconcileVersionedInlineBodies(openDatabaseConnection().driver));
  return { complete: result.complete };
}

async function skipPeerSync(
  peer: DesktopSyncGroupPeer,
  activity: DesktopSyncActivityContext | undefined,
  reason: 'membership' | 'not_ready' | 'watched_conflict'
) {
  if (activity) {
    await recordDesktopSyncActivity(activity, {
      direction: 'exchange', kind: 'stage_finished', message: reason,
      result: 'blocked', stage: 'member_state', status: 'skipped'
    }, peer);
  }
  return { complete: false };
}

async function runPeerSyncStage<T>(
  stage: 'compatibility' | 'member_state' | 'sync_pack',
  execute: () => Promise<T>,
  peer: DesktopSyncGroupPeer,
  activity?: DesktopSyncActivityContext
) {
  const direction = stage === 'sync_pack' ? 'receive' : 'exchange';
  if (activity) {
    await recordDesktopSyncActivity(activity, {
      direction, kind: 'diagnostic', message: stage, stage, status: 'started'
    }, peer);
  }
  try {
    const result = await execute();
    if (activity) {
      await recordDesktopSyncActivity(activity, {
        direction, kind: 'stage_finished', message: stage, stage, status: 'completed',
        ...(stage === 'sync_pack' ? { confirmation: 'saved' as const } : {})
      }, peer);
    }
    return result;
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error
      ? `; cause=${error.cause.message}` : '';
    const detail = `${error instanceof Error ? error.message : String(error)}${cause}`;
    if (activity) {
      await recordDesktopSyncActivity(activity, {
        direction, kind: 'stage_finished', message: detail, stage, status: 'failed'
      }, peer);
    }
    if (stage === 'compatibility') throw error;
    throw new Error(`sync_group_${stage}_failed: ${detail}`, { cause: error });
  }
}
