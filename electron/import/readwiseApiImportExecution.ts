import { mergeWorkspaceRefreshScopes, workspaceRefreshScopeHasChanges, type WorkspaceRefreshScope } from '../../lib/core/database/workspaceSnapshotRefresh.js';
import { normalizeImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseImportRunResult } from '../../lib/platform/nativeImportContract.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadReadwiseApiCompletedThrough, loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { readReadwiseApiSourceDisposition } from '../database/readwiseApiSourceDispositions.js';
import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';
import { notifyReadwiseReaderImportProgress } from '../ipc/readwiseReaderImportProgressEvents.js';
import { notifyWorkspaceContentChanged } from '../ipc/workspaceContentChangedEvents.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { runReadwiseApiCandidatePipeline } from './readwiseApiCandidatePipeline.js';
import { isReadwiseApiCandidateBlockedByCutover } from './readwiseApiCandidateSkip.js';
import type { ReadwiseApiCandidate } from './readwiseApiCandidateTypes.js';
import { createCancelledReadwiseApiImportResult } from './readwiseApiImportResults.js';
import type { runReadwiseApiImport } from './readwiseApiImportRun.js';
import { beginReadwiseApiTrackedRun, completeReadwiseApiTrackedRun, failReadwiseApiTrackedRun,
  updateReadwiseApiTrackedRunProgress, updateReadwiseApiTrackedRunStage } from './readwiseApiScheduleState.js';
import { assertReadwiseApiScopeAllowed } from './readwiseApiScopeGate.js';
import type { ReadwiseImportProgressWindow } from './readwiseReaderRunAccumulator.js';

export async function runReadwiseApiImportNow(
  input: Parameters<typeof runReadwiseApiImport>[0], signal: AbortSignal
): Promise<NativeReadwiseImportRunResult> {
  const { connectionRef, libraryScope, settings } = await beginApiImport(input);
  const scopes: WorkspaceRefreshScope[] = [];
  const receipt = () => ({ workspace_scope: mergeWorkspaceRefreshScopes(scopes), library_scope: libraryScope });
  try {
    await runWithDatabaseConnectionOwner(() => updateReadwiseApiTrackedRunStage('fetching'));
    const result = await runCandidates(input, signal, connectionRef, settings, scopes);
    await runWithDatabaseConnectionOwner(() => {
      updateReadwiseApiTrackedRunStage('completion');
      assertEligible(signal, connectionRef);
    });
    const output: NativeReadwiseImportRunResult = {
      ...receipt(),
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
    await runWithDatabaseConnectionOwner(() => completeReadwiseApiTrackedRun(connectionRef, output));
    publishProgress(input?.window, result.completedCount, result.totalCount, 'source_completed');
    return output;
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      const result = { ...createCancelledReadwiseApiImportResult(), ...receipt() };
      await runWithDatabaseConnectionOwner(() => completeReadwiseApiTrackedRun(connectionRef, result));
      publishProgress(input?.window, 0, 0, 'source_completed', undefined, 'cancelled');
      return result;
    }
    const changes = receipt();
    if (workspaceRefreshScopeHasChanges(changes.workspace_scope)) notifyWorkspaceContentChanged(null, {
      workspaceScope: changes.workspace_scope, libraryScope: changes.library_scope
    });
    await runWithDatabaseConnectionOwner(() => failReadwiseApiTrackedRun(connectionRef, error));
    publishProgress(input?.window, 0, 0, 'source_completed', undefined, 'failed');
    throw error;
  }
}

function runCandidates(input: Parameters<typeof runReadwiseApiImport>[0], signal: AbortSignal,
  connectionRef: string, settings: Awaited<ReturnType<typeof beginApiImport>>['settings'],
  scopes: WorkspaceRefreshScope[]) {
  return runReadwiseApiCandidatePipeline({
    assertEligible: () => assertEligible(signal, connectionRef),
    connectionRef,
    dependencies: {
      ...input?.dependencies,
      signal,
      onPage: (page) => publishProgress(input?.window, 0, 0, 'fetching', page.recordCount)
    },
    onCandidateCount: updateReadwiseApiTrackedRunProgress,
    onWorkspaceChange: scope => scopes.push(scope),
    onIndexProgress: (processed) => {
      updateReadwiseApiTrackedRunProgress(processed, null);
      publishProgress(input?.window, 0, 0, 'fetching', processed);
    },
    onProgress: (processed, total) => {
      updateReadwiseApiTrackedRunStage('writing');
      updateReadwiseApiTrackedRunProgress(processed, total);
      publishProgress(input?.window, processed, total, 'writing');
    },
    settings,
    shouldSkipCandidate: (candidate) => shouldSkipApiDocument(connectionRef, candidate)
  });
}

function beginApiImport(input: Parameters<typeof runReadwiseApiImport>[0]) {
  return runWithDatabaseConnectionOwner(() => {
    assertReadwiseApiScopeAllowed('api');
    const settings = input?.settings ? normalizeImportManagerSettings(input.settings) : loadImportManagerSettings();
    const connectionRef = requireConnectionRef();
    const kind = loadReadwiseApiCompletedThrough(connectionRef) ? 'routine' : 'initial';
    beginReadwiseApiTrackedRun(connectionRef, input?.trigger ?? 'manual', kind);
    return { connectionRef, libraryScope: currentLibraryScope(), settings };
  });
}

function shouldSkipApiDocument(connectionRef: string, candidate: ReadwiseApiCandidate) {
  const documentId = candidate.documentId;
  if (readReadwiseApiSourceDisposition(openDatabaseConnection().driver, connectionRef, documentId)) return true;
  const cutover = loadReadwiseSourceCutover();
  const cutoverStatus = cutover?.version === 2
    ? cutover.documents.find((item) => item.remoteId === documentId)?.status
    : null;
  if (isReadwiseApiCandidateBlockedByCutover(candidate, cutoverStatus)) return true;
  const existing = loadReadwiseApiImportSource(connectionRef, documentId);
  if (!existing) return false;
  const known = new Set(existing.annotations.map((item) => item.remoteId));
  return [...candidate.highlightIds, ...(candidate.noteIds ?? [])].every((id) => known.has(id));
}

export function requireConnectionRef() {
  if (!canCurrentHostRunReadwise('api')) throw new Error('readwise_api_import_not_ready');
  const source = loadReadwiseRemoteSource();
  if (!source) throw new Error('readwise_api_source_missing');
  return source.connectionRef;
}

export function assertEligible(signal: AbortSignal, connectionRef: string) {
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
