import {
  READWISE_SOURCE_CUTOVER_COMPLETION_VERSION,
  readwiseSourceCutoverProgress
} from '../../lib/core/readwise/readwiseSourceCutover.js';
import type { NativeReadwiseSourceCutoverResult } from '../../lib/platform/nativeReadwiseSourceCutoverContract.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';
import { loadReadwiseSourceModeState } from '../database/readwiseSourceMode.js';
import { notifyReadwiseReaderImportProgress } from '../ipc/readwiseReaderImportProgressEvents.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { runReadwiseApiCandidatePipeline } from './readwiseApiCandidatePipeline.js';
import { isStoredReadwiseApiConnectionReady } from './readwiseApiConnectionState.js';
import { prepareReadwiseApiFrozenResources } from './readwiseApiFrozenBatch.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import type { ReadwiseImportProgressWindow } from './readwiseReaderRunAccumulator.js';
import { recordReadwiseSuppressedCutoverDocuments } from './readwiseSourceCutoverClassification.js';
import { prepareReadwiseSourceCutoverIdentity } from './readwiseSourceCutoverIdentity.js';
import {
  completeReadwiseSourceCutoverMigration,
  createReadwiseDocumentMigration,
  promoteReadwiseSourceCutoverCohort,
  requireReadwiseSourceCutoverV2,
  setReadwiseSourceCutoverPhase
} from './readwiseSourceCutoverJournal.js';
import { firstReadwiseCandidateFailureReason } from './readwiseSourceCutoverPreview.js';
import { restartIncompleteReadwiseSourceCutover } from './readwiseSourceCutoverReset.js';

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
  const current = loadReadwiseSourceCutover();
  const sourceMode = loadReadwiseSourceModeState();
  const currentProgress = current ? readwiseSourceCutoverProgress(current) : null;
  const completed = current?.status === 'api'
    && current.version === 2
    && current.completionVersion === READWISE_SOURCE_CUTOVER_COMPLETION_VERSION;
  if (completed && sourceMode.mode === 'api' && sourceMode.conflictReasons.length === 0) {
    return result('already_completed', currentProgress?.migratedCount, currentProgress?.unmatchedCount);
  }
  if (sourceMode.conflictReasons.length > 0 || sourceMode.mode !== 'relay') {
    return result('failed', 0, 0, 'readwise_source_mode_conflict');
  }
  const assignment = loadReadwiseHostAssignment();
  if (!assignment.is_active) return result('not_active_host');
  const source = loadReadwiseRemoteSource();
  if (!source) return result('connection_required');
  if (!isStoredReadwiseApiConnectionReady()) return result('connection_required');
  const restartRequired = !current || current.status === 'api';
  const startedAt = restartRequired ? new Date().toISOString() : current.startedAt;
  if (restartRequired) {
    restartIncompleteReadwiseSourceCutover({
      connectionRef: source.connectionRef,
      policy: loadImportManagerSettings().readwiseAutoImportPolicy,
      sourceHost: assignment.current_host_name,
      startedAt
    });
    await input.onMigrationStarted?.();
    publishProgress(input.window, 0, 0, 'indexing');
  }
  try {
    const output = await runCutoverPipeline(source.connectionRef, input);
    const progress = readwiseSourceCutoverProgress(requireReadwiseSourceCutoverV2());
    if (output.remainingCount > 0) {
      return result('failed', progress.migratedCount, progress.unmatchedCount, firstReadwiseCandidateFailureReason());
    }
    completeReadwiseSourceCutoverMigration(source.connectionRef);
    const completed = readwiseSourceCutoverProgress(requireReadwiseSourceCutoverV2());
    return result('completed', completed.migratedCount, completed.unmatchedCount);
  } catch (error) {
    console.error('[readwise-cutover] migration paused', error);
    return result('failed', 0, 0, safeFailureReason(error));
  }
}

async function runCutoverPipeline(connectionRef: string, input: RunReadwiseSourceCutoverInput) {
  const identity = await prepareReadwiseSourceCutoverIdentity(connectionRef);
  const migration = createReadwiseDocumentMigration(identity, connectionRef, {
    forceSourceProjection: true
  });
  const settings = loadImportManagerSettings();
  const dependencies = {
    ...input.dependencies,
    allowFolderModeForCutover: true
  };
  const existingCutover = loadReadwiseSourceCutover();
  let suppressedDocumentIds = new Set(existingCutover?.version === 2
    ? existingCutover.documents
      .filter((item) => item.status === 'suppressed' || item.status === 'blocked')
      .map((item) => item.remoteId)
    : []);
  return runReadwiseApiCandidatePipeline({
    assertEligible: () => assertMigrationEligible(connectionRef),
    afterCommit: migration.afterCommit,
    beforeCommit: migration.beforeCommit,
    connectionRef,
    deferCommitUntilAllFacts: true,
    dependencies,
    freezeCandidateResources: (document, destination) => prepareReadwiseApiFrozenResources({
      config: settings.readwiseReaderConfig,
      connectionRef,
      dependencies,
      destination,
      document
    }),
    onCandidateIndex: (documentIds) => {
      promoteReadwiseSourceCutoverCohort(documentIds);
      const migrated = identity.migrateDispositions(documentIds);
      suppressedDocumentIds = new Set([...suppressedDocumentIds, ...migrated]);
      recordReadwiseSuppressedCutoverDocuments(connectionRef, migrated);
      publishProgress(input.window, 0, documentIds.length, 'indexing');
    },
    onCandidateFactsComplete: (total) => {
      setReadwiseSourceCutoverPhase('merging');
      const progress = readwiseSourceCutoverProgress(requireReadwiseSourceCutoverV2());
      publishProgress(input.window, progress.completedCandidateCount, total, 'merging');
    },
    onCandidateFactsProgress: (processed, total) =>
      publishProgress(input.window, processed, total, 'indexing'),
    onProgress: (completed, total) => publishProgress(input.window, completed, total, 'merging'),
    purpose: 'cutover',
    settings,
    shouldSkipCandidate: (documentId) => suppressedDocumentIds.has(documentId)
  });
}

function assertMigrationEligible(connectionRef: string) {
  const state = loadReadwiseSourceCutover();
  const sourceMode = loadReadwiseSourceModeState();
  if (state?.status !== 'migration-in-progress') {
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
  if (!(error instanceof Error)) return 'request_failed';
  if (error.message.startsWith('readwise_api_rate_limited:')) return 'rate_limited';
  const reasons = [
    'readwise_api_reconnect_required',
    'readwise_source_mode_conflict',
    'readwise_execution_connection_changed',
    'readwise_execution_eligibility_lost'
  ];
  return reasons.includes(error.message) ? error.message : 'request_failed';
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

function result(
  status: NativeReadwiseSourceCutoverResult['status'],
  migratedCount = 0,
  unmatchedCount = 0,
  errorReason: string | null = null
): NativeReadwiseSourceCutoverResult {
  return { error_reason: errorReason, migrated_count: migratedCount, status, unmatched_count: unmatchedCount };
}
