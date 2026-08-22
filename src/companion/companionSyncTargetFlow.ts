import type { CompanionWorkspaceSyncTarget } from '../shared/platform/companion/network/companionWorkspaceEndpoint';
import { createCompanionSyncRunId } from '../shared/platform/companionSyncActivityEvents';
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
}) {
  const message = formatCompanionSyncFailureMessage(args.syncError);
  const refreshedState = await loadCompanionStateAfterStructureSync(args.syncArgs.state.workspace_snapshot);
  const workspaceSnapshot = refreshedState?.workspace_snapshot ?? args.syncArgs.state.workspace_snapshot;
  args.syncArgs.setStatus('idle');
  args.syncArgs.setSyncProgress(null);
  args.syncArgs.setError(message);
  const failedState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl, kind: 'run_finished', message, result: 'failed',
    runId: args.runId, startedAt: args.startedAt, status: 'failed'
  }).catch(() => null);
  if (failedState) args.syncArgs.setState({ ...failedState, workspace_snapshot: workspaceSnapshot });
  return 'failed' as const;
}

async function runOwnedTarget(args: {
  runId: string;
  target: CompanionWorkspaceSyncTarget;
  runStreamSync: RunCompanionStreamSync;
  storedEndpointUrl: string;
  syncArgs: TryForegroundAutoSyncArgs;
}): Promise<ForegroundAutoSyncOutcome> {
  const endpointUrl = args.target.endpointUrl;
  const runId = args.runId;
  const startedAt = new Date().toISOString();
  try {
    args.syncArgs.setStatus('syncing');
    args.syncArgs.setError(null);
    args.syncArgs.setSyncProgress(STARTING_STRUCTURE_PROGRESS);
    await bindCompanionWorkspaceSyncTarget(args.target);
    if (endpointUrl !== args.storedEndpointUrl) {
      await saveCompanionWorkspaceSyncEndpoint(endpointUrl);
    }
    await recordCompanionWorkspaceSyncEvent({
      endpointUrl, kind: 'run_started', message: 'Auto sync started.',
      runId, startedAt, status: 'started'
    });
    return await args.runStreamSync({
      ...args.syncArgs,
      endpointUrl,
      runId,
      startedAt,
      workspaceSnapshot: args.syncArgs.state.workspace_snapshot
    }) ?? 'skipped';
  } catch (syncError) {
    if (args.syncArgs.cancelled()) return 'skipped';
    return recordTargetFailure({
      endpointUrl, runId, startedAt, syncArgs: args.syncArgs, syncError
    });
  }
}

export async function tryForegroundAutoSyncTarget(
  syncArgs: TryForegroundAutoSyncArgs,
  target: CompanionWorkspaceSyncTarget,
  storedEndpointUrl: string,
  runStreamSync: RunCompanionStreamSync
) {
  const runId = createCompanionSyncRunId();
  const run = runCompanionSyncAsOwner(target.endpointUrl, runId, () => runOwnedTarget({
    runId, target, runStreamSync, storedEndpointUrl, syncArgs
  }));
  if (run.mode === 'joined') {
    await run.completion.catch(() => undefined);
    return 'skipped';
  }
  return run.completion;
}
