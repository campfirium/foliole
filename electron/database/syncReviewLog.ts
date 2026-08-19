import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { applyReviewLogRecordsWithDbPort } from '../../lib/core/sync/syncPackReviewLogExecutor.js';
import type { NativeSyncReviewLogRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';

interface ReviewLogRow extends DatabaseRow, NativeSyncReviewLogRecord {}

interface ApplySyncReviewLogOptions {
  includeAlreadyApplied?: boolean;
}

export function loadSyncReviewLogSince(cursor: { opId: string; reviewedAt: string } | null, limit = 500) {
  return openDatabaseConnection().driver.queryAll<ReviewLogRow>(
    `SELECT
       id,
       op_id,
       host_name,
       node_id,
       grade,
       scheduler_version,
       reviewed_at,
       due_before,
       stability_before,
       difficulty_before,
       due_after,
       stability_after,
       difficulty_after
     FROM review_log
     WHERE ${cursor ? '(reviewed_at > ? OR (reviewed_at = ? AND op_id > ?))' : '1 = 1'}
     ORDER BY reviewed_at ASC, op_id ASC
     LIMIT ?`,
    cursor
      ? [cursor.reviewedAt, cursor.reviewedAt, cursor.opId, Math.max(1, Math.min(1000, Math.trunc(limit)))]
      : [Math.max(1, Math.min(1000, Math.trunc(limit)))]
  );
}

export async function applySyncReviewLogAsync(
  records: NativeSyncReviewLogRecord[],
  options: ApplySyncReviewLogOptions = {}
) {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'desktop-sync-review-log-apply' });
  return applyReviewLogRecordsWithDbPort(
    port,
    records,
    options.includeAlreadyApplied === undefined ? {} : { includeAlreadyApplied: options.includeAlreadyApplied }
  );
}
