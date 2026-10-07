import type { DbPort } from '../sync/dbPort.js';

export const STORED_SOURCE_INVALIDATION_TYPES = ['stored_source_external', 'stored_source_removed'] as const;
export type StoredSourceInvalidationType = typeof STORED_SOURCE_INVALIDATION_TYPES[number];

export const DELETE_STORED_SOURCE_PENDING_SQL = `DELETE FROM search_index_invalidations
  WHERE invalidation_type = ? AND target_id = ? AND status = 'pending'`;
export const INSERT_STORED_SOURCE_PENDING_SQL = `INSERT INTO search_index_invalidations (
  invalidation_type, target_id, status, attempts, created_at, updated_at
) VALUES (?, ?, 'pending', 0, ?, ?)`;

/** Caller owns the transaction; each replacement row id is a fresh source generation. */
export async function enqueueStoredSourceSearchInvalidation(db: DbPort, input: {
  type: StoredSourceInvalidationType; sourceKey: string; timestamp: string;
}) {
  await db.run(DELETE_STORED_SOURCE_PENDING_SQL, [input.type, input.sourceKey]);
  await db.run(INSERT_STORED_SOURCE_PENDING_SQL, [input.type, input.sourceKey, input.timestamp, input.timestamp]);
}

export function storedSourceEnqueueTriggerSql(type: StoredSourceInvalidationType, target: string) {
  const timestamp = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
  return `DELETE FROM search_index_invalidations WHERE invalidation_type = '${type}'
    AND target_id = ${target} AND status = 'pending';
    INSERT INTO search_index_invalidations (invalidation_type, target_id, status, attempts, created_at, updated_at)
    VALUES ('${type}', ${target}, 'pending', 0, ${timestamp}, ${timestamp});`;
}
