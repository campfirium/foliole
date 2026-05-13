import { logReadwiseScanCompleted } from './readwiseImportRunLogger.js';

export interface KeepImportRunEntry {
  action: 'import_attempted' | 'skipped';
  detail: string | null;
  failureReason: string | null;
  importStatus: 'blocked_deleted' | 'degraded' | 'duplicate' | 'failed' | 'imported' | null;
  previewStatus: 'blocked_deleted' | 'failed' | 'new' | 'unchanged' | 'updated';
  sourcePath: string;
}

export function shouldLogReadwiseScan(sourceType?: 'generic' | 'readwise') {
  return sourceType === 'readwise';
}

export async function logReadwiseRunCompleted(input: {
  directoryPath: string;
  entries: KeepImportRunEntry[];
  ruleId: string;
}) {
  await logReadwiseScanCompleted({
    blockedCount: input.entries.filter((entry) => entry.previewStatus === 'blocked_deleted').length,
    directoryPath: input.directoryPath,
    discoveredCount: input.entries.length,
    entries: input.entries,
    failedCount: input.entries.filter((entry) => entry.importStatus === 'failed' || entry.previewStatus === 'failed').length,
    importedCount: input.entries.filter((entry) =>
      entry.importStatus === 'imported' || entry.importStatus === 'degraded' || entry.importStatus === 'duplicate'
    ).length,
    ruleId: input.ruleId,
    skippedCount: input.entries.filter((entry) => entry.action === 'skipped').length
  });
}
