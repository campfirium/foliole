import { randomUUID } from 'node:crypto';

import type { SyncTriggerReason, SyncTriggerResult } from '../../lib/platform/syncTriggerContract.js';
import { syncTriggerError } from '../../lib/platform/syncTriggerContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import {
  continueDesktopSyncGroupSync,
  type DesktopSyncGroupPeer,
  loadDesktopSyncGroupPeers
} from './desktopSyncGroupTransport.js';

const RESULT_SETTING_KEY = 'sync_group_last_trigger_result';
let activeRun: Promise<SyncTriggerResult> | null = null;
let activePeerId: string | null = null;
const completedListeners = new Set<() => void>();
interface SyncRequest {
  reason: SyncTriggerReason;
  peer: DesktopSyncGroupPeer | undefined;
  promise: Promise<SyncTriggerResult>;
  resolve: (result: SyncTriggerResult) => void;
  reject: (error: unknown) => void;
}
const queuedRuns = new Map<string, Promise<SyncTriggerResult>>();
const pendingRuns: SyncRequest[] = [];

export function loadActiveDesktopSyncRun() {
  return activeRun;
}

export function subscribeDesktopSyncCompleted(listener: () => void) {
  completedListeners.add(listener);
  return () => completedListeners.delete(listener);
}

export function loadDesktopSyncTriggerResult() {
  return loadJsonSetting(RESULT_SETTING_KEY) as SyncTriggerResult | null;
}

export function runDesktopSyncCoordinator(
  reason: SyncTriggerReason,
  preferredPeer?: DesktopSyncGroupPeer
): Promise<SyncTriggerResult> {
  if (activeRun && (!preferredPeer || activePeerId === preferredPeer.peer_device_id)) return activeRun;
  const queued = preferredPeer && queuedRuns.get(preferredPeer.peer_device_id);
  if (queued) return queued;
  let resolve!: SyncRequest['resolve'];
  let reject!: SyncRequest['reject'];
  const promise = new Promise<SyncTriggerResult>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  pendingRuns.push({ reason, peer: preferredPeer, promise, resolve, reject });
  if (preferredPeer) queuedRuns.set(preferredPeer.peer_device_id, promise);
  startNextRun();
  return promise;
}

function startNextRun() {
  if (activeRun) return;
  const request = pendingRuns.shift();
  if (!request) return;
  activeRun = request.promise;
  activePeerId = request.peer?.peer_device_id ?? null;
  if (request.peer) queuedRuns.delete(request.peer.peer_device_id);
  const finish = () => {
    activeRun = null;
    activePeerId = null;
    startNextRun();
  };
  void runOwnedSync(request.reason, request.peer).then((result) => {
    finish();
    request.resolve(result);
  }, (error: unknown) => {
    finish();
    request.reject(error);
  });
}

async function runOwnedSync(reason: SyncTriggerReason, preferredPeer?: DesktopSyncGroupPeer) {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  try {
    const peers = preferredPeer ? [preferredPeer]
      : await runWithDatabaseConnectionOwner(() => loadDesktopSyncGroupPeers());
    if (peers.length === 0) {
      if (reason === 'manual') throw new Error('sync_group_peer_unavailable');
      return await persistResult({ error: null, finished_at: new Date().toISOString(), reason,
        run_id: runId, started_at: startedAt, status: 'skipped' });
    }
    let complete = true;
    for (const peer of peers) {
      const outcome = await continueDesktopSyncGroupSync(peer);
      if (!outcome?.complete) complete = false;
    }
    if (!complete) throw new Error('sync_group_sync_incomplete');
    const result = await persistResult({ error: null, finished_at: new Date().toISOString(), reason,
      run_id: runId, started_at: startedAt, status: 'completed' });
    for (const listener of completedListeners) listener();
    return result;
  } catch (error) {
    await persistResult({ error: syncTriggerError(error), finished_at: new Date().toISOString(), reason,
      run_id: runId, started_at: startedAt, status: 'failed' });
    throw error;
  }
}

async function persistResult(result: SyncTriggerResult) {
  await runWithDatabaseConnectionOwner(() => saveJsonSetting(RESULT_SETTING_KEY, result));
  return result;
}
