import type { ImportManagerSourceDraft, ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseImportRunFailedSource } from '../../lib/platform/nativeImportContract.js';
import { countPresentKeepImportItems } from '../database/keepImportItems.js';

import type { KeepImportProgressEvent } from './keepImportProgress.js';
import { isKeepImportAbortError, throwIfKeepImportAborted } from './keepImportProgress.js';
import { requestKeepImportRuleRun } from './keepImportService.js';
import { runReadwiseBooksSource } from './readwiseReaderBooksRun.js';
import { publishAccumulatorProgress, type ReadwiseRunAccumulator } from './readwiseReaderRunAccumulator.js';

export type EnabledReadwiseSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };

export function isEnabledReadwiseSource(
  source: ImportManagerSourceDraft
): source is EnabledReadwiseSource {
  return (
    source.keepState === 'enabled' &&
    Boolean(source.kind) &&
    source.primaryPath.trim().length > 0 &&
    source.highlightPath.trim().length > 0
  );
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

export async function applyReadwiseSourceRun(
  source: EnabledReadwiseSource,
  accumulator: ReadwiseRunAccumulator
) {
  try {
    throwIfKeepImportAborted(accumulator.signal);
    const entries = await runReadwiseSource(source, (progress) => {
      publishAccumulatorProgress(accumulator, 'running', progress);
    }, accumulator.signal);
    accumulator.workspaceScopes.push(...entries.map(entry => entry.workspaceScope ??
      (entry.action === 'import_attempted' ? { kind: 'full' as const } : { kind: 'nodes' as const, nodeIds: [] })));
    accumulator.entryCount += entries.length;
    accumulator.importedCount += countImportedEntries(entries);
    accumulator.skippedCount += entries.filter((entry) => entry.action === 'skipped').length;
  } catch (error) {
    accumulator.workspaceScopes.push({ kind: 'full' });
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

export async function applyReadwiseBooksRun(
  source: EnabledReadwiseSource,
  accumulator: ReadwiseRunAccumulator
) {
  try {
    const result = await runReadwiseBooksSource(
      source,
      accumulator.readwiseConfig,
      accumulator.readwiseAutoImportPolicy,
      { ...(accumulator.signal ? { signal: accumulator.signal } : {}) }
    );
    accumulator.workspaceScopes.push(result.workspaceScope);
    accumulator.entryCount += result.entryCount;
    accumulator.importedCount += result.importedCount;
  } catch (error) {
    accumulator.workspaceScopes.push({ kind: 'full' });
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

export function applyReadwiseSnapshotRun(source: EnabledReadwiseSource, accumulator: ReadwiseRunAccumulator) {
  const entryCount = countPresentKeepImportItems(source.id);
  accumulator.entryCount += entryCount;
  accumulator.skippedCount += entryCount;
  accumulator.processedCount += 1;
  publishAccumulatorProgress(accumulator);
}
