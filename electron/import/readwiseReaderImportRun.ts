import {
  normalizeImportManagerSettings,
  type ImportManagerSourceDraft,
  type ReadwiseSourceKind
} from '../../lib/core/import/importManagerSettings.js';
import type {
  NativeReadwiseImportRunFailedSource,
  NativeReadwiseImportRunResult
} from '../../lib/platform/nativeImportContract.js';

import { loadImportManagerSettings, saveImportManagerSettings } from './importManagerSettings.js';
import type { KeepImportProgressEvent } from './keepImportProgress.js';
import { isKeepImportAbortError, throwIfKeepImportAborted } from './keepImportProgress.js';
import { requestKeepImportRuleRun } from './keepImportService.js';
import { runReadwiseBooksSource } from './readwiseReaderBooksRun.js';
import {
  createRunAccumulator,
  publishAccumulatorProgress,
  toReadwiseImportRunResult,
  type ReadwiseImportProgressWindow,
  type ReadwiseRunAccumulator
} from './readwiseReaderRunAccumulator.js';

type EnabledReadwiseSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };

interface ActiveReadwiseReaderImport {
  controller: AbortController;
  promise: Promise<NativeReadwiseImportRunResult>;
}

let activeReadwiseReaderImport: ActiveReadwiseReaderImport | null = null;

function isEnabledReadwiseSource(
  source: ImportManagerSourceDraft
): source is EnabledReadwiseSource {
  return (
    source.keepState === 'enabled' &&
    Boolean(source.kind) &&
    source.primaryPath.trim().length > 0 &&
    source.highlightPath.trim().length > 0
  );
}

function resolveRunSettings(input?: { settings?: unknown }) {
  return input?.settings
    ? saveImportManagerSettings(normalizeImportManagerSettings(input.settings))
    : loadImportManagerSettings();
}

async function runReadwiseSource(
  source: EnabledReadwiseSource,
  onProgress: (event: KeepImportProgressEvent) => void,
  signal?: AbortSignal
) {
  return requestKeepImportRuleRun({
    directoryPath: source.primaryPath,
    highlightPolicy: 'reference_only',
    onProgress,
    ruleId: source.id,
    ...(signal ? { signal } : {}),
    sourceType: 'readwise'
  });
}

function isMissingReadwiseSourceDirectory(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

function resolveReadwiseFailureReason(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Readwise source failed.';
}

function toFailedReadwiseSource(
  source: EnabledReadwiseSource,
  error: unknown
): NativeReadwiseImportRunFailedSource {
  return {
    reason: resolveReadwiseFailureReason(error),
    source_kind: source.kind,
    source_path: source.primaryPath
  };
}

function countImportedEntries(entries: Awaited<ReturnType<typeof runReadwiseSource>>) {
  return entries.filter(
    (entry) =>
      entry.importStatus === 'imported' ||
      entry.importStatus === 'degraded' ||
      entry.importStatus === 'duplicate'
  ).length;
}

async function applyReadwiseSourceRun(
  source: EnabledReadwiseSource,
  accumulator: ReadwiseRunAccumulator
) {
  try {
    throwIfKeepImportAborted(accumulator.signal);
    const entries = await runReadwiseSource(source, (progress) => {
      publishAccumulatorProgress(accumulator, 'running', progress);
    }, accumulator.signal);
    accumulator.entryCount += entries.length;
    accumulator.importedCount += countImportedEntries(entries);
    accumulator.skippedCount += entries.filter((entry) => entry.action === 'skipped').length;
  } catch (error) {
    if (isKeepImportAbortError(error)) {
      throw error;
    }
    if (!isMissingReadwiseSourceDirectory(error)) {
      accumulator.failedCount += 1;
      accumulator.failedSources.push(toFailedReadwiseSource(source, error));
    }
  }
  accumulator.processedCount += 1;
  publishAccumulatorProgress(accumulator);
}

async function applyReadwiseBooksRun(
  source: EnabledReadwiseSource,
  accumulator: ReadwiseRunAccumulator
) {
  try {
    const result = await runReadwiseBooksSource(source, accumulator.readwiseConfig, accumulator.signal);
    accumulator.entryCount += result.entryCount;
    accumulator.importedCount += result.importedCount;
  } catch (error) {
    if (isKeepImportAbortError(error)) {
      throw error;
    }
    if (!isMissingReadwiseSourceDirectory(error)) {
      accumulator.failedCount += 1;
      accumulator.failedSources.push(toFailedReadwiseSource(source, error));
    }
  }
  accumulator.processedCount += 1;
  publishAccumulatorProgress(accumulator);
}

export async function runReadwiseReaderImport(input?: {
  settings?: unknown;
  window?: ReadwiseImportProgressWindow | null;
}): Promise<NativeReadwiseImportRunResult> {
  if (activeReadwiseReaderImport) {
    return activeReadwiseReaderImport.promise;
  }
  const controller = new AbortController();
  const promise = runReadwiseReaderImportNow(input, controller.signal).finally(() => {
    if (activeReadwiseReaderImport?.controller === controller) {
      activeReadwiseReaderImport = null;
    }
  });
  activeReadwiseReaderImport = { controller, promise };
  return promise;
}

export function cancelReadwiseReaderImport() {
  if (!activeReadwiseReaderImport) {
    return { status: 'idle' as const };
  }
  activeReadwiseReaderImport.controller.abort();
  return { status: 'cancelled' as const };
}

async function runReadwiseReaderImportNow(input?: {
  settings?: unknown;
  window?: ReadwiseImportProgressWindow | null;
}, signal?: AbortSignal): Promise<NativeReadwiseImportRunResult> {
  const settings = resolveRunSettings(input);
  if (!settings.readwiseReaderConfig.enabled) {
    return {
      completed_at: new Date().toISOString(),
      entry_count: 0,
      failed_count: 0,
      imported_count: 0,
      source_count: 0,
      skipped_count: 0,
      status: 'completed'
    };
  }
  const sources = settings.readwiseSources.filter(isEnabledReadwiseSource);
  const accumulator = createRunAccumulator({
    readwiseConfig: settings.readwiseReaderConfig,
    ...(signal ? { signal } : {}),
    sourceCount: sources.length,
    ...(input?.window ? { window: input.window } : {})
  });
  publishAccumulatorProgress(accumulator);

  try {
    for (const source of sources) {
      throwIfKeepImportAborted(signal);
      if (source.kind === 'books') {
        await applyReadwiseBooksRun(source, accumulator);
      } else {
        await applyReadwiseSourceRun(source, accumulator);
      }
    }
  } catch (error) {
    if (!isKeepImportAbortError(error)) {
      throw error;
    }
    publishAccumulatorProgress(accumulator, 'cancelled');
    return toReadwiseImportRunResult(accumulator, 'cancelled');
  }

  const status = accumulator.failedCount > 0 ? 'failed' : 'completed';
  publishAccumulatorProgress(accumulator, status);
  return toReadwiseImportRunResult(accumulator, status);
}
