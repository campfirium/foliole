import {
  processSearchIndexInvalidations,
  readSearchIndexInvalidationBacklog
} from '../../lib/core/database/searchIndexInvalidations.js';
import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import { openDatabaseConnection } from '../database/connection.js';

import type { KeepImportProgressSink } from './keepImportProgress.js';

const INDEX_BATCH_LIMIT = 500;
const INDEX_DEGRADED_REASON = 'Search index update failed after import.';

function publishIndexingProgress(input: {
  elapsedMs: number;
  failedCount: number;
  onProgress: KeepImportProgressSink | undefined;
  pendingCount: number;
  processedCount: number;
  sourceName: string;
  totalCount: number;
}) {
  input.onProgress?.({
    currentSourcePath: input.sourceName,
    indexElapsedMs: input.elapsedMs,
    indexFailedCount: input.failedCount,
    indexPendingCount: input.pendingCount,
    indexProcessedCount: input.processedCount,
    indexTotalCount: input.totalCount,
    phase: 'indexing',
    sourceProcessedCount: 0,
    sourceTotalCount: 0
  });
}

function markImportRunIndexDegraded(record: PersistedImportRecord) {
  const degradedReason = record.degradedReason
    ? `${record.degradedReason}; ${INDEX_DEGRADED_REASON}`
    : INDEX_DEGRADED_REASON;
  openDatabaseConnection().driver.execute('UPDATE import_runs SET result_status = ?, degraded_reason = ? WHERE id = ?', [
    'degraded',
    degradedReason,
    record.importId
  ]);
  return { ...record, degradedReason, resultStatus: 'degraded' as const };
}

export function processSearchIndexForKeepImportSource(input: {
  onProgress: KeepImportProgressSink | undefined;
  record: PersistedImportRecord;
  sourceName: string;
}) {
  const driver = openDatabaseConnection().driver;
  const initial = readSearchIndexInvalidationBacklog(driver);
  if (initial.total_count === 0) return input.record;
  const startedAt = Date.now();
  let processedCount = 0;
  let failedCount = 0;
  publishIndexingProgress({
    failedCount,
    elapsedMs: 0,
    onProgress: input.onProgress,
    pendingCount: initial.total_count,
    processedCount,
    sourceName: input.sourceName,
    totalCount: initial.total_count
  });
  while (processedCount < initial.total_count) {
    const result = processSearchIndexInvalidations(driver, INDEX_BATCH_LIMIT);
    processedCount += result.processed;
    failedCount += result.failed;
    const backlog = readSearchIndexInvalidationBacklog(driver);
    publishIndexingProgress({
      elapsedMs: Date.now() - startedAt,
      failedCount,
      onProgress: input.onProgress,
      pendingCount: backlog.total_count,
      processedCount: Math.min(processedCount, initial.total_count),
      sourceName: input.sourceName,
      totalCount: initial.total_count
    });
    if (result.failed > 0 || (result.processed === 0 && result.failed === 0)) break;
  }
  return failedCount > 0 ? markImportRunIndexDegraded(input.record) : input.record;
}
