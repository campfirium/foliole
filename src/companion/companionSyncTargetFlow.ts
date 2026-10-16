import { isSyncPeerRoundRetryableError } from '../../lib/core/sync/runSyncPeerRound.js';
import { isMobileSyncPlatform } from '../../lib/platform/syncSchedulingPlatform.js';
import type { SyncTriggerReason } from '../../lib/platform/syncTriggerContract';
import { captureCompanionDesktopRound, ensureCompanionDesktopSession, invalidateCompanionDesktopSession, waitForCompanionDesktopChanges } from '../shared/platform/companion/network/companionDesktopSession.js';
import { exchangeCompanionSyncGroupMemberState } from '../shared/platform/companion/network/companionSyncGroupMemberState';
import type { CompanionWorkspaceSyncTarget } from '../shared/platform/companion/network/companionWorkspaceEndpoint';
import { createCompanionSyncRunId } from '../shared/platform/companionSyncActivityEvents';
import { beginNativeCompanionSyncRun } from '../shared/platform/companionWorkspaceRuntimeRepository';
import {
  bindCompanionWorkspaceSyncTarget,
  saveCompanionWorkspaceSyncEndpoint
} from '../shared/platform/companionWorkspaceSync';

import { writeCompanionSyncActivity } from './companionSyncActivityWrite';
import { formatCompanionSyncDiagnosticMessage, formatCompanionSyncFailureMessage } from './companionSyncFailureMessage';
import { runCompanionSyncAsOwner } from './companionSyncRunOwner';
import type {
  ForegroundAutoSyncOutcome,
  RunCompanionStreamSyncArgs,
  TryForegroundAutoSyncArgs
} from './companionWorkspaceSyncFlow';

const STARTING_STRUCTURE_PROGRESS = {
  completed: 0,
  phase: 'structure' as const,
  total: null
};

type RunCompanionStreamSync = (
  args: RunCompanionStreamSyncArgs
) => Promise<ForegroundAutoSyncOutcome | undefined>;

async function recordTargetFailure(args: {
  endpointUrl: string;
  runId: string;
  startedAt: string;
  syncArgs: TryForegroundAutoSyncArgs;
  syncError: unknown;
  triggerReason: SyncTriggerReason;
}) {
  const message = formatCompanionSyncFailureMessage(args.syncError);
  args.syncArgs.setSyncProgress(null);
  args.syncArgs.setError(message);
  const failedState = await writeCompanionSyncActivity({
    endpointUrl: args.endpointUrl, kind: 'run_finished', message, result: 'failed',
    runId: args.runId, startedAt: args.startedAt, status: 'failed', triggerReason: args.triggerReason
  }, () => undefined);
  if (failedState) args.syncArgs.setState(current => ({ ...current, ...failedState }));
  return 'failed' as const;
}

async function recordRetryableTarget(args: Parameters<typeof recordTargetFailure>[0]): Promise<ForegroundAutoSyncOutcome> {
  const { endpointUrl, runId, startedAt, syncArgs, syncError, triggerReason } = args;
  syncArgs.setSyncProgress(null);
  syncArgs.setError(null);
  const pending = await writeCompanionSyncActivity({
    endpointUrl, kind: 'run_finished', message: formatCompanionSyncDiagnosticMessage(syncError), result: 'partial',
    runId, startedAt, status: 'skipped', triggerReason
  }, syncArgs.setError);
  if (pending) syncArgs.setState(current => ({ ...current, ...pending }));
  return 'pending';
}

type OwnedTargetArgs = {
  runId: string;
  target: CompanionWorkspaceSyncTarget;
  runStreamSync: RunCompanionStreamSync;
  syncArgs: TryForegroundAutoSyncArgs;
  isManualRequested(): boolean;
  deferAfterRelease(work: () => void): void;
};

async function runOwnedTarget(args: OwnedTargetArgs): Promise<ForegroundAutoSyncOutcome> {
  const endpointUrl = args.target.endpointUrl;
  const runId = args.runId;
  let triggerReason = args.syncArgs.triggerReason
    ?? (args.syncArgs.state.last_synced_at ? 'automatic' : 'initial');
  const startedAt = args.syncArgs.triggeredAt ?? new Date().toISOString();
  try {
    args.syncArgs.setStatus('syncing');
    await beginNativeCompanionSyncRun(triggerReason, runId);
    args.syncArgs.setError(null);
    args.syncArgs.setSyncProgress(STARTING_STRUCTURE_PROGRESS);
    if (args.target.protocolIncompatible) throw new Error('sync_group_peer_incompatible');
    await bindCompanionWorkspaceSyncTarget(args.target);
    const memberState = await validateTargetMembership(args.target);
    if (!memberState) return 'skipped';
    await ensureTargetSession(args.target, memberState.peerLibraryEpoch);
    await saveCompanionWorkspaceSyncEndpoint(endpointUrl);
    if (args.isManualRequested()) triggerReason = 'manual';
    await writeCompanionSyncActivity({
      endpointUrl, kind: 'run_started', message: 'Sync started.',
      runId, startedAt, status: 'started', triggerReason
    }, args.syncArgs.setError);
    const completeSession = captureCompanionDesktopRound(endpointUrl);
    const outcome = await args.runStreamSync({
      ...args.syncArgs,
      isManualRequested: args.isManualRequested,
      deferAfterRelease: args.deferAfterRelease,
      endpointUrl,
      ...(args.target.deviceId && memberState.peerLibraryEpoch && args.target.protocolVersion ? { framedPeer: {
        deviceId: args.target.deviceId,
        libraryEpoch: memberState.peerLibraryEpoch,
        protocolVersion: args.target.protocolVersion
      } } : {}),
      runId,
      ...(memberState.restoreFromPeer ? { restoreId: memberState.restoreFromPeer } : {}),
      startedAt,
      triggerReason,
      workspaceSnapshot: args.syncArgs.state.workspace_snapshot
    }) ?? 'skipped';
    if (outcome === 'completed') await completeSession();
    return outcome;
  } catch (syncError) {
    if (args.syncArgs.cancelled()) return 'skipped';
    if (isSyncPeerRoundRetryableError(syncError)) {
      return recordRetryableTarget({
        endpointUrl, runId, startedAt, syncArgs: args.syncArgs, syncError, triggerReason
      });
    }
    return recordTargetFailure({
      endpointUrl, runId, startedAt, syncArgs: args.syncArgs, syncError, triggerReason
    });
  }
}

async function validateTargetMembership(target: CompanionWorkspaceSyncTarget) {
  const state = await exchangeCompanionSyncGroupMemberState(target).catch(async error => {
    await invalidateCompanionDesktopSession(target.endpointUrl);
    throw error;
  });
  if (state.localExited || state.peerRemoved || (state.normalSyncReady === false && !state.restoreFromPeer)) {
    await invalidateCompanionDesktopSession(target.endpointUrl);
    if (state.localExited) throw new Error('sync_group_local_device_removed');
    return null;
  }
  return state;
}

async function ensureTargetSession(target: CompanionWorkspaceSyncTarget, libraryEpoch: string | null | undefined) {
  if (target.deviceId && target.platform && !isMobileSyncPlatform(target.platform)) {
    await ensureCompanionDesktopSession(target.endpointUrl, target.deviceId,
      libraryEpoch ? { target, libraryEpoch } : undefined);
  }
}

export async function tryForegroundAutoSyncTarget(
  syncArgs: TryForegroundAutoSyncArgs,
  target: CompanionWorkspaceSyncTarget,
  runStreamSync: RunCompanionStreamSync
) {
  const runId = syncArgs.runId ?? createCompanionSyncRunId();
  if (syncArgs.cancelled()) return 'skipped';
  const afterRelease: Array<() => void> = [];
  const run = runCompanionSyncAsOwner(target.endpointUrl, runId, intent => runOwnedTarget({
    runId, target, runStreamSync, syncArgs, deferAfterRelease: work => afterRelease.push(work), isManualRequested: () => intent.manualRequested
  }), syncArgs.triggerReason === 'manual');
  syncArgs.onRunIdentified?.(run.runId, run.mode);
  const outcome = await run.completion.catch(() => 'failed') as ForegroundAutoSyncOutcome;
  for (const work of afterRelease) work();
  waitForCompanionDesktopChanges();
  return outcome;
}
