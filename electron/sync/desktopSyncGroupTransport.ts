import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { withRequestSyncPeerRound, type RequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { runSyncPeerRound, isSyncPeerRoundRetryableError } from '../../lib/core/sync/runSyncPeerRound.js';
import { loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { isMobileSyncPlatform } from '../../lib/platform/syncSchedulingPlatform.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { loadPendingWatchedFolderConflicts } from '../database/watchedFolderConflictDecisions.js';

import { desktopPeerSessionRegistry } from './desktopPeerSessionRegistry.js';
import { runDesktopRequestSyncDatabaseRound } from './desktopRequestSyncDatabaseRound.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { continueDesktopRequestSyncResources } from './desktopRequestSyncResources.js';
import { recordDesktopSyncActivity, type DesktopSyncActivityContext } from './desktopSyncActivityStore.js';
import { exchangeDesktopSyncGroupMemberState } from './desktopSyncGroupMemberState.js';
import { assertDesktopSyncGroupPeerCompatible } from './desktopSyncGroupPeerCompatibility.js';
import { runDesktopSyncGroupPeerSingleFlight } from './desktopSyncGroupPeerSingleFlight.js';
import {
  loadDesktopSyncGroupRoutes,
  type DesktopSyncGroupPeer
} from './desktopSyncGroupRoutes.js';
import { collectDesktopSyncHistory, recordDesktopCompletedSyncRound } from './desktopSyncHistoryCollection.js';
import { desktopSyncPeerRoundOwner } from './desktopSyncPeerRoundOwner.js';
import { selectDesktopSyncUpstream } from './desktopSyncUpstream.js';
import { lanPeerHttp } from './lanPeerHttp.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

export function loadDesktopSyncGroupPeers() {
  const group = loadDesktopSyncGroup();
  return group ? loadDesktopSyncGroupRoutes(group.group_id).filter(peer => !isMobileSyncPlatform(peer.peer_platform)) : [];
}

/** Automatic and manual rounds only ever target this desktop's single upstream. */
export function loadDesktopSyncUpstreamPeers() {
  const upstream = selectDesktopSyncUpstream(loadDesktopSyncGroupPeers());
  return upstream ? [upstream] : [];
}

export async function continueDesktopSyncGroupSync(
  peer?: DesktopSyncGroupPeer,
  activity?: DesktopSyncActivityContext
): Promise<{ complete: boolean; attachmentProgress?: number; attachmentYielded?: boolean; dynamicBacklog?: boolean } | null> {
  const target = peer ?? loadDesktopSyncGroupPeers()[0];
  if (!target) return null;
  if (isMobileSyncPlatform(target.peer_platform)) return null;
  return runDesktopSyncGroupPeerSingleFlight(
    target.peer_device_id,
    async () => {
      const session = desktopPeerSessionRegistry.get(target.peer_device_id);
      try {
        const sessionId = session?.reply.session;
        return await runSyncPeerRound({ owner: desktopSyncPeerRoundOwner(), peerId: target.peer_device_id,
          ...(session ? { signal: session.controller.signal } : {}),
          execute: (id, lease) => continuePeerSync(target, activity, { id, lease, admitted: false, ...(sessionId ? { sessionId } : {}) }) });
      } catch (error) {
        if (session?.controller.signal.aborted || isSyncPeerRoundRetryableError(error)) return { complete: false };
        throw error;
      }
    }
  );
}

async function continuePeerSync(
  target: DesktopSyncGroupPeer,
  activity: DesktopSyncActivityContext | undefined,
  peerRound: RequestSyncPeerRound
) {
  await runPeerSyncStage(
    'compatibility',
    () => assertDesktopSyncGroupPeerCompatible(target, lanPeerHttp.fetch, peerRound.lease.signal),
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
  // The peer's member state may already move the group line; reclaim first so reclaimed history is not offered back.
  if (!memberState.restoreFromPeer && !adoption) await collectDesktopSyncHistory(target.group_id);
  const input = {
    localLibraryEpoch: memberState.localLibraryEpoch,
    peer: target,
    peerState: memberState.peerState,
    remoteLibraryEpoch: memberState.remoteLibraryEpoch,
    signal: peerRound.lease.signal,
    peerRound,
    ...(memberState.restoreFromPeer ? { restoreId: memberState.restoreFromPeer } : {})
  };
  const startedAt = new Date().toISOString();
  const result = await runPeerSyncStage('sync_pack', () => continueDatabaseAndResources(input), target, activity);
  if (result.complete) await closeCompletedPeerSync(target, activity, startedAt, !memberState.restoreFromPeer);
  return { complete: result.complete, ...(result.dynamicBacklog ? { dynamicBacklog: true } : {}), attachmentProgress: result.attachmentProgress ?? 0, attachmentYielded: result.attachmentYielded };
}

/** The closing member state tells the peer this ordinary round completed, which may move the group line. */
async function closeCompletedPeerSync(target: DesktopSyncGroupPeer, activity: DesktopSyncActivityContext | undefined,
  startedAt: string, ordinary: boolean) {
  if (ordinary) await recordDesktopCompletedSyncRound(target, startedAt);
  await runPeerSyncStage('member_state', () => exchangeDesktopSyncGroupMemberState(target), target, activity);
  await collectDesktopSyncHistory(target.group_id);
}

async function continueDatabaseAndResources(input: Parameters<typeof runDesktopRequestSyncDatabaseRound>[0]):
Promise<{ complete: boolean; attachmentProgress?: number; attachmentYielded?: boolean; dynamicBacklog?: boolean }> {
  const key = await runWithDatabaseConnectionOwner(() => loadDesktopWorkgroupKey(input.peer.group_id));
  if (!key || !input.peerRound) throw new Error('sync_round_context_missing');
  const context = { groupId: input.peer.group_id, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: input.peer.local_device_id, initiatorLibraryEpoch: input.localLibraryEpoch,
    responderDeviceId: input.peer.peer_device_id, responderLibraryEpoch: input.remoteLibraryEpoch } as const;
  const exchange = createDesktopRequestSyncExchange({ context, groupSecret: key.group_key,
    groupKey: new Uint8Array(Buffer.from(key.group_key, 'base64url')), endpointUrl: input.peer.endpoint_url,
    peerRound: input.peerRound, ...(input.signal ? { signal: input.signal } : {}) });
  return withRequestSyncPeerRound(exchange, input.peerRound, async () => {
    const database = await runDesktopRequestSyncDatabaseRound(input);
    const resources = await continueDesktopRequestSyncResources({ ...input, boundedSlice: !database.complete && database.madeProgress });
    return { ...database, complete: database.complete && resources.pending === 0, attachmentProgress: resources.blocks ?? 0, attachmentYielded: resources.yielded };
  });
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
