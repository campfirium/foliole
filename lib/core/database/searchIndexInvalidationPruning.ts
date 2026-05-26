import type { DatabaseDriver, DatabaseRow } from './driver.js';

const COMPLETED_RETENTION_WHERE = `
     WHERE status = 'completed'
       AND completed_at IS NOT NULL
       AND completed_at < ?`;

export interface SearchIndexInvalidationRetentionStatusCounts extends DatabaseRow {
  failedRows: number;
  pendingRows: number;
  runningRows: number;
}

export function countCompletedSearchIndexInvalidationsOlderThan(
  driver: DatabaseDriver,
  olderThanIso: string
) {
  const boundary = requireRetentionBoundary(olderThanIso);
  return driver.queryOne<{ rows: number }>(
    `SELECT COUNT(*) AS rows
     FROM search_index_invalidations
     ${COMPLETED_RETENTION_WHERE}`,
    [boundary]
  )?.rows ?? 0;
}

export function readSearchIndexInvalidationRetentionStatusCounts(driver: DatabaseDriver) {
  return driver.queryOne<SearchIndexInvalidationRetentionStatusCounts>(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failedRows,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pendingRows,
       COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) AS runningRows
     FROM search_index_invalidations`
  ) ?? { failedRows: 0, pendingRows: 0, runningRows: 0 };
}

export function pruneCompletedSearchIndexInvalidations(
  driver: DatabaseDriver,
  olderThanIso: string
) {
  const boundary = requireRetentionBoundary(olderThanIso);
  return driver
    .prepare(
      `DELETE FROM search_index_invalidations
     ${COMPLETED_RETENTION_WHERE}`
    )
    .run([boundary]).changes;
}

function requireRetentionBoundary(olderThanIso: string) {
  const boundary = olderThanIso.trim();
  if (!boundary) {
    throw new Error('olderThanIso is required');
  }
  return boundary;
}
