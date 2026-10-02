import { readDataMigrationState } from '../../lib/core/database/dataMigrationState.js';
import { inspectNodeInlineRetirement, retireDuplicateNodeInlineContent } from '../../lib/core/database/nodeInlineRetirement.js';
import { collectTextBodyBlobCandidates } from '../../lib/core/database/textBodyBlobCollection.js';

import type { DatabaseConnection } from './connection.js';
import {
  BODY_COLLECTION_ID, BODY_RECLAIM_ID, initialBodyMigrationProgress, protectBodyMigration,
  readBodyMigrationProgress, saveBodyMigrationProgress, type BodyMigrationProgress
} from './legacyBodyMigrationState.js';

type Connection = Pick<DatabaseConnection, 'driver' | 'sqlite'>;
const TEMPORARY_REASONS = "reason IN ('node_dirty', 'editor_active')";

function retireInlineBatch(connection: Connection, progress: BodyMigrationProgress, limit: number) {
  const retry = progress.phase === 'retry';
  const { driver } = connection;
  const rows = driver.queryAll<{ id: string }>(retry
    ? `SELECT object_id AS id FROM legacy_body_migration_protections
       WHERE migration_id = ? AND ${TEMPORARY_REASONS} AND object_id > ? ORDER BY object_id LIMIT ?`
    : 'SELECT id FROM nodes WHERE id > ? AND body_blob_hash IS NOT NULL ORDER BY id LIMIT ?',
  retry ? [BODY_COLLECTION_ID, progress.cursor, limit] : [progress.cursor, limit]);
  const result = retireDuplicateNodeInlineContent(driver, rows.map((row) => row.id));
  progress.changed += result.changed;
  for (const { id } of rows) {
    driver.execute('DELETE FROM legacy_body_migration_protections WHERE migration_id = ? AND object_id = ?', [BODY_COLLECTION_ID, id]);
  }
  for (const id of result.protectedNodeIds) {
    const inspection = inspectNodeInlineRetirement(driver, id);
    if (inspection.status === 'protected') protectBodyMigration(driver, BODY_COLLECTION_ID, id, inspection.reason);
  }
  progress.cursor = rows.at(-1)?.id ?? '';
  if (rows.length >= limit) return false;
  progress.cursor = '';
  if (!retry) progress.phase = 'blobs';
  return retry;
}

function collectBlobBatch(connection: Connection, progress: BodyMigrationProgress, limit: number) {
  const rows = connection.driver.queryAll<{ hash: string }>(
    `SELECT hash FROM content_blobs WHERE kind = 'text_body' AND hash > ? ORDER BY hash LIMIT ?`, [progress.cursor, limit]);
  const result = collectTextBodyBlobCandidates(connection.driver, rows.map((row) => row.hash));
  progress.deleted_bytes += result.deletedBytes;
  progress.deleted_blobs += result.deletedHashes.length;
  progress.cursor = rows.at(-1)?.hash ?? '';
  if (rows.length >= limit) return false;
  progress.phase = 'retry';
  progress.cursor = '';
  return true;
}

/** One bounded production batch; temporary editor protections resume only on library open. */
export function runLegacyBodyCollectionBatch(connection: Connection, limit = 32) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid_body_collection_batch_limit');
  const { driver, sqlite } = connection;
  const migrationId = readDataMigrationState(sqlite, BODY_COLLECTION_ID)?.status === 'completed'
    ? BODY_RECLAIM_ID : BODY_COLLECTION_ID;
  if (readDataMigrationState(sqlite, migrationId)?.status === 'completed') return { completed: true, paused: false };
  try {
    return sqlite.transaction(() => {
      const progress = readBodyMigrationProgress(driver, migrationId) ?? initialBodyMigrationProgress(migrationId,
        migrationId === BODY_RECLAIM_ID ? 'blobs' : 'inline');
      progress.error = null;
      const atEnd = progress.phase === 'blobs'
        ? collectBlobBatch(connection, progress, limit) : retireInlineBatch(connection, progress, limit);
      const paused = atEnd && Boolean(driver.queryOne(
        `SELECT 1 FROM legacy_body_migration_protections WHERE migration_id = ? AND ${TEMPORARY_REASONS} LIMIT 1`, [BODY_COLLECTION_ID]));
      if (atEnd && !paused) progress.phase = 'done';
      saveBodyMigrationProgress(connection, progress, progress.phase === 'done');
      if (progress.phase === 'done' && migrationId === BODY_COLLECTION_ID) {
        saveBodyMigrationProgress(connection, initialBodyMigrationProgress(BODY_RECLAIM_ID, 'done'), true);
      }
      return { completed: progress.phase === 'done', paused, ...progress };
    }).immediate();
  } catch (error) {
    const progress = readBodyMigrationProgress(driver, migrationId) ?? initialBodyMigrationProgress(migrationId,
        migrationId === BODY_RECLAIM_ID ? 'blobs' : 'inline');
    progress.error = error instanceof Error ? error.message : String(error);
    sqlite.transaction(() => saveBodyMigrationProgress(connection, progress, false)).immediate();
    throw error;
  }
}
