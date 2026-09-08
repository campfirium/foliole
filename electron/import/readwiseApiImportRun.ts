import { normalizeImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseImportRunResult } from '../../lib/platform/nativeImportContract.js';
import type { NativeReadwiseApiRunTrigger } from '../../lib/platform/nativeReadwiseApiImportContract.js';
import {
  completeReadwiseApiImportRun,
  loadOrCreateReadwiseApiImportRun,
  resetReadwiseApiImportRun
} from '../database/readwiseApiImportState.js';
import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL } from '../ipc/contracts.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';
import { fetchReadwiseApiImportRound, type ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { buildReadwiseApiPreview, selectReadwiseApiBatch } from './readwiseApiImportPreview.js';
import { createCancelledReadwiseApiImportResult } from './readwiseApiImportResults.js';
import {
  beginReadwiseApiTrackedRun,
  completeReadwiseApiTrackedRun,
  failReadwiseApiTrackedRun,
  updateReadwiseApiTrackedRunStage
} from './readwiseApiScheduleState.js';
import type { ReadwiseImportProgressWindow } from './readwiseReaderRunAccumulator.js';


interface ActiveApiImport {
  controller: AbortController;
  promise: Promise<NativeReadwiseImportRunResult>;
}

let activeApiImport: ActiveApiImport | null = null;

export async function previewReadwiseApiImport(
  settingsInput?: unknown,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const settings = settingsInput ? normalizeImportManagerSettings(settingsInput) : loadImportManagerSettings();
  const connectionRef = requireConnectionRef();
  await fetchReadwiseApiImportRound(connectionRef, dependencies);
  return buildReadwiseApiPreview(settings, connectionRef);
}

export function runReadwiseApiImport(input?: {
  dependencies?: ReadwiseApiFetchDependencies;
  settings?: unknown;
  trigger?: NativeReadwiseApiRunTrigger;
  window?: ReadwiseImportProgressWindow | null;
}): Promise<NativeReadwiseImportRunResult> {
  if (activeApiImport) return activeApiImport.promise;
  const controller = new AbortController();
  const promise = runNow(input, controller.signal).finally(() => {
    if (activeApiImport?.controller === controller) activeApiImport = null;
  });
  activeApiImport = { controller, promise };
  return promise;
}

export function cancelReadwiseApiImport() {
  if (!activeApiImport) return { status: 'idle' as const };
  activeApiImport.controller.abort();
  return { status: 'cancelled' as const };
}

async function runNow(
  input: Parameters<typeof runReadwiseApiImport>[0], signal: AbortSignal
): Promise<NativeReadwiseImportRunResult> {
  const settings = input?.settings ? normalizeImportManagerSettings(input.settings) : loadImportManagerSettings();
  const connectionRef = requireConnectionRef();
  beginReadwiseApiTrackedRun(connectionRef, input?.trigger ?? 'manual');
  try {
    updateReadwiseApiTrackedRunStage('fetching');
    await fetchReadwiseApiImportRound(connectionRef, {
      ...input?.dependencies,
      signal,
      onPage: (page) => publishProgress(input?.window, 0, 0, 'fetching', page.recordCount)
    });
    const documents = selectReadwiseApiBatch(settings, connectionRef);
    let annotationCount = 0;
    updateReadwiseApiTrackedRunStage('writing');
    for (const [index, document] of documents.entries()) {
      assertEligible(signal, connectionRef);
      const result = await commitReadwiseApiDocument({
        assertEligible: () => assertEligible(signal, connectionRef),
        config: settings.readwiseReaderConfig, connectionRef, dependencies: { ...input?.dependencies, signal }, document
      });
      annotationCount += result.annotationCount;
      publishProgress(input?.window, index + 1, documents.length, 'writing');
    }
    const remainingPreview = buildReadwiseApiPreview(settings, connectionRef);
    const remainingCount = remainingPreview.write_count;
    updateReadwiseApiTrackedRunStage('completion');
    assertEligible(signal, connectionRef);
    if (remainingCount === 0 && remainingPreview.failed_count === 0) {
      completeReadwiseApiImportRun(loadOrCreateReadwiseApiImportRun(connectionRef));
    } else if (remainingCount === 0) {
      resetReadwiseApiImportRun(connectionRef);
    }
    publishProgress(input?.window, documents.length, documents.length, 'source_completed');
    const result: NativeReadwiseImportRunResult = {
      annotation_count: annotationCount,
      committed_count: documents.length,
      completed_at: new Date().toISOString(),
      entry_count: documents.length,
      failed_count: remainingPreview.failed_count,
      imported_count: documents.length,
      remaining_count: remainingCount,
      source_count: remainingPreview.total_count,
      skipped_count: remainingPreview.off_count,
      status: remainingCount > 0 ? 'paused' : remainingPreview.failed_count > 0 ? 'failed' : 'completed'
    };
    completeReadwiseApiTrackedRun(connectionRef, result);
    return result;
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      const result = createCancelledReadwiseApiImportResult();
      completeReadwiseApiTrackedRun(connectionRef, result);
      return result;
    }
    failReadwiseApiTrackedRun(connectionRef);
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
  sourceProcessedCount?: number
) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL, {
    phase, processedCount, ...(sourceProcessedCount === undefined ? {} : { sourceProcessedCount }),
    status: phase === 'source_completed' ? 'completed' : 'running', totalCount
  });
}
