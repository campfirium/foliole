import {
  normalizeImportManagerSettings,
  type ImportManagerSourceDraft,
  type ReadwiseSourceKind
} from '../../lib/core/import/importManagerSettings.js';
import type {
  NativeReadwiseImportRunFailedSource,
  NativeReadwiseImportRunProgressEvent,
  NativeReadwiseImportRunResult
} from '../../lib/platform/nativeImportContract.js';
import { IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL } from '../ipc/contracts.js';

import { loadImportManagerSettings, saveImportManagerSettings } from './importManagerSettings.js';
import { runKeepImportRule } from './keepImportService.js';

type EnabledReadwiseSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };
type ReadwiseImportProgressWindow = {
  isDestroyed: () => boolean;
  webContents: {
    send: (channel: string, payload: NativeReadwiseImportRunProgressEvent) => void;
  };
};
interface ReadwiseRunAccumulator {
  entryCount: number;
  failedCount: number;
  failedSources: NativeReadwiseImportRunFailedSource[];
  importedCount: number;
  processedCount: number;
  skippedCount: number;
  totalCount: number;
  window?: ReadwiseImportProgressWindow | null;
}

let activeReadwiseReaderImport: Promise<NativeReadwiseImportRunResult> | null = null;

function isEnabledReadwiseSource(
  source: ImportManagerSourceDraft
): source is EnabledReadwiseSource {
  return (
    source.keepState === 'enabled' &&
    Boolean(source.kind) &&
    source.kind !== 'books' &&
    source.primaryPath.trim().length > 0 &&
    source.highlightPath.trim().length > 0
  );
}

function resolveRunSettings(input?: { settings?: unknown }) {
  return input?.settings
    ? saveImportManagerSettings(normalizeImportManagerSettings(input.settings))
    : loadImportManagerSettings();
}

async function runReadwiseSource(source: EnabledReadwiseSource) {
  return runKeepImportRule({
    directoryPath: source.primaryPath,
    highlightPolicy: 'reference_only',
    ruleId: source.id,
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

function publishReadwiseReaderImportProgress(
  window: ReadwiseImportProgressWindow | null | undefined,
  payload: NativeReadwiseImportRunProgressEvent
) {
  if (!window || window.isDestroyed()) {
    return;
  }
  window.webContents.send(IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL, payload);
}

function countImportedEntries(entries: Awaited<ReturnType<typeof runReadwiseSource>>) {
  return entries.filter(
    (entry) =>
      entry.importStatus === 'imported' ||
      entry.importStatus === 'degraded' ||
      entry.importStatus === 'duplicate'
  ).length;
}

function createRunAccumulator(
  sources: EnabledReadwiseSource[],
  window: ReadwiseImportProgressWindow | null | undefined
): ReadwiseRunAccumulator {
  return {
    entryCount: 0,
    failedCount: 0,
    failedSources: [],
    importedCount: 0,
    processedCount: 0,
    skippedCount: 0,
    totalCount: sources.length,
    ...(window ? { window } : {})
  };
}

function publishAccumulatorProgress(
  accumulator: ReadwiseRunAccumulator,
  status: NativeReadwiseImportRunProgressEvent['status'] = 'running'
) {
  publishReadwiseReaderImportProgress(accumulator.window, {
    processedCount: accumulator.processedCount,
    status,
    totalCount: accumulator.totalCount
  });
}

async function applyReadwiseSourceRun(
  source: EnabledReadwiseSource,
  accumulator: ReadwiseRunAccumulator
) {
  try {
    const entries = await runReadwiseSource(source);
    accumulator.entryCount += entries.length;
    accumulator.importedCount += countImportedEntries(entries);
    accumulator.skippedCount += entries.filter((entry) => entry.action === 'skipped').length;
  } catch (error) {
    if (!isMissingReadwiseSourceDirectory(error)) {
      accumulator.failedCount += 1;
      accumulator.failedSources.push(toFailedReadwiseSource(source, error));
    }
  }
  accumulator.processedCount += 1;
  publishAccumulatorProgress(accumulator);
}

function toReadwiseImportRunResult(
  accumulator: ReadwiseRunAccumulator,
  status: NativeReadwiseImportRunResult['status']
): NativeReadwiseImportRunResult {
  return {
    completed_at: new Date().toISOString(),
    entry_count: accumulator.entryCount,
    failed_count: accumulator.failedCount,
    ...(accumulator.failedSources.length ? { failed_sources: accumulator.failedSources } : {}),
    imported_count: accumulator.importedCount,
    source_count: accumulator.totalCount,
    skipped_count: accumulator.skippedCount,
    status
  };
}

export async function runReadwiseReaderImport(input?: {
  settings?: unknown;
  window?: ReadwiseImportProgressWindow | null;
}): Promise<NativeReadwiseImportRunResult> {
  if (activeReadwiseReaderImport) {
    return activeReadwiseReaderImport;
  }
  activeReadwiseReaderImport = runReadwiseReaderImportNow(input).finally(() => {
    activeReadwiseReaderImport = null;
  });
  return activeReadwiseReaderImport;
}

async function runReadwiseReaderImportNow(input?: {
  settings?: unknown;
  window?: ReadwiseImportProgressWindow | null;
}): Promise<NativeReadwiseImportRunResult> {
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
  const accumulator = createRunAccumulator(sources, input?.window);
  publishAccumulatorProgress(accumulator);

  for (const source of sources) {
    await applyReadwiseSourceRun(source, accumulator);
  }

  const status = accumulator.failedCount > 0 ? 'failed' : 'completed';
  publishAccumulatorProgress(accumulator, status);
  return toReadwiseImportRunResult(accumulator, status);
}
