import type { DatabaseDriver } from './driver.js';

export function pruneCompletedSearchIndexInvalidations(
  driver: DatabaseDriver,
  olderThanIso: string
) {
  const boundary = olderThanIso.trim();
  if (!boundary) {
    throw new Error('olderThanIso is required');
  }
  return driver
    .prepare(
      `DELETE FROM search_index_invalidations
     WHERE status = 'completed'
       AND completed_at IS NOT NULL
       AND completed_at < ?`
    )
    .run([boundary]).changes;
}
