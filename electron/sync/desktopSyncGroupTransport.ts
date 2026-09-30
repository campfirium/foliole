import { getPeerCursor, setPeerCursor } from '../../lib/core/database/syncState.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { reconcileVersionedInlineBodies } from '../database/syncBodyProjectionReconcile.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { loadPendingWatchedFolderConflicts } from '../database/watchedFolderConflictDecisions.js';

import { reportDesktopSyncGroupCursorCommitted } from './desktopSyncGroupCursorCommit.js';
import { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupHttp.js';
import { exchangeDesktopSyncGroupMemberState } from './desktopSyncGroupMemberState.js';
import { downloadAndApplyDesktopSyncGroupPack } from './desktopSyncGroupPackApply.js';
import { assertDesktopSyncGroupPeerCompatible } from './desktopSyncGroupPeerCompatibility.js';
import { runDesktopSyncGroupPeerSingleFlight } from './desktopSyncGroupPeerSingleFlight.js';
import { drainDesktopSyncGroupResourceArticles } from './desktopSyncGroupResourceArticleDrain.js';
import { assertDesktopSyncGroupResourcesComplete } from './desktopSyncGroupResources.js';
import {
  loadDesktopSyncGroupRoutes,
  type DesktopSyncGroupPeer
} from './desktopSyncGroupRoutes.js';
import { flushDesktopSyncGroupVersionReceipts } from './desktopSyncGroupVersionReceipts.js';
import { notifyWorkspaceSyncApplied } from './workspaceSyncAppliedEvents.js';

export type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

export function loadDesktopSyncGroupPeers() {
  const group = loadDesktopSyncGroup();
  return group ? loadDesktopSyncGroupRoutes(group.group_id) : [];
}

export async function continueDesktopSyncGroupSync(peer?: DesktopSyncGroupPeer) {
  const target = peer ?? loadDesktopSyncGroupPeers()[0];
  if (!target) return null;
  return runDesktopSyncGroupPeerSingleFlight(target.peer_device_id, () => continuePeerSync(target));
}

async function continuePeerSync(target: DesktopSyncGroupPeer) {
  await assertDesktopSyncGroupPeerCompatible(target);
  const memberState = await runPeerSyncStage('member_state', () =>
    exchangeDesktopSyncGroupMemberState(target));
  if (memberState.localExited) {
    void import('./lanWorkspaceSyncServer.js').then(({ stopLanWorkspaceSyncServer }) =>
      stopLanWorkspaceSyncServer());
    throw new Error('sync_group_local_device_removed');
  }
  if (memberState.peerBlocked) return { complete: false, cursor: 0 };
  const restoreId = memberState.restoreFromPeer;
  if (memberState.normalSyncReady === false && !restoreId) return { complete: false, cursor: 0 };
  if (!restoreId) {
    await flushDesktopSyncGroupVersionReceipts(target);
    const pendingConflicts = await runWithDatabaseConnectionOwner(() => loadPendingWatchedFolderConflicts());
    if (pendingConflicts.length) return { complete: false, cursor: 0 };
  }
  const position = await runWithDatabaseConnectionOwner(() =>
    loadReceivePosition(target.peer_device_id, restoreId ?? undefined));
  const pack = await runPeerSyncStage('sync_pack', () =>
    requestAndApply(target, position, restoreId ?? undefined));
  await runWithDatabaseConnectionOwner(() =>
    reconcileVersionedInlineBodies(openDatabaseConnection().driver));
  const nextCursor = pack.cursor;
  await runWithDatabaseConnectionOwner(() => saveReceiveCursor(target.peer_device_id, nextCursor));
  await flushDesktopSyncGroupVersionReceipts(target);
  await reportDesktopSyncGroupCursorCommitted({
    cursor: nextCursor, peerAuthorizationId: target.peer_device_id
  });
  await runPeerSyncStage('resources', () => drainDesktopSyncGroupResourceArticles(target));
  const complete = await runWithDatabaseConnectionOwner(() => resourcesComplete());
  return { complete, cursor: nextCursor };
}

async function runPeerSyncStage<T>(stage: 'member_state' | 'resources' | 'sync_pack', execute: () => Promise<T>) {
  try {
    return await execute();
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? `; cause=${error.cause.message}` : '';
    const detail = `${error instanceof Error ? error.message : String(error)}${cause}`;
    throw new Error(`sync_group_${stage}_failed: ${detail}`, { cause: error });
  }
}

async function requestAndApply(
  peer: DesktopSyncGroupPeer,
  position: { cursor: number; frontierStateSeq?: number; sourceEpoch?: string },
  restoreId?: string
) {
  let cursor = position.cursor;
  let frontier = position.frontierStateSeq;
  let epoch = position.sourceEpoch;
  for (;;) {
    const page = await downloadAndApplyDesktopSyncGroupPack({
      after: cursor, peer, createHeaders: createDesktopSyncGroupSignedHeaders,
      ...(frontier === undefined ? {} : { frontierStateSeq: frontier }),
      ...(epoch ? { sourceEpoch: epoch } : {}),
      ...(restoreId ? { restoreId } : {})
    });
    if (page.roundRebased) {
      if (epoch && page.sourceEpoch !== epoch) throw new Error('sync_pack_source_epoch_changed');
      frontier = page.frontierStateSeq;
    }
    frontier ??= page.frontierStateSeq ?? page.cursor;
    epoch ??= page.sourceEpoch;
    if (page.frontierStateSeq !== undefined && page.frontierStateSeq !== frontier ||
        page.sourceEpoch !== undefined && page.sourceEpoch !== epoch ||
        page.cursor > frontier || page.cursor <= cursor && cursor < frontier) {
      throw new Error('sync_pack_round_changed');
    }
    notifyWorkspaceSyncApplied(page.event);
    cursor = page.cursor;
    if (cursor === frontier) break;
    if (!epoch) throw new Error('sync_pack_source_epoch_missing');
  }
  return { cursor };
}

function loadReceivePosition(peerAuthorizationId: string, restoreId?: string) {
  const progress = openDatabaseConnection().driver.queryOne<{
    completed: number; cursor_state_seq: number; frontier_state_seq: number;
    restore_id: string | null; source_epoch: string
  }>(
    `SELECT p.completed, p.cursor_state_seq, p.frontier_state_seq, p.restore_id, p.source_epoch
     FROM sync_pack_receive_progress p
     JOIN sync_group_local_state local ON local.group_id = p.group_id
     WHERE local.singleton_id = 1 AND local.state = 'active' AND p.peer_id = ?`,
    [peerAuthorizationId]
  );
  if (progress) {
    if (!Number.isSafeInteger(progress.cursor_state_seq) || progress.cursor_state_seq < 0 ||
        !Number.isSafeInteger(progress.frontier_state_seq) ||
        progress.frontier_state_seq < progress.cursor_state_seq || !progress.source_epoch) {
      throw new Error('sync_pack_receive_progress_invalid');
    }
    if (restoreId && progress.restore_id !== restoreId) {
      return { cursor: 0 };
    }
    if (!restoreId && progress.restore_id && !progress.completed) {
      throw new Error('sync_group_restore_in_progress');
    }
    return { cursor: progress.cursor_state_seq,
      ...(!progress.completed || restoreId ? { frontierStateSeq: progress.frontier_state_seq,
        sourceEpoch: progress.source_epoch } : {}) };
  }
  if (restoreId) return { cursor: 0 };
  const legacyCursor = Number(getPeerCursor(openDatabaseConnection().driver, peerAuthorizationId, 'state') ?? 0);
  if (!Number.isSafeInteger(legacyCursor) || legacyCursor < 0) {
    throw new Error('sync_pack_legacy_cursor_invalid');
  }
  // Peer compatibility requires bounded pages. Keep the old cursor until a page commits.
  return { cursor: 0 };
}

function saveReceiveCursor(peerAuthorizationId: string, cursor: number) {
  setPeerCursor(openDatabaseConnection().driver, peerAuthorizationId, 'state', String(cursor), new Date().toISOString());
}

function resourcesComplete() {
  try {
    assertDesktopSyncGroupResourcesComplete();
    return true;
  } catch {
    return false;
  }
}
