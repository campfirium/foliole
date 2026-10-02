import {
  READWISE_SOURCE_CUTOVER_COMPLETION_VERSION,
  readwiseSourceCutoverProgress
} from '../../lib/core/readwise/readwiseSourceCutover.js';
import type { NativeReadwiseSourceCutoverResult } from '../../lib/platform/nativeReadwiseSourceCutoverContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import {
  ensureReadwiseRemoteSource,
  loadReadwiseRemoteSource
} from '../database/readwiseRemoteIdentity.js';
import {
  loadReadwiseSourceCutover,
  loadReadwiseSourceMigrationProgress,
  writeReadwiseSourceCutover
} from '../database/readwiseSourceCutover.js';
import { loadReadwiseSourceModeState } from '../database/readwiseSourceMode.js';
import { notifyReadwiseReaderImportProgress } from '../ipc/readwiseReaderImportProgressEvents.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { isStoredReadwiseApiConnectionReady } from './readwiseApiConnectionState.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { readCutoverDownloadProgress } from './readwiseCutoverDownload.js';
import { recoverReadwiseCutoverFailures } from './readwiseCutoverRecovery.js';
import type { ReadwiseImportProgressWindow } from './readwiseReaderRunAccumulator.js';
import {
  completeReadwiseSourceCutoverMigration,
  requireReadwiseSourceCutoverV2
} from './readwiseSourceCutoverJournal.js';
import { restartIncompleteReadwiseSourceCutover } from './readwiseSourceCutoverReset.js';
import { runReadwiseSourceCutoverSnapshot } from './readwiseSourceCutoverSnapshotRun.js';

interface RunReadwiseSourceCutoverInput {
  dependencies?: ReadwiseApiFetchDependencies;
  onMigrationStarted?: () => Promise<void> | void;
  window?: ReadwiseImportProgressWindow | null;
}
let activeSourceCutover: Promise<NativeReadwiseSourceCutoverResult> | null = null;

export { previewReadwiseSourceCutover } from './readwiseSourceCutoverPreview.js';

export async function runReadwiseSourceCutover(
  input: RunReadwiseSourceCutoverInput = {}
): Promise<NativeReadwiseSourceCutoverResult> {
  if (activeSourceCutover) return activeSourceCutover;
  const promise = runNow(input).finally(() => {
    if (activeSourceCutover === promise) activeSourceCutover = null;
  });
  activeSourceCutover = promise;
  return promise;
}

async function runNow(
  input: RunReadwiseSourceCutoverInput
): Promise<NativeReadwiseSourceCutoverResult> {
  const { current, sourceMode, assignment, source } = await runWithDatabaseConnectionOwner(() => ({
    current: loadReadwiseSourceCutover(), sourceMode: loadReadwiseSourceModeState(),
    assignment: loadReadwiseHostAssignment(), source: loadReadwiseRemoteSource()
  }));
  const ready = await runWithDatabaseConnectionOwner(isStoredReadwiseApiConnectionReady);
  const completed = current?.status === 'api'
    && current.version === 2
    && current.completionVersion === READWISE_SOURCE_CUTOVER_COMPLETION_VERSION;
  if (completed && sourceMode.mode === 'api' && sourceMode.conflictReasons.length === 0) {
    if (source && current.failures?.length) {
      if (!assignment.is_active) return result('not_active_host', 0, 0, 'readwise_execution_eligibility_lost');
      if (!ready) return result('connection_required', 0, 0, 'readwise_api_reconnect_required');
      await recoverCompletedCutover(input, source.connectionRef);
    }
    const progress = await runWithDatabaseConnectionOwner(() => readwiseSourceCutoverProgress(requireReadwiseSourceCutoverV2()));
    return result('already_completed', progress.migratedCount, progress.unmatchedCount);
  }
  if (sourceMode.conflictReasons.length > 0 || sourceMode.mode !== 'relay') {
    return result('failed', 0, 0, 'readwise_source_mode_conflict');
  }
  if (!assignment.is_active) {
    return result('not_active_host', 0, 0, 'readwise_execution_eligibility_lost');
  }
  if (!ready) {
    return result('connection_required', 0, 0, 'readwise_api_reconnect_required');
  }
  const { activeSource, activeBatchId } = await prepareCutoverRun(input, !current || current.status === 'api', current?.startedAt);
  try {
    const output = await runCutoverPipeline(activeSource.connectionRef, input);
    return await runWithDatabaseConnectionOwner(() => {
      if (output.remainingCount > 0) throw new Error('readwise_source_cutover_document_terminals_incomplete');
      completeReadwiseSourceCutoverMigration(activeSource.connectionRef, output.documents);
      const completed = readwiseSourceCutoverProgress(requireReadwiseSourceCutoverV2());
      return result('completed', completed.migratedCount, completed.unmatchedCount);
    });
  } catch (error) {
    console.error('[readwise-cutover] migration paused', error);
    const reason = safeFailureReason(error);
    return runWithDatabaseConnectionOwner(() => {
      if (requireReadwiseSourceCutoverV2().batchId !== activeBatchId) return result('failed', 0, 0, reason);
      recordCutoverError(reason);
      publishFailed(input.window);
      return result('failed', 0, 0, reason);
    });
  }
}

async function prepareCutoverRun(input: RunReadwiseSourceCutoverInput, restart: boolean, previousStartedAt?: string) {
  const prepared = await runWithDatabaseConnectionOwner(() => {
    const activeSource = loadReadwiseRemoteSource() ?? ensureReadwiseRemoteSource();
    if (restart) restartIncompleteReadwiseSourceCutover({
      connectionRef: activeSource.connectionRef,
      sourceHost: loadReadwiseHostAssignment().current_host_name,
      startedAt: previousStartedAt ?? new Date().toISOString()
    });
    recordCutoverError(null);
    return { activeSource, activeBatchId: requireReadwiseSourceCutoverV2().batchId };
  });
  if (restart) {
    await input.onMigrationStarted?.();
    publishProgress(input.window, 0, 0, 'indexing');
  }
  return prepared;
}

function recoverCompletedCutover(input: RunReadwiseSourceCutoverInput, connectionRef: string) {
  return recoverReadwiseCutoverFailures({ connectionRef, dependencies: input.dependencies ?? {},
    assertEligible: () => {
      if (input.dependencies?.signal?.aborted) throw new DOMException('Readwise import cancelled', 'AbortError');
      if (!loadReadwiseHostAssignment().is_active || !isStoredReadwiseApiConnectionReady()) {
        throw new Error('readwise_execution_eligibility_lost');
      }
      if (loadReadwiseRemoteSource()?.connectionRef !== connectionRef) {
        throw new Error('readwise_execution_connection_changed');
      }
      const mode = loadReadwiseSourceModeState();
      if (mode.mode !== 'api' || mode.conflictReasons.length) throw new Error('readwise_source_mode_conflict');
    }
  });
}

function recordCutoverError(errorReason: string | null) {
  const current = loadReadwiseSourceCutover();
  if (!current || current.version !== 2 || current.status !== 'migration-in-progress') return;
  const next = { ...current };
  delete next.errorReason;
  writeReadwiseSourceCutover({ ...next, ...(errorReason ? { errorReason } : {}) });
}

async function runCutoverPipeline(connectionRef: string, input: RunReadwiseSourceCutoverInput) {
  const { settings, batchId } = await runWithDatabaseConnectionOwner(() => ({
    settings: loadImportManagerSettings(), batchId: requireReadwiseSourceCutoverV2().batchId
  }));
  const assertEligible = () => assertMigrationEligible(connectionRef, batchId);
  const dependencies = {
    ...input.dependencies,
    allowFolderModeForCutover: true,
    assertCutoverBatch: assertEligible
  };
  return runReadwiseSourceCutoverSnapshot({
    assertEligible,
    connectionRef,
    dependencies,
    onProgress: (completed, total, phase) => publishProgress(input.window, completed, total, phase),
    settings
  });
}

function assertMigrationEligible(connectionRef: string, batchId?: string) {
  const state = loadReadwiseSourceCutover();
  const sourceMode = loadReadwiseSourceModeState();
  if (state?.status !== 'migration-in-progress' || (state.version === 2 && state.batchId !== batchId)) {
    throw new Error('readwise_source_migration_not_active');
  }
  if (!loadReadwiseHostAssignment().is_active || !isStoredReadwiseApiConnectionReady()) {
    throw new Error('readwise_execution_eligibility_lost');
  }
  if (sourceMode.mode !== 'relay' || sourceMode.conflictReasons.length > 0) {
    throw new Error('readwise_source_mode_conflict');
  }
  if (loadReadwiseRemoteSource()?.connectionRef !== connectionRef) {
    throw new Error('readwise_execution_connection_changed');
  }
}

function safeFailureReason(error: unknown) {
  if (!(error instanceof Error)) return 'readwise_source_cutover_internal_failure';
  if (error.message.startsWith('readwise_api_rate_limited:')) return 'rate_limited';
  if (error.message === 'readwise_api_import_not_ready') return 'readwise_api_reconnect_required';
  const reasons = [
    'readwise_api_reconnect_required',
    'readwise_source_mode_conflict',
    'readwise_execution_connection_changed',
    'readwise_execution_eligibility_lost'
  ];
  if (/^readwise_[a-z0-9_]+(?::[a-zA-Z0-9_-]+)?$/.test(error.message)) return error.message;
  return reasons.includes(error.message) ? error.message : 'readwise_source_cutover_internal_failure';
}

function publishProgress(
  window: ReadwiseImportProgressWindow | null | undefined,
  completed: number,
  total: number,
  phase: 'indexing' | 'merging'
) {
  notifyReadwiseReaderImportProgress({
    phase,
    processedCount: completed,
    status: 'running',
    totalCount: total
  }, window);
}

function publishFailed(window: ReadwiseImportProgressWindow | null | undefined) {
  const current = loadReadwiseSourceCutover();
  const phase = current?.version === 2 && current.phase === 'merging' ? 'merging' : 'indexing';
  const progress = phase === 'merging' ? loadReadwiseSourceMigrationProgress() : null;
  const download = readCutoverDownloadProgress(loadReadwiseRemoteSource()?.connectionRef ?? '');
  notifyReadwiseReaderImportProgress({
    phase, processedCount: progress?.completedCount ?? download.completed, status: 'failed',
    totalCount: progress?.totalCount ?? download.total ?? 0
  }, window);
}

function result(
  status: NativeReadwiseSourceCutoverResult['status'],
  migratedCount = 0,
  unmatchedCount = 0,
  errorReason: string | null = null
): NativeReadwiseSourceCutoverResult {
  return { error_reason: errorReason, migrated_count: migratedCount, status, unmatched_count: unmatchedCount };
}
