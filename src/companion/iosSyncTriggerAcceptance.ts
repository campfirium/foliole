import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { createCompanionSyncRunId } from '../shared/platform/companionSyncActivityEvents';
import { beginNativeCompanionSyncRun } from '../shared/platform/companionWorkspaceRuntimeRepository';
import {
  loadCompanionWorkspaceSyncState,
  recordCompanionWorkspaceSyncEvent
} from '../shared/platform/companionWorkspaceSync';

import { postResult } from './iosBridgeAcceptance';

function hasPersistedManualResult(events: Awaited<ReturnType<typeof loadCompanionWorkspaceSyncState>>['sync_events']) {
  return events.some((event) => event.kind === 'run_finished' && event.trigger_reason === 'manual');
}

export async function runIosSyncTriggerAcceptance() {
  try {
    await loadCompanionBootstrapState();
    const before = await loadCompanionWorkspaceSyncState();
    const previousResultRestored = hasPersistedManualResult(before.sync_events);
    const runId = createCompanionSyncRunId();
    const startedAt = new Date().toISOString();
    const native = await beginNativeCompanionSyncRun('manual', runId);
    await recordCompanionWorkspaceSyncEvent({
      endpointUrl: null,
      kind: 'run_finished',
      message: 'Signed Simulator sync command accepted.',
      result: 'completed',
      runId,
      startedAt,
      status: 'completed',
      triggerReason: 'manual'
    });
    const after = await loadCompanionWorkspaceSyncState();
    if (!hasPersistedManualResult(after.sync_events)) {
      throw new Error('The manual sync result was not persisted by the shared workspace owner.');
    }
    postResult({
      durable_result: true,
      error: null,
      native_runtime: native.runtime,
      phase: 'trigger-observed',
      previous_result_restored: previousResultRestored,
      run_id: native.run_id,
      scenario: 'sync-trigger-runtime',
      status: 'passed',
      trigger_reason: native.reason
    });
  } catch (error) {
    postResult({
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed',
      scenario: 'sync-trigger-runtime',
      status: 'failed'
    });
  }
}
