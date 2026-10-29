import { mergeWorkspaceRefreshScopes } from '../../lib/core/database/workspaceSnapshotRefresh.js';
import { normalizeImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseImportRunResult } from '../../lib/platform/nativeImportContract.js';
import { currentLibraryScope } from '../database/attachmentResourceDescription.js';
import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';
import { notifyWorkspaceContentChanged } from '../ipc/workspaceContentChangedEvents.js';

import { loadImportManagerSettings, saveImportManagerSettings } from './importManagerSettings.js';
import { isKeepImportMonitorSnapshotFresh } from './keepImportMonitorRuntime.js';
import { isKeepImportAbortError, throwIfKeepImportAborted } from './keepImportProgress.js';
import { createRunAccumulator, publishAccumulatorProgress, toReadwiseImportRunResult,
  type ReadwiseImportProgressWindow, type ReadwiseRunAccumulator } from './readwiseReaderRunAccumulator.js';
import { applyReadwiseBooksRun, applyReadwiseSnapshotRun, applyReadwiseSourceRun,
  isEnabledReadwiseSource, type EnabledReadwiseSource } from './readwiseRelaySources.js';

function resolveRunSettings(input?: { settings?: unknown }) {
  return input?.settings
    ? saveImportManagerSettings(normalizeImportManagerSettings(input.settings))
    : loadImportManagerSettings();
}

export async function runReadwiseReaderImportNow(input?: {
  settings?: unknown;
  window?: ReadwiseImportProgressWindow | null;
}, signal?: AbortSignal): Promise<NativeReadwiseImportRunResult> {
  const libraryScope = currentLibraryScope();
  const settings = resolveRunSettings(input);
  if (!settings.readwiseReaderConfig.enabled || !canCurrentHostRunReadwise('relay')) {
    return {
      completed_at: new Date().toISOString(),
      entry_count: 0,
      failed_count: 0,
      imported_count: 0,
      source_count: 0,
      skipped_count: 0,
      status: 'completed', workspace_scope: { kind: 'nodes', nodeIds: [] }, library_scope: libraryScope
    };
  }
  const sources = settings.readwiseSources.filter(isEnabledReadwiseSource);
  const accumulator = createRunAccumulator({
    libraryScope,
    readwiseConfig: settings.readwiseReaderConfig,
    readwiseAutoImportPolicy: settings.readwiseAutoImportPolicy,
    ...(signal ? { signal } : {}),
    sourceCount: sources.length,
    ...(input?.window ? { window: input.window } : {})
  });
  publishAccumulatorProgress(accumulator);

  try {
    await applySources(sources, accumulator);
  } catch (error) {
    if (!isKeepImportAbortError(error)) {
      notifyWorkspaceContentChanged(null, { requestSync: false, libraryScope,
        workspaceScope: mergeWorkspaceRefreshScopes(accumulator.workspaceScopes) });
      throw error;
    }
    publishAccumulatorProgress(accumulator, 'cancelled');
    return toReadwiseImportRunResult(accumulator, 'cancelled');
  }

  const status = accumulator.failedCount > 0 ? 'failed' : 'completed';
  publishAccumulatorProgress(accumulator, status);
  return toReadwiseImportRunResult(accumulator, status);
}

async function applySources(sources: EnabledReadwiseSource[], accumulator: ReadwiseRunAccumulator) {
  for (const source of sources) {
    throwIfKeepImportAborted(accumulator.signal);
    if (!canCurrentHostRunReadwise('relay')) throw new Error('readwise_execution_eligibility_lost');
    if (source.kind === 'books') {
      await applyReadwiseBooksRun(source, accumulator);
    } else if (isKeepImportMonitorSnapshotFresh(source.id)) {
      applyReadwiseSnapshotRun(source, accumulator);
    } else {
      await applyReadwiseSourceRun(source, accumulator);
    }
  }
}
