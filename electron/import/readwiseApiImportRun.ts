import { normalizeImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseImportRunResult } from '../../lib/platform/nativeImportContract.js';
import type { NativeReadwiseApiRunTrigger } from '../../lib/platform/nativeReadwiseApiImportContract.js';
import { loadReadwiseApiCompletedThrough } from '../database/readwiseApiImportState.js';
import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';
import { notifyReadwiseReaderImportProgress } from '../ipc/readwiseReaderImportProgressEvents.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { ensureReadwiseApiCandidateIndex } from './readwiseApiCandidateFetch.js';
import { runReadwiseApiCandidatePipeline } from './readwiseApiCandidatePipeline.js';
import { buildReadwiseApiCandidatePreview } from './readwiseApiCandidatePreview.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { createCancelledReadwiseApiImportResult } from './readwiseApiImportResults.js';
import {
  beginReadwiseApiTrackedRun,
  completeReadwiseApiTrackedRun,
  failReadwiseApiTrackedRun,
  updateReadwiseApiTrackedRunProgress,
  updateReadwiseApiTrackedRunStage
} from './readwiseApiScheduleState.js';
import { assertReadwiseApiScopeAllowed } from './readwiseApiScopeGate.js';
import type { ReadwiseImportProgressWindow } from './readwiseReaderRunAccumulator.js';
import { previewReadwiseSourceCutover, runReadwiseSourceCutover } from './readwiseSourceCutover.js';

interface ActiveApiImport {
  controller: AbortController;
  promise: Promise<NativeReadwiseImportRunResult>;
}

let activeApiImport: ActiveApiImport | null = null;

export async function previewReadwiseApiImport(
  settingsInput?: unknown,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  assertReadwiseApiScopeAllowed('api');
  const settings = settingsInput ? normalizeImportManagerSettings(settingsInput) : loadImportManagerSettings();
  const connectionRef = requireConnectionRef();
  const candidates = await ensureReadwiseApiCandidateIndex(settings, connectionRef, dependencies);
  return buildReadwiseApiCandidatePreview(settings, connectionRef, candidates);
}

export function runReadwiseApiImport(input?: {
  dependencies?: ReadwiseApiFetchDependencies;
  settings?: unknown;
  trigger?: NativeReadwiseApiRunTrigger;
  window?: ReadwiseImportProgressWindow | null;
}): Promise<NativeReadwiseImportRunResult> {
  if (loadReadwiseSourceCutover()?.status === 'migration-in-progress') {
    return runMigration(input);
  }
  if (activeApiImport) return activeApiImport.promise;
  const controller = new AbortController();
  const promise = runNow(input, controller.signal).finally(() => {
    if (activeApiImport?.controller === controller) activeApiImport = null;
  });
  activeApiImport = { controller, promise };
  return promise;
}

async function runMigration(input: Parameters<typeof runReadwiseApiImport>[0]) {
  const result = await runReadwiseSourceCutover({
    ...(input?.dependencies ? { dependencies: input.dependencies } : {}),
    ...(input?.window ? { window: input.window } : {})
  });
  const progress = await previewReadwiseSourceCutover();
  const total = progress.total_count ?? 0;
  return {
    annotation_count: 0,
    committed_count: progress.completed_count,
    completed_at: new Date().toISOString(),
    entry_count: total,
    failed_count: result.status === 'failed' ? Math.max(1, total - progress.completed_count) : 0,
    imported_count: progress.completed_count,
    remaining_count: Math.max(0, total - progress.completed_count),
    source_count: total,
    skipped_count: 0,
    status: result.status === 'completed' || result.status === 'already_completed' ? 'completed' as const : 'failed' as const
  };
}

export function cancelReadwiseApiImport() {
  if (!activeApiImport) return { status: 'idle' as const };
  activeApiImport.controller.abort();
  return { status: 'cancelled' as const };
}

async function runNow(
  input: Parameters<typeof runReadwiseApiImport>[0], signal: AbortSignal
): Promise<NativeReadwiseImportRunResult> {
  assertReadwiseApiScopeAllowed('api');
  const settings = input?.settings ? normalizeImportManagerSettings(input.settings) : loadImportManagerSettings();
  const connectionRef = requireConnectionRef();
  const kind = loadReadwiseApiCompletedThrough(connectionRef) ? 'routine' : 'initial';
  beginReadwiseApiTrackedRun(connectionRef, input?.trigger ?? 'manual', kind);
  try {
    updateReadwiseApiTrackedRunStage('fetching');
    const result = await runReadwiseApiCandidatePipeline({
      assertEligible: () => assertEligible(signal, connectionRef),
      connectionRef,
      dependencies: {
        ...input?.dependencies,
        signal,
        onPage: (page) => publishProgress(input?.window, 0, 0, 'fetching', page.recordCount)
      },
      onCandidateCount: updateReadwiseApiTrackedRunProgress,
      onProgress: (processed, total) => {
        updateReadwiseApiTrackedRunStage('writing');
        updateReadwiseApiTrackedRunProgress(processed, total);
        publishProgress(input?.window, processed, total, 'writing');
      },
      settings
    });
    updateReadwiseApiTrackedRunStage('completion');
    assertEligible(signal, connectionRef);
    const output: NativeReadwiseImportRunResult = {
      annotation_count: result.annotationCount,
      committed_count: result.committedCount,
      completed_at: new Date().toISOString(),
      entry_count: result.totalCount,
      failed_count: result.failedCount,
      imported_count: result.committedCount,
      remaining_count: result.remainingCount,
      source_count: result.totalCount,
      skipped_count: result.skippedCount,
      status: result.remainingCount > 0 ? 'failed' : 'completed'
    };
    completeReadwiseApiTrackedRun(connectionRef, output);
    publishProgress(input?.window, result.completedCount, result.totalCount, 'source_completed');
    return output;
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      const result = createCancelledReadwiseApiImportResult();
      completeReadwiseApiTrackedRun(connectionRef, result);
      publishProgress(input?.window, 0, 0, 'source_completed', undefined, 'cancelled');
      return result;
    }
    failReadwiseApiTrackedRun(connectionRef, error);
    publishProgress(input?.window, 0, 0, 'source_completed', undefined, 'failed');
    throw error;
  }
}

function requireConnectionRef() {
  if (!canCurrentHostRunReadwise('api')) throw new Error('readwise_api_import_not_ready');
  const source = loadReadwiseRemoteSource();
  if (!source) throw new Error('readwise_api_source_missing');
  return source.connectionRef;
}

function assertEligible(signal: AbortSignal, connectionRef: string) {
  if (signal.aborted) throw new DOMException('Readwise import cancelled', 'AbortError');
  if (!canCurrentHostRunReadwise('api')) throw new Error('readwise_execution_eligibility_lost');
  if (loadReadwiseRemoteSource()?.connectionRef !== connectionRef) {
    throw new Error('readwise_execution_connection_changed');
  }
}

function publishProgress(
  window: ReadwiseImportProgressWindow | null | undefined,
  processedCount: number,
  totalCount: number,
  phase: 'fetching' | 'source_completed' | 'writing',
  sourceProcessedCount?: number,
  terminalStatus?: 'cancelled' | 'completed' | 'failed'
) {
  notifyReadwiseReaderImportProgress({
    phase, processedCount, ...(sourceProcessedCount === undefined ? {} : { sourceProcessedCount }),
    status: phase === 'source_completed' ? terminalStatus ?? 'completed' : 'running', totalCount
  }, window);
}
