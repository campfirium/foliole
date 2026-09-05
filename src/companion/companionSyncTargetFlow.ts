import type { SyncTriggerReason } from '../../lib/platform/syncTriggerContract';
import type { CompanionWorkspaceSyncTarget } from '../shared/platform/companion/network/companionWorkspaceEndpoint';
import { createCompanionSyncRunId } from '../shared/platform/companionSyncActivityEvents';
import { beginNativeCompanionSyncRun } from '../shared/platform/companionWorkspaceRuntimeRepository';
import {
  bindCompanionWorkspaceSyncTarget,
  recordCompanionWorkspaceSyncEvent,
  saveCompanionWorkspaceSyncEndpoint
} from '../shared/platform/companionWorkspaceSync';

import { loadCompanionStateAfterStructureSync } from './companionStructureSyncSnapshot';
import { formatCompanionSyncFailureMessage } from './companionSyncFailureMessage';
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
  const refreshedState = await loadCompanionStateAfterStructureSync(args.syncArgs.state.workspace_snapshot);
  const workspaceSnapshot = refreshedState?.workspace_snapshot ?? args.syncArgs.state.workspace_snapshot;
  args.syncArgs.setSyncProgress(null);
  args.syncArgs.setError(message);
  const failedState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl, kind: 'run_finished', message, result: 'failed',
    runId: args.runId, startedAt: args.startedAt, status: 'failed', triggerReason: args.triggerReason
  }).catch(() => null);
  if (failedState) args.syncArgs.setState({ ...failedState, workspace_snapshot: workspaceSnapshot });
  return 'failed' as const;
}

async function runOwnedTarget(args: {
  runId: string;
  target: CompanionWorkspaceSyncTarget;
  runStreamSync: RunCompanionStreamSync;
  syncArgs: TryForegroundAutoSyncArgs;
}): Promise<ForegroundAutoSyncOutcome> {
  const endpointUrl = args.target.endpointUrl;
  const runId = args.runId;
  const triggerReason = args.syncArgs.triggerReason
    ?? (args.syncArgs.state.last_synced_at ? 'automatic' : 'initial');
  const startedAt = new Date().toISOString();
  try {
    await beginNativeCompanionSyncRun(triggerReason, runId);
    args.syncArgs.setStatus('syncing');
    args.syncArgs.setError(null);
    args.syncArgs.setSyncProgress(STARTING_STRUCTURE_PROGRESS);
    await bindCompanionWorkspaceSyncTarget(args.target);
    await saveCompanionWorkspaceSyncEndpoint(endpointUrl);
    await recordCompanionWorkspaceSyncEvent({
      endpointUrl, kind: 'run_started', message: 'Sync started.',
      runId, startedAt, status: 'started', triggerReason
    });
    return await args.runStreamSync({
      ...args.syncArgs,
      endpointUrl,
      runId,
      startedAt,
      triggerReason,
      workspaceSnapshot: args.syncArgs.state.workspace_snapshot
    }) ?? 'skipped';
  } catch (syncError) {
    if (args.syncArgs.cancelled()) return 'skipped';
    return recordTargetFailure({
      endpointUrl, runId, startedAt, syncArgs: args.syncArgs, syncError, triggerReason
    });
  }
}

export async function tryForegroundAutoSyncTarget(
  syncArgs: TryForegroundAutoSyncArgs,
  target: CompanionWorkspaceSyncTarget,
  runStreamSync: RunCompanionStreamSync
) {
  const runId = createCompanionSyncRunId();
  const run = runCompanionSyncAsOwner(target.endpointUrl, runId, () => runOwnedTarget({
    runId, target, runStreamSync, syncArgs
  }));
  if (run.mode === 'joined') {
    return await run.completion.catch(() => 'failed') as ForegroundAutoSyncOutcome;
  }
  return run.completion;
}
