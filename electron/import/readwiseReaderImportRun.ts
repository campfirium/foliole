import {
  normalizeImportManagerSettings,
  type ImportManagerSourceDraft,
  type ReadwiseSourceKind
} from '../../lib/core/import/importManagerSettings.js';
import type { NativeReadwiseImportRunResult } from '../../lib/platform/nativeImportContract.js';

import { loadImportManagerSettings, saveImportManagerSettings } from './importManagerSettings.js';
import { runKeepImportRule } from './keepImportService.js';

type EnabledReadwiseSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };

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

async function runReadwiseSource(source: EnabledReadwiseSource) {
  return runKeepImportRule({
    directoryPath: source.primaryPath,
    highlightPolicy: 'reference_only',
    ruleId: source.id,
    sourceType: 'readwise'
  });
}

function countImportedEntries(entries: Awaited<ReturnType<typeof runReadwiseSource>>) {
  return entries.filter(
    (entry) =>
      entry.importStatus === 'imported' ||
      entry.importStatus === 'degraded' ||
      entry.importStatus === 'duplicate'
  ).length;
}

export async function runReadwiseReaderImport(input?: {
  settings?: unknown;
}): Promise<NativeReadwiseImportRunResult> {
  const settings = resolveRunSettings(input);
  const sources = settings.readwiseSources.filter(isEnabledReadwiseSource);
  let failedCount = 0;
  let entryCount = 0;
  let importedCount = 0;
  let skippedCount = 0;

  for (const source of sources) {
    try {
      const entries = await runReadwiseSource(source);
      entryCount += entries.length;
      importedCount += countImportedEntries(entries);
      skippedCount += entries.filter((entry) => entry.action === 'skipped').length;
    } catch {
      failedCount += 1;
    }
  }

  return {
    completed_at: new Date().toISOString(),
    entry_count: entryCount,
    failed_count: failedCount,
    imported_count: importedCount,
    source_count: sources.length,
    skipped_count: skippedCount,
    status: failedCount > 0 ? 'failed' : 'completed'
  };
}
