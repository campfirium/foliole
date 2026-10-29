import { normalizeImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseImportRunResult } from '../../lib/platform/nativeImportContract.js';
import type { NativeReadwiseApiRunTrigger } from '../../lib/platform/nativeReadwiseApiImportContract.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';
import { notifyWorkspaceContentChanged } from '../ipc/workspaceContentChangedEvents.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { ensureReadwiseApiCandidateIndex } from './readwiseApiCandidateFetch.js';
import { buildReadwiseApiCandidatePreview } from './readwiseApiCandidatePreview.js';
import { assertEligible, requireConnectionRef, runReadwiseApiImportNow } from './readwiseApiImportExecution.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { assertReadwiseApiScopeAllowed } from './readwiseApiScopeGate.js';
import { recoverReadwiseCutoverFailures } from './readwiseCutoverRecovery.js';
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
  const { connectionRef, settings } = await runWithDatabaseConnectionOwner(() => {
    assertReadwiseApiScopeAllowed('api');
    return {
      connectionRef: requireConnectionRef(),
      settings: settingsInput ? normalizeImportManagerSettings(settingsInput) : loadImportManagerSettings()
    };
  });
  const candidates = await ensureReadwiseApiCandidateIndex(settings, connectionRef, dependencies, 'api', undefined);
  return runWithDatabaseConnectionOwner(() => buildReadwiseApiCandidatePreview(settings, connectionRef, candidates));
}

export function runReadwiseApiImport(input?: {
  dependencies?: ReadwiseApiFetchDependencies;
  settings?: unknown;
  trigger?: NativeReadwiseApiRunTrigger;
  window?: ReadwiseImportProgressWindow | null;
}): Promise<NativeReadwiseImportRunResult> {
  if (activeApiImport) return activeApiImport.promise;
  const controller = new AbortController();
  const promise = startImport(input, controller.signal).finally(() => {
    if (activeApiImport?.controller === controller) activeApiImport = null;
  });
  activeApiImport = { controller, promise };
  return promise;
}

async function startImport(input: Parameters<typeof runReadwiseApiImport>[0], signal: AbortSignal) {
  const migrating = await runWithDatabaseConnectionOwner(() => (
    loadReadwiseSourceCutover()?.status === 'migration-in-progress'
  ));
  if (migrating) return runMigration(input);
  await recoverPendingChanges(input, signal);
  return runReadwiseApiImportNow(input, signal);
}

async function recoverPendingChanges(input: Parameters<typeof runReadwiseApiImport>[0], signal: AbortSignal) {
  const { connectionRef, libraryScope } = await runWithDatabaseConnectionOwner(() => ({
    connectionRef: requireConnectionRef(), libraryScope: currentLibraryScope()
  }));
  let recovered = false;
  try {
    await recoverReadwiseCutoverFailures({ connectionRef,
      dependencies: input?.dependencies ?? {}, assertEligible: () => assertEligible(signal, connectionRef),
      onCommitted: () => { recovered = true; } });
  } finally {
    // Recovery is a separate committed batch with an intentionally complete refresh.
    if (recovered) notifyWorkspaceContentChanged(null, { workspaceScope: { kind: 'full' }, libraryScope });
  }
}

async function runMigration(input: Parameters<typeof runReadwiseApiImport>[0]): Promise<NativeReadwiseImportRunResult> {
  const libraryScope = await runWithDatabaseConnectionOwner(currentLibraryScope);
  const result = await runReadwiseSourceCutover({
    ...(input?.dependencies ? { dependencies: input.dependencies } : {}),
    ...(input?.window ? { window: input.window } : {})
  }).catch(error => {
    notifyWorkspaceContentChanged(null, { workspaceScope: { kind: 'full' }, libraryScope });
    throw error;
  });
  const progress = await previewReadwiseSourceCutover();
  const total = progress.total_count ?? 0;
  return {
    workspace_scope: { kind: 'full' }, library_scope: libraryScope,
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

export function isReadwiseApiImportActive() {
  return activeApiImport !== null;
}
