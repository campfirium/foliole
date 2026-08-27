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

export function loadDesktopSyncTriggerResult() {
  return loadJsonSetting(RESULT_SETTING_KEY) as SyncTriggerResult | null;
}

export function runDesktopSyncCoordinator(
  reason: SyncTriggerReason,
  preferredPeer?: DesktopSyncGroupPeer
) {
  if (activeRun) return activeRun;
  const work = runOwnedSync(reason, preferredPeer).finally(() => {
    if (activeRun === work) activeRun = null;
  });
  activeRun = work;
  return work;
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
    for (const peer of peers) await continueDesktopSyncGroupSync(peer);
    return await persistResult({ error: null, finished_at: new Date().toISOString(), reason,
      run_id: runId, started_at: startedAt, status: 'completed' });
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
