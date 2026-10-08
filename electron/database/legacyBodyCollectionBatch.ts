import { readDataMigrationState } from '../../lib/core/database/dataMigrationState.js';
import { collectTextBodyBlobCandidates } from '../../lib/core/database/textBodyBlobCollection.js';

import type { DatabaseConnection } from './connection.js';
import {
  BODY_COLLECTION_ID, BODY_RECLAIM_ID, initialBodyMigrationProgress,
  readBodyMigrationProgress, saveBodyMigrationProgress, type BodyMigrationProgress
} from './legacyBodyMigrationState.js';

type Connection = Pick<DatabaseConnection, 'driver' | 'sqlite'>;
function collectBlobBatch(connection: Connection, progress: BodyMigrationProgress, limit: number) {
  const rows = connection.driver.queryAll<{ hash: string }>(
    `SELECT hash FROM content_blobs WHERE kind = 'text_body' AND hash > ? ORDER BY hash LIMIT ?`, [progress.cursor, limit]);
  const result = collectTextBodyBlobCandidates(connection.driver, rows.map((row) => row.hash));
  progress.deleted_bytes += result.deletedBytes;
  progress.deleted_blobs += result.deletedHashes.length;
  progress.cursor = rows.at(-1)?.hash ?? '';
  if (rows.length >= limit) return false;
  progress.phase = 'done';
  progress.cursor = '';
  return true;
}

/** Collect obsolete cache data in bounded transactions without rewriting owned node text. */
export function runLegacyBodyCollectionBatch(connection: Connection, limit = 32) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid_body_collection_batch_limit');
  const { driver, sqlite } = connection;
  const migrationId = readDataMigrationState(sqlite, BODY_COLLECTION_ID)?.status === 'completed'
    ? BODY_RECLAIM_ID : BODY_COLLECTION_ID;
  if (readDataMigrationState(sqlite, migrationId)?.status === 'completed') return { completed: true, paused: false };
  try {
    return sqlite.transaction(() => {
      const progress = readBodyMigrationProgress(driver, migrationId) ?? initialBodyMigrationProgress(migrationId,
        'blobs');
      progress.error = null;
      if (progress.phase !== 'blobs') {
        progress.phase = 'blobs';
        progress.cursor = '';
      }
      collectBlobBatch(connection, progress, limit);
      saveBodyMigrationProgress(connection, progress, progress.phase === 'done');
      if (progress.phase === 'done' && migrationId === BODY_COLLECTION_ID) {
        saveBodyMigrationProgress(connection, initialBodyMigrationProgress(BODY_RECLAIM_ID, 'done'), true);
      }
      return { completed: progress.phase === 'done', paused: false, ...progress };
    }).immediate();
  } catch (error) {
    const progress = readBodyMigrationProgress(driver, migrationId) ?? initialBodyMigrationProgress(migrationId,
        'blobs');
    progress.error = error instanceof Error ? error.message : String(error);
    sqlite.transaction(() => saveBodyMigrationProgress(connection, progress, false)).immediate();
    throw error;
  }
}
