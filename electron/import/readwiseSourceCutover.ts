import { readwiseSourceCutoverProgress } from '../../lib/core/readwise/readwiseSourceCutover.js';
import type {
  NativeReadwiseSourceCutoverPreview,
  NativeReadwiseSourceCutoverResult
} from '../../lib/platform/nativeReadwiseSourceCutoverContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { restartReadwiseApiCandidateRun } from '../database/readwiseApiCandidateRun.js';
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
      status: current.status === 'api' ? 'already_completed' : 'migration_in_progress',
      topic_count: countCurrentHostTopics(current.sourceHost),
      total_count: progress.totalCandidateCount
    };
  }
  const assignment = loadReadwiseHostAssignment();
  return {
    completed_count: 0,
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
  }
  try {
    const identity = await prepareReadwiseSourceCutoverIdentity();
    const migration = createReadwiseDocumentMigration(identity, source.connectionRef);
    const output = await runReadwiseApiCandidatePipeline({
      assertEligible: () => assertMigrationEligible(source.connectionRef),
      afterCommit: migration.afterCommit,
      beforeCommit: migration.beforeCommit,
      connectionRef: source.connectionRef,
      dependencies: input.dependencies ?? {},
      onCandidateIndex: promoteReadwiseSourceCutoverCohort,
      onProgress: (completed, total) => publishProgress(input.window, completed, total),
      settings: loadImportManagerSettings()
    });
    const progress = readwiseSourceCutoverProgress(requireReadwiseSourceCutoverV2());
    if (output.remainingCount > 0) {
      return result('failed', progress.migratedCount, progress.unmatchedCount);
    }
    completeReadwiseSourceCutoverMigration();
    const completed = readwiseSourceCutoverProgress(requireReadwiseSourceCutoverV2());
    return result('completed', completed.migratedCount, completed.unmatchedCount);
  } catch (error) {
    console.error('[readwise-cutover] migration paused', error);
    return result('failed');
  }
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

function publishProgress(
  window: ReadwiseImportProgressWindow | null | undefined,
  completed: number,
  total: number
) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL, {
    phase: 'writing',
    processedCount: completed,
    status: 'running',
    totalCount: total
  });
}

function result(
  status: NativeReadwiseSourceCutoverResult['status'],
  migratedCount = 0,
  unmatchedCount = 0
): NativeReadwiseSourceCutoverResult {
  return { migrated_count: migratedCount, status, unmatched_count: unmatchedCount };
}
