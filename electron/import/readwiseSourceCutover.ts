import { readwiseSourceCutoverProgress } from '../../lib/core/readwise/readwiseSourceCutover.js';
import type {
  NativeReadwiseSourceCutoverPreview,
  NativeReadwiseSourceCutoverResult
} from '../../lib/platform/nativeReadwiseSourceCutoverContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { restartReadwiseApiCandidateRun } from '../database/readwiseApiCandidateRun.js';
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover, writeLegacyReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';
import { IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL } from '../ipc/contracts.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { runReadwiseApiCandidatePipeline } from './readwiseApiCandidatePipeline.js';
import { isStoredReadwiseApiConnectionReady } from './readwiseApiConnectionState.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import type { ReadwiseImportProgressWindow } from './readwiseReaderRunAccumulator.js';
import { prepareReadwiseSourceCutoverIdentity } from './readwiseSourceCutoverIdentity.js';
import {
  completeReadwiseSourceCutoverMigration,
  createReadwiseDocumentMigration,
  promoteReadwiseSourceCutoverCohort,
  requireReadwiseSourceCutoverV2
} from './readwiseSourceCutoverJournal.js';

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
    return {
      completed_count: progress.completedCandidateCount,
      error_reason: firstCandidateFailureReason(),
      phase: current.status === 'api' ? null : isIndexingState(current) ? 'indexing' : 'merging',
      status: current.status === 'api' ? 'already_completed' : 'migration_in_progress',
      topic_count: countCurrentHostTopics(current.sourceHost),
      total_count: progress.totalCandidateCount
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
  if (current?.status === 'api') {
    return result('already_completed', currentProgress?.migratedCount, currentProgress?.unmatchedCount);
  }
  const assignment = loadReadwiseHostAssignment();
  if (!assignment.is_active) return result('not_active_host');
  if (!isStoredReadwiseApiConnectionReady()) return result('connection_required');
  const source = loadReadwiseRemoteSource();
  if (!source) return result('connection_required');
  const startedAt = current?.startedAt ?? new Date().toISOString();
  if (!current) {
    beginLegacyMigration(assignment.current_host_name, startedAt);
    await input.onMigrationStarted?.();
    restartReadwiseApiCandidateRun(
      source.connectionRef,
      loadImportManagerSettings().readwiseAutoImportPolicy,
      startedAt
    );
    publishProgress(input.window, 0, 0, 'indexing');
  }
  try {
    const output = await runCutoverPipeline(source.connectionRef, input);
    const progress = readwiseSourceCutoverProgress(requireReadwiseSourceCutoverV2());
    if (output.remainingCount > 0) {
      return result('failed', progress.migratedCount, progress.unmatchedCount, firstCandidateFailureReason());
    }
    completeReadwiseSourceCutoverMigration();
    const completed = readwiseSourceCutoverProgress(requireReadwiseSourceCutoverV2());
    return result('completed', completed.migratedCount, completed.unmatchedCount);
  } catch (error) {
    console.error('[readwise-cutover] migration paused', error);
    return result('failed', 0, 0, safeFailureReason(error));
  }
}

async function runCutoverPipeline(connectionRef: string, input: RunReadwiseSourceCutoverInput) {
  const identity = await prepareReadwiseSourceCutoverIdentity();
  const migration = createReadwiseDocumentMigration(identity, connectionRef);
  return runReadwiseApiCandidatePipeline({
    assertEligible: () => assertMigrationEligible(connectionRef),
    afterCommit: migration.afterCommit,
    beforeCommit: migration.beforeCommit,
    connectionRef,
    dependencies: input.dependencies ?? {},
    onCandidateIndex: (documentIds) => {
      promoteReadwiseSourceCutoverCohort(documentIds);
      const progress = readwiseSourceCutoverProgress(requireReadwiseSourceCutoverV2());
      publishProgress(input.window, progress.completedCandidateCount, progress.totalCandidateCount ?? 0, 'merging');
    },
    onProgress: (completed, total) => publishProgress(input.window, completed, total, 'merging'),
    purpose: 'cutover',
    settings: loadImportManagerSettings()
  });
}

function isIndexingState(state: NonNullable<ReturnType<typeof loadReadwiseSourceCutover>>) {
  return state.version === 1 || isFreshRerunState(state);
}

function isFreshRerunState(state: NonNullable<ReturnType<typeof loadReadwiseSourceCutover>>) {
  return state.version === 2 && state.status === 'migration-in-progress' &&
    state.cohortDocumentIds.length === 0 && state.documents.length === 0;
}

function beginLegacyMigration(sourceHost: string, startedAt: string) {
  writeLegacyReadwiseSourceCutover({
    completedAt: startedAt,
    completedCandidateCount: 0,
    migratedCount: 0,
    sourceHost,
    startedAt,
    status: 'migration-in-progress',
    totalCandidateCount: null,
    unmatchedCount: 0
  }, startedAt);
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
  if (!window || window.isDestroyed()) return;
  window.webContents.send(IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL, {
    phase,
    processedCount: completed,
    status: 'running',
    totalCount: total
  });
}

function result(
  status: NativeReadwiseSourceCutoverResult['status'],
  migratedCount = 0,
  unmatchedCount = 0,
  errorReason: string | null = null
): NativeReadwiseSourceCutoverResult {
  return { error_reason: errorReason, migrated_count: migratedCount, status, unmatched_count: unmatchedCount };
}
