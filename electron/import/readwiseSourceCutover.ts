import { readwiseSourceCutoverProgress } from '../../lib/core/readwise/readwiseSourceCutover.js';
import type {
  NativeReadwiseSourceCutoverPreview,
  NativeReadwiseSourceCutoverResult
} from '../../lib/platform/nativeReadwiseSourceCutoverContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { countReadwiseApiFrozenResources } from '../database/readwiseApiFrozenResourceStage.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';
import { notifyReadwiseReaderImportProgress } from '../ipc/readwiseReaderImportProgressEvents.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { runReadwiseApiCandidatePipeline } from './readwiseApiCandidatePipeline.js';
import { isStoredReadwiseApiConnectionReady } from './readwiseApiConnectionState.js';
import { prepareReadwiseApiFrozenResources } from './readwiseApiFrozenBatch.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import type { ReadwiseImportProgressWindow } from './readwiseReaderRunAccumulator.js';
import { prepareReadwiseSourceCutoverIdentity } from './readwiseSourceCutoverIdentity.js';
import {
  completeReadwiseSourceCutoverMigration,
  createReadwiseDocumentMigration,
  promoteReadwiseSourceCutoverCohort,
  requireReadwiseSourceCutoverV2,
  setReadwiseSourceCutoverPhase
} from './readwiseSourceCutoverJournal.js';
import { restartIncompleteReadwiseSourceCutover } from './readwiseSourceCutoverReset.js';

interface SourceCountRow { [column: string]: unknown; count: number }
interface RunReadwiseSourceCutoverInput {
  dependencies?: ReadwiseApiFetchDependencies;
  onMigrationStarted?: () => Promise<void> | void;
  window?: ReadwiseImportProgressWindow | null;
}
let activeSourceCutover: Promise<NativeReadwiseSourceCutoverResult> | null = null;

export async function previewReadwiseSourceCutover(): Promise<NativeReadwiseSourceCutoverPreview> {
  const current = loadReadwiseSourceCutover();
  if (current) {
    const progress = readwiseSourceCutoverProgress(current);
    const indexing = current.status !== 'api' && current.version === 2
      ? current.phase !== 'merging' : current.status !== 'api';
    const connectionRef = loadReadwiseRemoteSource()?.connectionRef ?? '';
    const frozenCount = countReadwiseApiFrozenResources(connectionRef);
    return {
      completed_count: indexing
        ? frozenCount
        : progress.completedCandidateCount,
      error_reason: firstCandidateFailureReason(),
      phase: current.status === 'api' ? null : indexing ? 'indexing' : 'merging',
      status: current.status === 'api' ? 'already_completed' : 'migration_in_progress',
      topic_count: countCurrentHostTopics(current.sourceHost),
      total_count: indexing && current.version === 2 && current.cohortDocumentIds.length === 0
        ? null : progress.totalCandidateCount
    };
  }
  const assignment = loadReadwiseHostAssignment();
  return {
    completed_count: 0,
    error_reason: null,
    phase: null,
    status: assignment.is_active ? 'ready' : 'not_active_host',
    topic_count: countCurrentHostTopics(assignment.current_host_name),
    total_count: null
  };
}

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
  const currentProgress = current ? readwiseSourceCutoverProgress(current) : null;
  if (current?.status === 'api' && current.version === 2 && current.completionVersion === 2) {
    return result('already_completed', currentProgress?.migratedCount, currentProgress?.unmatchedCount);
  }
  const assignment = loadReadwiseHostAssignment();
  if (!assignment.is_active) return result('not_active_host');
  if (!isStoredReadwiseApiConnectionReady()) return result('connection_required');
  const source = loadReadwiseRemoteSource();
  if (!source) return result('connection_required');
  const startedAt = current?.startedAt ?? new Date().toISOString();
  if (!current || current.status === 'api') {
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
      return result('failed', progress.migratedCount, progress.unmatchedCount, firstCandidateFailureReason());
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
  const migration = createReadwiseDocumentMigration(identity, connectionRef);
  const settings = loadImportManagerSettings();
  const dependencies = input.dependencies ?? {};
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
    settings
  });
}

function assertMigrationEligible(connectionRef: string) {
  const state = loadReadwiseSourceCutover();
  if (state?.status !== 'migration-in-progress') {
    throw new Error('readwise_source_migration_not_active');
  }
  if (!loadReadwiseHostAssignment().is_active || !isStoredReadwiseApiConnectionReady()) {
    throw new Error('readwise_execution_eligibility_lost');
  }
  if (loadReadwiseRemoteSource()?.connectionRef !== connectionRef) {
    throw new Error('readwise_execution_connection_changed');
  }
}

function countCurrentHostTopics(hostName: string) {
  return openDatabaseConnection().driver.queryOne<SourceCountRow>(
    'SELECT COUNT(DISTINCT i.latest_node_id) count FROM import_sources i ' +
      'JOIN desktop_sources d ON d.source_ref = i.source_ref ' +
      'JOIN nodes n ON n.id = i.latest_node_id AND n.deleted_at IS NULL ' +
      "WHERE d.source_type = 'readwise' AND d.host_name = ?",
    [hostName]
  )?.count ?? 0;
}

function firstCandidateFailureReason() {
  const connectionRef = loadReadwiseRemoteSource()?.connectionRef;
  if (!connectionRef) return null;
  return loadReadwiseApiCandidates(connectionRef)
    .find((candidate) => candidate.status === 'failed')?.failure?.reason ?? null;
}

function safeFailureReason(error: unknown) {
  if (!(error instanceof Error)) return 'request_failed';
  if (error.message.startsWith('readwise_api_rate_limited:')) return 'rate_limited';
  const reasons = [
    'readwise_api_reconnect_required',
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
