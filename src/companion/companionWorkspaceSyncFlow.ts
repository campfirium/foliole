import type { Dispatch, SetStateAction } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import type { SyncTriggerReason } from '../../lib/platform/syncTriggerContract';
import {
  syncCompanionObjectsFromDesktop,
  type CompanionDesktopSyncOptions,
  type CompanionDesktopSyncProgress
} from '../shared/platform/companionDesktopSyncObjects';
import {
  statusForSyncRunResult
} from '../shared/platform/companionSyncActivityEvents';
import {
  resolveReachableCompanionWorkspaceSyncEndpoints
} from '../shared/platform/companionWorkspaceSync';

import type { ForegroundAutoSyncOutcome } from './companionForegroundSyncRunner';
import { writeCompanionSyncActivity } from './companionSyncActivityWrite';
import {
  hasFastRetryWork,
  hasRetryWork,
  resolveCompanionSyncContinuationMode,
  type CompanionSyncContinuationMode
} from './companionSyncContinuation';
import { refreshCompanionSyncDisplay } from './companionSyncDisplayRefresh';
import { describeCompanionSyncPassResult } from './companionSyncPassResult';
import {
  buildRemainingSyncProgress,
  shouldClearCompanionSyncProgress
} from './companionSyncProgressVisibility';
import { buildCompanionSyncRunSummary } from './companionSyncRunSummary';
import { tryForegroundAutoSyncTarget } from './companionSyncTargetFlow';
import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

export type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';
export type { ForegroundAutoSyncOutcome } from './companionForegroundSyncRunner';

export interface RunCompanionStreamSyncArgs {
  setError?(message: string | null): void;
  deferAfterRelease?(work: () => void): void;
  isManualRequested?(): boolean;
  cancelled: () => boolean;
  signal?: AbortSignal;
  endpointUrl: string;
  framedPeer?: NonNullable<CompanionDesktopSyncOptions['framedPeer']>;
  runId: string;
  restoreId?: string;
  startedAt: string;
  setState: Dispatch<SetStateAction<NativeCompanionWorkspaceSyncState>>;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  continuationMode?: CompanionSyncContinuationMode;
  onContinuationModeChange?(mode: CompanionSyncContinuationMode): void;
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
  triggerReason: SyncTriggerReason;
}

export interface TryForegroundAutoSyncArgs {
  cancelled: () => boolean;
  signal?: AbortSignal;
  setError(error: string | null): void;
  setState: Dispatch<SetStateAction<NativeCompanionWorkspaceSyncState>>;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  continuationMode?: CompanionSyncContinuationMode;
  onContinuationModeChange?(mode: CompanionSyncContinuationMode): void;
  onRunIdentified?(runId: string, mode: 'joined' | 'owned'): void;
  runId?: string;
  state: NativeCompanionWorkspaceSyncState;
  triggerReason?: SyncTriggerReason;
}

function applyRemainingProgress(args: {
  result: Awaited<ReturnType<typeof syncCompanionObjectsFromDesktop>>;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
}) {
  const remainingProgress = buildRemainingSyncProgress(args.result);
  if (remainingProgress) {
    args.setSyncProgress(remainingProgress);
  } else if (shouldClearCompanionSyncProgress(args.result)) {
    args.setSyncProgress(null);
  }
}

export async function runCompanionStreamSync(args: RunCompanionStreamSyncArgs) {
  let receivedChanges = false;
  const refresh = () => { void refreshCompanionSyncDisplay(args).catch(() => args.setError?.('sync_display_unavailable')); };
  const result = await syncCompanionObjectsFromDesktop(args.endpointUrl, {
    ...(args.framedPeer ? { framedPeer: args.framedPeer } : {}),
    ...(args.restoreId ? { restoreId: args.restoreId } : {}),
    runId: args.runId,
    ...(args.signal ? { signal: args.signal } : {}),
    waitForInbound: () => args.triggerReason === 'manual' || args.isManualRequested?.() === true,
    onProgress: args.setSyncProgress,
    onStructureSynced: facts => { receivedChanges = facts.receivedCount > 0; },
    resourcesOnly: args.continuationMode === 'resources-only'
  }).finally(() => {
    if (receivedChanges) {
      if (args.deferAfterRelease) args.deferAfterRelease(refresh);
      else refresh();
    }
  });
  if (args.cancelled()) {
    return;
  }
  if (result.databaseConfirmedAt) args.setState(current => ({ ...current, last_synced_at: result.databaseConfirmedAt! }));
  if (result.syncMetadataUnavailable) args.setError?.('sync_activity_unavailable');
  const passResult = describeCompanionSyncPassResult(result);
  const occurredAt = new Date().toISOString();
  const completedState = await writeCompanionSyncActivity({
    endpointUrl: args.endpointUrl,
    kind: 'run_finished',
    message: passResult.message,
    occurredAt,
    result: passResult.result,
    runId: args.runId,
    startedAt: args.startedAt,
    status: statusForSyncRunResult(passResult.result),
    summary: buildCompanionSyncRunSummary({ occurredAt, result, startedAt: args.startedAt }),
    triggerReason: args.triggerReason
  }, message => args.setError?.(message));
  if (completedState) args.setState(current => ({ ...current, ...completedState }));
  applyRemainingProgress({ result, setSyncProgress: args.setSyncProgress });
  args.onContinuationModeChange?.(resolveCompanionSyncContinuationMode(result));
  if (passResult.outcome === 'skipped' && hasRetryWork(result)) {
    return hasFastRetryWork(result) ? 'backlog' : 'pending';
  }
  return passResult.outcome;
}

function combineForegroundSyncOutcomes(outcomes: ForegroundAutoSyncOutcome[]) {
  if (outcomes.includes('failed')) return 'failed';
  if (outcomes.includes('pending')) return 'pending';
  if (outcomes.includes('backlog')) return 'backlog';
  if (outcomes.includes('completed')) return 'completed';
  return 'skipped';
}

function resetSharedContinuation(args: TryForegroundAutoSyncArgs) {
  const targetArgs = { ...args };
  delete targetArgs.continuationMode;
  delete targetArgs.onContinuationModeChange;
  return targetArgs;
}

export async function tryForegroundAutoSync(args: TryForegroundAutoSyncArgs): Promise<ForegroundAutoSyncOutcome> {
  const storedEndpointUrl = resolveCompanionWorkspaceSyncEndpoint(args.state);
  if (!storedEndpointUrl) return 'skipped';
  let targets;
  try {
    targets = await resolveReachableCompanionWorkspaceSyncEndpoints(storedEndpointUrl, {
      allowWhileNotParticipating: args.triggerReason === 'manual'
    });
  } catch (error) {
    args.setError(error instanceof Error ? error.message : 'discovery_no_devices');
    args.setStatus('idle');
    return 'failed';
  }
  const outcomes: ForegroundAutoSyncOutcome[] = [];
  try {
    for (const target of targets) {
      if (args.cancelled()) break;
      const targetArgs = targets.length > 1 ? resetSharedContinuation(args) : args;
      outcomes.push(await tryForegroundAutoSyncTarget(
        targetArgs, target, runCompanionStreamSync
      ));
    }
    return combineForegroundSyncOutcomes(outcomes);
  } finally {
    if (!args.cancelled()) args.setStatus('idle');
  }
}
