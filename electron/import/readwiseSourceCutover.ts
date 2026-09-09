import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import type {
  NativeReadwiseSourceCutoverPreview,
  NativeReadwiseSourceCutoverResult
} from '../../lib/platform/nativeReadwiseSourceCutoverContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { restartReadwiseApiCandidateRun } from '../database/readwiseApiCandidateRun.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import {
  confirmReadwiseIdentityBindings,
  loadReadwiseRemoteSource,
  type ConfirmedReadwiseIdentityBinding
} from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover, writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';
import { IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL } from '../ipc/contracts.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { runReadwiseApiCandidatePipeline } from './readwiseApiCandidatePipeline.js';
import { isStoredReadwiseApiConnectionReady } from './readwiseApiConnectionState.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { prepareReadwiseIdentityBindingsForCutover } from './readwiseIdentityBindingPreview.js';
import type { ReadwiseImportProgressWindow } from './readwiseReaderRunAccumulator.js';
import { applyPristineReadwiseSourceProjection } from './readwiseSourceMigrationProjection.js';

interface SourceCountRow { [column: string]: unknown; count: number }

let activeSourceCutover: Promise<NativeReadwiseSourceCutoverResult> | null = null;

export async function previewReadwiseSourceCutover(): Promise<NativeReadwiseSourceCutoverPreview> {
  const current = loadReadwiseSourceCutover();
  if (current) {
    return {
      completed_count: current.completedCandidateCount,
      status: current.status === 'api' ? 'already_completed' : 'migration_in_progress',
      topic_count: countCurrentHostTopics(current.sourceHost),
      total_count: current.totalCandidateCount
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

export async function runReadwiseSourceCutover(input: {
  dependencies?: ReadwiseApiFetchDependencies;
  onMigrationStarted?: () => Promise<void> | void;
  window?: ReadwiseImportProgressWindow | null;
} = {}): Promise<NativeReadwiseSourceCutoverResult> {
  if (activeSourceCutover) return activeSourceCutover;
  const promise = runReadwiseSourceCutoverNow(input).finally(() => {
    if (activeSourceCutover === promise) activeSourceCutover = null;
  });
  activeSourceCutover = promise;
  return promise;
}

async function runReadwiseSourceCutoverNow(input: {
  dependencies?: ReadwiseApiFetchDependencies;
  onMigrationStarted?: () => Promise<void> | void;
  window?: ReadwiseImportProgressWindow | null;
}): Promise<NativeReadwiseSourceCutoverResult> {
  const current = loadReadwiseSourceCutover();
  if (current?.status === 'api') return result('already_completed', current.migratedCount, current.unmatchedCount);
  const assignment = loadReadwiseHostAssignment();
  if (!assignment.is_active) return result('not_active_host');
  if (!isStoredReadwiseApiConnectionReady()) return result('connection_required');
  const source = loadReadwiseRemoteSource();
  if (!source) return result('connection_required');
  const startedAt = current?.startedAt ?? new Date().toISOString();
  if (!current) {
    beginMigration(assignment.current_host_name, startedAt);
    await input.onMigrationStarted?.();
  }
  const settings = loadImportManagerSettings();
  if (!current) restartReadwiseApiCandidateRun(source.connectionRef, settings.readwiseReaderConfig, startedAt);
  const identityPromise = prepareReadwiseIdentityBindingsForCutover({
    ...(input.dependencies?.fetchImpl ? { fetchImpl: input.dependencies.fetchImpl } : {}),
    ...(input.dependencies?.minIntervalMs === undefined ? {} : { minIntervalMs: input.dependencies.minIntervalMs })
  });
  void identityPromise.catch(() => undefined);
  try {
    const migration = createDocumentMigration(identityPromise, source.connectionRef);
    const output = await runReadwiseApiCandidatePipeline({
      assertEligible: () => assertMigrationEligible(source.connectionRef),
      beforeCommit: migration.beforeCommit,
      connectionRef: source.connectionRef,
      dependencies: input.dependencies ?? {},
      onCandidateCount: (total) => saveProgress({ total }),
      onProgress: (completed, total) => {
        saveProgress({ completed, migrated: migration.migratedCount(), total });
        publishProgress(input.window, completed, total);
      },
      settings
    });
    if (output.remainingCount > 0) return result('failed', migration.migratedCount(), migration.unmatchedCount());
    completeMigration(migration.migratedCount(), migration.unmatchedCount(), output.totalCount);
    return result('completed', migration.migratedCount(), migration.unmatchedCount());
  } catch (error) {
    console.error('[readwise-cutover] migration paused', error);
    return result('failed');
  }
}

function beginMigration(sourceHost: string, startedAt: string) {
  writeReadwiseSourceCutover({
    completedAt: startedAt, completedCandidateCount: 0, migratedCount: 0, sourceHost, startedAt,
    status: 'migration-in-progress', totalCandidateCount: null, unmatchedCount: 0
  }, startedAt);
}

function saveProgress(input: { completed?: number; migrated?: number; total: number }) {
  const current = loadReadwiseSourceCutover();
  if (!current || current.status !== 'migration-in-progress') return;
  writeReadwiseSourceCutover({
    ...current,
    completedCandidateCount: input.completed ?? current.completedCandidateCount,
    migratedCount: input.migrated ?? current.migratedCount,
    totalCandidateCount: input.total
  });
}

function completeMigration(migratedCount: number, unmatchedCount: number, total: number) {
  const current = loadReadwiseSourceCutover();
  if (!current) throw new Error('readwise_source_migration_state_missing');
  const completedAt = new Date().toISOString();
  writeReadwiseSourceCutover({
    ...current, completedAt, completedCandidateCount: total, migratedCount,
    status: 'api', totalCandidateCount: total, unmatchedCount
  }, completedAt);
}

function createDocumentMigration(
  identityPromise: ReturnType<typeof prepareReadwiseIdentityBindingsForCutover>,
  connectionRef: string
) {
  let migrated = loadReadwiseSourceCutover()?.migratedCount ?? 0;
  let unmatched = 0;
  return {
    async beforeCommit(document: PreparedReadwiseApiDocument) {
      const prepared = await identityPromise;
      unmatched = prepared.unmatchedCount + prepared.conflictCount;
      const existing = loadExistingBinding(connectionRef, document.id);
      const binding = prepared.bindings.find((item) => item.remoteDocumentId === document.id) ?? existing;
      if (!binding) return;
      const replaceExistingBody = await applyPristineReadwiseSourceProjection(binding.sourceFingerprint, document);
      if (!existing) {
        confirmReadwiseIdentityBindings(connectionRef, [binding]);
        migrated += 1;
      }
      return { replaceExistingBody };
    },
    migratedCount: () => migrated,
    unmatchedCount: () => unmatched
  };
}

function loadExistingBinding(connectionRef: string, documentId: string): ConfirmedReadwiseIdentityBinding | null {
  const row = openDatabaseConnection().driver.queryOne<{
    remote_annotations_json: string; remote_document_id: string; source_fingerprint: string;
  }>(`SELECT source_fingerprint, remote_document_id, remote_annotations_json FROM import_sources
      WHERE remote_provider = 'readwise' AND remote_connection_ref = ? AND remote_document_id = ?`,
  [connectionRef, documentId]);
  if (!row) return null;
  try {
    return {
      annotations: JSON.parse(row.remote_annotations_json) as ConfirmedReadwiseIdentityBinding['annotations'],
      remoteDocumentId: row.remote_document_id,
      sourceFingerprint: row.source_fingerprint
    };
  } catch { return null; }
}

function assertMigrationEligible(connectionRef: string) {
  const state = loadReadwiseSourceCutover();
  if (state?.status !== 'migration-in-progress') throw new Error('readwise_source_migration_not_active');
  if (!loadReadwiseHostAssignment().is_active || !isStoredReadwiseApiConnectionReady()) {
    throw new Error('readwise_execution_eligibility_lost');
  }
  if (loadReadwiseRemoteSource()?.connectionRef !== connectionRef) {
    throw new Error('readwise_execution_connection_changed');
  }
}

function countCurrentHostTopics(hostName: string) {
  return openDatabaseConnection().driver.queryOne<SourceCountRow>(
    `SELECT COUNT(DISTINCT i.latest_node_id) count FROM import_sources i
     JOIN desktop_sources d ON d.source_ref = i.source_ref
     JOIN nodes n ON n.id = i.latest_node_id AND n.deleted_at IS NULL
     WHERE d.source_type = 'readwise' AND d.host_name = ?`, [hostName]
  )?.count ?? 0;
}

function publishProgress(window: ReadwiseImportProgressWindow | null | undefined, completed: number, total: number) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL, {
    phase: 'writing', processedCount: completed, status: 'running', totalCount: total
  });
}

function result(
  status: NativeReadwiseSourceCutoverResult['status'], migratedCount = 0, unmatchedCount = 0
): NativeReadwiseSourceCutoverResult {
  return { migrated_count: migratedCount, status, unmatched_count: unmatchedCount };
}
