import { getPeerCursor, setPeerCursor } from '../../lib/core/database/syncState.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { reportDesktopSyncGroupCursorCommitted } from './desktopSyncGroupCursorCommit.js';
import { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupHttp.js';
import { downloadAndApplyDesktopSyncGroupPack } from './desktopSyncGroupPackApply.js';
import { runDesktopSyncGroupPeerSingleFlight } from './desktopSyncGroupPeerSingleFlight.js';
import {
  assertDesktopSyncGroupResourcesComplete,
  downloadDesktopSyncGroupResources
} from './desktopSyncGroupResources.js';
import {
  loadDesktopSyncGroupRoutes,
  type DesktopSyncGroupPeer
} from './desktopSyncGroupRoutes.js';

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
  const cursor = await runWithDatabaseConnectionOwner(() => loadReceiveCursor(target.peer_device_id));
  const nextCursor = await runPeerSyncStage('sync_pack', () => downloadAndApply(target, cursor));
  await runWithDatabaseConnectionOwner(() => saveReceiveCursor(target.peer_device_id, nextCursor));
  await reportDesktopSyncGroupCursorCommitted({
    cursor: nextCursor, peerAuthorizationId: target.peer_device_id
  });
  await runPeerSyncStage('resources', () => downloadDesktopSyncGroupResources(target));
  const complete = await runWithDatabaseConnectionOwner(() => resourcesComplete());
  return { complete, cursor: nextCursor };
}

async function runPeerSyncStage<T>(stage: 'resources' | 'sync_pack', execute: () => Promise<T>) {
  try {
    return await execute();
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? `; cause=${error.cause.message}` : '';
    const detail = `${error instanceof Error ? error.message : String(error)}${cause}`;
    throw new Error(`sync_group_${stage}_failed: ${detail}`, { cause: error });
  }
}

async function downloadAndApply(peer: DesktopSyncGroupPeer, after: number) {
  try {
    return await requestAndApply(peer, after);
  } catch (error) {
    if (after === 0 || !requiresCursorReenumeration(error)) throw error;
    saveReceiveCursor(peer.peer_device_id, 0);
    return requestAndApply(peer, 0);
  }
}

function requestAndApply(peer: DesktopSyncGroupPeer, after: number) {
  return downloadAndApplyDesktopSyncGroupPack({
    after, peer, createHeaders: createDesktopSyncGroupSignedHeaders
  });
}

function requiresCursorReenumeration(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (['sync_pack_cursor_not_contiguous', 'sync_pack_provider_frontier_rollback']
    .some((code) => error.message.includes(code))) return true;
  return requiresCursorReenumeration(error.cause);
}

function loadReceiveCursor(peerAuthorizationId: string) {
  const value = getPeerCursor(openDatabaseConnection().driver, peerAuthorizationId, 'state');
  const cursor = Number.parseInt(value ?? '0', 10);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
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
