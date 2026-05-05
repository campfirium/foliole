import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeSyncReviewLogRecord } from '../../lib/platform/nativeSyncContract.js';

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
       device_id,
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

export function applySyncReviewLog(records: NativeSyncReviewLogRecord[], options: ApplySyncReviewLogOptions = {}) {
  const appliedOpIds: string[] = [];
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    for (const record of records) {
      const result = driver.prepare(
        `INSERT INTO review_log (
           id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at,
           due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(op_id) DO NOTHING`
      ).run([
        record.id,
        record.op_id,
        record.device_id,
        record.node_id,
        record.grade,
        record.scheduler_version,
        record.reviewed_at,
        record.due_before,
        record.stability_before,
        record.difficulty_before,
        record.due_after,
        record.stability_after,
        record.difficulty_after
      ]);
      if (result.changes > 0 || options.includeAlreadyApplied) {
        appliedOpIds.push(record.op_id);
      }
    }
  });
  return appliedOpIds;
}
