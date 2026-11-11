import { randomUUID } from 'node:crypto';

import { requestAttachmentWorkYield, waitForAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget.js';
import { isSyncPeerRoundRetryableError } from '../../lib/core/sync/runSyncPeerRound.js';
import { isRetryableWebDavSendError } from '../../lib/core/sync/webDavTransportRetry.js';
import type { SyncTriggerReason, SyncTriggerResult } from '../../lib/platform/syncTriggerContract.js';
import { syncTriggerError } from '../../lib/platform/syncTriggerContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { markWatchedConflictDecisionsSynced } from '../database/watchedConflictSyncMarker.js';
import { refreshKeepImportMonitorFromSettings } from '../import/keepImportMonitor.js';

import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import { captureDesktopPeerRoundCompletion } from './desktopPeerSessionRegistry.js';
import { recordDesktopSyncActivity, type DesktopSyncActivityContext } from './desktopSyncActivityStore.js';
import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import {
  continueDesktopSyncGroupSync,
  type DesktopSyncGroupPeer,
  loadDesktopSyncUpstreamPeers
} from './desktopSyncGroupTransport.js';

const RESULT_SETTING_KEY = 'sync_group_last_trigger_result';
let activeRun: Promise<SyncTriggerResult> | null = null;
let activePeerId: string | null = null;
let activeWebDavSignal: AbortSignal | undefined;
const completedListeners = new Set<() => void>();
interface SyncRequest {
  continuation: boolean;
  releaseWaiter?: () => void;
  reason: SyncTriggerReason;
  peer: DesktopSyncGroupPeer | undefined;
  skippedPeerId: string | undefined;
  webDavSignal: AbortSignal | undefined;
  foregroundWebDavReceive?: true;
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
  preferredPeer?: DesktopSyncGroupPeer,
  continuation = false,
  skippedPeerId?: string
): Promise<SyncTriggerResult> {
  return enqueueDesktopSync({ reason, peer: preferredPeer, continuation, skippedPeerId, webDavSignal: undefined });
}

export function runDesktopScheduledWebDav(signal: AbortSignal, foregroundWebDavReceive?: true) {
  return enqueueDesktopSync({ reason: 'automatic', peer: undefined, continuation: false,
    skippedPeerId: undefined, webDavSignal: signal, ...(foregroundWebDavReceive ? { foregroundWebDavReceive } : {}) });
}

function enqueueDesktopSync(intent: Pick<SyncRequest, 'reason' | 'peer' | 'continuation' | 'skippedPeerId' | 'webDavSignal' | 'foregroundWebDavReceive'>) {
  const { peer: preferredPeer, continuation, skippedPeerId, webDavSignal } = intent;
  if (activeRun && !continuation && !webDavSignal) requestAttachmentWorkYield();
  if (activeRun && !webDavSignal && !activeWebDavSignal &&
      activePeerId === (preferredPeer?.peer_device_id ?? null)) return activeRun;
  const queued = preferredPeer ? queuedRuns.get(preferredPeer.peer_device_id)
    : pendingRuns.find(request => !request.peer && request.webDavSignal === webDavSignal
      && (request.skippedPeerId === undefined || request.skippedPeerId === skippedPeerId))?.promise;
  if (queued) return queued;
  let resolve!: SyncRequest['resolve'];
  let reject!: SyncRequest['reject'];
  const promise = new Promise<SyncTriggerResult>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  pendingRuns.push({ ...intent, promise, resolve, reject,
    ...(activeRun && !continuation && !webDavSignal ? { releaseWaiter: waitForAttachmentWorkYield() } : {}) });
  if (preferredPeer) queuedRuns.set(preferredPeer.peer_device_id, promise);
  startNextRun();
  return promise;
}

function startNextRun() {
  if (activeRun) return;
  const request = pendingRuns.shift();
  if (!request) return;
  request.releaseWaiter?.();
  activeRun = request.promise;
  activePeerId = request.peer?.peer_device_id ?? null;
  activeWebDavSignal = request.webDavSignal;
  if (request.peer) queuedRuns.delete(request.peer.peer_device_id);
  const continuations: DesktopSyncGroupPeer[] = [];
  const finish = () => {
    activeRun = null;
    activePeerId = null;
    activeWebDavSignal = undefined;
    startNextRun();
    for (const peer of continuations) void runDesktopSyncCoordinator('automatic', peer, true).catch(() => undefined);
  };
  void runOwnedSync(request, continuations).then((result) => {
    finish();
    request.resolve(result);
  }, (error: unknown) => {
    finish();
    request.reject(error);
  });
}

async function runOwnedSync(request: SyncRequest, continuations: DesktopSyncGroupPeer[]) {
  const { reason, peer: preferredPeer, continuation, skippedPeerId, webDavSignal, foregroundWebDavReceive } = request;
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const peers = (preferredPeer ? [preferredPeer] : await runWithDatabaseConnectionOwner(() => loadDesktopSyncUpstreamPeers()))
    .filter(peer => peer.peer_device_id !== skippedPeerId);
  // A root serves its downstream sessions; only a manual request waits for them.
  const serving = reason !== 'manual' && peers.length === 0 && desktopSyncChangeSessions().hasSessions();
  if (serving && foregroundWebDavReceive && !webDavSignal?.aborted) desktopSyncChangeSessions().changed();
  if (serving || (skippedPeerId && peers.length === 0) ||
      (webDavSignal && (webDavSignal.aborted || (peers.length && !foregroundWebDavReceive)))) {
    return { error: null, finished_at: startedAt, reason, run_id: runId, started_at: startedAt, status: 'skipped' } as const;
  }
  const activity = { runId, reason, startedAt };
  if (webDavSignal && !peers.length) return runAutomaticWebDav(activity, webDavSignal, foregroundWebDavReceive);
  await recordDesktopSyncActivity(activity, { direction: 'local', kind: 'run_started',
    message: 'Sync started', stage: 'run', status: 'started' });
  const acknowledgements = peers.map(peer => captureDesktopPeerRoundCompletion(peer.peer_device_id));
  try {
    if (continuation && !await runWithDatabaseConnectionOwner(isDesktopCompanionSyncParticipating)) {
      return await persistResult({ error: null, finished_at: new Date().toISOString(), reason,
        run_id: runId, started_at: startedAt, status: 'skipped' });
    }
    if (peers.length === 0) return await syncWithoutUpstream(activity, reason);
    let complete = true;
    for (const peer of peers) {
      try {
        const outcome = await continueDesktopSyncGroupSync(peer, activity);
        if (!outcome?.complete) {
          complete = false;
          if ((outcome?.attachmentProgress ?? 0) > 0 || outcome?.attachmentYielded || outcome?.dynamicBacklog) continuations.push(peer);
        }
      } catch (error) {
        if (!isSyncPeerRoundRetryableError(error)) throw error;
        complete = false;
      }
    }
    if (!complete) return await persistResult({ error: null, finished_at: new Date().toISOString(), reason,
      run_id: runId, started_at: startedAt, status: 'pending' });
    await runWithDatabaseConnectionOwner(() => markWatchedConflictDecisionsSynced(startedAt));
    await refreshKeepImportMonitorFromSettings();
    for (const acknowledge of acknowledgements) await acknowledge();
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

async function runAutomaticWebDav(activity: DesktopSyncActivityContext, signal: AbortSignal, foregroundReceive?: true) {
  const result = { reason: 'automatic', run_id: activity.runId, started_at: activity.startedAt } as const;
  try {
    const { runDesktopWebDavRelayRound } = await import('./desktopWebDavRelayRound.js');
    const ran = await (foregroundReceive ? runDesktopWebDavRelayRound(activity, signal, true) : runDesktopWebDavRelayRound(activity, signal));
    const status = ran ? 'completed' : 'skipped';
    const outcome = { ...result, error: null, finished_at: new Date().toISOString(), status } as const;
    return ran ? await persistResult(outcome) : outcome;
  } catch (error) {
    if (signal.aborted) return { ...result, error: null, finished_at: new Date().toISOString(), status: 'skipped' } as const;
    const outcome = await persistResult({ ...result, error: syncTriggerError(error),
      finished_at: new Date().toISOString(), status: 'failed' });
    if (isRetryableWebDavSendError(error)) throw error;
    return outcome;
  }
}

async function syncWithoutUpstream(activity: DesktopSyncActivityContext, reason: SyncTriggerReason) {
  const result = { error: null, reason, run_id: activity.runId, started_at: activity.startedAt };
  if (reason !== 'manual') return persistResult({ ...result, finished_at: new Date().toISOString(), status: 'skipped' });
  const sessions = desktopSyncChangeSessions();
  if (sessions.hasSessions()) {
    const complete = await sessions.requestSync();
    return persistResult({ ...result, finished_at: new Date().toISOString(),
      status: complete ? 'completed' : 'pending' }, complete ? undefined : 'mobile');
  }
  const { runDesktopWebDavRelayRound } = await import('./desktopWebDavRelayRound.js');
  if (!await runDesktopWebDavRelayRound(activity)) throw new Error('sync_group_peer_unavailable');
  return persistResult({ ...result, finished_at: new Date().toISOString(), status: 'completed' });
}

async function persistResult(result: SyncTriggerResult, waitingFor?: 'mobile') {
  const context: DesktopSyncActivityContext = { runId: result.run_id,
    reason: result.reason, startedAt: result.started_at };
  await recordDesktopSyncActivity(context, { direction: 'local', kind: 'run_finished',
    ...(waitingFor ? { waiting_for: waitingFor } : {}),
    message: result.error ?? (result.status === 'skipped' ? 'No available device'
      : result.status === 'pending' ? 'Sync remains pending.' : 'Local sync round completed'),
    result: result.status === 'skipped' ? 'waiting' : result.status === 'pending' ? 'partial' : result.status,
    stage: 'run', status: result.status === 'pending' ? 'skipped' : result.status });
  await runWithDatabaseConnectionOwner(() => saveJsonSetting(RESULT_SETTING_KEY, result));
  return result;
}
